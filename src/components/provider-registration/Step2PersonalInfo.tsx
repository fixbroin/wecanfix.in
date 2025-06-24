
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import type { ProviderApplication, ProviderControlOptions, LanguageOption, QualificationOption } from '@/types/firestore';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2, User, Mail, Phone, MapPin, BookOpen, Languages, Camera, Image as ImageIcon, Trash2 } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};


const step2PersonalInfoSchema = z.object({
  fullName: z.string().min(2, "Full name is required.").max(100),
  email: z.string().email("Invalid email.").optional().or(z.literal('')),
  mobileNumber: z.string().min(10, "Valid mobile number required.").max(15).regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format."),
  address: z.string().min(5, "Address is required.").max(250),
  age: z.coerce.number().min(18, "Must be at least 18.").max(99, "Age seems incorrect."),
  qualificationId: z.string({ required_error: "Please select your qualification." }),
  alternateMobile: z.string().max(15).regex(/^\+?[1-9]\d{1,14}$/, "Invalid alternate phone format.").optional().or(z.literal('')),
  languagesSpokenIds: z.array(z.string()).min(1, "Select at least one language spoken.").max(5, "Select up to 5 languages."),
  profilePhotoUrl: z.string().url("Invalid photo URL.").optional().nullable(),
});

type Step2FormData = z.infer<typeof step2PersonalInfoSchema>;

interface Step2PersonalInfoProps {
  onNext: (data: Partial<ProviderApplication>, uploadedPhotoUrl?: string | null) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string; // Needed for storage path
}

export default function Step2PersonalInfo({
  onNext,
  onPrevious,
  initialData,
  controlOptions,
  isSaving,
  userUid,
}: Step2PersonalInfoProps) {
  const { toast } = useToast();
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(initialData.profilePhotoUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<Step2FormData>({
    resolver: zodResolver(step2PersonalInfoSchema),
    defaultValues: {
      fullName: initialData?.fullName || "",
      email: initialData?.email || "",
      mobileNumber: initialData?.mobileNumber || "",
      address: initialData?.address || "",
      age: initialData?.age ?? '', // Changed from undefined to empty string
      qualificationId: initialData?.qualificationId || undefined,
      alternateMobile: initialData?.alternateMobile || "",
      languagesSpokenIds: initialData?.languagesSpokenIds || [],
      profilePhotoUrl: initialData?.profilePhotoUrl || null,
    },
  });
  
  useEffect(() => {
    form.reset({
      fullName: initialData.fullName || "",
      email: initialData.email || "",
      mobileNumber: initialData.mobileNumber || "",
      address: initialData.address || "",
      age: initialData.age ?? '', // Changed from undefined to empty string
      qualificationId: initialData.qualificationId || undefined,
      alternateMobile: initialData.alternateMobile || "",
      languagesSpokenIds: initialData.languagesSpokenIds || [],
      profilePhotoUrl: initialData.profilePhotoUrl || null,
    });
    setCurrentImagePreview(initialData.profilePhotoUrl || null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialData, form]);


  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({ title: "File Too Large", description: "Image must be < 2MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null); setCurrentImagePreview(form.getValues('profilePhotoUrl') || initialData.profilePhotoUrl || null); return;
      }
      setSelectedFile(file); setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('profilePhotoUrl', null, { shouldValidate: false }); // Clear URL if file selected
    } else {
      setSelectedFile(null); setCurrentImagePreview(form.getValues('profilePhotoUrl') || initialData.profilePhotoUrl || null);
    }
  };

  const handleRemoveImage = () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) URL.revokeObjectURL(currentImagePreview);
    setSelectedFile(null); setCurrentImagePreview(null);
    form.setValue('profilePhotoUrl', null, { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (data: Step2FormData) => {
    let finalPhotoUrl = data.profilePhotoUrl || null; // Start with existing or manually entered URL

    if (selectedFile) {
      setStatusMessage("Uploading profile photo..."); setUploadProgress(0);
      try {
        // Delete old photo if it exists and is a Firebase Storage URL
        if (initialData.profilePhotoUrl && isFirebaseStorageUrl(initialData.profilePhotoUrl)) {
          try { await deleteObject(storageRefStandard(storage, initialData.profilePhotoUrl)); }
          catch (e) { console.warn("Old profile photo not deleted:", e); }
        }

        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const randomString = generateRandomHexString(8);
        const fileName = `profile_photo_${randomString}.${extension}`;
        const imagePath = `provider_profiles/${userUid}/${fileName}`;
        const imageRef = storageRefStandard(storage, imagePath);
        const uploadTask = uploadBytesResumable(imageRef, selectedFile);

        finalPhotoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => { console.error("Photo upload error:", error); reject(error); },
            async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); } }
          );
        });
        setStatusMessage("Photo uploaded.");
      } catch (uploadError) {
        toast({ title: "Photo Upload Failed", description: (uploadError as Error).message || "Could not upload photo.", variant: "destructive" });
        setStatusMessage(""); setUploadProgress(null); return; // Stop submission if upload fails
      }
    } else if (!finalPhotoUrl && initialData.profilePhotoUrl && isFirebaseStorageUrl(initialData.profilePhotoUrl)) {
      // User cleared the URL and didn't select a new file, so delete the old one
      setStatusMessage("Removing profile photo...");
      try { await deleteObject(storageRefStandard(storage, initialData.profilePhotoUrl)); finalPhotoUrl = null; }
      catch (e) { console.warn("Old profile photo not deleted:", e); }
      setStatusMessage("Photo removed.");
    }
    
    const qualification = controlOptions?.qualificationOptions.find(q => q.id === data.qualificationId);
    const languages = controlOptions?.languageOptions.filter(lang => data.languagesSpokenIds.includes(lang.id));

    const applicationStepData: Partial<ProviderApplication> = {
      ...data,
      age: Number(data.age) || undefined, // Ensure age is number or undefined
      profilePhotoUrl: finalPhotoUrl,
      qualificationLabel: qualification?.label,
      languagesSpokenLabels: languages?.map(l => l.label),
    };
    onNext(applicationStepData, finalPhotoUrl === undefined ? initialData.profilePhotoUrl : finalPhotoUrl); // Pass the potentially new URL
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSaving = isSaving || statusMessage.startsWith("Uploading");


  if (!controlOptions) {
    return <Card><CardContent className="pt-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /> Loading options...</CardContent></Card>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <CardContent className="space-y-6">
          <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><User className="mr-2 h-4 w-4 text-muted-foreground"/>Full Name</FormLabel><FormControl><Input placeholder="Your full name" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground"/>Email (Optional)</FormLabel><FormControl><Input type="email" placeholder="your.email@example.com" {...field} disabled={effectiveIsSaving} /></FormControl><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="mobileNumber" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Mobile Number</FormLabel><FormControl><Input type="tel" placeholder="+91 XXXXX XXXXX" {...field} disabled={effectiveIsSaving} /></FormControl><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><MapPin className="mr-2 h-4 w-4 text-muted-foreground"/>Current Address</FormLabel><FormControl><Textarea placeholder="Your full residential address" {...field} rows={3} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
          <FormField 
            control={form.control} 
            name="age" 
            render={({ field }) => {
              // Ensure field.value is a string for the input, or empty string if null/undefined
              const inputValue = field.value === undefined || field.value === null ? '' : String(field.value);
              return (
                <FormItem>
                  <FormLabel>Age</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="e.g., 25" 
                      {...field} 
                      value={inputValue}
                      onChange={(e) => {
                        // Let react-hook-form and Zod handle coercion from string to number
                        field.onChange(e.target.value === '' ? null : e.target.value); 
                      }}
                      disabled={effectiveIsSaving}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
          <FormField control={form.control} name="qualificationId" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><BookOpen className="mr-2 h-4 w-4 text-muted-foreground"/>Highest Qualification</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={effectiveIsSaving}><FormControl><SelectTrigger><SelectValue placeholder="Select qualification" /></SelectTrigger></FormControl><SelectContent>{controlOptions.qualificationOptions.map(opt => (<SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="alternateMobile" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Alternate Mobile (Optional)</FormLabel><FormControl><Input type="tel" placeholder="+91 XXXXX XXXXX" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
          
          <FormItem>
            <FormLabel className="flex items-center"><Languages className="mr-2 h-4 w-4 text-muted-foreground"/>Languages Spoken (Select at least one)</FormLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 border rounded-md max-h-40 overflow-y-auto">
              {controlOptions.languageOptions.map((language) => (
                <FormField key={language.id} control={form.control} name="languagesSpokenIds"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0 p-1.5 rounded hover:bg-accent/50">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(language.id)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([...(field.value || []), language.id])
                              : field.onChange((field.value || []).filter((id) => id !== language.id));
                          }}
                          disabled={effectiveIsSaving}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">{language.label}</FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
             <FormMessage>{form.formState.errors.languagesSpokenIds?.message}</FormMessage>
          </FormItem>

          <FormItem>
            <FormLabel className="flex items-center"><Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Profile Photo (Optional)</FormLabel>
            {displayPreviewUrl ? (<div className="my-2 relative w-28 h-28 rounded-full overflow-hidden border-2 border-muted bg-muted/30 mx-auto"><NextImage src={displayPreviewUrl} alt="Profile preview" fill className="object-cover" data-ai-hint="person profile" unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="112px"/></div>) : (<div className="my-2 flex items-center justify-center w-28 h-28 rounded-full border-2 border-dashed bg-muted/30 mx-auto"><ImageIcon className="h-10 w-10 text-muted-foreground" /></div>)}
            <FormControl><Input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileSelected} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90" disabled={effectiveIsSaving}/></FormControl>
            <FormDescription>PNG, JPG, WEBP. Max 2MB.</FormDescription>
            {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)}
            {(displayPreviewUrl || selectedFile) && (<Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage} disabled={effectiveIsSaving} className="mt-1 text-xs"><Trash2 className="h-3 w-3 mr-1 text-destructive"/>Remove Photo</Button>)}
          </FormItem>

        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={effectiveIsSaving}>Previous</Button>
          <Button type="submit" disabled={effectiveIsSaving}>
            {effectiveIsSaving && !statusMessage.startsWith("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             {statusMessage && statusMessage.startsWith("Uploading") ? statusMessage : effectiveIsSaving ? "Saving..." : "Save & Continue"}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}

