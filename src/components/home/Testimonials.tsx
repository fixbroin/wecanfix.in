
"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import type { FirestoreReview } from '@/types/firestore';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import * as React from "react";
import { Skeleton } from '@/components/ui/skeleton';

const Testimonials = () => {
  const [testimonials, setTestimonials] = useState<FirestoreReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const plugin = React.useRef(Autoplay({ 
    delay: 5000, 
    stopOnInteraction: false, // Changed to false to allow auto-resume
    stopOnMouseEnter: false, 
    stopOnLastSnap: false,
  }));

  useEffect(() => {
    const fetchReviews = async () => {
      setIsLoading(true);
      try {
        const reviewsRef = collection(db, "adminReviews");
        const q = query(
          reviewsRef,
          where("status", "==", "Approved"),
          where("rating", ">=", 4), // Only show 4 and 5 star reviews
          orderBy("rating", "desc"),
          orderBy("createdAt", "desc"),
          limit(12) // Fetch a few more to allow some variety
        );
        const snapshot = await getDocs(q);
        const fetchedReviews = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreReview));
        
        // Simple shuffle for variety on each load
        setTestimonials(fetchedReviews.sort(() => 0.5 - Math.random()));

      } catch (error) {
        console.error("Error fetching testimonials:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReviews();
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="flex flex-col shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-grow">
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (testimonials.length === 0) {
    return null; // Don't render the section if there are no testimonials
  }

  return (
     <Carousel
      opts={{
          align: "start",
          loop: true,
      }}
      plugins={[plugin.current]}
      className="w-full"
    >
      <CarouselContent className="-ml-2 md:-ml-4">
        {testimonials.map((testimonial) => (
          <CarouselItem key={testimonial.id} className="pl-2 md:pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
            <div className="p-1 h-full">
              <Card className="flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      {testimonial.userAvatarUrl ? (
                        <AvatarImage src={testimonial.userAvatarUrl} alt={testimonial.userName} data-ai-hint="person avatar" />
                      ) : (
                        <AvatarFallback>{testimonial.userName ? testimonial.userName.charAt(0).toUpperCase() : 'A'}</AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <CardTitle className="text-md font-headline">{testimonial.userName}</CardTitle>
                      <div className="flex items-center mt-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < testimonial.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground italic">"{testimonial.comment}"</p>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden md:flex" />
      <CarouselNext className="hidden md:flex" />
    </Carousel>
  );
};

export default Testimonials;
