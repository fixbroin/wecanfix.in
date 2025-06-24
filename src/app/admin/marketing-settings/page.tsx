
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Megaphone, Save, Loader2, Settings, BarChart2, FacebookIcon, Code, Send, MessageCircle, Database, Smartphone, KeyRound, Server } from "lucide-react"; // Added Database, Smartphone, KeyRound, Server
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { MarketingSettings, FirebaseClientConfig } from '@/types/firestore';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";

const MARKETING_CONFIG_COLLECTION = "webSettings";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";

// Zod schema for validation
const firebaseClientConfigSchema = z.object({
  apiKey: z.string().optional().or(z.literal('')),
  authDomain: z.string().optional().or(z.literal('')),
  projectId: z.string().optional().or(z.literal('')),
  storageBucket: z.string().optional().or(z.literal('')),
  messagingSenderId: z.string().optional().or(z.literal('')),
  appId: z.string().optional().or(z.literal('')),
  measurementId: z.string().optional().or(z.literal('')),
});

const marketingSettingsSchema = z.object({
  googleTagId: z.string().optional().or(z.literal('')),
  googleTagManagerId: z.string().optional().or(z.literal('')),
  metaPixelId: z.string().optional().or(z.literal('')),
  metaConversionApi: z.object({
    accessToken: z.string().optional().or(z.literal('')),
    pixelId: z.string().optional().or(z.literal('')),
    testEventCode: z.string().optional().or(z.literal('')),
  }).optional(),
  googleMerchantCenter: z.object({
    feedUrl: z.string().url("Invalid URL").optional().or(z.literal('')),
    accountId: z.string().optional().or(z.literal('')),
  }).optional(),
  facebookCatalog: z.object({
    feedUrl: z.string().url("Invalid URL").optional().or(z.literal('')),
    pixelId: z.string().optional().or(z.literal('')),
  }).optional(),
  adsTxtContent: z.string().optional().or(z.literal('')),
  googleAnalyticsId: z.string().optional().or(z.literal('')),
  
  // Firebase settings
  firebasePublicVapidKey: z.string().optional().or(z.literal('')),
  firebaseAdminSdkJson: z.string().optional().or(z.literal('')).refine((val) => {
    if (!val || val.trim() === "") return true; // Allow empty
    try {
      JSON.parse(val);
      return true;
    } catch (e) {
      return false;
    }
  }, { message: "Admin SDK must be valid JSON or empty." }),
  firebaseClientConfig: firebaseClientConfigSchema.optional(),
});

type MarketingSettingsFormData = z.infer<typeof marketingSettingsSchema>;

const defaultFirebaseClientConfig: FirebaseClientConfig = {
  apiKey: "", authDomain: "", projectId: "", storageBucket: "",
  messagingSenderId: "", appId: "", measurementId: "",
};

const defaultMarketingValues: MarketingSettingsFormData = {
  googleTagId: "", googleTagManagerId: "", metaPixelId: "",
  metaConversionApi: { accessToken: "", pixelId: "", testEventCode: "" },
  googleMerchantCenter: { feedUrl: "", accountId: "" },
  facebookCatalog: { feedUrl: "", pixelId: "" },
  adsTxtContent: "", googleAnalyticsId: "",
  firebasePublicVapidKey: "", firebaseAdminSdkJson: "",
  firebaseClientConfig: defaultFirebaseClientConfig,
};

export default function MarketingSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const form = useForm<MarketingSettingsFormData>({
    resolver: zodResolver(marketingSettingsSchema),
    defaultValues: defaultMarketingValues,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as MarketingSettings;
        form.reset({
            ...defaultMarketingValues, 
            ...data,
            metaConversionApi: { ...defaultMarketingValues.metaConversionApi, ...data.metaConversionApi },
            googleMerchantCenter: { ...defaultMarketingValues.googleMerchantCenter, ...data.googleMerchantCenter },
            facebookCatalog: { ...defaultMarketingValues.facebookCatalog, ...data.facebookCatalog },
            firebaseClientConfig: { ...defaultFirebaseClientConfig, ...data.firebaseClientConfig},
        });
      } else {
        form.reset(defaultMarketingValues);
      }
    } catch (error) {
      console.error("Error loading marketing settings:", error);
      toast({ title: "Error", description: "Could not load marketing settings.", variant: "destructive" });
      form.reset(defaultMarketingValues);
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (data: MarketingSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);
      const dataToSave: MarketingSettings = {
        ...data,
        firebaseClientConfig: { // Ensure client config is not undefined
            ...(data.firebaseClientConfig || defaultFirebaseClientConfig)
        },
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      toast({ title: "Success", description: "Marketing settings saved successfully." });
    } catch (error) {
      console.error("Error saving marketing settings:", error);
      toast({ title: "Error", description: "Could not save marketing settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading marketing settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Megaphone className="mr-2 h-6 w-6 text-primary" /> Marketing & Analytics Settings
          </CardTitle>
          <CardDescription>
            Configure IDs and settings for various marketing, analytics, and Firebase service integrations.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSaveSettings)}>
          <Tabs defaultValue="google" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
              <TabsTrigger value="google"><BarChart2 className="mr-2 h-4 w-4"/>Google</TabsTrigger>
              <TabsTrigger value="meta"><FacebookIcon className="mr-2 h-4 w-4"/>Meta</TabsTrigger>
              <TabsTrigger value="feeds"><Settings className="mr-2 h-4 w-4"/>Feeds</TabsTrigger>
              <TabsTrigger value="ads_txt"><Code className="mr-2 h-4 w-4"/>ads.txt</TabsTrigger>
              <TabsTrigger value="firebase_client"><Smartphone className="mr-2 h-4 w-4"/>Firebase Client</TabsTrigger>
              <TabsTrigger value="firebase_admin"><Server className="mr-2 h-4 w-4"/>Firebase Admin</TabsTrigger>
            </TabsList>

            <TabsContent value="google">
              <Card>
                <CardHeader><CardTitle>Google Integrations</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={form.control} name="googleTagId" render={({ field }) => (<FormItem><FormLabel>Google Tag ID (gtag.js)</FormLabel><FormControl><Input placeholder="G-XXXXXXXXXX or AW-XXXXXXXXXX" {...field} /></FormControl><FormDescription>Used for Google Ads, Analytics 4, etc.</FormDescription><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="googleTagManagerId" render={({ field }) => (<FormItem><FormLabel>Google Tag Manager (GTM) ID</FormLabel><FormControl><Input placeholder="GTM-XXXXXXX" {...field} /></FormControl><FormDescription>Container ID for GTM.</FormDescription><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="googleAnalyticsId" render={({ field }) => (<FormItem><FormLabel>Google Analytics ID</FormLabel><FormControl><Input placeholder="G-XXXXXXXXXX (GA4) or UA-XXXXXX-Y (Universal)" {...field} /></FormControl><FormDescription>Measurement ID for GA4 or Tracking ID for Universal Analytics.</FormDescription><FormMessage /></FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="meta">
              <Card>
                <CardHeader><CardTitle>Meta (Facebook) Integrations</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={form.control} name="metaPixelId" render={({ field }) => (<FormItem><FormLabel>Meta Pixel ID</FormLabel><FormControl><Input placeholder="Your Meta Pixel ID" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <h4 className="text-md font-semibold pt-2">Meta Conversion API (CAPI)</h4>
                  <FormField control={form.control} name="metaConversionApi.pixelId" render={({ field }) => (<FormItem><FormLabel>CAPI Pixel ID</FormLabel><FormControl><Input placeholder="Pixel ID for CAPI (often same as above)" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="metaConversionApi.accessToken" render={({ field }) => (<FormItem><FormLabel>CAPI Access Token</FormLabel><FormControl><Input type="password" placeholder="Your CAPI Access Token" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="metaConversionApi.testEventCode" render={({ field }) => (<FormItem><FormLabel>CAPI Test Event Code (Optional)</FormLabel><FormControl><Input placeholder="TESTXXXXX" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="feeds">
              <Card>
                <CardHeader><CardTitle>Product Feeds</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <h4 className="text-md font-semibold">Google Merchant Center</h4>
                  <FormField control={form.control} name="googleMerchantCenter.feedUrl" render={({ field }) => (<FormItem><FormLabel>Feed URL</FormLabel><FormControl><Input placeholder="URL of your Google Merchant Center feed" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="googleMerchantCenter.accountId" render={({ field }) => (<FormItem><FormLabel>Account ID</FormLabel><FormControl><Input placeholder="Your Google Merchant Center Account ID" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <h4 className="text-md font-semibold pt-2">Facebook Catalog</h4>
                  <FormField control={form.control} name="facebookCatalog.feedUrl" render={({ field }) => (<FormItem><FormLabel>Feed URL</FormLabel><FormControl><Input placeholder="URL of your Facebook Catalog feed" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="facebookCatalog.pixelId" render={({ field }) => (<FormItem><FormLabel>Associated Pixel ID</FormLabel><FormControl><Input placeholder="Meta Pixel ID for this catalog" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ads_txt">
              <Card>
                <CardHeader><CardTitle>ads.txt Content</CardTitle><CardDescription>Enter the content for your ads.txt file. This will be served at /ads.txt.</CardDescription></CardHeader>
                <CardContent>
                  <FormField control={form.control} name="adsTxtContent" render={({ field }) => (<FormItem><FormLabel>ads.txt</FormLabel><FormControl><Textarea placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0..." {...field} rows={10} className="font-mono text-xs" /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="firebase_client">
              <Card>
                <CardHeader><CardTitle className="flex items-center"><Smartphone className="mr-2 h-5 w-5"/>Firebase Client Configuration</CardTitle><CardDescription>Settings for client-side Firebase SDK, including FCM for Web Push. Primary Firebase initialization in code uses environment variables.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={form.control} name="firebasePublicVapidKey" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><KeyRound className="mr-2 h-4 w-4"/>Public VAPID Key (Web Push)</FormLabel><FormControl><Input placeholder="Your FCM VAPID Key (from Firebase Console)" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="firebaseClientConfig.messagingSenderId" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Send className="mr-2 h-4 w-4"/>Messaging Sender ID</FormLabel><FormControl><Input placeholder="Your Firebase Messaging Sender ID" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  
                  <h4 className="text-md font-semibold pt-2">Full Client Config (Optional - primarily for reference or advanced use)</h4>
                  <FormField control={form.control} name="firebaseClientConfig.apiKey" render={({ field }) => (<FormItem><FormLabel>API Key</FormLabel><FormControl><Input placeholder="AIza..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="firebaseClientConfig.authDomain" render={({ field }) => (<FormItem><FormLabel>Auth Domain</FormLabel><FormControl><Input placeholder="your-project-id.firebaseapp.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="firebaseClientConfig.projectId" render={({ field }) => (<FormItem><FormLabel>Project ID</FormLabel><FormControl><Input placeholder="your-project-id" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="firebaseClientConfig.storageBucket" render={({ field }) => (<FormItem><FormLabel>Storage Bucket</FormLabel><FormControl><Input placeholder="your-project-id.appspot.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="firebaseClientConfig.appId" render={({ field }) => (<FormItem><FormLabel>App ID</FormLabel><FormControl><Input placeholder="1:xxxx:web:xxxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="firebaseClientConfig.measurementId" render={({ field }) => (<FormItem><FormLabel>Measurement ID (for GA)</FormLabel><FormControl><Input placeholder="G-XXXXXXXXXX" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>

             <TabsContent value="firebase_admin">
              <Card>
                <CardHeader><CardTitle className="flex items-center"><Server className="mr-2 h-5 w-5"/>Firebase Admin SDK</CardTitle><CardDescription>Configuration for server-side Firebase Admin SDK (e.g., for Cloud Functions). This is sensitive information.</CardDescription></CardHeader>
                <CardContent>
                  <FormField control={form.control} name="firebaseAdminSdkJson" render={({ field }) => (<FormItem>
                    <FormLabel>Admin SDK JSON Snippet</FormLabel>
                    <FormControl><Textarea placeholder='Paste your Firebase Admin SDK JSON here (e.g., { "type": "service_account", ... })' {...field} rows={12} className="font-mono text-xs" /></FormControl>
                    <FormDescription className="text-destructive">Warning: This contains sensitive credentials. Ensure your Firestore security rules protect this document.</FormDescription>
                    <FormMessage />
                    </FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
          
          <CardFooter className="mt-6 border-t pt-6 flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Marketing Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </div>
  );
}

    

    