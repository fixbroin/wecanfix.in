
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreArea } from '@/types/firestore';
import CategoryPageClient from '@/components/category/CategoryPageClient';
import type { BreadcrumbItem } from '@/types/ui';

export const dynamic = 'force-dynamic';

interface AreaCategoryPageProps {
  params: { city: string; area: string; categorySlug: string };
}

async function getCityData(citySlug: string): Promise<FirestoreCity | null> {
  try {
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

export default async function AreaCategoryPage({ params }: AreaCategoryPageProps) {
  const { city: citySlug, area: areaSlug, categorySlug: catSlug } = await params;

  const cityData = await getCityData(citySlug);
  const areaData = cityData ? await getAreaData(cityData.id, areaSlug) : null;
  const categoryData = await getCategoryData(catSlug);

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (cityData) {
    breadcrumbItems.push({ label: cityData.name, href: `/${citySlug}` });
    if (areaData) {
      breadcrumbItems.push({ label: areaData.name, href: `/${citySlug}/${areaSlug}` });
    }
  }
  if (categoryData) {
    breadcrumbItems.push({ label: categoryData.name });
  } else if (cityData && areaData) { 
    breadcrumbItems.push({ label: "Category Not Found" });
  }

  return <CategoryPageClient categorySlug={catSlug} citySlug={citySlug} areaSlug={areaSlug} breadcrumbItems={breadcrumbItems} />;
}
