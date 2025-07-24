
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, DollarSign, PackageSearch } from "lucide-react";
import type { FirestoreBooking, ProviderFeeType, Timestamp } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collectionGroup, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const formatDateForDisplay = (timestamp?: any): string => {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Invalid Date';
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e2) {
            return 'Invalid Date';
        }
    }
};


const calculateProviderFee = (bookingAmount: number, feeType?: ProviderFeeType, feeValue?: number): number => {
    if (!feeType || !feeValue || feeValue <= 0) {
        return 0;
    }
    if (feeType === 'fixed') {
        return feeValue;
    }
    if (feeType === 'percentage') {
        return (bookingAmount * feeValue) / 100;
    }
    return 0;
};

export default function ProviderEarningsPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
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

  const earningsData = useMemo(() => {
    const totalGrossEarnings = completedBookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
    const totalDeductions = completedBookings.reduce((sum, booking) => {
        const fee = calculateProviderFee(booking.totalAmount, appConfig.providerFeeType, appConfig.providerFeeValue);
        return sum + fee;
    }, 0);
    const totalNetEarnings = totalGrossEarnings - totalDeductions;
    
    return {
        totalGrossEarnings,
        totalDeductions,
        totalNetEarnings,
        paidEarnings: totalNetEarnings, // Assuming all completed are "paid" for now
        pendingEarnings: 0,
    };
  }, [completedBookings, appConfig]);

  if (authIsLoading || isLoading || isLoadingAppConfig) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><DollarSign className="mr-2 h-6 w-6 text-primary"/>My Earnings</CardTitle>
          <CardDescription>Overview of your earnings from completed jobs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-primary/10 border-primary/30">
            <CardHeader><CardTitle className="text-lg text-primary">Total Gross Earnings</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.totalGrossEarnings.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardHeader><CardTitle className="text-lg text-destructive">Total Deductions</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.totalDeductions.toFixed(2)}</p></CardContent>
          </Card>
           <Card className="bg-green-500/10 border-green-500/30">
            <CardHeader><CardTitle className="text-lg text-green-600">Net Earnings (Paid)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.paidEarnings.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardHeader><CardTitle className="text-lg text-yellow-600">Pending Settlement</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.pendingEarnings.toFixed(2)}</p><p className="text-xs text-muted-foreground">(Settlement system TBD)</p></CardContent>
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
            <div className="space-y-4">
              {/* Desktop Header */}
              <div className="hidden sm:grid sm:grid-cols-6 gap-4 px-4 py-2 border-b font-medium text-muted-foreground text-sm">
                <div className="col-span-2">Service</div>
                <div className="text-center">Completion Date</div>
                <div className="text-right">Gross (₹)</div>
                <div className="text-right">Fee (₹)</div>
                <div className="text-right">Net (₹)</div>
              </div>
              {/* Job Entries */}
              {completedBookings.map(job => {
                const fee = calculateProviderFee(job.totalAmount, appConfig.providerFeeType, appConfig.providerFeeValue);
                const netEarning = job.totalAmount - fee;
                return (
                  <div key={job.id} className="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    
                    {/* Column 1 & 2: Service Info */}
                    <div className="sm:col-span-2">
                        <p className="text-xs font-semibold sm:hidden text-muted-foreground">Service</p>
                        <p className="font-medium text-foreground break-all">{job.services.map(s => s.name).join(', ')}</p>
                        <p className="text-xs text-muted-foreground break-all">ID: {job.bookingId}</p>
                    </div>

                    {/* Column 3: Completion Date */}
                    <div className="sm:text-center">
                        <p className="text-xs font-semibold sm:hidden text-muted-foreground">Completion Date</p>
                        <p className="text-sm">{formatDateForDisplay(job.updatedAt || job.createdAt)}</p>
                    </div>
                    
                    {/* Column 4: Gross Amount */}
                    <div className="sm:text-right">
                        <p className="text-xs font-semibold sm:hidden text-muted-foreground">Gross Amount</p>
                        <p className="text-sm">₹{job.totalAmount.toFixed(2)}</p>
                    </div>
                    
                    {/* Column 5: Fee */}
                    <div className="sm:text-right">
                        <p className="text-xs font-semibold sm:hidden text-muted-foreground">Fee</p>
                        <p className="text-sm text-destructive">-₹{fee.toFixed(2)}</p>
                    </div>

                    {/* Column 6: Net Earnings */}
                    <div className="sm:text-right">
                         <p className="text-xs font-semibold sm:hidden text-muted-foreground">Net Earnings</p>
                        <p className="font-bold text-green-600">₹{netEarning.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
