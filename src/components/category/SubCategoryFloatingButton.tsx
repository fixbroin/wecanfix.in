
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import SubCategoryCard from './SubCategoryCard';
import { Menu, X } from 'lucide-react';
import type { FirestoreSubCategory } from '@/types/firestore';
import { cn } from '@/lib/utils';

interface SubCategoryFloatingButtonProps {
  subCategories: FirestoreSubCategory[];
  onSubCategoryClick: (slug: string) => void;
  activeSubCategorySlug: string | null;
}

export default function SubCategoryFloatingButton({ 
  subCategories, 
  onSubCategoryClick,
  activeSubCategorySlug 
}: SubCategoryFloatingButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubCategorySelect = (slug: string) => {
    onSubCategoryClick(slug);
    setIsModalOpen(false);
  };
  
  if (subCategories.length <= 1) {
    return null;
  }

  return (
    <>
      
    {/* Floating Action Button */}
    <div
      className={cn(
        "fixed bottom-20 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-in-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
      )}
    >
      <Button
        variant="default"
        size="lg"
        className="rounded-full shadow-xl flex items-center justify-center gap-2 
                   h-10 px-2 sm:h-12 sm:px-4 transition-all duration-300"
        aria-label="View Sub-categories"
        onClick={() => setIsModalOpen(true)}
      >
        {/* Icon size changes with screen */}
        <Menu className="h-5 w-5 sm:h-7 sm:w-7" />
        {/* Text visible only on desktop */}
        <span className="hidden sm:inline">Jump to Sub-Category</span>
        {/* Short text visible only on mobile */}
        <span className="inline sm:hidden">Menu</span>
      </Button>
    </div>
  


      {/* Custom Modal */}
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300",
          isModalOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-black/80"
          onClick={() => setIsModalOpen(false)}
        />
        
        {/* Content */}
        <div
          className={cn(
            "z-10 bg-card rounded-lg shadow-xl w-[90%] max-w-md flex flex-col transition-all duration-300 ease-in-out",
            isModalOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          )}
        >
          <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
            <h2 className="text-lg font-semibold">Jump to Sub-Category</h2>
            <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="h-96">
            <div className="p-4 grid grid-cols-3 gap-2">
              {subCategories.map((subCat) => (
                <SubCategoryCard 
                    key={subCat.id}
                    subCategory={subCat}
                    isActive={activeSubCategorySlug === subCat.slug}
                    onClick={() => handleSubCategorySelect(subCat.slug)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
