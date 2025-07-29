
"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Star, ShoppingCart, Clock, Users, Plus, Minus, Trash2 } from 'lucide-react';
import type { FirestoreService } from '@/types/firestore';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { getCartEntries, saveCartEntries, type CartEntry } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { cn } from '@/lib/utils';
import { useLoading } from '@/contexts/LoadingContext'; // Correct loading hook

interface ServiceCardProps {
  service: FirestoreService;
  priority?: boolean;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "service";
};

const ServiceCard: React.FC<ServiceCardProps> = ({ service, priority = false }) => {
  const [quantity, setQuantity] = useState(0);
  const { toast } = useToast();
  const router = useRouter();
  const { user, triggerAuthRedirect } = useAuth();
  const currentPathname = usePathname();
  const { showLoading } = useLoading(); // Use the correct hook

  useEffect(() => {
    const cartEntries = getCartEntries();
    const existingEntry = cartEntries.find(entry => entry.serviceId === service.id);
    if (existingEntry) {
      setQuantity(existingEntry.quantity);
    } else {
      setQuantity(0);
    }
  }, [service.id]);

  const updateCartAndShowToast = (newQuantity: number, action: 'added' | 'updated' | 'removed') => {
    let cartEntries = getCartEntries();
    const existingEntryIndex = cartEntries.findIndex(entry => entry.serviceId === service.id);

    if (newQuantity > 0) {
      if (existingEntryIndex > -1) {
        cartEntries[existingEntryIndex].quantity = newQuantity;
      } else {
        cartEntries.push({ serviceId: service.id, quantity: newQuantity });
      }
    } else {
      if (existingEntryIndex > -1) {
        cartEntries.splice(existingEntryIndex, 1);
      }
    }
    saveCartEntries(cartEntries);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: 'wecanfixUserCart' }));
    }

    if (action === 'added') {
      toast({ title: "Added to Cart", description: `${service.name} (x${newQuantity}) added to your cart.` });
      logUserActivity(
        'addToCart',
        { serviceId: service.id, serviceName: service.name, quantity: newQuantity, price: service.price },
        user?.uid,
        !user ? getGuestId() : null
      );
    } else if (action === 'updated') {
      // We can keep this silent to avoid too many toasts
    } else if (action === 'removed') {
      toast({ title: "Item Removed", description: `${service.name} removed from cart.` });
    }
  };

  const handleInitialAddToCart = () => {
    if (!user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    const newQuantity = 1;
    setQuantity(newQuantity);
    updateCartAndShowToast(newQuantity, 'added');
  };

  const handleQuantityChange = (newQuantity: number) => {
    const oldQuantity = quantity;
    if (newQuantity > 0 && oldQuantity === 0 && !user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    setQuantity(newQuantity);
    if (newQuantity === 0 && oldQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'removed');
    } else if (newQuantity > 0 && oldQuantity === 0) {
        updateCartAndShowToast(newQuantity, 'added');
    } else if (newQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'updated');
    }
  };

  const handleNavigation = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const intendedHref = `/service/${service.slug}`;
    if (intendedHref !== currentPathname) {
      e.preventDefault();
      showLoading();
      router.push(intendedHref);
    }
  }, [service.slug, currentPathname, showLoading, router]);

  const taskTimeDisplay = service.taskTimeValue && service.taskTimeUnit ? `${service.taskTimeValue}${service.taskTimeUnit.charAt(0)}` : null;
  const displayImageUrl = service.imageUrl && service.imageUrl.trim() !== '' ? service.imageUrl : "https://placehold.co/300x300.png";
  const aiHintValue = generateAiHint(service.imageHint, service.name);

  return (
    <div className="relative pb-0 md:pb-0">
      {/* Card Container */}
      <div className="flex flex-col p-3 my-2 gap-3 bg-card border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 w-full">
        
        {/* Mobile-only Layout Container */}
        <div className="flex flex-row md:hidden w-full gap-3">
          {/* Left Side (Details) - Mobile */}
          <div className="flex-1 flex flex-col">
            <Link href={`/service/${service.slug}`} onClick={handleNavigation} className="group">
              <h3 className="font-bold text-base font-headline leading-tight text-foreground line-clamp-3 group-hover:text-primary transition-colors">{service.name}</h3>
            </Link>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{service.description}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1" title="Members required"><Users className="h-3.5 w-3.5 text-primary"/><span>1</span></div>
                {taskTimeDisplay && (<div className="flex items-center gap-1" title={`Estimated time: ${taskTimeDisplay}`}><Clock className="h-3.5 w-3.5 text-primary" /><span>{taskTimeDisplay}</span></div>)}
                {service.rating > 0 && (<div className="flex items-center gap-1" title={`${service.rating.toFixed(1)} rating`}><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /><span>{service.rating.toFixed(1)}</span></div>)}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
                <p className="text-lg font-bold text-foreground">₹{service.discountedPrice ?? service.price}</p>
                {service.discountedPrice && service.discountedPrice < service.price && (<p className="text-sm text-muted-foreground line-through">₹{service.price}</p>)}
            </div>
            <Link href={`/service/${service.slug}`} onClick={handleNavigation} className="text-sm text-primary hover:underline font-medium mt-1">View More</Link>
          </div>
          {/* Right Side (Image & Actions) - Mobile */}
          <div className="flex flex-col items-center justify-between flex-shrink-0 w-28">
            <Link href={`/service/${service.slug}`} onClick={handleNavigation} className="relative w-full h-28" aria-label={`View details for ${service.name}`}>
                <Image src={displayImageUrl} alt={service.name} fill sizes="112px" className="object-cover rounded-lg" data-ai-hint={aiHintValue} priority={priority} onError={(e) => { const target = e.target as HTMLImageElement; if (target.src !== "https://placehold.co/300x300.png") { target.src = "https://placehold.co/300x300.png"; }}}/>
            </Link>
            <div className="w-full mt-2">
                {quantity === 0 ? (<Button size="sm" className="h-9 rounded-md px-4 w-full" onClick={handleInitialAddToCart}> Add</Button>) : (<QuantitySelector initialQuantity={quantity} onQuantityChange={handleQuantityChange} minQuantity={0}/>)}
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex flex-row items-center w-full gap-4">
            {/* Image for Desktop */}
            <Link href={`/service/${service.slug}`} onClick={handleNavigation} className="relative w-32 h-40 flex-shrink-0" aria-label={`View details for ${service.name}`}>
                <Image
                    src={displayImageUrl}
                    alt={service.name}
                    fill
                    sizes="128px"
                    className="object-cover rounded-lg"
                    data-ai-hint={aiHintValue}
                    priority={priority}
                    onError={(e) => { const target = e.target as HTMLImageElement; if (target.src !== "https://placehold.co/300x300.png") { target.src = "https://placehold.co/300x300.png"; }}}
                />
            </Link>
            {/* Details for Desktop */}
            <div className="flex-1 flex flex-col self-stretch">
                <Link href={`/service/${service.slug}`} onClick={handleNavigation} className="group">
                    <h3 className="font-bold text-lg leading-tight text-foreground line-clamp-2 group-hover:text-primary transition-colors">{service.name}</h3>
                </Link>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{service.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1" title="Members required"><Users className="h-3.5 w-3.5 text-primary"/><span>1</span></div>
                    {taskTimeDisplay && (<div className="flex items-center gap-1" title={`Estimated time: ${taskTimeDisplay}`}><Clock className="h-3.5 w-3.5 text-primary" /><span>{taskTimeDisplay}</span></div>)}
                    {service.rating > 0 && (<div className="flex items-center gap-1" title={`${service.rating.toFixed(1)} rating`}><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /><span>{service.rating.toFixed(1)}</span></div>)}
                </div>
                {/* Spacer */}
                <div className="flex-grow"></div>
                {/* Bottom row for price and view more */}
                <div className="flex items-end justify-between">
                     <div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xl font-bold text-foreground">₹{service.discountedPrice ?? service.price}</p>
                            {service.discountedPrice && service.discountedPrice < service.price && (<p className="text-base text-muted-foreground line-through">₹{service.price}</p>)}
                        </div>
                        <Link href={`/service/${service.slug}`} onClick={handleNavigation} className="text-sm text-primary hover:underline font-medium mt-1">View More</Link>
                     </div>
                </div>
            </div>
             {/* Desktop Add to Cart Button */}
            <div className="flex flex-col items-center justify-center pl-4 w-32">
                 {quantity === 0 ? (
                    <Button size="lg" className="h-10 rounded-md w-full" onClick={handleInitialAddToCart}>
                        Add
                    </Button>
                  ) : (
                    <QuantitySelector
                      initialQuantity={quantity}
                      onQuantityChange={handleQuantityChange}
                      minQuantity={0}
                    />
                  )}
            </div>
        </div>

      </div>
    </div>
  );
};

export default ServiceCard;
