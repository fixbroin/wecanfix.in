
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Bell, Menu, X, ShoppingCart, LogOut, UserCircle, Briefcase, Settings2, Moon, Sun, MessageSquare, UserPlus, MapPin as AddressIcon, Construction, Handshake } from 'lucide-react'; // Added Handshake
import Logo from '@/components/shared/Logo';
import { Button } from '@/components/ui/button';
import SearchPopup from '@/components/shared/SearchPopup';
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLoading } from '@/contexts/LoadingContext';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig'; // Import new hook
import type { ReferralSettings } from '@/types/firestore';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from '@/lib/firebase'; // Added missing import

const NavLink = ({ href, children, onClick, isButton = false }: { href?: string; children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void; isButton?: boolean }) => {
  const pathname = usePathname();
  const isActive = href ? pathname === href : false;

  const commonClasses = `block w-full text-left px-4 py-2 text-sm rounded-md hover:bg-accent/10 ${isActive ? 'font-semibold text-primary' : 'text-foreground/80'}`;

  if (isButton || !href) {
    return (
      <SheetClose asChild>
        <button onClick={onClick} className={commonClasses}>
          {children}
        </button>
      </SheetClose>
    );
  }

  return (
    <SheetClose asChild>
      <Link href={href} onClick={onClick} className={commonClasses}>
        {children}
      </Link>
    </SheetClose>
  );
};


const Header = () => {
  const [isSearchPopupOpen, setIsSearchPopupOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { user, firestoreUser, logOut, isLoading: authIsLoading, triggerAuthRedirect } = useAuth();
  const { settings: globalSettings, isLoading: settingsAreLoading } = useGlobalSettings();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig(); 
  const { featuresConfig, isLoading: isLoadingFeaturesConfig } = useFeaturesConfig(); 
  const [cartItemCount, setCartItemCount] = useState(0);
  const router = useRouter();
  const currentPathnameFromHook = usePathname();
  const { showLoading } = useLoading();

  const { count: unreadCountFromHook, isLoading: isLoadingCount } = useUnreadNotificationsCount(user?.uid);
  const [headerUnreadCount, setHeaderUnreadCount] = useState(0);
  const [currentThemeForIcon, setCurrentThemeForIcon] = useState<'light' | 'dark'>('light');

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


  useEffect(() => {
    setHeaderUnreadCount(unreadCountFromHook);
  }, [unreadCountFromHook]);

  useEffect(() => {
    const getInitialTheme = () => {
        const storedTheme = localStorage.getItem('wecanfix-theme') as 'light' | 'dark' | null;
        if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
        if (typeof window.matchMedia !== 'function') return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    if (typeof window !== 'undefined') {
      setCurrentThemeForIcon(getInitialTheme());
    }


    const handleThemeChange = (event?: Event) => {
        const newTheme = (event as CustomEvent)?.detail?.theme || getInitialTheme();
        setCurrentThemeForIcon(newTheme);
    };

    window.addEventListener('themeChanged', handleThemeChange);
    window.addEventListener('storage', (event) => {
        if (event.key === 'wecanfix-theme') {
            handleThemeChange();
        }
    });

    return () => {
        window.removeEventListener('themeChanged', handleThemeChange);
        window.removeEventListener('storage', (event) => {
            if (event.key === 'wecanfix-theme') handleThemeChange();
        });
    };
  }, []);


  const updateCartCount = () => {
    const entries = getCartEntries();
    const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    setCartItemCount(totalQuantity);
  };

  useEffect(() => {
    setIsMounted(true);
    updateCartCount();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'wecanfixUserCart' || event.key === null) {
        updateCartCount();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleAuthRequiredNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref: string) => {
    e.preventDefault();
    const currentClientPath = window.location.pathname + window.location.search + window.location.hash;
    if (intendedHref !== currentClientPath && !intendedHref.startsWith('#')) showLoading();
    if (!user) triggerAuthRedirect(intendedHref);
    else router.push(intendedHref);
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
  };

  const handleSimpleNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref: string) => {
    e.preventDefault();
    const currentClientPath = window.location.pathname + window.location.search + window.location.hash;
    if (intendedHref !== currentClientPath && !intendedHref.startsWith('#')) showLoading();
    router.push(intendedHref);
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
  };

  const chatIsEnabled = isMounted && !settingsAreLoading && globalSettings?.isChatEnabled;

  const baseNavItems = [
    { href: '/', label: 'Home', isProtected: false },
    { href: '/categories', label: 'Categories', isProtected: true },
  ];

  const userSpecificNavItems = [
    { href: '/profile', label: 'Profile', icon: UserCircle, isProtected: true },
    { href: '/my-bookings', label: 'My Bookings', icon: Briefcase, isProtected: true },
    { href: '/my-address', label: 'My Addresses', icon: AddressIcon, isProtected: true },
    { href: '/referral', label: 'Refer & Earn', icon: Handshake, isProtected: true, condition: () => !isLoadingReferral && !!referralSettings?.isReferralSystemEnabled },
    { href: '/notifications', label: 'Notifications', icon: Bell, isProtected: true },
    { href: '/chat', label: 'Chat with Support', icon: MessageSquare, condition: () => chatIsEnabled, isProtected: true },
  ];
  
  const guestNavItems = [
      { href: '/auth/login', label: 'Login / Sign Up', isProtected: false }
  ];


  if (!isMounted || settingsAreLoading) {
    return (
      <header className="bg-background/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div data-hydration-state="skeleton" className="container mx-auto px-4 h-16 grid grid-cols-2 md:grid-cols-header-layout items-center">
          <div className="flex items-center justify-start">
             <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          </div>
          <div className="hidden md:flex justify-center col-start-2">
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex items-center justify-end gap-2">
             <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
             <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
             <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="bg-background/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div data-hydration-state="hydrated" className="container mx-auto px-4 h-16 grid grid-cols-2 md:grid-cols-header-layout items-center">
          <div className="flex items-center justify-start">
             <div className="md:hidden">
                <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} />
             </div>
            <nav className="hidden md:flex items-center gap-x-3 lg:gap-x-5">
              {baseNavItems.map((item) => (
                 <button
                    key={item.href}
                    onClick={(e) => item.isProtected ? handleAuthRequiredNav(e, item.href) : handleSimpleNav(e, item.href)}
                    className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
                  >
                  {item.label}
                 </button>
              ))}
             
              { !isLoadingFeaturesConfig && featuresConfig.showCustomServiceButton && (
                 <button
                    onClick={(e) => handleAuthRequiredNav(e, '/custom-service')}
                    className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center"
                  >
                    <Construction className="mr-1 h-4 w-4" /> Custom Service
                 </button>
              )}
              { !isLoadingAppConfig && (appConfig.isProviderRegistrationEnabled || (user && user.email === ADMIN_EMAIL)) && (
                <button
                  onClick={(e) => handleSimpleNav(e, '/provider-registration')}
                  className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center"
                >
                  <UserPlus className="mr-1 h-4 w-4" /> Become a Provider
                </button>
              )}
               {user && (
                <button
                  onClick={(e) => handleAuthRequiredNav(e, '/my-bookings')}
                  className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
                >
                  My Bookings
                </button>
              )}
            </nav>
          </div>

          <div className="hidden md:flex justify-center col-start-2">
             <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} />
              
          </div>

          <div className="flex items-center justify-end gap-1 md:gap-2">
             {user && !isLoadingReferral && referralSettings?.isReferralSystemEnabled && (
                <button
                  onClick={(e) => handleAuthRequiredNav(e, '/referral')}
                  className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors hidden md:flex items-center ml-4"
                >
                <Handshake className="mr-1 h-4 w-4" /> Refer & Earn up to ₹{referralSettings?.maxEarningsPerReferrer || referralSettings?.referrerBonus || 100}
                </button>
              )}
            <div className="hidden md:flex">
                <ThemeToggle />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSearchPopupOpen(true)} aria-label="Search">
              <Search className="h-5 w-5" />
            </Button>
            {chatIsEnabled && (
                 <Button 
                    variant="ghost" 
                    size="icon" 
                    aria-label="Chat" 
                    onClick={(e) => handleAuthRequiredNav(e, '/chat')}
                    className="relative hidden md:inline-flex" 
                 >
                    <MessageSquare className="h-5 w-5" />
                </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Notifications" onClick={(e) => handleAuthRequiredNav(e, '/notifications')} className="relative">
                <Bell className="h-5 w-5" />
                {isMounted && !isLoadingCount && headerUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
                      {headerUnreadCount > 9 ? '9+' : headerUnreadCount}
                    </span>
                )}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Cart" className="relative" onClick={(e) => handleAuthRequiredNav(e, '/cart')}>
                <ShoppingCart className="h-5 w-5" />
                {isMounted && cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </span>
                )}
            </Button>

            <div className="hidden md:block">
               {!user && !authIsLoading && (
                 <Button variant="outline" size="sm" onClick={(e) => handleSimpleNav(e, '/auth/login')}>Login / Sign Up</Button>
               )}
               {user && (
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.photoURL || undefined} alt={firestoreUser?.displayName || user.displayName || user.email || "User"} />
                          <AvatarFallback>{firestoreUser?.displayName?.charAt(0).toUpperCase() || user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none">{firestoreUser?.displayName || user.displayName || "User"}</p>
                          <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {userSpecificNavItems.filter(item => item.condition ? item.condition() : true).map(item => (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link href={item.href} onClick={(e) => handleAuthRequiredNav(e, item.href)}>
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      {user.email === ADMIN_EMAIL && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin" onClick={(e) => handleAuthRequiredNav(e, "/admin")}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            Admin Panel
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => {e.stopPropagation(); showLoading(); logOut();}} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        <LogOut className="mr-2 h-4 w-4" />
                        Log out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
               )}
            </div>
          </div>
        </div>
      </header>
      <SearchPopup isOpen={isSearchPopupOpen} onClose={() => setIsSearchPopupOpen(false)} />
    </>
  );
};

export default Header;
