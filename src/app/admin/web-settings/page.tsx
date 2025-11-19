
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Will be used for content
import { Label } from "@/components/ui/label";
import { Settings2, Save, Loader2, AlertTriangle, Building, Image as ImageIcon, FileText, ExternalLink, Trash2, Facebook, Instagram, Linkedin, Youtube, TwitterIcon } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, Timestamp, collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import type { GlobalWebSettings, ContentPage } from '@/types/firestore';
import NextImage from 'next/image';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";


const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const CONTENT_PAGES_COLLECTION = "contentPages";

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};


const generalInfoSchema = z.object({
  websiteName: z.string().min(2, "Website name is too short.").max(50, "Website name is too long.").optional().or(z.literal('')),
  contactEmail: z.string().email("Invalid email address.").optional().or(z.literal('')),
  contactMobile: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format.").optional().or(z.literal('')),
  address: z.string().max(200, "Address is too long.").optional().or(z.literal('')),
  logoImageHint: z.string().max(50, { message: "Hint should be max 50 characters."}).optional().or(z.literal('')),
  websiteIconImageHint: z.string().max(50, { message: "Hint should be max 50 characters."}).optional().or(z.literal('')),
});
type GeneralInfoFormData = z.infer<typeof generalInfoSchema>;

const contentPageSchema = z.object({
  title: z.string().min(2, "Title is too short.").max(100, "Title is too long."),
  content: z.string().optional().or(z.literal('')), // Content can be rich HTML
});
type ContentPageFormData = z.infer<typeof contentPageSchema>;

const socialMediaLinksSchema = z.object({
    facebook: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    instagram: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    twitter: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    linkedin: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    youtube: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
});
type SocialMediaLinksFormData = z.infer<typeof socialMediaLinksSchema>;


const knownPageSlugs = ["about-us", "contact-us", "careers", "terms-of-service", "privacy-policy", "faq", "help-center", "cancellation-policy"];
const pageDisplayNames: Record<string, string> = {
  "about-us": "About Us",
  "contact-us": "Contact Us",
  "careers": "Careers",
  "terms-of-service": "Terms of Service",
  "privacy-policy": "Privacy Policy",
  "faq": "FAQ",
  "help-center": "Help Center",
  "cancellation-policy": "Cancellation Policy",
};


export default function WebSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [globalSettings, setGlobalSettings] = useState<GlobalWebSettings>({});
  const [originalGlobalSettings, setOriginalGlobalSettings] = useState<GlobalWebSettings>({});
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [websiteIconFile, setWebsiteIconFile] = useState<File | null>(null);
  
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [websiteIconPreview, setWebsiteIconPreview] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<Record<string, number | null>>({});

  const [contentPages, setContentPages] = useState<ContentPage[]>([]);
  const [selectedPageSlug, setSelectedPageSlug] = useState<string>(knownPageSlugs[0]);
  const [isSavingContent, setIsSavingContent] = useState(false);


  const generalInfoForm = useForm<GeneralInfoFormData>({
    resolver: zodResolver(generalInfoSchema),
    defaultValues: { 
      websiteName: "", 
      contactEmail: "", 
      contactMobile: "", 
      address: "",
      logoImageHint: "",
      websiteIconImageHint: "",
    },
  });

  const contentPageForm = useForm<ContentPageFormData>({
    resolver: zodResolver(contentPageSchema),
    defaultValues: { title: "", content: "" },
  });

  const socialMediaForm = useForm<SocialMediaLinksFormData>({
    resolver: zodResolver(socialMediaLinksSchema),
    defaultValues: {
        facebook: "",
        instagram: "",
        twitter: "",
        linkedin: "",
        youtube: "",
    },
  });

  const loadGlobalSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as GlobalWebSettings;
        setGlobalSettings(data);
        setOriginalGlobalSettings(data);
        generalInfoForm.reset({
          websiteName: data.websiteName || "",
          contactEmail: data.contactEmail || "",
          contactMobile: data.contactMobile || "",
          address: data.address || "",
          logoImageHint: data.logoImageHint || "",
          websiteIconImageHint: data.websiteIconImageHint || "",
        });
        socialMediaForm.reset({
            facebook: data.socialMediaLinks?.facebook || "",
            instagram: data.socialMediaLinks?.instagram || "",
            twitter: data.socialMediaLinks?.twitter || "",
            linkedin: data.socialMediaLinks?.linkedin || "",
            youtube: data.socialMediaLinks?.youtube || "",
        });
        setLogoPreview(data.logoUrl || null);
        setFaviconPreview(data.faviconUrl || null);
        setWebsiteIconPreview(data.websiteIconUrl || null);
      } else {
        generalInfoForm.reset({ websiteName: "", contactEmail: "", contactMobile: "", address: "", logoImageHint: "", websiteIconImageHint: "" });
        socialMediaForm.reset({ facebook: "", instagram: "", twitter: "", linkedin: "", youtube: "" });
        setLogoPreview(null); setFaviconPreview(null); setWebsiteIconPreview(null);
        setOriginalGlobalSettings({});
      }
    } catch (error) {
      console.error("Error loading global settings:", error);
      toast({ title: "Error", description: "Could not load global settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, generalInfoForm, socialMediaForm]);

  const loadContentPages = useCallback(async () => {
     try {
      const q = query(collection(db, CONTENT_PAGES_COLLECTION), orderBy("title", "asc"));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const pages: ContentPage[] = [];
        querySnapshot.forEach((doc) => {
          pages.push({ id: doc.id, ...doc.data() } as ContentPage);
        });
        setContentPages(pages);
        
        knownPageSlugs.forEach(async (slug) => {
          if (!pages.find(p => p.slug === slug)) {
            const newPageData: ContentPage = {
              id: slug,
              slug: slug,
              title: pageDisplayNames[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              content: `Content for ${pageDisplayNames[slug] || slug} coming soon.`,
              updatedAt: Timestamp.now(),
            };
            try {
              await setDoc(doc(db, CONTENT_PAGES_COLLECTION, slug), newPageData);
            } catch (e) { console.error(`Error creating placeholder for ${slug}:`, e);}
          }
        });
      });
      return unsubscribe;
    } catch (error) {
      console.error("Error loading content pages:", error);
      toast({ title: "Error", description: "Could not load content pages.", variant: "destructive" });
    }
    return () => {};
  }, [toast]);

  useEffect(() => {
    loadGlobalSettings();
    const unsubscribeContentPages = loadContentPages();
    return () => {
      if (typeof unsubscribeContentPages === 'function') {
        unsubscribeContentPages();
      }
    };
  }, [loadGlobalSettings, loadContentPages]);

  useEffect(() => {
    if (selectedPageSlug) {
      const pageData = contentPages.find(p => p.slug === selectedPageSlug);
      if (pageData) {
        contentPageForm.reset({ title: pageData.title, content: pageData.content });
      } else {
        contentPageForm.reset({ 
            title: pageDisplayNames[selectedPageSlug] || selectedPageSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            content: "" 
        });
      }
    }
  }, [selectedPageSlug, contentPages, contentPageForm]);


  const handleSaveGeneralInfo = async (data: GeneralInfoFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const updateData: Partial<GlobalWebSettings> = {
        websiteName: data.websiteName,
        contactEmail: data.contactEmail,
        contactMobile: data.contactMobile,
        address: data.address,
        logoImageHint: data.logoImageHint || "",
        websiteIconImageHint: data.websiteIconImageHint || "",
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, updateData, { merge: true });
      setGlobalSettings(prev => ({ ...prev, ...updateData }));
      setOriginalGlobalSettings(prev => ({...prev, ...updateData}));
      toast({ title: "Success", description: "General information saved." });
    } catch (error) {
      console.error("Error saving general info:", error);
      toast({ title: "Error", description: "Could not save general information.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (file: File, assetType: 'logo' | 'favicon' | 'websiteIcon'): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const randomString = generateRandomHexString(8);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${assetType}_${timestamp}_${randomString}.${extension}`;
      const filePath = `public/uploads/branding/${fileName}`;
      const fileRef = storageRefStandard(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [assetType]: progress }));
        },
        (error) => {
          console.error(`Error uploading ${assetType}:`, error);
          setUploadProgress(prev => ({ ...prev, [assetType]: null }));
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setUploadProgress(prev => ({ ...prev, [assetType]: null }));
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };
  
  const handleSaveBrandingAsset = async (assetType: 'logo' | 'favicon' | 'websiteIcon') => {
    setIsSaving(true);
    setUploadProgress(prev => ({ ...prev, [assetType]: 0 }));

    let fileToUpload: File | null = null;
    let currentDbUrlKey: keyof GlobalWebSettings = 'logoUrl';
    let hintKey: keyof GeneralInfoFormData | null = null;
    
    let setPreviewState: React.Dispatch<React.SetStateAction<string | null>> = setLogoPreview;
    let setFileState: React.Dispatch<React.SetStateAction<File | null>> = setLogoFile;

    if (assetType === 'logo') {
      fileToUpload = logoFile; currentDbUrlKey = 'logoUrl'; hintKey = 'logoImageHint'; setPreviewState = setLogoPreview; setFileState = setLogoFile;
    } else if (assetType === 'favicon') {
      fileToUpload = faviconFile; currentDbUrlKey = 'faviconUrl'; setPreviewState = setFaviconPreview; setFileState = setFaviconFile;
    } else if (assetType === 'websiteIcon') {
      fileToUpload = websiteIconFile; currentDbUrlKey = 'websiteIconUrl'; hintKey = 'websiteIconImageHint'; setPreviewState = setWebsiteIconPreview; setFileState = setWebsiteIconFile;
    }

    const originalDbUrl = originalGlobalSettings[currentDbUrlKey] as string | undefined;
    const currentManualUrl = globalSettings[currentDbUrlKey] as string | undefined;
    let finalImageUrl = currentManualUrl || "";
    let finalImageHint = hintKey ? (generalInfoForm.getValues(hintKey) || "") : undefined;


    try {
      if (fileToUpload) {
        if (originalDbUrl && isFirebaseStorageUrl(originalDbUrl)) {
          try { await deleteObject(storageRefStandard(storage, originalDbUrl)); } 
          catch (e) { console.warn(`Old ${assetType} (DB) not deleted: ${e}`); }
        }
        finalImageUrl = await handleFileUpload(fileToUpload, assetType);
      } else {
        if (finalImageUrl === "" && originalDbUrl && isFirebaseStorageUrl(originalDbUrl)) {
          try { await deleteObject(storageRefStandard(storage, originalDbUrl)); } 
          catch (e) { console.warn(`Old ${assetType} (DB) not deleted on clear: ${e}`); }
        } else if (finalImageUrl !== originalDbUrl && originalDbUrl && isFirebaseStorageUrl(originalDbUrl)) {
          try { await deleteObject(storageRefStandard(storage, originalDbUrl)); } 
          catch (e) { console.warn(`Old ${assetType} (DB) not deleted on URL change: ${e}`); }
        }
      }
      
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const updateData: Partial<GlobalWebSettings> = { updatedAt: Timestamp.now(), [currentDbUrlKey]: finalImageUrl };
      if (hintKey !== null && finalImageHint !== undefined) {
        (updateData as any)[hintKey] = finalImageHint;
      }

      await setDoc(settingsDocRef, updateData, { merge: true });
      
      setGlobalSettings(prev => ({ ...prev, ...updateData }));
      setOriginalGlobalSettings(prev => ({ ...prev, ...updateData }));
      setPreviewState(finalImageUrl || null);
      setFileState(null);

      toast({ title: "Success", description: `${assetType.charAt(0).toUpperCase() + assetType.slice(1)} saved.` });
    } catch (error: any) {
      console.error(`Error saving ${assetType}:`, error);
      toast({ title: "Error", description: `Could not save ${assetType}. ${error.message}`, variant: "destructive" });
    } finally {
      setIsSaving(false);
      setUploadProgress(prev => ({ ...prev, [assetType]: null }));
    }
  };

  const handleManualUrlChange = (assetType: 'logo' | 'favicon' | 'websiteIcon', url: string) => {
    let currentDbUrlKey: keyof GlobalWebSettings = 'logoUrl';
    let setPreviewState: React.Dispatch<React.SetStateAction<string | null>> = setLogoPreview;
    let setFileState: React.Dispatch<React.SetStateAction<File | null>> = setLogoFile;

    if (assetType === 'logo') { currentDbUrlKey = 'logoUrl'; setPreviewState = setLogoPreview; setFileState = setLogoFile; }
    else if (assetType === 'favicon') { currentDbUrlKey = 'faviconUrl'; setPreviewState = setFaviconPreview; setFileState = setFaviconFile; }
    else if (assetType === 'websiteIcon') { currentDbUrlKey = 'websiteIconUrl'; setPreviewState = setWebsiteIconPreview; setFileState = setWebsiteIconFile; }
    
    setGlobalSettings(prev => ({ ...prev, [currentDbUrlKey]: url }));
    if (!eval(`${assetType}File`)) {
      setPreviewState(url || null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, assetType: 'logo' | 'favicon' | 'websiteIcon') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      let maxSizeMB = assetType === 'logo' ? 2 : (assetType === 'favicon' ? 0.5 : 1);
      let expectedTypes = assetType === 'favicon' ? ["image/x-icon", "image/png", "image/svg+xml"] : ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"];
      
      if (!expectedTypes.includes(file.type)) {
        toast({ title: "Invalid File Type", description: `Please select a valid image type (${expectedTypes.join(', ')}).`, variant: "destructive"});
        e.target.value = ""; return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast({ title: "File Too Large", description: `Image must be < ${maxSizeMB}MB.`, variant: "destructive" });
        e.target.value = ""; return;
      }

      if (assetType === 'logo') { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
      if (assetType === 'favicon') { setFaviconFile(file); setFaviconPreview(URL.createObjectURL(file)); }
      if (assetType === 'websiteIcon') { setWebsiteIconFile(file); setWebsiteIconPreview(URL.createObjectURL(file)); }
    }
  };

  const handleRemoveImage = (assetType: 'logo' | 'favicon' | 'websiteIcon') => {
    let setFile: React.Dispatch<React.SetStateAction<File | null>> = setLogoFile;
    let setPreview: React.Dispatch<React.SetStateAction<string | null>> = setLogoPreview;
    let urlKey: keyof GlobalWebSettings = 'logoUrl';
    let hintKey: keyof GeneralInfoFormData | null = null;

    if (assetType === 'logo') { setFile = setLogoFile; setPreview = setLogoPreview; urlKey = 'logoUrl'; hintKey = 'logoImageHint'; }
    else if (assetType === 'favicon') { setFile = setFaviconFile; setPreview = setFaviconPreview; urlKey = 'faviconUrl';}
    else if (assetType === 'websiteIcon') { setFile = setWebsiteIconFile; setPreview = setWebsiteIconPreview; urlKey = 'websiteIconUrl'; hintKey = 'websiteIconImageHint';}
    
    setFile(null);
    setPreview(null);
    setGlobalSettings(prev => ({ ...prev, [urlKey]: "" }));
    if (hintKey) generalInfoForm.setValue(hintKey, '');
  };

  const handleSaveContentPage = async (data: ContentPageFormData) => {
    if (!selectedPageSlug) {
      toast({ title: "Error", description: "No page selected to save.", variant: "destructive" });
      return;
    }
    setIsSavingContent(true);
    try {
      const pageDocRef = doc(db, CONTENT_PAGES_COLLECTION, selectedPageSlug);
      const pageData: ContentPage = {
        id: selectedPageSlug,
        slug: selectedPageSlug,
        title: data.title,
        content: data.content || "",
        updatedAt: Timestamp.now(),
      };
      await setDoc(pageDocRef, pageData, { merge: true });
      toast({ title: "Success", description: `${pageData.title} content saved.` });
    } catch (error) {
      console.error("Error saving content page:", error);
      toast({ title: "Error", description: "Could not save content page.", variant: "destructive" });
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleSaveSocialMediaLinks = async (data: SocialMediaLinksFormData) => {
    setIsSaving(true);
    try {
        const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
        const updateData: Partial<GlobalWebSettings> = {
            socialMediaLinks: {
                facebook: data.facebook || "",
                instagram: data.instagram || "",
                twitter: data.twitter || "",
                linkedin: data.linkedin || "",
                youtube: data.youtube || "",
            },
            updatedAt: Timestamp.now(),
        };
        await setDoc(settingsDocRef, updateData, { merge: true });
        setGlobalSettings(prev => ({ ...prev, ...updateData }));
        setOriginalGlobalSettings(prev => ({...prev, ...updateData}));
        toast({ title: "Success", description: "Social media links saved." });
    } catch (error) {
        console.error("Error saving social media links:", error);
        toast({ title: "Error", description: "Could not save social media links.", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };
  

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading web settings...</p>
      </div>
    );
  }
  
  const renderAssetUploader = (
    assetType: 'logo' | 'favicon' | 'websiteIcon',
    label: string,
    currentPreview: string | null,
    fileInputAccept: string,
    currentFile: File | null,
    hintFieldName?: keyof GeneralInfoFormData
  ) => (
    <div className="space-y-4 p-4 border rounded-md shadow-sm">
      <h3 className="text-lg font-semibold">{label}</h3>
      {currentPreview && isValidImageSrc(currentPreview) ? (
        <div className="my-2 relative w-32 h-32 rounded-md overflow-hidden border bg-muted/10">
          <NextImage src={currentPreview} alt={`${assetType} preview`} fill className="object-contain" unoptimized={currentPreview.startsWith('blob:')} />
        </div>
      ) : (
        <div className="my-2 flex items-center justify-center w-32 h-32 rounded-md border border-dashed bg-muted/10">
          <ImageIcon className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      
      <Label htmlFor={`${assetType}-file-upload`}>Upload New Image</Label>
      <Input id={`${assetType}-file-upload`} type="file" accept={fileInputAccept} onChange={(e) => handleFileChange(e, assetType)} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90" disabled={isSaving}/>
      {uploadProgress[assetType] && (
        <div className="mt-2"><Progress value={uploadProgress[assetType]!} className="w-full h-2" /><p className="text-xs text-muted-foreground mt-1">Uploading: {Math.round(uploadProgress[assetType]!)}%</p></div>
      )}

      <Label htmlFor={`${assetType}-url-input`}>Or Enter Image URL</Label>
      <Textarea 
        id={`${assetType}-url-input`}
        placeholder="https://example.com/image.png"
        value={globalSettings[assetType === 'logo' ? 'logoUrl' : assetType === 'favicon' ? 'faviconUrl' : 'websiteIconUrl'] || ""}
        onChange={(e) => handleManualUrlChange(assetType, e.target.value)}
        disabled={isSaving || !!currentFile}
        rows={2}
      />

      {hintFieldName && assetType !== 'favicon' && (
          <FormField
              control={generalInfoForm.control}
              name={hintFieldName}
              render={({ field }) => (
                  <FormItem>
                      <FormLabel>{assetType.charAt(0).toUpperCase() + assetType.slice(1)} Image AI Hint (Optional)</FormLabel>
                      <FormControl>
                          <Input placeholder={`e.g., company ${assetType}`} {...field} disabled={isSaving} />
                      </FormControl>
                      <FormDescription>One or two keywords for AI image search. Max 50 characters.</FormDescription>
                      <FormMessage />
                  </FormItem>
              )}
          />
      )}

      <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:items-center sm:gap-2 mt-2">
        <Button onClick={() => handleSaveBrandingAsset(assetType)} disabled={isSaving || !!uploadProgress[assetType]} className="w-full sm:w-auto">
          {isSaving && !uploadProgress[assetType] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save {label}
        </Button>
        {(currentPreview || currentFile) && <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(assetType)} disabled={isSaving} className="w-full sm:w-auto"><Trash2 className="h-4 w-4 text-destructive"/> Remove</Button>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings2 className="mr-2 h-6 w-6 text-primary" /> Website Settings
          </CardTitle>
          <CardDescription>
            Manage global website information, branding assets, and content pages.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <TabsTrigger value="general"><Building className="mr-2 h-4 w-4" />General Info</TabsTrigger>
          <TabsTrigger value="branding"><ImageIcon className="mr-2 h-4 w-4" />Branding</TabsTrigger>
          <TabsTrigger value="social_media"><ExternalLink className="mr-2 h-4 w-4" />Social Media</TabsTrigger>
          <TabsTrigger value="content"><FileText className="mr-2 h-4 w-4" />Content Pages</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General Information</CardTitle></CardHeader>
            <Form {...generalInfoForm}>
              <form onSubmit={generalInfoForm.handleSubmit(handleSaveGeneralInfo)}>
                <CardContent className="space-y-4">
                  <FormField control={generalInfoForm.control} name="websiteName" render={({ field }) => (<FormItem><FormLabel>Website Name</FormLabel><FormControl><Input placeholder="e.g., Wecanfix Services" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={generalInfoForm.control} name="contactEmail" render={({ field }) => (<FormItem><FormLabel>Contact Email</FormLabel><FormControl><Input type="email" placeholder="e.g., support@wecanfix.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={generalInfoForm.control} name="contactMobile" render={({ field }) => (<FormItem><FormLabel>Contact Mobile</FormLabel><FormControl><Input type="tel" placeholder="e.g., +919876543210" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={generalInfoForm.control} name="address" render={({ field }) => (<FormItem><FormLabel>Company Address</FormLabel><FormControl><Textarea placeholder="123 Main St, Anytown, ST 12345" {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save General Info
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader><CardTitle>Branding Assets</CardTitle><CardDescription>Upload your website's logo, favicon, and general icon, or provide direct URLs.</CardDescription></CardHeader>
             <Form {...generalInfoForm}>
                <CardContent className="space-y-6">
                  {renderAssetUploader('logo', 'Website Logo', logoPreview, "image/png, image/jpeg, image/svg+xml, image/webp", logoFile, "logoImageHint")}
                  {renderAssetUploader('favicon', 'Favicon', faviconPreview, "image/x-icon, image/png, image/svg+xml", faviconFile)}
                  {renderAssetUploader('websiteIcon', 'Website Icon (PWA/Social)', websiteIconPreview, "image/png, image/jpeg, image/svg+xml, image/webp", websiteIconFile, "websiteIconImageHint")}
                </CardContent>
             </Form>
          </Card>
        </TabsContent>
        
        <TabsContent value="social_media">
          <Card>
            <CardHeader>
                <CardTitle>Social Media Links</CardTitle>
                <CardDescription>Enter the full URLs for your social media profiles.</CardDescription>
            </CardHeader>
            <Form {...socialMediaForm}>
                <form onSubmit={socialMediaForm.handleSubmit(handleSaveSocialMediaLinks)}>
                    <CardContent className="space-y-4">
                        <FormField control={socialMediaForm.control} name="facebook" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Facebook className="mr-2 h-4 w-4 text-blue-600"/>Facebook URL</FormLabel><FormControl><Input placeholder="https://facebook.com/yourpage" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="instagram" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Instagram className="mr-2 h-4 w-4 text-pink-600"/>Instagram URL</FormLabel><FormControl><Input placeholder="https://instagram.com/yourprofile" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="twitter" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><TwitterIcon className="mr-2 h-4 w-4 text-sky-500"/>Twitter (X) URL</FormLabel><FormControl><Input placeholder="https://twitter.com/yourhandle" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="linkedin" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Linkedin className="mr-2 h-4 w-4 text-blue-700"/>LinkedIn URL</FormLabel><FormControl><Input placeholder="https://linkedin.com/company/yourcompany" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="youtube" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Youtube className="mr-2 h-4 w-4 text-red-600"/>YouTube URL</FormLabel><FormControl><Input placeholder="https://youtube.com/yourchannel" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Social Media Links
                        </Button>
                    </CardFooter>
                </form>
            </Form>
          </Card>
        </TabsContent>


        <TabsContent value="content">
          <Card>
            <CardHeader>
                <CardTitle>Content Pages</CardTitle>
                <CardDescription>Select a page to edit its title and content using the rich text editor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                  <Label htmlFor="select-page">Select Page to Edit</Label>
                  <Select value={selectedPageSlug} onValueChange={setSelectedPageSlug} disabled={isSavingContent}>
                    <SelectTrigger id="select-page"><SelectValue placeholder="Choose a page" /></SelectTrigger>
                    <SelectContent>
                      {contentPages.map(page => (
                        <SelectItem key={page.slug} value={page.slug}>{page.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3">
                {selectedPageSlug && (
                    <Form {...contentPageForm}>
                    <form onSubmit={contentPageForm.handleSubmit(handleSaveContentPage)} className="space-y-4">
                        <FormField control={contentPageForm.control} name="title" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Page Title</FormLabel>
                                <FormControl><Input placeholder="Page Title" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={contentPageForm.control} name="content" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Page Content</FormLabel>
                                <FormControl>
                                  <Textarea 
                                    placeholder="Write your page content here..."
                                    rows={20}
                                    {...field}
                                    value={field.value || ""}
                                    disabled={isSavingContent}
                                  />
                                </FormControl>
                                <FormDescription>
                                  <Link href={`/${selectedPageSlug}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary underline">
                                    <ExternalLink className="inline h-3 w-3 mr-1"/>View Live Page (if route exists)
                                  </Link>
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <Button type="submit" disabled={isSavingContent}>
                            {isSavingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Content for {pageDisplayNames[selectedPageSlug] || selectedPageSlug}
                        </Button>
                    </form>
                    </Form>
                )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
