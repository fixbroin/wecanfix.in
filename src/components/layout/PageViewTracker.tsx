
"use client";

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMarketingSettings } from '@/hooks/useMarketingSettings';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { useAuth } from '@/hooks/useAuth';

const PageViewTracker = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings: marketingSettings, isLoading: isLoadingMarketingSettings } = useMarketingSettings();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const initialLogDoneRef = useRef(false); // To prevent duplicate logs on HMR or fast re-renders

  useEffect(() => {
    if (isLoadingMarketingSettings || isLoadingAuth || initialLogDoneRef.current) {
      return;
    }

    const fullUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

    // Exclude admin, provider, API routes, and common static file extensions from logging
    const excludedPrefixes = ['/admin', '/provider', '/api/', '/_next/', '/firebase-messaging-sw.js'];
    const excludedExtensions = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.webmanifest', '.xml', '.txt'];
    if (excludedPrefixes.some(prefix => pathname.startsWith(prefix)) || 
        excludedExtensions.some(ext => pathname.endsWith(ext))) {
      return;
    }
    
    initialLogDoneRef.current = true; // Mark that we're attempting the initial log for this mount/load

    // Log page view to Firestore via UserActivity logger
    const guestId = !user ? getGuestId() : null;
    logUserActivity(
      'pageView',
      { pageUrl: fullUrl, pageTitle: typeof document !== 'undefined' ? document.title : '' },
      user?.uid,
      guestId
    );

    // Log visitor info with geolocation
    const logVisitorWithGeoLocation = async () => {
      try {
        const geoResponse = await fetch('https://ipapi.co/json/');
        if (!geoResponse.ok) {
          console.warn(`Failed to fetch geolocation: ${geoResponse.status}`);
          // Attempt to log without geo if ipapi fails
          await fetch('/api/log-visitor-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ipData: { ip: 'GeoLookupFailed', city: 'Unknown', region: 'Unknown', country_name: 'Unknown', postal: 'Unknown', org: 'Unknown' },
              pathname,
              userAgent: navigator.userAgent,
            }),
          });
          return;
        }
        const ipData = await geoResponse.json();
        
        await fetch('/api/log-visitor-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ipData,
            pathname,
            userAgent: navigator.userAgent,
          }),
        });
      } catch (error) {
        console.error("Error in PageViewTracker fetching geo or logging visitor:", error);
        // Fallback log without geo-IP if the geo service itself fails
        try {
           await fetch('/api/log-visitor-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ipData: { ip: 'GeoLookupError', city: 'Unknown', region: 'Unknown', country_name: 'Unknown', postal: 'Unknown', org: 'Unknown' },
              pathname,
              userAgent: navigator.userAgent,
            }),
          });
        } catch (fallbackError) {
            console.error("Error in PageViewTracker fallback log:", fallbackError);
        }
      }
    };

    logVisitorWithGeoLocation();


    // Google Tag Manager
    if (marketingSettings.googleTagManagerId && typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'page_view_gtm', // Changed event name to avoid conflict with GA4 page_view
        page_path: fullUrl,
        page_title: typeof document !== 'undefined' ? document.title : undefined,
      });
    }

    // gtag.js (for GA4 or Google Ads without GTM)
    if (marketingSettings.googleTagId && typeof window !== 'undefined' && typeof window.gtag === 'function' && !marketingSettings.googleTagManagerId) {
      window.gtag('config', marketingSettings.googleTagId, {
        page_path: fullUrl,
        page_title: typeof document !== 'undefined' ? document.title : undefined,
      });
    }
    
    // Reset ref for next route change after a short delay to handle potential fast navigations
    // This component might remount or its dependencies might change for a new "page".
    // A more robust solution for SPA page views might involve a listener on router events.
    const timer = setTimeout(() => {
        initialLogDoneRef.current = false;
    }, 500); 
    return () => clearTimeout(timer);

  }, [pathname, searchParams, marketingSettings, isLoadingMarketingSettings, user, isLoadingAuth]);

  return null; 
};

export default PageViewTracker;
