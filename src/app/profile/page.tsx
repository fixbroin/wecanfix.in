
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Mail, User, Shield, Edit3, KeyRound, Trash2, Loader2, Phone, ShieldCheck, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { updateProfile, sendPasswordResetEmail, deleteUser, updateEmail, sendEmailVerification } from "firebase/auth";
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { FirestoreUser } from '@/types/firestore';

const updateNameSchema = z.object({
  displayName: z.string().min(2, { message: "Name must be at least 2 characters." }),
});
type UpdateNameFormValues = z.infer<typeof updateNameSchema>;

const updateMobileSchema = z.object({
  mobileNumber: z.string()
    .min(10, { message: "Mobile number must be 10-15 digits." })
    .max(15, { message: "Mobile number cannot exceed 15 digits." })
    .regex(/^\+?[1-9]\d{1,14}$/, { message: "Invalid phone number format (e.g., +919876543210)." }),
});
type UpdateMobileFormValues = z.infer<typeof updateMobileSchema>;

const updateEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});
type UpdateEmailFormValues = z.infer<typeof updateEmailSchema>;


export default function ProfilePage() {
  const { user, logOut } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [isSubmittingName, setIsSubmittingName] = useState(false);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [isSubmittingMobile, setIsSubmittingMobile] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const nameForm = useForm<UpdateNameFormValues>({ resolver: zodResolver(updateNameSchema) });
  const mobileForm = useForm<UpdateMobileFormValues>({ resolver: zodResolver(updateMobileSchema) });
  const emailForm = useForm<UpdateEmailFormValues>({ resolver: zodResolver(updateEmailSchema) });

  const fetchUserData = useCallback(async () => {
    if (user) {
      setIsLoadingData(true);
      try {
        const userDocRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as FirestoreUser;
          setFirestoreUser(data);
          // Set form defaults from the most reliable sources
          nameForm.reset({ displayName: user.displayName || data.displayName || "" });
          mobileForm.reset({ mobileNumber: data.mobileNumber || user.phoneNumber || "" });
          emailForm.reset({ email: user.email || data.email || "" });
        } else {
          // Fallback if firestore doc is missing
          nameForm.reset({ displayName: user.displayName || "" });
          mobileForm.reset({ mobileNumber: user.phoneNumber || "" });
          emailForm.reset({ email: user.email || "" });
        }
      } catch (error) {
        toast({ title: "Error", description: "Could not load profile data.", variant: "destructive" });
      } finally {
        setIsLoadingData(false);
      }
    }
  }, [user, toast, nameForm, mobileForm, emailForm]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleUpdateName = async (values: UpdateNameFormValues) => {
    if (!user || !auth.currentUser) return;
    setIsSubmittingName(true);
    try {
      await updateProfile(auth.currentUser, { displayName: values.displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName: values.displayName });
      toast({ title: "Success", description: "Your name has been updated." });
      setIsNameDialogOpen(false);
      await fetchUserData(); // Re-fetch to update all local state
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not update name.", variant: "destructive" });
    } finally {
      setIsSubmittingName(false);
    }
  };
  
  const handleUpdateEmail = async (values: UpdateEmailFormValues) => {
    if (!user || !auth.currentUser) return;
    setIsSubmittingEmail(true);
    try {
      await updateEmail(auth.currentUser, values.email); // This also sends a verification email by default
      await updateDoc(doc(db, "users", user.uid), { email: values.email });
      toast({ title: "Email Updated", description: "A verification link has been sent to your new email address." });
      setIsEmailDialogOpen(false);
      await fetchUserData(); // Re-fetch
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
         toast({ title: "Action Requires Recent Login", description: "Please log out and log back in to update your email.", variant: "destructive" });
      } else {
         toast({ title: "Error", description: error.message || "Could not update email.", variant: "destructive" });
      }
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleUpdateMobileNumber = async (values: UpdateMobileFormValues) => {
    if (!user) return;
    setIsSubmittingMobile(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { mobileNumber: values.mobileNumber });
      toast({ title: "Success", description: "Your mobile number has been updated." });
      setIsMobileDialogOpen(false);
      await fetchUserData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not update mobile number.", variant: "destructive" });
    } finally {
      setIsSubmittingMobile(false);
    }
  };

  const handleChangePassword = async () => {
    const emailToUse = user?.email || firestoreUser?.email;
    if (!emailToUse) {
      toast({ title: "Email Required", description: "You must have an email address set to change your password.", variant: "destructive" });
      return;
    }
    setIsSendingResetEmail(true);
    try {
      await sendPasswordResetEmail(auth, emailToUse);
      toast({ title: "Password Reset Email Sent", description: "Check your inbox for a password reset link." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!user || !auth.currentUser || !user.email) return;
    setIsSendingVerification(true);
    try {
        const actionCodeSettings = {
            url: `${window.location.origin}/profile`, // Redirect back to profile page after verification
            handleCodeInApp: true,
        };
        await sendEmailVerification(auth.currentUser, actionCodeSettings);
        toast({title: "Verification Email Sent", description: "Please check your inbox."});
    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
        setIsSendingVerification(false);
    }
  };


  const handleDeleteAccount = async () => {
    if (!user || !auth.currentUser) return;
    setIsDeletingAccount(true);
    try {
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(auth.currentUser);
      toast({ title: "Account Deleted", description: "Your account has been successfully deleted." });
      router.push('/');
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        toast({ title: "Action Requires Recent Login", description: "Please log out and log back in to delete your account.", variant: "destructive", duration: 7000 });
        await logOut();
      } else {
        toast({ title: "Error Deleting Account", description: error.message, variant: "destructive" });
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoadingData || !user) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const displayEmail = user.email || firestoreUser?.email;
  const isEmailVerified = user.emailVerified;
  const isPhoneVerified = user?.providerData[0]?.providerId === 'phone';

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <Avatar className="w-24 h-24 mx-auto mb-4 border-2 border-primary">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
              <AvatarFallback className="text-3xl">{user.displayName ? user.displayName[0].toUpperCase() : "U"}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-3xl font-headline">{user.displayName || "Your Profile"}</CardTitle>
            <CardDescription className="text-md text-muted-foreground">Manage your personal information and account settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center"><User className="mr-2 h-5 w-5 text-primary" /> Full Name</h3>
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-md">
                <p className="text-muted-foreground">{user.displayName || "Not set"}</p>
                <Button variant="ghost" size="sm" onClick={() => { nameForm.reset({ displayName: user.displayName || "" }); setIsNameDialogOpen(true); }}><Edit3 className="mr-1 h-4 w-4" /> Edit</Button>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center"><Mail className="mr-2 h-5 w-5 text-primary" /> Email Address</h3>
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-md">
                <p className="text-muted-foreground">{displayEmail || "Not set"}</p>
                {isEmailVerified ? (
                  <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <ShieldCheck className="h-4 w-4" /> Verified
                  </div>
                ) : (
                  displayEmail && <Button variant="ghost" size="sm" onClick={() => { emailForm.reset({ email: displayEmail || "" }); setIsEmailDialogOpen(true); }}><Edit3 className="mr-1 h-4 w-4" /> Edit</Button>
                )}
              </div>
              {displayEmail && !isEmailVerified && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600 flex items-center"><ShieldAlert className="mr-1 h-3 w-3"/>Email not verified.</span>
                  <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={handleSendVerificationEmail} disabled={isSendingVerification}>
                    {isSendingVerification ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : null} Send Verification Email
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center"><Phone className="mr-2 h-5 w-5 text-primary" /> Mobile Number</h3>
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-md">
                <p className="text-muted-foreground">{firestoreUser?.mobileNumber || user.phoneNumber || "Not set"}</p>
                {!isPhoneVerified ? (
                  <Button variant="ghost" size="sm" onClick={() => { mobileForm.reset({ mobileNumber: firestoreUser?.mobileNumber || user.phoneNumber || "" }); setIsMobileDialogOpen(true); }}><Edit3 className="mr-1 h-4 w-4" /> Edit</Button>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <ShieldCheck className="h-4 w-4" /> Verified
                  </div>
                )}
              </div>
            </div>

             <div className="space-y-4 border-t pt-6">
              <h3 className="text-xl font-semibold">Account Actions</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" onClick={handleChangePassword} disabled={isSendingResetEmail}>
                  {isSendingResetEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Change Password
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="destructive" className="sm:ml-auto" disabled={isDeletingAccount}>{isDeletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Delete Account</Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescriptionComponent>This will permanently delete your account and remove your data from our servers.</AlertDialogDescriptionComponent></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeletingAccount}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteAccount} disabled={isDeletingAccount} className="bg-destructive hover:bg-destructive/90">{isDeletingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yes, delete account</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Update Your Name</DialogTitle><DialogDescription>Enter your new display name.</DialogDescription></DialogHeader>
          <Form {...nameForm}><form onSubmit={nameForm.handleSubmit(handleUpdateName)} className="space-y-4 py-2">
            <FormField control={nameForm.control} name="displayName" render={({ field }) => (<FormItem><FormLabel htmlFor="displayName">Full Name</FormLabel><FormControl><Input id="displayName" {...field} disabled={isSubmittingName} /></FormControl><FormMessage /></FormItem>)}/>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingName}>Cancel</Button></DialogClose><Button type="submit" disabled={isSubmittingName}>{isSubmittingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></DialogFooter>
          </form></Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Update Email</DialogTitle><DialogDescription>Enter your new email address. You will need to verify it.</DialogDescription></DialogHeader>
          <Form {...emailForm}><form onSubmit={emailForm.handleSubmit(handleUpdateEmail)} className="space-y-4 py-2">
            <FormField control={emailForm.control} name="email" render={({ field }) => (<FormItem><FormLabel htmlFor="email">Email</FormLabel><FormControl><Input type="email" id="email" {...field} disabled={isSubmittingEmail} /></FormControl><FormMessage /></FormItem>)}/>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingEmail}>Cancel</Button></DialogClose><Button type="submit" disabled={isSubmittingEmail}>{isSubmittingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Email</Button></DialogFooter>
          </form></Form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isMobileDialogOpen} onOpenChange={setIsMobileDialogOpen}>
        <DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Update Mobile Number</DialogTitle><DialogDescription>Enter your new mobile number.</DialogDescription></DialogHeader>
          <Form {...mobileForm}><form onSubmit={mobileForm.handleSubmit(handleUpdateMobileNumber)} className="space-y-4 py-2">
            <FormField control={mobileForm.control} name="mobileNumber" render={({ field }) => (<FormItem><FormLabel htmlFor="mobileNumber">Mobile Number</FormLabel><FormControl><Input type="tel" id="mobileNumber" {...field} disabled={isSubmittingMobile} /></FormControl><FormMessage /></FormItem>)}/>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingMobile}>Cancel</Button></DialogClose><Button type="submit" disabled={isSubmittingMobile}>{isSubmittingMobile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></DialogFooter>
          </form></Form>
        </DialogContent>
      </Dialog>

    </ProtectedRoute>
  );
}

    