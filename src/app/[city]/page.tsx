
import HomePageClient from '@/components/home/HomePageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCity } from '@/types/firestore';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';

export const dynamic = 'force-dynamic';

interface CityPageProps {
  params: { city: string };
}

async function getCityData(slug: string): Promise<FirestoreCity | null> {
  try {
    if (slug.includes('.')) {
      return null;
    }
    const citiesRef = adminDb.collection('cities');
    const q = citiesRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
        return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestoreCity;
  } catch (error) {
    console.error(`[CityPage] Error fetching city data for page:`, error);
    return null;
  }
}

export async function generateStaticParams() {
   try {
    const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
    const paths = citiesSnapshot.docs.map(doc => ({
      city: (doc.data() as FirestoreCity).slug as string,
    }));
    return paths.filter(p => p.city && !p.city.includes('.'));
  } catch (error) {
    console.error("Error generating static params for city pages:", error);
    return [];
  }
}

export default async function CityHomePage({ params }: CityPageProps) {
  const { city: citySlug } = await params;

  if (citySlug.includes('.')) {
    return (
        <div className="container mx-auto px-4 py-8 text-center">
            Resource not found.
        </div>
    );
  }
  const cityData = await getCityData(citySlug);
  
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  if (cityData) {
    breadcrumbItems.push({ label: cityData.name });
  } else {
    breadcrumbItems.push({ label: "City Not Found" });
  }

  return (
    <>
      <div className="container mx-auto px-4 pt-4 md:pt-6">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <HomePageClient citySlug={citySlug} />
    </>
  );
}
