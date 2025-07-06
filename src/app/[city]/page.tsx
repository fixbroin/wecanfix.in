
import type { Metadata, ResolvingMetadata } from 'next';
import HomePageClient from '@/components/home/HomePageClient';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, limit, doc, getDoc as getFirestoreDoc } from 'firebase/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import type { GlobalWebSettings, FirestoreCity } from '@/types/firestore';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { defaultSeoValues } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config'; // Import the helper

export const dynamic = 'force-dynamic'; // Ensure metadata is fetched on each request

interface CityPageProps {
  params: { city: string };
}

// Function to fetch city data by slug
async function getCityData(slug: string): Promise<FirestoreCity | null> {
  try {
    if (slug.includes('.')) { // Basic check for file-like names
      // console.warn(`[CityPage] getCityData: Attempted to fetch city with invalid slug: ${slug}`);
      return null;
    }
    const citiesRef = collection(db, 'cities');
    const q = query(citiesRef, where('slug', '==', slug), where('isActive', '==', true), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        // console.warn(`[CityPage] getCityData: City with slug "${slug}" not found or inactive.`);
        return null;
    }
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreCity;
  } catch (error) {
    console.error(`[CityPage] getCityData: Error fetching city data for slug "${slug}":`, error);
    return null;
  }
}

// Function to fetch global web settings (e.g., for OG image)
async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = doc(db, "webSettings", "global");
        const docSnap = await getFirestoreDoc(settingsDocRef);
        if (docSnap.exists()) {
            return docSnap.data() as GlobalWebSettings;
        }
        return null;
    } catch (error) {
        console.error("Error fetching global web settings for metadata:", error);
        return null;
    }
}


export async function generateMetadata(
  { params }: CityPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  if (params.city.includes('.')) { // Basic check for file-like names
    // console.warn(`[CityPage] generateMetadata: Attempted to generate metadata for invalid slug: ${params.city}`);
    return {
      title: 'Not Found',
      description: 'The requested resource was not found.',
    };
  }
  const cityData = await getCityData(params.city);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "FixBro";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); // Use the helper

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
  const ogImage = ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-og-image.png`;
  const canonicalUrl = `${appBaseUrl}/${params.city}`;

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

export async function generateStaticParams() {
   try {
    const citiesSnapshot = await getDocs(query(collection(db, 'cities'), where('isActive', '==', true)));
    const paths = citiesSnapshot.docs.map(doc => ({
      city: (doc.data() as FirestoreCity).slug as string,
    }));
    return paths.filter(p => p.city && !p.city.includes('.')); // Ensure slug is present and not file-like
  } catch (error) {
    console.error("Error generating static params for city pages:", error);
    return [];
  }
}

export default async function CityHomePage({ params }: CityPageProps) {
  if (params.city.includes('.')) {
    // console.warn(`[CityPage] Page: Attempted to render page for invalid slug: ${params.city}`);
    // This case should ideally be handled by Next.js routing if favicon is in public,
    // or by a more specific not-found component if truly a 404 for a "city".
    return (
        <div className="container mx-auto px-4 py-8 text-center">
            Resource not found.
        </div>
    );
  }
  const cityData = await getCityData(params.city);
  
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (cityData) {
    breadcrumbItems.push({ label: cityData.name });
  } else {
    breadcrumbItems.push({ label: "City Not Found" });
  }

  return (
    <>
      <div className="container mx-auto px-4 pt-4 md:pt-6">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <HomePageClient citySlug={params.city} />
    </>
  );
}
