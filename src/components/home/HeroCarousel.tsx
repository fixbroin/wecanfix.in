"use client";

import * as React from "react";
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import type { FirestoreSlide, SlideButtonLinkType } from "@/types/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaySquare } from "lucide-react";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { defaultAppSettings } from '@/config/appDefaults';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useLoading } from '@/contexts/LoadingContext';

export function HeroCarousel() {
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [slides, setSlides] = React.useState<FirestoreSlide[]>([]);
  const [isLoadingSlides, setIsLoadingSlides] = React.useState(true);
  const { user, triggerAuthRedirect } = useAuth();
  const router = useRouter();
  const { showLoading } = useLoading();

  const autoplayEnabled = !isLoadingAppSettings ? (appConfig.enableCarouselAutoplay ?? defaultAppSettings.enableCarouselAutoplay) : defaultAppSettings.enableCarouselAutoplay;
  const autoplayDelay = !isLoadingAppSettings ? (appConfig.carouselAutoplayDelay ?? defaultAppSettings.carouselAutoplayDelay) : defaultAppSettings.carouselAutoplayDelay;

  const emblaPlugins = React.useMemo(() => {
    if (autoplayEnabled && slides.length > 1) {
      return [Autoplay({ 
        delay: autoplayDelay, 
        stopOnInteraction: false, // Changed to false to allow auto-resume
        stopOnMouseEnter: false, 
        stopOnLastSnap: false,
      })];
    }
    return [];
  }, [autoplayEnabled, autoplayDelay, slides.length]);

  React.useEffect(() => {
    const fetchSlides = async () => {
      setIsLoadingSlides(true);
      try {
        const slidesCollectionRef = collection(db, "adminSlideshows");
        const q = query(
          slidesCollectionRef,
          where("isActive", "==", true),
          orderBy("order", "asc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedSlides = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreSlide));
        setSlides(fetchedSlides);
      } catch (error) {
        console.error("Error fetching slides for carousel:", error);
      } finally {
        setIsLoadingSlides(false);
      }
    };
    fetchSlides();
  }, []);

  const getButtonLink = (type?: SlideButtonLinkType | null, value?: string | null): string => {
    if (!type || !value) return '#';
    switch (type) {
      case 'category':
        return `/category/${value}`;
      case 'subcategory':
        return `/category/${value}`;
      case 'service':
        return `/service/${value}`;
      case 'url':
        return value;
      default:
        return '#';
    }
  };

  const handleSlideNavigation = useCallback((type?: SlideButtonLinkType | null, value?: string | null) => {
    if (!type || !value) return;
    const intendedHref = getButtonLink(type, value);
    
    if (intendedHref.startsWith('http')) { // External link
      window.open(intendedHref, '_blank');
    } else if (intendedHref !== '#') { // Internal link
      showLoading(); 
      if (!user) {
        triggerAuthRedirect(intendedHref);
      } else {
        router.push(intendedHref);
      }
    }
  }, [user, triggerAuthRedirect, router, showLoading]);


  if (isLoadingSlides || isLoadingAppSettings) {
    return (
      <div className="px-0 sm:px-0">
        <div className="relative h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full">
          <Skeleton className="w-full h-full rounded-lg" />
          <div className="absolute inset-0 bg-black/30 rounded-lg flex flex-col items-center justify-center text-center p-2 pb-3 md:p-4 md:pb-6">
            <Skeleton className="h-6 w-3/4 mb-2 sm:h-8" />
            <Skeleton className="h-3 w-1/2 mb-3 sm:h-4" />
            <Skeleton className="h-8 w-24 sm:h-10 sm:w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (!slides.length) {
    return (
      <div className="px-0 sm:px-0">
        <div className="relative h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full bg-muted rounded-lg flex flex-col items-center justify-center text-center p-4">
          <PlaySquare className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-2 sm:mb-3" />
          <p className="text-xs sm:text-sm text-muted-foreground">No active slides available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-0 sm:px-0">
      <Carousel
        plugins={emblaPlugins}
        className="w-full"
        opts={{ loop: slides.length > 1 }}
      >
        <CarouselContent>
          {slides.map((slide, index) => {
            
            const hideOverlayAndText =
              (!slide.title || slide.title.trim() === "") &&
              (!slide.buttonText || slide.buttonText.trim() === "");

            return (
              <CarouselItem key={slide.id}>
                <div 
                  className={`relative w-full h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] overflow-hidden rounded-lg group ${!slide.buttonText && slide.buttonLinkType && slide.buttonLinkValue ? 'cursor-pointer' : ''}`}
                  onClick={(!slide.buttonText && slide.buttonLinkType && slide.buttonLinkValue) ? () => handleSlideNavigation(slide.buttonLinkType, slide.buttonLinkValue) : undefined}
                  role={(!slide.buttonText && slide.buttonLinkType && slide.buttonLinkValue) ? 'link' : undefined}
                  tabIndex={(!slide.buttonText && slide.buttonLinkType && slide.buttonLinkValue) ? 0 : undefined}
                  onKeyDown={(!slide.buttonText && slide.buttonLinkType && slide.buttonLinkValue) ? (e) => { if(e.key === 'Enter' || e.key === ' ') handleSlideNavigation(slide.buttonLinkType, slide.buttonLinkValue)} : undefined}
                >
                  <Image
                    src={slide.imageUrl}
                    alt={slide.title || "Promotional Slide"}
                    fill
                    priority={index === 0}
                    sizes="100vw"
                    className="rounded-lg object-cover group-hover:scale-105 transition-transform duration-300"
                    data-ai-hint={slide.imageHint || "slideshow hero image"}
                  />

                  {/* Show overlay & texts ONLY if title OR buttonText exists */}
                  {!hideOverlayAndText && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent rounded-lg flex flex-col items-center justify-end text-center p-4 pb-6 sm:p-6 sm:pb-8 md:p-8 md:pb-10 lg:p-10 lg:pb-12">
                      <div className="max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
                        {slide.title?.trim() && (
                          <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-headline font-bold text-white mb-2 md:mb-3 shadow-md">
                            {slide.title}
                          </h2>
                        )}

                        {slide.description?.trim() && (
                          <p className="text-xs sm:text-sm md:text-base text-gray-200 mb-3 md:mb-4 shadow-sm line-clamp-2 md:line-clamp-3">
                            {slide.description}
                          </p>
                        )}

                        {slide.buttonText?.trim() && slide.buttonLinkType && slide.buttonLinkValue && (
                          <Button 
                            size="default" 
                            className="text-xs sm:text-sm h-9 md:h-10 bg-primary hover:bg-primary/90 text-primary-foreground px-4 md:px-6"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleSlideNavigation(slide.buttonLinkType, slide.buttonLinkValue); 
                            }}
                          >
                            {slide.buttonText}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        {slides.length > 1 && (
          <>
            <CarouselPrevious className="absolute -left-4 top-1/2 -translate-y-1/2 h-6 w-6 sm:h-8 sm:w-8" />
            <CarouselNext className="absolute -right-4 top-1/2 top-1/2 -translate-y-1/2 h-6 w-6 sm:h-8 sm:w-8" />
          </>
        )}
      </Carousel>
    </div>
  );
}
