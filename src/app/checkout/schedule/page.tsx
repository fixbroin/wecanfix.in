
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
  AppSettings
} from '@/types/firestore';
import { getCartEntries } from '@/lib/cartManager';
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

const DEFAULT_SLOT_INTERVAL_MINUTES = defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
const DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS = defaultAppSettings.enableLimitLateBookings;
const DEFAULT_HOURS_WHEN_LIMIT_ENABLED = defaultAppSettings.limitLateBookingHours;
const DEFAULT_SERVICE_PERIODS = [
    { period: 'morning', startTime: defaultAppSettings.timeSlotSettings.morning.startTime, endTime: defaultAppSettings.timeSlotSettings.morning.endTime },
    { period: 'afternoon', startTime: defaultAppSettings.timeSlotSettings.afternoon.startTime, endTime: defaultAppSettings.timeSlotSettings.afternoon.endTime },
    { period: 'evening', startTime: defaultAppSettings.timeSlotSettings.evening.startTime, endTime: defaultAppSettings.timeSlotSettings.evening.endTime },
];


export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingSlotsAndConfig, setIsLoadingSlotsAndConfig] = useState(true); 
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);

  const { toast } = useToast();
  const { showLoading, hideLoading } = useLoading(); 
  const router = useRouter(); 
  const pathname = usePathname();
  const { user } = useAuth();

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const [timeSlotLimits, setTimeSlotLimits] = useState<Record<string, TimeSlotCategoryLimit>>({});
  const [allServices, setAllServices] = useState<Record<string, FirestoreService>>({});
  const [allSubCategories, setAllSubCategories] = useState<Record<string, FirestoreSubCategory>>({});
  const [bookingsForSelectedDate, setBookingsForSelectedDate] = useState<FirestoreBooking[]>([]);
  const [cartCategoryIds, setCartCategoryIds] = useState<string[]>([]);

  const slotIntervalMinutes = useMemo(() => appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES, [appConfig]);
  const enableLimitLateBookings = useMemo(() => appConfig.enableLimitLateBookings ?? DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS, [appConfig]);
  const limitLateBookingHours = useMemo(() => enableLimitLateBookings ? (appConfig.limitLateBookingHours ?? DEFAULT_HOURS_WHEN_LIMIT_ENABLED) : 0, [appConfig, enableLimitLateBookings]);
  const servicePeriods = useMemo(() => [
    { period: 'morning', startTime: appConfig.timeSlotSettings?.morning?.startTime || DEFAULT_SERVICE_PERIODS[0].startTime, endTime: appConfig.timeSlotSettings?.morning?.endTime || DEFAULT_SERVICE_PERIODS[0].endTime },
    { period: 'afternoon', startTime: appConfig.timeSlotSettings?.afternoon?.startTime || DEFAULT_SERVICE_PERIODS[1].startTime, endTime: appConfig.timeSlotSettings?.afternoon?.endTime || DEFAULT_SERVICE_PERIODS[1].endTime },
    { period: 'evening', startTime: appConfig.timeSlotSettings?.evening?.startTime || DEFAULT_SERVICE_PERIODS[2].startTime, endTime: appConfig.timeSlotSettings?.evening?.endTime || DEFAULT_SERVICE_PERIODS[2].endTime },
  ], [appConfig]);


  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
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

  const generateRawTimeSlots = useCallback((
    referenceDate: Date,
    currentServicePeriods: typeof DEFAULT_SERVICE_PERIODS,
    currentSlotInterval: number,
    currentEnableLimitLateBookings: boolean,
    currentLimitLateBookingHoursParam: number
  ): string[] => {
    const slots: string[] = [];
    const now = new Date();

    let effectiveDelayHours = 0;
    if (currentEnableLimitLateBookings && typeof currentLimitLateBookingHoursParam === 'number' && currentLimitLateBookingHoursParam > 0) {
        effectiveDelayHours = currentLimitLateBookingHoursParam;
    }
    
    // Calculate the absolute earliest time a booking can be made from "now"
    const earliestBookableAbsoluteTime = new Date(
        now.getTime() + 
        (effectiveDelayHours * 60 * 60 * 1000) + 
        (1 * 60 * 1000) // 1-minute buffer for "next available minute" logic
    );
    
    currentServicePeriods.forEach(periodConfig => {
        if (!periodConfig.startTime || !periodConfig.endTime) return;
        let currentSlotTimeMinutes = parseTimeToMinutes(periodConfig.startTime);
        const periodEndTimeMinutes = parseTimeToMinutes(periodConfig.endTime);

        while (currentSlotTimeMinutes < periodEndTimeMinutes) {
            const currentSlotDateTime = new Date(referenceDate);
            currentSlotDateTime.setHours(Math.floor(currentSlotTimeMinutes / 60), currentSlotTimeMinutes % 60, 0, 0);

            if (currentSlotDateTime >= earliestBookableAbsoluteTime) {
                slots.push(formatTimeFromMinutes(currentSlotTimeMinutes));
            }
            currentSlotTimeMinutes += currentSlotInterval;
        }
    });
    return slots;
  }, []);


  const filterSlotsByCapacity = useCallback((
    rawSlots: string[],
    cartCatIds: string[],
    bookingsOnDate: FirestoreBooking[],
    limits: Record<string, TimeSlotCategoryLimit>,
    servicesMap: Record<string, FirestoreService>,
    subCategoriesMap: Record<string, FirestoreSubCategory>
  ): string[] => {
    if (cartCatIds.length === 0) return rawSlots; 

    return rawSlots.filter(slot => {
      for (const cartCategoryId of cartCatIds) {
        const limitConfig = limits[cartCategoryId];
        const maxBookings = limitConfig?.maxConcurrentBookings;

        if (maxBookings === undefined || maxBookings <= 0) { 
          continue; 
        }

        let currentBookingsForCategoryInSlot = 0;
        for (const booking of bookingsOnDate) {
          if (booking.scheduledTimeSlot === slot) {
            for (const bookedService of booking.services) {
              const serviceDetail = servicesMap[bookedService.serviceId];
              if (serviceDetail) {
                const subCategoryDetail = subCategoriesMap[serviceDetail.subCategoryId];
                if (subCategoryDetail && subCategoryDetail.parentId === cartCategoryId) {
                  currentBookingsForCategoryInSlot++;
                }
              }
            }
          }
        }
        if (currentBookingsForCategoryInSlot >= maxBookings) {
          return false; 
        }
      }
      return true; 
    });
  }, []);


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

        const cartEntries = getCartEntries();
        const uniqueCartCategoryIds = new Set<string>();
        cartEntries.forEach(entry => {
          const service = servicesData[entry.serviceId];
          if (service) {
            const subCat = subCatsData[service.subCategoryId];
            if (subCat && subCat.parentId) {
              uniqueCartCategoryIds.add(subCat.parentId);
            }
          }
        });
        setCartCategoryIds(Array.from(uniqueCartCategoryIds));
        
        const savedDateStr = localStorage.getItem('fixbroScheduledDate');
        const now = new Date();
        let initialDateToDisplay = new Date(now); 
        initialDateToDisplay.setHours(0,0,0,0);
        if (savedDateStr) {
            const parsedSavedDate = new Date(savedDateStr);
            if (!isNaN(parsedSavedDate.getTime()) && parsedSavedDate >= initialDateToDisplay) {
                initialDateToDisplay = parsedSavedDate;
            }
        }

        const bookingsQuery = query(collection(db, "bookings"), where("scheduledDate", "==", initialDateToDisplay.toLocaleDateString('en-CA')));
        const bookingsSnap = await getDocs(bookingsQuery);
        const initialBookings = bookingsSnap.docs.map(doc => doc.data() as FirestoreBooking);
        setBookingsForSelectedDate(initialBookings);

        let rawSlots = generateRawTimeSlots(initialDateToDisplay, servicePeriods, slotIntervalMinutes, enableLimitLateBookings, limitLateBookingHours);
        let filtered = filterSlotsByCapacity(rawSlots, Array.from(uniqueCartCategoryIds), initialBookings, limitsData, servicesData, subCatsData);
        
        let finalSlotsToShow = filtered;
        let finalDateToShow = initialDateToDisplay;

        // Try to find slots for "today" (initialDateToDisplay) first
        if (filtered.length === 0) {
          // If no slots for "today", check "tomorrow"
          const tomorrow = new Date(initialDateToDisplay);
          tomorrow.setDate(tomorrow.getDate() + 1);
          // Only update finalDateToShow if tomorrow is different (it always will be here)
          finalDateToShow = tomorrow;

          const bookingsTomorrowQuery = query(collection(db, "bookings"), where("scheduledDate", "==", tomorrow.toLocaleDateString('en-CA')));
          const bookingsTomorrowSnap = await getDocs(bookingsTomorrowQuery);
          const tomorrowBookings = bookingsTomorrowSnap.docs.map(doc => doc.data() as FirestoreBooking);
          setBookingsForSelectedDate(tomorrowBookings); // Update bookings for the new date
          
          rawSlots = generateRawTimeSlots(tomorrow, servicePeriods, slotIntervalMinutes, enableLimitLateBookings, limitLateBookingHours);
          finalSlotsToShow = filterSlotsByCapacity(rawSlots, Array.from(uniqueCartCategoryIds), tomorrowBookings, limitsData, servicesData, subCatsData);
        }
        
        setSelectedDate(finalDateToShow);
        setAvailableTimeSlots(finalSlotsToShow);

        const savedTimeStr = localStorage.getItem('fixbroScheduledTimeSlot');
        const savedDateForTimeSlotMatch = localStorage.getItem('fixbroScheduledDate');
        if (savedTimeStr && finalSlotsToShow.includes(savedTimeStr) && savedDateForTimeSlotMatch === finalDateToShow.toLocaleDateString('en-CA')) {
          setSelectedTimeSlot(savedTimeStr);
        } else {
          setSelectedTimeSlot(undefined);
           localStorage.removeItem('fixbroScheduledTimeSlot');
        }
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
  }, [isMounted, toast, generateRawTimeSlots, filterSlotsByCapacity, isLoadingAppSettings, servicePeriods, slotIntervalMinutes, enableLimitLateBookings, limitLateBookingHours, pathname, user]); 


  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedTimeSlot(undefined); 
    setIsLoadingSlotsAndConfig(true); 

    try {
      const dateISO = date.toLocaleDateString('en-CA'); // Store YYYY-MM-DD for consistency
      const bookingsQuery = query(collection(db, "bookings"), where("scheduledDate", "==", dateISO));
      const bookingsSnap = await getDocs(bookingsQuery);
      const newBookingsForDate = bookingsSnap.docs.map(doc => doc.data() as FirestoreBooking);
      setBookingsForSelectedDate(newBookingsForDate);
      
      const rawSlots = generateRawTimeSlots(date, servicePeriods, slotIntervalMinutes, enableLimitLateBookings, limitLateBookingHours);
      const filtered = filterSlotsByCapacity(rawSlots, cartCategoryIds, newBookingsForDate, timeSlotLimits, allServices, allSubCategories);
      setAvailableTimeSlots(filtered);

    } catch (error) {
        console.error("Error fetching bookings for selected date:", error);
        setDataFetchError("Failed to load slots for the selected date.");
        setAvailableTimeSlots([]);
    } finally {
      setIsLoadingSlotsAndConfig(false);
    }
  };
  

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const handleProceed = () => {
    if (typeof window !== 'undefined' && selectedDate && selectedTimeSlot) {
      showLoading();
      localStorage.setItem('fixbroScheduledDate', selectedDate.toLocaleDateString('en-CA')); // Store YYYY-MM-DD
      localStorage.setItem('fixbroScheduledTimeSlot', selectedTimeSlot);
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
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl font-headline text-center">Select Date &amp; Time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
             <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto my-10" />
             <p className="text-muted-foreground">Loading available slots and configurations...</p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
            <Button variant="outline" disabled className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cart
            </Button>
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
              {isLoadingSlotsAndConfig ? (
                <div className="flex justify-center items-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="ml-2 text-muted-foreground">Fetching slots...</p>
                </div>
              ) : availableTimeSlots.length > 0 ? (
                <RadioGroup
                  value={selectedTimeSlot}
                  onValueChange={setSelectedTimeSlot}
                  className="space-y-3"
                >
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableTimeSlots.map(slot => (
                      <Label
                        key={slot.replace(/\s+/g, '-').replace(/:/g, '')}
                        htmlFor={slot.replace(/\s+/g, '-').replace(/:/g, '')}
                        className={`flex items-center justify-center space-x-2 border rounded-md p-3 hover:bg-accent/50 cursor-pointer transition-colors
                          ${selectedTimeSlot === slot ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary' : 'border-input bg-background'}`}
                      >
                        <RadioGroupItem value={slot} id={slot.replace(/\s+/g, '-').replace(/:/g, '')} className="border-muted-foreground data-[state=checked]:border-primary-foreground" />
                        <span>{slot}</span>
                      </Label>
                    ))}
                  </div>
                </RadioGroup>
              ) : (
                <p className="text-muted-foreground text-center py-4">No available slots for this date. Please select another date.</p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
          <Link href="/cart" passHref className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cart
            </Button>
          </Link>
          <Button 
            disabled={!selectedDate || !selectedTimeSlot || isLoadingSlotsAndConfig} 
            onClick={handleProceed}
            className="w-full sm:w-auto"
          >
            {isLoadingSlotsAndConfig && selectedDate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Proceed to Address <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

    
