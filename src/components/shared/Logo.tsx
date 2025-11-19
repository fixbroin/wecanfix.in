
"use client";

import Link from 'next/link';
import { Wrench } from 'lucide-react';
import Image from 'next/image';
import { useLoading } from '@/contexts/LoadingContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils'; // Import cn utility

interface LogoProps {
  className?: string;
  size?: "normal" | "large";
  logoUrl?: string | null;
  websiteName?: string | null;
  href?: string;
}

const Logo = ({ className = "", size = "normal", logoUrl, websiteName, href }: LogoProps) => {
  const textSizeClass = size === "large" ? "text-4xl" : "text-2xl";
  const iconSize = size === "large" ? "h-8 w-8" : "h-6 w-6";
  const finalWebsiteName = websiteName || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Wecanfix";
  const linkTarget = href || "/";
  const { showLoading } = useLoading();
  const currentPathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (linkTarget !== currentPathname && !linkTarget.startsWith('#')) {
        showLoading();
    }
  };

  return (
    <Link
      href={linkTarget}
      onClick={handleClick}
      className={`flex items-center gap-2 text-primary hover:text-primary/90 transition-colors ${className}`}
    >
      {logoUrl ? (
        <div className={`relative ${iconSize} mr-1`} style={{ minWidth: size === "large" ? '32px' : '24px' }}>
          <Image
            src={logoUrl}
            alt={`${finalWebsiteName} Logo`}
            fill
            sizes={size === "large" ? "32px" : "24px"}
            className="object-contain"
            priority // Prioritize logo loading
          />
        </div>
      ) : (
        <Wrench className={`${iconSize} text-primary`} />
      )}
      <span className={cn("font-headline font-bold", textSizeClass, "group-data-[collapsible=icon]:hidden")}>{finalWebsiteName}</span>
    </Link>
  );
};

export default Logo;
