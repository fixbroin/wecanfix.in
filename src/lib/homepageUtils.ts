// src/lib/homepageUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import type { 
    FeaturesConfiguration, 
    FirestoreService, 
    FirestoreCategory, 
    GlobalWebSettings, 
    FirestoreCity, 
    FirestoreArea, 
    FirestoreSEOSettings,
    FirestoreSubCategory
} from '@/types/firestore';
import { serializeFirestoreData } from './serializeUtils';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

export interface HomepageData {
    featuresConfig: FeaturesConfiguration;
    popularServices: FirestoreService[];
    recentServices: FirestoreService[];
    categoryWiseServices: Array<{ category: FirestoreCategory, services: FirestoreService[] }>;
    seoSettings: FirestoreSEOSettings;
    webSettings: GlobalWebSettings | null;
    citiesWithAreas: Array<FirestoreCity & { areas: FirestoreArea[] }>;
    allCategories: FirestoreCategory[];
}

export const getHomepageData = cache(async (): Promise<HomepageData> => {
    return unstable_cache(
        async () => {
            try {
                // Fetch Features Configuration, Global Settings, Cities, and ALL Categories in parallel
                const [featuresConfigDoc, seoSettingsDoc, webSettingsDoc, citiesSnapshot, allCatsSnapshot] = await Promise.all([
                    adminDb.collection('webSettings').doc('featuresConfiguration').get(),
                    adminDb.collection('seoSettings').doc('global').get(),
                    adminDb.collection('webSettings').doc('global').get(),
                    adminDb.collection('cities').where('isActive', '==', true).orderBy('name').get(),
                    adminDb.collection('adminCategories').where('isActive', '==', true).orderBy('order', 'asc').get()
                ]);

                const featuresConfig = featuresConfigDoc.exists 
                    ? serializeFirestoreData<FeaturesConfiguration>(featuresConfigDoc.data())
                    : {
                        showMostPopularServices: true,
                        showRecentlyAddedServices: true,
                        showCategoryWiseServices: true,
                        showBlogSection: true,
                        showCustomServiceButton: false,
                        homepageCategoryVisibility: {},
                        ads: [],
                    } as FeaturesConfiguration;

                const seoSettings = seoSettingsDoc.exists
                    ? serializeFirestoreData<FirestoreSEOSettings>(seoSettingsDoc.data())
                    : {} as FirestoreSEOSettings;

                const webSettings = webSettingsDoc.exists
                    ? serializeFirestoreData<GlobalWebSettings>(webSettingsDoc.data())
                    : null;

                const allCategories = allCatsSnapshot.docs.map(doc => ({ ...serializeFirestoreData<any>(doc.data()), id: doc.id } as FirestoreCategory));

                const citiesData = citiesSnapshot.docs.map(doc => ({ ...serializeFirestoreData<any>(doc.data()), id: doc.id } as FirestoreCity));
                
                const citiesWithAreasPromise = Promise.all(citiesData.map(async (city) => {
                    const areasSnapshot = await adminDb.collection('areas')
                        .where('cityId', '==', city.id)
                        .where('isActive', '==', true)
                        .orderBy('name')
                        .get();
                    const areasData = areasSnapshot.docs.map(doc => ({ ...serializeFirestoreData<any>(doc.data()), id: doc.id } as FirestoreArea));
                    return { ...city, areas: areasData };
                }));

                const promises: Promise<any>[] = [];

                // 1. Popular Services
                if (featuresConfig.showMostPopularServices) {
                    promises.push(
                        adminDb.collection('adminServices')
                            .where('isActive', '==', true)
                            .orderBy('rating', 'desc')
                            .orderBy('reviewCount', 'desc')
                            .limit(10)
                            .get()
                            .then(snap => snap.docs.map(doc => ({ id: doc.id, ...serializeFirestoreData<any>(doc.data()) } as FirestoreService)))
                    );
                } else {
                    promises.push(Promise.resolve([]));
                }

                // 2. Recent Services
                if (featuresConfig.showRecentlyAddedServices) {
                    promises.push(
                        adminDb.collection('adminServices')
                            .where('isActive', '==', true)
                            .orderBy('createdAt', 'desc')
                            .limit(10)
                            .get()
                            .then(snap => snap.docs.map(doc => ({ id: doc.id, ...serializeFirestoreData<any>(doc.data()) } as FirestoreService)))
                    );
                } else {
                    promises.push(Promise.resolve([]));
                }

                // 3. Category Wise Services
                if (featuresConfig.showCategoryWiseServices) {
                    const enabledCategoryIds = Object.entries(featuresConfig.homepageCategoryVisibility || {})
                        .filter(([, isVisible]) => isVisible)
                        .map(([catId]) => catId);

                    if (enabledCategoryIds.length > 0) {
                        promises.push(
                            adminDb.collection('adminCategories')
                                .where('__name__', 'in', enabledCategoryIds)
                                .where('isActive', '==', true)
                                .orderBy('order', 'asc')
                                .get()
                                .then(async categoriesSnapshot => {
                                    const enabledCategories = categoriesSnapshot.docs.map(d => ({ ...serializeFirestoreData<any>(d.data()), id: d.id } as FirestoreCategory));
                                    
                                    const categoryServicesPromises = enabledCategories.map(async (cat) => {
                                        const subCategoriesSnapshot = await adminDb.collection('adminSubCategories')
                                            .where('parentId', '==', cat.id)
                                            .where('isActive', '==', true)
                                            .get();
                                        
                                        const subCategoryIds = subCategoriesSnapshot.docs.map(subDoc => subDoc.id);

                                        let servicesForCategory: FirestoreService[] = [];
                                        if (subCategoryIds.length > 0) {
                                            const chunks = [];
                                            for (let i = 0; i < subCategoryIds.length; i += 10) {
                                                chunks.push(subCategoryIds.slice(i, i + 10));
                                            }

                                            const servicesPromises = chunks.map(chunk => 
                                                adminDb.collection('adminServices')
                                                    .where('isActive', '==', true)
                                                    .where('subCategoryId', 'in', chunk)
                                                    .orderBy('name', 'asc')
                                                    .limit(10)
                                                    .get()
                                            );

                                            const servicesSnapshots = await Promise.all(servicesPromises);
                                            servicesForCategory = servicesSnapshots.flatMap(snap => 
                                                snap.docs.map(sDoc => ({ ...serializeFirestoreData<any>(sDoc.data()), id: sDoc.id } as FirestoreService))
                                            ).slice(0, 10);
                                        }
                                        return { category: cat, services: servicesForCategory };
                                    });
                                    
                                    const results = await Promise.all(categoryServicesPromises);
                                    return results.filter(cs => cs.services.length > 0);
                                })
                        );
                    } else {
                        promises.push(Promise.resolve([]));
                    }
                } else {
                    promises.push(Promise.resolve([]));
                }

                const [popularServices, recentServices, categoryWiseServices, citiesWithAreas] = await Promise.all([
                    ...promises,
                    citiesWithAreasPromise
                ]);

                return {
                    featuresConfig,
                    popularServices,
                    recentServices,
                    categoryWiseServices,
                    seoSettings,
                    webSettings,
                    citiesWithAreas,
                    allCategories
                };

            } catch (error) {
                console.error("Error in getHomepageData:", error);
                throw error;
            }
        },
        ['homepage-data'],
        { revalidate: false,
 tags: ['global', 'cities', 'categories', 'services', 'global-cache'] }
    )();
});

export interface FullCategoryData {
    category: FirestoreCategory;
    subCategories: Array<FirestoreSubCategory & { services: FirestoreService[] }>;
    seoSettings: FirestoreSEOSettings;
}

export const getCategoryFullData = cache(async (categorySlug: string): Promise<FullCategoryData | null> => {
    return unstable_cache(
        async () => {
            try {
                const [categorySnapshot, seoSettingsDoc] = await Promise.all([
                    adminDb.collection('adminCategories')
                        .where('slug', '==', categorySlug)
                        .where('isActive', '==', true)
                        .limit(1)
                        .get(),
                    adminDb.collection('seoSettings').doc('global').get()
                ]);

                if (categorySnapshot.empty) return null;

                const categoryDoc = categorySnapshot.docs[0];
                const category = { id: categoryDoc.id, ...serializeFirestoreData<any>(categoryDoc.data()) } as FirestoreCategory;

                const seoSettings = seoSettingsDoc.exists
                    ? serializeFirestoreData<FirestoreSEOSettings>(seoSettingsDoc.data())
                    : {} as FirestoreSEOSettings;

                const subCategoriesSnapshot = await adminDb.collection('adminSubCategories')
                    .where('parentId', '==', category.id)
                    .where('isActive', '==', true)
                    .orderBy('order', 'asc')
                    .get();

                const subCategories = subCategoriesSnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...serializeFirestoreData<any>(doc.data()) 
                } as FirestoreSubCategory));

                const subCategoriesWithServices = await Promise.all(subCategories.map(async (subCat) => {
                    const servicesSnapshot = await adminDb.collection('adminServices')
                        .where('subCategoryId', '==', subCat.id)
                        .where('isActive', '==', true)
                        .orderBy('name', 'asc')
                        .get();
                    
                    const services = servicesSnapshot.docs.map(doc => ({ 
                        id: doc.id, 
                        ...serializeFirestoreData<any>(doc.data()) 
                    } as FirestoreService));

                    return { ...subCat, services };
                }));

                return {
                    category,
                    subCategories: subCategoriesWithServices,
                    seoSettings
                };
            } catch (error) {
                console.error(`Error in getCategoryFullData for slug ${categorySlug}:`, error);
                return null;
            }
        },
        [`category-data-${categorySlug}`],
        { revalidate: false,
 tags: ['categories', 'services', `category-${categorySlug}`, 'global-cache'] }
    )();
});

export const getAggregateRating = cache(async (): Promise<{ ratingValue: string, reviewCount: number } | null> => {
    return unstable_cache(
        async () => {
            try {
                const snapshot = await adminDb.collection('adminServices')
                    .where('isActive', '==', true)
                    .where('rating', '>', 0)
                    .get();

                if (snapshot.empty) return null;

                let totalRating = 0;
                let totalReviews = 0;

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.rating && data.reviewCount) {
                        totalRating += (data.rating * data.reviewCount);
                        totalReviews += data.reviewCount;
                    }
                });

                if (totalReviews === 0) return null;

                return {
                    ratingValue: (totalRating / totalReviews).toFixed(1),
                    reviewCount: totalReviews
                };
            } catch (error) {
                console.error("Error calculating aggregate rating:", error);
                return null;
            }
        },
        ['aggregate-rating'],
        { revalidate: false,
 tags: ['services', 'global-cache'] }
    )();
});
