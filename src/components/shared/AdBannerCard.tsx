
"use client";

import Link from 'next/link';
import Image from 'next/image';
import type { HomepageAd } from '@/types/firestore';
import { Button } from '@/components/ui/button'; // If you want a button style link
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLoading } from '@/contexts/LoadingContext';
import { useCallback } from 'react';

interface AdBannerCardProps {
  ad: HomepageAd;
  className?: string;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "advertisement";
};

export default function AdBannerCard({ ad, className }: AdBannerCardProps) {
  const router = useRouter();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading, hideLoading } = useLoading(); // Added hideLoading just in case, though we aim to avoid calling showLoading for external

  const getHref = useCallback((): string => {
    switch (ad.actionType) {
      case 'url':
        return ad.targetValue;
      case 'category':
        return `/category/${ad.targetValue}`;
      case 'service':
        return `/service/${ad.targetValue}`;
      default:
        return '#';
    }
  }, [ad.actionType, ad.targetValue]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const intendedHref = getHref();
    
    if (intendedHref === '#') return;

    if (ad.actionType === 'url') {
      // For external links, typically a new tab. The original tab isn't "loading".
      window.open(intendedHref, '_blank');
      // No showLoading() or hideLoading() needed here for the original tab.
    } else {
      // For internal links, show the loader.
      showLoading();
      if (!user) {
        triggerAuthRedirect(intendedHref);
        // hideLoading() will be handled by GlobalActionLoader on route change or by AuthProvider logic
      } else {
        router.push(intendedHref);
        // hideLoading() will be handled by GlobalActionLoader on route change
      }
    }
  }, [ad, getHref, showLoading, user, triggerAuthRedirect, router]);

  if (!ad.isActive || !ad.imageUrl) {
    return null;
  }

  const href = getHref();
  const aiHintValue = generateAiHint(ad.imageHint, ad.name);
  const defaultAdImageUrl = "https://placehold.co/1200x300.png"; 
  const displayAdImageUrl = ad.imageUrl && ad.imageUrl.trim() !== '' ? ad.imageUrl : defaultAdImageUrl;


  return (
    <div
      className={`w-full overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-shadow ${className}`}
      onClick={handleClick}
      role="link"
      tabIndex={0}
      aria-label={`Advertisement: ${ad.name}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as any);}}
      style={{ cursor: 'pointer' }}
    >
      <div className="relative aspect-[1200/300] w-full"> {/* Aspect ratio for typical banner */}
        <Image
          src={displayAdImageUrl}
          alt={ad.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 1200px"
          className="object-cover"
          data-ai-hint={aiHintValue}
           onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== defaultAdImageUrl) {
                target.src = defaultAdImageUrl;
              }
            }}
        />
      </div>
    </div>
  );
}
