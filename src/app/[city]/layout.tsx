
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCity, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

interface CityPageLayoutProps {
  params: { city: string };
  children: React.ReactNode;
}

// Function to fetch city data by slug
async function getCityData(slug: string): Promise<FirestoreCity | null> {
  try {
    if (slug.includes('.')) { 
      return null;
    }
    const citiesRef = adminDb.collection('cities');
    const q = citiesRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
        return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCity;
  } catch (error) {
    console.error(`[CityLayout] Error fetching city data for slug "${slug}":`, error);
    return null;
  }
}

// Function to fetch global web settings (e.g., for OG image)
async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = adminDb.collection("webSettings").doc("global");
        const docSnap = await settingsDocRef.get();
        if (docSnap.exists) {
            return docSnap.data() as GlobalWebSettings;
        }
        return null;
    } catch (error) {
        console.error("[CityLayout] Error fetching global web settings for metadata:", error);
        return null;
    }
}


export async function generateMetadata(
  { params }: CityPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;
  const { city: citySlug } = await params;

  if (citySlug.includes('.')) { 
    return {
      title: 'Not Found',
      description: 'The requested resource was not found.',
    };
  }
  const cityData = await getCityData(citySlug);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Wecanfix";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); 

  if (!cityData) {
    return {
      title: `City Not Found${defaultSuffix}`,
      description: 'The city page you are looking for does not exist.',
    };
  }
  
  const placeholderData = { cityName: cityData.name, siteName: siteName };

  const title = cityData.seo_title?.trim()
                ? cityData.seo_title
                : replacePlaceholders(seoSettings.homepageMetaTitle, placeholderData) || `${cityData.name} Home Services${defaultSuffix}`;

  const description = cityData.seo_description?.trim()
                    ? cityData.seo_description
                    : replacePlaceholders(seoSettings.homepageMetaDescription, placeholderData) || `Find top home services in ${cityData.name}. ${seoSettings.defaultMetaDescription}`;

  const keywordsStr = cityData.seo_keywords?.trim()
                    ? cityData.seo_keywords
                    : replacePlaceholders(seoSettings.homepageMetaKeywords, placeholderData) || seoSettings.defaultMetaKeywords;
                    
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${citySlug}`;

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

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
