
import { type NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/lib/firebase-admin';
import { sendMarketingEmail } from '@/ai/flows/sendMarketingEmailFlow';
import type { MarketingAutomationSettings, AppSettings, GlobalWebSettings, FirestoreUser, FirestoreService, UserCart, FirestoreCategory, FirestoreSubCategory } from '@/types/firestore';
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
    globalSettings: GlobalWebSettings,
    dynamicContent: {
        popularServicesHtml: string;
        cartContentHtml: string;
        popularCategoriesHtml: string;
        allServicesHtml: string;
        allCategoriesHtml: string;
        categoryServicesHtml: string;
    }
): string => {
    const cartLink = `${getBaseUrl()}/cart`;
    let body = template;
    body = body.replace(/\{\{name\}\}/g, user.displayName || 'Valued Customer');
    body = body.replace(/\{\{email\}\}/g, user.email || '');
    body = body.replace(/\{\{mobile\}\}/g, user.mobileNumber || '');
    body = body.replace(/\{\{signupDate\}\}/g, user.createdAt?.toDate().toLocaleDateString('en-IN') || '');
    
    // Correctly sourced settings
    body = body.replace(/\{\{websiteName\}\}/g, globalSettings.websiteName || 'Wecanfix');
    body = body.replace(/\{\{websiteUrl\}\}/g, getBaseUrl());
    body = body.replace(/\{\{supportEmail\}\}/g, globalSettings.contactEmail || 'support@wecanfix.in');
    body = body.replace(/\{\{companyAddress\}\}/g, globalSettings.address || 'Company Address');
    
    // Dynamic content
    body = body.replace(/\{\{popular_services\}\}/g, dynamicContent.popularServicesHtml);
    body = body.replace(/\{\{popular_categories\}\}/g, dynamicContent.popularCategoriesHtml);
    body = body.replace(/\{\{all_services\}\}/g, dynamicContent.allServicesHtml);
    body = body.replace(/\{\{all_categories\}\}/g, dynamicContent.allCategoriesHtml);
    body = body.replace(/\{\{cart_items\}\}/g, dynamicContent.cartContentHtml);
    const firstCartItemName = dynamicContent.cartContentHtml.match(/<li>(.*?)<\/li>/)?.[1]?.replace(/ \(x\d+\)/, '') || 'Your items';
    body = body.replace(/\{\{cart_item_name\}\}/g, firstCartItemName);
    body = body.replace(/\{\{cart_link\}\}/g, cartLink);
    body = body.replace(/\{\{category_services\}\}/g, dynamicContent.categoryServicesHtml);

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
        const [marketingConfigDoc, appConfigDoc, globalSettingsDoc, allServicesSnap, allCategoriesSnap, allSubCategoriesSnap] = await Promise.all([
             db.collection('webSettings').doc('marketingAutomation').get(),
             db.collection('webSettings').doc('applicationConfig').get(),
             db.collection('webSettings').doc('global').get(),
             db.collection("adminServices").where("isActive", "==", true).orderBy("name", "asc").get(),
             db.collection("adminCategories").orderBy("order", "asc").get(),
             db.collection("adminSubCategories").get(),
        ]);
        
        if (!marketingConfigDoc.exists || !appConfigDoc.exists || !globalSettingsDoc.exists) {
            console.log("Settings documents not found. Aborting cron job.");
            return NextResponse.json({ status: 'Settings not found' }, { status: 500 });
        }
        
        const marketingConfig = marketingConfigDoc.data() as MarketingAutomationSettings;
        const appConfig = appConfigDoc.data() as AppSettings;
        const globalSettings = globalSettingsDoc.data() as GlobalWebSettings;

        const baseUrl = getBaseUrl();
        
        const allServicesMap = new Map(allServicesSnap.docs.map(doc => [doc.id, doc.data() as FirestoreService]));
        const allSubCategoriesMap = new Map(allSubCategoriesSnap.docs.map(doc => [doc.id, doc.data() as FirestoreSubCategory]));

        // Popular Content
        const popularServicesQuery = db.collection('adminServices').where('isActive', '==', true).orderBy('rating', 'desc').orderBy('reviewCount', 'desc').limit(5);
        const popularServicesSnapshot = await popularServicesQuery.get();
        const popularServices = popularServicesSnapshot.docs.map(doc => doc.data() as FirestoreService);
        const popularServicesHtml = `<ul>${popularServices.map(s => `<li><a href="${baseUrl}/service/${s.slug}">${s.name}</a></li>`).join('')}</ul>`;
        
        const popularCategoriesSnapshot = await db.collection("adminCategories").orderBy('order', 'asc').limit(5).get();
        const popularCategories = popularCategoriesSnapshot.docs.map(doc => doc.data() as FirestoreCategory);
        const popularCategoriesHtml = `<ul>${popularCategories.map(c => `<li><a href="${baseUrl}/category/${c.slug}">${c.name}</a></li>`).join('')}</ul>`;

        // All Content
        const allServicesHtml = `<ul>${allServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
        const allCategoriesHtml = `<ul>${allCategoriesSnap.docs.map(doc => `<li><a href="${baseUrl}/category/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;

        let emailsSent = 0;
        const allUsersSnapshot = await db.collection('users').get();
        
        // --- 2. Iterate through all users and check conditions ---
        for (const userDoc of allUsersSnapshot.docs) {
            const user = { ...userDoc.data(), id: userDoc.id } as FirestoreUser;
            if (!user.email) continue; 
            
            const userDocRef = userDoc.ref as DocumentReference;
            
            const getCategoryServicesHtml = async (configCategoryId?: string, cart?: UserCart | null): Promise<string> => {
                let categoryIdToFetch: string | undefined = configCategoryId && configCategoryId !== "none" ? configCategoryId : undefined;

                // Fallback to cart if config doesn't specify a category
                if (!categoryIdToFetch && cart && cart.items.length > 0) {
                    const firstServiceInCart = allServicesMap.get(cart.items[0].serviceId);
                    if (firstServiceInCart) {
                        const subCat = allSubCategoriesMap.get(firstServiceInCart.subCategoryId);
                        if (subCat) {
                            categoryIdToFetch = subCat.parentId;
                        }
                    }
                }

                if (!categoryIdToFetch) return '';

                const subCatsSnap = await db.collection("adminSubCategories").where("parentId", "==", categoryIdToFetch).get();
                const subCatIds = subCatsSnap.docs.map(doc => doc.id);
                if (subCatIds.length > 0) {
                    const categoryServicesSnap = await db.collection("adminServices").where("subCategoryId", "in", subCatIds).where("isActive", "==", true).orderBy("name", "asc").get();
                    if (!categoryServicesSnap.empty) {
                        return `<ul>${categoryServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
                    }
                }
                return '';
            };
            
            const cartDoc = await db.collection('userCarts').doc(user.id).get();
            const userCart = cartDoc.exists ? cartDoc.data() as UserCart : null;
            const cartContentHtml = userCart && userCart.items.length > 0
                ? `<ul>${userCart.items.map(i => `<li>${allServicesMap.get(i.serviceId)?.name || 'Item'} (x${i.quantity})</li>`).join('')}</ul>`
                : '';

            // A) No Booking Reminder
            if (marketingConfig.noBookingReminderEnabled && marketingConfig.noBookingReminderDelay) {
                const noBookingDelayMs = toMs(marketingConfig.noBookingReminderDelay);
                if (user.createdAt && user.createdAt.toMillis) {
                    const signupMs = user.createdAt.toMillis();
                    const hasBooking = user.hasBooking || false;
                    const reminderSent = user.marketingStatus?.bookingReminderSent || false;

                    if (noBookingDelayMs > 0 && !hasBooking && !reminderSent && (now - signupMs) > noBookingDelayMs) {
                        const categoryServicesHtml = await getCategoryServicesHtml(marketingConfig.noBookingReminderCategoryId, userCart);
                        const body = replaceMergeTags(marketingConfig.noBookingReminderTemplate || "", user, appConfig, globalSettings, { popularServicesHtml, cartContentHtml, popularCategoriesHtml, allServicesHtml, allCategoriesHtml, categoryServicesHtml });
                        await sendMarketingEmail({ toEmail: user.email, subject: "A Reminder from " + (globalSettings.websiteName || "Wecanfix"), htmlBody: body.replace(/\n/g, '<br>'), smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail });
                        await userDocRef.update({ 'marketingStatus.bookingReminderSent': true });
                        emailsSent++;
                    }
                }
            }

            // B) Abandoned Cart Reminder
            if (marketingConfig.abandonedCartEnabled && marketingConfig.abandonedCartDelay && userCart) {
                const abandonedCartDelayMs = toMs(marketingConfig.abandonedCartDelay);
                if (userCart.updatedAt && userCart.updatedAt.toMillis) {
                    const cartUpdatedAtMs = userCart.updatedAt.toMillis();
                    const reminderSent = user.marketingStatus?.cartReminderSent || false;

                    if (abandonedCartDelayMs > 0 && !reminderSent && (now - cartUpdatedAtMs) > abandonedCartDelayMs) {
                        const categoryServicesHtml = await getCategoryServicesHtml(marketingConfig.abandonedCartCategoryId, userCart);
                        const body = replaceMergeTags(marketingConfig.abandonedCartTemplate || "", user, appConfig, globalSettings, { popularServicesHtml, cartContentHtml, popularCategoriesHtml, allServicesHtml, allCategoriesHtml, categoryServicesHtml });
                        await sendMarketingEmail({ toEmail: user.email, subject: "You left something in your cart!", htmlBody: body.replace(/\n/g, '<br>'), smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail });
                        await userDocRef.update({ 'marketingStatus.cartReminderSent': true });
                        emailsSent++;
                    }
                }
            }

            // C) Recurring Engagement Email
            if (marketingConfig.recurringEngagementEnabled && marketingConfig.recurringEngagementDelay) {
                const repeatMs = toMs(marketingConfig.recurringEngagementDelay);
                const lastSentMs = user.marketingStatus?.lastRecurringSent?.toMillis() || 0;
                
                if (user.createdAt && user.createdAt.toMillis) {
                    const signupMs = user.createdAt.toMillis();
                    const eligibleForFirstSend = (now - signupMs) > repeatMs;

                    if (repeatMs > 0 && eligibleForFirstSend && (now - lastSentMs) > repeatMs) {
                        const categoryServicesHtml = await getCategoryServicesHtml(marketingConfig.recurringEngagementCategoryId, userCart);
                        const body = replaceMergeTags(marketingConfig.recurringEngagementTemplate || "", user, appConfig, globalSettings, { popularServicesHtml, cartContentHtml, popularCategoriesHtml, allServicesHtml, allCategoriesHtml, categoryServicesHtml });
                        await sendMarketingEmail({ toEmail: user.email, subject: "A message from " + (globalSettings.websiteName || "Wecanfix"), htmlBody: body.replace(/\n/g, '<br>'), smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail });
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
