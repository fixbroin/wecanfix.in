

import { Car, Droplets, Home, PaintRoller, PlugZap, ShieldCheck, Sparkles, Star, Users, Utensils, Wrench, ClockIcon, Layers, ShoppingBag as ServiceIconLucide, AirVent, Refrigerator } from 'lucide-react';
import type { Icon } from 'lucide-react';

// --- Firestore Admin Panel Types (already in types/firestore.ts, but good for reference) ---
// export interface FirestoreCategory { id: string; name: string; slug: string; iconName: string; order: number; imageUrl?: string; imageHint?: string; }
// export interface FirestoreSubCategory { id: string; parentId: string; name: string; slug: string; iconName: string; order: number; }
// export interface FirestoreService { id: string; subCategoryId: string; name: string; slug: string; iconName: string; description: string; price: number; ... }


// --- Types for Frontend Components (will adapt to use Firestore data) ---
// These types might still be useful for structuring props or local state
// if we transform Firestore data before passing it to very specific components,
// but ideally components adapt to Firestore types directly or via minimal transformation.

export interface ServiceCategory {
  id: string; // Will map to FirestoreCategory.id
  name: string; // Will map to FirestoreCategory.name
  iconName: string; // Changed from icon: Icon
  slug: string; // Will map to FirestoreCategory.slug
  imageUrl?: string; // From FirestoreCategory
  imageHint?: string; // From FirestoreCategory
  subcategories: SubCategory[]; // These will need to be fetched separately
}

export interface SubCategory {
  id: string; // Will map to FirestoreSubCategory.id
  name: string; // Will map to FirestoreSubCategory.name
  iconName: string; // Changed from icon: Icon
  slug: string; // Will map to FirestoreSubCategory.slug
  services: Service[]; // These will need to be fetched separately
}

export interface Service {
  id: string; // Will map to FirestoreService.id
  name: string; // Will map to FirestoreService.name
  iconName: string; // Changed from icon: Icon
  description: string; // Will map to FirestoreService.description
  rating: number;
  reviewCount?: number;
  price: number;
  discountedPrice?: number;
  slug: string; // Will map to FirestoreService.slug
  imageUrl?: string;
  imageHint?: string;
  //isActive: boolean; // From FirestoreService
  //shortDescription?: string; // From FirestoreService
  //fullDescription?: string; // From FirestoreService
}


// --- Mock data for elements NOT YET migrated to Firestore ---

export interface Testimonial {
  id: string;
  name: string;
  text: string;
  rating: number;
  avatarUrl?: string;
}

// Admin types (used in admin forms before saving to Firestore, will be replaced by FirestoreCategory etc.)
export interface AdminCategory {
  id: string;
  name: string;
  iconUrl?: string; // Legacy, will be iconName: string
  order: number;
}

export interface AdminSubCategory {
  id: string;
  name: string;
  parentId: string;
  iconUrl?: string; // Legacy
  order: number;
}

export interface AdminService {
  id: string;
  name: string;
  slug: string;
  photoUrl?: string;
  price: number;
  discountedPrice?: number;
  shortDescription: string;
  fullDescription?: string;
  subCategoryId: string;
  isActive: boolean;
  reviewCount?: number;
}

// --- MOCK DATA SECTION ---
// This mock serviceCategories is being phased out for Firestore.
// Keep it for now as a reference or if some pages haven't been updated yet.
export const serviceCategories_OLD_MOCK: ServiceCategory[] = [
  {
    id: 'cat1',
    name: 'Home Repairs',
    iconName: 'Wrench',
    slug: 'home-repairs',
    imageUrl: '/default-image.png',
    imageHint: 'home repair tools',
    subcategories: [
      {
        id: 'subcat1-1',
        name: 'Plumbing',
        iconName: 'Droplets',
        slug: 'plumbing',
        services: [
          { id: 'serv1-1-1', name: 'Leak Repair', iconName: 'Droplets', description: 'Fix leaky faucets and pipes.', rating: 4.5, reviewCount: 120, price: 1500, discountedPrice: 1200, slug: 'leak-repair', imageUrl: '/default-image.png', imageHint: 'pipe leak' },
          { id: 'serv1-1-2', name: 'Toilet Installation', iconName: 'Home', description: 'Install new toilets.', rating: 4.8, reviewCount: 85, price: 3000, slug: 'toilet-installation', imageUrl: '/default-image.png', imageHint: 'new toilet' },
        ],
      },
      {
        id: 'subcat1-2',
        name: 'Electrical',
        iconName: 'PlugZap',
        slug: 'electrical',
        services: [
          { id: 'serv1-2-1', name: 'Wiring Issues', iconName: 'PlugZap', description: 'Resolve electrical wiring problems.', rating: 4.6, reviewCount: 95, price: 2000, slug: 'wiring-issues', imageUrl: '/default-image.png', imageHint: 'electrical wiring' },
          { id: 'serv1-2-2', name: 'Fan Installation', iconName: 'Home', description: 'Install ceiling and exhaust fans.', rating: 4.7, reviewCount: 70, price: 1800, discountedPrice: 1600, slug: 'fan-installation', imageUrl: '/default-image.png', imageHint: 'ceiling fan' },
        ],
      },
    ],
  },
  // ... other categories from old mock, ensure iconName is used ...
  {
    id: 'cat2',
    name: 'Cleaning Services',
    iconName: 'Sparkles',
    slug: 'cleaning-services',
    imageUrl: '/default-image.png',
    imageHint: 'cleaning supplies',
    subcategories: [
      {
        id: 'subcat2-1',
        name: 'Home Cleaning',
        iconName: 'Home',
        slug: 'home-cleaning',
        services: [
          { id: 'serv2-1-1', name: 'Deep Cleaning', iconName: 'Sparkles', description: 'Thorough cleaning for your entire home.', rating: 4.9, reviewCount: 250, price: 5000, discountedPrice: 4500, slug: 'deep-cleaning', imageUrl: '/default-image.png', imageHint: 'sparkling clean' },
          { id: 'serv2-1-2', name: 'Kitchen Cleaning', iconName: 'Utensils', description: 'Specialized cleaning for kitchens.', rating: 4.7, reviewCount: 180, price: 2500, slug: 'kitchen-cleaning', imageUrl: '/default-image.png', imageHint: 'clean kitchen' },
        ],
      },
    ],
  },
  {
    id: 'cat3',
    name: 'Painting',
    iconName: 'PaintRoller',
    slug: 'painting',
    imageUrl: '/default-image.png',
    imageHint: 'paint cans',
    subcategories: [
       {
        id: 'subcat3-1',
        name: 'Interior Painting',
        iconName: 'Home',
        slug: 'interior-painting',
        services: [
          { id: 'serv3-1-1', name: 'Full Home Interior', iconName: 'PaintRoller', description: 'Complete interior painting.', rating: 4.8, reviewCount: 150, price: 15000, slug: 'full-home-interior', imageUrl: '/default-image.png', imageHint: 'painted room' },
        ],
      },
    ],
  },
   {
    id: 'cat4',
    name: 'Appliance Repair',
    iconName: 'Wrench', // Could also be a more specific icon like Refrigerator or AirVent
    slug: 'appliance-repair',
    imageUrl: '/default-image.png',
    imageHint: 'broken appliance',
    subcategories: [
      {
        id: 'subcat4-1',
        name: 'AC Repair',
        iconName: 'AirVent', 
        slug: 'ac-repair',
        services: [
          { id: 'serv4-1-1', name: 'AC Servicing', iconName: 'Wrench', description: 'Routine AC maintenance and servicing.', rating: 4.7, reviewCount: 220, price: 1200, slug: 'ac-servicing', imageUrl: '/default-image.png', imageHint: 'ac unit' },
          { id: 'serv4-1-2', name: 'AC Installation', iconName: 'Wrench', description: 'New AC unit installation.', rating: 4.8, reviewCount: 110, price: 2500, slug: 'ac-installation', imageUrl: '/default-image.png', imageHint: 'ac install' },
        ],
      },
      {
        id: 'subcat4-2',
        name: 'Refrigerator Repair',
        iconName: 'Refrigerator', 
        slug: 'refrigerator-repair',
        services: [
          { id: 'serv4-2-1', name: 'Fridge Not Cooling', iconName: 'Wrench', description: 'Fix refrigerator cooling issues.', rating: 4.6, reviewCount: 90, price: 1800, slug: 'fridge-not-cooling', imageUrl: '/default-image.png', imageHint: 'open fridge' },
        ],
      },
    ],
  },
  {
    id: 'cat5',
    name: 'Automotive',
    iconName: 'Car',
    slug: 'automotive',
    imageUrl: '/default-image.png',
    imageHint: 'car engine',
    subcategories: [
      {
        id: 'subcat5-1',
        name: 'Car Wash',
        iconName: 'Car',
        slug: 'car-wash',
        services: [
          { id: 'serv5-1-1', name: 'Exterior Car Wash', iconName: 'Droplets', description: 'Complete exterior car wash and polish.', rating: 4.5, reviewCount: 130, price: 800, slug: 'exterior-car-wash', imageUrl: '/default-image.png', imageHint: 'shiny car' },
        ],
      },
    ],
  },
];


export const mockAdminCategories: AdminCategory[] = [
  { id: 'admincat1', name: 'Home Repairs', order: 1, iconUrl: 'Wrench' }, // Changed to iconName style
  { id: 'admincat2', name: 'Cleaning Services', order: 2, iconUrl: 'Sparkles' },
  { id: 'admincat3', name: 'Painting', order: 3, iconUrl: 'PaintRoller' },
  { id: 'admincat4', name: 'Appliance Repair', order: 4, iconUrl: 'Wrench' },
  { id: 'admincat5', name: 'Automotive', order: 5, iconUrl: 'Car' },
];

export const mockAdminSubCategories: AdminSubCategory[] = [
  { id: 'adminsubcat1-1', name: 'Plumbing', parentId: 'admincat1', order: 1, iconUrl: 'Droplets' },
  { id: 'adminsubcat1-2', name: 'Electrical', parentId: 'admincat1', order: 2, iconUrl: 'PlugZap' },
  // ... other subcategories, assuming iconUrl will be iconName
];

export const mockAdminServices: AdminService[] = [
  {
    id: 'adminserv1',
    name: 'Basic Leak Fix',
    slug: 'basic-leak-fix',
    subCategoryId: 'adminsubcat1-1', 
    price: 1000,
    discountedPrice: 800,
    shortDescription: 'Fix minor leaks in faucets or pipes.',
    isActive: true,
    photoUrl: '/default-image.png',
    reviewCount: 50,
  },
  // ... other services
];


export const whyChooseUsItems = [
  { id: 'wc1', title: 'Trusted Professionals', icon: Users, description: 'Experienced and background-verified experts.' },
  { id: 'wc2', title: 'Timely Service', icon: ClockIcon, description: 'We value your time and ensure punctuality.' },
  { id: 'wc3', title: 'Verified Services', icon: ShieldCheck, description: 'Quality assurance for all services provided.' },
  { id: 'wc4', title: 'Transparent Pricing', icon: Star, description: 'No hidden costs, clear and upfront pricing.' },
];
