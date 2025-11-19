
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { MarketingSettings, FirebaseClientConfig } from '@/types/firestore';

const MARKETING_CONFIG_COLLECTION = "webSettings";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";

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
  const [settings, setSettings] = useState<MarketingSettings>(defaultMarketingValues);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const settingsDocRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);

    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<MarketingSettings>;
        const mergedSettings: MarketingSettings = {
          ...defaultMarketingValues,
          ...firestoreData,
          metaConversionApi: { ...defaultMarketingValues.metaConversionApi, ...firestoreData.metaConversionApi },
          googleMerchantCenter: { ...defaultMarketingValues.googleMerchantCenter, ...firestoreData.googleMerchantCenter },
          facebookCatalog: { ...defaultMarketingValues.facebookCatalog, ...firestoreData.facebookCatalog },
          firebaseClientConfig: { ...defaultFirebaseClientConfigValues, ...firestoreData.firebaseClientConfig },
        };
        setSettings(mergedSettings);
        setError(null);
      } else {
        setSettings(defaultMarketingValues);
        setError(null); 
        console.warn(`Marketing settings document '${MARKETING_CONFIG_DOC_ID}' not found. Using default values.`);
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching marketing settings:", err);
      setError("Failed to load marketing settings.");
      setSettings(defaultMarketingValues); 
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { settings, isLoading, error };
}
