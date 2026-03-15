
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, DollarSign, PackageSearch, HandCoins, Banknote, AlertTriangle } from "lucide-react";
import type { FirestoreBooking, ProviderFeeType, FirestoreUser, WithdrawalRequest } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from "firebase/firestore";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const calculateProviderFee = (bookingAmount: number, feeType?: ProviderFeeType, feeValue?: number): number => {
    if (!feeType || !feeValue || feeValue <= 0) return 0;
    if (feeType === 'fixed') return feeValue;
    if (feeType === 'percentage') return (bookingAmount * feeValue) / 100;
    return 0;
};

const isCashPayment = (method: string) => method === 'Pay After Service' || method === 'Cash on Delivery';

export default function ProviderEarningsPage() {
  const { user: providerUser, firestoreUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const { toast } = useToast();
  const [completedBookings, setCompletedBookings] = useState<FirestoreBooking[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!providerUser || authIsLoading) {
      if (!authIsLoading && !providerUser) setIsLoading(false);
      return;
    }
    
    const bookingsQuery = query(
      collection(db, "bookings"), 
      where("providerId", "==", providerUser.uid),
      where("status", "==", "Completed")
    );
    const bookingsUnsub = onSnapshot(bookingsQuery, 
      (snapshot) => setCompletedBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreBooking))),
      (error) => { console.error("Error fetching bookings:", error); toast({ title: "Error", description: "Could not fetch booking data.", variant: "destructive" }); }
    );

    const withdrawalsQuery = query(
      collection(db, "withdrawalRequests"),
      where("providerId", "==", providerUser.uid)
    );
    const withdrawalsUnsub = onSnapshot(withdrawalsQuery, 
      (snapshot) => setWithdrawalRequests(snapshot.docs.map(doc => doc.data() as WithdrawalRequest)),
      (error) => { console.error("Error fetching withdrawals:", error); toast({ title: "Error", description: "Could not fetch withdrawal data.", variant: "destructive" }); }
    );

    Promise.all([
      new Promise(resolve => onSnapshot(bookingsQuery, () => resolve(true))),
      new Promise(resolve => onSnapshot(withdrawalsQuery, () => resolve(true))),
    ]).then(() => setIsLoading(false));


    return () => {
        bookingsUnsub();
        withdrawalsUnsub();
    };
  }, [providerUser, authIsLoading, toast]);

  const earningsData = useMemo(() => {
    let totalGrossEarnings = 0;
    let totalAdminCommission = 0;
    let cashCollectedByProvider = 0;
    let netFromOnlinePayments = 0;
    
    completedBookings.forEach(booking => {
        const commission = calculateProviderFee(booking.totalAmount, appConfig.providerFeeType, appConfig.providerFeeValue);
        totalGrossEarnings += booking.totalAmount;
        totalAdminCommission += commission;

        if (isCashPayment(booking.paymentMethod)) {
            cashCollectedByProvider += booking.totalAmount;
        } else {
            netFromOnlinePayments += (booking.totalAmount - commission);
        }
    });
    
    const totalNetEarnings = totalGrossEarnings - totalAdminCommission;

    const totalWithdrawnOrProcessing = withdrawalRequests
        .filter(req => req.status === 'completed' || req.status === 'processing' || req.status === 'approved' || req.status === 'pending')
        .reduce((sum, req) => sum + req.amount, 0);
    
    // Withdrawable balance is what admin has collected on provider's behalf, minus what's already paid out or is pending.
    const withdrawableBalance = netFromOnlinePayments - totalWithdrawnOrProcessing;

    // Settlement is what provider owes admin for cash jobs vs what admin owes provider for online jobs.
    // Negative means provider owes admin, positive means admin owes provider (and can be withdrawn).
    const settlementAmount = netFromOnlinePayments - (cashCollectedByProvider - (totalGrossEarnings - totalNetEarnings - netFromOnlinePayments));
    
    const providerOwesAdmin = cashCollectedByProvider > netFromOnlinePayments;
    const adminOwesProvider = netFromOnlinePayments > cashCollectedByProvider;
    const finalSettlement = Math.abs(netFromOnlinePayments - cashCollectedByProvider);


    return {
        totalGrossEarnings,
        totalAdminCommission,
        totalNetEarnings,
        withdrawableBalance: Math.max(0, withdrawableBalance), // Cannot be negative
        settlement: {
            providerOwesAdmin: providerOwesAdmin ? finalSettlement : 0,
            adminOwesProvider: adminOwesProvider ? finalSettlement : 0,
        }
    };
  }, [completedBookings, withdrawalRequests, appConfig]);

  if (authIsLoading || isLoading || isLoadingAppConfig) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><DollarSign className="mr-2 h-6 w-6 text-primary"/>My Earnings</CardTitle>
          <CardDescription>Overview of your earnings, commissions, and settlement status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-primary/10 border-primary/30">
            <CardHeader><CardTitle className="text-lg text-primary">Total Gross Earnings</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.totalGrossEarnings.toFixed(2)}</p><p className="text-xs text-muted-foreground">Total value of completed jobs.</p></CardContent>
          </Card>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardHeader><CardTitle className="text-lg text-destructive">Admin Commission</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.totalAdminCommission.toFixed(2)}</p><p className="text-xs text-muted-foreground">Fee deducted for platform services.</p></CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/30">
            <CardHeader><CardTitle className="text-lg text-green-600">Your Net Earnings</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.totalNetEarnings.toFixed(2)}</p><p className="text-xs text-muted-foreground">Your final take-home amount.</p></CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/30">
            <CardHeader><CardTitle className="text-lg text-blue-600">Withdrawable Balance</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.withdrawableBalance.toFixed(2)}</p><p className="text-xs text-muted-foreground">Earnings from online payments ready for payout.</p></CardContent>
             <CardFooter><Link href="/provider/withdrawal"><Button size="sm" variant="outline" className="w-full">Request Payout</Button></Link></CardFooter>
          </Card>
        </CardContent>
         <CardFooter>
            {earningsData.settlement.providerOwesAdmin > 0 ? (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Action Required: Settlement Due</AlertTitle>
                    <AlertDescription>You have collected more cash than your net earnings. You need to settle <span className="font-bold">₹{earningsData.settlement.providerOwesAdmin.toFixed(2)}</span> with the admin.</AlertDescription>
                </Alert>
            ) : (
                 <Alert>
                    <HandCoins className="h-4 w-4" />
                    <AlertTitle>Settlement Status</AlertTitle>
                    <AlertDescription>Your account is settled. Your withdrawable balance of <span className="font-bold">₹{earningsData.withdrawableBalance.toFixed(2)}</span> is available for payout requests.</AlertDescription>
                </Alert>
            )}
        </CardFooter>
      </Card>
    </div>
  );
}
