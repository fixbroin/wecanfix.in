

import { db } from '@/lib/firebase';
import { collection, Timestamp, doc, setDoc } from 'firebase/firestore'; // Changed addDoc to doc and setDoc
import type { UserActivity, UserActivityEventType, UserActivityEventData } from '@/types/firestore';

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


export const logUserActivity = async (
  eventType: UserActivityEventType,
  eventData: UserActivityEventData,
  userId?: string | null,
  guestId?: string | null
): Promise<void> => {
  if (!userId && !guestId) {
    return;
  }

  try {
    const activityData: Omit<UserActivity, 'id'> = {
      userId: userId || null,
      guestId: guestId || null,
      eventType,
      eventData: removeUndefinedProps(eventData), // Clean the eventData object
      timestamp: Timestamp.now(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
    };

    const userActivitiesCollectionRef = collection(db, 'userActivities');
    const newActivityDocRef = doc(userActivitiesCollectionRef); // Create a new doc ref with auto-generated ID
    await setDoc(newActivityDocRef, activityData); // Use setDoc with the new reference

  } catch (error) {
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
