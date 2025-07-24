
"use client";

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { BreadcrumbItem } from '@/types/ui';
import { cn } from '@/lib/utils';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={cn("mb-4 sm:mb-6", className)}>
      <ol className="flex items-center space-x-1.5 text-xs sm:text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70" />
            )}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="ml-1.5 hover:text-primary transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={cn(
                "ml-1.5",
                index === items.length - 1 ? "font-medium text-foreground" : ""
              )}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
