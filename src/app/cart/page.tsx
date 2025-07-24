
"use client";

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { Trash2, ShoppingCart, ArrowRight, Home, Loader2, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FirestoreService } from '@/types/firestore';
import { getCartEntries, saveCartEntries, type CartEntry } from '@/lib/cartManager';
import { db } from '@/lib/firebase'; 
import { doc, getDoc } from "firebase/firestore";
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter, usePathname } from 'next/navigation';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import TaxBreakdownDisplay from '@/components/shared/TaxBreakdownDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger'; 
import { useAuth as useAuthHook } from '@/hooks/useAuth'; 
import { getGuestId } from '@/lib/guestIdManager'; 
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export interface CartItem extends FirestoreService {
  quantity: number;
}

// Helper to derive base price
const getBasePrice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return displayedPrice / (1 + taxPercent / 100);
  }
  return displayedPrice;
};

function CartPageContent() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoadingCart, setIsLoadingCart] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const { user } = useAuthHook(); 
  const currentPathname = usePathname();

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const [subtotal, setSubtotal] = useState(0); 
  const [visitingCharge, setVisitingCharge] = useState(0); 
  const [estimatedTax, setEstimatedTax] = useState(0); 
  const [total, setTotal] = useState(0); 
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [effectiveTaxRateDisplay, setEffectiveTaxRateDisplay] = useState<string>("Est. Tax");
  const [isTaxBreakdownOpen, setIsTaxBreakdownOpen] = useState(false);
  const [taxBreakdownItems, setTaxBreakdownItems] = useState<Parameters<typeof TaxBreakdownDisplay>[0]['items']>([]);
  const [visitingChargeBreakdown, setVisitingChargeBreakdown] = useState<Parameters<typeof TaxBreakdownDisplay>[0]['visitingCharge']>(null);
  const [sumOfDisplayedItemPrices, setSumOfDisplayedItemPrices] = useState(0);


  const { showLoading } = useLoading();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const loadCartItems = async () => {
      setIsLoadingCart(true);
      const entries = getCartEntries();
      if (entries.length === 0) {
        setCartItems([]);
        setIsLoadingCart(false);
        return;
      }

      try {
        const loadedCartItemsPromises = entries.map(async (entry) => {
          const serviceDocRef = doc(db, "adminServices", entry.serviceId);
          const serviceSnap = await getDoc(serviceDocRef);
          if (serviceSnap.exists()) {
            const serviceData = serviceSnap.data() as FirestoreService;
            const price = typeof serviceData.price === 'number' ? serviceData.price : 0;
            const discountedPrice = typeof serviceData.discountedPrice === 'number' ? serviceData.discountedPrice : undefined;

            return {
              ...serviceData,
              id: serviceSnap.id,
              quantity: entry.quantity,
              price,
              isTaxInclusive: serviceData.isTaxInclusive === true, 
              discountedPrice,
              taxPercent: serviceData.taxPercent,
            };
          }
          console.warn(`Service with ID ${entry.serviceId} not found in Firestore. Removing from cart.`);
          return null;
        });

        const resolvedItems = await Promise.all(loadedCartItemsPromises);
        const validItems = resolvedItems.filter((item): item is CartItem => item !== null);

        setCartItems(validItems);

        if (validItems.length !== entries.length) {
          const validEntries = validItems.map(item => ({ serviceId: item.id, quantity: item.quantity }));
          saveCartEntries(validEntries);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new StorageEvent('storage', { key: 'fixbroUserCart' }));
          }
        }

      } catch (error) {
        console.error("Error loading cart items from Firestore:", error);
        toast({
          title: "Error",
          description: "Could not load cart details. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingCart(false);
      }
    };

    loadCartItems();
  }, [isMounted, toast]);

  useEffect(() => {
    if (!isMounted || isLoadingCart || isLoadingAppSettings || cartItems.length === 0) {
      if (cartItems.length === 0 && !isLoadingCart && !isLoadingAppSettings) {
         setSubtotal(0); setVisitingCharge(0); setEstimatedTax(0); setTotal(0); setPolicyMessage(null); setEffectiveTaxRateDisplay("Est. Tax");
         setTaxBreakdownItems([]); setVisitingChargeBreakdown(null); setSumOfDisplayedItemPrices(0);
      }
      return;
    }

    let currentBaseSubtotalFromItems = 0;
    let currentSumOfDisplayedPrices = 0;
    const newBreakdownItems: typeof taxBreakdownItems = [];
    let allItemsHaveSameTax = true;
    let firstTaxRate: number | undefined = undefined;

    cartItems.forEach((item, index) => {
      const displayedPricePerUnit = (typeof item.discountedPrice === 'number' && item.discountedPrice < item.price)
                         ? item.discountedPrice
                         : item.price;
      currentSumOfDisplayedPrices += displayedPricePerUnit * item.quantity;

      const itemTaxRatePercent = (item.taxPercent !== undefined && item.taxPercent > 0) ? item.taxPercent : 0;
      const basePricePerUnitForItem = getBasePrice(displayedPricePerUnit, item.isTaxInclusive, itemTaxRatePercent);

      currentBaseSubtotalFromItems += basePricePerUnitForItem * item.quantity;
      const itemTaxAmount = (basePricePerUnitForItem * item.quantity) * (itemTaxRatePercent / 100);

      if (index === 0) {
          firstTaxRate = itemTaxRatePercent;
      } else if (itemTaxRatePercent !== firstTaxRate) {
          allItemsHaveSameTax = false;
      }

      newBreakdownItems.push({
          name: item.name,
          quantity: item.quantity,
          pricePerUnit: displayedPricePerUnit,
          itemSubtotal: basePricePerUnitForItem * item.quantity,
          taxPercent: itemTaxRatePercent,
          taxAmount: itemTaxAmount,
          isTaxInclusive: item.isTaxInclusive,
          isDefaultRate: false,
      });
    });
    setSumOfDisplayedItemPrices(currentSumOfDisplayedPrices);
    setSubtotal(currentBaseSubtotalFromItems); 
    setTaxBreakdownItems(newBreakdownItems);

    let calculatedBaseVisitingCharge = 0;
    let displayedVisitingChargeAmount = 0;
    let currentPolicyMessage: string | null = null;

    if (appConfig.enableMinimumBookingPolicy && typeof appConfig.minimumBookingAmount === 'number' && typeof appConfig.visitingChargeAmount === 'number') {
      if (currentSumOfDisplayedPrices > 0 && currentSumOfDisplayedPrices < appConfig.minimumBookingAmount) {
        displayedVisitingChargeAmount = appConfig.visitingChargeAmount;
        calculatedBaseVisitingCharge = getBasePrice(displayedVisitingChargeAmount, appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent);
        if (appConfig.minimumBookingPolicyDescription) {
            currentPolicyMessage = appConfig.minimumBookingPolicyDescription
                .replace("{MINIMUM_BOOKING_AMOUNT}", appConfig.minimumBookingAmount.toString())
                .replace("{VISITING_CHARGE}", (appConfig.visitingChargeAmount || 0).toString());
        }
      }
    }
    setVisitingCharge(calculatedBaseVisitingCharge);
    setPolicyMessage(currentPolicyMessage);

    let totalTaxCalculated = newBreakdownItems.reduce((sum, item) => sum + item.taxAmount, 0);

    let visitingChargeTaxAmount = 0;
    let visitingChargeTaxPercentForBreakdown = 0;
    if (appConfig.enableTaxOnVisitingCharge && calculatedBaseVisitingCharge > 0 && appConfig.visitingChargeTaxPercent > 0) {
        visitingChargeTaxAmount = calculatedBaseVisitingCharge * (appConfig.visitingChargeTaxPercent / 100);
        totalTaxCalculated += visitingChargeTaxAmount;
        visitingChargeTaxPercentForBreakdown = appConfig.visitingChargeTaxPercent;
    }

    setVisitingChargeBreakdown(displayedVisitingChargeAmount > 0 ? {
        amount: displayedVisitingChargeAmount,
        baseAmount: calculatedBaseVisitingCharge,
        taxPercent: visitingChargeTaxPercentForBreakdown,
        taxAmount: visitingChargeTaxAmount,
        isTaxInclusive: appConfig.isVisitingChargeTaxInclusive || false,
    } : null);

    setEstimatedTax(totalTaxCalculated);

    let effectiveGlobalRate = 0;
    if (allItemsHaveSameTax && firstTaxRate !== undefined) {
        effectiveGlobalRate = firstTaxRate;
    }
    if (calculatedBaseVisitingCharge > 0 && appConfig.enableTaxOnVisitingCharge && appConfig.visitingChargeTaxPercent > 0) {
        if (!(allItemsHaveSameTax && appConfig.visitingChargeTaxPercent === firstTaxRate)) {
            allItemsHaveSameTax = false;
        }
    } else if (calculatedBaseVisitingCharge > 0 && (!appConfig.enableTaxOnVisitingCharge || (appConfig.visitingChargeTaxPercent || 0) <= 0)) {
        if (allItemsHaveSameTax && firstTaxRate !== 0) {
            allItemsHaveSameTax = false;
        }
    }

    if (allItemsHaveSameTax && effectiveGlobalRate > 0) {
        setEffectiveTaxRateDisplay(`Tax (${effectiveGlobalRate.toFixed(1)}%)`);
    } else if (totalTaxCalculated > 0) {
        setEffectiveTaxRateDisplay("Total Tax");
    } else {
        setEffectiveTaxRateDisplay("Tax (0%)");
    }

    setTotal(currentBaseSubtotalFromItems + calculatedBaseVisitingCharge + totalTaxCalculated);

  }, [cartItems, appConfig, isMounted, isLoadingCart, isLoadingAppSettings]);


  const updateStoredCart = (updatedCartItems: CartItem[]) => {
    const entriesToSave: CartEntry[] = updatedCartItems.map(item => ({
      serviceId: item.id,
      quantity: item.quantity,
    }));
    saveCartEntries(entriesToSave);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: 'fixbroUserCart' }));
    }
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    const itemBeingChanged = cartItems.find(item => item.id === itemId);
    if (!itemBeingChanged) return;

    const oldQuantity = itemBeingChanged.quantity;

    const updatedItems = cartItems.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      ).filter(item => item.quantity > 0);

    setCartItems(updatedItems);
    updateStoredCart(updatedItems);
    
    const quantityChange = Math.abs(newQuantity - oldQuantity);

    if (newQuantity === 0) {
      toast({ title: "Item Removed", description: `${itemBeingChanged.name} removed from cart.` });
      logUserActivity(
        'removeFromCart',
        { serviceId: itemBeingChanged.id, serviceName: itemBeingChanged.name, quantity: quantityChange },
        user?.uid,
        !user ? getGuestId() : null
      );
    } else if (newQuantity > oldQuantity) {
      toast({ title: "Cart Updated", description: `${itemBeingChanged.name} quantity updated to ${newQuantity}.` });
       logUserActivity(
        'addToCart',
        { serviceId: itemBeingChanged.id, serviceName: itemBeingChanged.name, quantity: quantityChange },
        user?.uid,
        !user ? getGuestId() : null
      );
    } else {
       logUserActivity(
        'removeFromCart',
        { serviceId: itemBeingChanged.id, serviceName: itemBeingChanged.name, quantity: quantityChange },
        user?.uid,
        !user ? getGuestId() : null
      );
    }
  };

  const handleRemoveItem = (itemId: string) => {
    const itemToRemove = cartItems.find(item => item.id === itemId);
    if (!itemToRemove) return;

    const updatedItems = cartItems.filter(item => item.id !== itemId);
    setCartItems(updatedItems);
    updateStoredCart(updatedItems);
    toast({ title: "Item Removed", description: `${itemToRemove.name} removed from your cart.` });
    logUserActivity(
        'removeFromCart',
        { serviceId: itemToRemove.id, serviceName: itemToRemove.name, quantity: itemToRemove.quantity },
        user?.uid,
        !user ? getGuestId() : null
      );
  };

  const handleProceedToSchedule = () => {
    showLoading();
    logUserActivity(
        'checkoutStep',
        { checkoutStepName: 'cart_proceed_to_schedule', pageUrl: currentPathname, cartItemCount: cartItems.length, totalAmount: total },
        user?.uid,
        !user ? getGuestId() : null
      );
    router.push('/checkout/schedule');
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Your Cart" },
  ];


  if (!isMounted || isLoadingCart || isLoadingAppSettings) {
    return (
      <div className="container mx-auto px-4 py-8 text-center flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading your cart...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-8">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-semibold text-foreground">Your Cart</h1>
        <Link href="/" passHref>
          <Button variant="outline" size="sm">
            <Home className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>

      {cartItems.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl sm:text-2xl font-semibold mb-2">Your cart is empty</h2>
          <p className="text-muted-foreground mb-6 text-sm sm:text-base">Looks like you haven't added any services yet.</p>
          <Link href="/categories" passHref>
            <Button>Browse Services</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {cartItems.map(item => (
              <Card key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center p-3 sm:p-4 shadow-sm">
                {item.imageUrl && (
                  <div className="relative w-full sm:w-20 md:w-24 h-32 sm:h-20 md:h-24 rounded-md overflow-hidden mb-3 sm:mb-0 sm:mr-4 flex-shrink-0">
                    <Image src={item.imageUrl} alt={item.name} fill sizes="(max-width: 640px) 100vw, 96px" className="object-cover" data-ai-hint={item.imageHint || "service item"} />
                  </div>
                )}
                <div className="flex-grow">
                  <h3 className="text-md sm:text-lg font-semibold">{item.name}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    {(item.discountedPrice !== undefined && typeof item.discountedPrice === 'number' && item.discountedPrice < item.price) ? (
                      <>
                        <p className="text-sm sm:text-md font-medium text-foreground">₹{item.discountedPrice.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground line-through">₹{item.price.toLocaleString()}</p>
                      </>
                    ) : (
                      <p className="text-sm sm:text-md font-medium text-primary">₹{item.price.toLocaleString()}</p>
                    )}
                    {item.taxPercent && item.taxPercent > 0 ? (
                        item.isTaxInclusive ? (
                            <span className="text-xs text-muted-foreground">(incl. tax)</span>
                        ) : (
                            <span className="text-xs text-muted-foreground">(+{item.taxPercent}% tax)</span>
                        )
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-stretch sm:items-end mt-3 sm:mt-0 space-y-2 sm:space-y-0 sm:ml-4 w-full sm:w-auto">
                  <QuantitySelector
                    initialQuantity={item.quantity}
                    onQuantityChange={(newQuantity) => handleQuantityChange(item.id, newQuantity)}
                    minQuantity={0} 
                    maxQuantity={item.maxQuantity}
                    className="mb-2 sm:mb-0"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive-foreground hover:bg-destructive w-full sm:w-auto text-xs sm:text-sm"
                    onClick={() => handleRemoveItem(item.id)} 
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="shadow-lg sticky top-20 sm:top-24">
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl font-headline">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items Total (Displayed):</span>
                  <span>₹{sumOfDisplayedItemPrices.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {visitingCharge > 0 && (
                  <div className="flex justify-between text-primary">
                    <span className="text-primary">Visiting Charge (Displayed):</span>
                    <span>+ ₹{(appConfig.visitingChargeAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {estimatedTax > 0 && (
                    <div className="flex justify-between items-center">
                    <div className="flex items-center text-muted-foreground">
                        {effectiveTaxRateDisplay}
                        <Dialog open={isTaxBreakdownOpen} onOpenChange={setIsTaxBreakdownOpen}>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 p-0">
                                    <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-primary"/>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[90vw] sm:max-w-md max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Tax Breakdown</DialogTitle>
                                </DialogHeader>
                                <TaxBreakdownDisplay
                                    items={taxBreakdownItems}
                                    visitingCharge={visitingChargeBreakdown}
                                    subTotalBeforeDiscount={subtotal} 
                                    totalDiscount={0} 
                                    totalTax={estimatedTax}
                                    grandTotal={total}
                                    defaultTaxRatePercent={appConfig.visitingChargeTaxPercent || 0}
                                />
                                <DialogClose asChild className="mt-2">
                                   <Button variant="outline" className="w-full">Close</Button>
                                </DialogClose>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <span>+ ₹{estimatedTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-md sm:text-lg">
                  <span>Grand Total:</span>
                  <span>₹{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3 sm:gap-4">
                {policyMessage && (
                   <Alert variant="default" className="text-xs bg-primary/5 border-primary/20">
                     <Info className="h-4 w-4 text-primary" />
                     <AlertDescription className="text-primary/90">
                        {policyMessage}
                     </AlertDescription>
                   </Alert>
                )}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={cartItems.length === 0}
                  onClick={handleProceedToSchedule}
                >
                  Proceed to Schedule <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CartPage() {
  return (
    <ProtectedRoute>
      <CartPageContent />
    </ProtectedRoute>
  );
}
