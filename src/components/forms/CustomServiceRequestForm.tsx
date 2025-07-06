
"use client";

import { useState, useEffect } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Loader2, Send, UploadCloud, XIcon } from "lucide-react";
import type { FirestoreCategory, CustomServiceRequest, FirestoreNotification } from '@/types/firestore';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';
import Image from 'next/image';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { sendNewCustomServiceRequestEmail, type NewCustomServiceRequestEmailInput } from '@/ai/flows/sendNewCustomServiceRequestEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getBaseUrl } from '@/lib/config';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { Progress } from '../ui/progress';


const OTHER_CATEGORY_VALUE = "__OTHER__";

const formSchema = z.object({
  serviceTitle: z.string().min(5, "Title must be at least 5 characters.").max(150),
  description: z.string().min(20, "Please provide a more detailed description.").max(1500),
  categoryId: z.string({ required_error: "Please select a category or 'Other'." }),
  customCategory: z.string().max(100).optional(),
  minBudget: z.coerce.number().min(0).optional().nullable(),
  maxBudget: z.coerce.number().min(0).optional().nullable(),
  preferredStartDate: z.date({ required_error: "Please select a preferred start date."}),
}).refine(data => data.categoryId !== OTHER_CATEGORY_VALUE || (data.categoryId === OTHER_CATEGORY_VALUE && !!data.customCategory && data.customCategory.trim().length > 2), {
  message: "Please specify your category name.",
  path: ["customCategory"],
}).refine(data => {
    if (data.minBudget !== null && data.minBudget !== undefined && data.maxBudget !== null && data.maxBudget !== undefined) {
      return data.maxBudget >= data.minBudget;
    }
    return true;
}, {
    message: "Max budget must be greater than or equal to min budget.",
    path: ["maxBudget"],
});

type CustomServiceRequestFormData = z.infer<typeof formSchema>;

interface CustomServiceRequestFormProps {
  categories: FirestoreCategory[];
  onSaveSuccess: () => void;
  onCancel: () => void;
}

export default function CustomServiceRequestForm({ categories, onSaveSuccess, onCancel }: CustomServiceRequestFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);

  const form = useForm<CustomServiceRequestFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
      serviceTitle: "", 
      description: "", 
      categoryId: undefined, 
      customCategory: "", 
      minBudget: null, 
      maxBudget: null, 
      preferredStartDate: undefined 
    },
  });
  
  const watchedCategoryId = form.watch("categoryId");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (files.length + newFiles.length > 5) {
        toast({ title: "Upload Limit", description: "You can upload a maximum of 5 images.", variant: "destructive"});
        return;
      }
      setFiles(prev => [...prev, ...newFiles]);
      const newPreviews = newFiles.map(file => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };
  
  const onSubmit = async (data: CustomServiceRequestFormData) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to submit a request.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    let uploadedImageUrls: string[] = [];

    try {
      if (files.length > 0) {
        const uploadPromises = files.map((file, index) => {
          setUploadProgress(prev => { const newProgress = [...prev]; newProgress[index] = 0; return newProgress; });
          const storagePath = `custom_requests/${user.uid}/${nanoid()}_${file.name}`;
          const fileRef = storageRef(storage, storagePath);
          const uploadTask = uploadBytesResumable(fileRef, file);
          
          return new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => { const newProgress = [...prev]; newProgress[index] = progress; return newProgress; });
              },
              (error) => reject(error),
              async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); }}
            );
          });
        });
        uploadedImageUrls = await Promise.all(uploadPromises);
      }
      
      const category = categories.find(c => c.id === data.categoryId);
      
      const requestData: Partial<CustomServiceRequest> = {
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        userMobile: user.phoneNumber,
        serviceTitle: data.serviceTitle,
        description: data.description,
        imageUrls: uploadedImageUrls,
        preferredStartDate: Timestamp.fromDate(data.preferredStartDate),
      };

      if (data.categoryId !== OTHER_CATEGORY_VALUE) {
        requestData.categoryId = data.categoryId;
        if (category) {
          requestData.categoryName = category.name;
        }
      } else {
        if (data.customCategory) {
          requestData.customCategory = data.customCategory;
        }
      }

      if (data.minBudget !== null && data.minBudget !== undefined) {
        requestData.minBudget = data.minBudget;
      }
      if (data.maxBudget !== null && data.maxBudget !== undefined) {
        requestData.maxBudget = data.maxBudget;
      }

      const docRef = await addDoc(collection(db, "customServiceRequests"), {
          ...requestData,
          status: 'new',
          submittedAt: Timestamp.now(),
      });

      toast({ title: "Request Submitted!", description: "We have received your custom service request and will get back to you soon.", className: "bg-green-100 border-green-300" });
      
      // --- Start of new notification logic ---
      const usersRef = collection(db, "users");
      const adminQuery = query(usersRef, where("email", "==", ADMIN_EMAIL), limit(1));
      const adminSnapshot = await getDocs(adminQuery);
      
      if (!adminSnapshot.empty) {
        const adminUserDoc = adminSnapshot.docs[0];
        const adminUid = adminUserDoc.id;

        // In-app notification
        const adminNotification: FirestoreNotification = {
          userId: adminUid,
          title: "New Custom Service Request",
          message: `From ${user.displayName || user.email} for: ${data.serviceTitle}`,
          type: "admin_alert",
          href: `/admin/custom-service?id=${docRef.id}`,
          read: false,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), adminNotification);

        // Email notification via Genkit flow
        if (appConfig.smtpHost) {
          const emailInput: NewCustomServiceRequestEmailInput = {
              requestId: docRef.id,
              serviceTitle: data.serviceTitle,
              userName: user.displayName || 'N/A',
              userEmail: user.email || 'N/A',
              description: data.description,
              category: category?.name || data.customCategory || 'N/A',
              adminUrl: `${getBaseUrl()}/admin/custom-service?id=${docRef.id}`,
              smtpHost: appConfig.smtpHost,
              smtpPort: appConfig.smtpPort,
              smtpUser: appConfig.smtpUser,
              smtpPass: appConfig.smtpPass,
              senderEmail: appConfig.senderEmail,
          };
          try { 
              await sendNewCustomServiceRequestEmail(emailInput); 
          } catch (e) { 
              console.error("Failed to send admin notification email for custom request:", e); 
          }
        }
      } else {
        console.warn(`Admin user with email ${ADMIN_EMAIL} not found. Cannot send notifications.`);
      }
      // --- End of new notification logic ---

      form.reset();
      setFiles([]);
      setPreviews([]);
      onSaveSuccess();
    } catch (error) {
      console.error("Error submitting custom request:", error);
      toast({ title: "Submission Failed", description: (error as Error).message || "Could not submit your request.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-6">
          <FormField control={form.control} name="serviceTitle" render={({ field }) => (<FormItem><FormLabel>Service Title</FormLabel><FormControl><Input placeholder="e.g., Custom Bookshelf Installation" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Describe Your Requirement</FormLabel><FormControl><Textarea placeholder="Please provide as much detail as possible..." rows={5} {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="categoryId" render={({ field }) => (<FormItem><FormLabel>Category</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="Select a relevant category" /></SelectTrigger></FormControl><SelectContent><SelectItem value={OTHER_CATEGORY_VALUE}>Other</SelectItem>{categories.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
              {watchedCategoryId === OTHER_CATEGORY_VALUE && (<FormField control={form.control} name="customCategory" render={({ field }) => (<FormItem><FormLabel>Specify Other Category</FormLabel><FormControl><Input placeholder="e.g., Metal Fabrication" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="minBudget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Min. Budget (₹) (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., 5000"
                      {...field}
                      value={field.value ?? ""}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="maxBudget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max. Budget (₹) (Optional)</FormLabel>
                  <FormControl>
                     <Input
                      type="number"
                      placeholder="e.g., 10000"
                      {...field}
                      value={field.value ?? ""}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <FormField control={form.control} name="preferredStartDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Preferred Start Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-[240px] pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSubmitting}>{field.value ? new Date(field.value).toLocaleDateString('en-IN') : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}/></PopoverContent></Popover><FormMessage /></FormItem>)}/>

          <div>
            <FormLabel>Reference Photos (Optional, up to 5)</FormLabel>
            <FormControl>
              <div className="mt-2 flex items-center justify-center w-full">
                <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="mb-1 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, WEBP (MAX 2MB each)</p>
                  </div>
                  <Input id="file-upload" type="file" className="hidden" multiple onChange={handleFileChange} accept="image/*" disabled={isSubmitting} />
                </label>
              </div>
            </FormControl>
            {previews.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                {previews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <Image src={preview} alt={`preview ${index}`} width={100} height={100} className="rounded-md object-cover aspect-square" />
                    <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeFile(index)} disabled={isSubmitting}>
                      <XIcon className="h-3 w-3" />
                    </Button>
                    {uploadProgress[index] !== undefined && <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md"><Progress value={uploadProgress[index]} className="h-1 w-10/12" /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit Request
            </Button>
          </div>
        </form>
      </Form>
  );
}
