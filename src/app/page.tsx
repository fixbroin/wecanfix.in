
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin'; // Corrected import
import type { GlobalWebSettings, FirestoreSEOSettings } from '@/types/firestore';
import { getGlobalSEOSettings } from '@/lib/seoUtils';
import HomePageClient from '@/components/home/HomePageClient';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
  try {
    // Corrected to use adminDb
    const settingsDocRef = adminDb.collection("webSettings").doc("global");
    const docSnap = await settingsDocRef.get();
    if (docSnap.exists) {
      return docSnap.data() as GlobalWebSettings;
    }
    return null;
  } catch (error) {
    console.error("Error fetching global web settings for metadata:", error);
    return null;
  }
}

export async function generateMetadata(
  _: {}, 
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;
  
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const appBaseUrl = getBaseUrl();

  const title = seoSettings.homepageMetaTitle || seoSettings.siteName || 'Wecanfix';
  const description = seoSettings.homepageMetaDescription || seoSettings.defaultMetaDescription || '';
  const keywords = (seoSettings.homepageMetaKeywords || seoSettings.defaultMetaKeywords || '').split(',').map(k => k.trim()).filter(k => k);

  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;

  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || 'Wecanfix';

  return {
    title: title,
    description: description,
    keywords: keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: '/',
    },
    openGraph: {
      title: title,
      description: description,
      url: '/',
      images: ogImage ? [{ url: ogImage }] : [],
      siteName: siteName,
      type: 'website',
    },
  };
}

export default function Page() {
  return <HomePageClient />;
}
