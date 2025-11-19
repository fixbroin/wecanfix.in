

"use client";

import type { PropsWithChildren } from 'react';
import React, { Suspense, useEffect, useState, useRef } from 'react'; // Added useRef
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import ProviderSidebarContent from '@/components/provider/ProviderSidebarContent';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { UserCircle, KeyRound, LogOut, Loader2, Bell } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { doc, getDoc } from 'firebase/firestore';
import type { ProviderApplication, FirestoreNotification } from '@/types/firestore';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount'; // Added
import { useGlobalSettings } from '@/hooks/useGlobalSettings'; // Added for sound URL
import ProviderBottomNavigationBar from '@/components/provider/ProviderBottomNavigationBar'; // Import new component
import { useIsMobile } from '@/hooks/use-mobile'; // Import mobile hook
import { cn } from '@/lib/utils';

const ProviderPageLoader = () => (
  <div className="flex justify-center items-center min-h-[calc(100vh-120px)]">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
    <p className="ml-2 text-muted-foreground">Loading Provider Panel...</p>
  </div>
);

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";

export default function ProviderLayout({ children }: PropsWithChildren) {
  const { user: providerUser, isLoading: authIsLoading, logOut: handleLogoutAuth } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const { showLoading, hideLoading } = useLoading();
  const [isProviderApproved, setIsProviderApproved] = useState<boolean | null>(null);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false); 

  const { count: unreadProviderNotificationsCount, isLoading: isLoadingProviderNotifications } = useUnreadNotificationsCount(providerUser?.uid); // For Provider
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const providerNotificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const previousProviderUnreadCountRef = useRef<number>(0);
  const isMobile = useIsMobile(); // Check for mobile view

  useEffect(() => {
    // Dynamically update manifest
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = '/manifest-provider.json';
    } else {
      const newManifestLink = document.createElement('link');
      newManifestLink.rel = 'manifest';
      newManifestLink.href = '/manifest-provider.json';
      document.head.appendChild(newManifestLink);
    }
  }, []);

  useEffect(() => {
    const checkProviderStatus = async () => {
      if (providerUser && !authIsLoading) { 
        setIsCheckingApproval(true); 
        try {
          const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, providerUser.uid);
          const docSnap = await getDoc(appDocRef);
          if (docSnap.exists()) {
            const appData = docSnap.data() as ProviderApplication;
            if (appData.status === 'approved') {
              setIsProviderApproved(true);
            } else {
              setIsProviderApproved(false);
              if (pathname !== '/provider-registration') { 
                toast({ title: "Access Denied", description: "Your provider application is not yet approved or has been rejected.", variant: "destructive" });
                router.push('/');
              }
            }
          } else {
            setIsProviderApproved(false);
             if (pathname !== '/provider-registration') {
                toast({ title: "Application Not Found", description: "Provider application not found. Please complete registration.", variant: "destructive" });
                router.push('/provider-registration');
             }
          }
        } catch (error) {
          console.error("Error checking provider status:", error);
          setIsProviderApproved(false);
           if (pathname !== '/provider-registration') {
              toast({ title: "Error", description: "Could not verify provider status.", variant: "destructive" });
              router.push('/');
           }
        } finally {
          setIsCheckingApproval(false); 
        }
      } else if (!authIsLoading && !providerUser) {
        setIsProviderApproved(false); 
        setIsCheckingApproval(false); 
      }
    };
    checkProviderStatus();
  }, [providerUser, authIsLoading, router, toast, pathname]);

  // Notification sound effect for provider
  useEffect(() => {
    if (globalSettings?.chatNotificationSoundUrl) { // Re-use chat sound for now
      if (!providerNotificationAudioRef.current) {
        providerNotificationAudioRef.current = new Audio(globalSettings.chatNotificationSoundUrl);
        providerNotificationAudioRef.current.load();
      } else if (providerNotificationAudioRef.current.src !== globalSettings.chatNotificationSoundUrl) {
         providerNotificationAudioRef.current.src = globalSettings.chatNotificationSoundUrl;
         providerNotificationAudioRef.current.load();
      }
    } else {
      providerNotificationAudioRef.current = null;
    }
  }, [globalSettings?.chatNotificationSoundUrl]);

  useEffect(() => {
    if (
      !isLoadingProviderNotifications &&
      !isLoadingGlobalSettings &&
      globalSettings?.chatNotificationSoundUrl &&
      providerNotificationAudioRef.current &&
      providerUser
    ) {
      if (unreadProviderNotificationsCount > previousProviderUnreadCountRef.current) {
        providerNotificationAudioRef.current.play().catch(e => console.warn("ProviderLayout: Notification sound play failed:", e));
      }
    }
    // Update the ref *after* the check, regardless of whether the sound played or not,
    // as long as we are not in a loading state for notifications.
    if (!isLoadingProviderNotifications) {
        previousProviderUnreadCountRef.current = unreadProviderNotificationsCount;
    }
  }, [unreadProviderNotificationsCount, isLoadingProviderNotifications, globalSettings, isLoadingGlobalSettings, providerUser]);


  const handleChangePassword = async () => {
    if (providerUser && providerUser.email) {
      try {
        await sendPasswordResetEmail(auth, providerUser.email);
        toast({ title: "Password Reset Email Sent", description: "Check your inbox for a password reset link." });
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Could not send password reset email.", variant: "destructive" });
      }
    } else {
      toast({ title: "Error", description: "Provider email not found.", variant: "destructive" });
    }
  };

  const navigateToProviderNotifications = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    showLoading();
    router.push('/provider/notifications'); 
  };


  useEffect(() => {
    return () => {
      hideLoading();
    };
  }, [pathname, providerUser, hideLoading]);

  if (authIsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading Provider Panel...</p>
      </div>
    );
  }

  if (providerUser && (isCheckingApproval || isProviderApproved === null)) {
     return (
        <div className="flex justify-center items-center min-h-screen bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-3 text-muted-foreground">Verifying provider status...</p>
        </div>
      );
  }
  
  return (
    <ProtectedRoute>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon" variant="sidebar" className="border-r bg-card text-card-foreground">
          <ProviderSidebarContent />
        </Sidebar>
        <SidebarInset className="bg-muted/30">
          <div className="flex h-16 items-center justify-between px-2 sm:px-4 border-b bg-background">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hidden md:inline-flex" />
              <h1 className="text-lg sm:text-xl font-semibold">Provider Panel</h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {providerUser && isProviderApproved && ( // Show bell only if approved
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label="Provider Notifications"
                  onClick={navigateToProviderNotifications}
                >
                  <Bell className="h-5 w-5" />
                  {!isLoadingProviderNotifications && unreadProviderNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
                      {unreadProviderNotificationsCount > 9 ? '9+' : unreadProviderNotificationsCount}
                    </span>
                  )}
                </Button>
              )}
              {providerUser && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={providerUser.photoURL || undefined} alt={providerUser.displayName || providerUser.email || "Provider"} />
                        <AvatarFallback>
                          {providerUser.email ? providerUser.email[0].toUpperCase() : <UserCircle size={20} />}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {providerUser.displayName || "Provider"}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {providerUser.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/provider/profile" onClick={() => showLoading()}>
                        <UserCircle className="mr-2 h-4 w-4" />
                        <span>Profile & Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleChangePassword}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      <span>Change Password</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { showLoading(); handleLogoutAuth(); }} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="md:hidden">
                <SidebarTrigger />
              </div>
            </div>
          </div>
          <main className={cn("p-2 sm:p-4 md:p-6 relative", { "pb-20": isMobile })}>
            <Suspense fallback={<ProviderPageLoader />}>
              {children}
            </Suspense>
          </main>
           {isMobile && isProviderApproved && <ProviderBottomNavigationBar />}
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
}
