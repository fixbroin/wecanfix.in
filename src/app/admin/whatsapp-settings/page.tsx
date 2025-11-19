
"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, FileText, Beaker } from "lucide-react";
import WhatsAppTemplateManagementTab from '@/components/admin/whatsapp/WhatsAppTemplateManagementTab';
import WhatsAppTestSenderTab from '@/components/admin/whatsapp/WhatsAppTestSenderTab';

export default function WhatsAppSettingsPage() {

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <MessageSquare className="mr-2 h-6 w-6 text-primary" /> WhatsApp Settings &amp; Testing
          </CardTitle>
          <CardDescription>
            Manage and test your approved WhatsApp message templates.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="templates"><FileText className="mr-2 h-4 w-4"/>Manage Templates</TabsTrigger>
          <TabsTrigger value="test_sender"><Beaker className="mr-2 h-4 w-4"/>Test Sender</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
            <WhatsAppTemplateManagementTab />
        </TabsContent>
        <TabsContent value="test_sender">
            <WhatsAppTestSenderTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
