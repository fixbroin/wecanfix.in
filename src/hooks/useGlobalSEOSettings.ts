"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import type { FirestoreSEOSettings } from '@/types/firestore';
import { defaultSeoValues } from '@/lib/seoUtils';
import { getCache, setCache } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const CACHE_KEY = "global-seo-settings";

export function useGlobalSEOSettings() {
  const [seoSettings, setSeoSettings] = useState<FirestoreSEOSettings>(() => getCache<FirestoreSEOSettings>(CACHE_KEY, true) || defaultSeoValues);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const seoDocRef = doc(db, 'webSettings', 'seoConfiguration');

    if (!isAdmin && hasLoadedRef.current) return;

    if (isAdmin) {
      const unsubscribe = onSnapshot(seoDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = { ...defaultSeoValues, ...docSnap.data() } as FirestoreSEOSettings;
          setSeoSettings(data);
          setCache(CACHE_KEY, data, true);
        }
        setIsLoading(false);
        hasLoadedRef.current = true;
      });
      return () => unsubscribe();
    } else {
      const fetchSEO = async () => {
        const cached = getCache<FirestoreSEOSettings>(CACHE_KEY, true);
        if (cached && !isAdmin) {
            setIsLoading(false);
            return;
        }

        try {
          const docSnap = await getDoc(seoDocRef);
          if (docSnap.exists()) {
            const data = { ...defaultSeoValues, ...docSnap.data() } as FirestoreSEOSettings;
            setSeoSettings(data);
            setCache(CACHE_KEY, data, true);
          }
        } catch (err) {
          console.error("Error fetching SEO settings:", err);
        } finally {
          setIsLoading(false);
          hasLoadedRef.current = true;
        }
      };
      fetchSEO();
    }
  }, [isAdmin]);

  return { seoSettings, isLoading };
}

