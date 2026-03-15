"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette, GlobalAdminPopup, LoaderType } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { getCache, setCache } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const CACHE_KEY = "global-web-settings";

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalWebSettings>(() => getCache<GlobalWebSettings>(CACHE_KEY, true) || defaultGlobalWebSettings);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  const processData = useCallback((data: Partial<GlobalWebSettings>): GlobalWebSettings => {
    const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
    THEME_PALETTE_KEYS.forEach(key => {
      if (data.themeColors?.light?.[key]) {
        (mergedLightPalette[key] as any) = data.themeColors.light[key];
      }
    });

    const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
    THEME_PALETTE_KEYS.forEach(key => {
      if (data.themeColors?.dark?.[key]) {
        (mergedDarkPalette[key] as any) = data.themeColors.dark[key];
      }
    });

    return {
      ...defaultGlobalWebSettings,
      ...data,
      themeColors: {
        light: mergedLightPalette,
        dark: mergedDarkPalette,
      },
      socialMediaLinks: {
        ...defaultGlobalWebSettings.socialMediaLinks,
        ...(data.socialMediaLinks || {}),
      },
      globalAdminPopup: {
        ...defaultGlobalWebSettings.globalAdminPopup,
        ...(data.globalAdminPopup || {}),
      } as GlobalAdminPopup,
    };
  }, []);

  useEffect(() => {
    const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);

    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const processed = processData(docSnap.data());
        setSettings(processed);
        setCache(CACHE_KEY, processed, true);
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching settings:", err);
      setError("Failed to load settings.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [processData]);

  return { settings, isLoading, error };
}
