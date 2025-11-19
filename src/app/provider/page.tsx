
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle, Clock, Loader2, PackageSearch, ExternalLink, ShoppingBag, XCircle, PlayCircle, Tag } from "lucide-react";
import type { FirestoreBooking, BookingStatus } from '@/types/firestore';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp, collectionGroup } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useLoading } from '@/contexts/LoadingContext';
import Image from 'next/image';

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return dateString; }
};

const ProviderJobCard: React.FC<{
  job: FirestoreBooking;
  type: 'new' | 'ongoing' | 'completed';
  onAccept?: (bookingId: string) => void;
  onReject?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onCompleteWork?: (bookingId: string) => void;
  isProcessingAction?: boolean;
}> = ({ job, type, onAccept, onReject, onStartWork, onCompleteWork, isProcessingAction }) => {
  const { showLoading } = useLoading();
  const isJobCompleted = job.status === 'Completed';

  const handleViewDetailsClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isJobCompleted) {
      e.preventDefault(); // Prevent navigation if completed
      return;
    }
    showLoading();
    // Link component will handle navigation
  };

  const getStatusVariant = (status: FirestoreBooking['status']) => {
    if (status === 'ProviderAccepted' || status === 'InProgressByProvider') return 'default';
    if (status === 'Completed') return 'default'; // success style
    if (status === 'AssignedToProvider') return 'secondary';
    return 'outline';
  };

  const getStatusClasses = (status: FirestoreBooking['status']) => {
    if (status === 'ProviderAccepted' || status === 'InProgressByProvider') return 'bg-blue-500 text-white hover:bg-blue-600';
    if (status === 'Completed') return 'bg-green-500 text-white hover:bg-green-600';
    return '';
  };

  const handleWhatsAppClick = (e: React.MouseEvent, mobileNumber: string) => {
    e.stopPropagation(); // Prevent card click or other parent events
    // Remove any non-digit characters except for a leading '+'
    const sanitizedPhone = mobileNumber.replace(/[^\d+]/g, '');
    // Ensure it starts with the country code if it doesn't already, assuming Indian numbers if no +
    const internationalPhone = sanitizedPhone.startsWith('+') ? sanitizedPhone : `91${sanitizedPhone}`;
    const intentUrl = `intent://send/?phone=${internationalPhone}&text=Hi#Intent;scheme=whatsapp;end`;
    window.location.href = intentUrl;
  };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{job.services.map(s => s.name).join(', ')}</CardTitle>
           <Badge variant={getStatusVariant(job.status)} className={`capitalize text-xs ${getStatusClasses(job.status)}`}>
            {job.status.replace(/([A-Z])/g, ' $1').replace('Provider ', '')}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          ID: {job.bookingId} | Customer: {isJobCompleted ? "[Hidden for Privacy]" : job.customerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p><strong>Date:</strong> {formatDateForDisplay(job.scheduledDate)} at {job.scheduledTimeSlot}</p>
        <p><strong>Address:</strong> {isJobCompleted ? "[Hidden for Privacy]" : `${job.addressLine1}${job.addressLine2 ? `, ${job.addressLine2}` : ''}, ${job.city}`}</p>
        <div className="flex items-center gap-2">
            <strong>Contact:</strong>
            {isJobCompleted ? (
              <span>[Hidden for Privacy]</span>
            ) : (
              <>
                <span>{job.customerPhone}</span>
                {job.customerPhone && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => handleWhatsAppClick(e, job.customerPhone!)}
                    title="Chat on WhatsApp"
                  >
                    <Image src="/whatsapp.png" alt="WhatsApp Icon" width={18} height={18} />
                    <span className="sr-only">Chat on WhatsApp</span>
                  </Button>
                )}
              </>
            )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-3">
        <Link href={`/provider/booking/${job.id}`} passHref legacyBehavior>
          <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" asChild disabled={isJobCompleted}>
             <a onClick={handleViewDetailsClick} aria-disabled={isJobCompleted}>
                <ExternalLink className="mr-1 h-3.5 w-3.5"/>View Details
             </a>
          </Button>
        </Link>
        {type === 'new' && onAccept && onReject && (
          <>
            <Button size="sm" onClick={() => onReject(job.id!)} variant="destructive" disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <XCircle className="mr-1 h-3.5 w-3.5"/> Reject
            </Button>
            <Button size="sm" onClick={() => onAccept(job.id!)} disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <CheckCircle className="mr-1 h-3.5 w-3.5"/> Accept
            </Button>
          </>
        )}
        {type === 'ongoing' && job.status === 'ProviderAccepted' && onStartWork && (
          <Button size="sm" onClick={() => onStartWork(job.id!)} disabled={isProcessingAction} className="w-full text-xs">
            {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <PlayCircle className="mr-1 h-3.5 w-3.5"/> Start Work
          </Button>
        )}
        {type === 'ongoing' && job.status === 'InProgressByProvider' && onCompleteWork && (
          <Button size="sm" onClick={() => onCompleteWork(job.id!)} disabled={isProcessingAction} className="w-full text-xs bg-green-600 hover:bg-green-700">
            {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <CheckCircle className="mr-1 h-3.5 w-3.5"/> Mark Complete
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default function ProviderDashboardPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<FirestoreBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [processingBookingAction, setProcessingBookingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!providerUser || authIsLoading) {
      if (!authIsLoading && !providerUser) setIsLoadingBookings(false);
      return;
    }
    setIsLoadingBookings(true);
    const bookingsColGroupRef = collectionGroup(db, "bookings");
    const q = query(bookingsColGroupRef, where("providerId", "==", providerUser.uid), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreBooking)));
      setIsLoadingBookings(false);
    }, (error) => {
      console.error("Error fetching provider bookings:", error);
      toast({ title: "Error", description: "Could not fetch your assigned jobs.", variant: "destructive" });
      setIsLoadingBookings(false);
    });
    return () => unsubscribe();
  }, [providerUser, authIsLoading, toast]);

  const updateBookingStatus = async (bookingId: string, newStatus: BookingStatus) => {
    setProcessingBookingAction(bookingId);
    try {
      const bookingDocRef = doc(db, "bookings", bookingId); 
      await updateDoc(bookingDocRef, { status: newStatus, updatedAt: Timestamp.now() });
      toast({ title: "Success", description: `Job status updated to ${newStatus.replace(/([A-Z])/g, ' $1')}.` });
    } catch (error) {
      console.error("Error updating booking status:", error);
      toast({ title: "Error", description: "Could not update job status.", variant: "destructive" });
    } finally {
      setProcessingBookingAction(null);
    }
  };

  const newJobRequests = useMemo(() => bookings.filter(b => b.status === 'AssignedToProvider'), [bookings]);
  const ongoingJobs = useMemo(() => bookings.filter(b => b.status === 'ProviderAccepted' || b.status === 'InProgressByProvider'), [bookings]);
  const completedJobs = useMemo(() => bookings.filter(b => b.status === 'Completed'), [bookings]);

  if (authIsLoading || isLoadingBookings) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">My Dashboard</h1>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center"><Tag className="mr-2 text-primary"/>New Job Requests ({newJobRequests.length})</h2>
        {newJobRequests.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {newJobRequests.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="new"
                onAccept={(id) => updateBookingStatus(id, 'ProviderAccepted')}
                onReject={(id) => updateBookingStatus(id, 'ProviderRejected')}
                isProcessingAction={processingBookingAction === job.id}
              />
            ))}
          </div>
        ) : (<p className="text-muted-foreground">No new job requests assigned to you.</p>)}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center"><Clock className="mr-2 text-blue-500"/>Ongoing Jobs ({ongoingJobs.length})</h2>
         {ongoingJobs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ongoingJobs.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="ongoing"
                onStartWork={(id) => updateBookingStatus(id, 'InProgressByProvider')}
                onCompleteWork={(id) => updateBookingStatus(id, 'Completed')}
                isProcessingAction={processingBookingAction === job.id}
              />
            ))}
          </div>
        ) : (<p className="text-muted-foreground">You have no ongoing jobs.</p>)}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center"><CheckCircle className="mr-2 text-green-500"/>Completed Jobs ({completedJobs.length})</h2>
        {completedJobs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedJobs.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="completed" />
            ))}
          </div>
        ) : (<p className="text-muted-foreground">No completed jobs yet.</p>)}
      </section>
    </div>
  );
}
