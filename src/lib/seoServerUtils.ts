// src/lib/seoServerUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { defaultSeoValues } from './seoUtils';
import type { FirestoreSEOSettings } from '@/types/firestore';
import { cache } from 'react';

/**
 * Fetches global SEO settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 */
export const getGlobalSEOSettings = cache(async (): Promise<FirestoreSEOSettings> => {
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
});
