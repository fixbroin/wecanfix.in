import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import type { FirestoreVisitorInfoLog } from '@/types/firestore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ipData, pathname, userAgent } = body;

    if (!ipData || !pathname || !userAgent) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }
    
    const visitorLog: Omit<FirestoreVisitorInfoLog, 'id' | 'timestamp'> = {
      ipAddress: ipData.ip || 'Unknown IP',
      city: ipData.city || 'Unknown City',
      region: ipData.region || 'Unknown Region',
      countryName: ipData.country_name || ipData.country || 'Unknown Country',
      postalCode: ipData.postal || 'Unknown Postal',
      ispOrganization: ipData.org || 'Unknown ISP',
      pathname: pathname,
      userAgent: userAgent,
    };

    await addDoc(collection(db, 'visitorInfoLogs'), {
      ...visitorLog,
      timestamp: Timestamp.now(),
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error in /api/log-visitor-info:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
