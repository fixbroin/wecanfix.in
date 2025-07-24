
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Target, Globe, FileText, Type, Pilcrow, BarChart, Save, Loader2, Settings2, Map, Layers } from "lucide-react"; // Added Map, Layers
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { FirestoreSEOSettings, StructuredDataSocialProfiles } from '@/types/firestore';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { defaultSeoValues } from '@/lib/seoUtils'; // Import defaults



const SEO_SETTINGS_DOC_ID = "global";
const SEO_SETTINGS_COLLECTION = "seoSettings";


const seoSettingsSchema = z.object({
  siteName: z.string().min(1, "Site Name is required.").optional(),
  defaultMetaTitleSuffix: z.string().optional(),
  defaultMetaDescription: z.string().max(300, "Too long").optional(),
  defaultMetaKeywords: z.string().optional(),
  homepageMetaTitle: z.string().max(70, "Too long").optional(),
  homepageMetaDescription: z.string().max(300, "Too long").optional(),
  homepageMetaKeywords: z.string().optional(),
  homepageH1: z.string().max(100, "Too long").optional(),
  categoryPageTitlePattern: z.string().optional(),
  categoryPageDescriptionPattern: z.string().optional(),
  categoryPageKeywordsPattern: z.string().optional(),
  categoryPageH1Pattern: z.string().optional(),
  cityCategoryPageTitlePattern: z.string().optional(),
  cityCategoryPageDescriptionPattern: z.string().optional(),
  cityCategoryPageKeywordsPattern: z.string().optional(),
  cityCategoryPageH1Pattern: z.string().optional(),
  areaCategoryPageTitlePattern: z.string().optional(), // New
  areaCategoryPageDescriptionPattern: z.string().optional(), // New
  areaCategoryPageKeywordsPattern: z.string().optional(), // New
  areaCategoryPageH1Pattern: z.string().optional(), // New
  servicePageTitlePattern: z.string().optional(),
  servicePageDescriptionPattern: z.string().optional(),
  servicePageKeywordsPattern: z.string().optional(),
  servicePageH1Pattern: z.string().optional(),
  areaPageTitlePattern: z.string().optional(), 
  areaPageDescriptionPattern: z.string().optional(), 
  areaPageKeywordsPattern: z.string().optional(), 
  areaPageH1Pattern: z.string().optional(), 
  structuredDataType: z.string().optional(),
  structuredDataName: z.string().optional(),
  structuredDataStreetAddress: z.string().optional(),
  structuredDataLocality: z.string().optional(),
  structuredDataRegion: z.string().optional(),
  structuredDataPostalCode: z.string().optional(),
  structuredDataCountry: z.string().optional(),
  structuredDataTelephone: z.string().optional(),
  structuredDataImage: z.string().url("Must be a valid URL").optional().or(z.literal('')),
  socialProfileUrls: z.object({
    facebook: z.string().url("Invalid URL").optional().or(z.literal('')),
    twitter: z.string().url("Invalid URL").optional().or(z.literal('')),
    instagram: z.string().url("Invalid URL").optional().or(z.literal('')),
    linkedin: z.string().url("Invalid URL").optional().or(z.literal('')),
    youtube: z.string().url("Invalid URL").optional().or(z.literal('')),
  }).optional(),
});

type SEOSettingsFormData = z.infer<typeof seoSettingsSchema>;

export default function SEOSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const form = useForm<SEOSettingsFormData>({
    resolver: zodResolver(seoSettingsSchema),
    defaultValues: defaultSeoValues, // Use imported defaults
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, SEO_SETTINGS_COLLECTION, SEO_SETTINGS_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreSEOSettings;
        form.reset({ ...defaultSeoValues, ...data });
      } else {
        form.reset(defaultSeoValues);
      }
    } catch (error) {
      console.error("Error loading SEO settings:", error);
      toast({ title: "Error", description: "Could not load SEO settings.", variant: "destructive" });
      form.reset(defaultSeoValues);
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (data: SEOSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, SEO_SETTINGS_COLLECTION, SEO_SETTINGS_DOC_ID);
      const dataToSave: FirestoreSEOSettings = {
        ...data,
        socialProfileUrls: data.socialProfileUrls || {}, 
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      toast({ title: "Success", description: "SEO settings saved successfully." });
    } catch (error) {
      console.error("Error saving SEO settings:", error);
      toast({ title: "Error", description: "Could not save SEO settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const renderFormField = (name: keyof SEOSettingsFormData, label: string, placeholder?: string, description?: string, isTextarea = false, icon?: React.ElementType) => {
    const Icon = icon;
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              {Icon && <Icon className="mr-2 h-4 w-4 text-muted-foreground" />}
              {label}
            </FormLabel>
            <FormControl>
              {isTextarea ? (
                <Textarea placeholder={placeholder} {...field} value={field.value || ""} disabled={isSaving} rows={name.toLowerCase().includes('description') ? 3 : 2} />
              ) : (
                <Input placeholder={placeholder} {...field} value={field.value || ""} disabled={isSaving} />
              )}
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };
  
  const renderSocialField = (name: keyof StructuredDataSocialProfiles, label: string, Icon: React.ElementType) => (
    <FormField
      control={form.control}
      name={`socialProfileUrls.${name}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center"><Icon className="mr-2 h-4 w-4 text-muted-foreground"/>{label}</FormLabel>
          <FormControl><Input placeholder={`https://{name}.com/yourpage`} {...field} value={field.value || ""} disabled={isSaving}/></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );


  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading SEO settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Target className="mr-2 h-6 w-6 text-primary" /> SEO Settings
          </CardTitle>
          <CardDescription>
            Manage Search Engine Optimization settings for your website. Use placeholders like <code>{"{{categoryName}}"}</code>, <code>{"{{serviceName}}"}</code>, <code>{"{{cityName}}"}</code>, <code>{"{{areaName}}"}</code> in patterns.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSaveSettings)}>
          <Tabs defaultValue="global" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6">
              <TabsTrigger value="global"><Globe className="mr-2 h-4 w-4"/>Global & Homepage</TabsTrigger>
              <TabsTrigger value="patterns"><FileText className="mr-2 h-4 w-4"/>Page Content Patterns</TabsTrigger>
              <TabsTrigger value="structured_data"><BarChart className="mr-2 h-4 w-4"/>Structured Data</TabsTrigger>
            </TabsList>

            <TabsContent value="global">
              <Card>
                <CardHeader><CardTitle>Global Defaults & Homepage SEO</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {renderFormField("siteName", "Site Name (for OG & Structured Data)", "e.g., FixBro Services", undefined, false, Settings2)}
                  {renderFormField("defaultMetaTitleSuffix", "Default Meta Title Suffix", "e.g., | FixBro", "Appended to most page titles.")}
                  {renderFormField("defaultMetaDescription", "Default Meta Description", "e.g., Quality home services at your doorstep.", "Fallback description if a specific one isn't set.", true)}
                  {renderFormField("defaultMetaKeywords", "Default Meta Keywords (comma-separated)", "e.g., home repair, plumbing, electrician")}
                  <hr className="my-6"/>
                  <h4 className="text-md font-semibold">Homepage Specific SEO:</h4>
                  {renderFormField("homepageH1", "Homepage H1 Title", "e.g., Reliable Home Services")}
                  {renderFormField("homepageMetaTitle", "Homepage Meta Title", "e.g., FixBro - Trusted Home Services")}
                  {renderFormField("homepageMetaDescription", "Homepage Meta Description", "e.g., Book expert home services online.", true)}
                  {renderFormField("homepageMetaKeywords", "Homepage Meta Keywords (comma-separated)", "e.g., fixbro, home services, repair")}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="patterns">
              <Card>
                <CardHeader><CardTitle>Dynamic Page SEO Patterns</CardTitle><CardDescription>Use placeholders like <code>{"{{categoryName}}"}</code>, <code>{"{{serviceName}}"}</code>, <code>{"{{cityName}}"}</code>, <code>{"{{areaName}}"}</code>, <code>{"{{serviceDescription}}"}</code>.</CardDescription></CardHeader>
                <CardContent className="space-y-8">
                  <div>
                    <h4 className="text-md font-semibold mb-3">Default Category Pages (e.g., /category/slug):</h4>
                    <div className="space-y-4">
                      {renderFormField("categoryPageH1Pattern", "H1 Title Pattern", "e.g., {{categoryName}} Services")}
                      {renderFormField("categoryPageTitlePattern", "Meta Title Pattern", "e.g., {{categoryName}} | FixBro")}
                      {renderFormField("categoryPageDescriptionPattern", "Meta Description Pattern", "e.g., Best {{categoryName}} services.", true)}
                      {renderFormField("categoryPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{categoryName}}, book {{categoryName}}")}
                    </div>
                  </div>
                  <hr/>
                   <div>
                    <h4 className="text-md font-semibold mb-3 flex items-center"><Map className="mr-2 h-5 w-5 text-muted-foreground"/>City-Specific Category Pages (e.g., /city/category):</h4>
                    <CardDescription>Placeholders: <code>{"{{cityName}}"}</code>, <code>{"{{categoryName}}"}</code></CardDescription>
                    <div className="space-y-4 mt-3">
                      {renderFormField("cityCategoryPageH1Pattern", "H1 Title Pattern", "e.g., {{categoryName}} in {{cityName}}")}
                      {renderFormField("cityCategoryPageTitlePattern", "Meta Title Pattern", "e.g., {{categoryName}} Services in {{cityName}} | FixBro")}
                      {renderFormField("cityCategoryPageDescriptionPattern", "Meta Description Pattern", "e.g., Find {{categoryName}} experts in {{cityName}}.", true)}
                      {renderFormField("cityCategoryPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{categoryName}} {{cityName}}, {{categoryName}} services")}
                    </div>
                  </div>
                  <hr/>
                  <div>
                    <h4 className="text-md font-semibold mb-3 flex items-center"><Layers className="mr-2 h-5 w-5 text-muted-foreground"/>Area-Specific Category Pages (e.g., /city/area/category):</h4>
                    <CardDescription>Placeholders: <code>{"{{areaName}}"}</code>, <code>{"{{cityName}}"}</code>, <code>{"{{categoryName}}"}</code></CardDescription>
                    <div className="space-y-4 mt-3">
                      {renderFormField("areaCategoryPageH1Pattern", "H1 Title Pattern", "e.g., {{categoryName}} in {{areaName}}, {{cityName}}")}
                      {renderFormField("areaCategoryPageTitlePattern", "Meta Title Pattern", "e.g., {{categoryName}} - {{areaName}}, {{cityName}} | FixBro")}
                      {renderFormField("areaCategoryPageDescriptionPattern", "Meta Description Pattern", "e.g., Best {{categoryName}} in {{areaName}}, {{cityName}}.", true)}
                      {renderFormField("areaCategoryPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{categoryName}} {{areaName}}, {{areaName}} {{cityName}} services")}
                    </div>
                  </div>
                  <hr/>
                  <div>
                    <h4 className="text-md font-semibold mb-3">Service Pages:</h4>
                    <div className="space-y-4">
                      {renderFormField("servicePageH1Pattern", "H1 Title Pattern", "e.g., {{serviceName}} in {{areaName}}")}
                      {renderFormField("servicePageTitlePattern", "Meta Title Pattern", "e.g., {{serviceName}} - {{areaName}}, {{cityName}} | FixBro")}
                      {renderFormField("servicePageDescriptionPattern", "Meta Description Pattern", "e.g., Get expert {{serviceName}} for {{serviceDescription}} in {{areaName}}.", true)}
                      {renderFormField("servicePageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{serviceName}}, {{categoryName}}, {{areaName}}, order {{serviceName}}")}
                    </div>
                  </div>
                  <hr/>
                  <div>
                    <h4 className="text-md font-semibold mb-3 flex items-center"><Map className="mr-2 h-5 w-5 text-muted-foreground"/>Area Pages (e.g., /city/area):</h4>
                    <CardDescription>Patterns for pages like <code>/city-slug/area-slug</code>. Use <code>{"{{cityName}}"}</code> and <code>{"{{areaName}}"}</code>.</CardDescription>
                    <div className="space-y-4 mt-3">
                      {renderFormField("areaPageH1Pattern", "H1 Title Pattern", "e.g., Services in {{areaName}}, {{cityName}}")}
                      {renderFormField("areaPageTitlePattern", "Meta Title Pattern", "e.g., {{areaName}}, {{cityName}} Home Services | FixBro")}
                      {renderFormField("areaPageDescriptionPattern", "Meta Description Pattern", "e.g., Find all home services in {{areaName}}, {{cityName}}.", true)}
                      {renderFormField("areaPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{areaName}}, {{cityName}}, home services, local repair")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="structured_data">
              <Card>
                <CardHeader><CardTitle>Structured Data Defaults (LocalBusiness)</CardTitle><CardDescription>Helps search engines understand your business.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  {renderFormField("structuredDataType", "Schema Type", "e.g., LocalBusiness, Organization")}
                  {renderFormField("structuredDataName", "Business Name", "e.g., FixBro")}
                  {renderFormField("structuredDataStreetAddress", "Street Address", "e.g., 123 Main St")}
                  {renderFormField("structuredDataLocality", "City / Locality", "e.g., Bangalore")}
                  {renderFormField("structuredDataRegion", "State / Region", "e.g., KA")}
                  {renderFormField("structuredDataPostalCode", "Postal Code", "e.g., 560001")}
                  {renderFormField("structuredDataCountry", "Country Code", "e.g., IN")}
                  {renderFormField("structuredDataTelephone", "Telephone Number", "e.g., +919876543210")}
                  {renderFormField("structuredDataImage", "Default Business Image URL", "URL to your logo or a representative image")}
                  <h4 className="text-md font-semibold pt-2">Social Profile URLs (for 'sameAs'):</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderSocialField("facebook", "Facebook URL", Type)}
                    {renderSocialField("twitter", "Twitter (X) URL", Type)}
                    {renderSocialField("instagram", "Instagram URL", Type)}
                    {renderSocialField("linkedin", "LinkedIn URL", Type)}
                    {renderSocialField("youtube", "YouTube URL", Type)}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <CardFooter className="mt-6 border-t pt-6 flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save All SEO Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </div>
  );
}

