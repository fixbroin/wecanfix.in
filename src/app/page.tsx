import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin'; // Corrected import
import type { GlobalWebSettings, FirestoreSEOSettings } from '@/types/firestore';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import HomePageClient from '@/components/home/HomePageClient';
import { getBaseUrl } from '@/lib/config';
import { getHomepageData, getAggregateRating } from '@/lib/homepageUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';

export const revalidate = 3600; // Revalidate every hour

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
  try {
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
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}`,
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

export default async function Page() {
  const [homepageData, aggregateRating] = await Promise.all([
    getHomepageData(),
    getAggregateRating()
  ]);

  const appBaseUrl = getBaseUrl();
  const siteName = homepageData.seoSettings.siteName || 'Wecanfix';

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": siteName,
    "url": appBaseUrl,
    "logo": `${appBaseUrl}/android-chrome-512x512.png`,
    "description": homepageData.seoSettings.homepageMetaDescription,
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": homepageData.seoSettings.structuredDataTelephone,
      "contactType": "customer service"
    }
  };

  if (aggregateRating) {
    (organizationSchema as any).aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": aggregateRating.ratingValue,
      "reviewCount": aggregateRating.reviewCount,
      "bestRating": "5",
      "worstRating": "1"
    };
  }

  return (
    <>
      <JsonLdScript data={organizationSchema} idSuffix="homepage-org" />
      <HomePageClient initialData={homepageData} />
    </>
  );
}
