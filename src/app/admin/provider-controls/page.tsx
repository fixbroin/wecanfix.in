
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, Settings, ListChecks, Languages, Paperclip, Power, MapPin } from "lucide-react"; // Added MapPin
import ExperienceLevelManager from "@/components/admin/provider-controls/ExperienceLevelManager";
import SkillLevelManager from "@/components/admin/provider-controls/SkillLevelManager";
import QualificationManager from "@/components/admin/provider-controls/QualificationManager";
import LanguageManager from "@/components/admin/provider-controls/LanguageManager";
import OptionalDocTypeManager from "@/components/admin/provider-controls/OptionalDocTypeManager";
import ProviderRegistrationToggleTab from "@/components/admin/provider-controls/ProviderRegistrationToggleTab";
import PinCodeManager from "@/components/admin/provider-controls/PinCodeManager"; // Import new component

export default function ProviderControlsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Provider Registration Controls
          </CardTitle>
          <CardDescription>
            Manage options for provider registration forms, PIN code areas, and toggle registration access.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="experience_levels" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-6"> {/* Adjusted grid-cols */}
          <TabsTrigger value="experience_levels"><UserCheck className="mr-2 h-4 w-4"/>Experience Levels</TabsTrigger>
          <TabsTrigger value="skill_levels"><ListChecks className="mr-2 h-4 w-4"/>Skill Levels</TabsTrigger>
          <TabsTrigger value="qualifications"><ListChecks className="mr-2 h-4 w-4"/>Qualifications</TabsTrigger>
          <TabsTrigger value="languages"><Languages className="mr-2 h-4 w-4"/>Languages</TabsTrigger>
          <TabsTrigger value="optional_docs"><Paperclip className="mr-2 h-4 w-4"/>Optional Docs</TabsTrigger>
          <TabsTrigger value="pin_code_areas"><MapPin className="mr-2 h-4 w-4"/>PIN Code Areas</TabsTrigger> {/* New Tab */}
          <TabsTrigger value="registration_access"><Power className="mr-2 h-4 w-4"/>Registration Access</TabsTrigger>
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
        <TabsContent value="pin_code_areas"> {/* New Tab Content */}
          <PinCodeManager />
        </TabsContent>
        <TabsContent value="registration_access">
          <ProviderRegistrationToggleTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
