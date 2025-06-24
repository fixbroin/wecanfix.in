
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProviderApplication, ProviderControlOptions } from '@/types/firestore';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const step1CategorySkillsSchema = z.object({
  workCategoryId: z.string({ required_error: "Please select your primary work category." }),
  experienceLevelId: z.string({ required_error: "Please select your experience level." }),
  skillLevelId: z.string({ required_error: "Please select your skill level." }),
});

type Step1FormData = z.infer<typeof step1CategorySkillsSchema>;

interface Step1CategorySkillsProps {
  onNext: (data: Partial<ProviderApplication>) => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
}

export default function Step1CategorySkills({
  onNext,
  initialData,
  controlOptions,
  isSaving,
}: Step1CategorySkillsProps) {
  const form = useForm<Step1FormData>({
    resolver: zodResolver(step1CategorySkillsSchema),
    defaultValues: {
      workCategoryId: initialData.workCategoryId || undefined,
      experienceLevelId: initialData.experienceLevelId || undefined,
      skillLevelId: initialData.skillLevelId || undefined,
    },
  });

  const handleSubmit = (data: Step1FormData) => {
    const category = controlOptions?.categories.find(c => c.id === data.workCategoryId);
    const experienceLevel = controlOptions?.experienceLevels.find(e => e.id === data.experienceLevelId);
    const skillLevel = controlOptions?.skillLevels.find(s => s.id === data.skillLevelId);

    const applicationData: Partial<ProviderApplication> = {
      workCategoryId: data.workCategoryId,
      workCategoryName: category?.name,
      experienceLevelId: data.experienceLevelId,
      experienceLevelLabel: experienceLevel?.label,
      skillLevelId: data.skillLevelId,
      skillLevelLabel: skillLevel?.label,
    };
    onNext(applicationData);
  };

  if (!controlOptions) {
    return (
      <Card><CardContent className="pt-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /> Loading options...</CardContent></Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="workCategoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Work Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isSaving}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select your main category" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {controlOptions.categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="experienceLevelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Experience Level</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isSaving}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select your experience" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {controlOptions.experienceLevels.map(level => (
                      <SelectItem key={level.id} value={level.id}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="skillLevelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Skill Level</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isSaving}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select your skill level" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {controlOptions.skillLevels.map(level => (
                      <SelectItem key={level.id} value={level.id}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save &amp; Continue
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}

    