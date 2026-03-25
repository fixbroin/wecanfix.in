'use server';

/**
 * src/ai/flows/chatWithAgentFlow.ts
 *
 * Enhanced production-ready AI chat flow for Wecanfix.
 * Now location-aware, website-knowledgeable, and respects admin takeover.
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
  limit,
  orderBy,
} from 'firebase/firestore';
import type {
  FirestoreUser,
  FirestoreBooking,
  FirestoreCategory,
  FirestoreSubCategory,
  FirestoreService,
  AppSettings,
  DayAvailability,
  FirestoreCity,
  FirestoreArea,
  ContentPage,
  FirestoreFAQ,
  ChatSession,
} from '@/types/firestore';
import { sendHumanSupportRequestEmail } from './sendHumanSupportRequestEmailFlow';

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
  isSilent: z.boolean().optional(),
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

type LocationData = {
    cities: { name: string; slug: string; url: string }[];
    areas: { name: string; slug: string; cityName: string; url: string }[];
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
  return /\b(fix|repair|install|service|problem|issue|need|want|book|hire|clean|pest|electrician|plumber|carpenter|painter|ac|appliance)\b/.test(m);
}

function isCustomServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(custom service|custom work|custom request|custom job|special request)\b/.test(m);
}

function isLocationIntent(message: string): boolean {
    const m = normalizeText(message);
    return /\b(city|area|location|where|place|work in|available in|operate in|dubai|sharjah|ajman|abu dhabi)\b/.test(m);
}

function isHumanSupportIntent(message: string): boolean {
    const m = normalizeText(message);
    return /\b(human|person|agent|support|talk to someone|representative|manual|help me|frustrated|call me)\b/.test(m);
}

/* -------------------------
   Matching Logic
   ------------------------- */
function findBestService(userMessage: string, services: FlatService[]): FlatService | null {
  const msg = normalizeText(userMessage);
  const msgTokens = new Set(tokenize(msg));
  let best: { service: FlatService | null; score: number } = { service: null, score: 0 };

  for (const s of services) {
    const name = normalizeText(s.name);
    let score = 0;
    if (name === msg) score += 200;
    if (name.includes(msg) || msg.includes(name)) score += 100;

    const serviceTokens = tokenize(name);
    let overlap = 0;
    for (const t of serviceTokens) {
      if (msgTokens.has(t)) overlap++;
    }
    const overlapRatio = serviceTokens.length ? overlap / serviceTokens.length : 0;
    score += Math.round(overlapRatio * 60);

    if (score > best.score) best = { service: s, score };
  }
  return best.score >= 45 ? best.service : null;
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
   Firestore Fetchers
   ------------------------- */
async function getLocations(): Promise<LocationData> {
    const baseUrl = getBaseUrl().replace(/\/$/, '');
    const citiesSnap = await getDocs(query(collection(db, 'cities'), where('isActive', '==', true)));
    const areasSnap = await getDocs(query(collection(db, 'areas'), where('isActive', '==', true)));

    const cities = citiesSnap.docs.map(d => {
        const data = d.data() as FirestoreCity;
        return { name: data.name, slug: data.slug, url: `${baseUrl}/${data.slug}` };
    });

    const areas = areasSnap.docs.map(d => {
        const data = d.data() as FirestoreArea;
        return { name: data.name, slug: data.slug, cityName: data.cityName, url: `${baseUrl}/${data.cityName}/${data.slug}` };
    });

    return { cities, areas };
}

async function getFullData(): Promise<{
  categories: FirestoreCategory[];
  subCategories: FirestoreSubCategory[];
  flatServiceList: FlatService[];
}> {
  const baseUrl = getBaseUrl().replace(/\/$/, '');

  const [cats, subs, servs] = await Promise.all([
    getDocs(query(collection(db, 'adminCategories'), where('isActive', '!=', false))),
    getDocs(query(collection(db, 'adminSubCategories'), where('isActive', '!=', false))),
    getDocs(query(collection(db, 'adminServices'), where('isActive', '==', true)))
  ]);

  const categoriesArr = cats.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreCategory));
  const subCatsArr = subs.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreSubCategory));
  const servicesArr = servs.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreService));

  const flatServiceList: FlatService[] = servicesArr.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    url: `${baseUrl}/service/${s.slug}`,
    subCategoryId: s.subCategoryId,
  }));

  return { categories: categoriesArr, subCategories: subCatsArr, flatServiceList };
}

async function getWebsiteContent(): Promise<string> {
    const pages = ['about-us', 'contact-us', 'careers', 'terms-and-conditions', 'privacy-policy'];
    const contentParts: string[] = [];
    
    for (const slug of pages) {
        const q = query(collection(db, 'contentPages'), where('slug', '==', slug), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data() as ContentPage;
            contentParts.push(`${data.title}: ${data.content.substring(0, 500)}...`);
        }
    }

    const faqSnap = await getDocs(query(collection(db, 'adminFAQs'), where('isActive', '==', true), limit(5)));
    if (!faqSnap.empty) {
        contentParts.push("\nCommon FAQs:\n" + faqSnap.docs.map(d => {
            const f = d.data() as FirestoreFAQ;
            return `Q: ${f.question}\nA: ${f.answer}`;
        }).join('\n'));
    }

    return contentParts.join('\n\n');
}

async function getUserAndBookings(userId?: string): Promise<{ name: string; email: string; bookings: FirestoreBooking[]; adminId: string | null }> {
  if (!userId) return { name: 'Valued Customer', email: '', bookings: [], adminId: null };
  let name = 'Valued Customer';
  let email = '';
  let adminId: string | null = null;
  const bookings: FirestoreBooking[] = [];

  const userSnap = await getDoc(doc(db, 'users', userId));
  if (userSnap.exists()) {
    const u = userSnap.data() as Partial<FirestoreUser>;
    name = (u.displayName || (u as any).fullName || 'Valued Customer') as string;
    email = u.email || '';
  }

  const bookingSnap = await getDocs(query(collection(db, 'bookings'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(5)));
  bookingSnap.forEach((bDoc) => {
    bookings.push({ id: bDoc.id, ...bDoc.data() } as FirestoreBooking);
  });
  
  // Find the primary admin UID for chat session lookup
  const adminQuery = query(collection(db, "users"), where("email", "==", "wecanfix.in@gmail.com"), limit(1));
  const adminSnapshot = await getDocs(adminQuery);
  if (!adminSnapshot.empty) {
    adminId = adminSnapshot.docs[0].id;
  }

  return { name, email, bookings, adminId };
}

async function getAppConfig(): Promise<AppSettings | null> {
    const docRef = doc(db, 'webSettings', 'applicationConfig');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as AppSettings : null;
}

/* -------------------------
   System Prompt Builder
   ------------------------- */
function buildSystemPrompt(params: {
  name: string;
  bookings: FirestoreBooking[];
  flatServices: FlatService[];
  locations: LocationData;
  websiteContent: string;
  baseUrl: string;
}) {
  const { name, bookings, flatServices, locations, websiteContent, baseUrl } = params;

  const servicesText = flatServices.map(s => `${s.name}: ${s.url}`).join('\n');
  const citiesText = locations.cities.map(c => `${c.name}: ${c.url}`).join(', ');
  const areasText = locations.areas.map(a => `${a.name} (${a.cityName}): ${a.url}`).join('\n');

  return `
You are the official Wecanfix AI Support Specialist. Your goal is to provide accurate, helpful, and concise information about Wecanfix's services, locations, and policies.

Current User: ${name}

WEBSITE KNOWLEDGE BASE:
${websiteContent}

OPERATING LOCATIONS:
We operate in the following cities: ${citiesText}
Specific areas covered:
${areasText.slice(0, 1000)}

AVAILABLE SERVICES:
${servicesText.slice(0, 2000)}

USER'S RECENT BOOKINGS:
${bookings.length ? JSON.stringify(bookings, null, 2) : 'No bookings found.'}

GUIDELINES:
1. Always prioritize providing direct booking URLs for services.
2. If asked about locations, confirm availability in the cities/areas listed above. If not listed, apologize and offer human support.
3. For company info (About, Careers, etc.), use the summaries provided.
4. Keep responses professional, friendly, and under 3-4 sentences unless listing services.
5. Use full Markdown for links: [Service Name](${baseUrl}/service/slug).
6. CRITICAL: If a user is frustrated, asks for a human, or you cannot solve their problem, say "I am connecting you to our human support team right now. They will be with you shortly." and nothing else.
7. REFERRALS: If enabled, users can find their referral code in their profile to earn rewards.
`;
}

/* -------------------------
   Main Flow
   ------------------------- */
const chatAgentFlow = ai.defineFlow(
  {
    name: 'chatAgentFlow',
    inputSchema: ChatAgentInputSchema,
    outputSchema: ChatAgentOutputSchema,
  },
  async (input) => {
    const { history, message, userId } = input;
    const baseUrl = getBaseUrl().replace(/\/$/, '');

    // Load rich context
    const [userData, data, locations, websiteContent, appConfig] = await Promise.all([
      getUserAndBookings(userId),
      getFullData(),
      getLocations(),
      getWebsiteContent(),
      getAppConfig(),
    ]);

    const { name, email, bookings, adminId } = userData;
    const { categories, subCategories, flatServiceList } = data;

    // Check if AI Agent should be silent (Admin takeover)
    if (userId && adminId) {
        const sessionId = [userId, adminId].sort().join('_');
        const sessionSnap = await getDoc(doc(db, 'chats', sessionId));
        if (sessionSnap.exists()) {
            const sessionData = sessionSnap.data() as ChatSession;
            if (sessionData.aiAgentActive === false) {
                console.log(`AI Agent is silent for session ${sessionId} due to admin takeover.`);
                return { response: "", isSilent: true };
            }
        }
    }

    // Helper to send support email
    const triggerSupportEmail = async (msg: string) => {
        if (!userId) return;
        await sendHumanSupportRequestEmail({
            userId,
            userName: name,
            userEmail: email,
            lastMessage: msg,
            chatUrl: `${baseUrl}/admin/chat`, 
            smtpHost: appConfig?.smtpHost,
            smtpPort: appConfig?.smtpPort,
            smtpUser: appConfig?.smtpUser,
            smtpPass: appConfig?.smtpPass,
            senderEmail: appConfig?.senderEmail,
            siteName: "Wecanfix Support Alert",
        });
    };

    // 1) Greeting
    if (isGreeting(message)) {
      return { response: `Hi ${name}! I'm your Wecanfix assistant. How can I help you with our services or your bookings today?` };
    }

    // 2) Human Support Explicit Intent
    if (isHumanSupportIntent(message)) {
        await triggerSupportEmail(message);
        return { response: `I understand, ${name}. I am connecting you to our human support team right now. They have been notified and will be with you shortly.` };
    }

    // 3) Booking Status
    if (/\b(booking|my booking|status|order|where is my)\b/i.test(message) && bookings.length > 0) {
      const latest = bookings[0];
      return { response: `Hi ${name}, your most recent booking (${latest.bookingId}) is currently ${latest.status}. It's scheduled for ${latest.scheduledDate} at ${latest.scheduledTimeSlot}. Would you like to check others?` };
    }

    // 4) Location Check
    if (isLocationIntent(message)) {
        const msg = normalizeText(message);
        const matchedCity = locations.cities.find(c => msg.includes(normalizeText(c.name)));
        const matchedArea = locations.areas.find(a => msg.includes(normalizeText(a.name)));

        if (matchedArea) {
            return { response: `Yes ${name}, we provide full coverage in ${matchedArea.name} (${matchedArea.cityName}). You can view area-specific services here: ${matchedArea.url}` };
        }
        if (matchedCity) {
            return { response: `Absolutely! We are fully operational in ${matchedCity.name}. Check out our services in your city: ${matchedCity.url}` };
        }
        if (msg.includes('where') || msg.includes('city') || msg.includes('area')) {
            const cityNames = locations.cities.map(c => c.name).join(', ');
            return { response: `Wecanfix currently operates in ${cityNames}. We cover many areas including ${locations.areas.slice(0, 5).map(a => a.name).join(', ')}, and more!` };
        }
    }

    // 5) Custom Service
    if (isCustomServiceIntent(message)) {
      return { response: `Looking for something unique, ${name}? You can submit a custom service request here, and our team will get back to you with a quote:\n${baseUrl}/custom-service` };
    }

    // 6) Service Matching (Deterministic)
    if (isServiceIntent(message) && !isTooShortForServiceMatch(message)) {
      const best = findBestService(message, flatServiceList);
      if (best) {
        return { response: `I found the perfect match for you! You can book our ${best.name} service directly here: ${best.url}` };
      }

      const sub = findSubCategoryIntent(message, subCategories);
      if (sub) {
        const linkedServices = flatServiceList.filter(s => s.subCategoryId === sub.id).slice(0, 5);
        const list = linkedServices.map(s => `- [${s.name}](${s.url})`).join('\n');
        return { response: `We have several options for ${sub.name}:\n${list}\n\nWhich one fits your needs best?` };
      }
    }

    // 7) LLM Fallback (Genkit/Gemini)
    const systemPrompt = buildSystemPrompt({
      name,
      bookings,
      flatServices: flatServiceList,
      locations,
      websiteContent,
      baseUrl
    });

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      system: systemPrompt,
      prompt: message,
      config: { temperature: 0.4 },
    });

    // Check if Gemini triggered the human support phrase
    if (response.text.includes("human support team")) {
        await triggerSupportEmail(message);
    }

    return { response: response.text };
  }
);

export { chatAgentFlow };
