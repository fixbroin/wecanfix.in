
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, Settings, ListChecks, Languages, Paperclip, Power, MapPin, HandCoins, Banknote } from "lucide-react";
import ExperienceLevelManager from "@/components/admin/provider-controls/ExperienceLevelManager";
import SkillLevelManager from "@/components/admin/provider-controls/SkillLevelManager";
import QualificationManager from "@/components/admin/provider-controls/QualificationManager";
import LanguageManager from "@/components/admin/provider-controls/LanguageManager";
import OptionalDocTypeManager from "@/components/admin/provider-controls/OptionalDocTypeManager";
import ProviderRegistrationToggleTab from "@/components/admin/provider-controls/ProviderRegistrationToggleTab";
import ProviderFeesSetupTab from "@/components/admin/provider-controls/ProviderFeesSetupTab"; 
import WithdrawalSettingsTab from "@/components/admin/provider-controls/WithdrawalSettingsTab";

export default function ProviderControlsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Provider Registration & Payouts
          </CardTitle>
          <CardDescription>
            Manage options for provider registration forms, access, service fees, and withdrawals.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="experience_levels" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 mb-6 h-auto flex-wrap justify-start">
          <TabsTrigger value="experience_levels"><UserCheck className="mr-2 h-4 w-4"/>Experience</TabsTrigger>
          <TabsTrigger value="skill_levels"><ListChecks className="mr-2 h-4 w-4"/>Skills</TabsTrigger>
          <TabsTrigger value="qualifications"><ListChecks className="mr-2 h-4 w-4"/>Qualifications</TabsTrigger>
          <TabsTrigger value="languages"><Languages className="mr-2 h-4 w-4"/>Languages</TabsTrigger>
          <TabsTrigger value="optional_docs"><Paperclip className="mr-2 h-4 w-4"/>Optional Docs</TabsTrigger>
          <TabsTrigger value="provider_fees"><HandCoins className="mr-2 h-4 w-4"/>Provider Fees</TabsTrigger>
          <TabsTrigger value="withdrawal_settings"><Banknote className="mr-2 h-4 w-4"/>Withdrawals</TabsTrigger>
          <TabsTrigger value="registration_access"><Power className="mr-2 h-4 w-4"/>Registration</TabsTrigger>
        </TabsList>

        <TabsContent value="experience_levels">
          <ExperienceLevelManager />
        </TabsContent>
        <TabsContent value="skill_levels">
          <SkillLevelManager />
        </TabsContent>
        <TabsContent value="qualifications">
          <QualificationManager />
        </TabsContent>
        <TabsContent value="languages">
          <LanguageManager />
        </TabsContent>
        <TabsContent value="optional_docs">
          <OptionalDocTypeManager />
        </TabsContent>
        <TabsContent value="provider_fees">
          <ProviderFeesSetupTab />
        </TabsContent>
        <TabsContent value="withdrawal_settings">
          <WithdrawalSettingsTab />
        </TabsContent>
        <TabsContent value="registration_access">
          <ProviderRegistrationToggleTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
