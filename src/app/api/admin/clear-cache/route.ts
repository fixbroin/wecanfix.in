
import { type NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { adminAuth } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    // 1. Security Check: Only allow Admins
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // Check if user has admin role (assuming you have custom claims or a way to verify admin)
    // For now, we verify the token is valid. You might want to add: if (!decodedToken.admin) ...
    
    const { tag } = await req.json();

    if (!tag) {
      return NextResponse.json({ error: 'Tag is required' }, { status: 400 });
    }

    // 2. Revalidate the requested tag
    // If tag is 'all', we use our master key 'global-cache'
    const tagToRevalidate = tag === 'all' ? 'global-cache' : tag;
    
    revalidateTag(tagToRevalidate);

    console.log(`[Cache] Revalidated tag: ${tagToRevalidate} by admin ${decodedToken.uid}`);

    return NextResponse.json({ 
      success: true, 
      message: `Cache for tag "${tagToRevalidate}" has been cleared.` 
    });

  } catch (error: any) {
    console.error('Error clearing cache:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
