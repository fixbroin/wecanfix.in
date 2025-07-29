
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
import type { FirestoreCity, FirestoreArea, FirestoreCategory, AreaCategorySeoSetting } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { generateAreaCategorySeo } from '@/ai/flows/generateAreaCategorySeoFlow';
import { useToast } from "@/hooks/use-toast";

const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
};

const areaCategorySeoFormSchema = z.object({
  cityId: z.string({ required_error: "Please select a city." }),
  areaId: z.string({ required_error: "Please select an area." }),
  categoryId: z.string({ required_error: "Please select a category." }),
  slug: z.string().optional().or(z.literal('')),
  h1_title: z.string().max(100, "H1 title too long.").optional().or(z.literal('')),
  meta_title: z.string().max(70, "Meta title too long.").optional().or(z.literal('')),
  meta_description: z.string().max(300, "Meta description too long.").optional().or(z.literal('')),
  meta_keywords: z.string().optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 chars.").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export type AreaCategorySeoFormData = z.infer<typeof areaCategorySeoFormSchema>;

interface AreaCategorySeoFormProps {
  onSubmit: (data: AreaCategorySeoFormData & { id?: string }) => Promise<void>;
  initialData?: AreaCategorySeoSetting | null;
  cities: FirestoreCity[];
  areas: FirestoreArea[];
  categories: FirestoreCategory[];
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function AreaCategorySeoForm({ onSubmit: onSubmitProp, initialData, cities, areas, categories, onCancel, isSubmitting = false }: AreaCategorySeoFormProps) {
  const [filteredAreas, setFilteredAreas] = useState<FirestoreArea[]>([]);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const { toast } = useToast();

  const form = useForm<AreaCategorySeoFormData>({
    resolver: zodResolver(areaCategorySeoFormSchema),
    defaultValues: {
      cityId: undefined, areaId: undefined, categoryId: undefined, slug: "", h1_title: "", meta_title: "", meta_description: "", meta_keywords: "", imageHint: "", isActive: true,
    },
  });

  const watchedCityId = form.watch("cityId");
  const watchedAreaId = form.watch("areaId");
  const watchedCategoryId = form.watch("categoryId");

  useEffect(() => {
    if (initialData) {
      const areasForInitialCity = areas.filter(a => a.cityId === initialData.cityId);
      setFilteredAreas(areasForInitialCity);
      form.reset({
        cityId: initialData.cityId,
        areaId: initialData.areaId,
        categoryId: initialData.categoryId,
        slug: initialData.slug || "",
        h1_title: initialData.h1_title || "",
        meta_title: initialData.meta_title || "",
        meta_description: initialData.meta_description || "",
        meta_keywords: initialData.meta_keywords || "",
        imageHint: initialData.imageHint || "",
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
    } else {
      setFilteredAreas([]);
      form.reset({ cityId: undefined, areaId: undefined, categoryId: undefined, slug: "", h1_title: "", meta_title: "", meta_description: "", meta_keywords: "", imageHint: "", isActive: true });
    }
  }, [initialData, form, areas]);

  useEffect(() => {
    if (watchedCityId) {
      const newFilteredAreas = areas.filter(a => a.cityId === watchedCityId);
      setFilteredAreas(newFilteredAreas);
      if (!initialData || (initialData && initialData.cityId !== watchedCityId)) {
        if (!newFilteredAreas.find(a => a.id === form.getValues('areaId'))) {
          form.setValue('areaId', undefined, { shouldValidate: true });
        }
      }
    } else {
      setFilteredAreas([]);
      if (!initialData) {
          form.setValue('areaId', undefined, { shouldValidate: true });
      }
    }
  }, [watchedCityId, areas, form, initialData]);


  useEffect(() => {
    if (watchedCityId && watchedAreaId && watchedCategoryId && !initialData && !form.getFieldState('slug').isDirty) {
      const city = cities.find(c => c.id === watchedCityId);
      const area = areas.find(a => a.id === watchedAreaId);
      const category = categories.find(c => c.id === watchedCategoryId);
      if (city && area && category) {
        form.setValue('slug', generateSeoSlug([city.slug, area.slug, category.slug]));
      }
    }
  }, [watchedCityId, watchedAreaId, watchedCategoryId, cities, areas, categories, initialData, form]);

  const handleGenerateSeo = async () => {
    const cityId = form.getValues("cityId");
    const areaId = form.getValues("areaId");
    const categoryId = form.getValues("categoryId");

    const selectedCity = cities.find(c => c.id === cityId);
    const selectedArea = areas.find(a => a.id === areaId);
    const selectedCategory = categories.find(c => c.id === categoryId);

    if (!selectedCity || !selectedArea || !selectedCategory) {
      toast({
        title: "City, Area & Category Required",
        description: "Please select a city, area, and category first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
      const result = await generateAreaCategorySeo({ 
        cityName: selectedCity.name, 
        areaName: selectedArea.name,
        categoryName: selectedCategory.name 
      });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("meta_title", result.meta_title, { shouldValidate: true });
      form.setValue("meta_description", result.meta_description, { shouldValidate: true });
      form.setValue("meta_keywords", result.meta_keywords, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "SEO fields have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
      console.error("Error generating area-category SEO:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
      setIsGeneratingSeo(false);
    }
  };
  
  const handleSubmit = async (formData: AreaCategorySeoFormData) => {
    await onSubmitProp({ ...formData, id: initialData?.id });
  };
  
  const isEditing = !!initialData;
  const effectiveIsSubmitting = isSubmitting || isGeneratingSeo;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField control={form.control} name="cityId" render={({ field }) => (
          <FormItem><FormLabel>City</FormLabel>
            <Select
              key={`city-${field.value || 'new'}`}
              onValueChange={field.onChange}
              value={field.value || undefined}
              disabled={effectiveIsSubmitting || isEditing}
            >
              <FormControl><SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger></FormControl>
              <SelectContent>{cities.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}/>
        <FormField control={form.control} name="areaId" render={({ field }) => (
          <FormItem><FormLabel>Area</FormLabel>
            <Select
              key={`area-${field.value || 'new'}-${watchedCityId}`}
              onValueChange={field.onChange}
              value={field.value || undefined}
              disabled={effectiveIsSubmitting || isEditing || !watchedCityId || filteredAreas.length === 0}
            >
              <FormControl><SelectTrigger><SelectValue placeholder={!watchedCityId ? "Select city first" : (filteredAreas.length === 0 ? "No areas for city" : "Select area")} /></SelectTrigger></FormControl>
              <SelectContent>{filteredAreas.map(a => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}/>
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem><FormLabel>Category</FormLabel>
            <Select
              key={`category-${field.value || 'new'}`}
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
          <FormItem><FormLabel>Slug Segment {isEditing ? "(Non-editable)" : "(Auto-generated or custom)"}</FormLabel><FormControl><Input placeholder="e.g., bangalore/whitefield/plumbing" {...field} value={field.value || ""} onChange={(e) => field.onChange(generateSeoSlug(e.target.value.split('/')))} disabled={effectiveIsSubmitting || isEditing} /></FormControl><FormDescription>Final URL uses original city/area/category slugs. This is for internal reference.</FormDescription><FormMessage /></FormItem>
        )}/>
        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between items-center">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Content</h3>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateSeo} disabled={effectiveIsSubmitting || !watchedCityId || !watchedAreaId || !watchedCategoryId}>
                  {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate AI SEO
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
        </div>
        <FormField control={form.control} name="h1_title" render={({ field }) => (<FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Plumbing in Whitefield, Bangalore" {...field} value={field.value || ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_title" render={({ field }) => (<FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Plumbers Whitefield, Bangalore | wecanfix" {...field} value={field.value || ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_description" render={({ field }) => (<FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="Find expert plumbers in Whitefield, Bangalore..." {...field} value={field.value || ""} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_keywords" render={({ field }) => (<FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., plumbers whitefield, whitefield plumbing" {...field} value={field.value || ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image Hint (Optional)</FormLabel><FormControl><Input placeholder="e.g., plumber working area" {...field} value={field.value || ""} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Keywords for OG image if specific image isn't set.</FormDescription><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Setting Active</FormLabel><FormDescription>Enable this SEO override.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)}/>
        <div className="flex justify-end space-x-3 pt-4"><Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button><Button type="submit" disabled={effectiveIsSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initialData ? 'Save Changes' : 'Create Setting'}</Button></div>
      </form>
    </Form>
  );
}
