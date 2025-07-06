
import CategoryPageClient from '@/components/category/CategoryPageClient';
import { db } from '@/lib/firebase';
import type { FirestoreCategory, FirestoreCity } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

interface PageProps {
  params: { city: string; categorySlug: string };
}

async function getPageData(citySlug: string, categorySlug: string): Promise<{ city: FirestoreCity | null; category: FirestoreCategory | null }> {
  let cityData: FirestoreCity | null = null;
  let categoryData: FirestoreCategory | null = null;
  console.log(`[CityCategoryPage] Page: getPageData for citySlug: ${citySlug}, categorySlug: ${categorySlug}`);

  try {
    const cityQuery = query(collection(db, 'cities'), where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
    const citySnapshot = await getDocs(cityQuery);
    if (!citySnapshot.empty) {
      cityData = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;
    } else {
      console.warn(`[CityCategoryPage] Page: City not found or inactive for slug: ${citySlug}`);
    }
  } catch (error) {
    console.error(`[CityCategoryPage] Page: Error fetching city data for slug ${citySlug}:`, error);
  }

  try {
    const categoryQuery = query(collection(db, 'adminCategories'), where('slug', '==', categorySlug), limit(1));
    const categorySnapshot = await getDocs(categoryQuery);
    if (!categorySnapshot.empty) {
      categoryData = { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;
    } else {
      console.warn(`[CityCategoryPage] Page: Category not found for slug: ${categorySlug}`);
    }
  } catch (error) {
    console.error(`[CityCategoryPage] Page: Error fetching category data for slug ${categorySlug}:`, error);
  }
  return { city: cityData, category: categoryData };
}

export default async function CityCategoryPage({ params }: PageProps) {
  const citySlugParam = params.city;
  const categorySlugParam = params.categorySlug;
  const { city: cityData, category: categoryData } = await getPageData(citySlugParam, categorySlugParam);

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (cityData) {
    breadcrumbItems.push({ label: cityData.name, href: `/${citySlugParam}` });
  } else {
    // Fallback to using slug if cityData is not found, to ensure breadcrumb consistency
    breadcrumbItems.push({ label: citySlugParam.charAt(0).toUpperCase() + citySlugParam.slice(1), href: `/${citySlugParam}` });
  }
  if (categoryData) {
    breadcrumbItems.push({ label: categoryData.name });
  } else {
    // Fallback for category
    breadcrumbItems.push({ label: categorySlugParam.charAt(0).toUpperCase() + categorySlugParam.slice(1) });
  }
  
  return (
    <CategoryPageClient
      categorySlug={categorySlugParam}
      citySlug={citySlugParam}
      breadcrumbItems={breadcrumbItems}
    />
  );
}
