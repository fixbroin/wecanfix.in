
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Tag, Eye, Loader2, PackageSearch, XIcon, Edit, Trash2, CalendarDays, Clock, UserCheck2, MoreHorizontal, Users, ListOrdered } from "lucide-react"; // Added ListOrdered
import type { FirestoreBooking, BookingStatus, BookingServiceItem, AppSettings, ProviderApplication, FirestoreNotification, MarketingAutomationSettings, ReferralSettings, FirestoreUser, Referral, DayAvailability } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, deleteDoc, where, getDocs, deleteField, addDoc, getDoc, runTransaction, limit } from "firebase/firestore"; // Added necessary imports
import { useToast } from "@/hooks/use-toast";
import BookingDetailsModalContent from '@/components/admin/BookingDetailsModalContent';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { generateInvoicePdf as generateInvoicePdfForDownload } from '@/lib/invoiceGenerator'; 
import { sendBookingConfirmationEmail, type BookingConfirmationEmailInput } from '@/ai/flows/sendBookingEmailFlow';
import { sendProviderBookingAssignmentEmail, type ProviderBookingAssignmentEmailInput } from '@/ai/flows/sendProviderBookingAssignmentFlow'; // Added
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { Calendar } from '@/components/ui/calendar';
import { defaultAppSettings } from '@/config/appDefaults';
import AssignProviderModal from '@/components/admin/AssignProviderModal'; 
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"; 

const statusOptions: BookingStatus[] = [
  "Pending Payment", "Confirmed", "AssignedToProvider", "ProviderAccepted", 
  "ProviderRejected", "InProgressByProvider", "Processing", "Completed", "Cancelled", "Rescheduled"
];
const receivedPaymentMethods = ["Cash", "UPI", "Bank Transfer", "Card (POS)"];

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/')); 
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
};

const getStatusBadgeVariant = (status: BookingStatus) => {
    switch (status) {
      case 'Completed': return 'default';
      case 'Confirmed':
      case 'ProviderAccepted':
      case 'AssignedToProvider':
      case 'InProgressByProvider':
        return 'default'; 
      case 'Pending Payment':
      case 'Rescheduled':
      case 'Processing':
        return 'secondary';
      case 'Cancelled':
      case 'ProviderRejected':
        return 'destructive';
      default: return 'outline';
    }
  };

const getStatusBadgeClass = (status: BookingStatus) => {
    switch (status) {
        case 'Completed': return 'bg-green-500 hover:bg-green-600';
        case 'Confirmed':
        case 'ProviderAccepted':
        case 'AssignedToProvider':
        case 'InProgressByProvider':
            return 'bg-blue-500 hover:bg-blue-600';
        case 'Pending Payment':
        case 'Rescheduled':
            return 'bg-orange-500 hover:bg-orange-600';
        case 'Processing':
            return 'bg-purple-500 hover:bg-purple-600';
        case 'Cancelled':
        case 'ProviderRejected':
            return 'bg-red-600 hover:bg-red-700';
        default: return '';
    }
};

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<FirestoreBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<BookingStatus | "All">("All");
  const { toast } = useToast();
  const router = useRouter();
  const [selectedBooking, setSelectedBooking] = useState<FirestoreBooking | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [marketingConfig, setMarketingConfig] = useState<MarketingAutomationSettings | null>(null);


  const [isPaymentMethodDialogOpen, setIsPaymentMethodDialogOpen] = useState(false);
  const [selectedBookingForPaymentUpdate, setSelectedBookingForPaymentUpdate] = useState<FirestoreBooking | null>(null);
  const [paymentReceivedMethodForDialog, setPaymentReceivedMethodForDialog] = useState<string>("");

  const { settings: globalCompanySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();

  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [selectedBookingForReschedule, setSelectedBookingForReschedule] = useState<FirestoreBooking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleSelectedTimeSlot, setRescheduleSelectedTimeSlot] = useState<string | undefined>();
  const [rescheduleAvailableTimeSlots, setRescheduleAvailableTimeSlots] = useState<string[]>([]);
  const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [bookingToAssign, setBookingToAssign] = useState<Pick<FirestoreBooking, 'id' | 'bookingId'> | null>(null);


  useEffect(() => {
    setIsLoading(true);
    const bookingsCollectionRef = collection(db, "bookings");
    const q = query(bookingsCollectionRef, orderBy("createdAt", "desc"));

    const marketingConfigRef = doc(db, "webSettings", "marketingAutomation");
    const unsubMarketing = onSnapshot(marketingConfigRef, (docSnap) => {
        if (docSnap.exists()) {
            setMarketingConfig(docSnap.data() as MarketingAutomationSettings);
        }
    });

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedBookings = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreBooking));
      setBookings(fetchedBookings);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching bookings: ", error);
      toast({ title: "Error", description: "Could not fetch bookings.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => {
        unsubscribe();
        unsubMarketing();
    };
  }, [toast]);

  const filteredBookings = useMemo(() => {
    if (filterStatus === "All") {
      return bookings;
    }
    return bookings.filter(booking => booking.status === filterStatus);
  }, [bookings, filterStatus]);
  
  const handleReferralBonusOnCompletion = async (booking: FirestoreBooking) => {
    if (!booking.userId) return;
    console.log(`Referral check for booking ${booking.bookingId}, user ${booking.userId}`);
  
    try {
      const userDocRef = doc(db, "users", booking.userId);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists() || !userSnap.data()?.referredBy) {
        console.log(`User ${booking.userId} was not referred.`);
        return;
      }
      const firestoreUser = { id: userSnap.id, ...userSnap.data() } as FirestoreUser;
  
      const userBookingsQuery = query(
        collection(db, "bookings"),
        where("userId", "==", firestoreUser.id),
        where("status", "==", "Completed")
      );
      const userBookingsSnap = await getDocs(userBookingsQuery);
      if (userBookingsSnap.size > 1) {
        console.log(`User ${firestoreUser.id} already has completed bookings.`);
        return;
      }
  
      const referralsRef = collection(db, "referrals");
      const referralQuery = query(
        referralsRef,
        where("referredUserId", "==", firestoreUser.id),
        where("status", "==", "pending"),
        limit(1)
      );
      const referralSnap = await getDocs(referralQuery);
      if (referralSnap.empty) {
        console.log(`No pending referral record for user ${firestoreUser.id}.`);
        return;
      }
      const referralDoc = referralSnap.docs[0];
      const referralData = referralDoc.data() as Referral;
  
      const referralSettingsRef = doc(db, "appConfiguration", "referral");
      const referralSettingsSnap = await getDoc(referralSettingsRef);
      const referralSettings = referralSettingsSnap.exists() ? referralSettingsSnap.data() as ReferralSettings : null;
  
      if (!referralSettings?.isReferralSystemEnabled) {
        console.log("Referral system disabled.");
        return;
      }
      if (booking.totalAmount < (referralSettings.minBookingValueForBonus || 0)) {
        console.log(`Booking amount ${booking.totalAmount} is less than minimum ${referralSettings.minBookingValueForBonus}.`);
        await updateDoc(referralDoc.ref, { status: 'failed', failureReason: 'min_booking_not_met' });
        return;
      }
  
      await runTransaction(db, async (transaction) => {
        const referrerDocRef = doc(db, "users", referralData.referrerId);
        const referrerDoc = await transaction.get(referrerDocRef);
        if (!referrerDoc.exists()) throw new Error(`Referrer user ${referralData.referrerId} not found.`);
  
        const newWalletBalance = (referrerDoc.data().walletBalance || 0) + referralData.referrerBonus;
        transaction.update(referrerDocRef, { walletBalance: newWalletBalance });
        transaction.update(referralDoc.ref, { status: 'completed', bookingId: booking.bookingId });
        
        const notification: Omit<FirestoreNotification, 'id'> = {
          userId: referralData.referrerId,
          title: "Referral Bonus Credited!",
          message: `Your referral bonus of ₹${referralData.referrerBonus} has been credited for ${firestoreUser.displayName}'s first booking.`,
          type: "success",
          href: "/referral",
          read: false,
          createdAt: Timestamp.now(),
        };
        transaction.set(doc(collection(db, "userNotifications")), notification);
      });
  
      toast({ title: "Referral Bonus Awarded!", description: `₹${referralData.referrerBonus} credited to the referrer's wallet.` });
      console.log(`Bonus of ${referralData.referrerBonus} awarded to ${referralData.referrerId}.`);
  
    } catch (error) {
      console.error("Error processing referral bonus:", error);
      toast({ title: "Referral Bonus Error", description: (error as Error).message, variant: "destructive" });
    }
  };


  const prepareAndSendEmail = async (
    booking: FirestoreBooking,
    emailType: 'booking_confirmation' | 'booking_completion' | 'booking_rescheduled' | 'booking_cancelled_by_admin' | 'booking_cancelled_by_user',
    updatedPaymentMethod?: string,
    originalScheduledDateForEmail?: string,
    originalScheduledTimeSlotForEmail?: string,
    cancellationReason?: string
  ) => {
    if (isLoadingAppSettings) {
      toast({ title: "Processing", description: "App settings still loading, please wait.", variant: "default" });
      return false;
    }
    toast({ title: "Processing Email", description: `Preparing ${emailType.replace(/_/g, ' ')} email...`, variant: "default" });
    const companyDetailsForInvoice = {
      name: globalCompanySettings?.websiteName || "Wecanfix.in",
      address: globalCompanySettings?.address || "#44 G S Palya Road Konappana Agrahara Electronic City Phase 2 -560100",
      contactEmail: globalCompanySettings?.contactEmail || "support@wecanfix.in",
      contactMobile: globalCompanySettings?.contactMobile || "+91-7353113455",
      logoUrl: globalCompanySettings?.logoUrl || undefined,
    };
    let invoicePdfBase64 = "";
    if (emailType === 'booking_completion') { try { const dataUri = await generateInvoicePdfForDownload(booking, companyDetailsForInvoice); if (typeof dataUri === 'string' && dataUri.includes(',')) { invoicePdfBase64 = dataUri.split(',')[1]; } else { console.warn("generateInvoicePdf did not return a valid data URI string for completion email."); } } catch (invoiceError) { console.error("Error generating invoice for completion email:", invoiceError); } }
    const emailInput: BookingConfirmationEmailInput = {
      emailType: emailType, bookingId: booking.bookingId, customerName: booking.customerName, customerEmail: booking.customerEmail, customerPhone: booking.customerPhone, addressLine1: booking.addressLine1, addressLine2: booking.addressLine2, city: booking.city, state: booking.state, pincode: booking.pincode, scheduledDate: formatDateForDisplay(booking.scheduledDate), scheduledTimeSlot: booking.scheduledTimeSlot, services: booking.services.map((s: BookingServiceItem) => ({ serviceId: s.serviceId, name: s.name, quantity: s.quantity, pricePerUnit: s.pricePerUnit, discountedPricePerUnit: s.discountedPricePerUnit, })), subTotal: booking.subTotal, visitingCharge: booking.visitingCharge, discountAmount: booking.discountAmount, discountCode: booking.discountCode, appliedPlatformFees: booking.appliedPlatformFees?.map(fee => ({ name: fee.name, amount: fee.calculatedFeeAmount + fee.taxAmountOnFee, })), taxAmount: booking.taxAmount, totalAmount: booking.totalAmount, paymentMethod: updatedPaymentMethod || booking.paymentMethod, status: booking.status, invoicePdfBase64: invoicePdfBase64 || undefined, smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail, previousScheduledDate: originalScheduledDateForEmail ? formatDateForDisplay(originalScheduledDateForEmail) : undefined, previousScheduledTimeSlot: originalScheduledTimeSlotForEmail,
      cancellationReason,
      siteName: globalCompanySettings?.websiteName,
    };
    try { const emailResult = await sendBookingConfirmationEmail(emailInput); if (emailResult.success) { toast({ title: "Email Sent", description: `${emailType.replace(/_/g, ' ')} email sent to customer.` }); } else { toast({ title: "Email Failed", description: emailResult.message || `Could not send ${emailType.replace(/_/g, ' ')} email.`, variant: "destructive", duration: 7000 }); } return emailResult.success;
    } catch (emailFlowError) { console.error(`Error calling sendBookingConfirmationEmail flow for ${emailType}:`, emailFlowError); toast({ title: "Email System Error", description: "Failed to trigger email sending process.", variant: "destructive", duration: 7000 }); return false; }
  };

  const handleStatusChange = async (booking: FirestoreBooking, newStatus: BookingStatus) => {
    const bookingId = booking.id;
    if (!bookingId) { toast({ title: "Error", description: "Booking ID is missing.", variant: "destructive" }); return; }
    if (newStatus === "Rescheduled" && booking.status !== "Rescheduled") {
      setSelectedBookingForReschedule(booking); const currentScheduledDate = new Date(booking.scheduledDate.replace(/-/g, '/')); setRescheduleDate(isNaN(currentScheduledDate.getTime()) ? new Date() : currentScheduledDate); setRescheduleSelectedTimeSlot(booking.scheduledTimeSlot); setIsRescheduleDialogOpen(true); fetchRescheduleSlots(isNaN(currentScheduledDate.getTime()) ? new Date() : currentScheduledDate); return;
    }
    const requiresPaymentMethodConfirmation = newStatus === "Completed" && (booking.paymentMethod === "Pay After Service" || booking.paymentMethod === "Cash on Delivery" || booking.status === "Pending Payment");
    if (requiresPaymentMethodConfirmation && newStatus === "Completed") { setSelectedBookingForPaymentUpdate(booking); setIsPaymentMethodDialogOpen(true);
    } else {
      setIsUpdatingStatus(bookingId); const bookingDocRef = doc(db, "bookings", bookingId);
      try { const updatePayload: Record<string, any> = { status: newStatus, updatedAt: Timestamp.now() }; if (newStatus === "Completed" && booking.isReviewedByCustomer === undefined) { updatePayload.isReviewedByCustomer = false; } await updateDoc(bookingDocRef, updatePayload); toast({ title: "Success", description: `Booking status updated to ${newStatus}.` });
        const updatedBookingForNotifications = { ...booking, status: newStatus };
        if (newStatus === "Completed") {
            await prepareAndSendEmail(updatedBookingForNotifications, 'booking_completion');
            await handleReferralBonusOnCompletion(updatedBookingForNotifications); // Handle Referral
            if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnBookingCompleted?.enabled && marketingConfig.whatsAppOnBookingCompleted.templateName) {
                try {
                    await fetch('/api/whatsapp/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: booking.customerPhone,
                            templateName: marketingConfig.whatsAppOnBookingCompleted.templateName,
                            parameters: [booking.bookingId],
                        }),
                    });
                } catch (waError) {
                    console.error("Failed to trigger WhatsApp message for booking completed:", waError);
                }
            }
        }
        if (newStatus === "Cancelled") {
            await prepareAndSendEmail(updatedBookingForNotifications, 'booking_cancelled_by_admin', undefined, undefined, "Cancelled due to operational reasons.");
            if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnBookingCancelled?.enabled && marketingConfig.whatsAppOnBookingCancelled.templateName) {
                 try {
                    await fetch('/api/whatsapp/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: booking.customerPhone,
                            templateName: marketingConfig.whatsAppOnBookingCancelled.templateName,
                            parameters: [booking.bookingId],
                        }),
                    });
                } catch (waError) {
                    console.error("Failed to trigger WhatsApp message for booking cancelled:", waError);
                }
            }
        }
      } catch (error) { console.error("Error updating booking status: ", error); toast({ title: "Error", description: "Could not update booking status.", variant: "destructive" });
      } finally { setIsUpdatingStatus(null); }
    }
  };

  const handleConfirmPaymentAndUpdateStatus = async () => {
    if (!selectedBookingForPaymentUpdate || !selectedBookingForPaymentUpdate.id || !paymentReceivedMethodForDialog) { toast({ title: "Error", description: "Booking or payment method missing for confirmation.", variant: "destructive" }); return; }
    const bookingToUpdate = selectedBookingForPaymentUpdate; const bookingIdToUpdate = bookingToUpdate.id;
    if (!bookingIdToUpdate) { toast({ title: "Error", description: "Booking ID is missing.", variant: "destructive" }); return; }
    
    setIsUpdatingStatus(bookingIdToUpdate); setIsPaymentMethodDialogOpen(false);
    const updatedBookingForEmail: FirestoreBooking = { ...bookingToUpdate, paymentMethod: paymentReceivedMethodForDialog, status: "Completed" };
    const updatePayload: Record<string, any> = { status: "Completed" as BookingStatus, paymentMethod: paymentReceivedMethodForDialog, updatedAt: Timestamp.now(), };
    if (bookingToUpdate.isReviewedByCustomer === undefined) { updatePayload.isReviewedByCustomer = false; }
    
    // Referral Bonus on Completion
    await handleReferralBonusOnCompletion(updatedBookingForEmail);

    if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnBookingCompleted?.enabled && marketingConfig.whatsAppOnBookingCompleted.templateName) {
        try {
            await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: bookingToUpdate.customerPhone,
                    templateName: marketingConfig.whatsAppOnBookingCompleted.templateName,
                    parameters: [bookingToUpdate.bookingId],
                }),
            });
        } catch (waError) {
            console.error("Failed to trigger WhatsApp message for payment confirmation:", waError);
        }
    }
    const bookingDocRef = doc(db, "bookings", bookingIdToUpdate);
    try { 
        await updateDoc(bookingDocRef, updatePayload); 
        toast({ title: "Success", description: `Booking marked as Completed. Payment via ${paymentReceivedMethodForDialog}.` });
        // Send email *after* successful database update
        await prepareAndSendEmail(updatedBookingForEmail, 'booking_completion', paymentReceivedMethodForDialog);
    } catch (error) { console.error("Error updating booking status and payment method: ", error); toast({ title: "Error", description: "Could not update booking.", variant: "destructive" });
    } finally { setIsUpdatingStatus(null); setSelectedBookingForPaymentUpdate(null); setPaymentReceivedMethodForDialog(""); }
  };

  const handleViewDetails = (booking: FirestoreBooking) => { setSelectedBooking(booking); setIsDetailsModalOpen(true); };
  const handleEditBooking = (bookingId: string) => { if (bookingId) { router.push(`/admin/bookings/edit/${bookingId}`); } else { toast({ title: "Error", description: "Booking ID is missing.", variant: "destructive" }); } };
  const handleDeleteBooking = async (bookingId: string) => {
    if (!bookingId) { toast({ title: "Error", description: "Booking ID is missing for delete.", variant: "destructive" }); return; }
    setIsDeleting(bookingId); 
    const bookingDocRef = doc(db, "bookings", bookingId);
    try { 
        await deleteDoc(bookingDocRef); 
        toast({ title: "Success", description: `Booking deleted.` });
    } catch (error) { 
        console.error("Error deleting booking: ", error); 
        toast({ title: "Error", description: "Could not delete booking.", variant: "destructive" });
    } finally { 
        setIsDeleting(null); 
    }
  };
  
  const parseTimeToMinutes = (timeStr: string): number => { if (!timeStr || !timeStr.includes(':')) return 0; const [hours, minutes] = timeStr.split(':').map(Number); return hours * 60 + minutes; };
  const formatTimeFromMinutes = (totalMinutes: number): string => { const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; const period = hours >= 12 && hours < 24 ? 'PM' : 'AM'; let displayHours = hours % 12; if (displayHours === 0) displayHours = 12; return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`; };
  const generateAdminRawTimeSlots = (referenceDate: Date, config: AppSettings): string[] => {
    const slots: string[] = []; const now = new Date(); let effectiveDelayHours = 0;
    if (config.enableLimitLateBookings && typeof config.limitLateBookingHours === 'number' && config.limitLateBookingHours > 0) { effectiveDelayHours = config.limitLateBookingHours; }
    const earliestBookableAbsoluteTime = new Date(now.getTime() + (effectiveDelayHours * 60 * 60 * 1000) + (1 * 60 * 1000));
    const slotInterval = config.timeSlotSettings?.slotIntervalMinutes || defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
    const servicePeriodsToUse = Object.values(config.timeSlotSettings.weeklyAvailability || {});

    servicePeriodsToUse.forEach(periodConfig => {
      if (!periodConfig.startTime || !periodConfig.endTime) return; 
      let currentSlotTimeMinutes = parseTimeToMinutes(periodConfig.startTime); 
      const periodEndTimeMinutes = parseTimeToMinutes(periodConfig.endTime);
      while (currentSlotTimeMinutes < periodEndTimeMinutes) { 
        const currentSlotDateTime = new Date(referenceDate); 
        currentSlotDateTime.setHours(Math.floor(currentSlotTimeMinutes / 60), currentSlotTimeMinutes % 60, 0, 0); 
        if (currentSlotDateTime >= earliestBookableAbsoluteTime) { slots.push(formatTimeFromMinutes(currentSlotTimeMinutes)); } currentSlotTimeMinutes += slotInterval; 
      }
    }); 
    
    // Remove duplicates and sort
    return Array.from(new Set(slots)).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
  };

  const fetchRescheduleSlots = async (date: Date) => {
    if (!appConfig || isLoadingAppSettings) { toast({ title: "Config Loading", description: "Application settings are still loading. Please wait.", variant: "default" }); return; }
    setIsLoadingRescheduleSlots(true); const today = new Date(); today.setHours(0, 0, 0, 0); const selectedDay = new Date(date); selectedDay.setHours(0, 0, 0, 0);
    if (selectedDay < today) { setRescheduleAvailableTimeSlots([]); setIsLoadingRescheduleSlots(false); toast({ title: "Invalid Date", description: "Cannot reschedule to a past date.", variant: "destructive" }); return; }
    const rawSlots = generateAdminRawTimeSlots(date, appConfig); setRescheduleAvailableTimeSlots(rawSlots); setIsLoadingRescheduleSlots(false);
  };

  useEffect(() => { if (isRescheduleDialogOpen && rescheduleDate && selectedBookingForReschedule) { fetchRescheduleSlots(rescheduleDate); } }, [rescheduleDate, isRescheduleDialogOpen, selectedBookingForReschedule, appConfig]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleRescheduleDateSelect = (date: Date | undefined) => { if (date) { setRescheduleDate(date); setRescheduleSelectedTimeSlot(undefined); } };
  const handleConfirmReschedule = async () => {
    if (!selectedBookingForReschedule || !selectedBookingForReschedule.id || !rescheduleDate || !rescheduleSelectedTimeSlot) { toast({ title: "Missing Information", description: "Please select a new date and time slot.", variant: "destructive" }); return; }
    setIsUpdatingStatus(selectedBookingForReschedule.id); const bookingDocRef = doc(db, "bookings", selectedBookingForReschedule.id); const originalScheduledDate = selectedBookingForReschedule.scheduledDate; const originalScheduledTimeSlot = selectedBookingForReschedule.scheduledTimeSlot;
    try { const newScheduledDate = rescheduleDate.toLocaleDateString('en-CA'); await updateDoc(bookingDocRef, { scheduledDate: newScheduledDate, scheduledTimeSlot: rescheduleSelectedTimeSlot, status: "Rescheduled" as BookingStatus, updatedAt: Timestamp.now(), });
      const updatedBookingForEmail = { ...selectedBookingForReschedule, scheduledDate: newScheduledDate, scheduledTimeSlot: rescheduleSelectedTimeSlot, status: "Rescheduled" as BookingStatus };
      await prepareAndSendEmail(updatedBookingForEmail, 'booking_rescheduled', undefined, originalScheduledDate, originalScheduledTimeSlot);
      toast({ title: "Booking Rescheduled", description: `Booking ${selectedBookingForReschedule.bookingId} has been rescheduled.` }); setIsRescheduleDialogOpen(false); setSelectedBookingForReschedule(null);
    } catch (error) { console.error("Error rescheduling booking:", error); toast({ title: "Error", description: "Could not reschedule booking.", variant: "destructive" });
    } finally { setIsUpdatingStatus(null); }
  };

  const openAssignModal = (bookingId: string, humanReadableBookingId: string) => {
    if (!bookingId) { toast({title: "Error", description: "Booking ID missing for assignment.", variant: "destructive"}); return;}
    setBookingToAssign({ id: bookingId, bookingId: humanReadableBookingId });
    setIsAssignModalOpen(true);
  };

  const handleConfirmAssignment = async (bookingId: string, providerId: string, providerName: string) => {
    setIsUpdatingStatus(bookingId);
    const bookingDocRef = doc(db, "bookings", bookingId);
    try {
        await updateDoc(bookingDocRef, {
            providerId: providerId,
            status: "AssignedToProvider" as BookingStatus,
            updatedAt: Timestamp.now(),
        });
        toast({ title: "Booking Assigned", description: `Booking assigned to ${providerName}.` });

        // Fetch Provider Email
        const providerAppDocRef = doc(db, "providerApplications", providerId);
        const providerDocSnap = await getDoc(providerAppDocRef);
        if (!providerDocSnap.exists()) {
            throw new Error(`Provider application for ID ${providerId} not found.`);
        }
        const providerData = providerDocSnap.data() as ProviderApplication;
        const providerEmail = providerData.email;

        if (!providerEmail) {
            throw new Error(`Email not found for provider ${providerName} (ID: ${providerId}).`);
        }

        // Fetch Booking Details for Email
        const currentBookingSnap = await getDoc(bookingDocRef);
        if (!currentBookingSnap.exists()) {
            throw new Error(`Booking ${bookingId} not found for notification.`);
        }
        const currentBookingData = currentBookingSnap.data() as FirestoreBooking;

        const emailInput: ProviderBookingAssignmentEmailInput = {
            providerName: providerName,
            providerEmail: providerEmail,
            bookingId: currentBookingData.bookingId,
            bookingDocId: bookingId,
            serviceName: currentBookingData.services.map(s => s.name).join(', ') || "Multiple Services",
            scheduledDate: formatDateForDisplay(currentBookingData.scheduledDate),
            scheduledTimeSlot: currentBookingData.scheduledTimeSlot,
            customerName: currentBookingData.customerName,
            customerAddress: `${currentBookingData.addressLine1}${currentBookingData.addressLine2 ? ', ' + currentBookingData.addressLine2 : ''}, ${currentBookingData.city}`,
            smtpHost: appConfig.smtpHost,
            smtpPort: appConfig.smtpPort,
            smtpUser: appConfig.smtpUser,
            smtpPass: appConfig.smtpPass,
            senderEmail: appConfig.senderEmail,
        };

        const emailResult = await sendProviderBookingAssignmentEmail(emailInput);
        if (emailResult.success) {
            toast({ title: "Notification Sent", description: `Assignment email sent to ${providerName}.` });
        } else {
            toast({ title: "Email Error", description: emailResult.message || `Could not send assignment email to ${providerName}.`, variant: "destructive", duration: 7000 });
        }
        
        // Create Firestore Notification for Provider
        const providerNotification: FirestoreNotification = {
          userId: providerId,
          title: "New Job Assignment!",
          message: `You've been assigned Booking ID: ${currentBookingData.bookingId} for ${currentBookingData.services.map(s=>s.name).join(', ')} on ${formatDateForDisplay(currentBookingData.scheduledDate)}.`,
          type: 'booking_update',
          href: `/provider/booking/${bookingId}`,
          read: false,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), providerNotification);

        setIsAssignModalOpen(false);
        setBookingToAssign(null);
    } catch (error) {
        console.error("Error assigning provider or sending notification:", error);
        toast({ title: "Error", description: (error as Error).message || "Could not assign provider or send notification.", variant: "destructive" });
    } finally {
        setIsUpdatingStatus(null);
    }
  };

  const handleUnassignProvider = async (bookingId: string) => {
    if (!bookingId) {
      toast({ title: "Error", description: "Booking ID is missing for unassignment.", variant: "destructive" });
      return;
    }
    setIsUpdatingStatus(bookingId);
    const bookingDocRef = doc(db, "bookings", bookingId);
    try {
      await updateDoc(bookingDocRef, {
        providerId: deleteField(), 
        status: "Confirmed" as BookingStatus, 
        updatedAt: Timestamp.now(),
      });
      toast({ title: "Provider Unassigned", description: "Provider has been unassigned from the booking." });
    } catch (error) {
      console.error("Error unassigning provider:", error);
      toast({ title: "Error", description: "Could not unassign provider.", variant: "destructive" });
    } finally {
      setIsUpdatingStatus(null);
    }
  };
  
  const renderBookingCard = (booking: FirestoreBooking) => (
    <Card key={booking.id} className="mb-4 shadow-sm flex flex-col">
      <CardHeader className="p-4">
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="text-base font-bold break-all">{booking.bookingId}</CardTitle>
                <CardDescription className="text-xs">{booking.customerName}</CardDescription>
            </div>
            <Badge variant={getStatusBadgeVariant(booking.status)} className={`capitalize text-xs ${getStatusBadgeClass(booking.status)}`}>
                {isUpdatingStatus === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : booking.status}
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 text-sm space-y-2 flex-grow">
        <p><strong>Services:</strong> <span className="text-muted-foreground">{booking.services.map(s => `${s.name} (x${s.quantity})`).join(', ')}</span></p>
        <p><strong>Date & Time:</strong> <span className="text-muted-foreground">{formatDateForDisplay(booking.scheduledDate)} at {booking.scheduledTimeSlot}</span></p>
        <p><strong>Amount:</strong> <span className="font-semibold">₹{booking.totalAmount.toLocaleString()}</span></p>
        <div>
          <Select value={booking.status} onValueChange={(newStatus) => handleStatusChange(booking, newStatus as BookingStatus)} disabled={isUpdatingStatus === booking.id || isLoadingAppSettings}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Update Status"/>
              </SelectTrigger>
              <SelectContent>{statusOptions.map(status => (<SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>))}</SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter className="p-4 flex flex-col gap-2">
            <div className="flex w-full justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleViewDetails(booking)}><Eye className="h-4 w-4 mr-1"/> Details</Button>
                <Button variant="outline" size="sm" onClick={() => handleEditBooking(booking.id!)}><Edit className="h-4 w-4 mr-1"/> Edit</Button>
            </div>
             <div className="flex w-full justify-end gap-2 pt-2 border-t mt-2">
                 {booking.providerId ? (
                     <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                         <Button variant="outline" size="sm" className="text-xs h-9" disabled={isUpdatingStatus === booking.id || isLoadingAppSettings}>
                         <Users className="mr-1 h-3 w-3" /> Manage Provider
                         </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                         <DropdownMenuItem onClick={() => openAssignModal(booking.id!, booking.bookingId)}>
                         Reassign Provider
                         </DropdownMenuItem>
                         <AlertDialog>
                         <AlertDialogTrigger asChild>
                             <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                 Unassign Provider
                             </DropdownMenuItem>
                         </AlertDialogTrigger>
                         <AlertDialogContent>
                             <AlertDialogHeader>
                                 <AlertDialogTitle>Confirm Unassign</AlertDialogTitle>
                                 <AlertDialogDescription>
                                     Are you sure you want to unassign the provider from booking {booking.bookingId}?
                                 </AlertDialogDescription>
                             </AlertDialogHeader>
                             <AlertDialogFooter>
                                 <AlertDialogCancel>Cancel</AlertDialogCancel>
                                 <AlertDialogAction onClick={() => handleUnassignProvider(booking.id!)} className="bg-destructive hover:bg-destructive/90">
                                     Yes, Unassign
                                 </AlertDialogAction>
                             </AlertDialogFooter>
                         </AlertDialogContent>
                     </AlertDialog>
                     </DropdownMenuContent>
                     </DropdownMenu>
                 ) : (booking.status === "Confirmed" || booking.status === "Pending Payment" || booking.status === "Rescheduled") ? (
                     <Button variant="outline" size="sm" className="text-xs h-9" onClick={() => openAssignModal(booking.id!, booking.bookingId)} disabled={isUpdatingStatus === booking.id || isLoadingAppSettings || isAssignModalOpen}>
                     <UserCheck2 className="mr-1 h-3 w-3" /> Assign Provider
                     </Button>
                 ) : null}
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" className="h-9 w-9" title="Delete Booking" disabled={isDeleting === booking.id || !booking.id}>
                        {isDeleting === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        <span className="sr-only">Delete</span>
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescription>This will permanently delete the booking <span className="font-semibold">{booking.bookingId}</span>.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteBooking(booking.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
      </CardFooter>
    </Card>
  );


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Tag className="mr-2 h-6 w-6 text-primary" /> Manage Bookings
            </CardTitle>
            <CardDescription>
              View and manage all customer bookings. Update booking statuses and view details.
            </CardDescription>
          </div>
          <div className="mt-4 sm:mt-0 w-full sm:w-auto sm:min-w-[200px]">
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as BookingStatus | "All")}>
              <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent><SelectItem value="All">All Statuses</SelectItem>{statusOptions.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading || isLoadingAppSettings || isLoadingCompanySettings ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-2">Loading data...</p></div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-10"><PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">{filterStatus === "All" ? "No bookings found yet." : `No bookings found with status: ${filterStatus}.`}</p></div>
          ) : (
            <>
              {/* Desktop View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                <TableHeader><TableRow><TableHead className="whitespace-nowrap">Booking ID</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Services</TableHead><TableHead className="text-right whitespace-nowrap">Amount (₹)</TableHead><TableHead>Provider</TableHead><TableHead className="min-w-[150px]">Status</TableHead><TableHead className="text-right min-w-[150px]">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredBookings.map((booking) => (
                    <TableRow key={booking.id}>
                        <TableCell className="font-medium text-xs whitespace-nowrap">{booking.bookingId}</TableCell>
                        <TableCell><div>{booking.customerName}</div><div className="text-xs text-muted-foreground">{booking.customerEmail}</div></TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateForDisplay(booking.scheduledDate)}</TableCell>
                        <TableCell className="whitespace-nowrap">{booking.scheduledTimeSlot}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">{booking.services.map(s => s.name).join(', ')}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{booking.totalAmount.toLocaleString()}</TableCell>
                        <TableCell>
                        {booking.providerId ? (
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="text-xs h-7" disabled={isUpdatingStatus === booking.id || isLoadingAppSettings}>
                                <Users className="mr-1 h-3 w-3" /> Manage
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => openAssignModal(booking.id!, booking.bookingId)}>
                                Reassign Provider
                                </DropdownMenuItem>
                                <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                        Unassign Provider
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm Unassign</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Are you sure you want to unassign the provider from booking {booking.bookingId}?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleUnassignProvider(booking.id!)} className="bg-destructive hover:bg-destructive/90">
                                            Yes, Unassign
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (booking.status === "Confirmed" || booking.status === "Pending Payment" || booking.status === "Rescheduled") ? (
                            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openAssignModal(booking.id!, booking.bookingId)} disabled={isUpdatingStatus === booking.id || isLoadingAppSettings || isAssignModalOpen}>
                            <UserCheck2 className="mr-1 h-3 w-3" /> Assign
                            </Button>
                        ) : (<Badge variant="secondary" className="text-xs">N/A</Badge>)}
                        </TableCell>
                        <TableCell>
                        <Select value={booking.status} onValueChange={(newStatus) => handleStatusChange(booking, newStatus as BookingStatus)} disabled={isUpdatingStatus === booking.id || isLoadingAppSettings}>
                            <SelectTrigger className="h-8 text-xs min-w-[120px]">
                                <Badge variant={getStatusBadgeVariant(booking.status)} className={`capitalize w-full flex justify-center items-center ${getStatusBadgeClass(booking.status)}`}>
                                    {isUpdatingStatus === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : booking.status}
                                </Badge>
                            </SelectTrigger>
                            <SelectContent>{statusOptions.map(status => (<SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>))}</SelectContent>
                        </Select>
                        </TableCell>
                        <TableCell><div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleViewDetails(booking)} title="View Details"><Eye className="h-4 w-4" /><span className="sr-only">View Details</span></Button>
                            <Button variant="outline" size="icon" onClick={() => handleEditBooking(booking.id!)} title="Edit Booking" disabled={isDeleting === booking.id || !booking.id}><Edit className="h-4 w-4" /><span className="sr-only">Edit Booking</span></Button>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="icon" title="Delete Booking" disabled={isDeleting === booking.id || !booking.id}>{isDeleting === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}<span className="sr-only">Delete Booking</span></Button></AlertDialogTrigger>
                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete the booking <span className="font-semibold">{booking.bookingId}</span>.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteBooking(booking.id!)} className="bg-destructive hover:bg-destructive/90">Yes, delete booking</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                            </AlertDialog>
                        </div></TableCell>
                    </TableRow>
                    ))}</TableBody></Table>
              </div>
              
              {/* Mobile View */}
              <div className="md:hidden">
                {filteredBookings.map(renderBookingCard)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedBooking && (<Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}><DialogContent className="max-w-3xl w-[90vw] max-h-[90vh] flex flex-col p-0"><DialogHeader className="p-6 pb-4 border-b"><DialogTitle className="text-xl">Booking Details: {selectedBooking.bookingId}</DialogTitle><DialogDescription>Review complete information for this booking.</DialogDescription></DialogHeader><div className="overflow-y-auto flex-grow p-6"><BookingDetailsModalContent booking={selectedBooking} /></div><div className="p-6 border-t flex justify-end"><DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose></div></DialogContent></Dialog>)}
      <Dialog open={isPaymentMethodDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) { setSelectedBookingForPaymentUpdate(null); setPaymentReceivedMethodForDialog(""); } setIsPaymentMethodDialogOpen(isOpen); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Confirm Payment for Booking</DialogTitle><DialogDescription>Booking ID: <span className="font-semibold">{selectedBookingForPaymentUpdate?.bookingId}</span><br />Select the method used to receive payment. This will mark the booking as "Completed".</DialogDescription></DialogHeader><div className="py-4 space-y-3"><Label>Payment Received Via:</Label><RadioGroup value={paymentReceivedMethodForDialog} onValueChange={setPaymentReceivedMethodForDialog}>{receivedPaymentMethods.map(method => (<div key={method} className="flex items-center space-x-2"><RadioGroupItem value={method} id={`payment-method-${method.toLowerCase().replace(/\s+/g, '-')}`} /><Label htmlFor={`payment-method-${method.toLowerCase().replace(/\s+/g, '-')}`}>{method}</Label></div>))}</RadioGroup></div><DialogFooter className="mt-2"><Button variant="outline" onClick={() => { setIsPaymentMethodDialogOpen(false); setSelectedBookingForPaymentUpdate(null); setPaymentReceivedMethodForDialog(""); }}>Cancel</Button><Button onClick={handleConfirmPaymentAndUpdateStatus} disabled={!paymentReceivedMethodForDialog || isUpdatingStatus === selectedBookingForPaymentUpdate?.id || isLoadingAppSettings}>{(isUpdatingStatus === selectedBookingForPaymentUpdate?.id || isLoadingAppSettings) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm & Complete Booking</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isRescheduleDialogOpen} onOpenChange={(open) => { if (!open) { setSelectedBookingForReschedule(null); setRescheduleDate(undefined); setRescheduleSelectedTimeSlot(undefined); setRescheduleAvailableTimeSlots([]); } setIsRescheduleDialogOpen(open); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Reschedule Booking: {selectedBookingForReschedule?.bookingId}</DialogTitle><DialogDescription>Select a new date and time for this booking. Current: {selectedBookingForReschedule ? formatDateForDisplay(selectedBookingForReschedule.scheduledDate) : ''} at {selectedBookingForReschedule?.scheduledTimeSlot}.</DialogDescription></DialogHeader><div className="py-4 space-y-4"><div><Label htmlFor="reschedule-calendar" className="block mb-2 font-medium">New Date</Label><Calendar mode="single" selected={rescheduleDate} onSelect={handleRescheduleDateSelect} className="rounded-md border mx-auto" disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))} id="reschedule-calendar"/></div>{rescheduleDate && (<div><Label className="block mb-2 font-medium">Available Time Slots for {rescheduleDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Label>{isLoadingRescheduleSlots ? (<div className="flex items-center justify-center py-2"><Loader2 className="h-5 w-5 animate-spin mr-2"/> Fetching slots...</div>) : rescheduleAvailableTimeSlots.length > 0 ? (<RadioGroup value={rescheduleSelectedTimeSlot} onValueChange={setRescheduleSelectedTimeSlot} className="grid grid-cols-2 sm:grid-cols-3 gap-2">{rescheduleAvailableTimeSlots.map(slot => (<Label key={slot} htmlFor={`slot-${slot}`} className={`flex items-center justify-center space-x-2 border rounded-md p-2 hover:bg-accent/50 cursor-pointer ${rescheduleSelectedTimeSlot === slot ? 'bg-primary text-primary-foreground border-primary ring-1 ring-primary' : 'border-input bg-background'}`}><RadioGroupItem value={slot} id={`slot-${slot}`} className="border-muted-foreground data-[state=checked]:border-primary-foreground" /><span className="text-xs">{slot}</span></Label>))}</RadioGroup>) : (<p className="text-sm text-muted-foreground text-center py-2">No slots available for this date.</p>)}</div>)}</div><DialogFooter><Button variant="outline" onClick={() => setIsRescheduleDialogOpen(false)}>Cancel</Button><Button onClick={handleConfirmReschedule} disabled={!rescheduleDate || !rescheduleSelectedTimeSlot || isLoadingRescheduleSlots || isUpdatingStatus === selectedBookingForReschedule?.id}>{(isUpdatingStatus === selectedBookingForReschedule?.id || isLoadingRescheduleSlots) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Reschedule</Button></DialogFooter></DialogContent></Dialog>
      
      {bookingToAssign && (
        <AssignProviderModal
            isOpen={isAssignModalOpen}
            onClose={() => { setIsAssignModalOpen(false); setBookingToAssign(null); }}
            bookingId={bookingToAssign.id!}
            bookingHumanId={bookingToAssign.bookingId}
            onAssignConfirm={handleConfirmAssignment}
        />
      )}
    </div>
  );
}
