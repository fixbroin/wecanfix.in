
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { FirestoreService, FirestoreReview, ClientServiceData, FirestoreCategory, FirestoreSubCategory, ServiceFaqItem } from '@/types/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, ShoppingCart, ArrowLeft, Home as HomeIcon, CheckCircle, ShieldCheck, Clock, Loader2, MessageSquare, MinusCircle, PlusCircle, Ban, HelpCircle } from 'lucide-react';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { getCartEntries, saveCartEntries } from '@/lib/cartManager';
import { getIconComponent } from '@/lib/iconMap';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy, Timestamp, doc, onSnapshot, DocumentSnapshot, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import StickyCartContinueButton from '@/components/category/StickyCartContinueButton';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ServiceDetailPageClientProps {
  serviceSlug: string;
  initialServiceData?: ClientServiceData | null;
  initialH1Title?: string;
  categorySlug?: string;
  areaSlug?: string;
  citySlug?: string;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "service detail";
};

export default function ServiceDetailPageClient({
  serviceSlug,
  initialServiceData,
  initialH1Title,
}: ServiceDetailPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, triggerAuthRedirect } = useAuth();
  const currentPathname = usePathname();

  const [service, setService] = useState<ClientServiceData | null>(initialServiceData || null);
  const [h1Title, setH1Title] = useState<string | null>(initialH1Title || (initialServiceData ? (initialServiceData.h1_title || initialServiceData.name) : null));
  const [quantity, setQuantity] = useState(0);
  const [isLoading, setIsLoading] = useState(!initialServiceData);
  const [serviceReviews, setServiceReviews] = useState<FirestoreReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const processServiceData = useCallback(async (serviceDocSnap: DocumentSnapshot): Promise<ClientServiceData | null> => {
    if (!serviceDocSnap.exists()) {
      console.error('Service not found or inactive in Firestore:', serviceSlug);
      toast({ title: "Not Found", description: "Service details could not be found or it's currently unavailable.", variant: "destructive" });
      return null;
    }

    const firestoreServiceData = { id: serviceDocSnap.id, ...serviceDocSnap.data() } as FirestoreService;

    let parentCategoryName: string | undefined;
    let parentCategorySlug: string | undefined;

    if (firestoreServiceData.subCategoryId) {
        const subCatDoc = await getDoc(doc(db, "adminSubCategories", firestoreServiceData.subCategoryId));
        if (subCatDoc.exists()) {
            const subCategory = subCatDoc.data() as FirestoreSubCategory | undefined;
            if (subCategory && subCategory.parentId) {
                const catDoc = await getDoc(doc(db, "adminCategories", subCategory.parentId));
                if (catDoc.exists()) {
                    const category = catDoc.data() as FirestoreCategory | undefined;
                    if (category) {
                        parentCategoryName = category.name;
                        parentCategorySlug = category.slug;
                    }
                }
            }
        }
    }

    const processedData: ClientServiceData = {
        ...firestoreServiceData,
        isTaxInclusive: firestoreServiceData.isTaxInclusive === true,
        id: serviceDocSnap.id,
        parentCategoryName,
        parentCategorySlug,
        createdAt: firestoreServiceData.createdAt && firestoreServiceData.createdAt instanceof Timestamp ? firestoreServiceData.createdAt.toDate().toISOString() : String(firestoreServiceData.createdAt || ''),
        updatedAt: firestoreServiceData.updatedAt && firestoreServiceData.updatedAt instanceof Timestamp ? firestoreServiceData.updatedAt.toDate().toISOString() : String(firestoreServiceData.updatedAt || ''),
        taskTimeValue: firestoreServiceData.taskTimeValue,
        taskTimeUnit: firestoreServiceData.taskTimeUnit,
        includedItems: firestoreServiceData.includedItems,
        excludedItems: firestoreServiceData.excludedItems,
        allowPayLater: firestoreServiceData.allowPayLater,
        serviceFaqs: firestoreServiceData.serviceFaqs,
    };
    return processedData;
  }, [serviceSlug, toast]);


  const fetchReviewsForService = useCallback(async (serviceId: string) => {
    setIsLoadingReviews(true);
    try {
      const reviewsCollectionRef = collection(db, "adminReviews");
      const qReviews = query(
        reviewsCollectionRef,
        where("serviceId", "==", serviceId),
        where("status", "==", "Approved"),
        orderBy("createdAt", "desc")
      );
      const reviewsSnapshot = await getDocs(qReviews);
      const fetchedReviews = reviewsSnapshot.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as FirestoreReview));
      setServiceReviews(fetchedReviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast({ title: "Error", description: "Could not load service reviews.", variant: "destructive" });
    } finally {
      setIsLoadingReviews(false);
    }
  }, [toast]);


  useEffect(() => {
    if (!isMounted || !serviceSlug) {
      if (!serviceSlug) setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const servicesCollectionRef = collection(db, "adminServices");
    const qService = query(servicesCollectionRef, where("slug", "==", serviceSlug), where("isActive", "==", true), limit(1));

    const unsubscribe = onSnapshot(qService, async (querySnapshot) => {
      if (querySnapshot.empty) {
        setService(null);
        setH1Title("Service Not Found");
        setBreadcrumbItems([{ label: "Home", href: "/" }, { label: "Service Not Found" }]);
        setIsLoading(false);
        toast({ title: "Not Found", description: "Service not found or inactive.", variant: "destructive" });
        return;
      }

      const serviceDocSnap = querySnapshot.docs[0];
      const processedServiceData = await processServiceData(serviceDocSnap);

      if (processedServiceData) {
        setService(processedServiceData);
        setH1Title(processedServiceData.h1_title || processedServiceData.name);

        const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
        if (processedServiceData.parentCategoryName && processedServiceData.parentCategorySlug) {
          crumbs.push({ label: processedServiceData.parentCategoryName, href: `/category/${processedServiceData.parentCategorySlug}` });
        }
        crumbs.push({ label: processedServiceData.name });
        setBreadcrumbItems(crumbs);

        const cartEntries = getCartEntries();
        const existingEntry = cartEntries.find(entry => entry.serviceId === processedServiceData.id);
        setQuantity(existingEntry ? existingEntry.quantity : 0);

        fetchReviewsForService(processedServiceData.id);
      } else {
        setService(null);
        setH1Title("Error Loading Service");
        setBreadcrumbItems([{ label: "Home", href: "/" }, { label: "Error" }]);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error with onSnapshot for service:", error);
      toast({ title: "Error", description: "Could not retrieve service details.", variant: "destructive" });
      setService(null);
      setH1Title("Error Loading Service");
      setIsLoading(false);
    });

    return () => unsubscribe();

  }, [isMounted, serviceSlug, toast, processServiceData, fetchReviewsForService]);


  const updateCartAndShowToast = (newQuantity: number, action: 'added' | 'updated' | 'removed') => {
    if (!service) return;
    let cartEntries = getCartEntries();
    const existingEntryIndex = cartEntries.findIndex(entry => entry.serviceId === service.id);

    if (newQuantity > 0) {
      if (existingEntryIndex > -1) {
        cartEntries[existingEntryIndex].quantity = newQuantity;
      } else {
        cartEntries.push({ serviceId: service.id, quantity: newQuantity });
      }
    } else {
      if (existingEntryIndex > -1) {
        cartEntries.splice(existingEntryIndex, 1);
      }
    }
    saveCartEntries(cartEntries);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: 'fixbroUserCart' }));
    }

    if (action === 'added') {
      toast({ title: "Added to Cart", description: `${service.name} (x${newQuantity}) added to your cart.` });
       logUserActivity(
        'addToCart',
        { serviceId: service.id, serviceName: service.name, quantity: newQuantity, price: service.price },
        user?.uid,
        !user ? getGuestId() : null
      );
    } else if (action === 'updated') {
      toast({ title: "Cart Updated", description: `${service.name} quantity updated to ${newQuantity}.` });
    } else if (action === 'removed') {
      toast({ title: "Item Removed", description: `${service.name} removed from cart.` });
    }
  };

  const handleInitialAddToCart = () => {
    if (!service) return;
    if (!user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    const newQuantity = 1;
    setQuantity(newQuantity);
    updateCartAndShowToast(newQuantity, 'added');
  };

  const handleQuantityChange = (newQuantity: number) => {
    const oldQuantity = quantity;
    if (newQuantity > 0 && oldQuantity === 0 && !user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    setQuantity(newQuantity);
    if (newQuantity === 0 && oldQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'removed');
    } else if (newQuantity > 0 && oldQuantity === 0) {
        updateCartAndShowToast(newQuantity, 'added');
    } else if (newQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'updated');
    }
  };

  const formatTaskTime = (value?: number, unit?: 'hours' | 'minutes'): string | null => {
    if (value === undefined || value === null || !unit) return null;
    if (value <= 0) return null;
    return `${value} ${unit}`;
  };

  if (!isMounted || isLoading) {
    return (
      <div className="container mx-auto px-2 sm:px-4 py-8 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!service || !h1Title) {
    return (
      <div className="container mx-auto px-2 sm:px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <p className="text-lg sm:text-xl text-muted-foreground mb-4">Service not found or it is unavailable.</p>
        <Link href="/" passHref>
          <Button variant="outline">Go back to Home</Button>
        </Link>
      </div>
    );
  }

  const IconComponent = getIconComponent(undefined);
  const effectivePrice = service.discountedPrice && service.discountedPrice < service.price
                         ? service.discountedPrice
                         : service.price;
  const priceSaved = service.discountedPrice && service.discountedPrice < service.price
                     ? service.price - service.discountedPrice
                     : 0;

  const priceSuffix = service.isTaxInclusive && service.taxPercent && service.taxPercent > 0
    ? "(incl. tax)"
    : (!service.isTaxInclusive && service.taxPercent && service.taxPercent > 0 ? `(+${service.taxPercent}% tax)` : "");

  const displayServiceImageUrl = service.imageUrl && service.imageUrl.trim() !== '' ? service.imageUrl : "https://placehold.co/600x400.png";
  const serviceAiHintValue = generateAiHint(service.imageHint, service.name);
  const taskTimeDisplay = formatTaskTime(service.taskTimeValue, service.taskTimeUnit);

  return (
    <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-8 pb-24">
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}
      <nav className="mb-4 sm:mb-6 flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()} className="flex items-center text-xs sm:text-sm">
          <ArrowLeft className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Back
        </Button>
        <Link href="/" passHref>
           <Button variant="ghost" className="text-xs sm:text-sm text-muted-foreground hover:text-primary">
             <HomeIcon className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Home
           </Button>
        </Link>
      </nav>

      <Card className="overflow-hidden shadow-lg mb-6 sm:mb-8">
        <div className="grid md:grid-cols-2 gap-0">
          <div className="relative w-full h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] overflow-hidden md:rounded-l-lg">
            <Image
              src={displayServiceImageUrl}
              alt={service.name}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              data-ai-hint={serviceAiHintValue}
              priority 
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== "https://placehold.co/600x400.png") {
                  target.src = "https://placehold.co/600x400.png";
                }
              }}
            />
          </div>

          <div className="flex flex-col">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <h1 className="text-2xl sm:text-3xl font-headline text-foreground mb-1">{h1Title}</h1>
                {(!service.imageUrl || service.imageUrl.trim() === '') && <IconComponent className="h-8 w-8 sm:h-10 sm:w-10 text-primary ml-2 sm:ml-4 shrink-0" />}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                {service.rating > 0 && (
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`h-4 w-4 sm:h-5 sm:w-5 ${i < Math.floor(service.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}/>
                    ))}
                    <span className="ml-1 text-muted-foreground">({service.rating.toFixed(1)})</span>
                  </div>
                )}
                {service.reviewCount !== undefined && service.reviewCount > 0 && (
                   <span className="text-muted-foreground">· {service.reviewCount} reviews</span>
                )}
                {taskTimeDisplay && (
                  <div className="flex items-center text-muted-foreground">
                    <Clock className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" /> {taskTimeDisplay}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 pt-0 flex-grow space-y-3 sm:space-y-4">
              <CardDescription className="text-sm sm:text-base text-foreground/80 leading-relaxed">{service.description}</CardDescription>
              {service.shortDescription && (<p className="text-xs sm:text-sm text-muted-foreground">{service.shortDescription}</p>)}
              <Separator />
              {service.serviceHighlights && service.serviceHighlights.length > 0 && (
                <div className="space-y-1 sm:space-y-2">
                  <h4 className="text-sm sm:text-md font-semibold text-foreground">Why choose this service?</h4>
                  <ul className="list-none space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-muted-foreground">
                    {service.serviceHighlights.map((highlight, index) => (
                      <li key={index} className="flex items-center"><CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 text-accent flex-shrink-0"/> {highlight}</li>
                    ))}
                  </ul>
                </div>
              )}
              {service.fullDescription && (<><Separator/><div><h4 className="text-sm sm:text-md font-semibold text-foreground mb-1">Please Note</h4><p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap">{service.fullDescription}</p></div></>)}
              
              {service.includedItems && service.includedItems.length > 0 && (
                <><Separator/>
                <div className="space-y-1 sm:space-y-2">
                  <h4 className="text-sm sm:text-md font-semibold text-foreground flex items-center"><PlusCircle className="mr-2 h-4 w-4 text-green-600"/>What's Included:</h4>
                  <ul className="list-none space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-muted-foreground pl-2">
                    {service.includedItems.map((item, index) => (<li key={`inc-${index}`} className="flex items-center"><CheckCircle className="h-3 w-3 mr-2 text-green-500 flex-shrink-0"/>{item}</li>))}
                  </ul>
                </div></>
              )}
              {service.excludedItems && service.excludedItems.length > 0 && (
                <><Separator/>
                <div className="space-y-1 sm:space-y-2">
                  <h4 className="text-sm sm:text-md font-semibold text-foreground flex items-center"><MinusCircle className="mr-2 h-4 w-4 text-red-600"/>What's Not Included:</h4>
                  <ul className="list-none space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-muted-foreground pl-2">
                    {service.excludedItems.map((item, index) => (<li key={`exc-${index}`} className="flex items-center"><Ban className="h-3 w-3 mr-2 text-red-500 flex-shrink-0"/>{item}</li>))}
                  </ul>
                </div></>
              )}

              <Separator />
              <div>
                {service.discountedPrice && service.discountedPrice < service.price ? (
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <p className="text-2xl sm:text-3xl font-bold text-primary">₹{service.discountedPrice.toLocaleString()}</p>
                    <p className="text-md sm:text-lg text-muted-foreground line-through">₹{service.price.toLocaleString()}</p>
                    {priceSaved > 0 && <Badge variant="destructive" className="text-xs">SAVE ₹{priceSaved.toLocaleString()} ({Math.round((priceSaved / service.price) * 100)}%)</Badge>}
                  </div>
                ) : ( <p className="text-2xl sm:text-3xl font-bold text-primary">₹{service.price.toLocaleString()}</p> )}
                {priceSuffix && <p className="text-xs text-muted-foreground">{priceSuffix}</p>}
              </div>
            </CardContent>

            <CardFooter className="p-4 sm:p-6 bg-muted/30 border-t">
              {quantity === 0 ? (
                <Button size="lg" className="w-full text-sm sm:text-base" onClick={handleInitialAddToCart}>
                  <ShoppingCart className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> Add to Cart
                </Button>
              ) : (
                <div className="w-full flex flex-col items-center space-y-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Quantity:</span>
                  <QuantitySelector initialQuantity={quantity} onQuantityChange={handleQuantityChange} minQuantity={0}/>
                </div>
              )}
            </CardFooter>
          </div>
        </div>
      </Card>

      {/* Service FAQs */}
      {service.serviceFaqs && service.serviceFaqs.length > 0 && (
        <Card className="shadow-lg mt-6 sm:mt-8">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl font-headline flex items-center"><HelpCircle className="mr-2 sm:mr-3 h-5 w-5 sm:h-6 sm:w-6 text-primary"/>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <Accordion type="single" collapsible className="w-full">
              {service.serviceFaqs.map((faq, index) => (
                <AccordionItem value={`faq-${index}`} key={faq.id || `s-faq-item-${index}`}>
                  <AccordionTrigger className="text-left text-sm sm:text-base hover:no-underline">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}


      {(serviceReviews.length > 0 || isLoadingReviews) && (
        <Card className="shadow-lg mt-6 sm:mt-8">
            <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-xl sm:text-2xl font-headline flex items-center">
                    <MessageSquare className="mr-2 sm:mr-3 h-5 w-5 sm:h-6 sm:w-6 text-primary"/>Customer Reviews
                </CardTitle>
                {serviceReviews.length > 0 && <CardDescription className="text-sm sm:text-base">{serviceReviews.length} review(s) for this service.</CardDescription>}
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
            {isLoadingReviews ? (
                <div className="space-y-3 sm:space-y-4">
                {[...Array(2)].map((_, i) => ( <div key={i} className="p-3 sm:p-4 border rounded-md"><div className="flex items-center justify-between mb-1 sm:mb-2"><Skeleton className="h-4 sm:h-5 w-1/3" /><Skeleton className="h-3 sm:h-4 w-12" /></div><Skeleton className="h-3 sm:h-4 w-1/4 mb-1 sm:mb-2" /><Skeleton className="h-10 sm:h-12 w-full" /></div>))}
                </div>
            ) : serviceReviews.length > 0 ? (
                <div className="space-y-4 sm:space-y-6 max-h-80 sm:max-h-96 overflow-y-auto">
                {serviceReviews.map(review => (
                    <div key={review.id} className="p-3 sm:p-4 border rounded-md bg-card shadow-sm">
                    <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                        <p className="font-semibold text-sm sm:text-md text-foreground">{review.userName}</p>
                        <div className="flex items-center">
                        {[...Array(5)].map((_, i) => ( <Star key={i} className={`h-4 w-4 sm:h-5 sm:w-5 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}/>))}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1 sm:mb-2">{review.createdAt ? formatDistanceToNow((review.createdAt as Timestamp).toDate(), { addSuffix: true }) : ''}</p>
                    <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">{review.comment}</p>
                    </div>
                ))}
                </div>
            ) : ( <p className="text-muted-foreground text-center py-4 text-sm sm:text-base">No reviews yet for this service.</p> )}
            </CardContent>
        </Card>
      )}
      <StickyCartContinueButton />
    </div>
  );
}
