import CategoryPageClient from '@/components/category/CategoryPageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';
import { notFound } from 'next/navigation';
import { getCategoryFullData } from '@/lib/homepageUtils';
import type { Metadata, ResolvingMetadata } from 'next';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import JsonLdScript from '@/components/shared/JsonLdScript';

interface PageProps {
  params: Promise<{ city: string; categorySlug: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

async function getPageData(citySlug: string, categorySlug: string): Promise<{ city: FirestoreCity | null; category: FirestoreCategory | null }> {
  if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.') || categorySlug.includes('.')) {
    return { city: null, category: null };
  }

  let cityData: FirestoreCity | null = null;
  let categoryData: FirestoreCategory | null = null;

  try {
    const cityQuery = adminDb.collection('cities').where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const citySnapshot = await cityQuery.get();
    if (!citySnapshot.empty) {
      const doc = citySnapshot.docs[0];
      cityData = { id: doc.id, ...doc.data() } as FirestoreCity;
    }
  } catch (error) {
    console.error(`[CityCategoryPage] Page: Error fetching city data for slug ${citySlug}:`, error);
  }

  try {
    const categoryQuery = adminDb.collection('adminCategories').where('slug', '==', categorySlug).limit(1);
    const categorySnapshot = await categoryQuery.get();
    if (!categorySnapshot.empty) {
      const doc = categorySnapshot.docs[0];
      categoryData = { id: doc.id, ...doc.data() } as FirestoreCategory;
    }
  } catch (error) {
    console.error(`[CityCategoryPage] Page: Error fetching category data for slug ${categorySlug}:`, error);
  }
  return { city: cityData, category: categoryData };
}

export async function generateMetadata(
  { params }: PageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug, categorySlug } = await params;
  const { city: cityData, category: categoryData } = await getPageData(citySlug, categorySlug);
  
  if (!cityData || !categoryData) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const placeholderData = { cityName: cityData.name, categoryName: categoryData.name };

  const title = replacePlaceholders(categoryData.metaTitle || seoSettings.cityCategoryPageTitlePattern, placeholderData) || `${categoryData.name} in ${cityData.name} | Wecanfix`;
  const description = replacePlaceholders(categoryData.metaDescription || seoSettings.cityCategoryPageDescriptionPattern, placeholderData) || `Book trusted ${categoryData.name} services in ${cityData.name} with Wecanfix.`;
  const keywords = replacePlaceholders(categoryData.metaKeywords || seoSettings.cityCategoryPageKeywordsPattern, placeholderData).split(',').map(k => k.trim()).filter(k => k);

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
      canonical: `${appBaseUrl}/${citySlug}/category/${categorySlug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/${citySlug}/category/${categorySlug}`,
      images: [{ url: ogImage }],
      type: 'website',
    },
  };
}

export default async function CityCategoryPage({ params }: PageProps) {
  const { city: citySlugParam, categorySlug: categorySlugParam } = await params;

  if (RESERVED_SLUGS.includes(citySlugParam)) {
    notFound();
  }

  const [pageData, fullCategoryData] = await Promise.all([
    getPageData(citySlugParam, categorySlugParam),
    getCategoryFullData(categorySlugParam)
  ]);

  const { city: cityData, category: categoryData } = pageData;

  if (!cityData || !categoryData) {
    notFound();
  }

  const appBaseUrl = getBaseUrl();
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  breadcrumbItems.push({ label: cityData.name, href: `/${citySlugParam}` });
  breadcrumbItems.push({ label: categoryData.name });

  const categoryCitySchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": `${categoryData.name} in ${cityData.name}`,
    "description": categoryData.metaDescription || `Professional ${categoryData.name} services in ${cityData.name}.`,
    "image": categoryData.imageUrl || `${appBaseUrl}/android-chrome-512x512.png`,
    "provider": {
      "@type": "LocalBusiness",
      "name": "Wecanfix"
    },
    "areaServed": {
      "@type": "City",
      "name": cityData.name
    }
  };
  
  return (
    <>
      <JsonLdScript data={categoryCitySchema} idSuffix={`city-cat-${cityData.id}-${categoryData.id}`} />
      <CategoryPageClient
        categorySlug={categorySlugParam}
        citySlug={citySlugParam}
        breadcrumbItems={breadcrumbItems}
        initialData={fullCategoryData || undefined}
      />
    </>
  );
}
