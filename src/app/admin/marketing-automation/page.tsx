
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, Save, Send, Mail, Users, ShoppingCart, Repeat, Megaphone, MessageCircle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import type { MarketingAutomationSettings, AutomationDelay as AutomationDelayType, FirestoreService } from '@/types/firestore';
import { sendMarketingEmail } from '@/ai/flows/sendMarketingEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SendManualEmailForm from '@/components/admin/marketing/SendManualEmailForm';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { getBaseUrl } from '@/lib/config';

const MARKETING_AUTOMATION_COLLECTION = "webSettings";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation";

const automationDelaySchema = z.object({
  days: z.coerce.number().min(0, "Must be non-negative.").default(0),
  hours: z.coerce.number().min(0, "Must be non-negative.").max(23, "Max 23 hours.").default(0),
  minutes: z.coerce.number().min(0, "Must be non-negative.").max(59, "Max 59 minutes.").default(0),
}).refine(data => (data.days + data.hours + data.minutes) > 0, {
  message: "At least one delay value must be set.",
  path: ["days"], 
});


const marketingAutomationSchema = z.object({
  noBookingReminderEnabled: z.boolean().default(false),
  noBookingReminderDelay: automationDelaySchema.optional(),
  noBookingReminderTemplate: z.string().max(2000).optional(),
  
  abandonedCartEnabled: z.boolean().default(false),
  abandonedCartDelay: automationDelaySchema.optional(),
  abandonedCartTemplate: z.string().max(2000).optional(),
  
  recurringEngagementEnabled: z.boolean().default(false),
  recurringEngagementDelay: automationDelaySchema.optional(),
  recurringEngagementTemplate: z.string().max(2000).optional(),
});

type MarketingAutomationFormData = z.infer<typeof marketingAutomationSchema>;

const defaultMarketingAutomationSettings: Omit<MarketingAutomationSettings, 'updatedAt'> = {
    noBookingReminderEnabled: false,
    noBookingReminderDelay: { days: 1, hours: 0, minutes: 0 },
    noBookingReminderTemplate: "Hi {{name}},\n\nWe noticed you haven't booked a service yet. Is there anything we can help you find?\n\nExplore our popular services: {{popular_services}}\n\nThanks,\nThe Wecanfix Team",
    
    abandonedCartEnabled: false,
    abandonedCartDelay: { days: 0, hours: 6, minutes: 0 },
    abandonedCartTemplate: "Hi {{name}},\n\nYou left something in your cart! Complete your booking now before the time slot gets taken.\n\nItem: {{cart_item_name}}\n\nComplete Booking: {{cart_link}}",
    
    recurringEngagementEnabled: false,
    recurringEngagementDelay: { days: 15, hours: 0, minutes: 0 },
    recurringEngagementTemplate: "Hi {{name}},\n\nJust a friendly check-in from Wecanfix! We're always here for your home service needs. Check out our popular services in {{city}}:\n\n{{popular_services}}\n\nHave a great week!",
};

export default function MarketingAutomationPage() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const { settings: globalSettings } = useGlobalSettings();
  const { user: adminUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestSending, setIsTestSending] = useState(false);

  const form = useForm<MarketingAutomationFormData>({
    resolver: zodResolver(marketingAutomationSchema),
    defaultValues: defaultMarketingAutomationSettings,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, MARKETING_AUTOMATION_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as MarketingAutomationSettings;
        form.reset({ 
            ...defaultMarketingAutomationSettings, 
            ...data,
        });
      } else {
        form.reset(defaultMarketingAutomationSettings);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: MarketingAutomationFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, MARKETING_AUTOMATION_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      const dataToSave: MarketingAutomationSettings = {
        ...data,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      toast({ title: "Success", description: "Marketing automation settings have been saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleTestSend = async (subjectTemplate: string, bodyTemplate: string) => {
    if (!adminUser?.email) return;
    setIsTestSending(true);
    toast({ title: "Sending Test...", description: `Sending test email to ${adminUser.email}`});
    
    try {
        const popularServicesQuery = query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("rating", "desc"), limit(5));
        const popularServicesSnap = await getDocs(popularServicesQuery);
        const popularServices = popularServicesSnap.docs.map(doc => doc.data() as FirestoreService);
        const baseUrl = getBaseUrl();
        const popularServicesHtml = `<ul>${popularServices.map(s => `<li><a href="${baseUrl}/service/${s.slug}">${s.name}</a></li>`).join('')}</ul>`;
        const cartContentHtml = `<ul><li>Sample Service A (x1)</li><li>Sample Service B (x2)</li></ul>`;

        const mergeData = {
          name: adminUser.displayName || 'Admin',
          email: adminUser.email,
          mobile: adminUser.phoneNumber || '',
          signupDate: adminUser.metadata.creationTime ? new Date(adminUser.metadata.creationTime).toLocaleDateString('en-IN') : '',
          websiteName: globalSettings.websiteName || 'Wecanfix',
          websiteUrl: baseUrl,
          supportEmail: globalSettings.contactEmail || 'support@example.com',
          companyAddress: globalSettings.address || 'Company Address',
          popular_services: popularServicesHtml,
          cart_items: cartContentHtml,
          cart_item_name: "Sample Service A",
          cart_link: `${baseUrl}/cart`,
          city: "your city", // City is not a user property, so it remains a placeholder
        };
        
        let processedBody = bodyTemplate;
        let processedSubject = subjectTemplate;
        
        for (const [key, value] of Object.entries(mergeData)) {
            const tag = new RegExp(`{{${key}}}`, 'g');
            processedBody = processedBody.replace(tag, value);
            processedSubject = processedSubject.replace(tag, value);
        }

        const result = await sendMarketingEmail({
            toEmail: adminUser.email,
            subject: processedSubject,
            htmlBody: processedBody.replace(/\n/g, '<br>'),
            smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort,
            smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
        });

        if (result.success) toast({ title: "Test Email Sent", description: result.message });
        else toast({ title: "Test Email Failed", description: result.message, variant: "destructive" });
    } catch (error) {
        toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsTestSending(false);
    }
  };

  const renderDelayInputs = (
    baseFieldName: "noBookingReminderDelay" | "abandonedCartDelay" | "recurringEngagementDelay",
    label: string
  ) => (
    <div className="space-y-2">
      <FormLabel className="text-sm">{label}</FormLabel>
      <div className="grid grid-cols-3 gap-2">
        <FormField control={form.control} name={`${baseFieldName}.days`} render={({ field }) => (<FormItem><FormLabel className="text-xs text-muted-foreground">Days</FormLabel><FormControl><Input type="number" placeholder="e.g., 1" {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name={`${baseFieldName}.hours`} render={({ field }) => (<FormItem><FormLabel className="text-xs text-muted-foreground">Hours</FormLabel><FormControl><Input type="number" placeholder="e.g., 24" {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name={`${baseFieldName}.minutes`} render={({ field }) => (<FormItem><FormLabel className="text-xs text-muted-foreground">Minutes</FormLabel><FormControl><Input type="number" placeholder="e.g., 30" {...field} /></FormControl><FormMessage /></FormItem>)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Megaphone className="mr-2 h-6 w-6 text-primary" /> Marketing Center
          </CardTitle>
          <CardDescription>
            Configure automated marketing emails and send manual campaigns.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="email_automations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="email_automations"><Mail className="mr-2 h-4 w-4" />Email Automations</TabsTrigger>
          <TabsTrigger value="send_email"><Send className="mr-2 h-4 w-4" />Send Manual Email</TabsTrigger>
        </TabsList>

        <TabsContent value="send_email">
            <SendManualEmailForm />
        </TabsContent>

        <TabsContent value="email_automations">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Card>
                <CardHeader><CardTitle className="flex items-center"><Users className="mr-2 h-5 w-5 text-primary"/>No Booking Reminder</CardTitle><CardDescription>Follow-up with users who sign up but do not book a service.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={form.control} name="noBookingReminderEnabled" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel className="text-base flex items-center"><Mail className="mr-2 h-4 w-4"/>Enable "No Booking" Reminder</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || isTestSending} /></FormControl></FormItem>)}/>
                   {form.watch("noBookingReminderEnabled") && (
                      <div className="pl-4 border-l-2 ml-2 space-y-4">
                          {renderDelayInputs("noBookingReminderDelay", "Send After")}
                          <FormField control={form.control} name="noBookingReminderTemplate" render={({ field }) => (<FormItem><FormLabel>Email Body</FormLabel><FormControl><Textarea placeholder="Hi {{name}}, haven't booked yet?..." {...field} rows={5} /></FormControl><FormDescription>Placeholders: {"{{name}}"}, {"{{popular_services}}"}</FormDescription><FormMessage /></FormItem>)}/>
                          <Button type="button" variant="secondary" size="sm" onClick={() => handleTestSend('A friendly reminder from Wecanfix', form.getValues('noBookingReminderTemplate') || 'Test')} disabled={isTestSending}><Send className="mr-2 h-4 w-4"/>Send Test Email</Button>
                      </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center"><ShoppingCart className="mr-2 h-5 w-5 text-primary"/>Abandoned Cart Reminder</CardTitle><CardDescription>Remind users who add items to cart but don't check out.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={form.control} name="abandonedCartEnabled" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel className="text-base flex items-center"><Mail className="mr-2 h-4 w-4"/>Enable Abandoned Cart Email</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || isTestSending} /></FormControl></FormItem>)}/>
                   {form.watch("abandonedCartEnabled") && (
                      <div className="pl-4 border-l-2 ml-2 space-y-4">
                          {renderDelayInputs("abandonedCartDelay", "Send After")}
                          <FormField control={form.control} name="abandonedCartTemplate" render={({ field }) => (<FormItem><FormLabel>Email Body</FormLabel><FormControl><Textarea placeholder="Hi {{name}}, did you forget something?..." {...field} rows={5} /></FormControl><FormDescription>Placeholders: {"{{name}}"}, {"{{cart_items}}"}, {"{{cart_item_name}}"}, {"{{cart_link}}"}</FormDescription><FormMessage /></FormItem>)}/>
                          <Button type="button" variant="secondary" size="sm" onClick={() => handleTestSend('You left something in your cart!', form.getValues('abandonedCartTemplate') || 'Test')} disabled={isTestSending}><Send className="mr-2 h-4 w-4"/>Send Test Email</Button>
                      </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center"><Repeat className="mr-2 h-5 w-5 text-primary"/>Recurring Engagement</CardTitle><CardDescription>Send regular emails to all registered users.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={form.control} name="recurringEngagementEnabled" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel className="text-base flex items-center"><Mail className="mr-2 h-4 w-4"/>Enable Recurring Emails</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || isTestSending} /></FormControl></FormItem>)}/>
                  {form.watch("recurringEngagementEnabled") && (
                      <div className="pl-4 border-l-2 ml-2 space-y-4">
                          {renderDelayInputs("recurringEngagementDelay", "Send Every")}
                          <FormField control={form.control} name="recurringEngagementTemplate" render={({ field }) => (<FormItem><FormLabel>Email Body</FormLabel><FormControl><Textarea placeholder="Hi {{name}}, here's what's new..." {...field} rows={5} /></FormControl><FormDescription>Placeholders: {"{{name}}"}, {"{{popular_services}}"}, {"{{city}}"}</FormDescription><FormMessage /></FormItem>)}/>
                           <Button type="button" variant="secondary" size="sm" onClick={() => handleTestSend('Here\'s what\'s new at Wecanfix!', form.getValues('recurringEngagementTemplate') || 'Test')} disabled={isTestSending}><Send className="mr-2 h-4 w-4"/>Send Test Email</Button>
                      </div>
                  )}
                </CardContent>
              </Card>

              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={isSaving || isTestSending}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Automation Settings
                </Button>
              </CardFooter>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
