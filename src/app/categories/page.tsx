
"use client";

import { useState, useEffect } from 'react';
import CategoryCard from "@/components/home/CategoryCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { FirestoreCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

export default function AllCategoriesPage() {
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const categoriesCollectionRef = collection(db, "adminCategories");
        const q = query(categoriesCollectionRef, where("isActive", "==", true), orderBy("order", "asc"));
        const data = await getDocs(q);
        const fetchedCategories = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories: ", err);
        setError("Failed to load service categories.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl md:text-4xl font-headline font-semibold text-foreground">
          All Service Categories
        </h1>
        <Link href="/" passHref>
          <Button variant="outline" className="hidden md:flex">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>
      
      <p className="text-muted-foreground mb-8">
        Find the service you need from our wide range of categories.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
           {[...Array(10)].map((_, i) => (
            <div key={i} className="h-full flex flex-col items-center justify-center text-center group p-4 border rounded-lg">
              <Skeleton className="p-3 h-16 w-16 rounded-full bg-muted" />
              <Skeleton className="h-5 w-24 mt-2 bg-muted" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-center text-destructive">{error}</p>
      ) : categories.length === 0 ? (
        <p className="text-center text-muted-foreground">No categories available at the moment.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}
