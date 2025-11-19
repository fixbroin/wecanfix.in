
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, MapPin, Phone, Mail, CalendarDays, Clock, UserCircle, ExternalLink, ListOrdered, AlertTriangle, DollarSign } from 'lucide-react';
import type { FirestoreBooking } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLoading } from '@/contexts/LoadingContext';

const formatTimestampForDisplay = (timestamp?: Timestamp): string => {
  if (!timestamp) return 'N/A';
  return timestamp.toDate().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return dateString; }
};


export default function ProviderBookingDetailsPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;
  const router = useRouter();
  const { toast } = useToast();
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { showLoading } = useLoading();

  const [booking, setBooking] = useState<FirestoreBooking | null>(null);
  const [isLoadingBooking, setIsLoadingBooking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !providerUser) {
      if(!authIsLoading && !providerUser) router.push('/auth/login');
      setIsLoadingBooking(false);
      return;
    }

    setIsLoadingBooking(true);
    const bookingDocRef = doc(db, "bookings", bookingId);

    const unsubscribe = onSnapshot(bookingDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreBooking;
        if (data.providerId === providerUser.uid) {
          setBooking({ ...data, id: docSnap.id });
          setError(null);
        } else {
          setError("You are not authorized to view this booking.");
          setBooking(null);
          toast({ title: "Access Denied", description: "This booking is not assigned to you.", variant: "destructive" });
        }
      } else {
        setError("Booking not found.");
        setBooking(null);
        toast({ title: "Not Found", description: `Booking with ID ${bookingId} not found.`, variant: "destructive" });
      }
      setIsLoadingBooking(false);
    }, (err) => {
      console.error("Error fetching booking details:", err);
      setError("Failed to load booking details.");
      setIsLoadingBooking(false);
      toast({ title: "Error", description: "Could not fetch booking details.", variant: "destructive" });
    });

    return () => unsubscribe();

  }, [bookingId, providerUser, authIsLoading, router, toast]);
  
  const handleViewOnMap = () => {
    if (booking?.latitude && booking?.longitude) {
      const url = `https://www.google.com/maps?q=${booking.latitude},${booking.longitude}`;
      window.open(url, '_blank');
    }
  };
  
  const handleNavigateBack = () => {
    showLoading();
    router.back();
  }


  if (isLoadingBooking || authIsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-3 text-muted-foreground">Loading booking details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error</h2>
        <p className="text-destructive-foreground bg-destructive/10 p-3 rounded-md">{error}</p>
        <Button onClick={handleNavigateBack} className="mt-6" variant="outline">Go Back</Button>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="text-center py-10">
        <ListOrdered className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Booking Not Found</h2>
        <p className="text-muted-foreground">The requested booking could not be loaded.</p>
        <Button onClick={handleNavigateBack} className="mt-6" variant="outline">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Button onClick={handleNavigateBack} variant="outline" size="sm" className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-2xl font-headline">Booking Details</CardTitle>
            <Badge variant={
              booking.status === 'Completed' ? 'default' :
              booking.status === 'ProviderAccepted' || booking.status === 'InProgressByProvider' ? 'default' :
              booking.status === 'AssignedToProvider' ? 'secondary' :
              'outline'
            } className={`capitalize text-sm ${
              booking.status === 'ProviderAccepted' || booking.status === 'InProgressByProvider' ? 'bg-blue-500 text-white' :
              booking.status === 'Completed' ? 'bg-green-500 text-white' : ''
            }`}>
              {booking.status.replace(/([A-Z])/g, ' $1').replace('Provider ','')}
            </Badge>
          </div>
          <CardDescription>ID: {booking.bookingId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center"><UserCircle className="mr-2 text-primary"/>Customer Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p><strong>Name:</strong> {booking.customerName}</p>
              <p className="flex items-center gap-1"><strong>Email:</strong> {booking.customerEmail || 'N/A'}</p>
              <p className="flex items-center gap-1"><strong>Phone:</strong> {booking.customerPhone}</p>
            </div>
          </section>
          <Separator />
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center"><MapPin className="mr-2 text-primary"/>Service Address</h3>
            <div className="text-sm space-y-0.5">
              <p>{booking.addressLine1}</p>
              {booking.addressLine2 && <p>{booking.addressLine2}</p>}
              <p>{booking.city}, {booking.state} - {booking.pincode}</p>
            </div>
            {booking.latitude && booking.longitude && (
                <Button variant="link" size="sm" onClick={handleViewOnMap} className="px-0 text-xs mt-1">
                    View on Google Maps <ExternalLink className="ml-1 h-3 w-3"/>
                </Button>
            )}
          </section>
          <Separator />
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center"><CalendarDays className="mr-2 text-primary"/>Schedule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p><strong>Date:</strong> {formatDateForDisplay(booking.scheduledDate)}</p>
              <p><strong>Time Slot:</strong> {booking.scheduledTimeSlot}</p>
            </div>
          </section>
          <Separator />
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center"><ListOrdered className="mr-2 text-primary"/>Services Booked</h3>
            <ul className="space-y-1 text-sm list-disc list-inside">
              {booking.services.map(service => (
                <li key={service.serviceId}>{service.name} (Qty: {service.quantity}) - ₹{service.pricePerUnit.toFixed(2)} each</li>
              ))}
            </ul>
          </section>
          <Separator/>
           <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center"><DollarSign className="mr-2 text-primary"/>Payment Details</h3>
             <div className="text-sm space-y-1">
                <p><strong>Subtotal:</strong> ₹{booking.subTotal.toFixed(2)}</p>
                {booking.discountAmount && booking.discountAmount > 0 && <p><strong>Discount:</strong> - ₹{booking.discountAmount.toFixed(2)} ({booking.discountCode})</p>}
                {booking.visitingCharge && booking.visitingCharge > 0 && <p><strong>Visiting Charge:</strong> + ₹{booking.visitingCharge.toFixed(2)}</p>}
                {/* TODO: Display platform fees if any */}
                <p><strong>Tax:</strong> + ₹{booking.taxAmount.toFixed(2)}</p>
                <p className="font-bold"><strong>Total Amount:</strong> ₹{booking.totalAmount.toFixed(2)}</p>
                <p><strong>Payment Method:</strong> {booking.paymentMethod}</p>
             </div>
           </section>

          {booking.notes && (
            <>
              <Separator />
              <section>
                <h3 className="text-lg font-semibold mb-2">Customer Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.notes}</p>
              </section>
            </>
          )}
           <Separator />
           <div className="text-xs text-muted-foreground">
             <p>Booked On: {formatTimestampForDisplay(booking.createdAt)}</p>
             {booking.updatedAt && <p>Last Updated: {formatTimestampForDisplay(booking.updatedAt)}</p>}
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
