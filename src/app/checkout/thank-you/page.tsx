
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Home, ListOrdered, Mail, Download, Loader2, MapPin, Tag, HandCoins, Ban } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, Timestamp, doc, getDoc, runTransaction, query, where, getDocs, limit, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import type { FirestoreBooking, BookingServiceItem, FirestoreService, FirestorePromoCode, AppSettings, AppliedPlatformFeeItem, FirestoreNotification, BookingStatus, MarketingAutomationSettings, MarketingSettings } from '@/types/firestore';
import { getCartEntries, saveCartEntries, syncCartToFirestore } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { sendBookingConfirmationEmail, type BookingConfirmationEmailInput } from '@/ai/flows/sendBookingEmailFlow';
import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { sendWhatsAppFlow } from '@/ai/flows/sendWhatsAppFlow';

// Add type declarations for GTM dataLayer and gtag
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

interface DisplayBookingDetails extends Omit<FirestoreBooking, 'services' | 'createdAt' | 'updatedAt' | 'appliedPlatformFees' | 'latitude' | 'longitude'> {
  id?: string;
  servicesSummary: string;
  createdAt?: string; // Display format
  scheduledDateDisplay?: string; // Display format
  latitude?: number | null;
  longitude?: number | null;
  visitingChargeDisplayed?: number;
  discountCode?: string;
  discountAmount?: number;
  appliedPlatformFees?: AppliedPlatformFeeItem[];
}

const generateBookingId = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `Wecanfix-${timestamp}-${randomSuffix}`;
};

const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return displayedPrice / (1 + taxPercent / 100);
  }
  return displayedPrice;
};

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        // Assuming dateString is YYYY-MM-DD or easily parsable by new Date()
        const date = new Date(dateString.replace(/-/g, '/')); // Handle YYYY-MM-DD
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateString; // Fallback to original string if parsing fails
    }
};

const clearLocalStorageItems = async (userId?: string) => {
    saveCartEntries([]);
    if(userId) {
        // We now delete the cart document from Firestore upon successful booking
        try {
          await deleteDoc(doc(db, "userCarts", userId));
        } catch (error) {
          console.error("Failed to delete Firestore cart for user:", userId, error);
        }
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new StorageEvent('storage', { key: 'wecanfixUserCart' }));
        localStorage.removeItem('wecanfixScheduledDate');
        localStorage.removeItem('wecanfixScheduledTimeSlot');
        localStorage.removeItem('wecanfixCustomerAddress');
        localStorage.removeItem('razorpayPaymentId');
        localStorage.removeItem('razorpayOrderId');
        localStorage.removeItem('razorpaySignature');
        localStorage.removeItem('wecanfixAppliedPromoCode');
        localStorage.removeItem('wecanfixBookingDiscountCode');
        localStorage.removeItem('wecanfixBookingDiscountAmount');
        localStorage.removeItem('wecanfixAppliedPromoCodeId');
        localStorage.removeItem('wecanfixAppliedPlatformFees');
        localStorage.removeItem('isProcessingCancellationFee');
        localStorage.removeItem('bookingIdForCancellationFee');
        localStorage.removeItem('cancellationFeeAmount');
        localStorage.removeItem('wecanfixPaymentMethod');
        localStorage.removeItem('wecanfixFinalBookingTotal');
    }
};

// --- START: Pricing Logic ---
const getPriceForNthUnit = (service: FirestoreService, n: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0 || n <= 0) {
    return service.discountedPrice ?? service.price;
  }
  const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);
  let applicableTier = sortedVariants.find(tier => {
    const start = tier.fromQuantity;
    const end = tier.toQuantity ?? Infinity;
    return n >= start && n <= end;
  });
  if (applicableTier) return applicableTier.price;
  const lastApplicableTier = sortedVariants.slice().reverse().find(tier => n >= tier.fromQuantity);
  if (lastApplicableTier) return lastApplicableTier.price;
  return service.discountedPrice ?? service.price;
};

const calculateIncrementalTotalPriceForItem = (service: FirestoreService, quantity: number): number => {
    if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0) {
        const unitPrice = service.discountedPrice ?? service.price;
        return unitPrice * quantity;
    }
    let total = 0;
    for (let i = 1; i <= quantity; i++) {
        total += getPriceForNthUnit(service, i);
    }
    return total;
};
// --- END: Pricing Logic ---


export default function ThankYouPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [bookingDetailsForDisplay, setBookingDetailsForDisplay] = useState<DisplayBookingDetails | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isCancellationConfirmation, setIsCancellationConfirmation] = useState(false);
  const [cancelledBookingId, setCancelledBookingId] = useState<string | null>(null); 
  const [cancellationFeePaidAmount, setCancellationFeePaidAmount] = useState<number>(0);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const { hideLoading } = useLoading();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();


  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || isLoadingAppSettings) return;

    const processPage = async () => {
      setIsLoadingPage(true);
      hideLoading(); 
      
      const paymentMethod = localStorage.getItem('wecanfixPaymentMethod');
      const isOnlinePayment = paymentMethod === 'Online';
      
      const isProcessingCancellationFee = localStorage.getItem('isProcessingCancellationFee') === 'true';
      const bookingFirestoreDocIdForCancellation = localStorage.getItem('bookingIdForCancellationFee');
      const feeAmountStr = localStorage.getItem('cancellationFeeAmount');
      const razorpayPaymentId = localStorage.getItem('razorpayPaymentId'); 
      const razorpayOrderId = localStorage.getItem('razorpayOrderId');
      const razorpaySignature = localStorage.getItem('razorpaySignature');

      // --- 1. Handle Cancellation Fee Payment Verification ---
      if (isProcessingCancellationFee && bookingFirestoreDocIdForCancellation && feeAmountStr && razorpayPaymentId) {
        try {
            const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
            });
            const verificationResult = await verificationResponse.json();
            if (!verificationResult.success || verificationResult.status !== 'captured') {
                throw new Error(verificationResult.error || "Payment verification failed.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });
            
            setIsCancellationConfirmation(true);
            const feeAmount = parseFloat(feeAmountStr);
            setCancellationFeePaidAmount(feeAmount);
            
            const originalBookingRef = doc(db, "bookings", bookingFirestoreDocIdForCancellation);
            const originalBookingSnap = await getDoc(originalBookingRef);
            if (originalBookingSnap.exists()) {
                const originalBookingData = originalBookingSnap.data() as FirestoreBooking;
                setCancelledBookingId(originalBookingData.bookingId);
                await updateDoc(originalBookingRef, { 
                    status: "Cancelled" as BookingStatus, 
                    updatedAt: Timestamp.now(),
                    cancellationFeePaid: feeAmount,
                    cancellationPaymentId: razorpayPaymentId,
                });
                toast({ title: "Booking Cancelled", description: `Booking ${originalBookingData.bookingId} has been cancelled.` });
            } else {
                toast({ title: "Error", description: "Original booking not found.", variant: "destructive" });
            }

        } catch (error) {
            console.error("Error during cancellation payment verification/update:", error);
            toast({ title: "Payment Error", description: (error as Error).message || "Failed to verify payment. Please contact support.", variant: "destructive" });
        } finally {
            clearLocalStorageItems(currentUser?.uid);
            setIsLoadingPage(false);
        }
        return;
      }
      
      const cartEntriesFromStorage = getCartEntries();
      if (cartEntriesFromStorage.length === 0) {
        toast({ title: "Booking Processed", description: "Redirecting to My Bookings.", variant: "default" });
        router.push('/my-bookings');
        setIsLoadingPage(false);
        return;
      }

      // --- 2. Handle Regular Booking Confirmation ---
      if (isOnlinePayment) {
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            toast({ title: "Verification Failed", description: "Payment details are missing. Please contact support if you were charged.", variant: "destructive" });
            router.push('/cart'); setIsLoadingPage(false); return;
        }
        try {
            const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
            });
            const verificationResult = await verificationResponse.json();
            if (!verificationResult.success || verificationResult.status !== 'captured') {
                throw new Error(verificationResult.error || "Payment verification failed. Please contact support.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });
        } catch (error) {
            console.error("Error during regular payment verification:", error);
            toast({ title: "Payment Error", description: (error as Error).message, variant: "destructive", duration: 7000 });
            router.push('/checkout/payment'); setIsLoadingPage(false); return;
        }
      }

      try {
        const newBookingId = generateBookingId();
        let customerEmail = "customer@example.com", scheduledDateStored = new Date().toLocaleDateString('en-CA'), scheduledTimeSlot = "10:00 AM";
        let customerName = "Guest User", customerPhone = "N/A", addressLine1 = "N/A", addressLine2: string | undefined, city = "N/A", state = "N/A", pincode = "N/A";
        let latitude: number | undefined, longitude: number | undefined;
        let bookingDiscountCode: string | undefined, bookingDiscountAmount: number | undefined, appliedPromoCodeId: string | undefined;
        let storedAppliedPlatformFees: AppliedPlatformFeeItem[] = [];

        if (typeof window !== 'undefined') {
          customerEmail = localStorage.getItem('wecanfixCustomerEmail') || customerEmail;
          scheduledDateStored = localStorage.getItem('wecanfixScheduledDate') || scheduledDateStored; 
          scheduledTimeSlot = localStorage.getItem('wecanfixScheduledTimeSlot') || scheduledTimeSlot;
          bookingDiscountCode = localStorage.getItem('wecanfixBookingDiscountCode') || undefined;
          const discountAmountStr = localStorage.getItem('wecanfixBookingDiscountAmount');
          bookingDiscountAmount = discountAmountStr ? parseFloat(discountAmountStr) : undefined;
          appliedPromoCodeId = localStorage.getItem('wecanfixAppliedPromoCodeId') || undefined;
          const platformFeesStr = localStorage.getItem('wecanfixAppliedPlatformFees');
          if (platformFeesStr) { try { storedAppliedPlatformFees = JSON.parse(platformFeesStr); } catch (e) { console.error("Error parsing stored platform fees:", e); } }
          const addressDataString = localStorage.getItem('wecanfixCustomerAddress');
          if (addressDataString) { const addressData = JSON.parse(addressDataString); customerName = addressData.fullName || customerName; customerPhone = addressData.phone || customerPhone; addressLine1 = addressData.addressLine1 || addressLine1; addressLine2 = addressData.addressLine2 || undefined; city = addressData.city || city; state = addressData.state || state; pincode = addressData.pincode || pincode; latitude = addressData.latitude === null ? undefined : addressData.latitude; longitude = addressData.longitude === null ? undefined : addressData.longitude; }
        }

        let sumOfDisplayedItemPrices = 0;
        const serviceItemsPromises = cartEntriesFromStorage.map(async (entry) => {
          const serviceDocRef = doc(db, "adminServices", entry.serviceId);
          const serviceSnap = await getDoc(serviceDocRef);
          if (serviceSnap.exists()) {
            const serviceData = serviceSnap.data() as FirestoreService;
            const displayedPriceForQuantity = calculateIncrementalTotalPriceForItem(serviceData, entry.quantity);
            sumOfDisplayedItemPrices += displayedPriceForQuantity;
            
            const itemTaxRate = (serviceData.taxPercent || 0) > 0 ? (serviceData.taxPercent || 0) : 0;
            const basePriceForQuantity = getBasePriceForInvoice(displayedPriceForQuantity, serviceData.isTaxInclusive === true, itemTaxRate);
            const taxAmountForItem = basePriceForQuantity * (itemTaxRate / 100);

            return { serviceId: entry.serviceId, name: serviceData.name, quantity: entry.quantity, pricePerUnit: displayedPriceForQuantity / entry.quantity, // Average price for display
              discountedPricePerUnit: serviceData.discountedPrice, // Keep original for reference if needed
              isTaxInclusive: serviceData.isTaxInclusive === true, 
              taxPercentApplied: itemTaxRate, taxAmountForItem: taxAmountForItem,
              _basePriceForBooking: basePriceForQuantity / entry.quantity // Store the calculated base price per unit
            };
          } return null;
        });
        const resolvedServiceItems = (await Promise.all(serviceItemsPromises)).filter(item => item !== null) as (BookingServiceItem & {_basePriceForBooking: number})[];
        if (resolvedServiceItems.length !== cartEntriesFromStorage.length) { toast({title: "Error", description: "Some cart services not found. Booking aborted.", variant: "destructive"}); setIsLoadingPage(false); router.push('/cart'); return; }

        let baseSubTotalForBooking = resolvedServiceItems.reduce((sum, item) => sum + (item._basePriceForBooking * item.quantity), 0);
        
        let displayedVisitingCharge = 0; let baseVisitingChargeForBooking = 0; 
        const subtotalForVcPolicyCheck = sumOfDisplayedItemPrices - (bookingDiscountAmount || 0);
        if (appConfig.enableMinimumBookingPolicy && typeof appConfig.minimumBookingAmount === 'number' && typeof appConfig.visitingChargeAmount === 'number') { if (subtotalForVcPolicyCheck > 0 && subtotalForVcPolicyCheck < appConfig.minimumBookingAmount) { displayedVisitingCharge = appConfig.visitingChargeAmount; baseVisitingChargeForBooking = getBasePriceForInvoice(displayedVisitingCharge, appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent); } }
        
        let totalItemTax = resolvedServiceItems.reduce((sum, item) => sum + (item.taxAmountForItem || 0), 0);
        let visitingChargeTax = 0; if (appConfig.enableTaxOnVisitingCharge && baseVisitingChargeForBooking > 0 && (appConfig.visitingChargeTaxPercent || 0) > 0) { visitingChargeTax = baseVisitingChargeForBooking * ((appConfig.visitingChargeTaxPercent || 0) / 100); }
        
        let totalBasePlatformFees = storedAppliedPlatformFees.reduce((sum, fee) => sum + fee.calculatedFeeAmount, 0);
        let totalTaxOnPlatformFees = storedAppliedPlatformFees.reduce((sum, fee) => sum + fee.taxAmountOnFee, 0);
        
        const totalTaxForBooking = totalItemTax + visitingChargeTax + totalTaxOnPlatformFees;
        const totalAmountForBooking = baseSubTotalForBooking + baseVisitingChargeForBooking + totalBasePlatformFees + totalTaxForBooking - (bookingDiscountAmount || 0);

        const bookingStatus: FirestoreBooking['status'] = (paymentMethod === 'later' || paymentMethod === 'Pay After Service') ? "Pending Payment" : "Confirmed";

        const newBookingData: Omit<FirestoreBooking, 'id'> = {
          bookingId: newBookingId, ...(currentUser?.uid && { userId: currentUser.uid }),
          customerName, customerEmail, customerPhone, addressLine1, ...(addressLine2 && { addressLine2 }), city, state, pincode,
          ...(latitude !== undefined && { latitude }), ...(longitude !== undefined && { longitude }),
          scheduledDate: scheduledDateStored,
          scheduledTimeSlot, 
          services: resolvedServiceItems.map(({ _basePriceForBooking, ...rest }) => rest), // Remove temp field before saving
          subTotal: baseSubTotalForBooking,
          ...(baseVisitingChargeForBooking > 0 && { visitingCharge: baseVisitingChargeForBooking }),
          taxAmount: totalTaxForBooking, totalAmount: totalAmountForBooking,
          ...(bookingDiscountCode !== undefined && { discountCode: bookingDiscountCode }),
          ...(bookingDiscountAmount !== undefined && { discountAmount: bookingDiscountAmount }),
          ...(storedAppliedPlatformFees.length > 0 && { appliedPlatformFees: storedAppliedPlatformFees }),
          paymentMethod: paymentMethod || "Unknown",
          status: bookingStatus,
          ...(razorpayPaymentId && { razorpayPaymentId }),
          ...(razorpayOrderId && { razorpayOrderId }),
          ...(razorpaySignature && { razorpaySignature }),
          createdAt: Timestamp.now(), isReviewedByCustomer: false,
        };

        const docRef = await addDoc(collection(db, "bookings"), newBookingData);
        if (currentUser?.uid) {
            await setDoc(doc(db, "users", currentUser.uid), { hasBooking: true }, { merge: true });
        }
        toast({ title: "Booking Confirmed!", description: `Your booking ID is ${newBookingId}.`});
        logUserActivity('newBooking', { bookingId: newBookingId, totalAmount: totalAmountForBooking, itemCount: resolvedServiceItems.length, paymentMethod: paymentMethod || "Unknown", services: resolvedServiceItems.map(s => ({id: s.serviceId, name: s.name, quantity: s.quantity})) }, currentUser?.uid, !currentUser ? getGuestId() : null);

        if (currentUser?.uid) { const userNotificationData: FirestoreNotification = { userId: currentUser.uid, title: "Booking Confirmed!", message: `Your booking ${newBookingData.bookingId} for ${newBookingData.services.map(s => s.name).join(', ')} on ${formatDateForDisplay(newBookingData.scheduledDate)} is ${newBookingData.status}.`, type: 'success', href: `/my-bookings`, read: false, createdAt: Timestamp.now() }; await addDoc(collection(db, "userNotifications"), userNotificationData); }
        try { const usersRef = collection(db, "users"); const adminQuery = query(usersRef, where("email", "==", ADMIN_EMAIL), limit(1)); const adminSnapshot = await getDocs(adminQuery); if (!adminSnapshot.empty) { const adminUserDoc = adminSnapshot.docs[0]; const adminUid = adminUserDoc.id; const adminNotificationData: FirestoreNotification = { userId: adminUid, title: "New Booking Received!", message: `ID: ${newBookingData.bookingId} by ${newBookingData.customerName}. Date: ${formatDateForDisplay(newBookingData.scheduledDate)} at ${newBookingData.scheduledTimeSlot}. Total: ₹${newBookingData.totalAmount.toFixed(2)}.`, type: 'admin_alert', href: `/admin/bookings/edit/${docRef.id}`, read: false, createdAt: Timestamp.now() }; await addDoc(collection(db, "userNotifications"), adminNotificationData); } else { console.warn(`Admin user with email ${ADMIN_EMAIL} not found. Cannot send admin notification.`); } } catch (adminNotificationError) { console.error("Error creating admin notification:", adminNotificationError); }

        if (appliedPromoCodeId && bookingDiscountAmount && bookingDiscountAmount > 0) { const promoDocRef = doc(db, "adminPromoCodes", appliedPromoCodeId); try { await runTransaction(db, async (transaction) => { const promoSnap = await transaction.get(promoDocRef); if (!promoSnap.exists()) throw new Error("Promo code not found!"); const currentUses = promoSnap.data().usesCount || 0; transaction.update(promoDocRef, { usesCount: currentUses + 1 }); }); } catch (error) { console.error("Error updating promo uses:", error); } }
        const servicesSummary = resolvedServiceItems.map(s => `${s.name} (x${s.quantity})`).join(', ');
        setBookingDetailsForDisplay({ 
            ...(newBookingData as FirestoreBooking), 
            id: docRef.id, 
            servicesSummary, 
            createdAt: newBookingData.createdAt.toDate().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), 
            scheduledDateDisplay: formatDateForDisplay(newBookingData.scheduledDate),
            latitude: newBookingData.latitude === undefined ? null : newBookingData.latitude, 
            longitude: newBookingData.longitude === undefined ? null : newBookingData.longitude, 
            visitingChargeDisplayed: displayedVisitingCharge, 
            discountCode: newBookingData.discountCode, 
            discountAmount: newBookingData.discountAmount, 
            appliedPlatformFees: newBookingData.appliedPlatformFees 
        });
        
        // Fetch Marketing Settings for Conversion Tracking
        const marketingSettingsDoc = await getDoc(doc(db, "webSettings", "marketingConfiguration"));
        const marketingSettings = marketingSettingsDoc.exists() ? marketingSettingsDoc.data() as MarketingSettings : null;

        const transactionValue = parseFloat(totalAmountForBooking.toFixed(2)); const transactionId = newBookingId;
        if (typeof window !== 'undefined') {
            if (marketingSettings?.googleTagManagerId && window.dataLayer) {
                window.dataLayer.push({ ecommerce: null }); 
                window.dataLayer.push({ event: 'purchase', ecommerce: { transaction_id: transactionId, value: transactionValue, currency: 'INR', items: resolvedServiceItems.map(item => ({ item_id: item.serviceId, item_name: item.name, price: item.pricePerUnit, quantity: item.quantity, discount: item.discountedPricePerUnit !== undefined ? item.pricePerUnit - item.discountedPricePerUnit : 0 })) } }); 
            }
            const gtagId = marketingSettings?.googleAnalyticsId || marketingSettings?.googleAdsConversionId;
            if (gtagId && typeof window.gtag === 'function' && !marketingSettings?.googleTagManagerId) {
                if (gtagId.startsWith('AW-') && marketingSettings.googleAdsConversionLabel) {
                    window.gtag('event', 'conversion', { 'send_to': `${gtagId}/${marketingSettings.googleAdsConversionLabel}`, 'value': transactionValue, 'currency': 'INR', 'transaction_id': transactionId });
                } else if (gtagId.startsWith('G-')) {
                    window.gtag('event', 'purchase', { transaction_id: transactionId, value: transactionValue, currency: 'INR', items: resolvedServiceItems.map(item => ({ item_id: item.serviceId, item_name: item.name, price: item.pricePerUnit, quantity: item.quantity })) });
                }
            }
        }
        
        const marketingConfigDoc = await getDoc(doc(db, "webSettings", "marketingAutomation"));
        const marketingConfig = marketingConfigDoc.exists() ? marketingConfigDoc.data() as MarketingAutomationSettings : null;

        if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnBookingConfirmed?.enabled && marketingConfig.whatsAppOnBookingConfirmed.templateName) {
            try {
                await fetch('/api/whatsapp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: customerPhone,
                        templateName: marketingConfig.whatsAppOnBookingConfirmed.templateName,
                        parameters: [newBookingId, servicesSummary, formatDateForDisplay(scheduledDateStored)],
                    }),
                });
            } catch (waError) {
                console.error("Failed to trigger WhatsApp message via API route:", waError);
            }
        }
        
        const emailFlowInput: BookingConfirmationEmailInput = {
          emailType: 'booking_confirmation', // Explicitly add the missing property
          bookingId: newBookingData.bookingId, customerName: newBookingData.customerName, customerEmail: newBookingData.customerEmail, customerPhone: newBookingData.customerPhone, addressLine1: newBookingData.addressLine1, addressLine2: newBookingData.addressLine2, city: newBookingData.city, state: newBookingData.state, pincode: newBookingData.pincode, latitude: newBookingData.latitude, longitude: newBookingData.longitude, scheduledDate: formatDateForDisplay(newBookingData.scheduledDate), scheduledTimeSlot: newBookingData.scheduledTimeSlot, services: newBookingData.services.map(s => ({ serviceId: s.serviceId, name: s.name, quantity: s.quantity, pricePerUnit: s.pricePerUnit, discountedPricePerUnit: s.discountedPricePerUnit })), subTotal: baseSubTotalForBooking, visitingCharge: displayedVisitingCharge, discountAmount: newBookingData.discountAmount, discountCode: newBookingData.discountCode, taxAmount: totalTaxForBooking, totalAmount: totalAmountForBooking, paymentMethod: newBookingData.paymentMethod, status: newBookingData.status, smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail, appliedPlatformFees: newBookingData.appliedPlatformFees?.map(fee => ({ name: fee.name, amount: fee.calculatedFeeAmount + fee.taxAmountOnFee })),
        };
        try { const emailResult = await sendBookingConfirmationEmail(emailFlowInput); if (!emailResult.success) toast({ title: "Email Notification Issue", description: emailResult.message || "Could not send confirmation email(s). Please check admin console logs for details.", variant: "default", duration: 10000 }); } catch (emailError: any) { console.error("ThankYouPage: Exception calling sendBookingConfirmationEmail:", emailError); toast({ title: "Email System Error", description: `Failed to invoke email sending process: ${emailError.message || 'Unknown error'}. Check admin console logs.`, variant: "default", duration: 10000 }); }

        clearLocalStorageItems(currentUser?.uid);

      } catch (error) {
        console.error("Error creating booking:", error);
        toast({ title: "Booking Failed", description: (error as Error).message || "Could not complete booking.", variant: "destructive" });
      } finally {
        setIsLoadingPage(false);
      }
    };

    processPage();
  }, [isMounted, isLoadingAppSettings, appConfig, toast, router, currentUser, hideLoading]);

  if (isLoadingPage || !isMounted || isLoadingAppSettings || (!bookingDetailsForDisplay && !isCancellationConfirmation)) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <CheckoutStepper currentStepId="confirmation" />
        <Card className="shadow-lg"><CardHeader className="items-center text-center"><Loader2 className="h-12 w-12 text-primary animate-spin mb-4" /><CardTitle className="text-xl sm:text-2xl">Processing Your Request...</CardTitle><CardDescription className="text-sm sm:text-base">Please wait a moment.</CardDescription></CardHeader><CardContent className="space-y-4 min-h-[200px]"></CardContent></Card>
      </div>
    );
  }

  if (isCancellationConfirmation) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <Card className="shadow-lg text-center">
          <CardHeader className="items-center px-4 sm:px-6">
            <Ban className="h-12 w-12 sm:h-16 sm:w-16 text-destructive mb-4" />
            <CardTitle className="text-2xl sm:text-3xl font-headline">Booking Cancelled</CardTitle>
            <CardDescription className="text-md sm:text-lg text-muted-foreground">
                Cancellation fee of ₹{cancellationFeePaidAmount.toFixed(2)} has been paid.
                Booking ID: <strong>{cancelledBookingId || 'N/A'}</strong> has been successfully cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 md:px-8 text-xs sm:text-sm">
             <p className="text-muted-foreground mt-1">If applicable, any refund will be processed to your original payment method within 5-7 business days.</p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 sm:pt-6">
            <Link href="/" passHref><Button size="lg" variant="outline" className="w-full sm:w-auto text-sm sm:text-base"><Home className="mr-2 h-4 w-4" /> Go to Home</Button></Link>
            <Link href="/my-bookings" passHref><Button size="lg" className="w-full sm:w-auto text-sm sm:text-base"><ListOrdered className="mr-2 h-4 w-4" /> View My Bookings</Button></Link>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  if (!bookingDetailsForDisplay) {
     return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <CheckoutStepper currentStepId="confirmation" />
        <Card className="shadow-lg">
            <CardHeader className="items-center text-center">
                <CheckCircle2 className="h-12 w-12 sm:h-16 sm:w-16 text-accent mb-4" />
                <CardTitle className="text-2xl sm:text-3xl font-headline">Booking Processed</CardTitle>
                <CardDescription className="text-md sm:text-lg text-muted-foreground">
                    Your request has been processed.
                </CardDescription>
            </CardHeader>
             <CardContent className="px-4 sm:px-6 md:px-8 text-xs sm:text-sm">
                 <p className="text-center text-muted-foreground">Loading booking details or it might have been already confirmed.</p>
             </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 sm:pt-6">
                <Link href="/" passHref><Button size="lg" variant="outline" className="w-full sm:w-auto text-sm sm:text-base"><Home className="mr-2 h-4 w-4" /> Go to Home</Button></Link>
                <Link href="/my-bookings" passHref><Button size="lg" className="w-full sm:w-auto text-sm sm:text-base"><ListOrdered className="mr-2 h-4 w-4" /> Go to My Bookings</Button></Link>
            </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0">
      <CheckoutStepper currentStepId="confirmation" />
      <Card className="shadow-lg text-center">
        <CardHeader className="items-center px-4 sm:px-6"><CheckCircle2 className="h-12 w-12 sm:h-16 sm:w-16 text-accent mb-4" /><CardTitle className="text-2xl sm:text-3xl font-headline">Thank You for Your Booking!</CardTitle><CardDescription className="text-md sm:text-lg text-muted-foreground">Your service has been successfully scheduled.</CardDescription></CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 text-left px-4 sm:px-6 md:px-8 text-xs sm:text-sm">
          <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3 text-center">Booking Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2 sm:gap-y-3 p-3 sm:p-4 border rounded-md bg-secondary/30">
            <div><strong>Booking ID:</strong> {bookingDetailsForDisplay.bookingId}</div>
            <div className="sm:col-span-2"><strong>Service(s):</strong> {bookingDetailsForDisplay.servicesSummary}</div>
            <div><strong>Date:</strong> {bookingDetailsForDisplay.scheduledDateDisplay}</div>
            <div><strong>Time:</strong> {bookingDetailsForDisplay.scheduledTimeSlot}</div>
            <div className="sm:col-span-2"><strong>Address:</strong> {`${bookingDetailsForDisplay.addressLine1}${bookingDetailsForDisplay.addressLine2 ? ', ' + bookingDetailsForDisplay.addressLine2 : ''}, ${bookingDetailsForDisplay.city}, ${bookingDetailsForDisplay.state} - ${bookingDetailsForDisplay.pincode}`}</div>
          
            <div><strong>Items Total (Base):</strong> ₹{(bookingDetailsForDisplay.subTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            {bookingDetailsForDisplay.discountAmount != null && bookingDetailsForDisplay.discountAmount > 0 && (<div className="text-green-600"><strong className="flex items-center"><Tag className="h-3 w-3 mr-1" />Discount ({bookingDetailsForDisplay.discountCode || 'Applied'}):</strong><span>- ₹{bookingDetailsForDisplay.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>)}
            {bookingDetailsForDisplay.visitingChargeDisplayed != null && bookingDetailsForDisplay.visitingChargeDisplayed > 0 && (<div><strong>Visiting Charge (Base):</strong> <span className="text-primary">+ ₹{(bookingDetailsForDisplay.visitingCharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>)}
            {bookingDetailsForDisplay.appliedPlatformFees && bookingDetailsForDisplay.appliedPlatformFees.length > 0 && ( bookingDetailsForDisplay.appliedPlatformFees.map((fee, index) => ( <div key={index}> <strong className="flex items-center"><HandCoins className="h-3 w-3 mr-1"/>{fee.name}:</strong> <span className="text-primary"> + ₹{(fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2)}</span> </div> )) )}
            <div><strong>Total Tax:</strong> + ₹{bookingDetailsForDisplay.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div><strong>Total Amount:</strong> <span className="font-bold text-primary">₹{bookingDetailsForDisplay.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div><strong>Payment Method:</strong> {bookingDetailsForDisplay.paymentMethod}</div>
            <div><strong>Status:</strong> {bookingDetailsForDisplay.status}</div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground text-center mt-3 sm:mt-4 flex items-center justify-center"><Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2"/> An email confirmation has been sent to {bookingDetailsForDisplay.customerEmail}.</p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 sm:pt-6 w-full">
  <Link href="/" passHref className="w-full sm:w-auto">
    <Button
      size="lg"
      variant="outline"
      className="w-full sm:w-auto text-sm sm:text-base hidden md:flex"
    >
      <Home className="mr-2 h-4 w-4" /> Go to Home
    </Button>
  </Link>

  <Link href="/my-bookings" passHref className="w-full sm:w-auto">
    <Button
      size="lg"
      className="w-full sm:w-auto text-sm sm:text-base"
    >
      <ListOrdered className="mr-2 h-4 w-4" /> Go to Bookings
    </Button>
  </Link>
</CardFooter>
      </Card>
    </div>
  );
}
