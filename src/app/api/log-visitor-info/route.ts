
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import type { FirestoreVisitorInfoLog } from '@/types/firestore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ipData, pathname, userAgent } = body;

    if (!ipData || !pathname || !userAgent) {
      return NextResponse.json({ success: false, error: 'Missing required fields (ipData, pathname, userAgent).' }, { status: 400 });
    }
    
    // Extract relevant fields from ipData, providing fallbacks
    const visitorLog: Omit<FirestoreVisitorInfoLog, 'id' | 'timestamp'> = {
      ipAddress: ipData.ip || 'Unknown IP',
      city: ipData.city || 'Unknown City',
      region: ipData.region || 'Unknown Region',
      countryName: ipData.country_name || ipData.country || 'Unknown Country', // ipapi.co uses country_name
      postalCode: ipData.postal || 'Unknown Postal', // ipapi.co uses postal
      ispOrganization: ipData.org || 'Unknown ISP', // ipapi.co uses org
      pathname: pathname,
      userAgent: userAgent,
    };

    await addDoc(collection(db, 'visitorInfoLogs'), {
      ...visitorLog,
      timestamp: Timestamp.now(),
    });

    return NextResponse.json({ success: true, message: 'Visitor log saved.' });

  } catch (error: any) {
    console.error('Error in /api/log-visitor-info:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while logging visitor.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}

// Optional: Handle other methods if necessary
export async function GET(req: NextRequest) {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export async function PUT(req: NextRequest) {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export async function DELETE(req: NextRequest) {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
