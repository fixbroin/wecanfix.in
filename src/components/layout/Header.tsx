
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Bell, Menu, X, ShoppingCart, LogOut, UserCircle, Briefcase, Settings2, Moon, Sun, MessageSquare, UserPlus } from 'lucide-react';
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
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; // Added import

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
  const { user, logOut, isLoading: authIsLoading, triggerAuthRedirect } = useAuth();
  const { settings: globalSettings, isLoading: settingsAreLoading } = useGlobalSettings();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig(); // Added
  const [cartItemCount, setCartItemCount] = useState(0);
  const router = useRouter();
  const currentPathnameFromHook = usePathname();
  const { showLoading } = useLoading();

  const { count: unreadCountFromHook, isLoading: isLoadingCount } = useUnreadNotificationsCount(user?.uid);
  const [headerUnreadCount, setHeaderUnreadCount] = useState(0);
  const [currentThemeForIcon, setCurrentThemeForIcon] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setHeaderUnreadCount(unreadCountFromHook);
  }, [unreadCountFromHook]);

  useEffect(() => {
    const getInitialTheme = () => {
        const storedTheme = localStorage.getItem('fixbro-theme') as 'light' | 'dark' | null;
        if (storedTheme) return storedTheme;
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
        if (event.key === 'fixbro-theme') {
            handleThemeChange();
        }
    });

    return () => {
        window.removeEventListener('themeChanged', handleThemeChange);
        window.removeEventListener('storage', (event) => {
            if (event.key === 'fixbro-theme') handleThemeChange();
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
      if (event.key === 'fixbroUserCart' || event.key === null) {
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

  const baseNavItems = [
    { href: '/', label: 'Home', isProtected: false },
    { href: '/categories', label: 'Categories', isProtected: true },
  ];

  const userSpecificNavItems = [
    { href: '/profile', label: 'Profile', icon: UserCircle, isProtected: true },
    { href: '/my-bookings', label: 'My Bookings', icon: Briefcase, isProtected: true },
    { href: '/notifications', label: 'Notifications', icon: Bell, isProtected: true },
    { href: '/chat', label: 'Chat with Support', icon: MessageSquare, condition: () => chatIsEnabled, isProtected: true },
  ];
  
  const guestNavItems = [
      { href: '/auth/login', label: 'Login / Sign Up', isProtected: false }
  ];


  if (!isMounted || settingsAreLoading) {
    return (
      <header className="bg-background/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div data-hydration-state="skeleton" className="container mx-auto px-4 h-16 grid grid-cols-header-layout items-center">
          <div className="flex items-center justify-start">
             <div className="h-8 w-8 bg-muted rounded-full animate-pulse md:hidden" />
          </div>
          <div className="flex justify-center col-start-2">
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

  const chatIsEnabled = isMounted && !settingsAreLoading && globalSettings?.isChatEnabled;

  return (
    <>
      <header className="bg-background/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div data-hydration-state="hydrated" className="container mx-auto px-4 h-16 grid grid-cols-header-layout items-center">
          <div className="flex items-center justify-start">
            <div className="md:hidden">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open menu">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
                  <SheetHeader className="p-4 border-b flex flex-row justify-between items-center">
                    <SheetTitle>
                      <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} />
                    </SheetTitle>
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" aria-label="Close menu">
                        <X className="h-6 w-6" />
                      </Button>
                    </SheetClose>
                  </SheetHeader>
                  <ScrollArea className="flex-grow">
                    <nav className="flex flex-col gap-1 p-4">
                      {baseNavItems.map((item) => (
                        <NavLink 
                          key={item.href} 
                          href={item.href} 
                          onClick={(e) => item.isProtected ? handleAuthRequiredNav(e, item.href) : handleSimpleNav(e, item.href)}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                      { !isLoadingAppConfig && (appConfig.isProviderRegistrationEnabled || (user && user.email === ADMIN_EMAIL)) && (
                        <NavLink href="/provider-registration" onClick={(e) => handleSimpleNav(e, "/provider-registration")}>
                          <UserPlus className="mr-2 inline-block h-4 w-4" /> Become a Provider
                        </NavLink>
                      )}
                      
                      {user ? userSpecificNavItems.filter(item => item.condition ? item.condition() : true).map((item) => (
                        <NavLink key={item.href} href={item.href} onClick={(e) => handleAuthRequiredNav(e, item.href)}>
                          <item.icon className="mr-2 inline-block h-4 w-4" /> {item.label}
                        </NavLink>
                      )) : guestNavItems.map((item) => (
                        <NavLink key={item.href} href={item.href} onClick={(e) => handleSimpleNav(e, item.href)}>
                          {item.label}
                        </NavLink>
                      ))}

                      {user && user.email === ADMIN_EMAIL && (
                          <NavLink href="/admin" onClick={(e) => handleAuthRequiredNav(e, "/admin")}>
                              <Settings2 className="mr-2 inline-block h-4 w-4" /> Admin Panel
                          </NavLink>
                      )}
                       <div className="px-4 py-2 mt-2 flex items-center justify-between">
                         <span className="text-sm text-muted-foreground">Theme:</span>
                         <ThemeToggle />
                       </div>
                      {user && (
                        <NavLink href="#" onClick={(e) => { e.preventDefault(); showLoading(); logOut().finally(() => setIsMobileMenuOpen(false)); }} isButton={true}>
                           <LogOut className="mr-2 inline-block h-4 w-4" /> Log out
                        </NavLink>
                      )}
                    </nav>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
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

          <div className="flex justify-center col-start-2">
             <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} />
          </div>

          <div className="flex items-center justify-end gap-1 md:gap-2">
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
                          <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || "User"} />
                          <AvatarFallback>{user.email ? user.email[0].toUpperCase() : "U"}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none">{user.displayName || "User"}</p>
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
    
