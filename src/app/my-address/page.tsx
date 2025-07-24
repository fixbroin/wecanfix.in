
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Loader2, PlusCircle, Edit, Trash2, Home, MapPin, PackageSearch } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import type { Address, FirestoreUser } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import AddressForm, { type AddressFormData } from '@/components/forms/AddressForm';

export default function MyAddressPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Partial<Address> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      if (!isLoadingAuth) setIsLoadingAddresses(false);
      return;
    }
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as FirestoreUser;
        setAddresses(userData.addresses || []);
        setFirestoreUser(userData);
      }
      setIsLoadingAddresses(false);
    }, (error) => {
      console.error("Error fetching addresses:", error);
      toast({ title: "Error", description: "Could not fetch your addresses.", variant: "destructive" });
      setIsLoadingAddresses(false);
    });
    return () => unsubscribe();
  }, [user, isLoadingAuth, toast]);

  const handleOpenForm = (address: Address | null = null) => {
    if (address) {
      setEditingAddress(address);
    } else {
      setEditingAddress({
        fullName: firestoreUser?.displayName || user?.displayName || "",
        email: firestoreUser?.email || user?.email || "",
        phone: firestoreUser?.mobileNumber || user?.phoneNumber || "",
      });
    }
    setIsFormOpen(true);
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!user) return;
    const addressToDelete = addresses.find(a => a.id === addressId);
    if (!addressToDelete) return;

    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { addresses: arrayRemove(addressToDelete) });
      toast({ title: "Success", description: "Address deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete address.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddressSubmit = async (data: AddressFormData) => {
    if (!user) return;
    setIsSubmitting(true);
    
    let updatedAddresses: Address[];
    if (editingAddress?.id) {
      // Update existing address
      updatedAddresses = addresses.map(addr => 
        addr.id === editingAddress.id ? { ...addr, ...data } : addr
      );
    } else {
      // Add new address
      const newAddress: Address = { ...data, id: nanoid(), isDefault: addresses.length === 0 };
      updatedAddresses = [...addresses, newAddress];
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { addresses: updatedAddresses });
      toast({ title: "Success", description: `Address ${editingAddress?.id ? 'updated' : 'saved'}.` });
      setIsFormOpen(false);
      setEditingAddress(null);
    } catch (error) {
      toast({ title: "Error", description: "Could not save address.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Profile", href: "/profile" },
    { label: "My Addresses" },
  ];
  
  if (isLoadingAuth || isLoadingAddresses) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-headline font-semibold">My Addresses</h1>
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Address
          </Button>
        </div>

        {addresses.length === 0 ? (
          <Card className="text-center py-16">
            <CardHeader><PackageSearch className="mx-auto h-16 w-16 text-muted-foreground mb-4" /></CardHeader>
            <CardContent>
              <h3 className="text-xl font-semibold">No Saved Addresses</h3>
              <p className="text-muted-foreground mt-2">Add an address to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {addresses.map(address => (
              <Card key={address.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Home className="h-5 w-5 text-primary" /> {address.fullName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>{address.addressLine1}</p>
                  {address.addressLine2 && <p>{address.addressLine2}</p>}
                  <p>{address.city}, {address.state} - {address.pincode}</p>
                  <p><strong>Email:</strong> {address.email}</p>
                  <p><strong>Phone:</strong> {address.phone}</p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenForm(address)}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescriptionComponent>This will permanently delete this address.</AlertDialogDescriptionComponent></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteAddress(address.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 border-b"><DialogTitle>{editingAddress?.id ? 'Edit Address' : 'Add New Address'}</DialogTitle></DialogHeader>
          <div className="flex-grow overflow-y-auto p-6">
            <AddressForm
              initialData={editingAddress}
              onSubmit={handleAddressSubmit}
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
