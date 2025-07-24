

"use client";

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { doc, getDoc, collection, query, where, limit, getDocs, orderBy, Timestamp, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, FirestoreSEOSettings, FirestoreCity, FirestoreArea, FeaturesConfiguration, FirestoreService, FirestoreCategory, HomepageAd, AdPlacement } from '@/types/firestore';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { useLoading } from '@/contexts/LoadingContext';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Clock, ListChecks, Loader2, FileText } from 'lucide-react';
import AdBannerCard from '@/components/shared/AdBannerCard';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { getCache, setCache } from '@/lib/client-cache';

// Lazy load components
const HeroCarousel = dynamic(() => import('@/components/home/HeroCarousel').then(mod => mod.HeroCarousel), {
  loading: () => <Skeleton className="h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full rounded-lg" />,
  ssr: true,
});

const HomeCategoriesSection = dynamic(() => import('@/components/home/HomeCategoriesSection'), {
  loading: () => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="overflow-hidden h-full flex flex-col group">
          <Skeleton className="w-full aspect-square bg-muted" />
          <div className="p-3 text-center"><Skeleton className="h-5 w-3/4 mx-auto bg-muted mt-1" /></div>
        </div>
      ))}
    </div>
  ),
});

const HomeBlogSection = dynamic(() => import('@/components/home/HomeBlogSection'), {
  loading: () => (
    <div className="flex w-full space-x-4 p-1 pb-3 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="w-[250px] sm:w-[280px] flex-shrink-0 snap-start">
            <Skeleton className="h-32 sm:h-36 w-full" />
            <CardContent className="p-2 sm:p-3">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-full" />
               <Skeleton className="h-3 w-1/2 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
  )
});

const WhyChooseUs = dynamic(() => import('@/components/home/WhyChooseUs'), {
  loading: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
    </div>
  ),
});

const Testimonials = dynamic(() => import('@/components/home/Testimonials'), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-lg" />)}
    </div>
  ),
});

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: false,
  homepageCategoryVisibility: {},
  ads: [],
};

interface HomePageClientProps {
  citySlug?: string;
  areaSlug?: string;
  breadcrumbItems?: BreadcrumbItem[];
}

const HomepageServiceCard: React.FC<{ service: FirestoreService }> = ({ service }) => {
  const router = useRouter();
  const { showLoading } = useLoading();
  const { user, triggerAuthRedirect } = useAuth();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    showLoading();
    const targetUrl = `/service/${service.slug}`;
    if (!user) {
      triggerAuthRedirect(targetUrl);
    } else {
      router.push(targetUrl);
    }
  };
  
  const formatTaskTime = (value?: number, unit?: 'hours' | 'minutes'): string | null => {
    if (value === undefined || value === null || !unit) return null;
    if (value <= 0) return null;
    return `${value} ${unit}`;
  };
  const taskTimeDisplay = formatTaskTime(service.taskTimeValue, service.taskTimeUnit);

  return (
    <Card
      className="w-full h-full snap-start overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 cursor-pointer flex flex-col"
      onClick={handleClick}
      role="link"
      aria-label={`View details for ${service.name}`}
    >
      <div className="relative w-full h-28 sm:h-32">
        <Image
          src={service.imageUrl || "https://placehold.co/300x180.png"}
          alt={service.name}
          fill
          sizes="(max-width: 640px) 50vw, 220px"
          className="object-cover"
          data-ai-hint={service.imageHint || service.name.toLowerCase().split(' ').slice(0,2).join(' ')}
        />
      </div>
      <CardContent className="p-2 sm:p-3 flex-grow flex flex-col justify-between">
        <div>
          <h4 className="text-xs sm:text-sm font-semibold truncate text-foreground group-hover:text-primary">{service.name}</h4>
          {taskTimeDisplay && (
            <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center mt-0.5">
              <Clock className="h-3 w-3 mr-1" /> {taskTimeDisplay}
            </p>
          )}
        </div>
        <p className="text-sm sm:text-base font-medium text-primary mt-1">₹{service.discountedPrice ?? service.price}</p>
      </CardContent>
    </Card>
  );
};

const HomepageServiceCarousel: React.FC<{ services: FirestoreService[] }> = ({ services }) => {
  return (
    <Carousel
      opts={{
        align: "start",
        dragFree: true, // This enables drag-to-scroll behavior
      }}
      className="w-full"
    >
      <CarouselContent className="-ml-2 md:-ml-4">
        {services.map((service) => (
          <CarouselItem key={service.id} className="pl-2 md:pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6">
            <div className="h-full">
              <HomepageServiceCard service={service} />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden md:flex" />
      <CarouselNext className="hidden md:flex" />
    </Carousel>
  );
};

export default function HomePageClient({ citySlug, areaSlug, breadcrumbItems }: HomePageClientProps) {
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const [structuredData, setStructuredData] = useState<Record<string, any> | null>(null);
  const [seoSettings, setSeoSettings] = useState<FirestoreSEOSettings | null>(null);
  const [pageH1, setPageH1] = useState<string | undefined>(undefined);
  const { showLoading } = useLoading();

  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(() => getCache<FeaturesConfiguration>('featuresConfig') || defaultFeaturesConfig);
  const [popularServices, setPopularServices] = useState<FirestoreService[]>(() => getCache<FirestoreService[]>('popularServices') || []);
  const [recentServices, setRecentServices] = useState<FirestoreService[]>(() => getCache<FirestoreService[]>('recentServices') || []);
  const [categoryWiseServicesData, setCategoryWiseServicesData] = useState<Array<{category: FirestoreCategory, services: FirestoreService[] }>>(() => getCache<Array<{category: FirestoreCategory, services: FirestoreService[] }>>('categoryWiseServices') || []);
  const [activeAds, setActiveAds] = useState<HomepageAd[]>([]);
  
  const [isLoadingPageData, setIsLoadingPageData] = useState(() => !getCache('pageH1'));
  const [isLoadingFeaturesConfig, setIsLoadingFeaturesConfig] = useState(() => !getCache('featuresConfig'));
  const [isLoadingPopular, setIsLoadingPopular] = useState(() => !getCache('popularServices'));
  const [isLoadingRecent, setIsLoadingRecent] = useState(() => !getCache('recentServices'));
  const [isLoadingCategoryWise, setIsLoadingCategoryWise] = useState(() => !getCache('categoryWiseServices'));

  const fetchPageSpecificData = useCallback(async () => {
    const cachedH1 = getCache<string>('pageH1');
    const cachedSeoSettings = getCache<FirestoreSEOSettings>('seoSettings');
    const cachedStructuredData = getCache<Record<string, any>>('structuredData');
    
    if (cachedH1 && cachedSeoSettings && cachedStructuredData) {
        setPageH1(cachedH1);
        setSeoSettings(cachedSeoSettings);
        setStructuredData(cachedStructuredData);
        setIsLoadingPageData(false);
        return;
    }
    
    setIsLoadingPageData(true);
      const fetchedSeoSettings = await getGlobalSEOSettings();
      setSeoSettings(fetchedSeoSettings);
      setCache('seoSettings', fetchedSeoSettings);

      let currentH1 = fetchedSeoSettings.homepageH1;
      let fetchedCityData: FirestoreCity | null = null;
      let fetchedAreaData: FirestoreArea | null = null;
      let currentCityNameForLd = fetchedSeoSettings.structuredDataLocality;

      if (citySlug) {
        try {
            const cityQuery = query(collection(db, 'cities'), where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
            const citySnap = await getDocs(cityQuery);
            if (!citySnap.empty) {
                fetchedCityData = {id: citySnap.docs[0].id, ...citySnap.docs[0].data()} as FirestoreCity;
                currentH1 = fetchedCityData.h1_title || fetchedSeoSettings.homepageH1?.replace("FixBro", fetchedCityData.name) || `Services in ${fetchedCityData.name}`;
                currentCityNameForLd = fetchedCityData.name;
            }
        } catch (e) { console.error("Error fetching city data for H1/LD:", e); }
      }

      if (citySlug && areaSlug && fetchedCityData) {
        try {
            const areaQuery = query(collection(db, 'areas'), where('slug', '==', areaSlug), where('cityId', '==', fetchedCityData.id), where('isActive', '==', true), limit(1));
            const areaSnap = await getDocs(areaQuery);
            if (!areaSnap.empty) {
                fetchedAreaData = {id: areaSnap.docs[0].id, ...areaSnap.docs[0].data()} as FirestoreArea;
                currentH1 = fetchedAreaData.h1_title || `Services in ${fetchedAreaData.name}, ${fetchedCityData.name}`;
            }
        } catch (e) { console.error("Error fetching area data for H1/LD:", e); }
      }
      setPageH1(currentH1);
      setCache('pageH1', currentH1);

      const siteName = fetchedSeoSettings.siteName || 'FixBro';
      const defaultOgImage = (process.env.NEXT_PUBLIC_BASE_URL || 'https://fixbro.in') + '/android-chrome-512x512.png';

      let webSettingsData: GlobalWebSettings | null = null;
      try {
        const webSettingsDocRef = doc(db, "webSettings", "global");
        const webSettingsSnap = await getDoc(webSettingsDocRef);
        if (webSettingsSnap.exists()) {
          webSettingsData = webSettingsSnap.data() as GlobalWebSettings;
        }
      } catch (e) { console.error("Error fetching webSettings for LD+JSON:", e); }

      const ogImage = webSettingsData?.websiteIconUrl || webSettingsData?.logoUrl || fetchedSeoSettings.structuredDataImage || defaultOgImage;
      const pageUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fixbro.in';
      let specificPageUrl = pageUrl;
      if (citySlug && areaSlug) specificPageUrl = `${pageUrl}/${citySlug}/${areaSlug}`;
      else if (citySlug) specificPageUrl = `${pageUrl}/${citySlug}`;

      const ldData: Record<string, any> = {
        '@context': 'https://schema.org',
        '@type': fetchedSeoSettings.structuredDataType || 'LocalBusiness',
        name: fetchedAreaData?.name ? `${siteName} - ${fetchedAreaData.name}, ${fetchedCityData?.name}` : (fetchedCityData?.name ? `${siteName} - ${fetchedCityData.name}` : (fetchedSeoSettings.structuredDataName || siteName)),
        image: ogImage,
        url: specificPageUrl,
        telephone: webSettingsData?.contactMobile || fetchedSeoSettings.structuredDataTelephone,
      };
      if (webSettingsData?.contactEmail) ldData.email = webSettingsData.contactEmail;

      const addressData: Record<string, any> = { '@type': 'PostalAddress' };
      if (fetchedAreaData?.name) addressData.addressLocality = fetchedAreaData.name;
      else if (fetchedCityData?.name) addressData.addressLocality = fetchedCityData.name;
      else if (fetchedSeoSettings.structuredDataLocality) addressData.addressLocality = fetchedSeoSettings.structuredDataLocality;

      if (fetchedCityData?.name && fetchedAreaData?.name) addressData.addressRegion = fetchedCityData.name;
      else if (fetchedSeoSettings.structuredDataRegion) addressData.addressRegion = fetchedSeoSettings.structuredDataRegion;

      if (fetchedSeoSettings.structuredDataStreetAddress) addressData.streetAddress = fetchedSeoSettings.structuredDataStreetAddress;
      if (fetchedSeoSettings.structuredDataPostalCode) addressData.postalCode = fetchedSeoSettings.structuredDataPostalCode;
      addressData.addressCountry = fetchedSeoSettings.structuredDataCountry || 'IN';

      if (Object.keys(addressData).length > 1) {
          ldData.address = addressData;
      }

      if (fetchedSeoSettings.socialProfileUrls) {
        const sameAsUrls = Object.values(fetchedSeoSettings.socialProfileUrls).filter(url => url && url.trim() !== '');
        if (sameAsUrls.length > 0) {
          ldData.sameAs = sameAsUrls;
        }
      }
      setStructuredData(ldData);
      setCache('structuredData', ldData);
      setIsLoadingPageData(false);
  }, [citySlug, areaSlug]);

  const fetchFeaturesConfigAndData = useCallback(async () => {
    let currentFeaturesConfig = getCache<FeaturesConfiguration>('featuresConfig');
    if (!currentFeaturesConfig) setIsLoadingFeaturesConfig(true);
    let fetchedFromFirestore = false;

    if (!currentFeaturesConfig) {
      try {
        const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          currentFeaturesConfig = { ...defaultFeaturesConfig, ...(docSnap.data() as FeaturesConfiguration) };
        } else {
          currentFeaturesConfig = defaultFeaturesConfig;
        }
        setFeaturesConfig(currentFeaturesConfig);
        setCache('featuresConfig', currentFeaturesConfig);
        fetchedFromFirestore = true;
      } catch (error) {
        console.error("Error loading features configuration:", error);
        currentFeaturesConfig = defaultFeaturesConfig;
        setFeaturesConfig(currentFeaturesConfig);
      } finally {
        setIsLoadingFeaturesConfig(false);
      }
    }
    setActiveAds((currentFeaturesConfig.ads || []).filter(ad => ad.isActive).sort((a, b) => a.order - b.order));

    const fetchServiceData = async (
      shouldFetch: boolean, 
      cacheKey: string, 
      queryFn: () => any, // Firestore query
      setter: React.Dispatch<React.SetStateAction<any>>,
      setLoading: React.Dispatch<React.SetStateAction<boolean>>
    ) => {
      if (!shouldFetch) return;
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        setter(cachedData);
        setLoading(false);
        return;
      }
      if (!fetchedFromFirestore) setLoading(true); // only show loading if data isn't already there.
      try {
        const snapshot = await getDocs(queryFn());
        const data = snapshot.docs.map(d => ({...d.data(), id: d.id } as FirestoreService));
        setter(data);
        setCache(cacheKey, data);
      } catch (e) { console.error(`Error fetching ${cacheKey}:`, e); }
      if (!fetchedFromFirestore) setLoading(false);
    };

    fetchServiceData(currentFeaturesConfig.showRecentlyAddedServices, 'recentServices', () => query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("createdAt", "desc"), limit(10)), setRecentServices, setIsLoadingRecent);
    fetchServiceData(currentFeaturesConfig.showMostPopularServices, 'popularServices', () => query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("rating", "desc"), orderBy("reviewCount", "desc"), limit(10)), setPopularServices, setIsLoadingPopular);

    if (currentFeaturesConfig.showCategoryWiseServices) {
      const cachedCategoryData = getCache<any>('categoryWiseServices');
      if (cachedCategoryData) {
        setCategoryWiseServicesData(cachedCategoryData);
        setIsLoadingCategoryWise(false);
      } else {
        if (!fetchedFromFirestore) setIsLoadingCategoryWise(true);
        try {
            const enabledCategoryIds = Object.entries(currentFeaturesConfig.homepageCategoryVisibility || {})
                .filter(([, isVisible]) => isVisible)
                .map(([catId]) => catId);

            if (enabledCategoryIds.length > 0) {
                const categoriesQuery = query(collection(db, "adminCategories"), where(documentId(), "in", enabledCategoryIds), orderBy("order", "asc"));
                const categoriesSnapshot = await getDocs(categoriesQuery);
                const enabledCategories = categoriesSnapshot.docs.map(d => ({...d.data(), id: d.id } as FirestoreCategory));
                
                const categoryServicesPromises = enabledCategories.map(async (cat) => {
                    const subCategoriesSnapshot = await getDocs(query(collection(db, "adminSubCategories"), where("parentId", "==", cat.id)));
                    const subCategoryIds = subCategoriesSnapshot.docs.map(subDoc => subDoc.id);

                    let servicesForCategory: FirestoreService[] = [];
                    if (subCategoryIds.length > 0) {
                         const servicesQuery = query(collection(db, "adminServices"), where("isActive", "==", true), where("subCategoryId", "in", subCategoryIds), orderBy("name", "asc"), limit(10));
                         const servicesSnapshot = await getDocs(servicesQuery);
                         servicesForCategory = servicesSnapshot.docs.map(sDoc => ({...sDoc.data(), id: sDoc.id} as FirestoreService));
                    }
                    return { category: cat, services: servicesForCategory };
                });
                const resolvedCategoryServices = (await Promise.all(categoryServicesPromises)).filter(cs => cs.services.length > 0);
                setCategoryWiseServicesData(resolvedCategoryServices);
                setCache('categoryWiseServices', resolvedCategoryServices);
            } else {
                setCategoryWiseServicesData([]);
            }
        } catch (e) { console.error("Error fetching category-wise services:", e); }
        if (!fetchedFromFirestore) setIsLoadingCategoryWise(false);
      }
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    if (!isLoadingAppSettings) {
      fetchPageSpecificData();
      fetchFeaturesConfigAndData();
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchFeaturesConfigAndData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLoadingAppSettings, fetchPageSpecificData, fetchFeaturesConfigAndData]);
  

  const handleSimpleNavigation = useCallback((intendedHref: string) => {
    showLoading();
    router.push(intendedHref);
  }, [router, showLoading]);

  const handleViewAllCategoriesClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      handleSimpleNavigation("/categories");
  }, [handleSimpleNavigation]);

  const handleBookServiceCtaClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      handleSimpleNavigation("/categories");
  }, [handleSimpleNavigation]);

  const displayHeroCarousel = !isLoadingAppSettings && (appConfig.enableHeroCarousel ?? true);
  const finalH1 = pageH1 || seoSettings?.homepageH1 || 'Choose Your Service';
  
  const renderAdsByPlacement = (placement: AdPlacement) => {
    const adsForPlacement = activeAds.filter(ad => ad.placement === placement);
    if (adsForPlacement.length === 0) return null;
    return (
      <div className="container mx-auto px-4 my-6 md:my-8 space-y-4">
        {adsForPlacement.map(ad => <AdBannerCard key={ad.id} ad={ad} />)}
      </div>
    );
  };
  
  const renderServiceSection = (title: string, services: FirestoreService[], icon: React.ReactNode, isLoadingSection: boolean, placementForAdsAfter?: AdPlacement) => {
    if (isLoadingSection && services.length === 0) { // Only show skeleton if no cached data available
      return (
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
              {icon} {title}
            </h2>
            <div className="flex w-full space-x-4 p-1 pb-3 overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <Card key={i} className="w-[200px] sm:w-[220px] flex-shrink-0 snap-start">
                    <Skeleton className="h-28 sm:h-32 w-full" />
                    <CardContent className="p-2 sm:p-3">
                      <Skeleton className="h-4 w-3/4 mb-1" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
          </div>
        </section>
      );
    }
    if (services.length === 0 && !isLoadingSection) return null; 
    return (
        <>
        <section className="py-8 md:py-12">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
                    {icon} {title}
                </h2>
                <HomepageServiceCarousel services={services} />
            </div>
        </section>
        {placementForAdsAfter && renderAdsByPlacement(placementForAdsAfter)}
        </>
    );
  };

  if (!isMounted || isLoadingPageData) { // Simplified initial skeleton
    return (
        <div className="flex flex-col">
            <div className="container mx-auto px-4 pt-4 md:pt-6 mb-4 md:mb-6">
                <Skeleton className="h-5 w-1/3" />
            </div>
            <section className="py-6 md:py-10">
                <div className="container mx-auto px-4">
                    <Skeleton className="h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full rounded-lg" />
                </div>
            </section>
            <div className="container mx-auto px-4 my-6 md:my-8"><Skeleton className="h-24 w-full rounded-lg" /></div>
            <section className="py-8 md:py-12 bg-secondary/30">
                <div className="container mx-auto px-4">
                    <div className="text-center mb-8 md:mb-12"><Skeleton className="h-8 w-1/2 mx-auto mb-2" /><Skeleton className="h-4 w-3/4 mx-auto" /></div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
                        {[...Array(6)].map((_, i) => (<div key={i} className="overflow-hidden h-full flex flex-col group"><Skeleton className="w-full aspect-square bg-muted" /><div className="p-3 text-center"><Skeleton className="h-5 w-3/4 mx-auto bg-muted mt-1" /></div></div>))}
                    </div>
                </div>
            </section>
        </div>
    );
  }

  return (
    <>
      {structuredData && <JsonLdScript data={structuredData} idSuffix={citySlug || areaSlug || 'homepage'} />}
      <div className="flex flex-col">
        {breadcrumbItems && breadcrumbItems.length > 0 && (
            <div className="container mx-auto px-4 pt-4 md:pt-6">
               <Breadcrumbs items={breadcrumbItems} />
            </div>
        )}
        {displayHeroCarousel && (
          <section className="py-6 md:py-10">
            <div className="container mx-auto px-4 overflow-hidden">
              <HeroCarousel />
            </div>
          </section>
        )}
        {renderAdsByPlacement('AFTER_HERO_CAROUSEL')}

        <section className="py-8 md:py-12 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8 md:mb-12">
              <h1 className="text-2xl md:text-3xl font-headline font-semibold text-foreground">
                {finalH1}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm md:text-base">
                Discover a wide range of services to meet your needs{citySlug ? ` in ${citySlug.charAt(0).toUpperCase() + citySlug.slice(1).replace(/-/g, ' ')}` : ''}{areaSlug ? `, ${areaSlug.charAt(0).toUpperCase() + areaSlug.slice(1).replace(/-/g, ' ')}` : ''}.
              </p>
            </div>
            <HomeCategoriesSection />
            
            <div className="text-center mt-8 md:mt-12">
              <Button
                variant="outline"
                size="lg"
                onClick={handleViewAllCategoriesClick}
              >
                View All Categories
              </Button>
            </div>
          </div>
        </section>
        
        {featuresConfig.showMostPopularServices && renderServiceSection("Most Popular Services", popularServices, <Star className="mr-2 h-6 w-6 text-yellow-500" />, isLoadingPopular, 'AFTER_POPULAR_SERVICES')}
        {featuresConfig.showRecentlyAddedServices && renderServiceSection("Recently Added Services", recentServices, <Clock className="mr-2 h-6 w-6 text-blue-500" />, isLoadingRecent, 'AFTER_RECENTLY_ADDED_SERVICES')}
        
        {featuresConfig.showCategoryWiseServices && (
            <>
            <section className="py-8 md:py-12">
                <div className="container mx-auto px-4">
                     <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
                        <ListChecks className="mr-2 h-6 w-6 text-green-500" /> Services By Category
                    </h2>
                    {(isLoadingCategoryWise && categoryWiseServicesData.length === 0) ? (
                         <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : categoryWiseServicesData.length > 0 ? (
                          categoryWiseServicesData.map(catGroup => (
                            <div key={catGroup.category.id} className="mb-8">
                                <h3 className="text-xl font-semibold mb-4 text-left text-foreground">{catGroup.category.name}</h3>
                                {catGroup.services.length > 0 ? (
                                    <HomepageServiceCarousel services={catGroup.services} />
                                ) : ( <p className="text-sm text-muted-foreground">No services currently available in this category.</p> )}
                            </div>
                          ))
                    ) : (<p className="text-center text-muted-foreground">No category-specific services to display currently.</p>)}
                </div>
            </section>
            {renderAdsByPlacement('AFTER_CATEGORY_SECTIONS')}
            </>
        )}

        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground">
              Why Choose FixBro?
            </h2>
            <WhyChooseUs />
          </div>
        </section>

        <section className="py-8 md:py-12 bg-secondary/30">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground">
              What Our Customers Say
            </h2>
            <Testimonials />
          </div>
        </section>
        
        {featuresConfig.showBlogSection && <HomeBlogSection />}

        {renderAdsByPlacement('BEFORE_FOOTER_CTA')}
        <section className="py-8 md:py-12 text-center bg-primary text-primary-foreground">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold mb-4">
              Ready to get started?
            </h2>
            <p className="text-lg mb-6 max-w-xl mx-auto">
              Book your service today and experience the FixBro difference.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="bg-background text-primary hover:bg-background/90"
              onClick={handleBookServiceCtaClick}
            >
              Book a Service
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
