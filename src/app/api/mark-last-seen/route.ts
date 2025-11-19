
import { type NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/lib/firebase-admin';

// This API route is designed to be called by navigator.sendBeacon,
// which is a reliable way to send a small amount of data from a browser
// just before a page unloads.

export async function POST(req: NextRequest) {
  try {
    // navigator.sendBeacon sends data as a blob, so we need to parse it.
    // The 'text()' method can handle various content types that resolve to text, like application/json.
    const bodyText = await req.text();
    const { uid, ts } = JSON.parse(bodyText);

    if (!uid || typeof uid !== 'string' || !ts || typeof ts !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid payload. Required: uid (string), ts (number).' }, { status: 400 });
    }

    // Initialize Firebase Admin SDK to perform a server-side write.
    // This is crucial because standard client-side SDK might not complete before the page unloads.
    initFirebaseAdmin();
    const db = getFirestore();

    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.update({
      lastLoginAt: Timestamp.fromMillis(ts),
    });
    
    // sendBeacon does not process responses, so this is mainly for debugging.
    // A 204 No Content is a common success response for beacon APIs.
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error('Error in /api/mark-last-seen:', error);
    // Again, the client won't see this, but it's good for server logs.
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
