
'use server';

/**
 * src/ai/flows/chatWithAgentFlow.ts
 *
 * Final production-ready AI chat flow for Wecanfix (collections variant B).
 * Collections used:
 *  - adminCategories
 *  - adminSubCategories
 *  - adminServices
 *  - contentPages
 *  - bookings
 *  - users
 *
 * Features:
 *  - Dynamic URLs using getBaseUrl()
 *  - Category / Subcategory / Service matching (priority order)
 *  - Custom service and human-support fallbacks
 *  - Booking status + cancellation policy handling
 *  - Deterministic short-circuiting before calling Gemini
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase';
import { getBaseUrl } from '@/lib/config';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import type {
  FirestoreUser,
  FirestoreBooking,
  FirestoreCategory,
  FirestoreSubCategory,
  FirestoreService,
  AppSettings,
  DayAvailability,
} from '@/types/firestore';

/* -------------------------
   Input / Output Schemas
   ------------------------- */
const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'model', 'system']),
  content: z.array(z.object({ text: z.string() })),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;

const ChatAgentInputSchema = z.object({
  history: z.array(ChatHistoryItemSchema),
  message: z.string(),
  userId: z.string().optional(),
});
export type ChatAgentInput = z.infer<typeof ChatAgentInputSchema>;

const ChatAgentOutputSchema = z.object({
  response: z.string(),
});
export type ChatAgentOutput = z.infer<typeof ChatAgentOutputSchema>;

export async function chatWithAgent(input: ChatAgentInput): Promise<ChatAgentOutput> {
  return chatAgentFlow(input);
}

/* -------------------------
   Helper Types & Utilities
   ------------------------- */
type FlatService = {
  id: string;
  name: string;
  slug: string;
  url: string;
  subCategoryId?: string;
};

function normalizeText(s: string): string {
  return (s || '').toString().trim().toLowerCase();
}

function tokenize(s: string): string[] {
  return normalizeText(s).split(/\W+/).filter(Boolean);
}

function isGreeting(message: string): boolean {
  const m = normalizeText(message);
  const greetings = [
    'hi', 'hello', 'hey', 'hlo', 'helo',
    'good morning', 'good afternoon', 'good evening', 'namaste'
  ];
  return greetings.includes(m);
}

function isTooShortForServiceMatch(message: string): boolean {
  return message.trim().split(/\s+/).length < 2;
}

function isServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(fix|repair|install|service|problem|issue|need|want|book|hire)\b/.test(m);
}

function isCustomServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(custom service|custom work|custom request|custom job)\b/.test(m);
}

function isUnrelatedIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(love|biryani|joke|owner|girlfriend|boyfriend|marry|song|recipe)\b/.test(m);
}

/* -------------------------
   Category / Subcategory / Service Matching
   ------------------------- */

/** Conservative fuzzy match for services */
function findBestService(userMessage: string, services: FlatService[]): FlatService | null {
  const msg = normalizeText(userMessage);
  const msgTokens = new Set(tokenize(msg));
  let best: { service: FlatService | null; score: number } = { service: null, score: 0 };

  for (const s of services) {
    const name = normalizeText(s.name);
    let score = 0;

    // phrase / substring
    if (name.includes(msg) || msg.includes(name)) score += 100;

    // token overlap
    const serviceTokens = tokenize(name);
    let overlap = 0;
    for (const t of serviceTokens) {
      if (msgTokens.has(t)) overlap++;
    }
    const overlapRatio = serviceTokens.length ? overlap / serviceTokens.length : 0;
    score += Math.round(overlapRatio * 50);

    if (score > best.score) best = { service: s, score };
  }

  return best.score >= 40 ? best.service : null;
}

function findSubCategoryIntent(message: string, subcategories: FirestoreSubCategory[]): FirestoreSubCategory | null {
  const m = normalizeText(message);
  for (const sc of subcategories) {
    const name = normalizeText(sc.name || '');
    if (!name) continue;
    if (m.includes(name) || name.includes(m)) return sc;
  }
  return null;
}

function findCategoryIntent(message: string, categories: FirestoreCategory[]): FirestoreCategory | null {
  const m = normalizeText(message);
  for (const c of categories) {
    const name = normalizeText(c.name || '');
    if (!name) continue;
    if (m.includes(name) || name.includes(m)) return c;
  }
  return null;
}

/* -------------------------
   Firestore Fetchers (collections B)
   ------------------------- */
async function getFullData(): Promise<{
  categories: FirestoreCategory[];
  subCategories: FirestoreSubCategory[];
  flatServiceList: FlatService[];
}> {
  const baseUrl = getBaseUrl().replace(/\/$/, '');

  const categoriesSnap = await getDocs(collection(db, 'adminCategories'));
  const subCatsSnap = await getDocs(collection(db, 'adminSubCategories'));
  const servicesSnap = await getDocs(collection(db, 'adminServices'));

  const categoriesArr: FirestoreCategory[] = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCategory));
  const subCatsArr: FirestoreSubCategory[] = subCatsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreSubCategory));
  const servicesArr: FirestoreService[] = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreService));

  const flatServiceList: FlatService[] = servicesArr.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    url: `${baseUrl}/service/${s.slug}`,
    subCategoryId: s.subCategoryId,
  }));

  return { categories: categoriesArr, subCategories: subCatsArr, flatServiceList };
}

async function getCancellationPolicyText(): Promise<string> {
  const qSnap = await getDocs(query(collection(db, 'contentPages'), where('slug', '==', 'cancellation-policy')));
  if (qSnap.empty) return '';
  const data = qSnap.docs[0].data();
  return (data.content as string) || '';
}

async function getUserAndBookings(userId?: string): Promise<{ name: string; bookings: FirestoreBooking[] }> {
  if (!userId) return { name: 'Valued Customer', bookings: [] };
  let name = 'Valued Customer';
  const bookings: FirestoreBooking[] = [];

  const userSnap = await getDoc(doc(db, 'users', userId));
  if (userSnap.exists()) {
    const u = userSnap.data() as Partial<FirestoreUser>;
    name = (u.displayName || (u as any).fullName || 'Valued Customer') as string;
  }

  const bookingSnap = await getDocs(query(collection(db, 'bookings'), where('userId', '==', userId)));
  bookingSnap.forEach((bDoc) => {
    const data = bDoc.data() as FirestoreBooking;
    bookings.push(data);
  });

  return { name, bookings };
}

async function getAppConfig(): Promise<AppSettings | null> {
    const docRef = doc(db, 'webSettings', 'applicationConfig');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as AppSettings : null;
}

/* -------------------------
   System Prompt Builder (Gemini fallback)
   ------------------------- */
function buildSystemPrompt(params: {
  name: string;
  bookings: FirestoreBooking[];
  flatServices: FlatService[];
  cancellationPolicy: string;
}) {
  const { name, bookings, flatServices, cancellationPolicy } = params;

  const servicesListText = flatServices.length
    ? flatServices.map((s) => `${s.name} -> ${s.url}`).join('\n')
    : 'No services available.';

  return `
You are Wecanfix AI Assistant.

User Name: ${name}

Available Services (name -> url):
${servicesListText}

Cancellation Policy (source):
${cancellationPolicy ? cancellationPolicy.slice(0, 700) : 'No cancellation policy available.'}

User Bookings:
${bookings.length ? JSON.stringify(bookings, null, 2) : 'No bookings found.'}

Rules:
1. If the user asks for a specific service, return the exact booking URL from Available Services.
2. If no matching service but a subcategory/category matches, list the available services in that category and ask what they need.
3. If no match at all, provide the custom-service link. Make sure all links are full clickable URLs.
4. If unrelated, offer to connect to human support.
5. Do not invent services or booking details.
Keep replies concise.
`;
}

/* -------------------------
   Main Genkit Flow
   ------------------------- */
const chatAgentFlow = ai.defineFlow(
  {
    name: 'chatAgentFlow',
    inputSchema: ChatAgentInputSchema,
    outputSchema: ChatAgentOutputSchema,
  },
  async (input) => {
    const { history, message, userId } = input;

    // Load data
    const [userData, data, cancellationPolicy, appConfig] = await Promise.all([
      getUserAndBookings(userId),
      getFullData(),
      getCancellationPolicyText(),
      getAppConfig(),
    ]);

    const { name, bookings } = userData;
    const { categories, subCategories, flatServiceList } = data;
    const baseUrl = getBaseUrl().replace(/\/$/, '');

    // 1) Greeting
    if (isGreeting(message)) {
      return { response: `Hi ${name}! How can I help you today?` };
    }

    // 2) Custom service direct intent
    if (isCustomServiceIntent(message)) {
      return {
        response: `Sure ${name}, you can submit your custom service request here:\n${baseUrl}/custom-service`
      };
    }

    // 3) Booking status intent (deterministic)
    if (/\b(booking|my booking|booking status|status of my booking|where is my booking|check my booking|order status)\b/i.test(message)) {
      if (!bookings.length) {
        return { response: `Hi ${name}, I do not see any bookings under your account. Would you like to book a service?` };
      }
      const bookingSummaries = bookings.slice(0, 6).map((b) => {
        const id = (b.bookingId || 'N/A');
        const status = (b.status || 'Unknown');
        const when = (b.scheduledDate || 'Not scheduled') + (b.scheduledTimeSlot ? ` ${b.scheduledTimeSlot}` : '');
        return `Booking ${id} — ${status} — ${when}`;
      }).join('\n');
      return { response: `Hi ${name}, here are your recent bookings:\n${bookingSummaries}\nIf you want details for a specific booking ID, please tell me the booking ID.` };
    }

    // 4) Cancellation policy
    if (/\b(cancellation|cancel policy|refund|refund policy|cancel my booking|charge|fee|timing)\b/i.test(message)) {
        if (!appConfig?.enableCancellationPolicy) {
            return { response: `Hi ${name}, we currently do not have a set cancellation policy. I can connect you to our human support team if you have questions.` };
        }

        const feeValue = appConfig.cancellationFeeValue || 0;
        const feeType = appConfig.cancellationFeeType;
        const feeText = feeType === 'percentage' ? `${feeValue}% of the booking total` : `₹${feeValue}`;

        const days = appConfig.freeCancellationDays || 0;
        const hours = appConfig.freeCancellationHours || 0;
        const minutes = appConfig.freeCancellationMinutes || 0;
        let windowText = "";
        if (days > 0) windowText += `${days} day(s) `;
        if (hours > 0) windowText += `${hours} hour(s) `;
        if (minutes > 0) windowText += `${minutes} minute(s) `;

        if (windowText.trim() === '') {
             windowText = "any time";
        } else {
             windowText += "before the scheduled service time";
        }
        
        let responseText = `Hi ${name}! Here are the details of our cancellation policy:\n\n`;
        responseText += `- You can cancel for free if you do it at least ${windowText.trim()}.\n`;
        if (feeValue > 0) {
            responseText += `- If you cancel after this window, a cancellation fee of ${feeText} will be applied.\n`;
        } else {
            responseText += `- There is currently no fee for late cancellations, but we appreciate you letting us know as early as possible.\n`;
        }
        responseText += `\nYou can view the full policy here:\n${baseUrl}/cancellation-policy`;

        return { response: responseText };
    }

    // 5) Working hours intent
    if (/\b(working hours|opening|closing|timings|open|close|available)\b/i.test(message)) {
        if (!appConfig?.timeSlotSettings?.weeklyAvailability) {
            return { response: `Sorry, I couldn't retrieve our working hours right now. I can connect you to our human support team.` };
        }
        const { weeklyAvailability } = appConfig.timeSlotSettings;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        let hoursText = `Hi ${name}! Here are our working hours:\n\n`;
        days.forEach(day => {
            const dayConfig = weeklyAvailability[day as keyof typeof weeklyAvailability] as DayAvailability;
            const dayName = day.charAt(0).toUpperCase() + day.slice(1);
            if (dayConfig.isEnabled) {
                hoursText += `- ${dayName}: ${dayConfig.startTime} to ${dayConfig.endTime}\n`;
            } else {
                hoursText += `- ${dayName}: Closed\n`;
            }
        });
        hoursText += "\nYou can book a service anytime on our website!";
        return { response: hoursText };
    }


    // 6) SERVICE MATCH (priority): Service -> Subcategory -> Category
    if (!isTooShortForServiceMatch(message) && isServiceIntent(message) && !isUnrelatedIntent(message)) {
      const matchedService = findBestService(message, flatServiceList);
      if (matchedService) {
        return {
          response: `Sure ${name}! Here is the booking link for ${matchedService.name}:\n${matchedService.url}\n\nIf you want, I can connect you to our human support team for help with booking.`
        };
      }

      const matchedSub = findSubCategoryIntent(message, subCategories);
      if (matchedSub) {
        const servicesInSubCat = flatServiceList.filter(s => s.subCategoryId === matchedSub.id);
        if (servicesInSubCat.length > 0) {
          const serviceList = servicesInSubCat.map(s => `- ${s.name}`).join('\n');
          return { response: `Sure ${name}! Under ${matchedSub.name}, we offer:\n${serviceList}\n\nWhich service are you looking for? If none of these match, you can request a custom service.` };
        }
      }

      const matchedCat = findCategoryIntent(message, categories);
      if (matchedCat) {
        const subCatIdsInCategory = subCategories.filter(sc => sc.parentId === matchedCat.id).map(sc => sc.id);
        const servicesInCat = flatServiceList.filter(s => subCatIdsInCategory.includes(s.subCategoryId || ''));
        if (servicesInCat.length > 0) {
          const serviceList = servicesInCat.map(s => `- ${s.name}`).join('\n');
          return { response: `Of course, ${name}! In our ${matchedCat.name} category, we have the following services:\n${serviceList}\n\nWhich one would you like to book? Or, I can connect you to our human support team.` };
        }
      }

      return {
        response: `It looks like we don't have a direct match for that service, ${name}. You can request a custom service here:\n${baseUrl}/custom-service\nOr, I can connect you to our human support team.`
      };
    }

    // 7) Unrelated questions -> human support
    if (isUnrelatedIntent(message)) {
      return { response: `I can connect you to our human support team for this question, ${name}.` };
    }

    // 8) Fallback -> call Gemini with context
    const systemPrompt = buildSystemPrompt({
      name,
      bookings,
      flatServices: flatServiceList,
      cancellationPolicy,
    });

    const MAX_HISTORY = 14;
    const trimmed = history.slice(-MAX_HISTORY);
    let finalPrompt = systemPrompt + '\n\n';
    trimmed.forEach((item) => {
      const role = item.role === 'user' ? 'USER' : 'MODEL';
      const text = item.content.map((c) => c.text).join(' ');
      finalPrompt += `${role}: ${text}\n`;
    });
    finalPrompt += `USER: ${message}\nMODEL:`;

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: finalPrompt,
      config: { temperature: 0.32 },
    });

    return { response: response.text };
  }
);

export { chatAgentFlow };
