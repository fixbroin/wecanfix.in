
import { MetadataRoute } from 'next';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { FirestoreCategory, FirestoreService, FirestoreCity, FirestoreArea } from '@/types/firestore';
import { getBaseUrl } from '@/lib/config'; 

export const dynamic = 'force-static'; 

const safeToISOString = (timestamp: Timestamp | undefined | string | Date, fallbackDate: string): string => {
  try {
    if (timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
      return (timestamp as Timestamp).toDate().toISOString();
    }
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    return fallbackDate;
  } catch (e) {
    return fallbackDate;
  }
};


async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const appBaseUrl = getBaseUrl(); 
  const entries: MetadataRoute.Sitemap = [];
  const currentDate = new Date().toISOString();

  const staticPages = [
    '', '/about-us', '/contact-us', '/careers', '/terms-of-service',
    '/privacy-policy', '/faq', '/help-center', '/cancellation-policy', '/categories', 
  ];
  staticPages.forEach(page => {
    entries.push({
      url: `${appBaseUrl}${page}`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: page === '' ? 1.0 : 0.8,
    });
  });

  try {
    const categoriesSnapshot = await getDocs(query(collection(db, 'adminCategories')));
    categoriesSnapshot.forEach(docSnap => {
      const categoryData = docSnap.data() as FirestoreCategory;
      if (categoryData.slug) {
        entries.push({
          url: `${appBaseUrl}/category/${categoryData.slug}`,
          lastModified: safeToISOString(categoryData.createdAt, currentDate),
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
    });
  } catch (e) { console.error("Sitemap: Error fetching categories:", e); throw e; }

  try {
    const servicesSnapshot = await getDocs(query(collection(db, 'adminServices'), where('isActive', '==', true)));
    servicesSnapshot.forEach(docSnap => {
      const serviceData = docSnap.data() as FirestoreService;
      if (serviceData.slug) {
        entries.push({
          url: `${appBaseUrl}/service/${serviceData.slug}`,
          lastModified: safeToISOString(serviceData.updatedAt || serviceData.createdAt, currentDate),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    });
  } catch (e) { console.error("Sitemap: Error fetching services:", e); throw e; }

  try {
    const citiesSnapshot = await getDocs(query(collection(db, 'cities'), where('isActive', '==', true)));
    const categoriesSnapshot = await getDocs(query(collection(db, 'adminCategories'))); // Fetch all categories once

    for (const cityDoc of citiesSnapshot.docs) {
        const city = cityDoc.data() as FirestoreCity;
        if (!city.slug) continue;

        entries.push({
            url: `${appBaseUrl}/${city.slug}`,
            lastModified: safeToISOString(city.updatedAt || city.createdAt, currentDate),
            changeFrequency: 'monthly',
            priority: 0.7,
        });

        // City/Category pages (e.g., /bangalore/category/carpentry)
        categoriesSnapshot.forEach(categoryDoc => {
            const category = categoryDoc.data() as FirestoreCategory;
            if (category.slug) {
                entries.push({
                    url: `${appBaseUrl}/${city.slug}/category/${category.slug}`,
                    lastModified: safeToISOString(category.createdAt, currentDate), // Or a more specific lastMod for this combo if available
                    changeFrequency: 'weekly',
                    priority: 0.6,
                });
            }
        });

        const areasSnapshot = await getDocs(query(collection(db, 'areas'), where('cityId', '==', cityDoc.id), where('isActive', '==', true)));
        areasSnapshot.forEach(areaDoc => {
            const area = areaDoc.data() as FirestoreArea;
            if (area.slug) {
                entries.push({
                    url: `${appBaseUrl}/${city.slug}/${area.slug}`,
                    lastModified: safeToISOString(area.updatedAt || area.createdAt, currentDate),
                    changeFrequency: 'monthly',
                    priority: 0.6,
                });

                // City/Area/Category pages (e.g., /bangalore/whitefield/carpentry)
                categoriesSnapshot.forEach(categoryDoc => {
                    const category = categoryDoc.data() as FirestoreCategory;
                    if (category.slug) {
                        entries.push({
                            url: `${appBaseUrl}/${city.slug}/${area.slug}/${category.slug}`,
                            lastModified: safeToISOString(category.createdAt, currentDate), // Or more specific if available
                            changeFrequency: 'weekly',
                            priority: 0.5,
                        });
                    }
                });
            }
        });
    }
  } catch (e) { console.error("Sitemap: Error fetching cities, areas, or their category combinations:", e); throw e; }
  
  const uniqueEntries = Array.from(new Map(entries.map(entry => [entry.url, entry])).values());
  return uniqueEntries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    return await getSitemapEntries();
  } catch (error) {
    console.error("SITEMAP_GENERATION_ERROR: Failed to generate sitemap entries:", error);
    const appBaseUrl = getBaseUrl(); 
    return [
      {
        url: appBaseUrl,
        lastModified: new Date().toISOString(),
        changeFrequency: 'yearly',
        priority: 0.1,
      },
    ];
  }
}
