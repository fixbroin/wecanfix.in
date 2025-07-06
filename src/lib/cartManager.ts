
'use client';

import type { Service, ServiceCategory } from '@/data/mock'; // Ensure ServiceCategory is also imported if needed by findServiceById

export interface CartEntry {
  serviceId: string;
  quantity: number;
}

const CART_STORAGE_KEY = 'fixbroUserCart';

export const getCartEntries = (): CartEntry[] => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
  if (storedCart) {
    try {
      return JSON.parse(storedCart) as CartEntry[];
    } catch (e) {
      console.error("Error parsing cart from localStorage", e);
      return [];
    }
  }
  return [];
};

export const saveCartEntries = (entries: CartEntry[]): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(entries));
};

// Helper function to find a service by ID from the mock data structure
// This is kept separate as it depends on the mock data structure
export const findServiceById = (categories: ServiceCategory[], serviceId: string): Service | undefined => {
  for (const category of categories) {
    for (const subCategory of category.subcategories) {
      const service = subCategory.services.find(s => s.id === serviceId);
      if (service) return service;
    }
  }
  return undefined;
};

