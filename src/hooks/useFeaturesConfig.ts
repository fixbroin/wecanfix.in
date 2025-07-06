
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { FeaturesConfiguration } from '@/types/firestore';

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: false, // Default to false
  homepageCategoryVisibility: {},
  ads: [],
};

interface UseFeaturesConfigReturn {
  featuresConfig: FeaturesConfiguration;
  isLoading: boolean;
}

export function useFeaturesConfig(): UseFeaturesConfigReturn {
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(defaultFeaturesConfig);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);

    const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<FeaturesConfiguration>;
        setFeaturesConfig({ ...defaultFeaturesConfig, ...firestoreData });
      } else {
        setFeaturesConfig(defaultFeaturesConfig);
        console.warn(`Features config document '${FEATURES_CONFIG_DOC_ID}' not found. Using default values.`);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching features configuration:", error);
      setFeaturesConfig(defaultFeaturesConfig);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { featuresConfig, isLoading };
}
