
import HomePageClient from '@/components/home/HomePageClient';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';

export const dynamic = 'force-dynamic';

interface AreaPageProps {
  params: { city: string; area: string };
}

async function getAreaDataForPage(citySlug: string, areaSlug: string): Promise<(FirestoreArea & { parentCityData?: FirestoreCity }) | null> {
  try {
    const citiesRef = adminDb.collection('cities');
    const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
    const citySnapshot = await cityQuery.get();

    if (citySnapshot.empty) {
      return null;
    }
    const parentCityData = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;

    const areasRef = adminDb.collection('areas');
    const areaQuery = areasRef
      .where('slug', '==', areaSlug)
      .where('cityId', '==', parentCityData.id)
      .where('isActive', '==', true)
      .limit(1);
    const areaSnapshot = await areaQuery.get();

    if (areaSnapshot.empty) {
      return null;
    }
    const doc = areaSnapshot.docs[0];
    const areaData = { id: doc.id, ...doc.data() } as FirestoreArea;
    return { ...areaData, parentCityData };

  } catch (error) {
    console.error(`[AreaPage] Error fetching area data for page:`, error);
    return null;
  }
}

export async function generateStaticParams() {
  try {
    const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
    const paramsArray: { city: string; area: string }[] = [];

    for (const cityDoc of citiesSnapshot.docs) {
      const cityData = cityDoc.data() as FirestoreCity;
      if (!cityData.slug || cityData.slug.includes('.')) continue; 
      const areasQuery = adminDb
        .collection('areas')
        .where('cityId', '==', cityDoc.id)
        .where('isActive', '==', true);
      const areasSnapshot = await areasQuery.get();
      areasSnapshot.docs.forEach(areaDoc => {
        const areaData = areaDoc.data() as FirestoreArea;
        if (areaData.slug && !areaData.slug.includes('.')) { 
          paramsArray.push({ city: cityData.slug!, area: areaData.slug });
        }
      });
    }
    return paramsArray;
  } catch (error) {
    console.error("Error generating static params for area pages:", error);
    return [];
  }
}

export default async function AreaHomePage({ params }: AreaPageProps) {
  const { city: citySlug, area: areaSlug } = await params;

  if (citySlug.includes('.') || areaSlug.includes('.')) {
    return (
        <div className="container mx-auto px-4 py-8 text-center">
            Resource not found.
        </div>
    );
  }
  const areaData = await getAreaDataForPage(citySlug, areaSlug);
  
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (areaData && areaData.parentCityData) {
    breadcrumbItems.push({ label: areaData.parentCityData.name, href: `/${citySlug}` });
    breadcrumbItems.push({ label: areaData.name });
  } else if (areaData) { 
    breadcrumbItems.push({ label: citySlug.charAt(0).toUpperCase() + citySlug.slice(1) , href: `/${citySlug}` }); 
    breadcrumbItems.push({ label: areaData.name });
  } else {
    breadcrumbItems.push({ label: "Location Not Found" });
  }

  return (
    <>
      <HomePageClient citySlug={citySlug} areaSlug={areaSlug} breadcrumbItems={breadcrumbItems} />
    </>
  );
}
