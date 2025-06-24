
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Camera, Image as ImageIcon, Trash2, PlusCircle, UploadCloud } from "lucide-react";
import type { ProviderApplication, ProviderControlOptions, KycDocument, OptionalDocumentTypeOption } from '@/types/firestore';
import { useEffect, useRef, useState } from "react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";
import { nanoid } from 'nanoid';

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const optionalDocItemSchema = z.object({
  id: z.string(), 
  docType: z.string({ required_error: "Please select a document type."}),
  docNumber: z.string().optional().or(z.literal('')),
});

const step3KycSchema = z.object({
  aadhaarNumber: z.string()
    .regex(/^[2-9]{1}[0-9]{3}[0-9]{4}[0-9]{4}$/, "Invalid Aadhaar (must be 12 digits, not starting 0 or 1).")
    .optional().or(z.literal('')),
  panNumber: z.string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format (e.g., ABCDE1234F).")
    .optional().or(z.literal('')),
  optionalDocs: z.array(optionalDocItemSchema).optional(),
});

type Step3FormData = z.infer<typeof step3KycSchema>;

interface FileUploadState {
  file: File | null;
  previewUrl: string | null;
  uploadProgress: number | null;
  existingUrl?: string | null;
  originalFileName?: string | null; 
}

interface Step3KycDocumentsProps {
  onNext: (data: Partial<ProviderApplication>) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string;
}

export default function Step3KycDocuments({
  onNext,
  onPrevious,
  initialData,
  controlOptions,
  isSaving, 
  userUid,
}: Step3KycDocumentsProps) {
  const { toast } = useToast();
  const [isFormBusy, setIsFormBusy] = useState(false);

  const form = useForm<Step3FormData>({
    resolver: zodResolver(step3KycSchema),
    defaultValues: {
      aadhaarNumber: initialData.aadhaar?.docNumber || "",
      panNumber: initialData.pan?.docNumber || "",
      optionalDocs: initialData.optionalDocuments?.map(doc => ({
        id: nanoid(), 
        docType: doc.docType,
        docNumber: doc.docNumber || "",
      })) || [],
    },
  });

  const { fields: optionalDocFields, append: appendOptionalDoc, remove: removeOptionalDoc } = useFieldArray({
    control: form.control,
    name: "optionalDocs",
  });

  const [aadhaarFront, setAadhaarFront] = useState<FileUploadState>({ file: null, previewUrl: initialData.aadhaar?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.frontImageUrl, originalFileName: initialData.aadhaar?.frontImageFileName });
  const [aadhaarBack, setAadhaarBack] = useState<FileUploadState>({ file: null, previewUrl: initialData.aadhaar?.backImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.backImageUrl, originalFileName: initialData.aadhaar?.backImageFileName });
  const [panFront, setPanFront] = useState<FileUploadState>({ file: null, previewUrl: initialData.pan?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.pan?.frontImageUrl, originalFileName: initialData.pan?.frontImageFileName });
  
  const [optionalDocFiles, setOptionalDocFiles] = useState<Record<string, {front: FileUploadState, back?: FileUploadState}>>({});

  useEffect(() => {
    form.reset({
      aadhaarNumber: initialData.aadhaar?.docNumber || "",
      panNumber: initialData.pan?.docNumber || "",
      optionalDocs: initialData.optionalDocuments?.map(doc => ({
        id: nanoid(), 
        docType: doc.docType,
        docNumber: doc.docNumber || "",
      })) || [],
    });
    setAadhaarFront({ file: null, previewUrl: initialData.aadhaar?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.frontImageUrl, originalFileName: initialData.aadhaar?.frontImageFileName });
    setAadhaarBack({ file: null, previewUrl: initialData.aadhaar?.backImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.backImageUrl, originalFileName: initialData.aadhaar?.backImageFileName });
    setPanFront({ file: null, previewUrl: initialData.pan?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.pan?.frontImageUrl, originalFileName: initialData.pan?.frontImageFileName });
    
    const initialOptionalFiles: Record<string, {front: FileUploadState, back?: FileUploadState}> = {};
    initialData.optionalDocuments?.forEach((doc, index) => {
        const clientSideId = form.getValues(`optionalDocs.${index}.id`) || nanoid(); 
        initialOptionalFiles[clientSideId] = {
            front: { file: null, previewUrl: doc.frontImageUrl || null, uploadProgress: null, existingUrl: doc.frontImageUrl, originalFileName: doc.frontImageFileName },
            back: { file: null, previewUrl: doc.backImageUrl || null, uploadProgress: null, existingUrl: doc.backImageUrl, originalFileName: doc.backImageFileName },
        };
    });
    setOptionalDocFiles(initialOptionalFiles);

  }, [initialData, form]);


  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<FileUploadState>>,
    currentFileState: FileUploadState 
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Image must be < 2MB.", variant: "destructive" });
        e.target.value = ""; return;
      }
      setter({ ...currentFileState, file: file, previewUrl: URL.createObjectURL(file), uploadProgress: null, originalFileName: file.name });
    }
  };

  const handleOptionalFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldId: string, 
    side: 'front' | 'back'
  ) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > 2 * 1024 * 1024) {
            toast({ title: "File Too Large", description: "Image must be < 2MB.", variant: "destructive" });
            e.target.value = ""; return;
        }
        setOptionalDocFiles(prev => ({
            ...prev,
            [fieldId]: {
                ...(prev[fieldId] || { front: { file: null, previewUrl: null, uploadProgress: null }, back: { file: null, previewUrl: null, uploadProgress: null } }),
                [side]: { file: file, previewUrl: URL.createObjectURL(file), uploadProgress: null, originalFileName: file.name, existingUrl: prev[fieldId]?.[side]?.existingUrl }
            }
        }));
    }
  };

  const handleRemoveFile = (
    setter: React.Dispatch<React.SetStateAction<FileUploadState>>,
    currentFileState: FileUploadState
  ) => {
    if (currentFileState.previewUrl && currentFileState.previewUrl.startsWith('blob:')) URL.revokeObjectURL(currentFileState.previewUrl);
    
    setter({ file: null, previewUrl: null, uploadProgress: null, existingUrl: currentFileState.existingUrl, originalFileName: null });
  };
  
  const handleRemoveOptionalFile = (fieldId: string, side: 'front' | 'back') => {
      setOptionalDocFiles(prev => {
          const currentDocFiles = prev[fieldId];
          if (!currentDocFiles) return prev;
          
          const sideState = currentDocFiles[side];
          if (sideState?.previewUrl && sideState.previewUrl.startsWith('blob:')) URL.revokeObjectURL(sideState.previewUrl);

          return {
              ...prev,
              [fieldId]: {
                  ...currentDocFiles,
                  [side]: { file: null, previewUrl: null, uploadProgress: null, existingUrl: sideState?.existingUrl, originalFileName: null }
              }
          };
      });
  };


  const uploadFile = async (
    fileState: FileUploadState,
    docTypeForPath: string, 
    docSide: 'front' | 'back'
  ): Promise<{ url: string | null; fileName: string | null }> => {
    if (!fileState.file) { 
      if (fileState.previewUrl === null && fileState.existingUrl && isFirebaseStorageUrl(fileState.existingUrl)) {
        try { await deleteObject(storageRefStandard(storage, fileState.existingUrl)); }
        catch (e) { console.warn(`Error deleting old ${docTypeForPath} ${docSide} image:`, e); }
        return { url: null, fileName: null };
      }
      return { url: fileState.existingUrl || null, fileName: fileState.existingUrl ? fileState.originalFileName : null };
    }

    const file = fileState.file;
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const randomString = generateRandomHexString(8);
    const autoFileName = `${docTypeForPath}_${docSide}_${randomString}.${extension}`;
    const storagePath = `provider_documents/${userUid}/${docTypeForPath}/${autoFileName}`;
    const fileRef = storageRefStandard(storage, storagePath);

    if (fileState.existingUrl && isFirebaseStorageUrl(fileState.existingUrl)) {
      try { await deleteObject(storageRefStandard(storage, fileState.existingUrl)); }
      catch (e) { console.warn(`Error deleting old ${docTypeForPath} ${docSide} image:`, e); }
    }

    const uploadTask = uploadBytesResumable(fileRef, file);
    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => { 
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (docTypeForPath === 'aadhaar' && docSide === 'front') setAadhaarFront(prev => ({...prev, uploadProgress: progress}));
            else if (docTypeForPath === 'aadhaar' && docSide === 'back') setAadhaarBack(prev => ({...prev, uploadProgress: progress}));
            else if (docTypeForPath === 'pan' && docSide === 'front') setPanFront(prev => ({...prev, uploadProgress: progress}));
            else {
                // For optional docs, we need a more complex way to update progress if granular progress bars are needed
                // For now, just log or set a general uploading state
            }
        },
        (error) => reject(error),
        async () => { try { const downloadURL = await getDownloadURL(uploadTask.snapshot.ref); resolve({ url: downloadURL, fileName: file.name }); } catch (e) { reject(e); } }
      );
    });
  };

  const handleSubmit = async (data: Step3FormData) => {
    setIsFormBusy(true);
    try {
      const applicationStepData: Partial<ProviderApplication> = {};

      // AADHAAR
      if (data.aadhaarNumber || aadhaarFront.file || aadhaarFront.previewUrl || aadhaarBack.file || aadhaarBack.previewUrl) {
        const [front, back] = await Promise.all([
          uploadFile(aadhaarFront, 'aadhaar', 'front'),
          uploadFile(aadhaarBack, 'aadhaar', 'back')
        ]);
        applicationStepData.aadhaar = {
          docType: 'aadhaar', docNumber: data.aadhaarNumber || "",
          frontImageUrl: front.url || undefined, frontImageFileName: front.fileName || undefined,
          backImageUrl: back.url || undefined, backImageFileName: back.fileName || undefined,
          verified: initialData.aadhaar?.verified || false,
        };
      } else if (initialData.aadhaar) { 
        applicationStepData.aadhaar = null; // Explicitly clear if all inputs are empty and initial data existed
      }

      // PAN
      if (data.panNumber || panFront.file || panFront.previewUrl) {
        const front = await uploadFile(panFront, 'pan', 'front');
        applicationStepData.pan = {
          docType: 'pan', docNumber: data.panNumber || "",
          frontImageUrl: front.url || undefined, frontImageFileName: front.fileName || undefined,
          verified: initialData.pan?.verified || false,
        };
      } else if (initialData.pan) {
        applicationStepData.pan = null; // Explicitly clear
      }

      // Optional Documents
      const processedOptionalDocs: KycDocument[] = [];
      if (data.optionalDocs) {
        for (let i = 0; i < data.optionalDocs.length; i++) {
          const optDocFormField = data.optionalDocs[i];
          const fileStates = optionalDocFiles[optDocFormField.id]; 
          
          if (optDocFormField.docType && (optDocFormField.docNumber || fileStates?.front.file || fileStates?.front.previewUrl)) {
            const docTypeInfo = controlOptions?.optionalDocTypes.find(dt => dt.id === optDocFormField.docType);
            const docTypeLabelForPath = docTypeInfo?.label.replace(/\s+/g, '_').toLowerCase() || `optional_doc_${i}`;
            
            const [front, back] = await Promise.all([
              fileStates?.front ? uploadFile(fileStates.front, docTypeLabelForPath, 'front') : Promise.resolve({url: null, fileName: null}),
              fileStates?.back ? uploadFile(fileStates.back, docTypeLabelForPath, 'back') : Promise.resolve({url: null, fileName: null})
            ]);

            const existingDocForVerification = initialData.optionalDocuments?.find(d => d.docType === optDocFormField.docType && d.docNumber === optDocFormField.docNumber);

            processedOptionalDocs.push({
              docType: optDocFormField.docType, 
              docNumber: optDocFormField.docNumber || "",
              frontImageUrl: front.url || undefined, frontImageFileName: front.fileName || undefined,
              backImageUrl: back.url || undefined, backImageFileName: back.fileName || undefined,
              verified: existingDocForVerification?.verified || false,
            });
          }
        }
      }
      applicationStepData.optionalDocuments = processedOptionalDocs;

      onNext(applicationStepData);

    } catch (error) {
      toast({ title: "Submission Error", description: (error as Error).message || "Failed to process documents.", variant: "destructive" });
    } finally {
      setIsFormBusy(false);
    }
  };

  const renderFileInput = (
    label: string,
    fileState: FileUploadState,
    setter: React.Dispatch<React.SetStateAction<FileUploadState>>,
    aspectRatio?: string 
  ) => {
    const inputId = `file-input-${label.toLowerCase().replace(/\s+/g, '-')}-${nanoid(4)}`;
    return (
    <FormItem>
      <FormLabel htmlFor={inputId}>{label}</FormLabel>
      <div className={`relative w-full ${aspectRatio || 'aspect-video'} rounded-md border border-dashed bg-muted/30 flex items-center justify-center`}>
        {fileState.previewUrl && isValidImageSrc(fileState.previewUrl) ? (
          <NextImage src={fileState.previewUrl} alt={`${label} preview`} fill className="object-contain p-1" unoptimized={fileState.previewUrl.startsWith('blob:')} />
        ) : (
          <Camera className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <FormControl><Input id={inputId} type="file" accept="image/png, image/jpeg, image/webp" onChange={(e) => handleFileChange(e, setter, fileState)} className="file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" disabled={effectiveIsSaving} /></FormControl>
      {fileState.uploadProgress !== null && <Progress value={fileState.uploadProgress} className="h-1.5" />}
      {(fileState.previewUrl || fileState.file) && <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveFile(setter, fileState)} disabled={effectiveIsSaving} className="text-xs"><Trash2 className="h-3 w-3 mr-1 text-destructive"/>Remove</Button>}
      <FormMessage />
    </FormItem>
  )};

  const effectiveIsSaving = isSaving || isFormBusy;

  if (!controlOptions) {
    return <Card><CardContent className="pt-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /> Loading document options...</CardContent></Card>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <CardContent className="space-y-6">
          <Card className="p-4">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg">Aadhaar Card</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              <FormField control={form.control} name="aadhaarNumber" render={({ field }) => (<FormItem><FormLabel>Aadhaar Number</FormLabel><FormControl><Input placeholder="Enter 12-digit Aadhaar" {...field} disabled={effectiveIsSaving} /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderFileInput("Aadhaar Front", aadhaarFront, setAadhaarFront, "aspect-[85.6/53.98]")}
                {renderFileInput("Aadhaar Back", aadhaarBack, setAadhaarBack, "aspect-[85.6/53.98]")}
              </div>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg">PAN Card</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              <FormField control={form.control} name="panNumber" render={({ field }) => (<FormItem><FormLabel>PAN Number</FormLabel><FormControl><Input placeholder="Enter 10-digit PAN" {...field} disabled={effectiveIsSaving} /></FormControl><FormMessage /></FormItem>)} />
              {renderFileInput("PAN Card Front", panFront, setPanFront, "aspect-[85.6/53.98]")}
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg">Optional Documents</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              {optionalDocFields.map((item, index) => {
                const fieldId = item.id; 
                const currentOptionalDocFileState = optionalDocFiles[fieldId] || { front: { file: null, previewUrl: null, uploadProgress: null }, back: { file: null, previewUrl: null, uploadProgress: null }};
                 return (
                    <div key={item.id} className="p-3 border rounded-md space-y-3 relative">
                    <FormField control={form.control} name={`optionalDocs.${index}.docType`} render={({ field }) => (
                        <FormItem><FormLabel>Document Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={effectiveIsSaving}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger></FormControl>
                            <SelectContent>{controlOptions.optionalDocTypes.map(opt => (<SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>))}</SelectContent>
                        </Select><FormMessage />
                        </FormItem>)}/>
                    <FormField control={form.control} name={`optionalDocs.${index}.docNumber`} render={({ field }) => (<FormItem><FormLabel>Document Number (Optional)</FormLabel><FormControl><Input placeholder="Enter document number" {...field} disabled={effectiveIsSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {renderFileInput(`Optional Doc ${index + 1} - Front`, currentOptionalDocFileState.front, (newState) => setOptionalDocFiles(prev => ({...prev, [fieldId]: {...currentOptionalDocFileState, front: newState}})), "aspect-video" )}
                        {renderFileInput(`Optional Doc ${index + 1} - Back`, currentOptionalDocFileState.back || {file: null, previewUrl: null, uploadProgress: null}, (newState) => setOptionalDocFiles(prev => ({...prev, [fieldId]: {...currentOptionalDocFileState, back: newState}})), "aspect-video" )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-destructive" onClick={() => {removeOptionalDoc(index); setOptionalDocFiles(prev => {const _ = {...prev}; delete _[fieldId]; return _;});}} disabled={effectiveIsSaving}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                )})}
              <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalDoc({ id: nanoid(), docType: "", docNumber: "" })} disabled={effectiveIsSaving}><PlusCircle className="mr-2 h-4 w-4"/>Add Optional Document</Button>
            </CardContent>
          </Card>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={effectiveIsSaving}>Previous</Button>
          <Button type="submit" disabled={effectiveIsSaving}>
            {effectiveIsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & Continue
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}

