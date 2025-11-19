
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FirestoreSubCategory, FirestoreCategory } from '@/types/firestore';
import { useEffect, useState, useRef } from "react";
import { Loader2, Image as ImageIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const subCategoryFormSchema = z.object({
  name: z.string().min(2, { message: "Sub-category name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-subcategory-name).").optional().or(z.literal('')),
  parentId: z.string({ required_error: "Please select a parent category." }),
  order: z.coerce.number().min(0, { message: "Order must be a non-negative number." }),
  imageUrl: z.string().url({ message: "Must be a valid URL if provided." }).optional().or(z.literal('')),
  imageHint: z.string().max(50, { message: "Image hint should be max 50 characters."}).optional().or(z.literal('')),
  // SEO Fields
  h1_title: z.string().max(100, "H1 title too long.").optional().or(z.literal('')),
  seo_title: z.string().max(70, "Meta title too long.").optional().or(z.literal('')),
  seo_description: z.string().max(300, "Meta description too long.").optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
});

type SubCategoryFormData = z.infer<typeof subCategoryFormSchema>;

interface SubCategoryFormProps {
  onSubmit: (data: Omit<FirestoreSubCategory, 'id' | 'createdAt'> & { id?: string, slug?: string }) => Promise<void>;
  initialData?: FirestoreSubCategory | null;
  onCancel: () => void;
  parentCategories: FirestoreCategory[];
  isSubmitting?: boolean;
}

const isFirebaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
};

const generateRandomHexString = (length: number) => {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/')) {
        try {
            if (url.startsWith('http:') || url.startsWith('https:')) {
                new URL(url);
            }
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
};

export default function SubCategoryForm({ onSubmit: onSubmitProp, initialData, onCancel, parentCategories, isSubmitting: isParentSubmitting = false }: SubCategoryFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);
  
  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<SubCategoryFormData>({
    resolver: zodResolver(subCategoryFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      parentId: undefined,
      order: 0,
      imageUrl: "",
      imageHint: "",
      h1_title: "",
      seo_title: "",
      seo_description: "",
      seo_keywords: "",
    },
  });

  const watchedName = form.watch("name");
  const watchedImageHint = form.watch("imageHint"); 

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        slug: initialData.slug,
        parentId: initialData.parentId,
        order: initialData.order,
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({ 
        name: "", slug: "", parentId: undefined, order: 0, imageUrl: "", imageHint: "",
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      });
      setCurrentImagePreview(null);
      setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null);
    setUploadProgress(null);
    setIsFormBusyForImage(false);
    setStatusMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialData, form]);

  useEffect(() => {
    // Auto-generate slug from name for NEW items IF the slug field has not been manually touched
    if (watchedName && !initialData && !form.getFieldState('slug').isDirty) {
      form.setValue('slug', generateSlug(watchedName), { shouldValidate: true });
    }
  }, [watchedName, initialData, form]);

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ title: "File Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null);
        setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      setSelectedFile(file);
      setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('imageUrl', '', { shouldValidate: false }); 
    } else {
      setSelectedFile(null);
      setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
    }
  };
  
  const handleRemoveImage = async () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(currentImagePreview);
    }
    setSelectedFile(null);
    setCurrentImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (formData: SubCategoryFormData) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || ""; 

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image...");
        setUploadProgress(0);

        if (originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
          try {
            const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
            await deleteObject(oldImageRef);
          } catch (error) {
            console.warn("Error deleting old image from Firebase Storage: ", error);
          }
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/sub-categories/${fileName}`; 
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);

        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              setStatusMessage(`Uploading image: ${Math.round(progress)}%`);
            },
            (error) => {
                console.error("Upload error:", error);
                reject(new Error(`Image upload failed: ${error.message}`));
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (error) {
                reject(new Error(`Failed to get download URL: ${(error as Error).message}`));
              }
            }
          );
        });
        setUploadProgress(100);
        setStatusMessage("Image uploaded. Saving sub-category...");


      } else if (!formData.imageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
        setStatusMessage("Removing image from storage...");
        try {
          const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
          await deleteObject(oldImageRef);
          finalImageUrl = "";
          setStatusMessage("Image removed. Saving sub-category...");
        } catch (error: any) {
          console.error("Error deleting image from Firebase Storage: ", error);
          throw new Error(`Failed to delete previous image from storage: ${error.message}. Sub-category not saved.`);
        }
      } else {
           setStatusMessage(initialData ? "Saving changes..." : "Creating sub-category...");
      }

      await onSubmitProp({
        name: formData.name,
        slug: formData.slug,
        parentId: formData.parentId,
        order: formData.order,
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint,
        h1_title: formData.h1_title,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
        seo_keywords: formData.seo_keywords,
        id: initialData?.id,
      });
      
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
    } catch (error) {
      console.error("Error during sub-category form submission or image operation:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save sub-category data.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false);
      setStatusMessage("");
      setUploadProgress(null);
    }
  };
  
  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sub-Category Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Plumbing Services" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug {initialData ? "(Non-editable)" : "(Auto-generated or custom)"}</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., plumbing-services"
                  {...field}
                  onChange={(e) => field.onChange(generateSlug(e.target.value))}
                  disabled={effectiveIsSubmitting || !!initialData}
                />
              </FormControl>
              <FormDescription>
                 {initialData ? "Slug cannot be changed for existing sub-categories." : "Lowercase, dash-separated. Auto-generated from name if left blank."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="parentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parent Category</FormLabel>
              <Select
                key={field.value || initialData?.id || 'new-sub-category-parent-select'} 
                onValueChange={field.onChange}
                value={field.value} 
                disabled={effectiveIsSubmitting}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a parent category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {parentCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Order</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Sub-Category Image (Optional)</FormLabel>
          {displayPreviewUrl ? (
            <div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10">
              <Image
                src={displayPreviewUrl}
                alt="Current sub-category image"
                fill
                className="object-contain"
                data-ai-hint={watchedImageHint || "sub-category image preview"}
                unoptimized={displayPreviewUrl.startsWith('blob:') || displayPreviewUrl.startsWith('data:')}
                sizes="(max-width: 640px) 100vw, 50vw"
              />
            </div>
          ) : (
            <div className="my-2 flex items-center justify-center w-full h-40 rounded-md border border-dashed bg-muted/10">
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          <FormControl>
            <Input
              type="file"
              accept="image/png, image/jpeg, image/gif, image/webp"
              onChange={handleFileSelected}
              disabled={effectiveIsSubmitting}
              ref={fileInputRef}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"
            />
          </FormControl>
           <FormDescription className="mt-1">
            Select new image (PNG, JPG, GIF, WEBP, max 5MB).
          </FormDescription>
          {uploadProgress !== null && selectedFile && (
            <div className="mt-2">
              <Progress value={uploadProgress} className="w-full h-2" />
              {statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}
            </div>
          )}
        </FormItem>

         <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image URL (Leave empty to remove image on save if one exists)</FormLabel>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <FormControl className="flex-grow">
                  <Textarea
                    placeholder="Auto-filled after upload, or manually enter a URL. Clear to remove existing image."
                    {...field}
                    disabled={effectiveIsSubmitting || selectedFile !== null} 
                    rows={3}
                    onBlur={(e) => {
                        if (!selectedFile) { 
                            setCurrentImagePreview(e.target.value || null);
                            form.setValue('imageUrl', e.target.value, { shouldValidate: true });
                        }
                    }}
                  />
                </FormControl>
                {(field.value || selectedFile || currentImagePreview) && (
                    <Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image selection or URL" className="sm:ml-auto mt-2 sm:mt-0">
                        <Trash2 className="h-4 w-4 text-destructive"/>
                    </Button>
                )}
              </div>
              <FormDescription>If a new file is selected above, this URL will be ignored. If this field is empty and an image exists, it will be removed upon saving.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="imageHint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image AI Hint (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., pipes tools" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
               <FormDescription>One or two keywords for AI image search (e.g. "pipes tools"). Max 50 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-4 border-t">
            <h3 className="text-md font-semibold text-muted-foreground">SEO Settings (Optional)</h3>
            <p className="text-xs text-muted-foreground">Relevant if you create dedicated pages for sub-categories.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (
                <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Expert Plumbing Services" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (
                <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Plumbing Services | Wecanfix" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (
                <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Get reliable plumbing services for your home or office." {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (
                <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., plumbing, leak repair, pipe fitting" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>


        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={effectiveIsSubmitting}>
                {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Sub-Category')}
            </Button>
        </div>
      </form>
    </Form>
  );
}

    
