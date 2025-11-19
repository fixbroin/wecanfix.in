
import CategoryPageClient from '@/components/category/CategoryPageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';

interface PageProps {
  params: { city: string; categorySlug: string };
}

async function getPageData(citySlug: string, categorySlug: string): Promise<{ city: FirestoreCity | null; category: FirestoreCategory | null }> {
  let cityData: FirestoreCity | null = null;
  let categoryData: FirestoreCategory | null = null;
  console.log(`[CityCategoryPage] Page: getPageData for citySlug: ${citySlug}, categorySlug: ${categorySlug}`);

  try {
    const cityQuery = adminDb.collection('cities').where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const citySnapshot = await cityQuery.get();
    if (!citySnapshot.empty) {
      const doc = citySnapshot.docs[0];
      cityData = { id: doc.id, ...doc.data() } as FirestoreCity;
    } else {
      console.warn(`[CityCategoryPage] Page: City not found or inactive for slug: ${citySlug}`);
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
    } else {
      console.warn(`[CityCategoryPage] Page: Category not found for slug: ${categorySlug}`);
    }
  } catch (error) {
    console.error(`[CityCategoryPage] Page: Error fetching category data for slug ${categorySlug}:`, error);
  }
  return { city: cityData, category: categoryData };
}

export default async function CityCategoryPage({ params }: PageProps) {
  const { city: citySlugParam, categorySlug: categorySlugParam } = await params;
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
