
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User, Briefcase, MapPin, Bell, MessageSquare, LogOut, ChevronRight, Handshake,
  Loader2, Info, FileText, Construction, UserPlus
} from 'lucide-react';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useLoading } from '@/contexts/LoadingContext';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import type { ReferralSettings } from '@/types/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig';

interface AccountLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badgeCount?: number;
  isLogout?: boolean;
}

function AccountPageContent() {
  const { user, firestoreUser, logOut, isLoading: authIsLoading } = useAuth();
  const { showLoading } = useLoading();
  const router = useRouter();
  
  const { count: unreadNotificationsCount } = useUnreadNotificationsCount(user?.uid);
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(null);
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const { featuresConfig, isLoading: isLoadingFeaturesConfig } = useFeaturesConfig();


  useEffect(() => {
    const settingsDocRef = doc(db, "appConfiguration", "referral");
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setReferralSettings(docSnap.data() as ReferralSettings);
        } else {
            setReferralSettings(null);
        }
    });
    return () => unsubscribe();
  }, []);

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    showLoading();
    router.push(href);
  };
  
  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    showLoading();
    logOut();
  };

  const AccountLink = ({ href, icon: Icon, label, badgeCount, isLogout = false }: AccountLinkProps) => {
    const action = isLogout ? handleLogout : (e: React.MouseEvent) => handleNav(e as React.MouseEvent<HTMLAnchorElement>, href);

    const content = (
      <div
        className="flex items-center w-full p-4 hover:bg-muted/50 rounded-lg transition-colors"
      >
        <Icon className={cn("h-6 w-6 mr-4", isLogout ? "text-destructive" : "text-primary")} />
        <span className={cn("flex-grow text-base font-medium", isLogout ? "text-destructive" : "text-foreground")}>{label}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
             {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
        <ChevronRight className="h-5 w-5 text-muted-foreground ml-2" />
      </div>
    );
  
    if (isLogout) {
      return <button onClick={action} className="w-full text-left">{content}</button>;
    }
  
    return (
      <Link href={href} onClick={action} legacyBehavior>
        <a className="block">{content}</a>
      </Link>
    );
  };

  const accountMenuItems = [
    { href: '/profile', label: 'My Profile', icon: User },
    { href: '/my-bookings', label: 'My Bookings', icon: Briefcase },
    { href: '/my-address', label: 'My Addresses', icon: MapPin },
    { href: '/referral', label: 'Refer & Earn', icon: Handshake, condition: () => !isLoadingAppConfig && !!referralSettings?.isReferralSystemEnabled },
    { href: '/notifications', label: 'Notifications', icon: Bell, badgeCount: unreadNotificationsCount },
    { href: '/chat', label: 'Chat with Support', icon: MessageSquare, isProtected: true },
  ];

  const extraPagesItems = [
    { href: '/custom-service', label: 'Custom Service', icon: Construction, condition: () => !isLoadingFeaturesConfig && !!featuresConfig.showCustomServiceButton},
    { href: '/provider-registration', label: 'Become a Provider', icon: UserPlus, condition: () => !isLoadingAppConfig && !!appConfig.isProviderRegistrationEnabled},
    { href: '/about-us', label: 'About Us', icon: Info },
    { href: '/contact-us', label: 'Contact Us', icon: MessageSquare },
  ];

  const policyItems = [
     { href: '/terms-of-service', label: 'Terms of Service', icon: FileText },
     { href: '/privacy-policy', label: 'Privacy Policy', icon: FileText },
     { href: '/cancellation-policy', label: 'Cancellation Policy', icon: FileText },
  ];

  if (authIsLoading || !user || !firestoreUser) {
    return (
        <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="container mx-auto px-2 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center gap-4 p-4 mb-4">
        <Avatar className="h-16 w-16 border-2 border-primary">
          <AvatarImage src={user.photoURL || undefined} alt={firestoreUser.displayName || "User"} />
          <AvatarFallback className="text-2xl">
            {firestoreUser.displayName ? firestoreUser.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : "U"}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{firestoreUser.displayName || "Valued User"}</h1>
          <p className="text-sm text-muted-foreground">{firestoreUser.email}</p>
        </div>
      </div>
      
      <nav className="space-y-2">
        {/* Section 1: Theme Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg">
            <span className="text-base font-medium">Theme Appearance</span>
            <ThemeToggle />
        </div>
        <Separator />
        
        {/* Section 2: Account & Bookings */}
        {accountMenuItems.filter(item => item.condition ? item.condition() : true).map(item => (
          <AccountLink key={item.href} {...item} />
        ))}
        <Separator />
        
        {/* Section 3: Extra Pages */}
        {extraPagesItems.filter(item => item.condition ? item.condition() : true).map(item => (
          <AccountLink key={item.href} {...item} />
        ))}
        <Separator />
        
        {/* Section 4: Policies */}
        {policyItems.map(item => (
          <AccountLink key={item.href} {...item} />
        ))}
        <Separator />
        
        {/* Section 5: Logout */}
        <div className="pt-2">
          <AccountLink href="#" label="Log Out" icon={LogOut} isLogout={true} />
        </div>
      </nav>
    </div>
  );
}


export default function AccountPage() {
    return (
        <ProtectedRoute>
            <AccountPageContent />
        </ProtectedRoute>
    );
}
