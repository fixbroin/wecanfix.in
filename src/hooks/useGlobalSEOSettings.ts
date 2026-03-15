"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { FirestoreSEOSettings } from '@/types/firestore';
import { defaultSeoValues } from '@/lib/seoUtils';

export function useGlobalSEOSettings() {
  const [seoSettings, setSeoSettings] = useState<FirestoreSEOSettings>(defaultSeoValues);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const seoDocRef = doc(db, 'webSettings', 'seoConfiguration');
    const unsubscribe = onSnapshot(seoDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setSeoSettings({ ...defaultSeoValues, ...docSnap.data() } as FirestoreSEOSettings);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { seoSettings, isLoading };
}
