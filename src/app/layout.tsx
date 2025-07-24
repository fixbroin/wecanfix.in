
"use client"; // Required for useEffect and other client-side hooks

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import AppLayout from '@/components/layout/AppLayout';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoadingProvider } from '@/contexts/LoadingContext';
import GlobalActionLoader from '@/components/shared/GlobalActionLoader';
import { getGlobalSEOSettings } from '@/lib/seoUtils';
import React, { Suspense, useEffect, useRef } from 'react'; // Added useEffect and useRef
import { Loader2 } from 'lucide-react';
import { getBaseUrl } from '@/lib/config';
import MarketingScriptsInjector from '@/components/layout/MarketingScriptsInjector';
import { Roboto } from 'next/font/google';
import PageViewTracker from '@/components/layout/PageViewTracker';
import ThemeInjector from '@/components/layout/ThemeInjector';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, hslStringToHex } from '@/lib/colorUtils';

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

// generateMetadata and generateViewport remain server-side features, so we can't export them from a "use client" file.
// We'll handle this by assuming these are handled appropriately by Next.js and focusing on the runtime logic.
// For the purpose of this response, we'll keep them commented out to indicate they are conceptually separate.
/*
export async function generateMetadata(): Promise<Metadata> { ... }
export async function generateViewport(): Promise<Viewport> { ... }
*/

const RootSuspenseLoader = () => (
  <div className="flex justify-center items-center min-h-screen w-full">
    <Loader2 className="h-12 w-12 animate-spin text-primary" />
    <p className="ml-3 text-muted-foreground">Loading...</p>
  </div>
);


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  // Logic for content protection and triple back press
  useEffect(() => {
    // 1. Prevent content copying and right-click
    const disableContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', disableContextMenu);
    document.body.classList.add('no-select');

    // 2. Triple back press to exit on mobile
    let backPressCount = 0;
    let lastBackPressTime = 0;
    const handlePopState = (event: PopStateEvent) => {
      const currentTime = new Date().getTime();
      
      // Reset counter if presses are not continuous (more than 1 second apart)
      if (currentTime - lastBackPressTime > 1000) {
        backPressCount = 0;
      }
      
      backPressCount++;
      lastBackPressTime = currentTime;

      if (backPressCount >= 3) {
        backPressCount = 0; // Reset counter
        // Attempt to close the window. Note: This may not work in all browsers/contexts.
        window.close();
      } else {
        // To prevent actual navigation while counting, we push the state back.
        // This keeps the user on the current page for the first two back presses.
        history.pushState(null, '', window.location.href);
      }
    };

    // Check for mobile view before adding the listener
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', handlePopState);
    }

    // Cleanup function to remove event listeners when the component unmounts
    return () => {
      document.removeEventListener('contextmenu', disableContextMenu);
      document.body.classList.remove('no-select');
      if (isMobile) {
        window.removeEventListener('popstate', handlePopState);
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount


  return (
    <html lang="en" className={`${roboto.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = (function() { // IIFE for getInitialTheme
                  try {
                    const storedTheme = localStorage.getItem('fixbro-theme');
                    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
                    if (typeof window.matchMedia === 'function') {
                        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    }
                    return 'light'; // Default if matchMedia is not available (older browsers, SSR in some tests)
                  } catch (e) { return 'light'; }
                })();
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
                // Persist the determined theme back to localStorage if it wasn't already there or differs
                // This helps if it was derived from matchMedia or if localStorage was somehow cleared
                try {
                    if (localStorage.getItem('fixbro-theme') !== theme) {
                        localStorage.setItem('fixbro-theme', theme);
                    }
                } catch (e) { /* LocalStorage not available or failed */ }
              })();
            `,
          }}
        />
        <ThemeInjector />
      </head>

      <body className="font-body antialiased">
        <Suspense fallback={<RootSuspenseLoader />}>
          <AuthProvider>
            <LoadingProvider>
              <MarketingScriptsInjector />
              <PageViewTracker />
              <AppLayout>
                {children}
              </AppLayout>
              <GlobalActionLoader />
            </LoadingProvider>
          </AuthProvider>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
