
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import { usePathname, useRouter } from 'next/navigation'; 
import { useAuth } from '@/hooks/useAuth'; 
import { useLoading } from '@/contexts/LoadingContext'; 

const StickyCartContinueButton = () => {
  const [cartItemCount, setCartItemCount] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter(); 
  const { user, triggerAuthRedirect } = useAuth(); 
  const { showLoading } = useLoading(); 

  const updateCartCount = () => {
    const entries = getCartEntries();
    setCartItemCount(entries.reduce((sum, entry) => sum + entry.quantity, 0));
  };

  useEffect(() => {
    setIsMounted(true);
    updateCartCount(); 

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'fixbroUserCart') {
        updateCartCount();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
 
  useEffect(() => {
    if (isMounted) {
      updateCartCount();
    }
  }, [isMounted, pathname]); 


  const handleNavigateToCart = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const intendedHref = "/cart";
    showLoading();
    if (!user) {
      triggerAuthRedirect(intendedHref);
    } else {
      router.push(intendedHref);
    }
  };


  if (!isMounted || cartItemCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full p-1 bg-background/90 backdrop-blur-sm border-t border-border shadow-lg z-40">
      <div className="container mx-auto flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{cartItemCount} item(s) in cart</p>
        </div>
        <Link href="/cart" passHref legacyBehavior>
          <Button size="lg" onClick={handleNavigateToCart} aria-label="View Cart and Proceed">
            View Cart &amp; Proceed <ShoppingCart className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default StickyCartContinueButton;
