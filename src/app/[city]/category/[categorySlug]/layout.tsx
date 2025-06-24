
import type { Metadata, ResolvingMetadata } from 'next';
import { doc, getDoc, collection, query, where, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    const citiesRef = collection(db, 'cities');
    const q = query(citiesRef, where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.warn(`[CityCategoryLayout] Metadata: City not found or inactive for slug: ${citySlug}`);
      return null;
    }
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreCity;
  } catch (error) {
    console.error(`[CityCategoryLayout] Metadata: Error fetching city data for slug ${citySlug}:`, error);
    return null;
  }
}

async function getCategoryData(categorySlug: string): Promise<FirestoreCategory | null> {
  try {
    const catRef = collection(db, 'adminCategories');
    const q = query(catRef, where('slug', '==', categorySlug), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.warn(`[CityCategoryLayout] Metadata: Category not found for slug: ${categorySlug}`);
      return null;
    }
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreCategory;
  } catch (error) {
    console.error(`[CityCategoryLayout] Metadata: Error fetching category data for slug ${categorySlug}:`, error);
    return null;
  }
}

async function getCityCategorySeoOverride(cityId: string, categoryId: string): Promise<CityCategorySeoSetting | null> {
  try {
    const overridesRef = collection(db, 'cityCategorySeoSettings');
    const q = query(overridesRef, where('cityId', '==', cityId), where('categoryId', '==', categoryId), where('isActive', '==', true), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CityCategorySeoSetting;
  } catch (error) {
    console.error(`[CityCategoryLayout] Metadata: Error fetching SEO override for cityId ${cityId}, categoryId ${categoryId}:`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = doc(db, "webSettings", "global");
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) return docSnap.data() as GlobalWebSettings;
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

  const citySlugParam = params.city;
  const categorySlugParam = params.categorySlug;
  console.log(`[CityCategoryLayout] generateMetadata for city: ${citySlugParam}, category: ${categorySlugParam}`);

  const cityData = await getCityData(citySlugParam);
  const categoryData = await getCategoryData(categorySlugParam);
  const globalSeoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || globalSeoSettings.siteName || "FixBro";
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
  const ogImage = categoryData.imageUrl || ogImageFromWebSettings || globalSeoSettings.structuredDataImage || `${appBaseUrl}/default-og-image.png`;
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
    const citiesSnapshot = await getDocs(query(collection(db, 'cities'), where('isActive', '==', true)));
    const categoriesSnapshot = await getDocs(query(collection(db, 'adminCategories')));
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
