
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
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="templates"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <FileText className="mr-2 h-4 w-4"/>Manage Templates
            </TabsTrigger>
            <TabsTrigger 
              value="test_sender"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Beaker className="mr-2 h-4 w-4"/>Test Sender
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
            <WhatsAppTemplateManagementTab />
        </TabsContent>
        <TabsContent value="test_sender">
            <WhatsAppTestSenderTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
