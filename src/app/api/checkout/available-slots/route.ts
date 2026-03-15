
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { AppSettings, FirestoreService, FirestoreSubCategory, TimeSlotCategoryLimit, FirestoreBooking } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';

interface CartEntry {
  serviceId: string;
  quantity: number;
}

const DEFAULT_SLOT_INTERVAL_MINUTES = defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
const DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS = defaultAppSettings.enableLimitLateBookings;
const DEFAULT_HOURS_WHEN_LIMIT_ENABLED = defaultAppSettings.limitLateBookingHours;

// --- Helper Functions ---

const getServiceDurationInMinutes = (service: FirestoreService): number => {
    if (!service.taskTimeValue || !service.taskTimeUnit) return 0;
    if (service.taskTimeUnit === 'hours') {
        return service.taskTimeValue * 60;
    }
    return service.taskTimeValue;
};

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

const getSlotKey = (dateISO: string, minutes: number) => `${dateISO}:${minutes}`;

/**
 * Calculates the EXACT end date and time for a booking,
 * respecting working hours and multi-day spillovers.
 */
function calculateEndDateTime(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings
): string {
    let remainingMinutes = workDuration + bufferDuration;
    let currentMinutes = startMinutes;
    let currentDate = new Date(startDateISO);
    
    while (remainingMinutes > 0) {
        let dayName = getDayName(currentDate);
        let dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];

        while (!dayAvailability.isEnabled) {
            currentDate.setDate(currentDate.getDate() + 1);
            dayName = getDayName(currentDate);
            dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];
            currentMinutes = parseTimeToMinutes(dayAvailability.startTime);
        }

        const dayStart = parseTimeToMinutes(dayAvailability.startTime);
        const dayEnd = parseTimeToMinutes(dayAvailability.endTime);

        if (currentMinutes < dayStart) currentMinutes = dayStart;

        const minutesAvailableToday = dayEnd - currentMinutes;

        if (minutesAvailableToday <= 0) {
            currentDate.setDate(currentDate.getDate() + 1);
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
            continue;
        }

        if (remainingMinutes <= minutesAvailableToday) {
            currentMinutes += remainingMinutes;
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesAvailableToday;
            currentDate.setDate(currentDate.getDate() + 1);
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
        }
    }
    
    const finalDate = new Date(currentDate);
    finalDate.setHours(Math.floor(currentMinutes / 60), currentMinutes % 60, 0, 0);
    return finalDate.toISOString();
}

/**
 * Simulates a continuous timeline of work across multiple days.
 * Yields every slot interval that has any overlap with the Work + Buffer range.
 */
function* simulateProgression(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings
) {
    let remainingMinutesToBlock = workDuration + bufferDuration;
    let currentMinutes = startMinutes;
    let currentDate = new Date(startDateISO);
    
    const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;

    while (remainingMinutesToBlock > 0) {
        let dateISO = currentDate.toLocaleDateString('en-CA');
        let dayName = getDayName(currentDate);
        let dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];

        while (!dayAvailability.isEnabled) {
            currentDate.setDate(currentDate.getDate() + 1);
            dateISO = currentDate.toLocaleDateString('en-CA');
            dayName = getDayName(currentDate);
            dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];
            currentMinutes = parseTimeToMinutes(dayAvailability.startTime);
        }

        const dayStart = parseTimeToMinutes(dayAvailability.startTime);
        const dayEnd = parseTimeToMinutes(dayAvailability.endTime);

        if (currentMinutes < dayStart) currentMinutes = dayStart;

        if (currentMinutes >= dayEnd) {
            currentDate.setDate(currentDate.getDate() + 1);
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
            continue;
        }

        yield { dateISO, minutes: currentMinutes };

        remainingMinutesToBlock -= slotInterval;
        currentMinutes += slotInterval;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { selectedDate, cartEntries } = await req.json();

        if (!selectedDate || !cartEntries) {
            return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
        }

        const dateObj = new Date(selectedDate);
        const dateISO = dateObj.toLocaleDateString('en-CA');

        const lookBackDate = new Date(dateObj);
        lookBackDate.setDate(lookBackDate.getDate() - 30);
        const lookBackISO = lookBackDate.toLocaleDateString('en-CA');

        const [appConfigSnap, limitsSnap, servicesSnap, subCatsSnap, bookingsSnap] = await Promise.all([
            adminDb.collection("webSettings").doc("applicationConfig").get(),
            adminDb.collection("timeSlotCategoryLimits").get(),
            adminDb.collection("adminServices").get(),
            adminDb.collection("adminSubCategories").get(),
            adminDb.collection("bookings")
                .where("scheduledDate", ">=", lookBackISO)
                .where("scheduledDate", "<=", dateISO) 
                .get()
        ]);

        const appConfig = (appConfigSnap.exists ? appConfigSnap.data() : defaultAppSettings) as AppSettings;
        const limitsData = Object.fromEntries(limitsSnap.docs.map(doc => [doc.data().categoryId, { id: doc.id, ...doc.data() } as TimeSlotCategoryLimit]));
        const servicesData = Object.fromEntries(servicesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));
        const subCatsData = Object.fromEntries(subCatsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreSubCategory]));
        const existingBookings = bookingsSnap.docs.map(doc => doc.data() as FirestoreBooking);

        const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;
        const breakTimeMinutes = appConfig.timeSlotSettings?.breakTimeMinutes || 0;
        const enableLimitLateBookings = appConfig.enableLimitLateBookings ?? DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS;
        const limitLateBookingHours = enableLimitLateBookings ? (appConfig.limitLateBookingHours ?? DEFAULT_HOURS_WHEN_LIMIT_ENABLED) : 0;
        const weeklyAvailability = appConfig.timeSlotSettings?.weeklyAvailability || defaultAppSettings.timeSlotSettings.weeklyAvailability;

        const uniqueCartCategoryIds = new Set<string>();
        let totalCartDuration = 0;
        cartEntries.forEach((entry: CartEntry) => {
            const service = servicesData[entry.serviceId];
            if (service) {
                totalCartDuration += getServiceDurationInMinutes(service) * entry.quantity;
                const subCat = subCatsData[service.subCategoryId];
                if (subCat?.parentId) uniqueCartCategoryIds.add(subCat.parentId);
            }
        });
        const cartCategoryIds = Array.from(uniqueCartCategoryIds);

        const globalBusyMap = new Map<string, { count: number; categoryIds: Set<string> }>();

        existingBookings.forEach(booking => {
            let bookingWorkDuration = 0;
            const bookingCategoryIds = new Set<string>();

            booking.services.forEach(item => {
                const serviceDetail = servicesData[item.serviceId];
                if (serviceDetail) {
                    bookingWorkDuration += getServiceDurationInMinutes(serviceDetail) * item.quantity;
                    const subCat = subCatsData[serviceDetail.subCategoryId];
                    if (subCat?.parentId) bookingCategoryIds.add(subCat.parentId);
                }
            });

            const startMin = parseTimeToMinutes(booking.scheduledTimeSlot);
            const progression = simulateProgression(booking.scheduledDate, startMin, bookingWorkDuration, breakTimeMinutes, appConfig);

            for (const step of progression) {
                const key = getSlotKey(step.dateISO, step.minutes);
                const info = globalBusyMap.get(key) || { count: 0, categoryIds: new Set() };
                info.count++;
                bookingCategoryIds.forEach(id => info.categoryIds.add(id));
                globalBusyMap.set(key, info);
            }
        });

        const selectedDayName = getDayName(dateObj);
        const selectedDayAvail = weeklyAvailability[selectedDayName];
        if (!selectedDayAvail?.isEnabled) {
            return NextResponse.json({ availableTimeSlots: [], totalCartDuration });
        }

        const now = new Date();
        const earliestBookableTime = new Date(now.getTime() + (limitLateBookingHours * 60 * 60 * 1000));
        const dayStartMinutes = parseTimeToMinutes(selectedDayAvail.startTime);
        const dayEndMinutes = parseTimeToMinutes(selectedDayAvail.endTime);

        const availableSlots: { slot: string; remainingCapacity: number, endDateTime: string }[] = [];

        let potentialStart = dayStartMinutes;
        while (potentialStart < dayEndMinutes) {
            const slotDateTime = new Date(dateObj);
            slotDateTime.setHours(Math.floor(potentialStart / 60), potentialStart % 60, 0, 0);

            if (slotDateTime < earliestBookableTime) {
                potentialStart += slotInterval;
                continue;
            }

            let isPathClear = true;
            let minRemainingCapacity = Infinity;

            const path = simulateProgression(dateISO, potentialStart, totalCartDuration, breakTimeMinutes, appConfig);
            
            for (const step of path) {
                const key = getSlotKey(step.dateISO, step.minutes);
                const busyInfo = globalBusyMap.get(key);

                for (const catId of cartCategoryIds) {
                    const limit = limitsData[catId]?.maxConcurrentBookings || 1;
                    const currentBookings = busyInfo?.categoryIds.has(catId) ? (busyInfo?.count || 0) : 0;
                    const remaining = limit - currentBookings;
                    
                    minRemainingCapacity = Math.min(minRemainingCapacity, remaining);
                    if (remaining <= 0) {
                        isPathClear = false;
                        break;
                    }
                }
                if (!isPathClear) break;
            }

            if (isPathClear) {
                // IMPORTANT: We pass 0 for bufferDuration here so the CUSTOMER only sees the work end time.
                const endDateTime = calculateEndDateTime(dateISO, potentialStart, totalCartDuration, 0, appConfig);
                availableSlots.push({ 
                    slot: formatTimeFromMinutes(potentialStart), 
                    remainingCapacity: minRemainingCapacity,
                    endDateTime: endDateTime
                });
            }

            potentialStart += slotInterval;
        }

        return NextResponse.json({ availableTimeSlots: availableSlots, totalCartDuration });
    } catch (error) {
        console.error("Continuous Multi-day API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
