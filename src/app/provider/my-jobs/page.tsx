
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PackageSearch, Briefcase } from "lucide-react";
import type { FirestoreBooking, BookingStatus } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collectionGroup, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import ProviderJobCard from '@/components/provider/ProviderJobCard'; // Re-use ProviderJobCard

export default function ProviderMyJobsPage() {
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
      console.error("Error fetching provider jobs:", error);
      toast({ title: "Error", description: "Could not fetch your jobs.", variant: "destructive" });
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
      console.error("Error updating job status:", error);
      toast({ title: "Error", description: "Could not update job status.", variant: "destructive" });
    } finally {
      setProcessingBookingAction(null);
    }
  };

  const newJobRequests = useMemo(() => bookings.filter(b => b.status === 'AssignedToProvider'), [bookings]);
  const ongoingJobs = useMemo(() => bookings.filter(b => b.status === 'ProviderAccepted' || b.status === 'InProgressByProvider'), [bookings]);
  const completedJobs = useMemo(() => bookings.filter(b => b.status === 'Completed'), [bookings]);
  const otherJobs = useMemo(() => bookings.filter(b => b.status === 'ProviderRejected' || b.status === 'Cancelled' || b.status === 'Rescheduled' || b.status === 'Pending Payment' || b.status === 'Processing' /* Add any other admin-managed statuses */), [bookings]);


  if (authIsLoading || isLoadingBookings) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle className="text-2xl flex items-center"><Briefcase className="mr-2 h-6 w-6 text-primary"/>My Jobs</CardTitle>
            <CardDescription>View and manage all jobs assigned to you.</CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="new" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="new">New Requests ({newJobRequests.length})</TabsTrigger>
          <TabsTrigger value="ongoing">Ongoing ({ongoingJobs.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedJobs.length})</TabsTrigger>
          <TabsTrigger value="other">Other Statuses ({otherJobs.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="new">
          {newJobRequests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {newJobRequests.map(job => (
                <ProviderJobCard key={job.id} job={job} type="new"
                  onAccept={(id) => updateBookingStatus(id, 'ProviderAccepted')}
                  onReject={(id) => updateBookingStatus(id, 'ProviderRejected')}
                  isProcessingAction={processingBookingAction === job.id}
                />
              ))}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No new job requests.</p>}
        </TabsContent>

        <TabsContent value="ongoing">
           {ongoingJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {ongoingJobs.map(job => (
                <ProviderJobCard key={job.id} job={job} type="ongoing"
                  onStartWork={(id) => updateBookingStatus(id, 'InProgressByProvider')}
                  onCompleteWork={(id) => updateBookingStatus(id, 'Completed')}
                  isProcessingAction={processingBookingAction === job.id}
                />
              ))}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No ongoing jobs.</p>}
        </TabsContent>

        <TabsContent value="completed">
          {completedJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {completedJobs.map(job => <ProviderJobCard key={job.id} job={job} type="completed" />)}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No completed jobs yet.</p>}
        </TabsContent>
        
        <TabsContent value="other">
          {otherJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {otherJobs.map(job => <ProviderJobCard key={job.id} job={job} type="completed" /> /* Using completed type as actions are mostly disabled */)}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No jobs with other statuses.</p>}
        </TabsContent>

      </Tabs>
    </div>
  );
}
