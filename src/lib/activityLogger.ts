
import { db } from '@/lib/firebase';
import { collection, Timestamp, doc, setDoc, getDoc } from 'firebase/firestore'; 
import type { UserActivity, UserActivityEventType, UserActivityEventData, FeaturesConfiguration } from '@/types/firestore';

// Helper function to remove undefined properties from an object recursively
const removeUndefinedProps = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedProps);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = removeUndefinedProps(value);
      }
      return acc;
    }, {} as Record<string, any>);
  }
  return obj;
};

// Simple cache for logging enabled state to avoid excessive Firestore reads
let isLoggingEnabledCache: boolean | null = null;
let lastCacheUpdate: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const checkIsLoggingEnabled = async (): Promise<boolean> => {
    const now = Date.now();
    if (isLoggingEnabledCache !== null && (now - lastCacheUpdate < CACHE_TTL)) {
        return isLoggingEnabledCache;
    }

    try {
        const configDocRef = doc(db, 'webSettings', 'featuresConfiguration');
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data() as FeaturesConfiguration;
            isLoggingEnabledCache = data.enableUserActivityLogging !== false; // Default to true if not set
        } else {
            isLoggingEnabledCache = true; // Default to true if doc doesn't exist
        }
        lastCacheUpdate = now;
        return isLoggingEnabledCache;
    } catch (error) {
        console.error("ActivityLogger: Error checking enabled state:", error);
        return true; // Default to true on error to not miss logs unless explicitly disabled
    }
};

import { triggerRefresh } from './revalidateUtils';

export const logUserActivity = async (
  eventType: UserActivityEventType,
  eventData: UserActivityEventData,
  userId?: string | null,
  guestId?: string | null,
  userDisplayName?: string | null
): Promise<void> => {
  if (!userId && !guestId) {
    return;
  }

  // Check if logging is enabled in Admin Panel
  const isEnabled = await checkIsLoggingEnabled();
  if (!isEnabled) {
      return;
  }

  try {
    // Denormalize: Include name directly to save reads later
    const finalDisplayName = userDisplayName || eventData.fullName || (userId ? "Registered User" : "Guest User");

    const activityData: any = {
      userId: userId || null,
      guestId: guestId || null,
      userDisplayName: finalDisplayName,
      eventType,
      eventData: removeUndefinedProps(eventData),
      timestamp: Timestamp.now(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
    };

    const userActivitiesCollectionRef = collection(db, 'userActivities');
    const newActivityDocRef = doc(userActivitiesCollectionRef);
    await setDoc(newActivityDocRef, activityData);

    // Smart Sync: If it's a major event, tell the server to refresh the activity cache
    if (['newBooking', 'newUser', 'userLogin'].includes(eventType)) {
        await triggerRefresh('users');
    }

  } catch (error) {
    // ... existing error logging ...

    // Log the raw error object first for better inspection in browser console
    console.error('Raw error object from Firestore setDoc in activityLogger:', error);
    
    // Then log the structured error message
    console.error(
      'Error logging user activity to Firestore (using setDoc):', 
      JSON.stringify({ 
        error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack?.substring(0, 500) } : String(error), 
        eventType, 
        // Ensure eventData is serializable and not too large for logs
        eventData: typeof eventData === 'object' ? JSON.parse(JSON.stringify(eventData, (key, value) => 
          typeof value === 'string' && value.length > 100 ? value.substring(0,100) + '...' : value
        )) : eventData,
        userId, 
        guestId 
      }, null, 2)
    );
  }
};
