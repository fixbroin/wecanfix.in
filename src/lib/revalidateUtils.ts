// src/lib/revalidateUtils.ts
'use server';

import { revalidateTag } from 'next/cache';
import { adminDb } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Smart Trigger: Tells the server to clear the cache for specific data
 * so that the next request pulls fresh data from Firestore.
 * Also increments the global cache version in Firestore to signal clients.
 */
export async function triggerRefresh(tag: 'services' | 'categories' | 'cities' | 'bookings' | 'users' | 'content' | 'blog' | 'global' | 'withdrawal-referral-config' | 'withdrawal-provider-config' | string) {
  try {
    revalidateTag(tag);
    
    // Bump the global cache version (1 write)
    // This tells every browser in the world: "Data has changed, re-read now."
    const versionDoc = adminDb.collection('appConfiguration').doc('cacheVersions');
    await versionDoc.set({
        [tag]: FieldValue.increment(1),
        global: FieldValue.increment(1),
        updatedAt: new Date()
    }, { merge: true });

    console.log(`[SmartSync] Cache invalidated for tag: ${tag} and version bumped.`);
    return { success: true };
  } catch (error) {
    console.error(`[SmartSync] Failed to invalidate tag: ${tag}`, error);
    return { success: false };
  }
}
