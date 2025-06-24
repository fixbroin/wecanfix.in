
"use client";

import type { PropsWithChildren } from 'react';
import React, { Suspense, useEffect, useState, useRef, useCallback } from 'react'; // Added useCallback
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import AdminSidebarContent from '@/components/admin/AdminSidebarContent';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
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
import { auth, db } from '@/lib/firebase'; // Import db
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import { useLoading } from '@/contexts/LoadingContext';
import ThemeToggle from '@/components/shared/ThemeToggle';
import AdminFloatingChatButton from '@/components/admin/AdminFloatingChatButton';
import FloatingAdminChatWindow from '@/components/admin/FloatingAdminChatWindow';
import { useTotalAdminUnreadChatCount } from '@/hooks/useTotalAdminUnreadChatCount';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp, doc, updateDoc } from 'firebase/firestore'; // Firestore imports
import type { FirestoreNotification } from '@/types/firestore'; // FirestoreNotification type
import NewBookingAdminPopup from '@/components/admin/NewBookingAdminPopup'; // New Booking Popup

const AdminPageLoader = () => (
  <div className="flex justify-center items-center min-h-[calc(100vh-120px)]">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
    <p className="ml-2 text-muted-foreground">Loading page...</p>
  </div>
);

const PROCESSED_BOOKING_NOTIFICATIONS_KEY = 'fixbro_processedBookingNotifications';

export default function AdminLayout({ children }: PropsWithChildren) {
  const { user: adminUser, isLoading: authIsLoading, logOut: handleLogoutAuth } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const { showLoading, hideLoading } = useLoading();
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);

  const { count: unreadAdminNotificationsCount, isLoading: isLoadingAdminNotifications } = useUnreadNotificationsCount(adminUser?.uid);

  const { totalUnreadCount, isLoading: isLoadingTotalUnread } = useTotalAdminUnreadChatCount(adminUser?.uid);
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const adminChatAudioRef = useRef<HTMLAudioElement | null>(null);
  const previousTotalUnreadCountRef = useRef<number>(0);

  // State for New Booking Popup
  const [showNewBookingPopup, setShowNewBookingPopup] = useState(false);
  const [newBookingPopupDetails, setNewBookingPopupDetails] = useState<{ bookingDocId: string; bookingHumanId: string; notificationId: string; } | null>(null);
  const [processedBookingNotificationIds, setProcessedBookingNotificationIds] = useState<string[]>([]);

  useEffect(() => {
    // Load processed notification IDs from sessionStorage on mount
    const storedProcessedIds = sessionStorage.getItem(PROCESSED_BOOKING_NOTIFICATIONS_KEY);
    if (storedProcessedIds) {
      try {
        setProcessedBookingNotificationIds(JSON.parse(storedProcessedIds));
      } catch (e) {
        console.error("Error parsing processed notification IDs from session storage:", e);
        sessionStorage.removeItem(PROCESSED_BOOKING_NOTIFICATIONS_KEY); // Clear if malformed
      }
    }
  }, []);

  // Listener for new booking notifications
  useEffect(() => {
    if (!adminUser?.uid || authIsLoading) return;

    const notificationsRef = collection(db, "userNotifications");
    // This is the query that requires the composite index
    const q = query(
      notificationsRef,
      where("userId", "==", adminUser.uid),
      where("type", "==", "admin_alert"), 
      where("read", "==", false), 
      orderBy("createdAt", "desc"),
      limit(5) 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;

      let triggeredForThisSnapshot = false;

      snapshot.docs.forEach(docSnap => {
        if (triggeredForThisSnapshot) return;

        const notification = { id: docSnap.id, ...docSnap.data() } as FirestoreNotification;
        const notificationId = notification.id!;

        if (notification.title?.toLowerCase().includes("new booking") && !processedBookingNotificationIds.includes(notificationId)) {
          const href = notification.href;
          let bookingDocId = "";
          if (href && href.startsWith('/admin/bookings/edit/')) {
            const parts = href.split('/');
            bookingDocId = parts[parts.length - 1];
          }

          let bookingHumanId = "N/A";
          const messageMatch = notification.message?.match(/ID: (\S+)/);
          if (messageMatch && messageMatch[1]) {
            bookingHumanId = messageMatch[1];
          } else {
            const titleMatch = notification.title?.match(/ID: (\S+)/); 
             if (titleMatch && titleMatch[1]) bookingHumanId = titleMatch[1];
          }
          
          if (bookingDocId && bookingHumanId !== "N/A") {
            console.log("AdminLayout: New Booking Notification Detected:", notification.title, "Doc ID:", bookingDocId, "Human ID:", bookingHumanId);
            setNewBookingPopupDetails({ bookingDocId, bookingHumanId, notificationId });
            setShowNewBookingPopup(true);
            
            setProcessedBookingNotificationIds(prev => {
              const newProcessed = [...prev, notificationId];
              sessionStorage.setItem(PROCESSED_BOOKING_NOTIFICATIONS_KEY, JSON.stringify(newProcessed));
              return newProcessed;
            });
            triggeredForThisSnapshot = true; 
          }
        }
      });
    }, (error) => {
      // This is where the Firestore index error would be caught by the listener
      console.error("AdminLayout: Error in userNotifications snapshot listener:", error);
      if (error.message.includes("query requires an index")) {
        toast({
          title: "Firestore Index Required",
          description: "A required Firestore index is missing. Please check the server console for a link to create it. The New Booking Popup might not work until this is resolved.",
          variant: "destructive",
          duration: 10000,
        });
      }
    });
    return () => unsubscribe();
  }, [adminUser, authIsLoading, processedBookingNotificationIds, toast]); // Added toast

  const handleCloseNewBookingPopup = useCallback(async (markNotificationAsRead?: boolean, notificationIdToMark?: string) => {
    setShowNewBookingPopup(false);
    setNewBookingPopupDetails(null);
    if (markNotificationAsRead && notificationIdToMark && adminUser?.uid) {
      try {
        await updateDoc(doc(db, "userNotifications", notificationIdToMark), { read: true });
      } catch (error) {
        console.error("AdminLayout: Failed to mark new booking notification as read:", error);
      }
    }
  }, [adminUser?.uid]);


  useEffect(() => {
    if (globalSettings?.chatNotificationSoundUrl) {
      if (!adminChatAudioRef.current) {
        adminChatAudioRef.current = new Audio(globalSettings.chatNotificationSoundUrl);
        adminChatAudioRef.current.load();
      } else if (adminChatAudioRef.current.src !== globalSettings.chatNotificationSoundUrl) {
        adminChatAudioRef.current.src = globalSettings.chatNotificationSoundUrl;
        adminChatAudioRef.current.load();
      }
    } else {
      adminChatAudioRef.current = null;
    }
  }, [globalSettings?.chatNotificationSoundUrl]);

  useEffect(() => {
    if (
      !isLoadingAdminNotifications && 
      !isLoadingGlobalSettings &&
      globalSettings.chatNotificationSoundUrl && 
      adminChatAudioRef.current &&
      adminUser
    ) {
      if (unreadAdminNotificationsCount > previousTotalUnreadCountRef.current) {
        adminChatAudioRef.current.play().catch(e => console.warn("AdminLayout: Notification sound play failed:", e));
      }
    }
    if (!isLoadingAdminNotifications) {
        previousTotalUnreadCountRef.current = unreadAdminNotificationsCount; 
    }
  }, [unreadAdminNotificationsCount, isLoadingAdminNotifications, globalSettings, isLoadingGlobalSettings, adminUser]);


  const handleChangePassword = async () => {
    if (adminUser && adminUser.email) {
      try {
        await sendPasswordResetEmail(auth, adminUser.email);
        toast({ title: "Password Reset Email Sent", description: "Check your inbox for a password reset link." });
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Could not send password reset email.", variant: "destructive" });
      }
    } else {
      toast({ title: "Error", description: "Admin email not found.", variant: "destructive" });
    }
  };

  const navigateToAdminNotifications = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    showLoading();
    router.push('/admin/notifications');
  };

  useEffect(() => {
    return () => {
      hideLoading();
    };
  }, [pathname, adminUser, hideLoading]);


  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (authIsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading Admin Panel...</p>
      </div>
    );
  }

  const isAdmin = adminUser && adminUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <ProtectedRoute>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon" variant="sidebar" className="border-r bg-card text-card-foreground">
          <AdminSidebarContent />
        </Sidebar>
        <SidebarInset className="bg-muted/30">
          <div className="flex h-16 items-center justify-between px-2 sm:px-4 border-b bg-background">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hidden md:inline-flex" />
              <h1 className="text-lg sm:text-xl font-semibold">Admin Panel</h1>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label="Admin Notifications"
                  onClick={navigateToAdminNotifications}
                >
                  <Bell className="h-5 w-5" />
                  {!isLoadingAdminNotifications && unreadAdminNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
                      {unreadAdminNotificationsCount > 9 ? '9+' : unreadAdminNotificationsCount}
                    </span>
                  )}
                </Button>
              )}

              {adminUser && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={adminUser.photoURL || undefined} alt={adminUser.displayName || adminUser.email || "Admin"} />
                        <AvatarFallback>
                          {adminUser.email ? adminUser.email[0].toUpperCase() : <UserCircle size={20} />}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {adminUser.displayName || "Admin User"}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {adminUser.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin/profile" onClick={() => showLoading()}>
                        <UserCircle className="mr-2 h-4 w-4" />
                        <span>Admin Profile</span>
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
          <main className="p-2 sm:p-4 md:p-6 relative">
            <Suspense fallback={<AdminPageLoader />}>
              {children}
            </Suspense>
            {isAdmin && (
              <>
                <AdminFloatingChatButton onClick={() => setIsFloatingChatOpen(prev => !prev)} />
                <FloatingAdminChatWindow
                  isOpen={isFloatingChatOpen}
                  onClose={() => setIsFloatingChatOpen(false)}
                />
                {newBookingPopupDetails && (
                  <NewBookingAdminPopup
                    isOpen={showNewBookingPopup}
                    bookingDocId={newBookingPopupDetails.bookingDocId}
                    bookingHumanId={newBookingPopupDetails.bookingHumanId}
                    onClose={(markAsRead) => handleCloseNewBookingPopup(markAsRead, newBookingPopupDetails.notificationId)}
                  />
                )}
              </>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
}

    