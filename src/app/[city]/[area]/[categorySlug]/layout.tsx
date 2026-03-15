import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreArea, GlobalWebSettings, AreaCategorySeoSetting, CityCategorySeoSetting } from '@/types/firestore';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 

export const dynamic = 'force-dynamic'; 

interface AreaCategoryPageLayoutProps {
  params: Promise<{ city: string; area: string; categorySlug: string }>;
  children: React.ReactNode;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

async function getCityData(citySlug: string): Promise<FirestoreCity | null> {
  try {
    if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.')) return null;
    const citiesRef = adminDb.collection('cities');
    const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const citySnapshot = await cityQuery.get();
    if (citySnapshot.empty) {
      return null;
    }
    const doc = citySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCity;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching city data for slug ${citySlug}:`, error); return null; }
}

async function getAreaData(cityId: string, areaSlug: string): Promise<FirestoreArea | null> {
  try {
    if (areaSlug.includes('.')) return null;
    const areasRef = adminDb.collection('areas');
    const areaQuery = areasRef.where('cityId', '==', cityId).where('slug', '==', areaSlug).where('isActive', '==', true).limit(1);
    const areaSnapshot = await areaQuery.get();
    if (areaSnapshot.empty) {
      return null;
    }
    const doc = areaSnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreArea;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching area data for cityId ${cityId}, slug ${areaSlug}:`, error); return null; }
}

async function getCategoryData(categorySlug: string): Promise<FirestoreCategory | null> {
  try {
    if (categorySlug.includes('.')) return null;
    const categoriesRef = adminDb.collection('adminCategories');
    const categoryQuery = categoriesRef.where('slug', '==', categorySlug).limit(1);
    const categorySnapshot = await categoryQuery.get();
    if (categorySnapshot.empty) {
      return null;
    }
    const doc = categorySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCategory;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching category data for slug ${categorySlug}:`, error); return null; }
}

async function getAreaCategorySeoOverride(areaId: string, categoryId: string): Promise<AreaCategorySeoSetting | null> {
  try {
    const overridesRef = adminDb.collection('areaCategorySeoSettings');
    const q = overridesRef.where('areaId', '==', areaId).where('categoryId', '==', categoryId).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as AreaCategorySeoSetting;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching SEO override for areaId ${areaId}, categoryId ${categoryId}:`, error); return null; }
}

async function getCityCategorySeoOverride(cityId: string, categoryId: string): Promise<CityCategorySeoSetting | null> {
  try {
    const overridesRef = adminDb.collection('cityCategorySeoSettings');
    const q = overridesRef.where('cityId', '==', cityId).where('categoryId', '==', categoryId).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CityCategorySeoSetting;
  } catch (error) {
    console.error(`[AreaCategoryLayout] Metadata: Error fetching city-category SEO override for cityId ${cityId}, categoryId ${categoryId}:`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = adminDb.collection("webSettings").doc("global");
        const docSnap = await settingsDocRef.get();
        if (docSnap.exists) return docSnap.data() as GlobalWebSettings;
        return null;
    } catch (error) { 
        console.error("[AreaCategoryLayout] Metadata: Error fetching global web settings:", error); 
        return null; 
    }
}

export async function generateMetadata(
  { params }: AreaCategoryPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;
  const { city: citySlug, area: areaSlug, categorySlug: catSlug } = await params;

  if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.') || areaSlug.includes('.') || catSlug.includes('.')) {
    return {
      title: 'Not Found',
      description: 'Resource not found',
    };
  }

  const cityData = await getCityData(citySlug);
  const areaData = cityData ? await getAreaData(cityData.id, areaSlug) : null;
  const categoryData = await getCategoryData(catSlug);
  
  const globalSeoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || globalSeoSettings.siteName || "Wecanfix";
  const defaultSuffix = globalSeoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl();

  if (!cityData || !areaData || !categoryData) {
    return { title: `Content Not Found${defaultSuffix}`, description: 'The page you are looking for does not exist.' };
  }

  // Fetch overrides: Area-specific first, then fall back to City-specific
  const areaSeoOverride = await getAreaCategorySeoOverride(areaData.id, categoryData.id);
  const citySeoOverride = !areaSeoOverride ? await getCityCategorySeoOverride(cityData.id, categoryData.id) : null;
  const finalSeoOverride = areaSeoOverride || citySeoOverride;

  const placeholderData = {
    areaName: areaData.name, cityName: cityData.name, categoryName: categoryData.name, siteName: siteName,
  };

  const title = (finalSeoOverride?.meta_title && finalSeoOverride.meta_title.trim() !== "") ? finalSeoOverride.meta_title
              : (replacePlaceholders(globalSeoSettings.areaCategoryPageTitlePattern, placeholderData) ||
                replacePlaceholders(globalSeoSettings.cityCategoryPageTitlePattern, placeholderData) || 
                replacePlaceholders(globalSeoSettings.categoryPageTitlePattern, placeholderData) || 
                `${categoryData.name} in ${areaData.name}, ${cityData.name}${defaultSuffix}`);

  const description = (finalSeoOverride?.meta_description && finalSeoOverride.meta_description.trim() !== "") ? finalSeoOverride.meta_description
                    : (replacePlaceholders(globalSeoSettings.areaCategoryPageDescriptionPattern, placeholderData) ||
                      replacePlaceholders(globalSeoSettings.cityCategoryPageDescriptionPattern, placeholderData) ||
                      replacePlaceholders(globalSeoSettings.categoryPageDescriptionPattern, placeholderData) ||
                      `Find ${categoryData.name} services in ${areaData.name}, ${cityData.name}. ${globalSeoSettings.defaultMetaDescription || ""}`);

  const keywordsStr = (finalSeoOverride?.meta_keywords && finalSeoOverride.meta_keywords.trim() !== "") ? finalSeoOverride.meta_keywords
                      : (replacePlaceholders(globalSeoSettings.areaCategoryPageKeywordsPattern, placeholderData) ||
                        replacePlaceholders(globalSeoSettings.cityCategoryPageKeywordsPattern, placeholderData) ||
                        replacePlaceholders(globalSeoSettings.categoryPageKeywordsPattern, placeholderData) ||
                        globalSeoSettings.defaultMetaKeywords);
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageHint = finalSeoOverride?.imageHint || categoryData.imageHint;
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = categoryData.imageUrl || ogImageFromWebSettings || globalSeoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${citySlug}/${areaSlug}/${catSlug}`;

  return {
    title, description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title, description, url: canonicalUrl,
      images: ogImage ? [{ url: ogImage, alt: ogImageHint || title }] : [],
      siteName, type: 'website',
    },
  };
}

export default function AreaCategoryLayout({ children }: AreaCategoryPageLayoutProps) {
  return <>{children}</>;
}
