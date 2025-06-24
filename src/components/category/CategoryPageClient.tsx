
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, usePathname } 
from 'next/navigation';
import type { FirestoreCategory, FirestoreSubCategory, FirestoreService, FirestoreCity, FirestoreArea, CityCategorySeoSetting, AreaCategorySeoSetting } from '@/types/firestore';
import ServiceCard from '@/components/category/ServiceCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home as HomeIconLucide, ShoppingCart as ShoppingCartIcon, PackageSearch, Loader2, ListFilter } from 'lucide-react'; 
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EnrichedSubCategory extends FirestoreSubCategory {
  services: FirestoreService[];
}

interface CategoryPageClientProps {
  categorySlug: string;
  citySlug?: string; 
  areaSlug?: string; 
  breadcrumbItems?: BreadcrumbItem[]; 
}

const DEFAULT_FALLBACK_SUB_CATEGORY_ICON = "/android-chrome-512x512.png";

export default function CategoryPageClient({ categorySlug, citySlug, areaSlug, breadcrumbItems: initialBreadcrumbItems }: CategoryPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const currentPathname = usePathname();

  const [category, setCategory] = useState<FirestoreCategory | null>(null);
  const [subCategoriesWithServices, setSubCategoriesWithServices] = useState<EnrichedSubCategory[]>([]);
  const [activeSubCategorySlug, setActiveSubCategorySlug] = useState<string | null>(null);
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>(initialBreadcrumbItems || []);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [seoPageH1, setSeoPageH1] = useState<string | null>(null); 
  const [displayPageH1, setDisplayPageH1] = useState<string | null>(null); 

  const subCategoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const stickyNavRef = useRef<HTMLDivElement | null>(null);

  const [isFloatingButtonVisible, setIsFloatingButtonVisible] = useState(false);
  const [isSubCategoryPopoverOpen, setIsSubCategoryPopoverOpen] = useState(false);
  
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const fetchCategoryDataAndServices = async () => {
      if (!categorySlug || !isMounted) {
        setIsLoading(true); 
        return;
      }

      setIsLoading(true);
      setError(null);
      setCategory(null);
      setSubCategoriesWithServices([]);
      setSeoPageH1(null);
      setDisplayPageH1(null);
      setActiveSubCategorySlug(null);
      if (!initialBreadcrumbItems) setBreadcrumbItems([]); 

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
        
        if (!initialBreadcrumbItems) {
          let dynamicBreadcrumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
          if (fetchedCityData) dynamicBreadcrumbs.push({ label: fetchedCityData.name, href: `/${citySlug}` });
          if (fetchedCityData && fetchedAreaData) dynamicBreadcrumbs.push({ label: fetchedAreaData.name, href: `/${citySlug}/${areaSlug}`});
          else if (fetchedCityData && !areaSlug) dynamicBreadcrumbs.push({ label: `Category: ${getOverriddenCategoryName(foundCategory.id, foundCategory.name)}` }); 
          
          if (fetchedAreaData) dynamicBreadcrumbs.push({ label: getOverriddenCategoryName(foundCategory.id, foundCategory.name) });
          else if (!fetchedCityData && !areaSlug) dynamicBreadcrumbs.push({ label: getOverriddenCategoryName(foundCategory.id, foundCategory.name) }); 
          setBreadcrumbItems(dynamicBreadcrumbs);
        }

        const globalSeoSettings = await getGlobalSEOSettings();
        let baseH1 = foundCategory.h1_title || getOverriddenCategoryName(foundCategory.id, foundCategory.name);
        let finalDisplayH1 = baseH1;

        if (fetchedAreaData && fetchedCityData) { 
            const areaOverrideSnap = await getDocs(query(collection(db, "areaCategorySeoSettings"), where("areaId", "==", fetchedAreaData.id), where("categoryId", "==", foundCategory.id), where("isActive", "==", true), limit(1)));
            if (!areaOverrideSnap.empty) baseH1 = (areaOverrideSnap.docs[0].data() as AreaCategorySeoSetting).h1_title || baseH1;
            else baseH1 = replacePlaceholders(globalSeoSettings.areaCategoryPageH1Pattern, { areaName: fetchedAreaData.name, cityName: fetchedCityData.name, categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = `${baseH1} in ${fetchedAreaData.name}, ${fetchedCityData.name}`;
        } else if (fetchedCityData) { 
            const cityOverrideSnap = await getDocs(query(collection(db, "cityCategorySeoSettings"), where("cityId", "==", fetchedCityData.id), where("categoryId", "==", foundCategory.id), where("isActive", "==", true), limit(1)));
            if (!cityOverrideSnap.empty) baseH1 = (cityOverrideSnap.docs[0].data() as CityCategorySeoSetting).h1_title || baseH1;
            else baseH1 = replacePlaceholders(globalSeoSettings.cityCategoryPageH1Pattern, { cityName: fetchedCityData.name, categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = `${baseH1} in ${fetchedCityData.name}`;
        } else { 
            baseH1 = replacePlaceholders(globalSeoSettings.categoryPageH1Pattern, { categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = baseH1;
        }
        setSeoPageH1(baseH1); 
        setDisplayPageH1(finalDisplayH1);
        
        const subCategoriesRef = collection(db, "adminSubCategories");
        const qSubCategories = query(subCategoriesRef, where("parentId", "==", foundCategory.id), orderBy("order", "asc"));
        const subCategoriesSnapshot = await getDocs(qSubCategories);
        
        const enrichedSubCats: EnrichedSubCategory[] = [];
        for (const subDoc of subCategoriesSnapshot.docs) {
          const subCategoryData = { id: subDoc.id, ...subDoc.data() } as FirestoreSubCategory;
          const servicesRef = collection(db, "adminServices");
          const qServices = query(servicesRef, where("subCategoryId", "==", subCategoryData.id), where("isActive", "==", true), orderBy("name", "asc"));
          const servicesSnapshot = await getDocs(qServices);
          const services = servicesSnapshot.docs.map(serviceDoc => ({ id: serviceDoc.id, ...serviceDoc.data() } as FirestoreService));
          enrichedSubCats.push({ ...subCategoryData, services });
        }
        setSubCategoriesWithServices(enrichedSubCats);
        if (enrichedSubCats.length > 0) setActiveSubCategorySlug(enrichedSubCats[0].slug);

      } catch (err: any) {
        console.error("Error fetching category client data:", err);
        const errorMessage = err.message || "Failed to load category details.";
        setError(errorMessage);
        toast({ title: "Error Loading Data", description: errorMessage, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategoryDataAndServices();
  }, [categorySlug, citySlug, areaSlug, isMounted, toast, initialBreadcrumbItems]);

  useEffect(() => {
    if (typeof window === 'undefined' || !category || !isMounted) return;
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'fixbroCategoryNameOverrides' && category && !initialBreadcrumbItems) { 
        
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [category, isMounted, initialBreadcrumbItems]);

  useEffect(() => {
    if (!isMounted) return;
    const scrollThreshold = 300; 
    const handleScroll = () => { setIsFloatingButtonVisible(window.scrollY > scrollThreshold); };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMounted]);

  const handleSubCategoryClick = useCallback((slug: string) => {
    setActiveSubCategorySlug(slug);
    const element = subCategoryRefs.current[slug];
    if (element) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - (stickyNavRef.current?.offsetHeight || 80); // Adjust offset
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
    
    const subCatIndex = subCategoriesWithServices.findIndex(sc => sc.slug === slug);
    if (carouselApi && subCatIndex > -1) {
      carouselApi.scrollTo(subCatIndex);
    }
    
    setIsSubCategoryPopoverOpen(false);
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

  if (!isMounted || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        {initialBreadcrumbItems && <Skeleton className="h-5 w-1/2 mb-6" />}
        <div className="mb-6 flex items-center justify-between"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></div>
        <Skeleton className="h-10 w-3/4 mb-2" /><Skeleton className="h-6 w-1/2 mb-8" />
        <Skeleton className="h-12 w-full mb-6" /> 
        <div className="pt-6"><Skeleton className="h-8 w-1/3 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-72 w-full" />))}
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
  
  if (!category || !displayPageH1) {
     return ( 
      <div className="container mx-auto px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <PackageSearch className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Category Not Found</h2>
        <p className="text-muted-foreground mb-6">The category "{categorySlug}" does not exist.</p>
        <Button variant="outline" onClick={(e) => handleSimpleNav(e, '/categories')}>View All Categories</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      {seoPageH1 && <h1 className="sr-only">{seoPageH1}</h1>}
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}
      <nav className="mb-6 flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()} className="flex items-center">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button variant="ghost" className="text-sm text-muted-foreground hover:text-primary" onClick={(e) => handleSimpleNav(e, '/')}>
            <HomeIconLucide className="mr-2 h-4 w-4" /> Home
        </Button>
      </nav>
      
      <h2 className="text-3xl md:text-4xl font-headline font-semibold mb-2 text-foreground">
        {displayPageH1}
      </h2>
      <p className="text-muted-foreground mb-8">Browse services under {getOverriddenCategoryName(category.id, category.name)}{areaSlug && citySlug ? ` in ${areaSlug.replace(/-/g, ' ')}, ${citySlug.replace(/-/g, ' ')}` : citySlug ? ` in ${citySlug.replace(/-/g, ' ')}` : ""}.</p>

      {subCategoriesWithServices.length > 0 ? (
        <>
          <div ref={stickyNavRef} className="sticky top-16 z-30 bg-background/80 backdrop-blur-md py-3 -mx-4 px-4 border-b mb-6 shadow-sm">
            <Carousel setApi={setCarouselApi} opts={{ align: "center" }} className="w-full">
              <CarouselContent className="-ml-2">
                {subCategoriesWithServices.map(subCat => (
                  <CarouselItem key={subCat.id} className="pl-2 basis-auto">
                    <Button
                      variant={activeSubCategorySlug === subCat.slug ? "default" : "outline"}
                      onClick={() => handleSubCategoryClick(subCat.slug)}
                      className="flex items-center gap-2 px-3 py-1.5 h-auto md:px-4 md:py-2 md:h-10 text-xs md:text-sm whitespace-nowrap"
                    >
                      {subCat.imageUrl ? (
                        <div className="w-4 h-4 md:w-5 md:h-5 relative rounded-sm overflow-hidden mr-1 md:mr-1.5 flex-shrink-0">
                           <Image src={subCat.imageUrl} alt={subCat.name} fill sizes="20px" className="object-cover" data-ai-hint={subCat.imageHint || "sub-category icon"}/>
                        </div>
                      ) : (
                        <div className="w-4 h-4 md:w-5 md:h-5 relative mr-1 md:mr-1.5 flex-shrink-0">
                           <Image src={DEFAULT_FALLBACK_SUB_CATEGORY_ICON} alt={`${subCat.name} icon`} fill sizes="20px" className="object-contain"/>
                        </div>
                      )}
                      {subCat.name}
                    </Button>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>

          <div className="space-y-12">
            {subCategoriesWithServices.map(subCat => {
              return (
                <section 
                  key={subCat.id} 
                  id={`section-${subCat.slug}`} 
                  ref={el => subCategoryRefs.current[subCat.slug] = el}
                  className="scroll-mt-40 md:scroll-mt-32 pt-2" 
                >
                  <div className="flex items-center mb-6">
                    {subCat.imageUrl ? (
                       <div className="w-10 h-10 relative rounded-md overflow-hidden mr-3 shadow">
                           <Image src={subCat.imageUrl} alt={subCat.name} fill sizes="40px" className="w-full h-full object-cover" data-ai-hint={subCat.imageHint || "sub-category title"}/>
                       </div>
                    ) : (
                      <div className="w-8 h-8 relative mr-3 flex-shrink-0">
                        <Image src={DEFAULT_FALLBACK_SUB_CATEGORY_ICON} alt={`${subCat.name} icon`} fill sizes="32px" className="object-contain"/>
                      </div>
                    )}
                    <h3 className="text-2xl font-headline font-medium text-foreground">{subCat.name}</h3>
                  </div>
                  {subCat.services.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {subCat.services.map(service => (
                        <ServiceCard key={service.id} service={service} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No services available in this sub-category yet.</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-center py-10">
            <PackageSearch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No sub-categories or services available for {displayPageH1} yet.</p>
        </div>
      )}
      
      {isFloatingButtonVisible && subCategoriesWithServices.length > 1 && (
        <Popover open={isSubCategoryPopoverOpen} onOpenChange={setIsSubCategoryPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="default"
              size="icon"
              className="fixed bottom-28 right-6 h-14 w-14 rounded-full shadow-xl z-40 flex items-center justify-center"
              aria-label="Sub-category shortcuts"
            >
              <ListFilter className="h-7 w-7" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 flex flex-col max-h-[50vh] mb-1" side="top" align="end">
            <div className="text-sm font-medium text-muted-foreground px-4 py-3 border-b">
              Jump to Sub-category
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                    {subCategoriesWithServices.map(subCat => (
                        <Button
                            key={`popover-${subCat.id}`}
                            variant="ghost"
                            className="w-full justify-start text-sm h-auto py-2.5 px-3 rounded-md"
                            onClick={() => handleSubCategoryClick(subCat.slug)}
                        >
                            {subCat.imageUrl ? (
                                <div className="w-5 h-5 relative rounded-sm overflow-hidden mr-2 flex-shrink-0">
                                <Image src={subCat.imageUrl} alt="" fill sizes="20px" className="object-cover" data-ai-hint={subCat.imageHint || "icon"}/>
                                </div>
                            ) : (
                                <div className="w-5 h-5 relative mr-2 flex-shrink-0">
                                <Image src={DEFAULT_FALLBACK_SUB_CATEGORY_ICON} alt="" fill sizes="20px" className="object-contain"/>
                                </div>
                            )}
                            <span className="truncate">{subCat.name}</span>
                        </Button>
                    ))}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <StickyCartContinueButton />
    </div>
  );
}
