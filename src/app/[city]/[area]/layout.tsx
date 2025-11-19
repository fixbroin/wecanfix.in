
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreArea, FirestoreCity, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

interface AreaPageLayoutProps {
  params: { city: string; area: string };
  children: React.ReactNode;
}

async function getAreaData(citySlug: string, areaSlug: string): Promise<(FirestoreArea & { parentCityData?: FirestoreCity }) | null> {
  try {
    const citiesRef = adminDb.collection('cities');
    const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const citySnapshot = await cityQuery.get();

    if (citySnapshot.empty) {
      return null;
    }
    const parentCityData = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;

    const areasRef = adminDb.collection('areas');
    const areaQuery = areasRef
      .where('slug', '==', areaSlug)
      .where('cityId', '==', parentCityData.id)
      .where('isActive', '==', true)
      .limit(1);
    const areaSnapshot = await areaQuery.get();

    if (areaSnapshot.empty) {
      return null;
    }
    const doc = areaSnapshot.docs[0];
    const areaData = { id: doc.id, ...doc.data() } as FirestoreArea;
    return { ...areaData, parentCityData };

  } catch (error) {
    console.error(`[AreaLayout] Error fetching area data for city "${citySlug}", area "${areaSlug}":`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
  try {
    const settingsDocRef = adminDb.collection("webSettings").doc("global");
    const docSnap = await settingsDocRef.get();
    if (docSnap.exists) {
      return docSnap.data() as GlobalWebSettings;
    }
    return null;
  } catch (error) {
    console.error("[AreaLayout] Error fetching global web settings for metadata:", error);
    return null;
  }
}

export async function generateMetadata(
  { params }: AreaPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;
  const { city: citySlug, area: areaSlug } = await params;

  if (citySlug.includes('.') || areaSlug.includes('.')) {
    return {
      title: 'Not Found',
      description: 'The requested resource was not found.',
    };
  }

  const areaData = await getAreaData(citySlug, areaSlug);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Wecanfix";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); 

  if (!areaData || !areaData.parentCityData) {
    return {
      title: `Area Not Found${defaultSuffix}`,
      description: 'The area page you are looking for does not exist.',
    };
  }

  const placeholderData = {
    areaName: areaData.name,
    cityName: areaData.parentCityData.name,
    siteName: siteName,
  };

  // Use area's direct SEO fields first, then fall back to patterns
  const title = areaData.seo_title?.trim() ? areaData.seo_title :
                replacePlaceholders(seoSettings.areaPageTitlePattern, placeholderData) || 
                `${areaData.name}, ${areaData.parentCityData.name}${defaultSuffix}`;

  const description = areaData.seo_description?.trim() ? areaData.seo_description :
                      replacePlaceholders(seoSettings.areaPageDescriptionPattern, placeholderData) || 
                      `Find home services in ${areaData.name}, ${areaData.parentCityData.name}. ${seoSettings.defaultMetaDescription}`;
                      
  const keywordsStr = areaData.seo_keywords?.trim() ? areaData.seo_keywords :
                      replacePlaceholders(seoSettings.areaPageKeywordsPattern, placeholderData) || 
                      seoSettings.defaultMetaKeywords;
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${citySlug}/${areaSlug}`;

  return {
    title,
    description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: ogImage ? [{ url: ogImage }] : [],
      siteName: siteName,
      type: 'website',
    },
  };
}

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
