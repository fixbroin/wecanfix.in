

"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { AppSettings, PlatformFeeSetting, DayAvailability } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";

interface UseApplicationConfigReturn {
  config: AppSettings;
  isLoading: boolean;
  error: string | null;
}

export function useApplicationConfig(): UseApplicationConfigReturn {
  const [config, setConfig] = useState<AppSettings>(defaultAppSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const configDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);

    const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<AppSettings>;
        
        const mergedSettings: AppSettings = {
          ...defaultAppSettings,
          ...firestoreData, // Overwrite defaults with Firestore data
          timeSlotSettings: { // Deep merge for timeSlotSettings
            ...defaultAppSettings.timeSlotSettings,
            ...(firestoreData.timeSlotSettings || {}),
            weeklyAvailability: {
                ...defaultAppSettings.timeSlotSettings.weeklyAvailability,
                ...(firestoreData.timeSlotSettings?.weeklyAvailability || {}),
            }
          },
          // Ensure platformFees is an array, defaulting to empty if not present in Firestore
          platformFees: firestoreData.platformFees || defaultAppSettings.platformFees || [],
          // Ensure cancellation policy settings are merged correctly
          enableCancellationPolicy: typeof firestoreData.enableCancellationPolicy === 'boolean' ? firestoreData.enableCancellationPolicy : defaultAppSettings.enableCancellationPolicy,
          freeCancellationDays: firestoreData.freeCancellationDays ?? defaultAppSettings.freeCancellationDays,
          freeCancellationHours: firestoreData.freeCancellationHours ?? defaultAppSettings.freeCancellationHours,
          freeCancellationMinutes: firestoreData.freeCancellationMinutes ?? defaultAppSettings.freeCancellationMinutes,
          cancellationFeeType: firestoreData.cancellationFeeType ?? defaultAppSettings.cancellationFeeType,
          cancellationFeeValue: firestoreData.cancellationFeeValue ?? defaultAppSettings.cancellationFeeValue,
          isProviderRegistrationEnabled: typeof firestoreData.isProviderRegistrationEnabled === 'boolean' ? firestoreData.isProviderRegistrationEnabled : defaultAppSettings.isProviderRegistrationEnabled,
          // Merge login settings
          enableEmailPasswordLogin: typeof firestoreData.enableEmailPasswordLogin === 'boolean' ? firestoreData.enableEmailPasswordLogin : defaultAppSettings.enableEmailPasswordLogin,
          enableOtpLogin: typeof firestoreData.enableOtpLogin === 'boolean' ? firestoreData.enableOtpLogin : defaultAppSettings.enableOtpLogin,
          enableGoogleLogin: typeof firestoreData.enableGoogleLogin === 'boolean' ? firestoreData.enableGoogleLogin : defaultAppSettings.enableGoogleLogin,
          defaultLoginMethod: firestoreData.defaultLoginMethod ?? defaultAppSettings.defaultLoginMethod,
          defaultOtpCountryCode: firestoreData.defaultOtpCountryCode ?? defaultAppSettings.defaultOtpCountryCode,
          isReferralSystemEnabled: typeof firestoreData.isReferralSystemEnabled === 'boolean' ? firestoreData.isReferralSystemEnabled : defaultAppSettings.isReferralSystemEnabled,
        };
        setConfig(mergedSettings);
        setError(null);
      } else {
        setConfig(defaultAppSettings);
        setError(null); 
        console.warn('Application config document \'' + APP_CONFIG_DOC_ID + '\' not found. Using default settings.');
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching application config:", err);
      setError("Failed to load application settings.");
      setConfig(defaultAppSettings); 
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { config, isLoading, error };
}

    
