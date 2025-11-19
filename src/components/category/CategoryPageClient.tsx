
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { FirestoreCategory, FirestoreSubCategory, FirestoreService, FirestoreCity, FirestoreArea, CityCategorySeoSetting, AreaCategorySeoSetting, FirestoreReview } from '@/types/firestore';
import ServiceCard from '@/components/service/ServiceCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home as HomeIconLucide, ShoppingCart as ShoppingCartIcon, PackageSearch, Loader2, Menu, Construction, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getOverriddenCategoryName } from '@/lib/adminDataOverrides';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import StickyCartContinueButton from '@/components/category/StickyCartContinueButton';
import { useAuth } from '@/hooks/useAuth';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { getGlobalSEOSettings, replacePlaceholders } from '@/lib/seoUtils';
import { useLoading } from '@/contexts/LoadingContext';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { getCache, setCache } from '@/lib/client-cache';
import ExploreByCategory from '@/components/category/ExploreByCategory';
import { cn } from '@/lib/utils';
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig';
import SubCategoryCard from '@/components/category/SubCategoryCard';
import SubCategoryFloatingButton from '@/components/category/SubCategoryFloatingButton';

interface EnrichedSubCategory extends FirestoreSubCategory {
  services: FirestoreService[];
  isLoadingServices: boolean;
}

interface CategoryPageCache {
  category: FirestoreCategory | null;
  subCategories: EnrichedSubCategory[];
  h1: string | null;
  displayH1: string | null;
  breadcrumbs: BreadcrumbItem[];
  reviews?: FirestoreReview[];
}


interface CategoryPageClientProps {
  categorySlug: string;
  citySlug?: string;
  areaSlug?: string;
  breadcrumbItems?: BreadcrumbItem[];
}

export default function CategoryPageClient({ categorySlug, citySlug, areaSlug, breadcrumbItems: initialBreadcrumbItems }: CategoryPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const currentPathname = usePathname();
  const { featuresConfig } = useFeaturesConfig();

  const cacheKey = `category-data-${categorySlug}-${citySlug || 'none'}-${areaSlug || 'none'}`;

  const [category, setCategory] = useState<FirestoreCategory | null>(() => getCache<CategoryPageCache>(cacheKey)?.category || null);
  const [subCategoriesWithServices, setSubCategoriesWithServices] = useState<EnrichedSubCategory[]>(() => getCache<CategoryPageCache>(cacheKey)?.subCategories || []);
  const [activeSubCategorySlug, setActiveSubCategorySlug] = useState<string | null>(null);
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>(initialBreadcrumbItems || getCache<CategoryPageCache>(cacheKey)?.breadcrumbs || []);
  
  const [isLoading, setIsLoading] = useState(!getCache(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [seoPageH1, setSeoPageH1] = useState<string | null>(() => getCache<CategoryPageCache>(cacheKey)?.h1 || null);
  const [displayPageH1, setDisplayPageH1] = useState<string | null>(() => getCache<CategoryPageCache>(cacheKey)?.displayH1 || null);

  const subCategoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const stickyNavRef = useRef<HTMLDivElement | null>(null);

  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  // State for scroll-responsive header sync
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Effect for scroll-responsive header and sub-nav bar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const controlHeader = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY.current || currentScrollY < 80) {
        setIsHeaderVisible(true);
      } else {
        setIsHeaderVisible(false);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', controlHeader, { passive: true });
    return () => {
      window.removeEventListener('scroll', controlHeader);
    };
  }, []);


  useEffect(() => {
    const fetchServicesForSubCategory = async (subCategoryId: string) => {
        try {
            const servicesRef = collection(db, "adminServices");
            const qServices = query(servicesRef, where("subCategoryId", "==", subCategoryId), where("isActive", "==", true), orderBy("name", "asc"));
            const servicesSnapshot = await getDocs(qServices);
            const services = servicesSnapshot.docs.map(serviceDoc => ({ id: serviceDoc.id, ...serviceDoc.data() } as FirestoreService));
            
            setSubCategoriesWithServices(prevSubCats => 
                prevSubCats.map(subCat => 
                    subCat.id === subCategoryId 
                        ? { ...subCat, services, isLoadingServices: false }
                        : subCat
                )
            );
        } catch (error) {
            console.error(`Error fetching services for sub-category ${subCategoryId}:`, error);
            setSubCategoriesWithServices(prevSubCats => 
                prevSubCats.map(subCat => 
                    subCat.id === subCategoryId 
                        ? { ...subCat, isLoadingServices: false } // Stop loading on error too
                        : subCat
                )
            );
        }
    };
    
    const fetchCategoryAndSubcategories = async () => {
      if (!categorySlug || !isMounted) {
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      setError(null);

      const cachedData = getCache<CategoryPageCache>(cacheKey);
      if (cachedData) {
        setCategory(cachedData.category);
        setSubCategoriesWithServices(cachedData.subCategories);
        setSeoPageH1(cachedData.h1);
        setDisplayPageH1(cachedData.displayH1);
        setBreadcrumbItems(cachedData.breadcrumbs);
        setIsLoading(false);
        if (cachedData.subCategories.length > 0 && !activeSubCategorySlug) {
            setActiveSubCategorySlug(cachedData.subCategories[0].slug);
        }
        cachedData.subCategories.forEach(sc => {
            if (sc.isLoadingServices) fetchServicesForSubCategory(sc.id);
        });
        return;
      }


      try {
        const categoriesRef = collection(db, "adminCategories");
        const qCategory = query(categoriesRef, where("slug", "==", categorySlug), limit(1));
        const categorySnapshot = await getDocs(qCategory);

        if (categorySnapshot.empty) {
          setError(`Category "${categorySlug}" not found.`);
          toast({ title: "Not Found", description: `The category "${categorySlug}" could not be found.`, variant: "destructive"});
          setIsLoading(false);
          return;
        }

        const foundCategory = { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;
        setCategory(foundCategory);
        
        const subCategoriesRef = collection(db, "adminSubCategories");
        const qSubCategories = query(subCategoriesRef, where("parentId", "==", foundCategory.id), orderBy("order", "asc"));
        const subCategoriesSnapshot = await getDocs(qSubCategories);
        
        const initialSubCats: EnrichedSubCategory[] = subCategoriesSnapshot.docs.map(doc => ({
            ...(doc.data() as FirestoreSubCategory),
            id: doc.id,
            services: [],
            isLoadingServices: true,
          }));

        setSubCategoriesWithServices(initialSubCats);
        if (initialSubCats.length > 0) {
          setActiveSubCategorySlug(initialSubCats[0].slug);
        }

        const globalSeoSettings = await getGlobalSEOSettings();
        let baseH1 = foundCategory.h1_title || getOverriddenCategoryName(foundCategory.id, foundCategory.name);
        let finalDisplayH1 = baseH1;
        let fetchedCityData: FirestoreCity | null = null;
        let fetchedAreaData: FirestoreArea | null = null;

         if (citySlug) {
            const cityQuery = query(collection(db, "cities"), where("slug", "==", citySlug), where('isActive', '==', true), limit(1));
            const citySnap = await getDocs(cityQuery);
            if (!citySnap.empty) fetchedCityData = {id: citySnap.docs[0].id, ...citySnap.docs[0].data()} as FirestoreCity;
        }
        if (citySlug && areaSlug && fetchedCityData) {
             const areaQuery = query(collection(db, "areas"), where("slug", "==", areaSlug), where("cityId", "==", fetchedCityData.id), where('isActive', '==', true), limit(1));
             const areaSnap = await getDocs(areaQuery);
             if (!areaSnap.empty) fetchedAreaData = {id: areaSnap.docs[0].id, ...areaSnap.docs[0].data()} as FirestoreArea;
        }

        const dynamicBreadcrumbs = initialBreadcrumbItems || (() => {
            let crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
            if (fetchedCityData) crumbs.push({ label: fetchedCityData.name, href: `/${citySlug}` });
            if (fetchedAreaData) crumbs.push({ label: fetchedAreaData.name, href: `/${citySlug}/${areaSlug}`});
            crumbs.push({ label: getOverriddenCategoryName(foundCategory.id, foundCategory.name) });
            return crumbs;
        })();
        setBreadcrumbItems(dynamicBreadcrumbs);
       
        if (fetchedAreaData && fetchedCityData) { 
            const areaOverrideSnap = await getDocs(query(collection(db, "areaCategorySeoSettings"), where("areaId", "==", fetchedAreaData.id), where("categoryId", "==", foundCategory.id), where("isActive", "==", true), limit(1)));
            if (!areaOverrideSnap.empty) baseH1 = (areaOverrideSnap.docs[0].data() as AreaCategorySeoSetting).h1_title || baseH1;
            else baseH1 = replacePlaceholders(globalSeoSettings.areaCategoryPageH1Pattern, { areaName: fetchedAreaData.name, cityName: fetchedCityData.name, categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = `${baseH1}`;
        } else if (fetchedCityData) { 
            const cityOverrideSnap = await getDocs(query(collection(db, "cityCategorySeoSettings"), where("cityId", "==", fetchedCityData.id), where("categoryId", "==", foundCategory.id), where("isActive", "==", true), limit(1)));
            if (!cityOverrideSnap.empty) baseH1 = (cityOverrideSnap.docs[0].data() as CityCategorySeoSetting).h1_title || baseH1;
            else baseH1 = replacePlaceholders(globalSeoSettings.cityCategoryPageH1Pattern, { cityName: fetchedCityData.name, categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = `${baseH1}`;
        } else { 
            baseH1 = replacePlaceholders(globalSeoSettings.categoryPageH1Pattern, { categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = baseH1;
        }

        setSeoPageH1(baseH1); 
        setDisplayPageH1(finalDisplayH1);
        setIsLoading(false); 
        
        setCache(cacheKey, {
            category: foundCategory,
            subCategories: initialSubCats,
            h1: baseH1,
            displayH1: finalDisplayH1,
            breadcrumbs: dynamicBreadcrumbs,
        });

        // Fetch services for each subcategory
        initialSubCats.forEach(subCat => fetchServicesForSubCategory(subCat.id));
        
      } catch (err: any) {
        console.error("Error fetching category data:", err);
        setError(err.message || "Failed to load category details.");
        setIsLoading(false);
      }
    };
    
    fetchCategoryAndSubcategories();
  }, [categorySlug, citySlug, areaSlug, isMounted, toast, initialBreadcrumbItems, cacheKey]);

  const handleSubCategoryClick = useCallback((slug: string) => {
    setActiveSubCategorySlug(slug);
    const element = subCategoryRefs.current[slug];
    if (element) {
        const headerOffset = 64; // main header height
        const subNavHeight = stickyNavRef.current?.offsetHeight || 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset - subNavHeight;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
    const subCatIndex = subCategoriesWithServices.findIndex(sc => sc.slug === slug);
    if (carouselApi && subCatIndex > -1) {
      carouselApi.scrollTo(subCatIndex, false);
    }
  }, [carouselApi, subCategoriesWithServices]);
  
  const handleAuthRequiredNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref?: string, action?: () => void) => {
    e.preventDefault();
    const redirectPath = intendedHref || currentPathname;
    if (intendedHref && intendedHref !== currentPathname && !intendedHref.startsWith('#')) showLoading();
    
    if (!user) {
      triggerAuthRedirect(redirectPath);
    } else {
      if (action) action();
      else if (intendedHref) router.push(intendedHref);
    }
  };

  const handleSimpleNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref: string) => {
    e.preventDefault(); 
    if (intendedHref !== currentPathname && !intendedHref.startsWith('#')) showLoading();
    router.push(intendedHref);
  };

  if (!isMounted) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-5 w-1/2 mb-6" />
        <div className="mb-6 flex items-center justify-between"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></div>
        <Skeleton className="h-10 w-3/4 mb-2" /><Skeleton className="h-6 w-1/2 mb-8" />
        <Skeleton className="h-12 w-full mb-6" /> 
        <div className="pt-6"><Skeleton className="h-8 w-1/3 mb-6" />
          <div className="grid grid-cols-1 gap-4">
            {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-36 w-full" />))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <PackageSearch className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Error Loading Category</h2>
        <p className="text-destructive mb-6">{error}</p>
        <Button variant="outline" onClick={(e) => handleSimpleNav(e, '/categories')}>View All Categories</Button>
      </div>
    );
  }
  
  if (isLoading || !category || !displayPageH1) {
     return ( 
      <div className="container mx-auto px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 pb-24">
      {seoPageH1 && <h1 className="sr-only">{seoPageH1}</h1>}
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}
      <nav className="mb-1 flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()} className="flex items-center text-xs sm:text-sm hidden sm:flex">
          <ArrowLeft className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Back
        </Button>
        <Link href="/" passHref>
           <Button variant="ghost" className="text-xs sm:text-sm text-muted-foreground hover:text-primary hidden sm:flex">
             <HomeIconLucide className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Home
           </Button>
        </Link>
      </nav>
      
      <h2 className="text-3xl md:text-4xl font-headline font-semibold mb-2 text-foreground">
        {displayPageH1}
      </h2>
      <p className="text-muted-foreground mb-3">Browse services under {getOverriddenCategoryName(category.id, category.name)}{areaSlug && citySlug ? ` in ${areaSlug.replace(/-/g, ' ')}, ${citySlug.replace(/-/g, ' ')}` : citySlug ? ` in ${citySlug.replace(/-/g, ' ')}` : ""}.</p>

      {subCategoriesWithServices.length > 0 ? (
        <>
          <div
            ref={stickyNavRef}
            className="bg-muted/80 backdrop-blur-md py-3 -mx-4 px-4 border-b mb-6 shadow-sm"
          >
            <Carousel setApi={setCarouselApi} opts={{ align: "start", dragFree: true }} className="w-full relative">
              <CarouselContent className="-ml-2">
                {subCategoriesWithServices.map(subCat => (
                  <CarouselItem key={subCat.id} className="pl-2 basis-auto">
                    <SubCategoryCard 
                        subCategory={subCat}
                        isActive={activeSubCategorySlug === subCat.slug}
                        onClick={() => handleSubCategoryClick(subCat.slug)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="absolute -left-4 top-1/2 -translate-y-1/2 h-6 w-6 disabled:hidden" />
              <CarouselNext className="absolute -right-4 top-1/2 -translate-y-1/2 h-6 w-6 disabled:hidden" />
            </Carousel>
          </div>

          <div className="space-y-2">
          {featuresConfig.showCustomServiceButton && (
            <div
              onClick={(e) => handleAuthRequiredNav(e as unknown as React.MouseEvent<HTMLAnchorElement>, '/custom-service')}
              className="relative block p-3 my-2 gap-3 bg-card border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 w-full cursor-pointer group"
            >
              {/* MOBILE VIEW */}
              <div className="flex flex-row md:hidden w-full gap-3">
                <div className="flex-1 flex flex-col">
                  <h3 className="font-bold text-base leading-tight text-foreground group-hover:text-primary transition-colors">Need Something Else?</h3>
                  <p className="text-xs text-muted-foreground line-clamp-4 mt-1">Can't find the service you’re looking for? Tell us what you need, and we’ll do our best to arrange it for you.</p>
                </div>
                <div className="flex flex-col items-center justify-between flex-shrink-0 w-28">
                  <div className="relative w-full h-28 bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden">
                    <Image src="/custom.png" alt="Custom Service" width={112} height={112} className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
                  </div>
                </div>
              </div>
              <div className="block md:hidden mt-3"><Button size="sm" className="h-9 rounded-md w-full">Request a Custom Service</Button></div>
              {/* DESKTOP VIEW */}
              <div className="hidden md:flex flex-row items-center w-full gap-4">
                <div className="relative w-32 h-40 flex-shrink-0 bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden">
                  <Image src="/custom.png" alt="Custom Service" width={128} height={128} className="object-contain p-3 transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="flex-1 flex flex-col justify-center pt-4">
                  <h3 className="font-bold text-lg leading-tight text-foreground group-hover:text-primary transition-colors">Need Something Else?</h3>
                  <p className="text-sm text-muted-foreground mt-3 max-w-md">Can't find the specific service you’re looking for? Tell us what you need, and we’ll do our best to arrange it for you.</p>
                </div>
                <div className="flex flex-col justify-center pl-4 w-1/2"><Button size="lg" className="h-10 rounded-md w-full">Request a Custom Service</Button></div>
              </div>
            </div>
          )}

            {subCategoriesWithServices.map((subCat) => (
              <section
                key={subCat.id}
                id={`section-${subCat.slug}`}
                ref={(el) => { subCategoryRefs.current[subCat.slug] = el; }}
                className="scroll-mt-40 md:scroll-mt-32 pt-2"
              >
                <div className="flex items-center mb-6">
                  {subCat.imageUrl ? (
                     <div className="w-10 h-10 relative rounded-md overflow-hidden mr-3 shadow">
                         <Image src={subCat.imageUrl} alt={subCat.name} fill sizes="40px" className="w-full h-full object-cover" data-ai-hint={subCat.imageHint || "sub-category title"}/>
                     </div>
                  ) : null }
                  <h3 className="text-2xl font-headline font-medium text-foreground">{subCat.name}</h3>
                </div>
                {subCat.isLoadingServices ? (
                    <div className="grid grid-cols-1 gap-4">
                      {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
                    </div>
                ) : subCat.services.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {subCat.services.map((service, serviceIndex) => (
                      <ServiceCard key={service.id} service={service} priority={serviceIndex < 4} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No services available in this sub-category yet.</p>
                )}
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-10">
            <PackageSearch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No sub-categories or services available for {displayPageH1} yet.</p>
        </div>
      )}
      
      <SubCategoryFloatingButton 
        subCategories={subCategoriesWithServices}
        onSubCategoryClick={handleSubCategoryClick}
        activeSubCategorySlug={activeSubCategorySlug}
      />

      <StickyCartContinueButton />
      
      <ExploreByCategory
        currentCategorySlug={categorySlug}
        currentCitySlug={citySlug}
        areaSlug={areaSlug}
        currentCategoryName={category?.name}
      />
    </div>
  );
}
