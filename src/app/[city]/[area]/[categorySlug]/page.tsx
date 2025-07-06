
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FirestoreCategory, FirestoreCity, FirestoreArea } from '@/types/firestore';
import CategoryPageClient from '@/components/category/CategoryPageClient';
import type { BreadcrumbItem } from '@/types/ui';

export const dynamic = 'force-dynamic';

interface AreaCategoryPageProps {
  params: { city: string; area: string; categorySlug: string };
}

async function getCityData(citySlug: string): Promise<FirestoreCity | null> {
  try {
    const citiesRef = collection(db, 'cities');
    const cityQuery = query(citiesRef, where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
    const citySnapshot = await getDocs(cityQuery);
    if (citySnapshot.empty) return null;
    return { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;
  } catch (error) {
    console.error(`[AreaCategoryPage] Page: Error fetching city data:`, error);
    return null;
  }
}

async function getAreaData(cityId: string, areaSlug: string): Promise<FirestoreArea | null> {
  try {
    const areasRef = collection(db, 'areas');
    const areaQuery = query(areasRef, where('cityId', '==', cityId), where('slug', '==', areaSlug), where('isActive', '==', true), limit(1));
    const areaSnapshot = await getDocs(areaQuery);
    if (areaSnapshot.empty) return null;
    return { id: areaSnapshot.docs[0].id, ...areaSnapshot.docs[0].data() } as FirestoreArea;
  } catch (error) {
    console.error(`[AreaCategoryPage] Page: Error fetching area data:`, error);
    return null;
  }
}

async function getCategoryData(categorySlug: string): Promise<FirestoreCategory | null> {
  try {
    const categoriesRef = collection(db, 'adminCategories');
    const categoryQuery = query(categoriesRef, where('slug', '==', categorySlug), limit(1));
    const categorySnapshot = await getDocs(categoryQuery);
    if (categorySnapshot.empty) return null;
    return { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;
  } catch (error) {
    console.error(`[AreaCategoryPage] Page: Error fetching category data:`, error);
    return null;
  }
}

export default async function AreaCategoryPage({ params }: AreaCategoryPageProps) {
  const citySlug = params.city;
  const areaSlug = params.area;
  const catSlug = params.categorySlug;

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
