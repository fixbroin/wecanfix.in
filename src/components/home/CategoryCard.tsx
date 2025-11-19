
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FirestoreCategory } from '@/types/firestore';
import { useState, useEffect, useCallback } from 'react';
import { getOverriddenCategoryName } from '@/lib/adminDataOverrides';
import { getIconComponent } from '@/lib/iconMap';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext'; 

interface CategoryCardProps {
  category: FirestoreCategory;
  priority?: boolean;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "category";
};

const CategoryCard: React.FC<CategoryCardProps> = ({ category, priority = false }) => {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const { showLoading } = useLoading(); 
  const { user, triggerAuthRedirect } = useAuth(); // Added triggerAuthRedirect
  const currentPathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && category) {
      setDisplayName(getOverriddenCategoryName(category.id, category.name));
    }
  }, [isMounted, category]);
  
  useEffect(() => {
    if (typeof window === 'undefined' || !isMounted || !category) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'wecanfixCategoryNameOverrides' && category) {
         setDisplayName(getOverriddenCategoryName(category.id, category.name));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [category, isMounted]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const intendedHref = `/category/${category.slug}`;
    showLoading(); 
    if (!user) {
      triggerAuthRedirect(intendedHref);
      return;
    }
    router.push(intendedHref);
  }, [router, category.slug, showLoading, user, triggerAuthRedirect]);

  if (!isMounted || displayName === null || !category) {
    return (
      <div className="overflow-hidden h-full flex flex-col group cursor-pointer">
        <Skeleton className="w-full aspect-square bg-muted" />
        <div className="p-4 text-center">
          <Skeleton className="h-5 w-3/4 mx-auto bg-muted" />
        </div>
      </div>
    );
  }
  
  const IconComponent = getIconComponent(undefined); 
  const displayCategoryImageUrl = category.imageUrl && category.imageUrl.trim() !== '' ? category.imageUrl : "/default-image.png";
  const categoryAiHintValue = generateAiHint(category.imageHint, category.name);

  return (
    <div 
      onClick={handleClick} 
      className="overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full flex flex-col group cursor-pointer border rounded-lg bg-card text-card-foreground"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as any); }}
    >
      <div className="w-full aspect-square p-3 bg-primary/5 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
        <div className="relative h-full w-full">
          <Image
            src={displayCategoryImageUrl}
            alt={displayName || category.name}
            fill
            sizes="(max-width: 640px) 40vw, (max-width: 1024px) 25vw, 15vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300"
            data-ai-hint={categoryAiHintValue}
            priority={priority}
             onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== "/default-image.png") {
                target.src = "/default-image.png";
              }
            }}
          />
        </div>
      </div>
      <div className={`p-3 text-center ${category.imageUrl ? 'pt-3' : 'pt-2'}`}>
        <h3 className="text-base sm:text-lg md:text-xl font-headline font-semibold leading-snug text-center line-clamp-2 group-hover:text-primary transition-colors">
          {displayName}
        </h3>
      </div>
    </div>
  );
};

export default CategoryCard;
