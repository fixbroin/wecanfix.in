"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { MarketingSettings, FirebaseClientConfig } from '@/types/firestore';
import { getCache, setCache } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const MARKETING_CONFIG_COLLECTION = "webSettings";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";
const CACHE_KEY = "marketing-settings";

const defaultFirebaseClientConfigValues: FirebaseClientConfig = {
  apiKey: "", authDomain: "", projectId: "", storageBucket: "",
  messagingSenderId: "", appId: "", measurementId: "",
};

export const defaultMarketingValues: MarketingSettings = {
  googleTagManagerId: "",
  googleAnalyticsId: "",
  googleAdsConversionId: "",
  googleAdsConversionLabel: "",
  googleOptimizeContainerId: "",
  googleRemarketingTag: "",
  metaPixelId: "",
  metaConversionApi: { accessToken: "", pixelId: "", testEventCode: "" },
  bingUetTagId: "",
  pinterestTagId: "",
  microsoftClarityProjectId: "",
  googleMerchantCenter: { feedUrl: "", accountId: "" },
  facebookCatalog: { feedUrl: "", pixelId: "" },
  adsTxtContent: "",
  customHeadScript: "",
  customBodyScript: "",
  firebasePublicVapidKey: "",
  firebaseAdminSdkJson: "",
  firebaseClientConfig: defaultFirebaseClientConfigValues,
  whatsAppApiToken: "",
  whatsAppPhoneNumberId: "",
  whatsAppBusinessAccountId: "",
  whatsAppVerifyToken: "",
};

interface UseMarketingSettingsReturn {
  settings: MarketingSettings;
  isLoading: boolean;
  error: string | null;
}

export function useMarketingSettings(): UseMarketingSettingsReturn {
  const [settings, setSettings] = useState<MarketingSettings>(() => getCache<MarketingSettings>(CACHE_KEY, true) || defaultMarketingValues);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);

  const processData = useCallback((firestoreData: Partial<MarketingSettings>): MarketingSettings => {
    return {
      ...defaultMarketingValues,
      ...firestoreData,
      metaConversionApi: { ...defaultMarketingValues.metaConversionApi, ...firestoreData.metaConversionApi },
      googleMerchantCenter: { ...defaultMarketingValues.googleMerchantCenter, ...firestoreData.googleMerchantCenter },
      facebookCatalog: { ...defaultMarketingValues.facebookCatalog, ...firestoreData.facebookCatalog },
      firebaseClientConfig: { ...defaultFirebaseClientConfigValues, ...firestoreData.firebaseClientConfig },
    };
  }, []);

  useEffect(() => {
    const settingsDocRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);

    if (!isAdmin && hasLoadedRef.current) return;

    if (isAdmin) {
      const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const processed = processData(docSnap.data());
          setSettings(processed);
          setCache(CACHE_KEY, processed, true);
        }
        setIsLoading(false);
        hasLoadedRef.current = true;
      }, (err) => {
        console.error("Error fetching marketing settings:", err);
        setError("Failed to load settings.");
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      const fetchMarketing = async () => {
        const cached = getCache<MarketingSettings>(CACHE_KEY, true);
        if (cached && !isAdmin) {
            setIsLoading(false);
            return;
        }

        try {
          const docSnap = await getDoc(settingsDocRef);
          if (docSnap.exists()) {
            const processed = processData(docSnap.data());
            setSettings(processed);
            setCache(CACHE_KEY, processed, true);
          }
        } catch (err) {
          console.error("Error fetching marketing settings:", err);
          setError("Failed to load settings.");
        } finally {
          setIsLoading(false);
          hasLoadedRef.current = true;
        }
      };
      fetchMarketing();
    }
  }, [processData, isAdmin]);

  return { settings, isLoading, error };
}

