

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import AppLayout from '@/components/layout/AppLayout';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoadingProvider } from '@/contexts/LoadingContext';
import GlobalActionLoader from '@/components/shared/GlobalActionLoader';
import { getGlobalSEOSettings } from '@/lib/seoUtils';
import React, { Suspense } from 'react';
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

export async function generateMetadata(): Promise<Metadata> {
  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const siteName = seoSettings.siteName || 'Wecanfix';
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const defaultDescription = seoSettings.defaultMetaDescription || 'Book home services easily with Wecanfix.';
  const defaultKeywords = (seoSettings.defaultMetaKeywords || '').split(',').map(k => k.trim()).filter(k => k);
  const defaultOgImage = `/android-chrome-512x512.png`;
  const ogImage = seoSettings.structuredDataImage || defaultOgImage;

  return {
    metadataBase: new URL(appBaseUrl),
    title: {
      default: siteName,
      template: `%s${defaultSuffix}`,
    },
    description: defaultDescription,
    keywords: defaultKeywords.length > 0 ? defaultKeywords : undefined,
    manifest: '/manifest.json', // Default manifest
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: siteName,
    },
    openGraph: {
      siteName: siteName,
      type: 'website',
      images: ogImage ? [{ url: ogImage.startsWith('http') ? ogImage : `${appBaseUrl}${ogImage.startsWith('/') ? '' : '/'}${ogImage}` }] : [],
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any', rel: 'icon' },
        { url: '/android-chrome-192x192.png', type: 'image/png', sizes: '192x192' },
        { url: '/android-chrome-512x512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-touch-icon.png',
    }
  };
}

export async function generateViewport(): Promise<Viewport> {
  const themeColorValue = hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL.primary!);

  return {
    themeColor: themeColorValue,
  };
}

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
  return (
    <html lang="en" className={`${roboto.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = (function() { // IIFE for getInitialTheme
                  try {
                    const storedTheme = localStorage.getItem('wecanfix-theme');
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
                    if (localStorage.getItem('wecanfix-theme') !== theme) {
                        localStorage.setItem('wecanfix-theme', theme);
                    }
                } catch (e) { /* LocalStorage not available or failed */ }
              })();
            `,
          }}
        />
        <ThemeInjector />
      </head>

      <body className="font-body antialiased no-select">
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
    
