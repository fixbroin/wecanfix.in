
"use client";

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, Layers, Briefcase, UserCircle as UserIcon, Construction, Handshake } from 'lucide-react'; // Added Construction & Handshake
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLoading } from '@/contexts/LoadingContext';
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig';
import { useState, useEffect } from 'react'; // Added useState & useEffect
import { doc, onSnapshot } from 'firebase/firestore'; // Added onSnapshot
import { db } from '@/lib/firebase'; // Added db
import type { ReferralSettings } from '@/types/firestore'; // Added ReferralSettings
import type { ElementType } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  isProtected: boolean;
  condition?: () => boolean; // Add optional condition
}

const BottomNavigationBar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const { featuresConfig, isLoading: isLoadingFeatures } = useFeaturesConfig();
  
  // New state for referral settings
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(null);
  const [isLoadingReferral, setIsLoadingReferral] = useState(true);

  // Fetch referral settings
  useEffect(() => {
      const settingsDocRef = doc(db, "appConfiguration", "referral");
      const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
          if (docSnap.exists()) {
              setReferralSettings(docSnap.data() as ReferralSettings);
          } else {
              setReferralSettings(null);
          }
          setIsLoadingReferral(false);
      }, (error) => {
          console.error("Error fetching referral settings:", error);
          setIsLoadingReferral(false);
      });
      return () => unsubscribe();
  }, []);

  const navItems: NavItem[] = [
    { href: '/', label: 'Home', icon: Home, isProtected: false },
    { href: '/categories', label: 'Categories', icon: Layers, isProtected: true },
    
    { href: '/referral', label: 'Refer', icon: Handshake, isProtected: true, condition: () => !isLoadingReferral && !!referralSettings?.isReferralSystemEnabled },
    { href: '/my-bookings', label: 'Bookings', icon: Briefcase, isProtected: true },
    { href: '/account', label: 'Profile', icon: UserIcon, isProtected: true },
  ];

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    e.preventDefault();
    if (pathname !== item.href) {
      showLoading();
    }
    if (item.isProtected && !user) {
      triggerAuthRedirect(item.href);
    } else {
      router.push(item.href);
    }
  };

  const filteredNavItems = navItems.filter(item => item.condition ? item.condition() : true);
  const itemWidthClass = `w-1/${filteredNavItems.length}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-background border-t border-border shadow-t-lg z-40">
      <div className="container mx-auto flex justify-around items-center h-16 px-2">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href;
          const IconComponent = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={(e) => handleNav(e, item)}
              className={cn(
                "flex flex-col items-center justify-center text-xs py-2 transition-colors duration-150 ease-in-out",
                itemWidthClass,
                isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-primary"
              )}
            >
              <IconComponent className={cn("h-5 w-5 mb-0.5", isActive ? "text-primary" : "")} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigationBar;
