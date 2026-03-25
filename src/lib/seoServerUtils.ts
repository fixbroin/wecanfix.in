// src/lib/seoServerUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { defaultSeoValues } from './seoUtils';
import type { FirestoreSEOSettings } from '@/types/firestore';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

/**
 * Fetches global SEO settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getGlobalSEOSettings = cache(async (): Promise<FirestoreSEOSettings> => {
  return unstable_cache(
    async () => {
      try {
        const settingsDoc = await adminDb.collection('seoSettings').doc('global').get();
        if (settingsDoc.exists) {
          return { ...defaultSeoValues, ...(settingsDoc.data() as FirestoreSEOSettings) };
        }
        return defaultSeoValues;
      } catch (error) {
        console.error('Error fetching global SEO settings via Admin SDK:', error);
        return defaultSeoValues;
      }
    },
    ['global-seo-settings'],
    { 
      revalidate: false, 
      tags: ['seo-settings', 'global-cache'] 
    }
  )();
});
