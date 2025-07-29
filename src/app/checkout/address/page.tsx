
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, ArrowLeft, PlusCircle, CheckCircle, Home, Loader2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { useLoading } from '@/contexts/LoadingContext';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import type { Address, FirestoreUser, ServiceZone } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import AddressForm, { type AddressFormData } from '@/components/forms/AddressForm';
import { getHaversineDistance } from '@/lib/locationUtils'; // Import distance utility

export default function AddressPage() {
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter(); 
  const pathname = usePathname();
  const { showLoading } = useLoading(); 
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isServiceable, setIsServiceable] = useState<boolean | null>(null); // null: unchecked, true: yes, false: no
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    logUserActivity('checkoutStep', { checkoutStepName: 'address', pageUrl: pathname }, user?.uid, !user ? getGuestId() : null);

    const fetchZones = async () => {
      setIsLoadingZones(true);
      try {
        const zonesQuery = query(collection(db, 'serviceZones'), where('isActive', '==', true));
        const snapshot = await getDocs(zonesQuery);
        const zonesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceZone));
        setServiceZones(zonesData);
      } catch (error) {
        console.error("Error fetching service zones:", error);
        toast({ title: "Error", description: "Could not verify serviceability.", variant: "destructive" });
      } finally {
        setIsLoadingZones(false);
      }
    };
    fetchZones();
  }, [pathname, user, toast]);

  useEffect(() => {
    if (!user) {
      if (!isLoadingAuth) {
        setIsLoadingAddresses(false);
        const guestAddressRaw = localStorage.getItem('wecanfixCustomerAddress');
        if (!guestAddressRaw) setIsFormOpen(true);
      }
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as FirestoreUser;
        setFirestoreUser(userData);
        const userAddresses = userData.addresses || [];
        setSavedAddresses(userAddresses);
        if (userAddresses.length > 0 && !selectedAddressId) {
            const defaultAddress = userAddresses.find(a => a.isDefault);
            setSelectedAddressId(defaultAddress ? defaultAddress.id : userAddresses[0].id);
        } else if (userAddresses.length === 0) {
            setIsFormOpen(true);
        }
      } else {
         setIsFormOpen(true);
      }
      setIsLoadingAddresses(false);
    });
    return () => unsubscribe();
  }, [user, isLoadingAuth, selectedAddressId]);
  
  useEffect(() => {
    if (!user) {
      const savedGuestAddressRaw = localStorage.getItem('wecanfixCustomerAddress');
      if (savedGuestAddressRaw) {
        try {
          const savedGuestAddress: Address = JSON.parse(savedGuestAddressRaw);
          savedGuestAddress.id = 'guest_address'; 
          setSavedAddresses([savedGuestAddress]);
          setSelectedAddressId('guest_address');
        } catch (e) { console.error("Error parsing guest address:", e); }
      }
    }
  }, [user, isMounted]);

  const checkServiceability = useCallback((address: Address) => {
    if (isLoadingZones) return; // Don't check if zones aren't loaded
    if (serviceZones.length === 0) {
      setIsServiceable(true); // If no zones are defined, assume all areas are serviceable.
      return;
    }
    if (!address.latitude || !address.longitude) {
      setIsServiceable(null); // Can't check without coordinates
      return;
    }

    const serviceable = serviceZones.some(zone => {
      const distance = getHaversineDistance(
        address.latitude!,
        address.longitude!,
        zone.center.latitude,
        zone.center.longitude
      );
      return distance <= zone.radiusKm;
    });
    setIsServiceable(serviceable);
  }, [serviceZones, isLoadingZones]);

  useEffect(() => {
    const selectedAddress = savedAddresses.find(a => a.id === selectedAddressId);
    if (selectedAddress) {
      checkServiceability(selectedAddress);
    } else {
      setIsServiceable(null); // Reset if no address is selected
    }
  }, [selectedAddressId, savedAddresses, checkServiceability]);

  const handleAddressSubmit = async (data: AddressFormData) => {
    setIsSubmitting(true);
    const newAddress: Address = { ...data, id: nanoid(), isDefault: savedAddresses.length === 0 };
    
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { addresses: arrayUnion(newAddress) });
        toast({ title: "Success", description: "New address saved." });
        setSelectedAddressId(newAddress.id);
        setIsFormOpen(false);
      } catch (error) { toast({ title: "Error", description: "Could not save address.", variant: "destructive" }); }
    } else {
      localStorage.setItem('wecanfixCustomerAddress', JSON.stringify(newAddress));
      setSavedAddresses([newAddress]);
      setSelectedAddressId(newAddress.id);
      setIsFormOpen(false);
    }
    setIsSubmitting(false);
  };

  const handleProceed = () => {
    const addressToProceed = savedAddresses.find(a => a.id === selectedAddressId);
    if (addressToProceed) {
      if (isServiceable === true) {
        showLoading();
        localStorage.setItem('wecanfixCustomerAddress', JSON.stringify(addressToProceed));
        localStorage.setItem('wecanfixCustomerEmail', addressToProceed.email);
        router.push('/checkout/payment');
      } else {
        toast({ title: "Area Not Serviceable", description: "Sorry, we're not available in your area yet. We're expanding soon!", variant: "destructive", duration: 7000 });
      }
    } else {
      toast({ title: "No Address Selected", description: "Please select or add a delivery address.", variant: "destructive" });
    }
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Cart", href: "/cart" },
    { label: "Schedule", href: "/checkout/schedule" },
    { label: "Your Address" },
  ];

  if (!isMounted || isLoadingAuth || isLoadingAddresses || isLoadingZones) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="address" />
        <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <CheckoutStepper currentStepId="address" />
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl font-headline text-center">Select Delivery Address</CardTitle>
          <CardDescription className="text-center text-sm sm:text-base">Where should we send our professionals?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {savedAddresses.length > 0 && (
            <div className="space-y-3">
              {savedAddresses.map(address => (
                <Card 
                  key={address.id} 
                  className={`p-4 cursor-pointer hover:border-primary transition-all ${selectedAddressId === address.id ? 'border-primary ring-2 ring-primary' : 'border'}`}
                  onClick={() => setSelectedAddressId(address.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{address.fullName}</p>
                      <p className="text-muted-foreground">{address.addressLine1}, {address.addressLine2}</p>
                      <p className="text-muted-foreground">{address.city}, {address.state} - {address.pincode}</p>
                      <p className="text-muted-foreground">Phone: {address.phone}</p>
                    </div>
                    {selectedAddressId === address.id && <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />}
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => setIsFormOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Address
          </Button>

          {isServiceable === false && selectedAddressId && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Area Not Serviceable</AlertTitle>
              <AlertDescription>
                Sorry, the selected address is outside our current service zones. Please select or add a different address.
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push('/checkout/schedule')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Schedule
          </Button>
          <Button onClick={handleProceed} disabled={!selectedAddressId || isServiceable === false} className="w-full sm:w-auto">
            Proceed to Payment <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
      
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 border-b"><DialogTitle>Add New Address</DialogTitle></DialogHeader>
          <div className="flex-grow overflow-y-auto p-6">
            <AddressForm
              initialData={{
                fullName: firestoreUser?.displayName || user?.displayName || "",
                email: firestoreUser?.email || user?.email || "",
                phone: firestoreUser?.mobileNumber || user?.phoneNumber || "",
              }}
              onSubmit={handleAddressSubmit}
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
