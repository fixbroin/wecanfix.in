
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, MapPin, Mail, User, Phone, MapIcon as SelectMapIcon } from 'lucide-react';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useToast } from '@/hooks/use-toast';
import type { Address } from '@/types/firestore';

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-2">Loading map...</p></div>,
  ssr: false,
});

export const addressSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Invalid email address."),
  phone: z.string().min(10, "Phone number must be at least 10 digits.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format."),
  addressLine1: z.string().min(5, "Address is too short."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City name is too short."),
  state: z.string().min(2, "State name is too short."),
  pincode: z.string().length(6, "Pincode must be 6 digits.").regex(/^\d+$/, "Invalid pincode."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export type AddressFormData = z.infer<typeof addressSchema>;

interface AddressFormProps {
  initialData?: Partial<Address> | null;
  onSubmit: (data: AddressFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitButtonText?: string;
}

export default function AddressForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitButtonText = 'Save Address',
}: AddressFormProps) {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [initialMapCenter, setInitialMapCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [isMapLocationSet, setIsMapLocationSet] = useState(false);

  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: initialData?.fullName || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      addressLine1: initialData?.addressLine1 || "",
      addressLine2: initialData?.addressLine2 || "",
      city: initialData?.city || "",
      state: initialData?.state || "",
      pincode: initialData?.pincode || "",
      latitude: initialData?.latitude === undefined ? null : initialData.latitude,
      longitude: initialData?.longitude === undefined ? null : initialData.longitude,
    },
  });

  useEffect(() => {
    // Determine if the initial data has coordinates
    const hasInitialCoords = !!(initialData?.latitude && initialData?.longitude);
    setIsMapLocationSet(hasInitialCoords);

    form.reset({
      fullName: initialData?.fullName || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      addressLine1: initialData?.addressLine1 || "",
      addressLine2: initialData?.addressLine2 || "",
      city: initialData?.city || "",
      state: initialData?.state || "",
      pincode: initialData?.pincode || "",
      latitude: initialData?.latitude === undefined ? null : initialData.latitude,
      longitude: initialData?.longitude === undefined ? null : initialData.longitude,
    });
  }, [initialData, form]);

  const handleOpenMapClick = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation Not Supported", description: "Your browser does not support location detection.", variant: "destructive" });
      setInitialMapCenter(null);
      setIsMapModalOpen(true);
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setInitialMapCenter({ lat: latitude, lng: longitude });
        setIsMapModalOpen(true);
        setIsLocating(false);
      },
      (error) => {
        console.warn(`Geolocation error: ${error.message}`);
        toast({ title: "Could Not Detect Location", description: "Showing default map location.", variant: "default" });
        setInitialMapCenter(null);
        setIsMapModalOpen(true);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleAddressSelectFromMap = useCallback((selectedAddress: Partial<AddressFormData>) => {
    Object.entries(selectedAddress).forEach(([key, value]) => {
      form.setValue(key as keyof AddressFormData, value, { shouldValidate: true });
    });
    setIsMapLocationSet(true);
  }, [form]);

  const googleMapsApiKey = appConfig?.googleMapsApiKey;

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            
            {googleMapsApiKey ? (
                <Button type="button" variant="outline" onClick={handleOpenMapClick} disabled={isLocating || isSubmitting}>
                   {isLocating ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<SelectMapIcon className="mr-2 h-4 w-4 text-primary" />)}
                   Select Address via Map
                </Button>
            ) : null}
            
            {!isMapLocationSet && !initialData?.id && (
                <Alert variant="destructive" className="mt-2">
                    <MapPin className="h-4 w-4" />
                    <AlertTitle>Location Required</AlertTitle>
                    <AlertDescription>
                        Please use the "Select Address via Map" button to set your location before saving.
                    </AlertDescription>
                </Alert>
            )}

            <FormField control={form.control} name="addressLine1" render={({ field }) => (<FormItem><FormLabel>Address Line 1</FormLabel><FormControl><Input placeholder="House No., Building, Street" {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="addressLine2" render={({ field }) => (<FormItem><FormLabel>Address Line 2 (Optional)</FormLabel><FormControl><Input placeholder="Apartment, Floor, Landmark" {...field} value={field.value ?? ""} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="state" render={({ field }) => (<FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
            </div>
            <FormField control={form.control} name="pincode" render={({ field }) => (<FormItem><FormLabel>Pincode</FormLabel><FormControl><Input {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || (!initialData?.id && !isMapLocationSet)}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitButtonText}
            </Button>
          </div>
        </form>
      </Form>
      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] h-[80vh] p-0 flex flex-col">
          <DialogHeader className="p-4 border-b"><DialogTitle>Select Address on Map</DialogTitle></DialogHeader>
          <div className="flex-grow">
            {googleMapsApiKey ? (<MapAddressSelector apiKey={googleMapsApiKey} onAddressSelect={handleAddressSelectFromMap} onClose={() => setIsMapModalOpen(false)} initialCenter={initialMapCenter}/>) : (<p className="text-muted-foreground p-4 text-center">Map functionality not available.</p>)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
