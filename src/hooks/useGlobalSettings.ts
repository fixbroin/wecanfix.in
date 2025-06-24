
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from "firebase/firestore"; // Removed getDoc as onSnapshot is used
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette, GlobalAdminPopup } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";

// Define more comprehensive default global settings including theme
export const defaultGlobalWebSettings: GlobalWebSettings = {
  websiteName: "FixBro",
  contactEmail: "support@fixbro.in",
  contactMobile: "+919876543210",
  address: "123 FixBro Lane, Service City, ST 12345",
  logoUrl: "", // Or a default placeholder path
  faviconUrl: "/favicon.ico",
  websiteIconUrl: "/android-chrome-512x512.png",
  socialMediaLinks: {
    facebook: "",
    instagram: "",
    twitter: "",
    linkedin: "",
    youtube: "",
  },
  themeColors: {
    light: { ...DEFAULT_LIGHT_THEME_COLORS_HSL },
    dark: { ...DEFAULT_DARK_THEME_COLORS_HSL },
  },
  isChatEnabled: false, // Default chat to false
  chatNotificationSoundUrl: "",
  globalAdminPopup: {
    message: "",
    isActive: false,
    durationSeconds: 10,
  },
  isCookieConsentEnabled: false, // Default
  cookieConsentMessage: "We use cookies to improve your experience. By continuing, you agree to our Cookie Policy.", // Default
  cookiePolicyContent: "<p>Our Cookie Policy details will be updated here soon.</p>", // Default
  // adminUserUidForChat: "ADMIN_MASTER_UID", // Example placeholder, remove or configure properly
};

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalWebSettings>(defaultGlobalWebSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);

    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<GlobalWebSettings>;
        
        const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
        THEME_PALETTE_KEYS.forEach(key => {
          if (firestoreData.themeColors?.light?.[key]) {
            (mergedLightPalette[key] as any) = firestoreData.themeColors.light[key];
          }
        });

        const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
        THEME_PALETTE_KEYS.forEach(key => {
          if (firestoreData.themeColors?.dark?.[key]) {
            (mergedDarkPalette[key] as any) = firestoreData.themeColors.dark[key];
          }
        });
        
        const mergedSettings: GlobalWebSettings = {
          ...defaultGlobalWebSettings, 
          ...firestoreData, 
          themeColors: {
            light: mergedLightPalette,
            dark: mergedDarkPalette,
          },
          socialMediaLinks: {
            ...defaultGlobalWebSettings.socialMediaLinks,
            ...(firestoreData.socialMediaLinks || {}),
          },
          globalAdminPopup: {
            ...defaultGlobalWebSettings.globalAdminPopup,
            ...(firestoreData.globalAdminPopup || {}),
          } as GlobalAdminPopup,
          isChatEnabled: typeof firestoreData.isChatEnabled === 'boolean' ? firestoreData.isChatEnabled : defaultGlobalWebSettings.isChatEnabled,
          chatNotificationSoundUrl: firestoreData.chatNotificationSoundUrl || defaultGlobalWebSettings.chatNotificationSoundUrl,
          isCookieConsentEnabled: typeof firestoreData.isCookieConsentEnabled === 'boolean' ? firestoreData.isCookieConsentEnabled : defaultGlobalWebSettings.isCookieConsentEnabled,
          cookieConsentMessage: firestoreData.cookieConsentMessage || defaultGlobalWebSettings.cookieConsentMessage,
          cookiePolicyContent: firestoreData.cookiePolicyContent || defaultGlobalWebSettings.cookiePolicyContent,
        };
        setSettings(mergedSettings);
        setError(null);
      } else {
        setSettings(defaultGlobalWebSettings); 
        setError(null); 
        console.warn("Global web settings document 'global' not found in 'webSettings' collection. Using defaults.");
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching global settings:", err);
      setError("Failed to load global settings.");
      setSettings(defaultGlobalWebSettings); 
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { settings, isLoading, error };
}
