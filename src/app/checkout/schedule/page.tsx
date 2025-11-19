

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowRight, ArrowLeft, Clock, Loader2, AlertTriangle } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import type { 
  FirestoreService, 
  FirestoreSubCategory, 
  TimeSlotCategoryLimit, 
  FirestoreBooking,
  AppSettings,
  DayAvailability
} from '@/types/firestore';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext'; 
import { useRouter, usePathname } from 'next/navigation';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { defaultAppSettings } from '@/config/appDefaults';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { Badge } from '@/components/ui/badge'; // Import Badge component

const DEFAULT_SLOT_INTERVAL_MINUTES = defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
const DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS = defaultAppSettings.enableLimitLateBookings;
const DEFAULT_HOURS_WHEN_LIMIT_ENABLED = defaultAppSettings.limitLateBookingHours;

const getServiceDurationInMinutes = (service: FirestoreService): number => {
    if (!service.taskTimeValue || !service.taskTimeUnit) return 0;
    if (service.taskTimeUnit === 'hours') {
        return service.taskTimeValue * 60;
    }
    return service.taskTimeValue;
};


export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{ slot: string; remainingCapacity: number }[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingSlotsAndConfig, setIsLoadingSlotsAndConfig] = useState(true); 
  const [isSearchingForNextDay, setIsSearchingForNextDay] = useState(false);
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);

  const { toast } = useToast();
  const { showLoading } = useLoading(); 
  const router = useRouter(); 
  const pathname = usePathname();
  const { user } = useAuth();

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  
  const [timeSlotLimits, setTimeSlotLimits] = useState<Record<string, TimeSlotCategoryLimit>>({});
  const [allServices, setAllServices] = useState<Record<string, FirestoreService>>({});
  const [allSubCategories, setAllSubCategories] = useState<Record<string, FirestoreSubCategory>>({});
  const [bookingsForSelectedDate, setBookingsForSelectedDate] = useState<FirestoreBooking[]>([]);
  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [cartCategoryIds, setCartCategoryIds] = useState<string[]>([]);
  const [totalCartDuration, setTotalCartDuration] = useState(0); 

  const slotIntervalMinutes = useMemo(() => appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES, [appConfig]);
  const breakTimeMinutes = useMemo(() => appConfig.timeSlotSettings?.breakTimeMinutes || 0, [appConfig]);
  const enableLimitLateBookings = useMemo(() => appConfig.enableLimitLateBookings ?? DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS, [appConfig]);
  const limitLateBookingHours = useMemo(() => enableLimitLateBookings ? (appConfig.limitLateBookingHours ?? DEFAULT_HOURS_WHEN_LIMIT_ENABLED) : 0, [appConfig, enableLimitLateBookings]);
  const weeklyAvailability = useMemo(() => appConfig.timeSlotSettings?.weeklyAvailability || defaultAppSettings.timeSlotSettings.weeklyAvailability, [appConfig]);


  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const period = timeMatch[3].toUpperCase();
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    // Fallback for HH:MM format
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const formatTimeFromMinutes = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 && hours < 24 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  const getDayName = (date: Date): keyof AppSettings['timeSlotSettings']['weeklyAvailability'] => {
    const dayIndex = date.getDay();
    const days: (keyof AppSettings['timeSlotSettings']['weeklyAvailability'])[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[dayIndex];
  };

  const calculateSlotsForDay = useCallback(async (date: Date): Promise<{ slot: string; remainingCapacity: number }[]> => {
    const dateISO = date.toLocaleDateString('en-CA');
    const bookingsQuery = query(collection(db, "bookings"), where("scheduledDate", "==", dateISO));
    const bookingsSnap = await getDocs(bookingsQuery);
    const bookingsForDay = bookingsSnap.docs.map(doc => doc.data() as FirestoreBooking);

    const dayName = getDayName(date);
    const dayAvailability = weeklyAvailability[dayName];
    if (!dayAvailability.isEnabled) return [];
    
    const now = new Date();
    const effectiveDelayHours = enableLimitLateBookings ? (limitLateBookingHours || 0) : 0;
    const earliestBookableAbsoluteTime = new Date(now.getTime() + (effectiveDelayHours * 60 * 60 * 1000));
    
    const fullCycleDuration = slotIntervalMinutes + breakTimeMinutes;
    const periodStartTimeMinutes = parseTimeToMinutes(dayAvailability.startTime);
    const periodEndTimeMinutes = parseTimeToMinutes(dayAvailability.endTime);
    
    const availableSlots: { slot: string; remainingCapacity: number }[] = [];

    const busySlotMap = new Map<number, { count: number; categoryIds: Set<string> }>();
    bookingsForDay.forEach(booking => {
      const bookingStartMinutes = parseTimeToMinutes(booking.scheduledTimeSlot);
      let bookingDuration = 0;
      const bookingCategoryIds = new Set<string>();

      booking.services.forEach(item => {
        const serviceDetail = allServices[item.serviceId];
        if (serviceDetail) {
          bookingDuration += getServiceDurationInMinutes(serviceDetail) * item.quantity;
          const subCat = allSubCategories[serviceDetail.subCategoryId];
          if (subCat?.parentId) bookingCategoryIds.add(subCat.parentId);
        }
      });
      
      const bookingSlotsCount = Math.max(1, Math.ceil(bookingDuration / slotIntervalMinutes));

      for (let i = 0; i < bookingSlotsCount; i++) {
        const busySlotTime = bookingStartMinutes + (i * slotIntervalMinutes);
        const slotInfo = busySlotMap.get(busySlotTime) || { count: 0, categoryIds: new Set() };
        slotInfo.count++;
        bookingCategoryIds.forEach(catId => slotInfo.categoryIds.add(catId));
        busySlotMap.set(busySlotTime, slotInfo);
      }
    });

    let potentialStartTimeMinutes = periodStartTimeMinutes;
    while (potentialStartTimeMinutes < periodEndTimeMinutes) {
        const slotString = formatTimeFromMinutes(potentialStartTimeMinutes);
        const slotDateTime = new Date(date);
        slotDateTime.setHours(Math.floor(potentialStartTimeMinutes / 60), potentialStartTimeMinutes % 60, 0, 0);
        
        if (slotDateTime < earliestBookableAbsoluteTime) {
            potentialStartTimeMinutes += fullCycleDuration;
            continue;
        }

        const estimatedEndTimeMinutes = potentialStartTimeMinutes + totalCartDuration;
        if (estimatedEndTimeMinutes > periodEndTimeMinutes) {
            potentialStartTimeMinutes += fullCycleDuration;
            continue;
        }

        let isSlotAvailable = true;
        let minRemainingCapacityInBlock = Infinity;
        const requiredSlotsCount = Math.max(1, Math.ceil(totalCartDuration / slotIntervalMinutes));

        for (let i = 0; i < requiredSlotsCount; i++) {
            const checkTimeMinutes = potentialStartTimeMinutes + (i * slotIntervalMinutes);
            const slotInfo = busySlotMap.get(checkTimeMinutes);
            
            for (const cartCatId of cartCategoryIds) {
                const limitConfig = timeSlotLimits[cartCatId];
                const limit = limitConfig ? limitConfig.maxConcurrentBookings : 1;
                const currentBookingsInSlotForCat = slotInfo?.categoryIds.has(cartCatId) ? (slotInfo?.count || 0) : 0;
                
                const remainingCapacityForThisCat = limit - currentBookingsInSlotForCat;
                minRemainingCapacityInBlock = Math.min(minRemainingCapacityInBlock, remainingCapacityForThisCat);
                
                if (remainingCapacityForThisCat <= 0) {
                    isSlotAvailable = false;
                    break;
                }
            }
            if (!isSlotAvailable) break;
        }

        if (isSlotAvailable) {
            availableSlots.push({ slot: slotString, remainingCapacity: minRemainingCapacityInBlock });
        }

        potentialStartTimeMinutes += fullCycleDuration;
    }
    return availableSlots;
  }, [
    weeklyAvailability, enableLimitLateBookings, limitLateBookingHours, slotIntervalMinutes, breakTimeMinutes,
    allServices, allSubCategories, totalCartDuration, cartCategoryIds, timeSlotLimits
  ]);


  useEffect(() => {
    setIsMounted(true);
    const fetchInitialData = async () => {
      if (isLoadingAppSettings) return;
      setIsLoadingSlotsAndConfig(true);
      setDataFetchError(null);
      try {
        const [limitsSnap, servicesSnap, subCatsSnap] = await Promise.all([
          getDocs(collection(db, "timeSlotCategoryLimits")),
          getDocs(collection(db, "adminServices")),
          getDocs(collection(db, "adminSubCategories")),
        ]);

        const limitsData = Object.fromEntries(limitsSnap.docs.map(doc => [doc.data().categoryId, { id: doc.id, ...doc.data() } as TimeSlotCategoryLimit]));
        const servicesData = Object.fromEntries(servicesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));
        const subCatsData = Object.fromEntries(subCatsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreSubCategory]));
        
        setTimeSlotLimits(limitsData);
        setAllServices(servicesData);
        setAllSubCategories(subCatsData);

        const currentCartEntries = getCartEntries();
        setCartEntries(currentCartEntries);

        const uniqueCartCategoryIds = new Set<string>();
        let currentTotalCartDuration = 0;
        currentCartEntries.forEach(entry => {
          const service = servicesData[entry.serviceId];
          if (service) {
            currentTotalCartDuration += getServiceDurationInMinutes(service) * entry.quantity;
            const subCat = subCatsData[service.subCategoryId];
            if (subCat?.parentId) {
              uniqueCartCategoryIds.add(subCat.parentId);
            }
          }
        });
        setCartCategoryIds(Array.from(uniqueCartCategoryIds));
        setTotalCartDuration(currentTotalCartDuration); 
        
        const savedDateStr = localStorage.getItem('wecanfixScheduledDate');
        const now = new Date();
        let initialDateToDisplay = new Date(now); 
        initialDateToDisplay.setHours(0,0,0,0);
        if (savedDateStr) {
            const parsedSavedDate = new Date(savedDateStr);
            if (!isNaN(parsedSavedDate.getTime()) && parsedSavedDate >= initialDateToDisplay) {
                initialDateToDisplay = parsedSavedDate;
            }
        }
        setSelectedDate(initialDateToDisplay);
        logUserActivity('checkoutStep', { checkoutStepName: 'schedule', pageUrl: pathname }, user?.uid, !user ? getGuestId() : null);

      } catch (error) {
        console.error("Error fetching initial schedule data:", error);
        setDataFetchError("Failed to load scheduling data. Please try again.");
        toast({ title: "Error", description: "Could not load schedule information.", variant: "destructive"});
      } finally {
        setIsLoadingSlotsAndConfig(false);
      }
    };
    if (isMounted && !isLoadingAppSettings) {
      fetchInitialData();
    }
  }, [isMounted, toast, isLoadingAppSettings, pathname, user]); 

  // Fetch bookings whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate || isSearchingForNextDay) return;
    
    const runSlotCalculation = async () => {
        const slots = await calculateSlotsForDay(selectedDate);
        setAvailableTimeSlots(slots);

        // If today has no slots, and we're not already searching, find the next available day
        if (new Date(selectedDate).toDateString() === new Date().toDateString() && slots.length === 0 && !isSearchingForNextDay) {
            setIsSearchingForNextDay(true);
            let nextDay = new Date(selectedDate);
            let found = false;
            for (let i = 0; i < 30; i++) { // Search up to 30 days ahead
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDaySlots = await calculateSlotsForDay(nextDay);
                if (nextDaySlots.length > 0) {
                    setSelectedDate(new Date(nextDay)); // Set to the new found day
                    toast({
                        variant: "destructive",
                        title: "No Slots Today",
                        description: `Showing first available slots for ${nextDay.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
                    });
                    found = true;
                    break;
                }
            }
            if (!found) {
              // No slots found in the next 30 days
            }
            setIsSearchingForNextDay(false);
        }
    };
    runSlotCalculation();
  }, [selectedDate, calculateSlotsForDay, isSearchingForNextDay, toast]);


  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedTimeSlot(undefined); 
  };
  

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const handleProceed = () => {
    if (typeof window !== 'undefined' && selectedDate && selectedTimeSlot) {
      showLoading();
      localStorage.setItem('wecanfixScheduledDate', selectedDate.toLocaleDateString('en-CA'));
      localStorage.setItem('wecanfixScheduledTimeSlot', selectedTimeSlot);
      router.push('/checkout/address');
    }
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Cart", href: "/cart" },
    { label: "Schedule Service" },
  ];

  const formatDateForDisplay = (date: Date | undefined): string => {
    if (!date) return "";
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!isMounted || isLoadingAppSettings || (isLoadingSlotsAndConfig && !selectedDate)) { 
     return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="schedule" />
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="text-xl sm:text-2xl font-headline text-center">Select Date &amp; Time</CardTitle></CardHeader>
          <CardContent className="space-y-6 text-center">
             <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto my-10" />
             <p className="text-muted-foreground">Loading available slots and configurations...</p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
            <Button variant="outline" disabled className="w-full sm:w-auto"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Cart</Button>
            <Button disabled className="w-full sm:w-auto">
              Proceed to Address <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (dataFetchError) {
    return (
       <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="schedule" />
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="text-xl sm:text-2xl font-headline text-center">Error</CardTitle></CardHeader>
          <CardContent className="space-y-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto my-6" />
            <p className="text-destructive">{dataFetchError}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <CheckoutStepper currentStepId="schedule" />
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl font-headline text-center">Select Date &amp; Time</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Choose Date</h3>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                className="rounded-md border"
                disabled={(date) => date < today}
              />
            </div>
          </div>

          {selectedDate && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Clock className="mr-2 h-5 w-5 text-primary" /> Available Time Slots for {formatDateForDisplay(selectedDate)}
              </h3>
              {isSearchingForNextDay ? (
                 <div className="flex justify-center items-center py-4"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Searching for next available day...</div>
              ) : availableTimeSlots.length > 0 ? (
                <RadioGroup
                  value={selectedTimeSlot}
                  onValueChange={setSelectedTimeSlot}
                  className="space-y-3"
                >
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableTimeSlots.map(({ slot, remainingCapacity }) => {
                      const requiredSlotsForCart = Math.max(1, Math.ceil(totalCartDuration / slotIntervalMinutes));
                      return (
                      <Label
                        key={slot.replace(/\s+/g, '-').replace(/:/g, '')}
                        htmlFor={slot.replace(/\s+/g, '-').replace(/:/g, '')}
                        className={`relative flex items-center justify-center space-x-2 border rounded-md p-3 hover:bg-accent/50 cursor-pointer transition-colors
                          ${selectedTimeSlot === slot ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary' : 'border-input bg-background'}`}
                      >
                        <RadioGroupItem value={slot} id={slot.replace(/\s+/g, '-').replace(/:/g, '')} className="border-muted-foreground data-[state=checked]:border-primary-foreground" />
                        <span>{slot}</span>
                        
                        {remainingCapacity > 1 && (
                             <Badge variant="default" className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 bg-green-500 hover:bg-green-600">{remainingCapacity} left</Badge>
                        )}
                      </Label>
                      );
                    })}
                  </div>
                </RadioGroup>
              ) : (
                <p className="text-muted-foreground text-center py-4">No available slots for this date. This could be due to existing bookings or service duration. Please select another date.</p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
          <Link href="/cart" passHref className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto hidden md:flex">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cart
            </Button>
          </Link>
          <Button 
            disabled={!selectedDate || !selectedTimeSlot} 
            onClick={handleProceed}
            className="w-full sm:w-auto"
          >
            Proceed to Address <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}


