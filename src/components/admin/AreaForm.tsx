
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
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { generateAreaSeo } from '@/ai/flows/generateAreaSeoFlow';
import { useToast } from "@/hooks/use-toast";

const generateSlug = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const areaFormSchema = z.object({
  name: z.string().min(2, { message: "Area name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-area-name).").optional().or(z.literal('')),
  cityId: z.string({ required_error: "Please select a parent city." }),
  isActive: z.boolean().default(true),
  // SEO Fields
  h1_title: z.string().max(100, "H1 title too long.").optional().or(z.literal('')),
  seo_title: z.string().max(70, "Meta title too long.").optional().or(z.literal('')),
  seo_description: z.string().max(300, "Meta description too long.").optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
});

type AreaFormData = z.infer<typeof areaFormSchema>;

interface AreaFormProps {
  onSubmit: (data: Omit<FirestoreArea, 'id' | 'cityName' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreArea | null;
  onCancel: () => void;
  cities: FirestoreCity[]; // To populate parent city dropdown
  isSubmitting?: boolean; 
}

export default function AreaForm({ onSubmit: onSubmitProp, initialData, onCancel, cities, isSubmitting = false }: AreaFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<AreaFormData>({
    resolver: zodResolver(areaFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      cityId: undefined,
      isActive: true,
      h1_title: "",
      seo_title: "",
      seo_description: "",
      seo_keywords: "",
    },
  });

  const watchedName = form.watch("name");
  const watchedCityId = form.watch("cityId");

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        slug: initialData.slug,
        cityId: initialData.cityId,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
      });
    } else {
      form.reset({
        name: "", slug: "", cityId: undefined, isActive: true,
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      });
    }
  }, [initialData, form]);
  
  useEffect(() => {
    if (watchedName && !initialData && !form.getFieldState('slug').isDirty) { 
      form.setValue('slug', generateSlug(watchedName));
    }
  }, [watchedName, initialData, form]);

  const handleGenerateSeo = async () => {
    const areaName = form.getValues("name");
    const cityId = form.getValues("cityId");
    const parentCity = cities.find(c => c.id === cityId);

    if (!areaName || !parentCity) {
      toast({
        title: "Area & City Required",
        description: "Please enter an area name and select a parent city first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
      const result = await generateAreaSeo({ areaName, cityName: parentCity.name });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("seo_title", result.seo_title, { shouldValidate: true });
      form.setValue("seo_description", result.seo_description, { shouldValidate: true });
      form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "SEO fields have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
      console.error("Error generating area SEO:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
      setIsGeneratingSeo(false);
    }
  };


  const handleSubmit = async (formData: AreaFormData) => {
    await onSubmitProp({
      ...formData,
      id: initialData?.id,
    });
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Area Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Whitefield" {...field} disabled={isSubmitting || isGeneratingSeo} />
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
                    placeholder="e.g., whitefield" 
                    {...field} 
                    onChange={(e) => field.onChange(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                    disabled={isSubmitting || isGeneratingSeo || !!initialData} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cityId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parent City</FormLabel>
              <Select
                key={`city-select-${initialData?.id || 'new-area'}-${cities.length}-${field.value}`}
                onValueChange={field.onChange}
                value={field.value}
                disabled={isSubmitting || isGeneratingSeo || cities.length === 0}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={cities.length > 0 ? "Select parent city" : "No cities available"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {cities.map(city => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
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
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5">
                <FormLabel>Area Active</FormLabel>
                <FormDescription>If unchecked, this area will not be shown publicly.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isGeneratingSeo} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Settings (Optional)</h3>
              <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSeo}
                  disabled={isGeneratingSeo || isSubmitting || !watchedName || !watchedCityId}
              >
                  {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate AI SEO
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (
                <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Best Services in Whitefield, Bangalore" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (
                <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Whitefield Services | Wecanfix" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (
                <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Find all home services in Whitefield, Bangalore." {...field} rows={3} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (
                <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., whitefield services, bangalore repair" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || isGeneratingSeo}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isGeneratingSeo || (cities.length === 0 && !initialData) }>
                {(isSubmitting || isGeneratingSeo) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Create Area'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
