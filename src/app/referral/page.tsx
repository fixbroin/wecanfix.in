
"use client";

import { useState, useEffect } from 'react';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Handshake, Wallet, Banknote, ShieldOff } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import ReferralInfoTab from '@/components/referral/ReferralInfoTab';
import WalletTab from '@/components/referral/WalletTab';
import WithdrawalTab from '@/components/referral/WithdrawalTab';
import type { ReferralSettings, WithdrawalSettings } from '@/types/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

const REFERRAL_CONFIG_DOC_ID = "referral";
const WITHDRAWAL_CONFIG_DOC_ID = "withdrawal";
const CONFIG_COLLECTION = "appConfiguration";

function ReferralPageContent() {
  const { isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(null);
  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Profile", href: "/profile" },
    { label: "Refer & Earn" },
  ];

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const referralRef = doc(db, CONFIG_COLLECTION, REFERRAL_CONFIG_DOC_ID);
        const withdrawalRef = doc(db, CONFIG_COLLECTION, WITHDRAWAL_CONFIG_DOC_ID);
        const [referralSnap, withdrawalSnap] = await Promise.all([getDoc(referralRef), getDoc(withdrawalRef)]);
        
        if (referralSnap.exists()) {
          setReferralSettings(referralSnap.data() as ReferralSettings);
        }
        if (withdrawalSnap.exists()) {
          setWithdrawalSettings(withdrawalSnap.data() as WithdrawalSettings);
        }
      } catch (error) {
        console.error("Error fetching referral/withdrawal settings:", error);
        toast({ title: "Error", description: "Could not load page settings.", variant: "destructive"});
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [toast]);
  

  if (authIsLoading || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
      </div>
    );
  }

  if (!referralSettings?.isReferralSystemEnabled) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <Card className="text-center py-16">
          <CardHeader>
            <ShieldOff className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <CardTitle className="text-2xl font-bold">Referral Program Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Our referral program is temporarily disabled. Please check back later!
            </p>
            <Link href="/" passHref className="mt-6 inline-block">
              <Button>Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <Handshake className="mr-2 h-6 w-6 text-primary" /> Refer & Earn
            </CardTitle>
            <CardDescription>
              Track your earnings, see your referral history, and withdraw your balance.
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="info"><Handshake className="mr-2 h-4 w-4"/>Referral Info</TabsTrigger>
            <TabsTrigger value="wallet"><Wallet className="mr-2 h-4 w-4"/>My Wallet</TabsTrigger>
            <TabsTrigger value="withdraw"><Banknote className="mr-2 h-4 w-4"/>Withdraw</TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            <ReferralInfoTab settings={referralSettings} />
          </TabsContent>
          <TabsContent value="wallet">
            <WalletTab />
          </TabsContent>
          <TabsContent value="withdraw">
            <WithdrawalTab settings={withdrawalSettings} />
          </TabsContent>
        </Tabs>
      </div>
  );
}

export default function ReferralPage() {
    return (
        <ProtectedRoute>
            <ReferralPageContent />
        </ProtectedRoute>
    )
}
