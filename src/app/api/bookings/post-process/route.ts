// src/app/api/bookings/post-process/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { sendBookingConfirmationEmail } from '@/ai/flows/sendBookingEmailFlow';
import { getBaseUrl } from '@/lib/config';

// Define ADMIN_EMAIL - should match your AuthContext
const ADMIN_EMAIL = "wecanfix.in@gmail.com"; 

export async function POST(request: Request) {
  try {
    const { bookingDocId } = await request.json();

    if (!bookingDocId) {
      return NextResponse.json({ error: 'Missing bookingDocId' }, { status: 400 });
    }

    // 1. Fetch the full booking data from server-side Firestore
    const bookingDoc = await adminDb.collection('bookings').doc(bookingDocId).get();
    if (!bookingDoc.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = bookingDoc.data() as any;
    const userId = booking.userId;

    // 2. Fetch App Settings for Email/WhatsApp
    const [appConfigDoc, marketingConfigDoc, seoSettingsDoc] = await Promise.all([
        adminDb.collection('webSettings').doc('applicationConfig').get(),
        adminDb.collection('webSettings').doc('marketingAutomation').get(),
        adminDb.collection('seoSettings').doc('global').get()
    ]);

    const appConfig = appConfigDoc.data() as any;
    const marketingConfig = marketingConfigDoc.data() as any;
    const seoSettings = seoSettingsDoc.data() as any;

    // --- EXECUTE ALL TASKS IN PARALLEL ON SERVER ---
    const tasks: Promise<any>[] = [];

    // A. Update User "hasBooking" status
    if (userId) {
        tasks.push(adminDb.collection('users').doc(userId).set({ hasBooking: true }, { merge: true }));
    }

    // B. User Dashboard Notification
    if (userId) {
        tasks.push(adminDb.collection('userNotifications').add({
            userId,
            title: "Booking Confirmed!",
            message: `Your booking ${booking.bookingId} is ${booking.status}.`,
            type: 'success',
            href: `/my-bookings`,
            read: false,
            createdAt: Timestamp.now()
        }));
    }

    // C. Admin Dashboard Notification
    const adminQuery = await adminDb.collection('users').where('email', '==', ADMIN_EMAIL).limit(1).get();
    if (!adminQuery.empty) {
        const adminUid = adminQuery.docs[0].id;
        tasks.push(adminDb.collection('userNotifications').add({
            userId: adminUid,
            title: "New Booking Received!",
            message: `ID: ${booking.bookingId} by ${booking.customerName}. Total: ₹${booking.totalAmount.toFixed(2)}.`,
            type: 'admin_alert',
            href: `/admin/bookings/edit/${bookingDocId}`,
            read: false,
            createdAt: Timestamp.now()
        }));
    }

    // D. Trigger Actual Push Notifications
    const triggerPush = async (pUserId: string, pTitle: string, pBody: string, pHref: string) => {
        try {
            await fetch(`${getBaseUrl()}/api/send-push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: pUserId, title: pTitle, body: pBody, href: pHref }),
            });
        } catch (e) {
            console.error(`Error triggering push for ${pUserId}:`, e);
        }
    };

    if (userId) {
        tasks.push(triggerPush(userId, "Booking Confirmed!", `Your booking ${booking.bookingId} is confirmed.`, "/my-bookings"));
    }

    if (!adminQuery.empty) {
        const adminUid = adminQuery.docs[0].id;
        tasks.push(triggerPush(adminUid, "New Booking Received!", `ID: ${booking.bookingId} by ${booking.customerName}.`, `/admin/bookings/edit/${bookingDocId}`));
    }

    // E. Promo Code Usage Update
    if (booking.discountCode) {
        const promoQuery = await adminDb.collection('adminPromoCodes').where('code', '==', booking.discountCode).limit(1).get();
        if (!promoQuery.empty) {
            tasks.push(promoQuery.docs[0].ref.update({ 
                usesCount: (promoQuery.docs[0].data().usesCount || 0) + 1 
            }));
        }
    }

    // F. Send Email (Genkit Flow)
    const servicesSummary = booking.services.map((s: any) => `${s.name} (x${s.quantity})`).join(', ');
    const emailFlowInput = {
        emailType: 'booking_confirmation' as const,
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        addressLine1: booking.addressLine1,
        addressLine2: booking.addressLine2,
        city: booking.city,
        state: booking.state,
        pincode: booking.pincode,
        latitude: booking.latitude,
        longitude: booking.longitude,
        scheduledDate: booking.scheduledDate,
        scheduledTimeSlot: booking.scheduledTimeSlot,
        services: booking.services,
        subTotal: booking.subTotal,
        visitingCharge: booking.visitingCharge || 0,
        discountAmount: booking.discountAmount || 0,
        discountCode: booking.discountCode,
        taxAmount: booking.taxAmount,
        totalAmount: booking.totalAmount,
        paymentMethod: booking.paymentMethod,
        status: booking.status,
        smtpHost: appConfig.smtpHost,
        smtpPort: appConfig.smtpPort,
        smtpUser: appConfig.smtpUser,
        smtpPass: appConfig.smtpPass,
        senderEmail: appConfig.senderEmail,
        appliedPlatformFees: booking.appliedPlatformFees?.map((fee: any) => ({ 
            name: fee.name, 
            amount: fee.calculatedFeeAmount + fee.taxAmountOnFee 
        })),
    };
    tasks.push(sendBookingConfirmationEmail(emailFlowInput));

    // G. Send WhatsApp
    if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnBookingConfirmed?.enabled) {
        const waPromise = fetch(`${getBaseUrl()}/api/whatsapp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: booking.customerPhone,
                templateName: marketingConfig.whatsAppOnBookingConfirmed.templateName,
                parameters: [booking.bookingId, servicesSummary, booking.scheduledDate],
            }),
        }).catch(e => console.error("Server-side WhatsApp Error:", e));
        tasks.push(waPromise);
    }

    // Wait for everything to finish on the server
    await Promise.all(tasks);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error in post-process API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
