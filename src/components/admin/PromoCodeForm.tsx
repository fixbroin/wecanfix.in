
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FirestorePromoCode, DiscountType } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, CalendarIcon } from "lucide-react";
// Removed date-fns format, will use toLocaleDateString for India format
import { cn } from "@/lib/utils";

const promoCodeFormSchemaBase = z.object({
  code: z.string()
    .min(3, "Code must be at least 3 characters.")
    .max(20, "Code must be 20 characters or less.")
    .regex(/^[A-Z0-9]+$/, "Code must be uppercase alphanumeric (A-Z, 0-9).")
    .transform(val => val.toUpperCase()), 
  description: z.string().max(200, "Description too long.").optional().or(z.literal('')),
  discountType: z.custom<DiscountType>((val) => ['percentage', 'fixed'].includes(val as string), {
    message: "Invalid discount type selected.",
  }),
  discountValue: z.coerce.number().positive("Discount value must be positive."),
  minBookingAmount: z.coerce.number().nonnegative("Min booking amount must be non-negative.").optional().nullable(),
  maxUses: z.coerce.number().int().positive("Max uses must be a positive integer.").optional().nullable(),
  maxUsesPerUser: z.coerce.number().int().positive("Max uses per user must be a positive integer.").optional().nullable(),
  validFrom: z.date().optional().nullable(),
  validUntil: z.date().optional().nullable(),
  isActive: z.boolean().default(true),
  isHidden: z.boolean().default(false),
});

const promoCodeFormSchema = promoCodeFormSchemaBase.refine(data => {
    if (data.discountType === 'percentage' && (data.discountValue < 1 || data.discountValue > 100)) {
      return false;
    }
    return true;
  }, {
    message: "Percentage discount must be between 1 and 100.",
    path: ["discountValue"],
  })
  .refine(data => {
    if (data.validFrom && data.validUntil && data.validUntil < data.validFrom) {
      return false;
    }
    return true;
  }, {
    message: "Valid Until date cannot be before Valid From date.",
    path: ["validUntil"],
  });


export type PromoCodeFormData = z.infer<typeof promoCodeFormSchema>;

interface PromoCodeFormProps {
  onSubmit: (data: PromoCodeFormData & { id?: string }) => Promise<void>;
  initialData?: FirestorePromoCode | null;
  onCancel: () => void;
  isSubmitting?: boolean;
  allPromoCodes: FirestorePromoCode[]; 
}

export default function PromoCodeForm({
  onSubmit: onSubmitProp,
  initialData,
  onCancel,
  isSubmitting = false,
  allPromoCodes
}: PromoCodeFormProps) {
  
  const form = useForm<PromoCodeFormData>({
    resolver: zodResolver(promoCodeFormSchema),
    defaultValues: initialData 
    ? {
        code: initialData.code,
        description: initialData.description || "",
        discountType: initialData.discountType,
        discountValue: initialData.discountValue,
        minBookingAmount: initialData.minBookingAmount === undefined ? null : initialData.minBookingAmount,
        maxUses: initialData.maxUses === undefined ? null : initialData.maxUses,
        maxUsesPerUser: initialData.maxUsesPerUser === undefined ? null : initialData.maxUsesPerUser,
        validFrom: initialData.validFrom ? initialData.validFrom.toDate() : null,
        validUntil: initialData.validUntil ? initialData.validUntil.toDate() : null,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        isHidden: initialData.isHidden || false,
      }
    : {
        code: "", description: "", discountType: "percentage", discountValue: 10,
        minBookingAmount: null, maxUses: null, maxUsesPerUser: null, validFrom: null, validUntil: null, isActive: true, isHidden: false,
      },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        code: initialData.code,
        description: initialData.description || "",
        discountType: initialData.discountType,
        discountValue: initialData.discountValue,
        minBookingAmount: initialData.minBookingAmount === undefined ? null : initialData.minBookingAmount,
        maxUses: initialData.maxUses === undefined ? null : initialData.maxUses,
        maxUsesPerUser: initialData.maxUsesPerUser === undefined ? null : initialData.maxUsesPerUser,
        validFrom: initialData.validFrom ? initialData.validFrom.toDate() : null,
        validUntil: initialData.validUntil ? initialData.validUntil.toDate() : null,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        isHidden: initialData.isHidden || false,
      });
    } else {
      form.reset({
        code: "", description: "", discountType: "percentage", discountValue: 10,
        minBookingAmount: null, maxUses: null, maxUsesPerUser: null, validFrom: null, validUntil: null, isActive: true, isHidden: false,
      });
    }
  }, [initialData, form]);

  const handleSubmit = async (formData: PromoCodeFormData) => {
    const isDuplicate = allPromoCodes.some(pc => pc.code.toUpperCase() === formData.code.toUpperCase() && pc.id !== initialData?.id);
    if (isDuplicate) {
      form.setError("code", { type: "manual", message: "This promo code already exists. Please use a unique code." });
      return;
    }

    await onSubmitProp({
      ...formData,
      id: initialData?.id,
    });
  };

  const formatDateForInput = (date: Date | null | undefined): string => {
    if (!date) return "Pick a date";
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <Form {...form} key={initialData ? `promocode-form-${initialData.id}` : 'new-promocode-form'}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="p-6 space-y-5">
            <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Promo Code</FormLabel>
                <FormControl>
                    <Input
                    placeholder="E.g., SUMMER20"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    disabled={isSubmitting || !!initialData}
                    />
                </FormControl>
                {!!initialData && <FormDescription>Code cannot be changed for existing promo.</FormDescription>}
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Internal note about this promo" {...field} rows={2} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="discountType" render={({ field }) => (
                    <FormItem><FormLabel>Discount Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="percentage">Percentage (%)</SelectItem><SelectItem value="fixed">Fixed Amount (₹)</SelectItem></SelectContent>
                    </Select>
                    <FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="discountValue" render={({ field }) => (
                    <FormItem><FormLabel>Discount Value</FormLabel><FormControl><Input type="number" step="0.01" placeholder={form.watch("discountType") === "percentage" ? "e.g., 15" : "e.g., 100"} {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="minBookingAmount" render={({ field }) => (
                    <FormItem><FormLabel>Min. Booking Amount (₹) (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 500" {...field} value={field.value ?? ""} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="maxUses" render={({ field }) => (
                    <FormItem><FormLabel>Max Total Uses (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 100" {...field} value={field.value ?? ""} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>
            
            <FormField control={form.control} name="maxUsesPerUser" render={({ field }) => (
                <FormItem><FormLabel>Max Uses Per User (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 1" {...field} value={field.value ?? ""} disabled={isSubmitting} /></FormControl><FormDescription>Leave blank for unlimited uses per user.</FormDescription><FormMessage /></FormItem>
            )}/>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="validFrom" render={({ field }) => (
                    <FormItem className="flex flex-col"><FormLabel>Valid From (Optional)</FormLabel>
                        <Popover><PopoverTrigger asChild>
                            <FormControl>
                                <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSubmitting}>
                                    {formatDateForInput(field.value)}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1 )) && !initialData} initialFocus/>
                        </PopoverContent></Popover>
                    <FormMessage /></FormItem>
                )}/>
                 <FormField control={form.control} name="validUntil" render={({ field }) => (
                    <FormItem className="flex flex-col"><FormLabel>Valid Until (Optional)</FormLabel>
                        <Popover><PopoverTrigger asChild>
                            <FormControl>
                                <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSubmitting}>
                                    {formatDateForInput(field.value)}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value ?? undefined} onSelect={field.onChange} disabled={(date) => (form.getValues("validFrom") ? date < form.getValues("validFrom")! : date < new Date(new Date().setDate(new Date().getDate() -1 )))} initialFocus/>
                        </PopoverContent></Popover>
                    <FormMessage /></FormItem>
                )}/>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
                    <div className="space-y-0.5"><FormLabel>Promo Code Active</FormLabel><FormDescription>If unchecked, code cannot be used.</FormDescription></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} /></FormControl>
                    </FormItem>
                )}/>
                <FormField control={form.control} name="isHidden" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
                    <div className="space-y-0.5"><FormLabel>Hidden Promo Code</FormLabel><FormDescription>If checked, code will not be publicly listed.</FormDescription></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} /></FormControl>
                    </FormItem>
                )}/>
            </div>
        </div>
        
        <div className="p-6 border-t bg-background flex flex-col sm:flex-row sm:justify-end gap-3 sticky bottom-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Save Changes' : 'Create Promo Code'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
