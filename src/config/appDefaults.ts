
import type { AppSettings, ThemeColors } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL } from '@/lib/colorUtils';

export const defaultAppSettings: AppSettings = {
  // General
  enableMinimumBookingPolicy: false,
  minimumBookingAmount: 500,
  visitingChargeAmount: 100, // This is the DISPLAYED visiting charge
  isVisitingChargeTaxInclusive: false, // Default to exclusive
  minimumBookingPolicyDescription: "A visiting charge of ₹{VISITING_CHARGE} will be applied if your booking total is below ₹{MINIMUM_BOOKING_AMOUNT}.",
  googleMapsApiKey: "",
  smtpHost: "",
  smtpPort: "587", // Default to common non-SSL/TLS port
  smtpUser: "",
  smtpPass: "",
  senderEmail: "",
  enableHeroCarousel: true,
  enableCarouselAutoplay: true, 
  carouselAutoplayDelay: 5000, 
  enableTaxOnVisitingCharge: true, 
  visitingChargeTaxPercent: 5,     
  // Payment
  enableOnlinePayment: true,
  razorpayKeyId: "",
  razorpayKeySecret: "",
  enableCOD: true, // Represents "Pay After Service"
  // Time Slots
  timeSlotSettings: {
    morning: { startTime: "09:00", endTime: "12:00" },
    afternoon: { startTime: "13:00", endTime: "17:00" },
    evening: { startTime: "17:00", endTime: "19:00" },
    slotIntervalMinutes: 60,
  },
  enableLimitLateBookings: false,
  limitLateBookingHours: 4,
  // Platform Fees
  platformFees: [], // Default to an empty array
  // Cancellation Policy
  enableCancellationPolicy: false,
  freeCancellationDays: 1, // e.g., 1 day before
  freeCancellationHours: 0,
  freeCancellationMinutes: 0,
  cancellationFeeType: 'fixed', // 'fixed' or 'percentage'
  cancellationFeeValue: 100, // e.g., 100 (for fixed) or 10 (for 10%)

  // Chat setting - default sound URL
  // User needs to place default-notification.mp3 in public/sounds/
  chatNotificationSoundUrl: "/sounds/default-notification.mp3", 
  isChatEnabled: false, // Default chat to false. Will be managed in GlobalWebSettings now.
  
  isProviderRegistrationEnabled: true, // Added default

  // Login Settings
  enableEmailPasswordLogin: true,
  enableOtpLogin: true,
  enableGoogleLogin: true,
  defaultLoginMethod: 'email',
  defaultOtpCountryCode: '+91',

  updatedAt: undefined, // No default for updatedAt
};

// Default theme colors are now primarily managed in useGlobalSettings and colorUtils
// This is because themeColors is part of GlobalWebSettings, not AppSettings.
    
