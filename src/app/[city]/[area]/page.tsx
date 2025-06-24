
import type { Metadata, ResolvingMetadata } from 'next';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FirestoreArea, FirestoreCity, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import HomePageClient from '@/components/home/HomePageClient';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { getBaseUrl } from '@/lib/config'; 

export const dynamic = 'force-dynamic'; 

interface AreaPageProps {
  params: { city: string; area: string };
}

async function getAreaData(citySlug: string, areaSlug: string): Promise<(FirestoreArea & { parentCityData?: FirestoreCity }) | null> {
  try {
    const citiesRef = collection(db, 'cities');
    const cityQuery = query(citiesRef, where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
    const citySnapshot = await getDocs(cityQuery);

    if (citySnapshot.empty) {
      return null;
    }
    const parentCityData = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;

    const areasRef = collection(db, 'areas');
    const areaQuery = query(
      areasRef,
      where('slug', '==', areaSlug),
      where('cityId', '==', parentCityData.id),
      where('isActive', '==', true),
      limit(1)
    );
    const areaSnapshot = await getDocs(areaQuery);

    if (areaSnapshot.empty) {
      return null;
    }
    const areaData = { id: areaSnapshot.docs[0].id, ...areaSnapshot.docs[0].data() } as FirestoreArea;
    return { ...areaData, parentCityData };

  } catch (error) {
    console.error(`Error fetching area data for city "${citySlug}", area "${areaSlug}":`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
  try {
    const settingsDocRef = doc(db, "webSettings", "global");
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as GlobalWebSettings;
    }
    return null;
  } catch (error) {
    console.error("Error fetching global web settings for area metadata:", error);
    return null;
  }
}

export async function generateMetadata(
  { params }: AreaPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const areaData = await getAreaData(params.city, params.area);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "FixBro";
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
  const ogImage = ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-og-image.png`;
  const canonicalUrl = `${appBaseUrl}/${params.city}/${params.area}`;

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
    const paramsArray: { city: string; area: string }[] = [];

    for (const cityDoc of citiesSnapshot.docs) {
      const cityData = cityDoc.data() as FirestoreCity;
      if (!cityData.slug) continue; 
      const areasQuery = query(
        collection(db, 'areas'),
        where('cityId', '==', cityDoc.id),
        where('isActive', '==', true)
      );
      const areasSnapshot = await getDocs(areasQuery);
      areasSnapshot.docs.forEach(areaDoc => {
        const areaData = areaDoc.data() as FirestoreArea;
        if (areaData.slug) { 
          paramsArray.push({ city: cityData.slug!, area: areaData.slug });
        }
      });
    }
    return paramsArray;
  } catch (error) {
    console.error("Error generating static params for area pages:", error);
    return [];
  }
}

export default async function AreaHomePage({ params }: AreaPageProps) {
  const areaData = await getAreaData(params.city, params.area);
  
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (areaData && areaData.parentCityData) {
    breadcrumbItems.push({ label: areaData.parentCityData.name, href: `/${params.city}` });
    breadcrumbItems.push({ label: areaData.name });
  } else if (areaData) { 
    // Fallback if parentCityData is somehow missing but areaData exists
    breadcrumbItems.push({ label: params.city.charAt(0).toUpperCase() + params.city.slice(1) , href: `/${params.city}` }); 
    breadcrumbItems.push({ label: areaData.name });
  } else {
    breadcrumbItems.push({ label: "Location Not Found" });
  }

  return (
    <>
      <HomePageClient citySlug={params.city} areaSlug={params.area} breadcrumbItems={breadcrumbItems} />
    </>
  );
}
