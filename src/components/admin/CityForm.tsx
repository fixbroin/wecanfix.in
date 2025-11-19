
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreCity } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { generateCitySeo } from '@/ai/flows/generateCitySeoFlow';
import { useToast } from "@/hooks/use-toast";

const generateSlug = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const cityFormSchema = z.object({
  name: z.string().min(2, { message: "City name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., new-delhi).").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  // SEO Fields
  h1_title: z.string().max(100, "H1 title too long.").optional().or(z.literal('')),
  seo_title: z.string().max(70, "Meta title too long.").optional().or(z.literal('')),
  seo_description: z.string().max(300, "Meta description too long.").optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
});

type CityFormData = z.infer<typeof cityFormSchema>;

interface CityFormProps {
  onSubmit: (data: Omit<FirestoreCity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreCity | null;
  onCancel: () => void;
  isSubmitting?: boolean; 
}

export default function CityForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting = false }: CityFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const { toast } = useToast();

  const form = useForm<CityFormData>({
    resolver: zodResolver(cityFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      isActive: true,
      h1_title: "",
      seo_title: "",
      seo_description: "",
      seo_keywords: "",
    },
  });

  const watchedName = form.watch("name");

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        slug: initialData.slug,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
      });
    } else {
      form.reset({
        name: "", slug: "", isActive: true,
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      });
    }
  }, [initialData, form]);
  
  useEffect(() => {
    // Only auto-generate slug for new cities if slug field is currently empty
    if (watchedName && !initialData && !form.getValues('slug')) { 
      form.setValue('slug', generateSlug(watchedName));
    }
  }, [watchedName, initialData, form]);

  const handleGenerateSeo = async () => {
    const cityName = form.getValues("name");
    if (!cityName || cityName.trim() === "") {
        toast({
            title: "City Name Required",
            description: "Please enter a city name before generating SEO content.",
            variant: "destructive",
        });
        return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
        const result = await generateCitySeo({ cityName });
        form.setValue("h1_title", result.h1_title, { shouldValidate: true });
        form.setValue("seo_title", result.seo_title, { shouldValidate: true });
        form.setValue("seo_description", result.seo_description, { shouldValidate: true });
        form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true });
        toast({ title: "Content Generated!", description: "SEO fields have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
        console.error("Error generating city SEO:", error);
        toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
        setIsGeneratingSeo(false);
    }
  };


  const handleSubmit = async (formData: CityFormData) => {
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
              <FormLabel>City Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., New Delhi" {...field} disabled={isSubmitting || isGeneratingSeo} />
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
                    placeholder="e.g., new-delhi" 
                    {...field} 
                    onChange={(e) => field.onChange(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                    disabled={isSubmitting || isGeneratingSeo || !!initialData} // Slug is non-editable for existing cities
                />
              </FormControl>
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
                <FormLabel>City Active</FormLabel>
                <FormDescription>If unchecked, this city will not be shown publicly.</FormDescription>
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
                  disabled={isGeneratingSeo || isSubmitting || !watchedName}
              >
                  {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate AI SEO
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (
                <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Best Home Services in New Delhi" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (
                <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., New Delhi Home Services | Wecanfix" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (
                <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Find top home services in New Delhi. Wecanfix offers quality and convenience." {...field} rows={3} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (
                <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., new delhi services, home repair delhi" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || isGeneratingSeo}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isGeneratingSeo}>
                {(isSubmitting || isGeneratingSeo) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Create City'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
