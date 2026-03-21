// src/lib/revalidateUtils.ts
'use server';

import { revalidateTag } from 'next/cache';

/**
 * Smart Trigger: Tells the server to clear the cache for specific data
 * so that the next request pulls fresh data from Firestore.
 */
export async function triggerRefresh(tag: 'services' | 'categories' | 'cities' | 'bookings' | 'users' | 'content' | 'blog' | 'global' | 'withdrawal-referral-config' | 'withdrawal-provider-config') {
  try {
    revalidateTag(tag);
    console.log(`[SmartSync] Cache invalidated for tag: ${tag}`);
    return { success: true };
  } catch (error) {
    console.error(`[SmartSync] Failed to invalidate tag: ${tag}`, error);
    return { success: false };
  }
}
