
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { FirestoreCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CategoryCard from './CategoryCard'; // Re-using your existing CategoryCard
import { ArrowDown, ArrowUp } from 'lucide-react';

const ITEMS_TO_SHOW_MOBILE = 6; // e.g., 2 rows for grid-cols-3
const ITEMS_TO_SHOW_DESKTOP = 12; // e.g., 2 rows for grid-cols-6

const HomeCategoriesSection = () => {
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateView = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    updateView();
    window.addEventListener("resize", updateView);
    return () => window.removeEventListener("resize", updateView);
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

  const currentItemsToShowLimit = isMobile ? ITEMS_TO_SHOW_MOBILE : ITEMS_TO_SHOW_DESKTOP;
  const displayedCategories = showAll ? categories : categories.slice(0, currentItemsToShowLimit);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
        {[...Array(isMobile ? ITEMS_TO_SHOW_MOBILE : ITEMS_TO_SHOW_DESKTOP)].map((_, i) => (
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
        {displayedCategories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}

        {/* "More" Button */}
        {!showAll && categories.length > currentItemsToShowLimit && (
          <div 
            className="aspect-square cursor-pointer group flex flex-col items-center justify-center text-center p-2 md:p-4 border rounded-lg bg-card hover:shadow-lg transition-shadow"
            onClick={() => setShowAll(true)}
          >
            <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors mb-2">
              <ArrowDown className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <p className="text-sm md:text-md font-medium text-primary group-hover:text-primary/90 transition-colors">More</p>
          </div>
        )}

        {/* "Less" Button */}
        {showAll && categories.length > currentItemsToShowLimit && (
           <div 
            className="aspect-square cursor-pointer group flex flex-col items-center justify-center text-center p-2 md:p-4 border rounded-lg bg-card hover:shadow-lg transition-shadow"
            onClick={() => setShowAll(false)}
          >
            <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors mb-2">
              <ArrowUp className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <p className="text-sm md:text-md font-medium text-primary group-hover:text-primary/90 transition-colors">Less</p>
          </div>
        )}
      </div>
    </>
  );
};

export default HomeCategoriesSection;
