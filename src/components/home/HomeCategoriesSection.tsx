
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import CategoryCard from './CategoryCard';
import type { FirestoreCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { ArrowDown, ArrowUp } from 'lucide-react';

const getItemsLimit = (width: number): number => {
  if (width < 640) return 5; // Mobile (sm breakpoint)
  if (width < 1024) return 8; // Tablet (lg breakpoint)
  return 11; // Desktop
};

const HomeCategoriesSection = () => {
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [itemsLimit, setItemsLimit] = useState(getItemsLimit(typeof window !== 'undefined' ? window.innerWidth : 1024));

  useEffect(() => {
    const handleResize = () => {
      setItemsLimit(getItemsLimit(window.innerWidth));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const categoriesCollectionRef = collection(db, "adminCategories");
        const q = query(categoriesCollectionRef, orderBy("order", "asc"));
        const data = await getDocs(q);
        const fetchedCategories = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories: ", err);
        setError("Failed to load categories.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const displayedCategories = showAll ? categories : categories.slice(0, itemsLimit);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
        {[...Array(itemsLimit + 1)].map((_, i) => (
          <Card className="overflow-hidden h-full flex flex-col group" key={i}>
            <Skeleton className="w-full aspect-square bg-muted" />
            <div className="p-3 text-center">
              <Skeleton className="h-5 w-3/4 mx-auto bg-muted mt-1" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive">{error}</p>;
  }

  if (categories.length === 0) {
    return <p className="text-center text-muted-foreground">No categories available at the moment.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
        {displayedCategories.map((category, index) => (
          <CategoryCard key={category.id} category={category} priority={index < 6} />
        ))}

        {!showAll && categories.length > itemsLimit && (
          <div 
            className="overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full flex flex-col group cursor-pointer border rounded-lg bg-card text-card-foreground"
            onClick={() => setShowAll(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowAll(true); }}
          >
            <div className="w-full aspect-square p-3 bg-primary/5 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
              <div className="relative h-full w-full flex items-center justify-center">
                 <ArrowDown className="h-10 w-10 md:h-12 md:w-12 text-primary group-hover:scale-105 transition-transform" />
              </div>
            </div>
            <div className="p-3 text-center pt-3">
              <h3 className="text-base sm:text-lg md:text-xl font-headline font-semibold leading-snug text-center line-clamp-2 group-hover:text-primary transition-colors">
                More
              </h3>
            </div>
          </div>
        )}

        {showAll && categories.length > itemsLimit && (
           <div 
            className="overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full flex flex-col group cursor-pointer border rounded-lg bg-card text-card-foreground"
            onClick={() => setShowAll(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowAll(false); }}
          >
             <div className="w-full aspect-square p-3 bg-primary/5 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
              <div className="relative h-full w-full flex items-center justify-center">
                 <ArrowUp className="h-10 w-10 md:h-12 md:w-12 text-primary group-hover:scale-105 transition-transform" />
              </div>
            </div>
            <div className="p-3 text-center pt-3">
              <h3 className="text-base sm:text-lg md:text-xl font-headline font-semibold leading-snug text-center line-clamp-2 group-hover:text-primary transition-colors">
                Less
              </h3>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default HomeCategoriesSection;
