
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FirestoreCity, FirestoreCategory, CityCategorySeoSetting } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { generateCityCategorySeo } from '@/ai/flows/generateCityCategorySeoFlow';
import { useToast } from "@/hooks/use-toast";

const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
};

const cityCategorySeoFormSchema = z.object({
  cityId: z.string({ required_error: "Please select a city." }),
  categoryId: z.string({ required_error: "Please select a category." }),
  slug: z.string().optional().or(z.literal('')),
  h1_title: z.string().max(100, "H1 title too long.").optional().or(z.literal('')),
  meta_title: z.string().max(70, "Meta title too long.").optional().or(z.literal('')),
  meta_description: z.string().max(300, "Meta description too long.").optional().or(z.literal('')),
  meta_keywords: z.string().optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 chars.").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export type CityCategorySeoFormData = z.infer<typeof cityCategorySeoFormSchema>;

interface CityCategorySeoFormProps {
  onSubmit: (data: CityCategorySeoFormData & { id?: string }) => Promise<void>;
  initialData?: CityCategorySeoSetting | null;
  cities: FirestoreCity[];
  categories: FirestoreCategory[];
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function CityCategorySeoForm({ onSubmit: onSubmitProp, initialData, cities, categories, onCancel, isSubmitting = false }: CityCategorySeoFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const { toast } = useToast();

  const form = useForm<CityCategorySeoFormData>({
    resolver: zodResolver(cityCategorySeoFormSchema),
    defaultValues: {
      cityId: undefined, categoryId: undefined, slug: "", h1_title: "", meta_title: "", meta_description: "", meta_keywords: "", imageHint: "", isActive: true,
    },
  });

  const watchedCityId = form.watch("cityId");
  const watchedCategoryId = form.watch("categoryId");

  useEffect(() => {
    if (initialData) {
      form.reset({
        cityId: initialData.cityId,
        categoryId: initialData.categoryId,
        slug: initialData.slug || "", // Ensure slug is at least an empty string
        h1_title: initialData.h1_title || "",
        meta_title: initialData.meta_title || "",
        meta_description: initialData.meta_description || "",
        meta_keywords: initialData.meta_keywords || "",
        imageHint: initialData.imageHint || "",
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
    } else {
      form.reset({ cityId: undefined, categoryId: undefined, slug: "", h1_title: "", meta_title: "", meta_description: "", meta_keywords: "", imageHint: "", isActive: true });
    }
  }, [initialData, form]);

  useEffect(() => {
    if (watchedCityId && watchedCategoryId && !initialData && !form.getFieldState('slug').isDirty) {
      const city = cities.find(c => c.id === watchedCityId);
      const category = categories.find(c => c.id === watchedCategoryId);
      if (city && category) {
        form.setValue('slug', generateSeoSlug([city.slug, category.slug]));
      }
    }
  }, [watchedCityId, watchedCategoryId, cities, categories, initialData, form]);

  const handleGenerateSeo = async () => {
    const cityId = form.getValues("cityId");
    const categoryId = form.getValues("categoryId");

    const selectedCity = cities.find(c => c.id === cityId);
    const selectedCategory = categories.find(c => c.id === categoryId);

    if (!selectedCity || !selectedCategory) {
      toast({
        title: "City & Category Required",
        description: "Please select a city and a category first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
      const result = await generateCityCategorySeo({ cityName: selectedCity.name, categoryName: selectedCategory.name });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("meta_title", result.meta_title, { shouldValidate: true });
      form.setValue("meta_description", result.meta_description, { shouldValidate: true });
      form.setValue("meta_keywords", result.meta_keywords, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "SEO fields have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
      console.error("Error generating city-category SEO:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const handleSubmit = async (formData: CityCategorySeoFormData) => {
    await onSubmitProp({ ...formData, id: initialData?.id });
  };
  
  const isEditing = !!initialData;
  const effectiveIsSubmitting = isSubmitting || isGeneratingSeo;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField control={form.control} name="cityId" render={({ field }) => (
          <FormItem>
            <FormLabel>City</FormLabel>
            <Select
              key={`city-${field.value || 'new'}`} // Key to help with re-render on value change
              onValueChange={field.onChange}
              value={field.value || undefined} // Ensure undefined if field.value is null/empty for placeholder
              disabled={effectiveIsSubmitting || isEditing}
            >
              <FormControl><SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger></FormControl>
              <SelectContent>{cities.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}/>
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <Select
              key={`category-${field.value || 'new'}`} // Key to help with re-render
              onValueChange={field.onChange}
              value={field.value || undefined}
              disabled={effectiveIsSubmitting || isEditing}
            >
              <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
              <SelectContent>{categories.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}/>
        <FormField control={form.control} name="slug" render={({ field }) => (
          <FormItem><FormLabel>Slug Segment {isEditing ? "(Non-editable)" : "(Auto-generated or custom)"}</FormLabel><FormControl><Input placeholder="e.g., bangalore/plumbing" {...field} value={field.value || ""} onChange={(e) => field.onChange(generateSeoSlug(e.target.value.split('/')))} disabled={effectiveIsSubmitting || isEditing} /></FormControl><FormDescription>Final URL uses original city/category slugs. This is for internal reference.</FormDescription><FormMessage /></FormItem>
        )}/>
        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between items-center">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Content</h3>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateSeo} disabled={effectiveIsSubmitting || !watchedCityId || !watchedCategoryId}>
                  {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate AI SEO
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
        </div>
        <FormField control={form.control} name="h1_title" render={({ field }) => (<FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Plumbing Services in Bangalore" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_title" render={({ field }) => (<FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Best Plumbers in Bangalore | Wecanfix" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_description" render={({ field }) => (<FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="Find expert plumbing services in Bangalore..." {...field} value={field.value || ""} rows={3} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_keywords" render={({ field }) => (<FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., plumbers bangalore, bangalore plumbing" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image Hint (Optional)</FormLabel><FormControl><Input placeholder="e.g., plumber tools" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormDescription>Keywords for OG image if a specific image isn't set.</FormDescription><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Setting Active</FormLabel><FormDescription>Enable this SEO override.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)}/>
        <div className="flex justify-end space-x-3 pt-4"><Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button><Button type="submit" disabled={effectiveIsSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initialData ? 'Save Changes' : 'Create Setting'}</Button></div>
      </form>
    </Form>
  );
}
