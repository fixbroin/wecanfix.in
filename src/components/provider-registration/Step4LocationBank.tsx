
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProviderApplication, ProviderControlOptions, BankDetails } from '@/types/firestore';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, Banknote, Camera, Image as ImageIcon, Trash2, Check, Lock, SelectMapIcon } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { nanoid } from 'nanoid';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import dynamic from 'next/dynamic';

const ZoneMapSelector = dynamic(() => import('@/components/admin/ZoneMapSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false
});

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const DEFAULT_MAP_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore

// We need to create a schema factory to pass the max radius dynamically.
const createStep4Schema = (maxRadius: number) => z.object({
  workAreaCenter: z.object({
    lat: z.number({ required_error: "Please select a location on the map." }),
    lng: z.number({ required_error: "Please select a location on the map." }),
  }),
  workAreaRadiusKm: z.coerce.number().min(1, "Radius must be at least 1 km.").max(maxRadius, `Radius cannot exceed the maximum of ${maxRadius} km.`),
  bankName: z.string().min(2, "Bank name is required.").max(100),
  accountHolderName: z.string().min(2, "Account holder name is required.").max(100),
  accountNumber: z.string().min(5, "Account number seems too short.").max(25, "Account number too long."),
  confirmAccountNumber: z.string(),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format (e.g., SBIN0001234).").length(11, "IFSC code must be 11 characters."),
  cancelledChequeUrl: z.string().url("Invalid URL for cheque.").optional().nullable(),
  signatureUrl: z.string().url("Invalid URL for signature.").optional().nullable(),
  termsConfirmation: z.boolean().refine(value => value === true, {
    message: "You must agree to the terms and conditions.",
  }),
}).refine(data => data.accountNumber === data.confirmAccountNumber, {
  message: "Account numbers do not match.",
  path: ["confirmAccountNumber"],
});

type Step4FormData = z.infer<ReturnType<typeof createStep4Schema>>;

interface Step4LocationBankProps {
  onSubmit: (data: Partial<ProviderApplication>) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string;
  isEditModeByAdmin?: boolean;
}

export default function Step4LocationBank({
  onSubmit,
  onPrevious,
  initialData,
  isSaving,
  userUid,
}: Step4LocationBankProps) {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [currentChequePreview, setCurrentChequePreview] = useState<string | null>(null);
  const [selectedChequeFile, setSelectedChequeFile] = useState<File | null>(null);
  const chequeFileInputRef = useRef<HTMLInputElement>(null);
  const [chequeUploadProgress, setChequeUploadProgress] = useState<number | null>(null);
  const [chequeStatusMessage, setChequeStatusMessage] = useState("");
  const [isFormBusyForCheque, setIsFormBusyForCheque] = useState(false);

  const [currentSignaturePreview, setCurrentSignaturePreview] = useState<string | null>(null);
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const signatureFileInputRef = useRef<HTMLInputElement>(null);
  const [signatureUploadProgress, setSignatureUploadProgress] = useState<number | null>(null);
  const [signatureStatusMessage, setSignatureStatusMessage] = useState("");
  const [isFormBusyForSignature, setIsFormBusyForSignature] = useState(false);

  const maxRadius = appConfig.maxProviderRadiusKm || 50;
  const step4Schema = createStep4Schema(maxRadius);
  
  const form = useForm<Step4FormData>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      workAreaCenter: initialData.workAreaCenter ? { lat: initialData.workAreaCenter.latitude, lng: initialData.workAreaCenter.longitude } : DEFAULT_MAP_CENTER,
      workAreaRadiusKm: initialData.workAreaRadiusKm || 5,
      bankName: initialData.bankDetails?.bankName || "",
      accountHolderName: initialData.bankDetails?.accountHolderName || "",
      accountNumber: initialData.bankDetails?.accountNumber || "",
      confirmAccountNumber: initialData.bankDetails?.accountNumber || "",
      ifscCode: initialData.bankDetails?.ifscCode || "",
      cancelledChequeUrl: initialData.bankDetails?.cancelledChequeUrl || null,
      signatureUrl: initialData.signatureUrl || null,
      termsConfirmation: initialData.termsConfirmedAt ? true : false,
    },
  });

  useEffect(() => {
    form.reset({
      workAreaCenter: initialData.workAreaCenter ? { lat: initialData.workAreaCenter.latitude, lng: initialData.workAreaCenter.longitude } : DEFAULT_MAP_CENTER,
      workAreaRadiusKm: initialData.workAreaRadiusKm || 5,
      bankName: initialData.bankDetails?.bankName || "",
      accountHolderName: initialData.bankDetails?.accountHolderName || "",
      accountNumber: initialData.bankDetails?.accountNumber || "",
      confirmAccountNumber: initialData.bankDetails?.accountNumber || "",
      ifscCode: initialData.bankDetails?.ifscCode || "",
      cancelledChequeUrl: initialData.bankDetails?.cancelledChequeUrl || null,
      signatureUrl: initialData.signatureUrl || null,
      termsConfirmation: initialData.termsConfirmedAt ? true : false,
    });
    setCurrentChequePreview(initialData.bankDetails?.cancelledChequeUrl || null);
    setSelectedChequeFile(null);
    if (chequeFileInputRef.current) chequeFileInputRef.current.value = "";
    
    setCurrentSignaturePreview(initialData.signatureUrl || null);
    setSelectedSignatureFile(null);
    if (signatureFileInputRef.current) signatureFileInputRef.current.value = "";
  }, [initialData, form]);

  const handleFileUpload = async (
    file: File,
    storageFolder: string,
    fileTypeLabel: string,
    existingUrl: string | null | undefined,
    setUploadProgressFn: React.Dispatch<React.SetStateAction<number | null>>,
    setStatusMessageFn: React.Dispatch<React.SetStateAction<string>>
  ): Promise<{ url: string; fileName: string } | null> => {
    setStatusMessageFn(`Uploading ${fileTypeLabel}...`);
    setUploadProgressFn(0);
    try {
      if (existingUrl && isFirebaseStorageUrl(existingUrl)) {
        try { await deleteObject(storageRefStandard(storage, existingUrl)); }
        catch (e) { console.warn(`Old ${fileTypeLabel} image not deleted:`, e); }
      }
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const randomString = generateRandomHexString(8);
      const autoFileName = `${fileTypeLabel.toLowerCase().replace(/\s+/g, '_')}_${randomString}.${extension}`;
      const imagePath = `provider_documents/${userUid}/${storageFolder}/${autoFileName}`;
      const imageRef = storageRefStandard(storage, imagePath);
      const uploadTask = uploadBytesResumable(imageRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => setUploadProgressFn((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          (error) => reject(error),
          async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); } }
        );
      });
      setStatusMessageFn(`${fileTypeLabel} uploaded.`);
      return { url: downloadURL, fileName: file.name };
    } catch (uploadError) {
      toast({ title: `${fileTypeLabel} Upload Failed`, description: (uploadError as Error).message || `Could not upload ${fileTypeLabel}.`, variant: "destructive" });
      setStatusMessageFn(""); setUploadProgressFn(null);
      throw uploadError;
    }
  };

  const handleSubmit = async (data: Step4FormData) => {
    if (!data.termsConfirmation) {
        form.setError("termsConfirmation", { type: "manual", message: "You must confirm the information." });
        return;
    }
    if (!selectedSignatureFile && !data.signatureUrl) {
        form.setError("signatureUrl", { type: "manual", message: "Signature image is required. Please upload or provide a URL." });
        toast({title: "Signature Missing", description: "Signature image is required.", variant: "destructive"});
        return;
    }

    setIsFormBusyForCheque(!!selectedChequeFile);
    setIsFormBusyForSignature(!!selectedSignatureFile);

    let finalChequeUrl = data.cancelledChequeUrl || null;
    let finalChequeFileName = initialData.bankDetails?.cancelledChequeFileName || null;

    let finalSignatureUrl = data.signatureUrl || null;
    let finalSignatureFileName = initialData.signatureFileName || null;

    try {
      if (selectedChequeFile) {
        const chequeUploadResult = await handleFileUpload(selectedChequeFile, 'bank', 'Cancelled Cheque', initialData.bankDetails?.cancelledChequeUrl, setChequeUploadProgress, setChequeStatusMessage);
        finalChequeUrl = chequeUploadResult?.url || null;
        finalChequeFileName = chequeUploadResult?.fileName || null;
      } else if (!data.cancelledChequeUrl && initialData.bankDetails?.cancelledChequeUrl && isFirebaseStorageUrl(initialData.bankDetails.cancelledChequeUrl)) {
        setChequeStatusMessage("Removing cheque image...");
        try { await deleteObject(storageRefStandard(storage, initialData.bankDetails.cancelledChequeUrl)); finalChequeUrl = null; finalChequeFileName = null;}
        catch (e) { console.warn("Old cheque image not deleted:", e); }
        setChequeStatusMessage("Cheque image removed.");
      }

      if (selectedSignatureFile) {
        const signatureUploadResult = await handleFileUpload(selectedSignatureFile, 'signature', 'Signature', initialData.signatureUrl, setSignatureUploadProgress, setSignatureStatusMessage);
        finalSignatureUrl = signatureUploadResult?.url || null;
        finalSignatureFileName = signatureUploadResult?.fileName || null;
      } else if (!data.signatureUrl && initialData.signatureUrl && isFirebaseStorageUrl(initialData.signatureUrl)) {
        setSignatureStatusMessage("Removing signature image...");
        try { await deleteObject(storageRefStandard(storage, initialData.signatureUrl)); finalSignatureUrl = null; finalSignatureFileName = null;}
        catch (e) { console.warn("Old signature image not deleted:", e); }
        setSignatureStatusMessage("Signature image removed.");
      }
      
      if (!finalSignatureUrl) { 
        toast({ title: "Signature Required", description: "Please upload your signature image to proceed.", variant: "destructive" });
        setIsFormBusyForCheque(false); setIsFormBusyForSignature(false);
        return;
      }

      const bankDetailsData: BankDetails = {
        bankName: data.bankName,
        accountHolderName: data.accountHolderName,
        accountNumber: data.accountNumber,
        ifscCode: data.ifscCode.toUpperCase(),
        cancelledChequeUrl: finalChequeUrl || undefined,
        cancelledChequeFileName: finalChequeFileName || undefined,
        verified: initialData.bankDetails?.verified || false,
      };
      
      const applicationStepData: Partial<ProviderApplication> = {
        workAreaCenter: {
          latitude: data.workAreaCenter.lat,
          longitude: data.workAreaCenter.lng,
        },
        workAreaRadiusKm: data.workAreaRadiusKm,
        bankDetails: bankDetailsData,
        termsConfirmedAt: data.termsConfirmation ? Timestamp.now() : undefined,
        signatureUrl: finalSignatureUrl,
        signatureFileName: finalSignatureFileName,
      };
      onSubmit(applicationStepData);

    } catch (error) {
      console.error("Error in Step 4 submission:", error);
    } finally {
      setIsFormBusyForCheque(false);
      setIsFormBusyForSignature(false);
      setChequeStatusMessage(""); setSignatureStatusMessage("");
      setChequeUploadProgress(null); setSignatureUploadProgress(null);
    }
  };

  const displayChequePreviewUrl = isValidImageSrc(currentChequePreview) ? currentChequePreview : null;
  const displaySignaturePreviewUrl = isValidImageSrc(currentSignaturePreview) ? currentSignaturePreview : null;
  const effectiveIsSaving = isSaving || isFormBusyForCheque || isFormBusyForSignature;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <CardContent className="space-y-6">
          <Card className="p-4">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg flex items-center"><MapPin className="mr-2 h-5 w-5 text-primary"/>Work Area</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-3">
              <FormItem>
                <FormLabel>Set Work Area Center & Radius</FormLabel>
                <FormDescription>Click on the map to set your primary work location center, then specify your service radius.</FormDescription>
                <div className="h-[350px] w-full rounded-md overflow-hidden border mt-2">
                  {isLoadingAppSettings || !appConfig.googleMapsApiKey ? (
                    <div className="flex items-center justify-center h-full bg-muted"><p>Map configuration loading or missing...</p></div>
                  ) : (
                    <ZoneMapSelector
                      apiKey={appConfig.googleMapsApiKey}
                      center={form.watch('workAreaCenter')}
                      radiusKm={form.watch('workAreaRadiusKm')}
                      onCenterChange={(center) => form.setValue("workAreaCenter", center)}
                    />
                  )}
                </div>
              </FormItem>
              <FormField control={form.control} name="workAreaRadiusKm" render={({ field }) => (<FormItem><FormLabel>Service Radius (in kilometers)</FormLabel><FormControl><Input type="number" step="1" placeholder="e.g., 10" {...field} disabled={effectiveIsSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg flex items-center"><Banknote className="mr-2 h-5 w-5 text-primary"/>Bank Account Details</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              <FormField control={form.control} name="accountHolderName" render={({ field }) => (<FormItem><FormLabel>Account Holder Name</FormLabel><FormControl><Input placeholder="As per bank records" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="bankName" render={({ field }) => (<FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input placeholder="e.g., State Bank of India" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="accountNumber" render={({ field }) => (<FormItem><FormLabel>Account Number</FormLabel><FormControl><Input placeholder="Enter bank account number" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="confirmAccountNumber" render={({ field }) => (<FormItem><FormLabel>Confirm Account Number</FormLabel><FormControl><Input placeholder="Re-enter account number" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="ifscCode" render={({ field }) => (<FormItem><FormLabel>IFSC Code</FormLabel><FormControl><Input placeholder="e.g., SBIN0001234" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormItem>
                <FormLabel className="flex items-center"><Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Upload Cancelled Cheque (Optional)</FormLabel>
                {displayChequePreviewUrl ? (<div className="my-2 relative w-full aspect-[2/1] max-h-40 rounded-md overflow-hidden border bg-muted/30"><NextImage src={displayChequePreviewUrl} alt="Cheque preview" fill className="object-contain p-1" unoptimized={displayChequePreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/></div>) : (<div className="my-2 flex items-center justify-center w-full aspect-[2/1] max-h-40 rounded-md border border-dashed bg-muted/30"><ImageIcon className="h-10 w-10 text-muted-foreground" /></div>)}
                <FormControl><Input type="file" accept="image/png, image/jpeg, image/webp" onChange={(e) => { if (e.target.files && e.target.files[0]) {const file = e.target.files[0]; if (file.size > 2 * 1024 * 1024) { toast({ title: "File Too Large", description: "Image must be < 2MB.", variant: "destructive" }); e.target.value = ""; return; } setSelectedChequeFile(file); setCurrentChequePreview(URL.createObjectURL(file)); form.setValue('cancelledChequeUrl', null, { shouldValidate: false }); } else { setSelectedChequeFile(null); setCurrentChequePreview(form.getValues('cancelledChequeUrl') || initialData.bankDetails?.cancelledChequeUrl || null); }}} ref={chequeFileInputRef} className="file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" disabled={effectiveIsSaving}/></FormControl>
                <FormDescription>Clear image of a cancelled cheque. Max 2MB.</FormDescription>
                {chequeUploadProgress !== null && selectedChequeFile && (<div className="mt-2"><Progress value={chequeUploadProgress} className="w-full h-1.5" />{chequeStatusMessage && <p className="text-xs text-muted-foreground mt-1">{chequeStatusMessage}</p>}</div>)}
                {(displayChequePreviewUrl || selectedChequeFile) && (<Button type="button" variant="ghost" size="sm" onClick={() => { if (selectedChequeFile && currentChequePreview?.startsWith('blob:')) URL.revokeObjectURL(currentChequePreview); setSelectedChequeFile(null); setCurrentChequePreview(null); form.setValue('cancelledChequeUrl', null, {shouldValidate: true}); if (chequeFileInputRef.current) chequeFileInputRef.current.value = "";}} disabled={effectiveIsSaving} className="text-xs mt-1"><Trash2 className="h-3 w-3 mr-1 text-destructive"/>Remove Cheque Image</Button>)}
              </FormItem>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg flex items-center"><Lock className="mr-2 h-5 w-5 text-primary"/>Confirmation &amp; Signature</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              <FormItem>
                <FormLabel className="flex items-center"><Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Upload Signature <span className="text-destructive">*</span></FormLabel>
                {displaySignaturePreviewUrl ? (<div className="my-2 relative w-full aspect-[3/1] max-h-28 rounded-md overflow-hidden border bg-muted/30"><NextImage src={displaySignaturePreviewUrl} alt="Signature preview" fill className="object-contain p-1" unoptimized={displaySignaturePreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/></div>) : (<div className="my-2 flex items-center justify-center w-full aspect-[3/1] max-h-28 rounded-md border border-dashed bg-muted/30"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>)}
                <FormControl>
                    <Input 
                        type="file" 
                        accept="image/png, image/jpeg" 
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              if (file.size > 1 * 1024 * 1024) { 
                                toast({ title: "Signature File Too Large", description: "Signature image must be less than 1MB.", variant: "destructive" });
                                if (signatureFileInputRef.current) signatureFileInputRef.current.value = "";
                                setSelectedSignatureFile(null); setCurrentSignaturePreview(form.getValues('signatureUrl') || initialData.signatureUrl || null); return;
                              }
                              setSelectedSignatureFile(file); setCurrentSignaturePreview(URL.createObjectURL(file));
                              form.setValue('signatureUrl', null, { shouldValidate: true }); 
                            } else {
                              setSelectedSignatureFile(null); setCurrentSignaturePreview(form.getValues('signatureUrl') || initialData.signatureUrl || null);
                            }
                        }} 
                        ref={signatureFileInputRef} 
                        className="file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
                        disabled={effectiveIsSaving}
                    />
                </FormControl>
                <FormDescription>Clear image of your signature. Max 1MB (PNG, JPG).</FormDescription>
                {signatureUploadProgress !== null && selectedSignatureFile && (<div className="mt-2"><Progress value={signatureUploadProgress} className="w-full h-1.5" />{signatureStatusMessage && <p className="text-xs text-muted-foreground mt-1">{signatureStatusMessage}</p>}</div>)}
                {(displaySignaturePreviewUrl || selectedSignatureFile) && (<Button type="button" variant="ghost" size="sm" onClick={() => { if (selectedSignatureFile && currentSignaturePreview?.startsWith('blob:')) URL.revokeObjectURL(currentSignaturePreview); setSelectedSignatureFile(null); setCurrentSignaturePreview(null); form.setValue('signatureUrl', null, {shouldValidate: true}); if (signatureFileInputRef.current) signatureFileInputRef.current.value = "";}} disabled={effectiveIsSaving} className="text-xs mt-1"><Trash2 className="h-3 w-3 mr-1 text-destructive"/>Remove Signature</Button>)}
                 <FormField control={form.control} name="signatureUrl" render={({ field }) => <FormMessage className="pt-1">{form.formState.errors.signatureUrl?.message}</FormMessage>} />
              </FormItem>

              <FormField
                control={form.control}
                name="termsConfirmation"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-background/50">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={effectiveIsSaving}
                        id="termsConfirmationStep4"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel htmlFor="termsConfirmationStep4" className="cursor-pointer">
                        I confirm that all the information provided above is true and accurate to the best of my knowledge.
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={effectiveIsSaving}>Previous</Button>
          <Button type="submit" disabled={effectiveIsSaving}>
            {effectiveIsSaving && !(isFormBusyForCheque || isFormBusyForSignature) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForCheque && chequeStatusMessage ? chequeStatusMessage : 
             isFormBusyForSignature && signatureStatusMessage ? signatureStatusMessage : 
             effectiveIsSaving ? "Submitting..." : "Submit Application"}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
