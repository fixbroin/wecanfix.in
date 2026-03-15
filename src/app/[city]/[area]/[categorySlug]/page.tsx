import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreArea } from '@/types/firestore';
import CategoryPageClient from '@/components/category/CategoryPageClient';
import type { BreadcrumbItem } from '@/types/ui';
import { notFound } from 'next/navigation';
import type { Metadata, ResolvingMetadata } from 'next';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import JsonLdScript from '@/components/shared/JsonLdScript';

export const dynamic = 'force-dynamic';

interface AreaCategoryPageProps {
  params: Promise<{ city: string; area: string; categorySlug: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

async function getCityData(citySlug: string): Promise<FirestoreCity | null> {
  try {
    if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.')) return null;
    const citiesRef = adminDb.collection('cities');
    const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const citySnapshot = await cityQuery.get();
    if (citySnapshot.empty) return null;
    const doc = citySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCity;
  } catch (error) {
    console.error(`[AreaCategoryPage] Page: Error fetching city data:`, error);
    return null;
  }
}

async function getAreaData(cityId: string, areaSlug: string): Promise<FirestoreArea | null> {
  try {
    if (areaSlug.includes('.')) return null;
    const areasRef = adminDb.collection('areas');
    const areaQuery = areasRef.where('cityId', '==', cityId).where('slug', '==', areaSlug).where('isActive', '==', true).limit(1);
    const areaSnapshot = await areaQuery.get();
    if (areaSnapshot.empty) return null;
    const doc = areaSnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreArea;
  } catch (error) {
    console.error(`[AreaCategoryPage] Page: Error fetching area data:`, error);
    return null;
  }
}

async function getCategoryData(categorySlug: string): Promise<FirestoreCategory | null> {
  try {
    if (categorySlug.includes('.')) return null;
    const categoriesRef = adminDb.collection('adminCategories');
    const categoryQuery = categoriesRef.where('slug', '==', categorySlug).limit(1);
    const categorySnapshot = await categoryQuery.get();
    if (categorySnapshot.empty) return null;
    const doc = categorySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCategory;
  } catch (error) {
    console.error(`[AreaCategoryPage] Page: Error fetching category data:`, error);
    return null;
  }
}

export async function generateMetadata(
  { params }: AreaCategoryPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug, area: areaSlug, categorySlug } = await params;
  const cityData = await getCityData(citySlug);
  const areaData = cityData ? await getAreaData(cityData.id, areaSlug) : null;
  const categoryData = await getCategoryData(categorySlug);
  
  if (!cityData || !areaData || !categoryData) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const placeholderData = { cityName: cityData.name, areaName: areaData.name, categoryName: categoryData.name };

  const title = replacePlaceholders(categoryData.metaTitle || seoSettings.areaCategoryPageTitlePattern, placeholderData) || `${categoryData.name} in ${areaData.name}, ${cityData.name} | Wecanfix`;
  const description = replacePlaceholders(categoryData.metaDescription || seoSettings.areaCategoryPageDescriptionPattern, placeholderData) || `Expert ${categoryData.name} services in ${areaData.name}, ${cityData.name}. Reliable and professional home services by Wecanfix.`;
  const keywords = replacePlaceholders(categoryData.metaKeywords || seoSettings.areaCategoryPageKeywordsPattern, placeholderData).split(',').map(k => k.trim()).filter(k => k);

  const ogImage = categoryData.imageUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;

  return {
    title: title,
    description: description,
    keywords: keywords.length > 0 ? keywords : undefined,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}/${citySlug}/${areaSlug}/${categorySlug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/${citySlug}/${areaSlug}/${categorySlug}`,
      images: [{ url: ogImage }],
      type: 'website',
    },
  };
}

export default async function AreaCategoryPage({ params }: AreaCategoryPageProps) {
  const { city: citySlug, area: areaSlug, categorySlug: catSlug } = await params;

  if (RESERVED_SLUGS.includes(citySlug)) {
    notFound();
  }

  const cityData = await getCityData(citySlug);
  const areaData = cityData ? await getAreaData(cityData.id, areaSlug) : null;
  const categoryData = await getCategoryData(catSlug);

  if (!cityData || !areaData || !categoryData) {
    notFound();
  }

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  breadcrumbItems.push({ label: cityData.name, href: `/${citySlug}` });
  breadcrumbItems.push({ label: areaData.name, href: `/${citySlug}/${areaSlug}` });
  breadcrumbItems.push({ label: categoryData.name });

  const appBaseUrl = getBaseUrl();
  const areaCategorySchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": `${categoryData.name} in ${areaData.name}, ${cityData.name}`,
    "description": categoryData.metaDescription || `Professional ${categoryData.name} services in ${areaData.name}, ${cityData.name}.`,
    "image": categoryData.imageUrl || `${appBaseUrl}/android-chrome-512x512.png`,
    "provider": {
      "@type": "LocalBusiness",
      "name": "Wecanfix"
    },
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": areaData.name
    }
  };

  return (
    <>
      <JsonLdScript data={areaCategorySchema} idSuffix={`area-cat-${cityData.id}-${areaData.id}-${categoryData.id}`} />
      <CategoryPageClient categorySlug={catSlug} citySlug={citySlug} areaSlug={areaSlug} breadcrumbItems={breadcrumbItems} />
    </>
  );
}
