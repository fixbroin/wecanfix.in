
"use client";

import Script from 'next/script';
import { useMarketingSettings } from '@/hooks/useMarketingSettings';
import { useEffect } from 'react';
import { initializeFCM, onForegroundMessage } from '@/lib/fcmUtils'; // Import FCM utilities
import { useAuth } from '@/hooks/useAuth'; // To get userId for FCM
import { useGlobalSettings } from '@/hooks/useGlobalSettings'; // To check if chat is enabled

const MarketingScriptsInjector = () => {
  const { settings: marketingSettings, isLoading: isLoadingMarketing } = useMarketingSettings();
  const { settings: globalSettings, isLoading: isLoadingGlobal } = useGlobalSettings();
  const { user, isLoading: isLoadingAuth } = useAuth();

  useEffect(() => {
    // Meta Pixel PageView event on route change (basic example)
    if (marketingSettings.metaPixelId && typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'PageView');
    }
  }, [marketingSettings.metaPixelId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoadingMarketing && !isLoadingGlobal && !isLoadingAuth) {
      if (globalSettings.isChatEnabled && marketingSettings.firebasePublicVapidKey) {
        console.log("MarketingScriptsInjector: Chat is enabled and VAPID key exists, attempting to initialize FCM.");
        initializeFCM(user?.uid)
          .then(token => {
            if (token) {
              console.log("FCM initialized and token received by injector:", token);
              // Call listener for foreground messages after successful initialization
              onForegroundMessage();
            } else {
              console.log("FCM initialization did not return a token from injector.");
            }
          })
          .catch(err => console.error("Error during FCM initialization from injector:", err));
      } else {
        if (!globalSettings.isChatEnabled) console.log("MarketingScriptsInjector: Chat is not enabled, not initializing FCM.");
        if (!marketingSettings.firebasePublicVapidKey) console.log("MarketingScriptsInjector: VAPID key missing, not initializing FCM.");
      }
    }
  }, [
    user, 
    isLoadingAuth, 
    globalSettings.isChatEnabled, 
    isLoadingGlobal, 
    marketingSettings.firebasePublicVapidKey, 
    isLoadingMarketing
  ]);


  if (isLoadingMarketing) {
    return null;
  }

  return (
    <>
      {/* Google Tag Manager (GTM) */}
      {marketingSettings.googleTagManagerId && (
        <>
          <Script
            id="gtm-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${marketingSettings.googleTagManagerId}');
              `,
            }}
          />
        </>
      )}

      {/* Google Tag (gtag.js) */}
      {marketingSettings.googleTagId && !marketingSettings.googleTagManagerId && (
        <>
          <Script
            id="gtag-script"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${marketingSettings.googleTagId}`}
          />
          <Script
            id="gtag-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${marketingSettings.googleTagId}');
              `,
            }}
          />
        </>
      )}

      {/* Meta Pixel (Facebook Pixel) */}
      {marketingSettings.metaPixelId && (
        <Script
          id="fb-pixel-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${marketingSettings.metaPixelId}');
              fbq('track', 'PageView');
            `,
          }}
        />
      )}
      
      {/* Placeholder for FCM setup via script tag - values will be used by fcmUtils.ts and firebase-messaging-sw.js */}
      {/* The actual registration and token handling is done in fcmUtils.ts */}
      {/* The firebasePublicVapidKey is passed to getToken in fcmUtils.ts */}
      {/* The firebaseClientConfig values (esp. messagingSenderId) are crucial for firebase-messaging-sw.js */}
      <script
        id="fixbro-fcm-dynamic-config"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            firebaseClientConfig: marketingSettings.firebaseClientConfig || {},
          }),
        }}
      />
    </>
  );
};

export default MarketingScriptsInjector;
