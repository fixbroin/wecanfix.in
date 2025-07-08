
"use client";

import type { PropsWithChildren } from 'react';
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  type User,
  type AuthError,
  type UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  type ConfirmationResult,
  updateEmail, 
  sendEmailVerification, 
  verifyBeforeUpdateEmail, // Added import
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, Timestamp, getDoc, onSnapshot } from "firebase/firestore"; // Added onSnapshot
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { FirestoreUser } from '@/types/firestore';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId, clearGuestId } from '@/lib/guestIdManager';

// Define and export ADMIN_EMAIL here
export const ADMIN_EMAIL = "wecanfix.in@gmail.com";

export interface SignUpData {
  fullName: string;
  email: string;
  mobileNumber: string;
  password?: string;
}

export interface LogInData {
  email: string;
  password?: string;
}

interface AuthContextType {
  user: User | null;
  firestoreUser: FirestoreUser | null;
  isLoading: boolean;
  authActionRedirectPath: string | null;
  triggerAuthRedirect: (intendedPath: string) => void;
  signUp: (data: SignUpData) => Promise<void>;
  logIn: (data: LogInData) => Promise<void>;
  logOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  handleSuccessfulAuth: (userCredential: UserCredential) => Promise<void>;
  // New properties for profile completion flow
  isCompletingProfile: boolean;
  userCredentialForProfileCompletion: UserCredential | null;
  completeProfileSetup: (details: { fullName: string; email?: string; mobileNumber?: string }) => Promise<void>;
  cancelProfileCompletion: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>; // Expose setUser
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authActionRedirectPath, setAuthActionRedirectPath] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // State for the new user profile completion flow
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [userCredentialForProfileCompletion, setUserCredentialForProfileCompletion] = useState<UserCredential | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Only set user if they are not in the middle of profile completion
      if (!isCompletingProfile) {
        setUser(currentUser);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [isCompletingProfile]);

  // NEW: Effect to listen to Firestore document for the logged-in user
  useEffect(() => {
    if (user?.uid) {
        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setFirestoreUser({ id: docSnap.id, ...docSnap.data() } as FirestoreUser);
            } else {
                // This case can happen if the Firestore doc is deleted but Auth user still exists.
                setFirestoreUser(null);
            }
        }, (error) => {
            console.error("AuthContext: Error fetching Firestore user data:", error);
            setFirestoreUser(null);
        });
        return () => unsubscribe(); // Cleanup listener when user changes or unmounts
    } else {
        // if no user, clear firestore user data
        setFirestoreUser(null);
    }
  }, [user]); // This effect runs whenever the auth user object changes.


  const internalTriggerAuthRedirect = useCallback((intendedPath: string) => {
    setAuthActionRedirectPath(intendedPath);
    router.push(`/auth/login?redirect=${encodeURIComponent(intendedPath)}`);
  }, [router, setAuthActionRedirectPath]);

  const handleSuccessfulAuth = useCallback(async (userCredential: UserCredential) => {
    setIsLoading(true);
    const guestIdBeforeAuth = getGuestId();
    const { user } = userCredential;

    try {
      const userDocRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        // NEW USER FLOW
        setUserCredentialForProfileCompletion(userCredential);
        setIsCompletingProfile(true);
        setIsLoading(false); // Stop main loading screen, dialog will show
        return; // Stop the login process here until profile is complete
      }

      // EXISTING USER FLOW
      await setDoc(userDocRef, { lastLoginAt: Timestamp.now() }, { merge: true });
      logUserActivity('userLogin', {
        email: user.email,
        loginMethod: user.providerData[0]?.providerId || 'password',
        sourceGuestId: guestIdBeforeAuth
      }, user.uid, null);
      
      clearGuestId();
      toast({ title: "Success", description: "Logged in successfully!" });
      
      setUser(user); // Set the final user state for existing users

      const redirectPathFromQuery = searchParams.get('redirect');
      let finalRedirectPath = '/';
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin';
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      } else if (authActionRedirectPath && !authActionRedirectPath.startsWith('/auth/')) {
        finalRedirectPath = authActionRedirectPath;
      }
      router.push(finalRedirectPath);
      if (authActionRedirectPath) setAuthActionRedirectPath(null);

    } catch (error) {
      const authError = error as AuthError;
      console.error("Post-authentication error:", authError);
      toast({ title: "Authentication Error", description: authError.message || "An error occurred after signing in.", variant: "destructive" });
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, searchParams, authActionRedirectPath, setAuthActionRedirectPath]);

  const cancelProfileCompletion = useCallback(async () => {
    setIsCompletingProfile(false);
    setUserCredentialForProfileCompletion(null);
    await signOut(auth); // Log out the partial user session
    setUser(null); // Ensure user state is cleared
  }, []);

  const completeProfileSetup = useCallback(async (details: { fullName: string; email?: string; mobileNumber?: string }) => {
    if (!userCredentialForProfileCompletion) return;
    setIsLoading(true);
    const { user } = userCredentialForProfileCompletion;

    try {
      // Update Firebase Auth profile displayName
      await updateProfile(user, { displayName: details.fullName });
      
      // If a user signed in via phone and is now providing an email,
      // send a verification link to that new email. This is the secure way to add an email.
      if (details.email && user.providerData[0]?.providerId === 'phone') {
        const actionCodeSettings = {
          url: `${window.location.origin}/`, // URL to redirect to after verification
          handleCodeInApp: true,
        };
        await verifyBeforeUpdateEmail(user, details.email, actionCodeSettings);
        toast({
          title: "Verification Email Sent",
          description: `A verification link has been sent to ${details.email}. Please check your inbox to link it to your account.`,
          duration: 8000,
        });
      }

      // Now create the Firestore document with all data
      const newUserFirestoreData: Partial<Omit<FirestoreUser, 'id' | 'lastLoginAt' | 'roles'>> = {
        uid: user.uid,
        email: details.email, // Save the provided email to Firestore
        displayName: details.fullName,
        mobileNumber: user.phoneNumber || details.mobileNumber,
        photoURL: user.photoURL,
        isActive: true,
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
      };

      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, newUserFirestoreData, { merge: true });

      const guestIdBeforeAuth = getGuestId();
      logUserActivity('newUser', {
        email: newUserFirestoreData.email,
        fullName: newUserFirestoreData.displayName,
        mobileNumber: newUserFirestoreData.mobileNumber,
        loginMethod: user.providerData[0]?.providerId || 'unknown',
        sourceGuestId: guestIdBeforeAuth
      }, user.uid, null);
      clearGuestId();

      // Now finalize login
      setUser(user);
      setIsCompletingProfile(false);
      setUserCredentialForProfileCompletion(null);
      
      toast({ title: "Account Created!", description: "Welcome to Wecanfix" });

      const redirectPathFromQuery = searchParams.get('redirect');
      let finalRedirectPath = '/';
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin';
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      } else if (authActionRedirectPath && !authActionRedirectPath.startsWith('/auth/')) {
        finalRedirectPath = authActionRedirectPath;
      }
      router.push(finalRedirectPath);
      if (authActionRedirectPath) setAuthActionRedirectPath(null);

    } catch (error) {
      const authError = error as AuthError;
      console.error("Error completing profile setup:", authError);
      toast({ title: "Error", description: authError.message || "Could not save profile details.", variant: "destructive" });
      throw authError; // Re-throw so the dialog can handle its state
    } finally {
      setIsLoading(false);
    }
  }, [userCredentialForProfileCompletion, toast, router, searchParams, authActionRedirectPath]);


  const signUp = useCallback(async (data: SignUpData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      // Create user document with all details from the form
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const newUserFirestoreData: Partial<Omit<FirestoreUser, 'id' | 'roles'>> = {
        uid: userCredential.user.uid,
        email: data.email,
        displayName: data.fullName,
        mobileNumber: data.mobileNumber,
        photoURL: userCredential.user.photoURL,
        isActive: true,
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
      };
      await setDoc(userDocRef, newUserFirestoreData, { merge: true });
      await updateProfile(userCredential.user, { displayName: data.fullName });

      // Directly log in as the user document exists now.
      await handleSuccessfulAuth(userCredential);

    } catch (error) {
      const authError = error as AuthError;
      console.error("Signup error:", authError);
      toast({ title: "Signup Failed", description: authError.message, variant: "destructive" });
      setIsLoading(false);
      throw authError;
    }
  }, [toast, handleSuccessfulAuth]);

  const logIn = useCallback(async (data: LogInData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await handleSuccessfulAuth(userCredential);
    } catch (error) {
      const authError = error as AuthError;
      console.error("Login error:", authError);
      toast({ title: "Login Failed", description: authError.message, variant: "destructive" });
      setIsLoading(false);
      throw authError;
    }
  }, [toast, handleSuccessfulAuth]);
  
  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleSuccessfulAuth(result);
    } catch (error) {
      const authError = error as AuthError;
      // Don't show a toast if the user just closed the popup
      if (authError.code !== 'auth/popup-closed-by-user') {
        console.error("Google Sign-in error:", authError);
        toast({ title: "Google Sign-in Failed", description: authError.message || "Could not sign in with Google.", variant: "destructive" });
      }
      setIsLoading(false); // Ensure loading is stopped
      // Only re-throw if it's not a user-cancelled action
      if (authError.code !== 'auth/popup-closed-by-user') {
        throw authError;
      }
    }
  }, [toast, handleSuccessfulAuth]);


  const logOut = useCallback(async () => {
    setIsLoading(true);
    const userIdForLog = user?.uid;
    const userEmailForLog = user?.email;
    try {
      if (userIdForLog) {
        logUserActivity('userLogout', { logoutMethod: 'manual', email: userEmailForLog }, userIdForLog, null);
      }
      await signOut(auth);
      setUser(null);
      setAuthActionRedirectPath(null);
      toast({ title: "Logged Out", description: "You have been logged out." });
      router.push('/auth/login');
    } catch (error) {
      const authError = error as AuthError;
      console.error("Logout error:", authError);
      toast({ title: "Logout Failed", description: authError.message || "Could not log out.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, user]);

  const contextValue: AuthContextType = useMemo(() => {
    return {
      user,
      firestoreUser,
      isLoading,
      authActionRedirectPath,
      triggerAuthRedirect: internalTriggerAuthRedirect,
      signUp,
      logIn,
      logOut,
      signInWithGoogle,
      handleSuccessfulAuth,
      isCompletingProfile,
      userCredentialForProfileCompletion,
      completeProfileSetup,
      cancelProfileCompletion,
      setUser,
    };
  }, [user, firestoreUser, isLoading, authActionRedirectPath, internalTriggerAuthRedirect, signUp, logIn, logOut, signInWithGoogle, handleSuccessfulAuth, isCompletingProfile, userCredentialForProfileCompletion, completeProfileSetup, cancelProfileCompletion, setUser]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default AuthContext;
