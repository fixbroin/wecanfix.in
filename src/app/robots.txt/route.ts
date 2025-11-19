// src/app/robots.txt/route.ts
import { NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/config';

// This tells Next.js to re-evaluate this route on every request,
// ensuring it uses the correct current base URL.
export const dynamic = 'force-dynamic';

export function GET() {
  const baseUrl = getBaseUrl();
  const content = `
User-agent: *
Allow: /

# Disallow admin panel for all crawlers
Disallow: /admin/
Disallow: /admin/*

Sitemap: ${baseUrl}/sitemap.xml
  `.trim();

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate', // Cache for 1 day
    },
  });
}
