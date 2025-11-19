

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
import { doc, setDoc, Timestamp, getDoc, onSnapshot, collection, query, where, getDocs, limit, runTransaction, writeBatch, or } from "firebase/firestore"; // Added onSnapshot, collection, query, where, getDocs, limit, runTransaction, writeBatch, or
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { FirestoreUser, MarketingAutomationSettings, ReferralSettings, Referral, FirestoreNotification } from '@/types/firestore';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId, clearGuestId } from '@/lib/guestIdManager';
import { sendWelcomeEmail, type WelcomeEmailInput } from '@/ai/flows/sendWelcomeEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { nanoid } from 'nanoid'; // Import nanoid for generating referral codes
import { syncCartOnLogin } from '@/lib/cartManager'; // Import cart sync function


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

// Helper to generate a unique referral code
const generateReferralCode = (length: number) => {
  return nanoid(length).toUpperCase();
};

// Helper to generate a simple device ID
const getSimpleDeviceId = (): string => {
    if (typeof window === 'undefined') return 'server';
    const { userAgent, hardwareConcurrency, language } = window.navigator;
    const { width, height, colorDepth, pixelDepth } = window.screen;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let webglVendor = 'unknown';
    if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            webglVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
    }
    const dataString = `${userAgent}|${width}x${height}|${colorDepth}|${pixelDepth}|${hardwareConcurrency}|${language}|${webglVendor}`;
    // Simple hash function (not cryptographically secure, but good enough for a unique ID)
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
};


export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authActionRedirectPath, setAuthActionRedirectPath] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

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
        email: user.email || undefined,
        loginMethod: user.providerData[0]?.providerId || 'password',
        sourceGuestId: guestIdBeforeAuth
      }, user.uid, null);
      
      clearGuestId();

      // Sync cart on login
      await syncCartOnLogin(user.uid);

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
      // 1. Update Firebase Auth profile (display name, etc.)
      await updateProfile(user, { displayName: details.fullName });
  
      if (details.email && user.providerData[0]?.providerId === 'phone') {
        const actionCodeSettings = { url: `${window.location.origin}/`, handleCodeInApp: true };
        await verifyBeforeUpdateEmail(user, details.email, actionCodeSettings);
        toast({
          title: "Verification Email Sent",
          description: `A verification link has been sent to ${details.email}. Please check your inbox to link it to your account.`,
          duration: 8000,
        });
      }
  
      // 2. Perform Firestore operations within a transaction
      await runTransaction(db, async (transaction) => {
        const referralCodeParam = localStorage.getItem("referralCode");
        const referralSettingsDocRef = doc(db, "appConfiguration", "referral");
        const referralSettingsSnap = await transaction.get(referralSettingsDocRef);
        const referralSettings = referralSettingsSnap.exists() ? referralSettingsSnap.data() as ReferralSettings : null;
        let initialWalletBalance = 0;
        let referrerId: string | null = null;
        let deviceId: string | null = null;
        let ipAddress: string | null = null;
        
        const newUsersEmail = details.email || user.email;

        // Get IP and Device ID
        try {
            const geoResponse = await fetch('https://ipapi.co/json/');
            if (geoResponse.ok) {
                const ipData = await geoResponse.json();
                ipAddress = ipData.ip || null;
            }
        } catch (e) { console.warn("Could not fetch IP address during signup."); }
        if (typeof window !== 'undefined') deviceId = getSimpleDeviceId();

        const newUserDocRef = doc(db, "users", user.uid);
  
        if (referralCodeParam && referralSettings?.isReferralSystemEnabled) {
          console.log(`Processing stored referral code: ${referralCodeParam}`);
          
          const orConditions = [];
          if (newUsersEmail) orConditions.push(where("referredUserEmail", "==", newUsersEmail));
          if (ipAddress) orConditions.push(where("ipAddress", "==", ipAddress));
          if (deviceId) orConditions.push(where("deviceId", "==", deviceId));

          let existingReferralSnap = { empty: true }; // Default to empty if no conditions are met
          if (orConditions.length > 0) {
            const existingReferralQuery = query(collection(db, "referrals"), or(...orConditions), limit(1));
            existingReferralSnap = await getDocs(existingReferralQuery);
          }
          
          if (existingReferralSnap.empty) {
            console.log(`No prior referral usage found for this user/device/ip. Proceeding.`);
            const referrerQuery = query(collection(db, "users"), where("referralCode", "==", referralCodeParam), limit(1));
            const referrerSnapshot = await getDocs(referrerQuery);
    
            if (!referrerSnapshot.empty) {
              const referrerDoc = referrerSnapshot.docs[0];
              referrerId = referrerDoc.id;
              const referredBonus = referralSettings.referredUserBonus || 0;
              if (referredBonus > 0) {
                initialWalletBalance = referredBonus;
              }
              console.log(`Referrer found: ${referrerId}. Referred user bonus: ${referredBonus}`);
    
              const referralDocRef = doc(collection(db, "referrals"));
              const newReferral: Omit<Referral, 'id'> = {
                referrerId: referrerId,
                referredUserId: user.uid,
                referredUserEmail: newUsersEmail || "N/A", // Store the email for historical check
                status: 'pending',
                referrerBonus: referralSettings.referrerBonus || 0,
                referredBonus: referredBonus,
                createdAt: Timestamp.now(),
                ipAddress: ipAddress,
                deviceId: deviceId,
              };
              transaction.set(referralDocRef, newReferral);
              console.log("Referral document created in transaction.");
    
              const referrerNotification: Omit<FirestoreNotification, 'id'> = {
                userId: referrerId,
                title: "New Referral Signup!",
                message: `${details.fullName} has signed up using your code. You'll get your bonus when they complete their first booking.`,
                type: 'success',
                href: '/referral',
                read: false,
                createdAt: Timestamp.now(),
              };
              transaction.set(doc(collection(db, "userNotifications")), referrerNotification);
              console.log("Referrer notification created in transaction.");
            } else {
              console.warn(`Stored referral code "${referralCodeParam}" not found.`);
            }
          } else {
              console.warn(`Potential repeat referral detected for user/device/ip. Skipping bonus.`);
          }
        }
  
        const newUserFirestoreData: FirestoreUser = {
          id: user.uid,
          uid: user.uid,
          email: details.email || user.email || null,
          displayName: details.fullName,
          mobileNumber: user.phoneNumber || details.mobileNumber || null,
          photoURL: user.photoURL || null,
          isActive: true,
          createdAt: Timestamp.now(),
          lastLoginAt: Timestamp.now(),
          walletBalance: initialWalletBalance,
          referralCode: generateReferralCode(referralSettings?.referralCodeLength || 6),
          ...(referrerId && { referredBy: referrerId }),
        };
        transaction.set(newUserDocRef, newUserFirestoreData);
        console.log(`New user document for ${user.uid} created in transaction with wallet balance ${initialWalletBalance}.`);
      });
  
      // 3. Post-transaction tasks
      const guestIdBeforeAuth = getGuestId();
      logUserActivity('newUser', {
        email: user.email || undefined,
        fullName: details.fullName,
        mobileNumber: user.phoneNumber || details.mobileNumber,
        loginMethod: user.providerData[0]?.providerId || 'unknown',
        sourceGuestId: guestIdBeforeAuth,
        usedReferral: !!localStorage.getItem('referralCode'),
      }, user.uid, null);
      clearGuestId();
      localStorage.removeItem('referralCode');
      
      // Sync cart after creating new user doc
      await syncCartOnLogin(user.uid);
  
      // Send Welcome Email
      if (appConfig.smtpHost && details.email) {
          sendWelcomeEmail({
              userName: details.fullName,
              userEmail: details.email,
              smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort,
              smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
          }).catch(err => console.error("Failed to send welcome email:", err));
      }

      // Send Welcome WhatsApp
      const marketingConfigDoc = await getDoc(doc(db, "webSettings", "marketingAutomation"));
      if (marketingConfigDoc.exists()) {
          const marketingConfig = marketingConfigDoc.data() as MarketingAutomationSettings;
          if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnSignup?.enabled && marketingConfig.whatsAppOnSignup.templateName && details.mobileNumber) {
              try {
                  await fetch('/api/whatsapp/send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          to: details.mobileNumber,
                          templateName: marketingConfig.whatsAppOnSignup.templateName,
                          parameters: [details.fullName, "Wecanfix"],
                      }),
                  });
              } catch (waError) {
                  console.error("Failed to trigger welcome WhatsApp message:", waError);
              }
          }
      }
      
      setUser(user);
      setIsCompletingProfile(false);
      setUserCredentialForProfileCompletion(null);
  
      toast({ title: "Account Created!", description: "Welcome to Wecanfix!" });
  
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
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [userCredentialForProfileCompletion, toast, router, searchParams, authActionRedirectPath, appConfig]);
  
  const signUp = useCallback(async (data: SignUpData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      
      setUserCredentialForProfileCompletion(userCredential);
      await completeProfileSetup({
          fullName: data.fullName,
          email: data.email,
          mobileNumber: data.mobileNumber,
      });
      
    } catch (error) {
      const authError = error as AuthError;
      console.error("Signup error:", authError);
      toast({ title: "Signup Failed", description: authError.message, variant: "destructive" });
      setIsLoading(false);
      throw authError;
    }
  }, [toast, completeProfileSetup]);

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
      if (authError.code !== 'auth/popup-closed-by-user') {
        console.error("Google Sign-in error:", authError);
        toast({ title: "Google Sign-in Failed", description: authError.message || "Could not sign in with Google.", variant: "destructive" });
      }
      setIsLoading(false); 
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
        logUserActivity('userLogout', { logoutMethod: 'manual', email: userEmailForLog ?? undefined }, userIdForLog, null);
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


