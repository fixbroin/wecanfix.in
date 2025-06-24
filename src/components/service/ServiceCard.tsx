
"use client";

import { useState, useEffect, useCallback } from 'react'; 
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, ShoppingCart, MessageSquare } from 'lucide-react';
import type { FirestoreService } from '@/types/firestore';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { getCartEntries, saveCartEntries, type CartEntry } from '@/lib/cartManager';
import { getIconComponent } from '@/lib/iconMap';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext'; 
import { useAuth } from '@/hooks/useAuth'; 

interface ServiceCardProps {
  service: FirestoreService;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
  const IconComponent = getIconComponent(undefined);
  const [quantity, setQuantity] = useState(0);
  const { toast } = useToast();
  const router = useRouter();
  const { showLoading } = useLoading(); 
  const { user, triggerAuthRedirect } = useAuth(); 

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
      window.dispatchEvent(new StorageEvent('storage', { key: 'fixbroUserCart' }));
    }


    if (action === 'added') {
      toast({ title: "Added to Cart", description: `${service.name} (x${newQuantity}) added to your cart.` });
    } else if (action === 'updated') {
      toast({ title: "Cart Updated", description: `${service.name} quantity updated to ${newQuantity}.` });
    } else if (action === 'removed') {
      toast({ title: "Item Removed", description: `${service.name} removed from cart.` });
    }
  };

  const handleInitialAddToCart = () => {
    const newQuantity = 1;
    setQuantity(newQuantity);
    updateCartAndShowToast(newQuantity, 'added');
  };

  const handleQuantityChange = (newQuantity: number) => {
    const oldQuantity = quantity;
    setQuantity(newQuantity);
    if (newQuantity === 0 && oldQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'removed');
    } else if (newQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'updated');
    }
  };

  const handleMoreDetailsClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const intendedHref = `/service/${service.slug}`;
    showLoading(); 
    // Direct navigation, no auth check here
    // router.push(intendedHref); // Next's Link component handles this
  }, [showLoading, service.slug]);
  
  const priceSuffix = service.isTaxInclusive && service.taxPercent && service.taxPercent > 0 
    ? "(incl. tax)" 
    : (!service.isTaxInclusive && service.taxPercent && service.taxPercent > 0 ? `(+${service.taxPercent}% tax)` : "");

  return (
    <>
      <Card className="overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
        {service.imageUrl && (
          <div className="relative w-full h-48">
            <Image
              src={service.imageUrl}
              alt={service.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
              data-ai-hint={service.imageHint || "service"}
            />
          </div>
        )}
        <CardHeader className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg font-headline leading-tight">{service.name}</CardTitle>
              <div className="flex items-center mt-1 space-x-2">
                {service.rating > 0 && (
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < Math.floor(service.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                    <span className="ml-1 text-xs text-muted-foreground">({service.rating.toFixed(1)})</span>
                  </div>
                )}
                {service.reviewCount !== undefined && service.reviewCount > 0 && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    <span>{service.reviewCount} reviews</span>
                  </div>
                )}
              </div>
            </div>
            {!service.imageUrl && <IconComponent className="h-8 w-8 text-primary ml-2 shrink-0" />}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-grow">
          <CardDescription className="text-sm line-clamp-3">{service.description}</CardDescription>
        </CardContent>
        <CardFooter className="p-4 pt-2 flex flex-col items-start space-y-3">
          <div className="w-full">
            {service.discountedPrice && service.discountedPrice < service.price ? (
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-semibold text-primary">₹{service.discountedPrice.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground line-through">₹{service.price.toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-xl font-semibold text-primary">₹{service.price.toLocaleString()}</p>
            )}
            {priceSuffix && <p className="text-xs text-muted-foreground -mt-1">{priceSuffix}</p>}
          </div>
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link href={`/service/${service.slug}`} passHref legacyBehavior>
              <Button asChild variant="outline" size="sm" className="w-full">
                <a onClick={handleMoreDetailsClick}>More Details</a>
              </Button>
            </Link>
            {quantity === 0 ? (
              <Button size="sm" className="w-full" onClick={handleInitialAddToCart}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <QuantitySelector
                  initialQuantity={quantity}
                  onQuantityChange={handleQuantityChange}
                  minQuantity={0} 
                />
              </div>
            )}
          </div>
        </CardFooter>
      </Card>
    </>
  );
};

export default ServiceCard;

