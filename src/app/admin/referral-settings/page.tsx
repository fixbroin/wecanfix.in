
      
"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Handshake, Banknote, UserPlus, SendToBack } from "lucide-react";
import ReferralSettingsTab from '@/components/admin/referral/ReferralSettingsTab';
import WithdrawalSettingsTab from '@/components/admin/referral/WithdrawalSettingsTab';
import ReferralSignupsTab from "@/components/admin/referral/ReferralSignupsTab";
import WithdrawalRequestsTab from "@/components/admin/referral/WithdrawalRequestsTab";

export default function ReferralSettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Handshake className="mr-2 h-6 w-6 text-primary" /> Referral &amp; Wallet System
          </CardTitle>
          <CardDescription>
            Configure your referral program, manage withdrawal settings, and track user activity.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="referral_settings" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
          <TabsTrigger value="referral_settings"><Handshake className="mr-2 h-4 w-4"/>Referral Settings</TabsTrigger>
          <TabsTrigger value="withdrawal_settings"><Banknote className="mr-2 h-4 w-4"/>Withdrawal Settings</TabsTrigger>
          <TabsTrigger value="referral_signups"><UserPlus className="mr-2 h-4 w-4"/>Referral Signups</TabsTrigger>
          <TabsTrigger value="withdrawal_requests"><SendToBack className="mr-2 h-4 w-4"/>Withdrawal Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="referral_settings">
          <ReferralSettingsTab />
        </TabsContent>
        <TabsContent value="withdrawal_settings">
          <WithdrawalSettingsTab />
        </TabsContent>
        <TabsContent value="referral_signups">
          <ReferralSignupsTab />
        </TabsContent>
        <TabsContent value="withdrawal_requests">
          <WithdrawalRequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

    