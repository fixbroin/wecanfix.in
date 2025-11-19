
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreBlogPost, FirestoreCategory } from '@/types/firestore';
import { useEffect, useState, useRef } from "react";
import { Loader2, Image as ImageIcon, Trash2, Wand2 } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";
import { generateBlogContent } from "@/ai/flows/generateBlogContentFlow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const generateSlug = (title: string) => {
  if (!title) return "";
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
};

const generateRandomHexString = (length: number) => {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const OTHER_CATEGORY_VALUE = "__OTHER__";
const NO_CATEGORY_VALUE = "__NO_CATEGORY__";

const blogFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long."),
  slug: z.string().min(3, "Slug must be at least 3 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format."),
  content: z.string().optional(),
  coverImageUrl: z.string().url("A valid image URL is required.").optional().or(z.literal('')),
  imageHint: z.string().max(50).optional(),
  isPublished: z.boolean().default(false),
  categoryId: z.string().optional(),
  customCategory: z.string().optional(),
  h1_title: z.string().max(150).optional(),
  meta_title: z.string().max(70).optional(),
  meta_description: z.string().max(160).optional(),
  meta_keywords: z.string().optional(),
}).refine(data => {
  if (data.categoryId === OTHER_CATEGORY_VALUE) {
    return !!data.customCategory && data.customCategory.trim().length > 2;
  }
  return true;
}, {
  message: "Please specify the category name.",
  path: ["customCategory"],
});


type BlogFormData = z.infer<typeof blogFormSchema>;

interface BlogFormProps {
  onSubmit: (data: Omit<FirestoreBlogPost, 'id' | 'createdAt' | 'updatedAt' | 'authorId' | 'authorName'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreBlogPost | null;
  onCancel: () => void;
  isSubmitting?: boolean;
  categories: FirestoreCategory[];
}

export default function BlogForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting: isParentSubmitting = false, categories }: BlogFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isGeneratingAiContent, setIsGeneratingAiContent] = useState(false);

  const form = useForm<BlogFormData>({
    resolver: zodResolver(blogFormSchema),
    defaultValues: {
      title: "", slug: "", content: "", coverImageUrl: "", imageHint: "", isPublished: false,
      categoryId: undefined, customCategory: "",
      h1_title: "", meta_title: "", meta_description: "", meta_keywords: "",
    },
  });
  
  useEffect(() => {
    if (initialData) {
      // If initialData has a categoryId, use it. If not (meaning it had a custom name or no category), default to NO_CATEGORY_VALUE.
      // And if it had a custom name, populate the customCategory field.
      const initialCategoryId = initialData.categoryId || (initialData.categoryName ? OTHER_CATEGORY_VALUE : NO_CATEGORY_VALUE);

      form.reset({
        title: initialData.title,
        slug: initialData.slug,
        content: initialData.content || "",
        coverImageUrl: initialData.coverImageUrl || "",
        imageHint: initialData.imageHint || "",
        isPublished: initialData.isPublished,
        categoryId: initialCategoryId,
        customCategory: initialData.categoryId ? "" : initialData.categoryName, // Only set custom if no ID
        h1_title: initialData.h1_title || "",
        meta_title: initialData.meta_title || "",
        meta_description: initialData.meta_description || "",
        meta_keywords: initialData.meta_keywords || "",
      });
      setCurrentImagePreview(initialData.coverImageUrl || null);
    } else {
      form.reset({
          title: "", slug: "", content: "", coverImageUrl: "", imageHint: "", isPublished: false,
          categoryId: NO_CATEGORY_VALUE, customCategory: "",
          h1_title: "", meta_title: "", meta_description: "", meta_keywords: "",
      });
    }
  }, [initialData, form]);

  const watchedTitle = form.watch("title");
  const watchedCategoryId = form.watch("categoryId");

  useEffect(() => {
    if (watchedTitle && !initialData) {
      form.setValue('slug', generateSlug(watchedTitle));
    }
  }, [watchedTitle, initialData, form]);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ title: "File Too Large", description: "Image must be less than 5MB.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('coverImageUrl', '', { shouldValidate: false });
    }
  };

  const handleRemoveImage = () => {
    if (selectedFile && currentImagePreview) URL.revokeObjectURL(currentImagePreview);
    setSelectedFile(null);
    setCurrentImagePreview(null);
    form.setValue('coverImageUrl', '', { shouldValidate: true });
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerateContent = async () => {
    const title = form.getValues("title");
    if (!title.trim()) {
      toast({ title: "Title Required", description: "Please enter a blog post title first.", variant: "destructive" });
      return;
    }
    
    const categoryId = form.getValues("categoryId");
    let categoryName: string | undefined;

    if (categoryId === OTHER_CATEGORY_VALUE) {
        categoryName = form.getValues("customCategory");
    } else if (categoryId && categoryId !== NO_CATEGORY_VALUE) {
        categoryName = categories.find(c => c.id === categoryId)?.name;
    }

    setIsGeneratingAiContent(true);
    toast({ title: "Generating AI Content & SEO...", description: "Please wait a moment." });
    try {
      const result = await generateBlogContent({ title, categoryName });
      form.setValue("content", result.content, { shouldValidate: true });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("meta_title", result.meta_title, { shouldValidate: true });
      form.setValue("meta_description", result.meta_description, { shouldValidate: true });
      form.setValue("meta_keywords", result.meta_keywords, { shouldValidate: true });
      form.setValue("imageHint", result.imageHint, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "Blog content and SEO fields have been populated.", className: "bg-green-100 text-green-700 border-green-300" });
    } catch (error) {
      console.error("Error generating blog content:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate content.", variant: "destructive" });
    } finally {
      setIsGeneratingAiContent(false);
    }
  };

  const handleSubmit = async (formData: BlogFormData) => {
    setStatusMessage("Processing...");
    let finalImageUrl = formData.coverImageUrl || "";

    if (selectedFile) {
      setStatusMessage("Uploading cover image...");
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `blog_cover_${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/blog/${fileName}`;
        const fileRef = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileRef, selectedFile);
        
        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(new Error(`Image upload failed: ${error.message}`)),
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (getUrlError) {
                reject(new Error(`Failed to get download URL: ${(getUrlError as Error).message}`));
              }
            }
          );
        });
        setStatusMessage("Image uploaded. Saving post...");
      } catch (uploadError) {
        toast({ title: "Upload Failed", description: (uploadError as Error).message, variant: "destructive" });
        setStatusMessage(""); setUploadProgress(null);
        return;
      }
    } else if (!finalImageUrl) {
        toast({title: "Cover Image Required", description: "Please upload or provide a URL for the cover image.", variant: "destructive"});
        setStatusMessage("");
        return;
    }

    const { customCategory, categoryId, ...restOfFormData } = formData;
    let finalCategoryId: string | null = null;
    let finalCategoryName: string | null = null;

    if (categoryId === OTHER_CATEGORY_VALUE) {
        finalCategoryName = customCategory || null;
    } else if (categoryId && categoryId !== NO_CATEGORY_VALUE) {
        const selectedCategory = categories.find(c => c.id === categoryId);
        finalCategoryId = selectedCategory?.id || null;
        finalCategoryName = selectedCategory?.name || null;
    }
    
    const payload = { 
      ...restOfFormData,
      coverImageUrl: finalImageUrl, 
      id: initialData?.id,
      categoryId: finalCategoryId,
      categoryName: finalCategoryName,
    };
    await onSubmitProp(payload);
    setStatusMessage(""); setUploadProgress(null);
  };
  
  const effectiveIsSubmitting = isParentSubmitting || statusMessage !== "" || isGeneratingAiContent;

  return (
    <Form {...form} key={initialData ? `edit-${initialData.id}` : 'new-post'}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-6 p-6 overflow-y-auto">
        <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="Your blog post title" {...field} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        
        <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Category (Optional)</FormLabel>
                <Select 
                    onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== OTHER_CATEGORY_VALUE) {
                            form.setValue('customCategory', '');
                        }
                    }} 
                    value={field.value} 
                    disabled={effectiveIsSubmitting}
                >
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a category..." />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        <SelectItem value={NO_CATEGORY_VALUE}>-- No Category --</SelectItem>
                        {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                        <SelectItem value={OTHER_CATEGORY_VALUE}>Other...</SelectItem>
                    </SelectContent>
                </Select>
                <FormDescription>Selecting a category helps the AI generate more relevant SEO content.</FormDescription>
                <FormMessage />
                </FormItem>
            )}
        />
        
        {watchedCategoryId === OTHER_CATEGORY_VALUE && (
            <FormField
                control={form.control}
                name="customCategory"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Custom Category Name</FormLabel>
                        <FormControl>
                            <Input placeholder="Enter new category name" {...field} disabled={effectiveIsSubmitting}/>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        )}


        <Button type="button" variant="outline" size="sm" onClick={handleGenerateContent} disabled={effectiveIsSubmitting || !watchedTitle.trim()}>
          {isGeneratingAiContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4" />}
          Generate AI Content & SEO
        </Button>
        <FormField control={form.control} name="slug" render={({ field }) => (<FormItem><FormLabel>Slug</FormLabel><FormControl><Input placeholder="your-blog-post-title" {...field} disabled={effectiveIsSubmitting || !!initialData}/></FormControl><FormMessage /></FormItem>)}/>
        
        <FormItem>
          <FormLabel>Cover Image</FormLabel>
          {currentImagePreview ? <NextImage src={currentImagePreview} alt="Cover preview" width={300} height={150} className="rounded-md object-cover border" /> : null}
          <FormControl><Input type="file" accept="image/*" onChange={handleFileSelected} ref={fileInputRef} disabled={effectiveIsSubmitting} /></FormControl>
          {uploadProgress !== null && <Progress value={uploadProgress} className="w-full mt-2" />}
          {currentImagePreview && <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage} disabled={effectiveIsSubmitting}>Remove Image</Button>}
          <FormMessage>{form.formState.errors.coverImageUrl?.message}</FormMessage>
        </FormItem>
        <FormField control={form.control} name="coverImageUrl" render={({ field }) => (<FormItem><FormLabel>Or Image URL</FormLabel><FormControl><Input placeholder="https://example.com/image.jpg" {...field} disabled={effectiveIsSubmitting || !!selectedFile} /></FormControl><FormMessage /></FormItem>)}/>
        
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Write the main content of your blog post here..."
                  rows={15}
                  {...field}
                  value={field.value || ""}
                  disabled={effectiveIsSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-medium">SEO Settings</h3>
          <FormField control={form.control} name="h1_title" render={({ field }) => (<FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormDescription>If different from main title.</FormDescription><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="meta_title" render={({ field }) => (<FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="meta_description" render={({ field }) => (<FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="meta_keywords" render={({ field }) => (<FormItem><FormLabel>Meta Keywords</FormLabel><FormControl><Input {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormDescription>Comma-separated keywords.</FormDescription><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image AI Hint</FormLabel><FormControl><Input {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormDescription>Keywords for AI image generation.</FormDescription><FormMessage /></FormItem>)}/>
        </div>
        
        <FormField control={form.control} name="isPublished" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>Publish</FormLabel><FormDescription>Make this post publicly visible.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting}/></FormControl></FormItem>)}/>
        
        <div className="p-6 border-t sticky bottom-0 bg-background flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
            <Button type="submit" disabled={effectiveIsSubmitting}>
              {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {statusMessage || (initialData ? 'Save Changes' : 'Create Post')}
            </Button>
        </div>
      </form>
    </Form>
  );
}
