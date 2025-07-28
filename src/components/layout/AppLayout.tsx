
"use client";

import Header from './Header';
import Footer from './Footer';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { useState, useEffect, useCallback } from 'react';
import PopupDisplayManager from '@/components/shared/PopupDisplayManager';
import GlobalAdminPopup from '@/components/chat/GlobalAdminPopup';
import ReviewSubmissionModal from '@/components/reviews/ReviewSubmissionModal';
import type { FirestoreBooking } from '@/types/firestore';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import BottomNavigationBar from './BottomNavigationBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import CookieConsentBanner from '@/components/shared/CookieConsentBanner';
import CompleteProfileDialog from '@/components/auth/CompleteProfileDialog'; // Import the new dialog
import PwaInstallButton from '@/components/shared/PwaInstallButton';

const AppLayout: React.FC<PropsWithChildren> = ({ children }) => {
  const pathname = usePathname();
  const [isClientMounted, setIsClientMounted] = useState(false);
  
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);

  const { user, isLoading: authIsLoading, isCompletingProfile, userCredentialForProfileCompletion, completeProfileSetup, cancelProfileCompletion } = useAuth();
  const [pendingReviewBooking, setPendingReviewBooking] = useState<FirestoreBooking | null>(null);
  const [isReviewPopupOpen, setIsReviewPopupOpen] = useState(false);

  const isMobile = useIsMobile();
  
  useEffect(() => {
    setIsClientMounted(true); 
    const preventRightClick = (e: MouseEvent) => e.preventDefault();
    // This event listener is added on the client-side, so it's safe.
    document.addEventListener('contextmenu', preventRightClick);
    return () => document.removeEventListener('contextmenu', preventRightClick);
  }, []);

  useEffect(() => {
    if (isClientMounted) { 
      const currentIsAdminRoute = pathname.startsWith('/admin');
      const currentIsProviderRoute = pathname.startsWith('/provider'); 
      const currentIsAuthRoute = pathname.startsWith('/auth/');
      const currentIsCheckoutRoute = pathname.startsWith('/checkout');
      
      const bottomNavActivePaths = ['/', '/chat', '/my-bookings', '/notifications', '/profile', '/referral','/checkout/schedule', '/custom-service','/checkout/address', '/checkout/payment', '/checkout/thank-you', '/cart', '/categories'];
      const shouldShowBottomNav = isMobile && bottomNavActivePaths.includes(pathname);

      const hideFooterPaths: string[] = [];
      const hideFooterPrefixes = [
        '/category/', 
        '/service/',  
        '/custom-service',
      ];

      const shouldHideFooterForSpecificPaths = 
        hideFooterPaths.includes(pathname) || 
        hideFooterPrefixes.some(prefix => pathname.startsWith(prefix));

      setShowHeader(!currentIsAdminRoute && !currentIsProviderRoute && !currentIsAuthRoute);
      
      setShowFooter(
        !currentIsAdminRoute &&
        !currentIsProviderRoute && 
        !currentIsAuthRoute &&
        !currentIsCheckoutRoute &&
        !shouldShowBottomNav && 
        !shouldHideFooterForSpecificPaths      
      );
    }
  }, [pathname, isClientMounted, isMobile]);

  const fetchPendingReview = useCallback(async () => {
    if (user && !authIsLoading && !pendingReviewBooking && !isReviewPopupOpen) {
      try {
        const bookingsRef = collection(db, "bookings");
        const q = query(
          bookingsRef,
          where("userId", "==", user.uid),
          where("status", "==", "Completed"),
          where("isReviewedByCustomer", "==", false),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const bookingToReview = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as FirestoreBooking;
          console.log("Pending review found for booking:", bookingToReview.bookingId);
          setPendingReviewBooking(bookingToReview);
          setIsReviewPopupOpen(true);
        } else {
          console.log("No pending reviews found for user:", user.uid);
          setPendingReviewBooking(null);
          setIsReviewPopupOpen(false);
        }
      } catch (error) {
        console.error("Error fetching pending reviews:", error);
      }
    }
  }, [user, authIsLoading, pendingReviewBooking, isReviewPopupOpen]);


  useEffect(() => {
    if (isClientMounted && user && !authIsLoading) {
        const isAuthPage = pathname.startsWith('/auth/');
        const isAdminPage = pathname.startsWith('/admin/');
        const isProviderPage = pathname.startsWith('/provider/');
        if (!isAuthPage && !isAdminPage && !isProviderPage) { 
            fetchPendingReview();
        }
    }
    if (!user && !authIsLoading) {
        setIsReviewPopupOpen(false);
        setPendingReviewBooking(null);
    }
  }, [user, authIsLoading, isClientMounted, pathname, fetchPendingReview]);

  const handleReviewSubmitted = useCallback(() => {
    setIsReviewPopupOpen(false);
    setPendingReviewBooking(null);
    fetchPendingReview(); 
  }, [fetchPendingReview]);

  const currentIsHomePage = pathname === '/';
  const bottomNavActivePaths = ['/', '/chat', '/notifications', '/my-bookings', '/profile', '/referral','/checkout/schedule', '/checkout/address', '/custom-service','/checkout/payment', '/checkout/thank-you', '/cart', '/categories'];
  const shouldShowBottomNav = isClientMounted && isMobile && bottomNavActivePaths.includes(pathname);
  
  const shouldShowNewsletterPopupManager = isClientMounted && !pathname.startsWith('/admin') && !pathname.startsWith('/provider') && currentIsHomePage;
  const shouldShowGlobalAdminPopup = isClientMounted && !pathname.startsWith('/admin') && !pathname.startsWith('/provider');


  return (
    <div className="flex flex-col min-h-screen">
      {showHeader && <Header />}
      <main className={cn("flex-grow", {
        "pb-16": shouldShowBottomNav 
      })}>
        {children}
      </main>
      {showFooter && <Footer />}
      {shouldShowBottomNav && <BottomNavigationBar />}
      {shouldShowNewsletterPopupManager && <PopupDisplayManager />}
      {shouldShowGlobalAdminPopup && <GlobalAdminPopup />}
      {isClientMounted && pendingReviewBooking && (
        <ReviewSubmissionModal
          booking={pendingReviewBooking}
          isOpen={isReviewPopupOpen}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
      {isClientMounted && userCredentialForProfileCompletion && (
        <CompleteProfileDialog
            isOpen={isCompletingProfile}
            userCredential={userCredentialForProfileCompletion}
            onSubmit={completeProfileSetup}
            onClose={cancelProfileCompletion}
        />
      )}
      {isClientMounted && <CookieConsentBanner />}
      {isClientMounted && <PwaInstallButton />}
    </div>
  );
};

export default AppLayout;
