
"use client";

import { useEffect } from 'react';
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Trash2, PlusCircle, Percent, Save, Loader2 } from "lucide-react";
import type { PlatformFeeSetting } from '@/types/firestore';
import { nanoid } from 'nanoid'; // For generating unique IDs for new fees

const platformFeeItemSchema = z.object({
  id: z.string(), // For React key and tracking
  name: z.string().min(2, "Fee name is required (e.g., Convenience Fee).").max(50, "Name too long."),
  type: z.enum(['percentage', 'fixed'], { required_error: "Fee type is required."}),
  value: z.coerce.number().positive("Fee value must be a positive number."),
  feeTaxRatePercent: z.coerce.number()
    .min(0, "Tax rate must be 0 or greater.")
    .max(100, "Tax rate cannot exceed 100.")
    .default(0),
  isActive: z.boolean().default(true),
}).refine(data => {
    if (data.type === 'percentage' && (data.value < 0.01 || data.value > 100)) {
        return false;
    }
    return true;
}, {
    message: "Percentage value must be between 0.01 and 100.",
    path: ["value"],
});


const platformSettingsFormSchema = z.object({
  platformFees: z.array(platformFeeItemSchema).optional(),
});

type PlatformSettingsFormData = z.infer<typeof platformSettingsFormSchema>;

interface PlatformSettingsFormProps {
  initialFees: PlatformFeeSetting[];
  onSave: (fees: PlatformFeeSetting[]) => Promise<void>;
  isSaving: boolean;
}

export default function PlatformSettingsForm({ initialFees, onSave, isSaving }: PlatformSettingsFormProps) {
  const form = useForm<PlatformSettingsFormData>({
    resolver: zodResolver(platformSettingsFormSchema),
    defaultValues: {
      platformFees: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "platformFees",
  });

  useEffect(() => {
    // Ensure initialFees have client-side IDs if they don't already
    const feesWithIds = initialFees.map(fee => ({
        ...fee,
        id: fee.id || nanoid(), // Use existing ID or generate one
        feeTaxRatePercent: fee.feeTaxRatePercent ?? 0, // Ensure default for older data
    }));
    form.reset({ platformFees: feesWithIds });
  }, [initialFees, form]);

  const addNewFee = () => {
    append({
      id: nanoid(), // Generate a unique ID for the new fee item
      name: "",
      type: "fixed",
      value: 0,
      feeTaxRatePercent: 0,
      isActive: true,
    });
  };

  const onSubmit = async (data: PlatformSettingsFormData) => {
    // The 'id' field in PlatformFeeSetting is client-side for React keys.
    // Firestore documents typically get their ID automatically or you set it as the doc name.
    // Here, 'id' is just part of the array element structure.
    await onSave(data.platformFees || []);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Manage Platform Fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                No platform fees configured yet. Click "Add New Fee" to start.
              </p>
            )}
            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 shadow-sm border relative">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`platformFees.${index}.name`}
                    render={({ field: itemField }) => (
                      <FormItem>
                        <FormLabel>Fee Name</FormLabel>
                        <FormControl><Input placeholder="e.g., Convenience Fee" {...itemField} disabled={isSaving} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`platformFees.${index}.type`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>Fee Type</FormLabel>
                          <Select onValueChange={itemField.onChange} value={itemField.value} disabled={isSaving}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                              <SelectItem value="percentage">Percentage (%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`platformFees.${index}.value`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>
                            Fee Value
                            {form.watch(`platformFees.${index}.type`) === 'percentage' ? ' (%)' : ' (₹)'}
                          </FormLabel>
                          <FormControl><Input type="number" step="0.01" placeholder="e.g., 50 or 2.5" {...itemField} disabled={isSaving}/></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                   <FormField
                    control={form.control}
                    name={`platformFees.${index}.feeTaxRatePercent`}
                    render={({ field: itemField }) => (
                      <FormItem>
                        <FormLabel className="flex items-center"><Percent className="mr-1 h-4 w-4 text-muted-foreground" />Tax Rate on this Fee (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="e.g., 18 or 0" {...itemField} disabled={isSaving}/></FormControl>
                        <FormDescription>Tax applied directly to this fee's value. Enter 0 if no tax on fee.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`platformFees.${index}.isActive`}
                    render={({ field: itemField }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Fee Active</FormLabel>
                          <FormDescription>Enable or disable this fee.</FormDescription>
                        </div>
                        <FormControl><Switch checked={itemField.value} onCheckedChange={itemField.onChange} disabled={isSaving}/></FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={isSaving}
                  className="absolute top-2 right-2 text-destructive hover:text-destructive-foreground hover:bg-destructive/90"
                  aria-label="Remove fee"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={addNewFee} disabled={isSaving}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Fee
            </Button>
          </CardContent>
        </Card>

        <CardFooter className="border-t pt-6 flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Platform Fee Settings
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
