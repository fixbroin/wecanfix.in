
import { type NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/lib/firebase-admin';
import { sendMarketingEmail } from '@/ai/flows/sendMarketingEmailFlow';
import type { MarketingAutomationSettings, AppSettings, FirestoreUser, FirestoreService, UserCart } from '@/types/firestore';
import { getBaseUrl } from '@/lib/config';

// Helper to convert delay settings to milliseconds
const toMs = (delay?: MarketingAutomationSettings['noBookingReminderDelay']): number => {
    if (!delay) return 0;
    const { days = 0, hours = 0, minutes = 0 } = delay;
    return (days * 86400000) + (hours * 3600000) + (minutes * 60000);
};

// Helper function to replace all merge tags
const replaceMergeTags = (
    template: string,
    user: FirestoreUser,
    appConfig: AppSettings,
    popularServicesHtml: string,
    cartContentHtml: string
): string => {
    const cartLink = `${getBaseUrl()}/cart`;
    let body = template;
    body = body.replace(/\{\{name\}\}/g, user.displayName || 'Valued Customer');
    body = body.replace(/\{\{email\}\}/g, user.email || '');
    body = body.replace(/\{\{mobile\}\}/g, user.mobileNumber || '');
    body = body.replace(/\{\{signupDate\}\}/g, user.createdAt?.toDate().toLocaleDateString('en-IN') || '');
    body = body.replace(/\{\{websiteName\}\}/g, appConfig.websiteName || 'Wecanfix');
    body = body.replace(/\{\{websiteUrl\}\}/g, getBaseUrl());
    body = body.replace(/\{\{supportEmail\}\}/g, appConfig.senderEmail || 'support@wecanfix.in'); // Use senderEmail as support
    body = body.replace(/\{\{companyAddress\}\}/g, appConfig.address || 'Company Address'); // Get address from appConfig
    
    // New replacements
    body = body.replace(/\{\{popular_services\}\}/g, popularServicesHtml);
    body = body.replace(/\{\{cart_items\}\}/g, cartContentHtml);
    // Replace {{cart_item_name}} with the first item's name for simplicity if the tag exists
    const firstCartItemName = cartContentHtml.match(/<li>(.*?)<\/li>/)?.[1]?.replace(/ \(x\d+\)/, '') || 'Your items';
    body = body.replace(/\{\{cart_item_name\}\}/g, firstCartItemName);
    body = body.replace(/\{\{cart_link\}\}/g, cartLink);

    return body;
};

export async function GET(req: NextRequest) {
    const secret = new URL(req.url).searchParams.get('secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();
        const now = Date.now();
        console.log("Marketing cron job started at:", new Date(now).toISOString());

        // --- 1. Fetch all configurations and common data once ---
        const marketingConfigDoc = await db.collection('webSettings').doc('marketingAutomation').get();
        const appConfigDoc = await db.collection('webSettings').doc('applicationConfig').get();
        
        if (!marketingConfigDoc.exists || !appConfigDoc.exists) {
            console.log("Settings documents not found. Aborting cron job.");
            return NextResponse.json({ status: 'Settings not found' }, { status: 500 });
        }
        
        const marketingConfig = marketingConfigDoc.data() as MarketingAutomationSettings;
        const appConfig = appConfigDoc.data() as AppSettings;

        const popularServicesQuery = db.collection('adminServices').where('isActive', '==', true).orderBy('rating', 'desc').orderBy('reviewCount', 'desc').limit(5);
        const popularServicesSnapshot = await popularServicesQuery.get();
        const popularServices = popularServicesSnapshot.docs.map(doc => doc.data() as FirestoreService);
        const baseUrl = getBaseUrl();
        const popularServicesHtml = `<ul>${popularServices.map(s => `<li><a href="${baseUrl}/service/${s.slug}">${s.name}</a></li>`).join('')}</ul>`;
        const allServicesSnapshot = await db.collection('adminServices').get();
        const servicesMap = new Map(allServicesSnapshot.docs.map(doc => [doc.id, doc.data() as FirestoreService]));

        let emailsSent = 0;
        const allUsersSnapshot = await db.collection('users').get();
        
        // --- 2. Iterate through all users and check conditions for each automation ---
        for (const userDoc of allUsersSnapshot.docs) {
            const user = { ...userDoc.data(), id: userDoc.id } as FirestoreUser; // Add id to user object
            if (!user.email) continue; // Skip users without email
            
            const userDocRef = userDoc.ref as DocumentReference;

            // A) No Booking Reminder
            if (marketingConfig.noBookingReminderEnabled && marketingConfig.noBookingReminderDelay) {
                const noBookingDelayMs = toMs(marketingConfig.noBookingReminderDelay);
                // FIX: Add check for createdAt existence
                if (user.createdAt && user.createdAt.toMillis) {
                    const signupMs = user.createdAt.toMillis();
                    const hasBooking = user.hasBooking || false;
                    const reminderSent = user.marketingStatus?.bookingReminderSent || false;

                    if (noBookingDelayMs > 0 && !hasBooking && !reminderSent && (now - signupMs) > noBookingDelayMs) {
                        const body = replaceMergeTags(marketingConfig.noBookingReminderTemplate || "", user, appConfig, popularServicesHtml, "");
                        await sendMarketingEmail({
                            toEmail: user.email, subject: "A Reminder from " + (appConfig.websiteName || "Wecanfix"), htmlBody: body.replace(/\n/g, '<br>'),
                            smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail
                        });
                        await userDocRef.update({ 'marketingStatus.bookingReminderSent': true });
                        emailsSent++;
                    }
                }
            }

            // B) Abandoned Cart Reminder
            if (marketingConfig.abandonedCartEnabled && marketingConfig.abandonedCartDelay) {
                const abandonedCartDelayMs = toMs(marketingConfig.abandonedCartDelay);
                if (user.id) { // Ensure user ID exists before querying
                    const cartDoc = await db.collection('userCarts').doc(user.id).get();
                    if (cartDoc.exists) {
                        const cart = cartDoc.data() as UserCart;
                        // FIX: Add check for updatedAt existence
                        if (cart.updatedAt && cart.updatedAt.toMillis) {
                            const cartUpdatedAtMs = cart.updatedAt.toMillis();
                            const reminderSent = user.marketingStatus?.cartReminderSent || false;

                            if (abandonedCartDelayMs > 0 && !reminderSent && (now - cartUpdatedAtMs) > abandonedCartDelayMs) {
                                const cartContentHtml = `<ul>${cart.items.map(i => `<li>${servicesMap.get(i.serviceId)?.name || 'Item'} (x${i.quantity})</li>`).join('')}</ul>`;
                                const body = replaceMergeTags(marketingConfig.abandonedCartTemplate || "", user, appConfig, popularServicesHtml, cartContentHtml);
                                await sendMarketingEmail({
                                    toEmail: user.email, subject: "You left something in your cart!", htmlBody: body.replace(/\n/g, '<br>'),
                                    smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail
                                });
                                await userDocRef.update({ 'marketingStatus.cartReminderSent': true });
                                emailsSent++;
                            }
                        }
                    }
                }
            }

            // C) Recurring Engagement Email
            if (marketingConfig.recurringEngagementEnabled && marketingConfig.recurringEngagementDelay) {
                const repeatMs = toMs(marketingConfig.recurringEngagementDelay);
                const lastSentMs = user.marketingStatus?.lastRecurringSent?.toMillis() || 0;
                
                // FIX: Add check for createdAt existence
                if (user.createdAt && user.createdAt.toMillis) {
                    const signupMs = user.createdAt.toMillis();
                    const eligibleForFirstSend = (now - signupMs) > repeatMs;

                    if (repeatMs > 0 && eligibleForFirstSend && (now - lastSentMs) > repeatMs) {
                        const body = replaceMergeTags(marketingConfig.recurringEngagementTemplate || "", user, appConfig, popularServicesHtml, "");
                        await sendMarketingEmail({
                            toEmail: user.email, subject: "A message from " + (appConfig.websiteName || "Wecanfix"), htmlBody: body.replace(/\n/g, '<br>'),
                            smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail
                        });
                        await userDocRef.update({ 'marketingStatus.lastRecurringSent': Timestamp.fromMillis(now) });
                        emailsSent++;
                    }
                }
            }
        }
        
        console.log(`Marketing cron job finished. Sent ${emailsSent} emails.`);
        return NextResponse.json({ status: 'ok', sent: emailsSent });

    } catch (error) {
        console.error("Error in marketing cron job:", error);
        return NextResponse.json({ status: 'error', error: (error as Error).message }, { status: 500 });
    }
}
