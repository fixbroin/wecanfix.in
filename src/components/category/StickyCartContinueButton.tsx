
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import { usePathname } from 'next/navigation';

const StickyCartContinueButton = () => {
  const [cartItemCount, setCartItemCount] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname(); // To help trigger re-renders on navigation if needed

  const updateCartCount = () => {
    const entries = getCartEntries();
    setCartItemCount(entries.reduce((sum, entry) => sum + entry.quantity, 0));
  };

  useEffect(() => {
    setIsMounted(true);
    updateCartCount(); // Initial count

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

  // This effect ensures that if a service is added/removed via ServiceCard,
  // this component re-evaluates cart count. This is a bit of a workaround
  // for direct cross-component reactivity without a global state.
  // A more robust solution would be a global cart context or event bus.
  useEffect(() => {
    if (isMounted) {
      updateCartCount();
    }
  }, [isMounted, pathname]); // Re-check on pathname change as well


  if (!isMounted || cartItemCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full p-1 bg-background/90 backdrop-blur-sm border-t border-border shadow-lg z-40">
      <div className="container mx-auto flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{cartItemCount} item(s) in cart</p>
          {/* Optionally, show total price here later */}
        </div>
        <Link href="/cart" passHref>
          <Button size="lg">
            View Cart &amp; Proceed <ShoppingCart className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default StickyCartContinueButton;

    