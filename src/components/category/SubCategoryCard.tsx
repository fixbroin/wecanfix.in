
"use client";

import { Button } from "@/components/ui/button";
import type { FirestoreSubCategory } from '@/types/firestore';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';

const DEFAULT_FALLBACK_SUB_CATEGORY_ICON = "/default-image.png";

// In-memory cache for loaded image URLs. Persists for the session.
const loadedImageUrls = new Set<string>();

interface SubCategoryCardProps {
  subCategory: FirestoreSubCategory;
  isActive: boolean;
  onClick: () => void;
}

export default function SubCategoryCard({ subCategory, isActive, onClick }: SubCategoryCardProps) {
  const displayImageUrl = subCategory.imageUrl && subCategory.imageUrl.trim() !== '' 
    ? subCategory.imageUrl 
    : DEFAULT_FALLBACK_SUB_CATEGORY_ICON;

  // Initialize loading state based on whether the image is already in our session cache.
  const [isImageLoading, setIsImageLoading] = useState(!loadedImageUrls.has(displayImageUrl));
  
  // State to handle image errors and force fallback
  const [imageError, setImageError] = useState(false);

  const handleImageLoad = () => {
    setIsImageLoading(false);
    loadedImageUrls.add(displayImageUrl); // Add to cache on successful load
  };

  const handleImageError = () => {
    setIsImageLoading(false); // Stop loading on error
    setImageError(true); // Trigger fallback image
  };

  const finalImageUrl = imageError ? DEFAULT_FALLBACK_SUB_CATEGORY_ICON : displayImageUrl;

  return (
    <Button
      variant={isActive ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-start h-full p-2 gap-1.5 w-24 md:w-28 transition-all duration-200 ease-in-out transform hover:scale-105",
        "min-h-[110px] md:min-h-[120px]"
      )}
      aria-pressed={isActive}
    >
      <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-md overflow-hidden mb-1 flex-shrink-0 bg-muted/50">
        {isImageLoading && <Skeleton className="w-full h-full" />}
        <Image 
          src={finalImageUrl}
          alt={subCategory.name}
          fill
          sizes="(max-width: 768px) 48px, 56px"
          className={cn(
            "object-cover transition-opacity duration-300",
            isImageLoading ? "opacity-0" : "opacity-100"
          )}
          data-ai-hint={subCategory.imageHint || "sub-category icon"}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      <span className="text-xs text-center leading-tight font-semibold break-words whitespace-normal line-clamp-3">
        {subCategory.name}
      </span>
    </Button>
  );
}
