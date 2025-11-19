
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreSEOSettings, GlobalWebSettings, CityCategorySeoSetting } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

interface CityCategoryPageLayoutProps {
  params: { city: string; categorySlug: string };
  children: React.ReactNode;
}

async function getCityData(citySlug: string): Promise<FirestoreCity | null> {
  try {
    const citiesRef = adminDb.collection('cities');
    const q = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
      console.warn(`[CityCategoryLayout] Metadata: City not found or inactive for slug: ${citySlug}`);
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCity;
  } catch (error) {
    console.error(`[CityCategoryLayout] Metadata: Error fetching city data for slug ${citySlug}:`, error);
    return null;
  }
}

async function getCategoryData(categorySlug: string): Promise<FirestoreCategory | null> {
  try {
    const catRef = adminDb.collection('adminCategories');
    const q = catRef.where('slug', '==', categorySlug).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
      console.warn(`[CityCategoryLayout] Metadata: Category not found for slug: ${categorySlug}`);
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCategory;
  } catch (error) {
    console.error(`[CityCategoryLayout] Metadata: Error fetching category data for slug ${categorySlug}:`, error);
    return null;
  }
}

async function getCityCategorySeoOverride(cityId: string, categoryId: string): Promise<CityCategorySeoSetting | null> {
  try {
    const overridesRef = adminDb.collection('cityCategorySeoSettings');
    const q = overridesRef.where('cityId', '==', cityId).where('categoryId', '==', categoryId).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CityCategorySeoSetting;
  } catch (error) {
    console.error(`[CityCategoryLayout] Metadata: Error fetching SEO override for cityId ${cityId}, categoryId ${categoryId}:`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = adminDb.collection("webSettings").doc("global");
        const docSnap = await settingsDocRef.get();
        if (docSnap.exists) return docSnap.data() as GlobalWebSettings;
        console.warn("[CityCategoryLayout] Metadata: Global web settings not found.");
        return null;
    } catch (error) {
        console.error("[CityCategoryLayout] Metadata: Error fetching global web settings:", error);
        return null; 
    }
}

export async function generateMetadata(
  { params }: CityCategoryPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const { city: citySlugParam, categorySlug: categorySlugParam } = await params;
  console.log(`[CityCategoryLayout] generateMetadata for city: ${citySlugParam}, category: ${categorySlugParam}`);

  const cityData = await getCityData(citySlugParam);
  const categoryData = await getCategoryData(categorySlugParam);
  const globalSeoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || globalSeoSettings.siteName || "Wecanfix";
  const defaultSuffix = globalSeoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl();

  if (!cityData || !categoryData) {
    let missingItems: string[] = [];
    if (!cityData) missingItems.push(`city "${citySlugParam}"`);
    if (!categoryData) missingItems.push(`category "${categorySlugParam}"`);
    console.warn(`[CityCategoryLayout] generateMetadata: Content not found for ${missingItems.join(', ')}.`);
    return {
      title: `Content Not Found${defaultSuffix}`,
      description: 'The page you are looking for does not exist or parameters are invalid.',
    };
  }
  console.log("[CityCategoryLayout] Fetched City:", cityData?.name, "Category:", categoryData?.name);

  const seoOverride = await getCityCategorySeoOverride(cityData.id, categoryData.id);
  console.log("[CityCategoryLayout] Fetched SEO Override:", seoOverride);

  const placeholderData = { cityName: cityData.name, categoryName: categoryData.name, siteName: siteName };
  console.log("[CityCategoryLayout] Placeholder Data for Patterns:", placeholderData);

  const title = (seoOverride?.meta_title && seoOverride.meta_title.trim() !== "") ? seoOverride.meta_title
              : (replacePlaceholders(globalSeoSettings.cityCategoryPageTitlePattern, placeholderData) ||
                replacePlaceholders(globalSeoSettings.categoryPageTitlePattern, placeholderData) ||
                `${categoryData.name} in ${cityData.name}${defaultSuffix}`);

  const description = (seoOverride?.meta_description && seoOverride.meta_description.trim() !== "") ? seoOverride.meta_description
                    : (replacePlaceholders(globalSeoSettings.cityCategoryPageDescriptionPattern, placeholderData) ||
                      replacePlaceholders(globalSeoSettings.categoryPageDescriptionPattern, placeholderData) ||
                      `Find ${categoryData.name} services in ${cityData.name}. ${globalSeoSettings.defaultMetaDescription || ""}`);

  const keywordsStr = (seoOverride?.meta_keywords && seoOverride.meta_keywords.trim() !== "") ? seoOverride.meta_keywords
                      : (replacePlaceholders(globalSeoSettings.cityCategoryPageKeywordsPattern, placeholderData) ||
                        replacePlaceholders(globalSeoSettings.categoryPageKeywordsPattern, placeholderData) ||
                        globalSeoSettings.defaultMetaKeywords);
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  console.log("[CityCategoryLayout] Final Title:", title, "Description:", description, "Keywords:", keywords);

  const ogImageHint = seoOverride?.imageHint || categoryData.imageHint;
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = categoryData.imageUrl || ogImageFromWebSettings || globalSeoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${citySlugParam}/category/${categorySlugParam}`;

  return {
    title,
    description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title, description, url: canonicalUrl,
      images: ogImage ? [{ url: ogImage, alt: ogImageHint || title }] : [],
      siteName, type: 'website',
    },
  };
}

export async function generateStaticParams() {
  try {
    const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
    const categoriesSnapshot = await adminDb.collection('adminCategories').get();
    const paramsArray: { city: string; categorySlug: string }[] = [];

    citiesSnapshot.forEach(cityDoc => {
      const city = cityDoc.data() as FirestoreCity;
      if (!city.slug) {
        console.warn(`[CityCategoryLayout] generateStaticParams: Skipping city ID ${cityDoc.id} due to missing slug.`);
        return;
      }
      categoriesSnapshot.forEach(categoryDoc => {
        const category = categoryDoc.data() as FirestoreCategory;
        if (category.slug) {
          paramsArray.push({ city: city.slug, categorySlug: category.slug });
        } else {
          console.warn(`[CityCategoryLayout] generateStaticParams: Skipping category ID ${categoryDoc.id} due to missing slug.`);
        }
      });
    });
    
    if (paramsArray.length === 0) {
        console.warn("[CityCategoryLayout] generateStaticParams: No valid city/category combinations found for /[city]/category/[categorySlug] routes.");
    }
    return paramsArray;
  } catch (error) {
    console.error("[CityCategoryLayout] Error generating static params for city-category pages:", error);
    return [];
  }
}

export default function CityCategoryLayout({ children }: CityCategoryPageLayoutProps) {
  return <>{children}</>;
}
