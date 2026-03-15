// src/lib/serializeUtils.ts

/**
 * Serializes data to a JSON-safe object.
 * Converts Firestore Timestamps (both client and admin) to ISO strings.
 */
export function serializeFirestoreData<T>(data: any): T {
    if (data === null || data === undefined) return data;
    
    // Check for both firebase-admin and firebase client Timestamps
    // Most Timestamps have a toDate() method
    if (typeof data.toDate === 'function' && (data.seconds !== undefined || data._seconds !== undefined)) {
        return data.toDate().toISOString() as any;
    }
    
    if (Array.isArray(data)) {
        return data.map(item => serializeFirestoreData(item)) as any;
    }
    
    if (typeof data === 'object') {
        const serialized: any = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                serialized[key] = serializeFirestoreData(data[key]);
            }
        }
        return serialized as T;
    }
    
    return data;
}
