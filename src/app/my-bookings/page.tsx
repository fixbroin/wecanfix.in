
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ListOrdered, PackageSearch, ArrowLeft, Loader2, Eye, Trash2, Download, Ban } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp } from "firebase/firestore";
import type { FirestoreBooking, BookingStatus, GlobalWebSettings } from "@/types/firestore"; 
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { generateInvoicePdf } from '@/lib/InvoicePdfForDownload'; 
import { useGlobalSettings } from "@/hooks/useGlobalSettings"; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useRouter } from "next/navigation";
import { useLoading } from '@/contexts/LoadingContext';

const formatBookingTimestamp = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        // Assuming dateString is YYYY-MM-DD or easily parsable by new Date()
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateString; // Fallback to original string if parsing fails
    }
};

const parseSlotToHHMM = (slot: string): { hours: number; minutes: number } | null => {
    const timeMatch = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) return null;
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const period = timeMatch[3].toUpperCase();

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0; 
    return { hours, minutes };
};


export default function MyBookingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [myBookings, setMyBookings] = useState<FirestoreBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);
  
  const { settings: globalCompanySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const router = useRouter();
  const { showLoading } = useLoading();

  const [showCancellationDialog, setShowCancellationDialog] = useState(false);
  const [cancellationDialogContent, setCancellationDialogContent] = useState<{ title: string; description: React.ReactNode; actionText?: string; onAction?: () => void; showPayButton?: boolean; feeAmount?: number, feeType?: 'fixed' | 'percentage' } | null>(null);
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState<FirestoreBooking | null>(null);


  useEffect(() => {
    if (!user || authLoading) {
      if (!authLoading && !user) setIsLoadingBookings(false);
      return;
    }

    setIsLoadingBookings(true);
    const bookingsCollectionRef = collection(db, "bookings");
    const q = query(
      bookingsCollectionRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedBookings = querySnapshot.docs.map(docSnap => ({ 
        ...docSnap.data(),
        id: docSnap.id, 
      } as FirestoreBooking));
      setMyBookings(fetchedBookings);
      setIsLoadingBookings(false);
    }, (error) => {
      console.error("Error fetching user bookings: ", error);
      toast({ title: "Error", description: "Could not fetch your bookings.", variant: "destructive" });
      setIsLoadingBookings(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, toast]);


  const calculateCancellationEligibility = (booking: FirestoreBooking) => {
    if (!appConfig.enableCancellationPolicy) {
      return { eligibleForFree: true, message: "Cancellation policy is currently disabled. Free cancellation allowed.", fee: 0, feeType: 'fixed' as 'fixed' | 'percentage' };
    }

    // Assuming booking.scheduledDate is YYYY-MM-DD from Firestore
    const [year, month, day] = booking.scheduledDate.split('-').map(Number);
    const serviceDate = new Date(year, month - 1, day); // Month is 0-indexed

    const slotTime = booking.scheduledTimeSlot;
    
    const timeParts = parseSlotToHHMM(slotTime);
    if (!timeParts) {
      console.error("Invalid time slot format:", slotTime);
      return { eligibleForFree: false, message: "Could not parse service time. Please contact support.", fee: appConfig.cancellationFeeValue || 0, feeType: appConfig.cancellationFeeType || 'fixed' };
    }

    const serviceStartTime = new Date(serviceDate);
    serviceStartTime.setHours(timeParts.hours, timeParts.minutes, 0, 0);

    const now = new Date();
    const diffMs = serviceStartTime.getTime() - now.getTime();

    if (diffMs <= 0) { 
      return { eligibleForFree: false, message: "Service time has already passed or is too soon to cancel.", fee: appConfig.cancellationFeeValue || 0, feeType: appConfig.cancellationFeeType || 'fixed' };
    }

    const freeWindowDays = appConfig.freeCancellationDays || 0;
    const freeWindowHours = appConfig.freeCancellationHours || 0;
    const freeWindowMinutes = appConfig.freeCancellationMinutes || 0;
    const totalFreeWindowMs = ((freeWindowDays * 24 * 60) + (freeWindowHours * 60) + freeWindowMinutes) * 60 * 1000;

    const fee = appConfig.cancellationFeeValue || 0;
    const feeType = appConfig.cancellationFeeType || 'fixed';

    if (diffMs >= totalFreeWindowMs) {
      let windowMessage = "";
      if (freeWindowDays > 0) windowMessage += `${freeWindowDays} day(s) `;
      if (freeWindowHours > 0) windowMessage += `${freeWindowHours} hour(s) `;
      if (freeWindowMinutes > 0) windowMessage += `${freeWindowMinutes} minute(s) `;
      if (windowMessage.trim() === "") windowMessage = "the configured window";
      else windowMessage = windowMessage.trim();
      
      return { eligibleForFree: true, message: `You are eligible for free cancellation as you are cancelling ${windowMessage} before the service.`, fee: 0, feeType };
    } else {
      return { eligibleForFree: false, message: "You are outside the free cancellation window.", fee, feeType };
    }
  };

  const openCancellationDialog = (booking: FirestoreBooking) => {
    setSelectedBookingForCancel(booking);
    const eligibility = calculateCancellationEligibility(booking);
    let feeAmount = 0;
    let feeDisplay = "";

    if (!eligibility.eligibleForFree) {
        if (eligibility.feeType === 'percentage') {
            feeAmount = (booking.totalAmount * eligibility.fee) / 100;
            feeDisplay = `${eligibility.fee}% (₹${feeAmount.toFixed(2)})`;
        } else {
            feeAmount = eligibility.fee;
            feeDisplay = `₹${feeAmount.toFixed(2)}`;
        }
    }
    
    const proceedWithCancellation = async () => {
        if (!booking.id) return;
        setIsCancelling(booking.id);
        const bookingDocRef = doc(db, "bookings", booking.id);
        try {
            await updateDoc(bookingDocRef, { status: "Cancelled" as BookingStatus, updatedAt: Timestamp.now() });
            toast({ title: "Booking Cancelled", description: "Your booking has been successfully cancelled." });
        } catch (error) {
            toast({ title: "Error", description: "Could not cancel booking.", variant: "destructive" });
        } finally {
            setIsCancelling(null);
            setShowCancellationDialog(false);
        }
    };
    
    const proceedToPayCancellationFee = () => {
        if (!booking.id) return;
        showLoading();
        localStorage.setItem('bookingIdForCancellationFee', booking.id); 
        localStorage.setItem('cancellationFeeAmount', feeAmount.toFixed(2));
        router.push(`/checkout/payment?reason=cancellation_fee&booking_id=${booking.bookingId}`);
        setShowCancellationDialog(false);
    };


    if (eligibility.eligibleForFree) {
      setCancellationDialogContent({
        title: "Confirm Free Cancellation",
        description: <p>{eligibility.message}</p>,
        actionText: "Confirm Cancellation",
        onAction: proceedWithCancellation,
      });
    } else { 
      if (booking.paymentMethod === 'Pay After Service' || booking.paymentMethod === 'Cash on Delivery' || booking.status === 'Pending Payment') {
        setCancellationDialogContent({
          title: "Cancellation Fee Applies",
          description: (
            <>
              <p>{eligibility.message} A cancellation fee of <strong>{feeDisplay}</strong> will apply.</p>
              <p className="mt-2 font-semibold">You must pay the cancellation fee to proceed with cancellation.</p>
            </>
          ),
          actionText: "Pay Cancellation Fee",
          onAction: proceedToPayCancellationFee,
        });
      } else { // Paid online
        setCancellationDialogContent({
          title: "Confirm Cancellation with Fee",
          description: (
            <>
              <p>{eligibility.message} A cancellation fee of <strong>{feeDisplay}</strong> will be deducted.</p>
              <p className="mt-2">The remaining amount will be refunded to your original payment method (refunds may take 5-7 business days).</p>
            </>
          ),
          actionText: "Confirm & Accept Fee",
          onAction: proceedWithCancellation,
        });
      }
    }
    setShowCancellationDialog(true);
  };


  const canBeCancelledByRule = (status: BookingStatus) => {
    return status === "Pending Payment" || status === "Confirmed" || status === "Rescheduled";
  };

  const handleDownloadInvoice = async (booking: FirestoreBooking) => {
    if (!booking.id) {
      toast({ title: "Error", description: "Booking data is incomplete for invoice.", variant: "destructive"});
      return;
    }
    setIsDownloadingInvoice(booking.id);
    try {
      const companyDetailsForInvoice = {
        name: globalCompanySettings?.websiteName || "FixBro.in",
        address: globalCompanySettings?.address || "#44 G S Palya Road Konappana Agrahara Electronic City Phase 2 -560100",
        contactEmail: globalCompanySettings?.contactEmail || "support@fixbro.in",
        contactMobile: globalCompanySettings?.contactMobile || "+91-7353113455",
        logoUrl: globalCompanySettings?.logoUrl || undefined,
      };
      await generateInvoicePdf(booking, companyDetailsForInvoice);
    } catch (error) {
      console.error("Error generating invoice:", error);
      toast({ title: "Invoice Error", description: "Could not generate the invoice PDF.", variant: "destructive"});
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  if (authLoading || isLoadingBookings || isLoadingCompanySettings || isLoadingAppSettings) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <p className="mt-2 text-muted-foreground">Loading your bookings...</p>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-headline font-semibold text-foreground">
            My Bookings
          </h1>
          <Link href="/" passHref>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>

        {myBookings.length === 0 ? (
          <div className="text-center py-12">
            <PackageSearch className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No Bookings Yet</h2>
            <p className="text-muted-foreground mb-6">You haven't made any bookings with FixBro.</p>
            <Link href="/categories" passHref>
              <Button>Book a Service</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {myBookings.map((booking) => (
              <Card key={booking.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                    <CardTitle className="text-xl font-headline mb-2 sm:mb-0">
                      {booking.services.map(s => s.name).join(', ')}
                    </CardTitle>
                    <span
                      className={`px-3 py-1 text-xs font-semibold rounded-full
                        ${booking.status === "Confirmed" ? "bg-green-100 text-green-700" :
                          booking.status === "Completed" ? "bg-blue-100 text-blue-700" :
                          booking.status === "Pending Payment" ? "bg-yellow-100 text-yellow-700" :
                          booking.status === "Cancelled" ? "bg-red-100 text-red-700" :
                          booking.status === "Processing" ? "bg-purple-100 text-purple-700" :
                          "bg-gray-100 text-gray-700"}`}
                    >
                      {booking.status}
                    </span>
                  </div>
                  <CardDescription>Booking ID: {booking.bookingId}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Scheduled Date</p>
                    <p className="font-medium">{formatDateForDisplay(booking.scheduledDate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Time Slot</p>
                    <p className="font-medium">{booking.scheduledTimeSlot}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Amount</p>
                    <p className="font-medium">₹{booking.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="sm:col-span-2 md:col-span-3">
                    <p className="text-muted-foreground">Booked On</p>
                    <p className="font-medium">{formatBookingTimestamp(booking.createdAt)}</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-2">
                 
                  {booking.status === "Completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => handleDownloadInvoice(booking)}
                      disabled={isDownloadingInvoice === booking.id}
                    >
                      {isDownloadingInvoice === booking.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                      Download Invoice
                    </Button>
                  )}
                  {canBeCancelledByRule(booking.status) && (
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        className="w-full sm:w-auto"
                        onClick={() => openCancellationDialog(booking)}
                        disabled={isCancelling === booking.id}
                    >
                        {isCancelling === booking.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />}
                        Cancel Booking
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
      {cancellationDialogContent && (
        <AlertDialog open={showCancellationDialog} onOpenChange={setShowCancellationDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{cancellationDialogContent.title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>{cancellationDialogContent.description}</div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setShowCancellationDialog(false); setSelectedBookingForCancel(null);}}>No</AlertDialogCancel>
              {cancellationDialogContent.onAction && (
                <AlertDialogAction onClick={cancellationDialogContent.onAction} className={cancellationDialogContent.title.toLowerCase().includes("fee") && !cancellationDialogContent.title.toLowerCase().includes("free") ? "bg-destructive hover:bg-destructive/90" : ""}>
                  {cancellationDialogContent.actionText || "Confirm"}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </ProtectedRoute>
  );
}

