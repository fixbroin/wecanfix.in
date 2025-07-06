"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, DollarSign, PackageSearch } from "lucide-react";
import type { FirestoreBooking } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collectionGroup, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return dateString; }
};

export default function ProviderEarningsPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [completedBookings, setCompletedBookings] = useState<FirestoreBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!providerUser || authIsLoading) {
      if (!authIsLoading && !providerUser) setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const bookingsColGroupRef = collectionGroup(db, "bookings");
    const q = query(
      bookingsColGroupRef, 
      where("providerId", "==", providerUser.uid),
      where("status", "==", "Completed"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCompletedBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreBooking)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching completed bookings for earnings:", error);
      toast({ title: "Error", description: "Could not fetch earnings data.", variant: "destructive" });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [providerUser, authIsLoading, toast]);

  const totalEarnings = useMemo(() => {
    return completedBookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
  }, [completedBookings]);

  // For now, assuming all completed are "paid" and "pending" is 0 as there's no settlement system.
  const paidEarnings = totalEarnings;
  const pendingEarnings = 0;

  if (authIsLoading || isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><DollarSign className="mr-2 h-6 w-6 text-primary"/>My Earnings</CardTitle>
          <CardDescription>Overview of your earnings from completed jobs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Card className="bg-primary/10 border-primary/30">
            <CardHeader><CardTitle className="text-lg text-primary">Total Earnings</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{totalEarnings.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/30">
            <CardHeader><CardTitle className="text-lg text-green-600">Paid / Settled</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{paidEarnings.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardHeader><CardTitle className="text-lg text-yellow-600">Pending Payment</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{pendingEarnings.toFixed(2)}</p><p className="text-xs text-muted-foreground">(Settlement system TBD)</p></CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Completed Jobs Log</CardTitle></CardHeader>
        <CardContent>
          {completedBookings.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No completed jobs found to display earnings from.</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Booking ID</TableHead><TableHead>Service</TableHead><TableHead>Completion Date</TableHead><TableHead className="text-right">Amount (₹)</TableHead></TableRow></TableHeader>
              <TableBody>
                {completedBookings.map(job => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium text-xs">{job.bookingId}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{job.services.map(s => s.name).join(', ')}</TableCell>
                    <TableCell className="text-sm">{job.updatedAt ? formatDateForDisplay(job.updatedAt.toDate().toISOString()) : formatDateForDisplay(job.createdAt.toDate().toISOString())}</TableCell>
                    <TableCell className="text-right font-medium">₹{job.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

