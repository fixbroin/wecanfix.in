
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { FeaturesConfiguration, MarketingAutomationSettings } from '@/types/firestore'; // Import MarketingAutomationSettings

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation"; // Added

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: true, // Changed default to true
  homepageCategoryVisibility: {},
  ads: [],
};

// Combined type for the hook's return value
interface UseFeaturesAndAutomationConfigReturn {
  featuresConfig: FeaturesConfiguration;
  marketingConfig: MarketingAutomationSettings | null;
  isLoading: boolean;
}

export function useFeaturesConfig(): UseFeaturesAndAutomationConfigReturn {
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(defaultFeaturesConfig);
  const [marketingConfig, setMarketingConfig] = useState<MarketingAutomationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let featuresUnsubscribe: () => void;
    let marketingUnsubscribe: () => void;

    const fetchConfigs = () => {
      setIsLoading(true);

      const featuresConfigRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      featuresUnsubscribe = onSnapshot(featuresConfigRef, (docSnap) => {
        if (docSnap.exists()) {
          const firestoreData = docSnap.data() as Partial<FeaturesConfiguration>;
          setFeaturesConfig({ ...defaultFeaturesConfig, ...firestoreData });
        } else {
          setFeaturesConfig(defaultFeaturesConfig);
        }
      }, (error) => {
        console.error("Error fetching features configuration:", error);
        setFeaturesConfig(defaultFeaturesConfig);
      });

      const marketingConfigRef = doc(db, FEATURES_CONFIG_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      marketingUnsubscribe = onSnapshot(marketingConfigRef, (docSnap) => {
        if (docSnap.exists()) {
          setMarketingConfig(docSnap.data() as MarketingAutomationSettings);
        } else {
          setMarketingConfig(null);
        }
      }, (error) => {
        console.error("Error fetching marketing automation configuration:", error);
        setMarketingConfig(null);
      });
      
      // Consider loading complete after both have had a chance to fetch.
      // A more robust solution might use Promise.all if it was a one-time fetch.
      // With onSnapshot, we can set loading to false after the first snapshot of both.
      let featuresLoaded = false;
      let marketingLoaded = false;
      const checkLoadingDone = () => {
          if (featuresLoaded && marketingLoaded) {
              setIsLoading(false);
          }
      };

      const featuresUnsub = onSnapshot(featuresConfigRef, () => { featuresLoaded = true; checkLoadingDone(); });
      const marketingUnsub = onSnapshot(marketingConfigRef, () => { marketingLoaded = true; checkLoadingDone(); });

      // Need to re-assign the main unsubscribes for cleanup
      featuresUnsubscribe = featuresUnsub;
      marketingUnsubscribe = marketingUnsub;
    };
    
    fetchConfigs();

    return () => {
      if (featuresUnsubscribe) featuresUnsubscribe();
      if (marketingUnsubscribe) marketingUnsubscribe();
    };
  }, []);

  return { featuresConfig, marketingConfig, isLoading };
}
