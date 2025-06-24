
import type { Metadata, ResolvingMetadata } from 'next';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FirestoreCategory, FirestoreCity, FirestoreArea, GlobalWebSettings, AreaCategorySeoSetting, CityCategorySeoSetting } from '@/types/firestore';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config'; 

export const dynamic = 'force-dynamic'; 

interface AreaCategoryPageLayoutProps {
  params: { city: string; area: string; categorySlug: string };
  children: React.ReactNode;
}

async function getCityData(citySlug: string): Promise<FirestoreCity | null> {
  try {
    const citiesRef = collection(db, 'cities');
    const cityQuery = query(citiesRef, where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
    const citySnapshot = await getDocs(cityQuery);
    if (citySnapshot.empty) {
      console.warn(`[AreaCategoryLayout] Metadata: City not found or inactive for slug: ${citySlug}`);
      return null;
    }
    return { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching city data for slug ${citySlug}:`, error); return null; }
}

async function getAreaData(cityId: string, areaSlug: string): Promise<FirestoreArea | null> {
  try {
    const areasRef = collection(db, 'areas');
    const areaQuery = query(areasRef, where('cityId', '==', cityId), where('slug', '==', areaSlug), where('isActive', '==', true), limit(1));
    const areaSnapshot = await getDocs(areaQuery);
    if (areaSnapshot.empty) {
      console.warn(`[AreaCategoryLayout] Metadata: Area not found or inactive for cityId ${cityId}, slug ${areaSlug}`);
      return null;
    }
    return { id: areaSnapshot.docs[0].id, ...areaSnapshot.docs[0].data() } as FirestoreArea;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching area data for cityId ${cityId}, slug ${areaSlug}:`, error); return null; }
}

async function getCategoryData(categorySlug: string): Promise<FirestoreCategory | null> {
  try {
    const categoriesRef = collection(db, 'adminCategories');
    const categoryQuery = query(categoriesRef, where('slug', '==', categorySlug), limit(1));
    const categorySnapshot = await getDocs(categoryQuery);
    if (categorySnapshot.empty) {
      console.warn(`[AreaCategoryLayout] Metadata: Category not found for slug: ${categorySlug}`);
      return null;
    }
    return { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching category data for slug ${categorySlug}:`, error); return null; }
}

async function getAreaCategorySeoOverride(areaId: string, categoryId: string): Promise<AreaCategorySeoSetting | null> {
  try {
    const overridesRef = collection(db, 'areaCategorySeoSettings');
    const q = query(overridesRef, where('areaId', '==', areaId), where('categoryId', '==', categoryId), where('isActive', '==', true), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as AreaCategorySeoSetting;
  } catch (error) { console.error(`[AreaCategoryLayout] Metadata: Error fetching SEO override for areaId ${areaId}, categoryId ${categoryId}:`, error); return null; }
}

async function getCityCategorySeoOverride(cityId: string, categoryId: string): Promise<CityCategorySeoSetting | null> {
  try {
    const overridesRef = collection(db, 'cityCategorySeoSettings');
    const q = query(overridesRef, where('cityId', '==', cityId), where('categoryId', '==', categoryId), where('isActive', '==', true), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CityCategorySeoSetting;
  } catch (error) {
    console.error(`[AreaCategoryLayout] Metadata: Error fetching city-category SEO override for cityId ${cityId}, categoryId ${categoryId}:`, error);
    return null;
  }
}

async function getGlobalWebsiteSettings(): Promise<GlobalWebSettings | null> {
    try {
        const settingsDocRef = doc(db, "webSettings", "global");
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) return docSnap.data() as GlobalWebSettings;
        console.warn("[AreaCategoryLayout] Metadata: Global web settings not found.");
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

  const citySlug = params.city;
  const areaSlug = params.area;
  const catSlug = params.categorySlug;

  const cityData = await getCityData(citySlug);
  const areaData = cityData ? await getAreaData(cityData.id, areaSlug) : null;
  const categoryData = await getCategoryData(catSlug);
  
  const globalSeoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebsiteSettings();
  const siteName = resolvedParent.openGraph?.siteName || globalSeoSettings.siteName || "FixBro";
  const defaultSuffix = globalSeoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl();

  if (!cityData || !areaData || !categoryData) {
    let missingItems: string[] = [];
    if (!cityData) missingItems.push(`city "${citySlug}"`);
    if (cityData && !areaData) missingItems.push(`area "${areaSlug}" (city "${citySlug}")`);
    else if (!cityData && !areaData) missingItems.push(`area "${areaSlug}" (city "${citySlug}" also not found)`);
    if (!categoryData) missingItems.push(`category "${catSlug}"`);
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
  const ogImage = categoryData.imageUrl || ogImageFromWebSettings || globalSeoSettings.structuredDataImage || `${appBaseUrl}/default-og-image.png`;
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
