
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm, Controller } from "react-hook-form"; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Mail, User, ShieldAlert, Edit3, KeyRound, Loader2, Phone, Camera, Save, MapPin, Briefcase, Star as StarIcon, CheckBadgeIcon, Trash2 } from "lucide-react"; // Added Trash2
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { updateProfile as updateAuthProfile, sendPasswordResetEmail } from "firebase/auth";
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useToast } from '@/hooks/use-toast';
import type { ProviderApplication } from '@/types/firestore';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import NextImage from 'next/image'; 

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";
const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const providerProfileEditSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters.").max(100),
  mobileNumber: z.string().min(10, "Valid mobile number required.").max(15).regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format."),
  address: z.string().min(5, "Address is required.").max(250),
  alternateMobile: z.string().max(15).regex(/^\+?[1-9]\d{1,14}$/, "Invalid alternate phone format.").optional().or(z.literal('')),
});
type ProviderProfileEditFormData = z.infer<typeof providerProfileEditSchema>;

export default function ProviderProfilePage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [providerData, setProviderData] = useState<ProviderApplication | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isRequestingKycUpdate, setIsRequestingKycUpdate] = useState(false);

  const editForm = useForm<ProviderProfileEditFormData>({
    resolver: zodResolver(providerProfileEditSchema),
  });

  const fetchProviderData = useCallback(async () => {
    if (!user) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, user.uid);
      const docSnap = await getDoc(appDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as ProviderApplication;
        setProviderData(data);
        editForm.reset({
          fullName: data.fullName || "",
          mobileNumber: data.mobileNumber || "",
          address: data.address || "",
          alternateMobile: data.alternateMobile || "",
        });
        setPhotoPreview(data.profilePhotoUrl || null);
      } else {
        toast({ title: "Error", description: "Provider application data not found.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load provider data.", variant: "destructive" });
      console.error("Error fetching provider data:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, [user, toast, editForm]);

  useEffect(() => {
    fetchProviderData();
  }, [fetchProviderData]);
  
  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({ title: "File Too Large", description: "Image must be less than 2MB.", variant: "destructive" });
        if (photoFileInputRef.current) photoFileInputRef.current.value = ""; 
        setProfilePhotoFile(null); 
        setPhotoPreview(providerData?.profilePhotoUrl || null); 
        return;
      }
      setProfilePhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleRemovePhoto = () => {
    if (profilePhotoFile && photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setProfilePhotoFile(null); setPhotoPreview(null);
    if (photoFileInputRef.current) photoFileInputRef.current.value = "";
  };

  const handleSaveChanges = async (data: ProviderProfileEditFormData) => {
    if (!user || !providerData) return;
    setIsSubmittingEdit(true);
    setUploadProgress(null);

    let newPhotoURL = providerData.profilePhotoUrl || null;

    if (profilePhotoFile) {
      setUploadProgress(0);
      try {
        if (providerData.profilePhotoUrl && isFirebaseStorageUrl(providerData.profilePhotoUrl)) {
          try { await deleteObject(storageRefStandard(storage, providerData.profilePhotoUrl)); } 
          catch (e) { console.warn("Old profile photo not deleted during update:", e); }
        }
        const extension = profilePhotoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const randomString = generateRandomHexString(8);
        const fileName = `profile_${user.uid}_${randomString}.${extension}`;
        const imagePath = `provider_profiles/${user.uid}/${fileName}`;
        const imageRef = storageRefStandard(storage, imagePath);
        const uploadTask = uploadBytesResumable(imageRef, profilePhotoFile);

        newPhotoURL = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(error),
            async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); } }
          );
        });
      } catch (uploadError) {
        toast({ title: "Photo Upload Failed", description: (uploadError as Error).message, variant: "destructive" });
        setIsSubmittingEdit(false); setUploadProgress(null); return;
      }
    } else if (photoPreview === null && providerData.profilePhotoUrl && isFirebaseStorageUrl(providerData.profilePhotoUrl)) {
        try { await deleteObject(storageRefStandard(storage, providerData.profilePhotoUrl)); newPhotoURL = null;}
        catch(e) {console.warn("Failed to delete stored profile photo:", e); }
    }


    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, user.uid);
      const updatePayload: Partial<ProviderApplication> = {
        fullName: data.fullName,
        mobileNumber: data.mobileNumber,
        address: data.address,
        alternateMobile: data.alternateMobile || null,
        profilePhotoUrl: newPhotoURL,
        updatedAt: Timestamp.now(),
      };
      await updateDoc(appDocRef, updatePayload);
      
      if (auth.currentUser && (auth.currentUser.displayName !== data.fullName || auth.currentUser.photoURL !== newPhotoURL)) {
        await updateAuthProfile(auth.currentUser, { displayName: data.fullName, photoURL: newPhotoURL });
      }

      toast({ title: "Success", description: "Profile updated." });
      setIsEditModalOpen(false);
      fetchProviderData(); 
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update profile.", variant: "destructive" });
    } finally {
      setIsSubmittingEdit(false);
      setUploadProgress(null);
    }
  };

  const handleChangePassword = async () => {
    if (user && user.email) {
      setIsSendingResetEmail(true);
      try {
        await sendPasswordResetEmail(auth, user.email);
        toast({ title: "Password Reset Email Sent", description: "Check your inbox for a password reset link." });
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } finally {
        setIsSendingResetEmail(false);
      }
    }
  };

  const handleRequestKycUpdate = async () => {
    if (!user) return;
    setIsRequestingKycUpdate(true);
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, user.uid);
      await updateDoc(appDocRef, { kycUpdateRequest: true, kycUpdateNotes: "User requested KYC update.", updatedAt: Timestamp.now() });
      toast({ title: "Request Sent", description: "Admin has been notified of your KYC update request." });
      if (providerData) setProviderData(prev => prev ? ({...prev, kycUpdateRequest: true }) : null);
    } catch (error) {
      toast({ title: "Error", description: "Could not send KYC update request.", variant: "destructive" });
    } finally {
      setIsRequestingKycUpdate(false);
    }
  };
  
  const getKycStatusBadge = (docData?: {verified?: boolean} | null) => {
    if (docData?.verified) return <Badge variant="default" className="bg-green-500 text-white">Verified</Badge>;
    return <Badge variant="secondary">Pending/Not Provided</Badge>;
  };

  if (authIsLoading || isLoadingData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!providerData) {
    return <div className="text-center p-8">Provider data could not be loaded. Please complete your <Link href="/provider-registration" className="text-primary underline">registration</Link>.</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <Avatar className="w-28 h-28 mx-auto mb-4 border-2 border-primary shadow-md">
            <AvatarImage src={providerData.profilePhotoUrl || undefined} alt={providerData.fullName || "P"} />
            <AvatarFallback className="text-4xl">{providerData.fullName ? providerData.fullName[0].toUpperCase() : "P"}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl font-headline">{providerData.fullName}</CardTitle>
          <CardDescription className="text-md">{providerData.email}</CardDescription>
           <Badge variant="outline" className="mx-auto mt-1 capitalize">{providerData.status?.replace(/_/g, ' ') || 'Status Unknown'}</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><strong className="text-muted-foreground">Mobile:</strong> {providerData.mobileNumber}</div>
            <div><strong className="text-muted-foreground">Alt. Mobile:</strong> {providerData.alternateMobile || "N/A"}</div>
            <div className="md:col-span-2"><strong className="text-muted-foreground">Address:</strong> {providerData.address}</div>
            <div><strong className="text-muted-foreground">Age:</strong> {providerData.age || "N/A"}</div>
            <div><strong className="text-muted-foreground">Qualification:</strong> {providerData.qualificationLabel || "N/A"}</div>
            <div><strong className="text-muted-foreground">Work Category:</strong> {providerData.workCategoryName || "N/A"}</div>
            <div><strong className="text-muted-foreground">Experience:</strong> {providerData.experienceLevelLabel || "N/A"}</div>
            <div><strong className="text-muted-foreground">Skill Level:</strong> {providerData.skillLevelLabel || "N/A"}</div>
            <div className="md:col-span-2"><strong className="text-muted-foreground">Languages:</strong> {providerData.languagesSpokenLabels?.join(', ') || "N/A"}</div>
            <div className="md:col-span-2"><strong className="text-muted-foreground">Work PIN Codes:</strong> {providerData.workPinCodes?.join(', ') || "N/A"}</div>
          </div>
          <Button onClick={() => setIsEditModalOpen(true)} variant="outline" className="w-full"><Edit3 className="mr-2 h-4 w-4" /> Edit Basic Profile</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>KYC & Bank Details</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1">
            <h4 className="font-semibold">Aadhaar: {getKycStatusBadge(providerData.aadhaar)}</h4>
            <p className="text-xs text-muted-foreground">Number: {providerData.aadhaar?.docNumber || "N/A"}</p>
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold">PAN Card: {getKycStatusBadge(providerData.pan)}</h4>
            <p className="text-xs text-muted-foreground">Number: {providerData.pan?.docNumber || "N/A"}</p>
          </div>
          {providerData.optionalDocuments && providerData.optionalDocuments.length > 0 && (
            providerData.optionalDocuments.map((doc, idx) => (
              <div key={idx} className="space-y-1 border-t pt-2 mt-2">
                <h4 className="font-semibold">{doc.docType || `Optional Doc ${idx+1}`}: {getKycStatusBadge(doc)}</h4>
                <p className="text-xs text-muted-foreground">Number: {doc.docNumber || "N/A"}</p>
              </div>
            ))
          )}
          <div className="space-y-1 border-t pt-3 mt-3">
            <h4 className="font-semibold">Bank Details: {getKycStatusBadge(providerData.bankDetails)}</h4>
            <p className="text-xs text-muted-foreground">Account Holder: {providerData.bankDetails?.accountHolderName || "N/A"}</p>
            <p className="text-xs text-muted-foreground">Account No: {providerData.bankDetails?.accountNumber || "N/A"}</p>
            <p className="text-xs text-muted-foreground">IFSC: {providerData.bankDetails?.ifscCode || "N/A"}</p>
          </div>
           <Button onClick={handleRequestKycUpdate} variant="outline" size="sm" disabled={isRequestingKycUpdate || providerData.kycUpdateRequest}>
              {isRequestingKycUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {providerData.kycUpdateRequest ? "Update Requested" : "Request KYC/Bank Details Update"}
            </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Account Security</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={handleChangePassword} variant="outline" disabled={isSendingResetEmail}>
            {isSendingResetEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4"/>} Change Password
          </Button>
        </CardContent>
      </Card>
      
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Profile Information</DialogTitle><DialogDescription>Update your name, contact, and address.</DialogDescription></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleSaveChanges)} className="space-y-4 pt-2">
              <FormField control={editForm.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={editForm.control} name="mobileNumber" render={({ field }) => (<FormItem><FormLabel>Mobile Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={editForm.control} name="alternateMobile" render={({ field }) => (<FormItem><FormLabel>Alternate Mobile (Optional)</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={editForm.control} name="address" render={({ field }) => (<FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} rows={3}/></FormControl><FormMessage /></FormItem>)}/>
              <FormItem>
                <FormLabel className="flex items-center"><Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Profile Photo (Optional)</FormLabel>
                {photoPreview && (<div className="my-2 relative w-24 h-24 rounded-full overflow-hidden border mx-auto"><NextImage src={photoPreview} alt="Photo preview" fill className="object-cover" unoptimized={photoPreview.startsWith('blob:')} sizes="96px"/></div>)}
                <FormControl><Input type="file" accept="image/*" onChange={handlePhotoFileChange} ref={photoFileInputRef} className="file:mr-2 file:py-1.5 file:px-3 file:text-xs" /></FormControl>
                {uploadProgress !== null && <Progress value={uploadProgress} className="h-1.5 mt-1" />}
                {(photoPreview || profilePhotoFile) && <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto} className="text-xs mt-1"><Trash2 className="h-3 w-3 mr-1"/>Remove</Button>}
              </FormItem>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingEdit}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmittingEdit}>{isSubmittingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

