
'use client';

import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import type { CartEntry } from '@/types/firestore';

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

export const syncCartToFirestore = async (userId: string, cartEntries: CartEntry[]) => {
  if (!userId) return;

  const cartDocRef = doc(db, 'userCarts', userId);

  if (cartEntries.length > 0) {
    try {
      await setDoc(cartDocRef, {
        userId: userId,
        items: cartEntries,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } catch (error) {
      console.error("Error syncing cart to Firestore:", error);
    }
  } else {
    // If cart is empty, delete the document from Firestore
    try {
      await deleteDoc(cartDocRef);
    } catch (error) {
      console.error("Error deleting cart from Firestore:", error);
    }
  }
};
