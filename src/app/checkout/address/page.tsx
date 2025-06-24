
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, ArrowLeft, MapPin, Mail, User, Phone, MapIcon as SelectMapIcon, Loader2 } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import dynamic from 'next/dynamic';
import { useLoading } from '@/contexts/LoadingContext'; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-2">Loading map...</p></div>,
  ssr: false,
});

const addressSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Invalid email address."),
  phone: z.string().min(10, "Phone number must be at least 10 digits.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format (e.g., +919876543210 or 9876543210)."),
  addressLine1: z.string().min(5, "Address is too short."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City name is too short."),
  state: z.string().min(2, "State name is too short."),
  pincode: z.string().length(6, "Pincode must be 6 digits.").regex(/^\d+$/, "Invalid pincode."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export interface AddressFormData extends z.infer<typeof addressSchema> {
  latitude?: number | null;
  longitude?: number | null;
}

export default function AddressPage() {
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter(); 
  const pathname = usePathname();
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [initialMapCenter, setInitialMapCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const { showLoading } = useLoading(); 
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();

  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      pincode: "",
      latitude: null,
      longitude: null,
    },
  });

  useEffect(() => {
    setIsMounted(true);
    if (isLoadingAuth) return;

    if (typeof window !== 'undefined') {
      const savedAddressRaw = localStorage.getItem('fixbroCustomerAddress');
      let initialFormData: Partial<AddressFormData> = {};

      const loadProfileData = async (currentUser: any) => {
        let profileData: Partial<AddressFormData> = {
            fullName: currentUser.displayName || "",
            email: currentUser.email || "",
            phone: currentUser.phoneNumber || "",
        };
        try {
            const userDocRef = doc(db, "users", currentUser.uid);
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const firestoreData = docSnap.data();
                profileData.fullName = firestoreData.displayName || profileData.fullName;
                profileData.email = firestoreData.email || profileData.email;
                profileData.phone = firestoreData.mobileNumber || profileData.phone;
            }
        } catch (e) {
            console.error("Error fetching user profile from Firestore:", e);
        }
        return profileData;
      };

      const initializeForm = async () => {
        if (user) { 
          const profileDefaults = await loadProfileData(user);
          initialFormData = { ...profileDefaults }; 

          if (savedAddressRaw) {
            try {
              const savedAddress: AddressFormData = JSON.parse(savedAddressRaw);
              if (savedAddress.email === user.email) {
                initialFormData = { ...savedAddress }; 
              } else {
                localStorage.removeItem('fixbroCustomerAddress'); 
              }
            } catch (e) {
              console.error("Error parsing saved address for logged-in user: ", e);
            }
          }
        } else { 
          if (savedAddressRaw) {
            try {
              initialFormData = JSON.parse(savedAddressRaw);
            } catch (e) {
              console.error("Error parsing saved address for guest: ", e);
              const guestEmail = localStorage.getItem('fixbroCustomerEmail');
              if (guestEmail) initialFormData.email = guestEmail;
            }
          } else {
            const guestEmail = localStorage.getItem('fixbroCustomerEmail');
            if (guestEmail) initialFormData.email = guestEmail;
          }
        }
        const finalResetData: AddressFormData = {
          fullName: initialFormData.fullName || "",
          email: initialFormData.email || "",
          phone: initialFormData.phone || "",
          addressLine1: initialFormData.addressLine1 || "",
          addressLine2: initialFormData.addressLine2 || "",
          city: initialFormData.city || "",
          state: initialFormData.state || "",
          pincode: initialFormData.pincode || "",
          latitude: initialFormData.latitude === undefined ? null : initialFormData.latitude,
          longitude: initialFormData.longitude === undefined ? null : initialFormData.longitude,
        };
        form.reset(finalResetData);
      };

      initializeForm();

      logUserActivity(
          'checkoutStep',
          { checkoutStepName: 'address', pageUrl: pathname },
          user?.uid,
          !user ? getGuestId() : null
      );
    }
  }, [form, user, pathname, isLoadingAuth]); 

  const onSubmit = (data: AddressFormData) => {
    showLoading();
    console.log("Address Data with Coords:", data);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fixbroCustomerAddress', JSON.stringify(data));
      localStorage.setItem('fixbroCustomerEmail', data.email); 
    }
    router.push('/checkout/payment'); 
  };

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
        toast({ title: "Could Not Detect Location", description: "Showing default map location. You can search or pan to find your address.", variant: "default", duration: 5000 });
        setInitialMapCenter(null);
        setIsMapModalOpen(true);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleAddressSelectFromMap = useCallback((selectedAddress: Partial<AddressFormData>) => {
    console.log("AddressPage: Received address from map:", selectedAddress);
    if (selectedAddress.addressLine1 !== undefined) form.setValue('addressLine1', selectedAddress.addressLine1, { shouldValidate: true });
    form.setValue('addressLine2', selectedAddress.addressLine2 || "", { shouldValidate: true });
    if (selectedAddress.city !== undefined) form.setValue('city', selectedAddress.city, { shouldValidate: true });
    if (selectedAddress.state !== undefined) form.setValue('state', selectedAddress.state, { shouldValidate: true });
    if (selectedAddress.pincode !== undefined) form.setValue('pincode', selectedAddress.pincode, { shouldValidate: true });
    if (selectedAddress.latitude !== undefined) form.setValue('latitude', selectedAddress.latitude, { shouldValidate: true });
    if (selectedAddress.longitude !== undefined) form.setValue('longitude', selectedAddress.longitude, { shouldValidate: true });
  }, [form]); 

  const handleMapModalClose = useCallback(() => {
    setIsMapModalOpen(false);
  }, []);

  const googleMapsApiKey = appConfig?.googleMapsApiKey;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Cart", href: "/cart" },
    { label: "Schedule", href: "/checkout/schedule" },
    { label: "Your Address" },
  ];

  if (!isMounted || isLoadingAppSettings || isLoadingAuth) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="address" />
        <Card className="shadow-lg animate-pulse">
          <CardHeader>
            <div className="h-8 bg-muted rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-muted rounded w-1/2 mx-auto mt-2"></div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-10 bg-muted rounded"></div>
              </div>
            ))}
            <div className="h-10 bg-muted rounded w-full mt-2"></div> 
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="h-10 w-24 bg-muted rounded"></div>
            <div className="h-10 w-36 bg-muted rounded"></div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <CheckoutStepper currentStepId="address" />
      <Card className="shadow-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl font-headline text-center">Enter Your Address</CardTitle>
              <CardDescription className="text-center text-sm sm:text-base">
                Where should we send our professionals?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="fullName" className="flex items-center text-sm"><User className="mr-2 h-4 w-4 text-muted-foreground" />Full Name</FormLabel>
                      <FormControl>
                        <Input id="fullName" placeholder="e.g., John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="email" className="flex items-center text-sm"><Mail className="mr-2 h-4 w-4 text-muted-foreground" />Email Address</FormLabel>
                      <FormControl>
                        <Input id="email" type="email" placeholder="e.g., john.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="phone" className="flex items-center text-sm"><Phone className="mr-2 h-4 w-4 text-muted-foreground" />Phone Number</FormLabel>
                      <FormControl>
                        <Input id="phone" type="tel" placeholder="e.g., 9876543210" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {googleMapsApiKey && googleMapsApiKey.trim() !== "" ? (
                <Button type="button" variant="outline" className="w-full flex items-center" onClick={handleOpenMapClick} disabled={isLocating}>
                   {isLocating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SelectMapIcon className="mr-2 h-4 w-4 text-primary" />
                  )}
                  Select Address via Map
                </Button>
              ) : (
                <p className="text-xs sm:text-sm text-muted-foreground text-center">Google Maps API key not configured. Please set it in admin settings to use map selection.</p>
              )}
              
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="addressLine1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="addressLine1" className="flex items-center text-sm"><MapPin className="mr-2 h-4 w-4 text-muted-foreground" />Address Line 1</FormLabel>
                      <FormControl>
                        <Input id="addressLine1" placeholder="House No., Building, Street" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressLine2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="addressLine2" className="text-sm">Address Line 2 (Optional)</FormLabel>
                      <FormControl>
                        <Input id="addressLine2" placeholder="Apartment, Suite, Floor, Landmark etc." {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem><FormLabel htmlFor="city" className="text-sm">City</FormLabel><FormControl><Input id="city" placeholder="e.g., Mumbai" {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem><FormLabel htmlFor="state" className="text-sm">State</FormLabel><FormControl><Input id="state" placeholder="e.g., Maharashtra" {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="pincode"
                  render={({ field }) => (
                    <FormItem><FormLabel htmlFor="pincode" className="text-sm">Pincode</FormLabel><FormControl><Input id="pincode" placeholder="e.g., 400001" {...field} /></FormControl><FormMessage /></FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
              <Link href="/checkout/schedule" passHref className="w-full sm:w-auto">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Schedule
                </Button>
              </Link>
              <Button type="submit" className="w-full sm:w-auto">
                Proceed to Payment <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] h-[80vh] p-0 flex flex-col">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-lg sm:text-xl">Select Address on Map</DialogTitle>
          </DialogHeader>
          <div className="flex-grow">
            {googleMapsApiKey && googleMapsApiKey.trim() !== "" ? (
              <MapAddressSelector
                apiKey={googleMapsApiKey}
                onAddressSelect={handleAddressSelectFromMap}
                onClose={handleMapModalClose} 
                initialCenter={initialMapCenter}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground text-center p-4 text-sm">Map functionality requires a Google Maps API Key.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
