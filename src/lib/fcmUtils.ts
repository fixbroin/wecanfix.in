
"use client";

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app, db } from "./firebase"; // Ensure your firebase.ts exports 'app'
import { doc, setDoc, Timestamp, getDoc } from "firebase/firestore";
import type { MarketingSettings } from "@/types/firestore";

let marketingSettingsCache: MarketingSettings | null = null;

// Function to fetch marketing settings (includes VAPID key and client config)
const getMarketingSettings = async (): Promise<MarketingSettings | null> => {
  if (marketingSettingsCache) return marketingSettingsCache;
  try {
    const settingsDocRef = doc(db, "webSettings", "marketingConfiguration");
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      marketingSettingsCache = docSnap.data() as MarketingSettings;
      return marketingSettingsCache;
    }
    console.warn("FCM Utils: Marketing settings not found in Firestore.");
    return null;
  } catch (error) {
    console.error("FCM Utils: Error fetching marketing settings:", error);
    return null;
  }
};

// Function to initialize Firebase Cloud Messaging and request permission
export const initializeFCM = async (userId?: string | null): Promise<string | null> => {
  if (typeof window === 'undefined' || !userId) {
    console.log("FCM Utils: Not in browser environment or no user ID, skipping FCM init.");
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    console.log("FCM Utils: Firebase Messaging is not supported in this browser.");
    return null;
  }

  const marketingSettings = await getMarketingSettings();
  if (!marketingSettings?.firebasePublicVapidKey) {
    console.warn("FCM Utils: VAPID key for FCM not found in marketing settings. Push notifications will not be enabled.");
    return null;
  }

  try {
    const messaging = getMessaging(app);

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("FCM Utils: Notification permission granted.");

      // Get token
      const fcmToken = await getToken(messaging, {
        vapidKey: marketingSettings.firebasePublicVapidKey,
      });

      if (fcmToken) {
        console.log("FCM Utils: Token received:", fcmToken);
        // Save token to Firestore
        const userDocRef = doc(db, "users", userId);
        // Store token in a subcollection or a map field. Using a map for simplicity here.
        // Key: token, Value: timestamp of registration
        await setDoc(userDocRef, {
          fcmTokens: {
            [fcmToken]: Timestamp.now()
          }
        }, { merge: true });
        console.log("FCM Utils: Token saved to Firestore for user:", userId);
        return fcmToken;
      } else {
        console.log("FCM Utils: No registration token available. Request permission to generate one.");
        return null;
      }
    } else {
      console.log("FCM Utils: Notification permission denied.");
      return null;
    }
  } catch (error) {
    console.error("FCM Utils: Error initializing FCM or getting token:", error);
    return null;
  }
};

// Listener for foreground messages (app is active tab)
// This should be called once in your main app layout or a high-level component
export const onForegroundMessage = () => {
  if (typeof window !== 'undefined' && isSupported()) {
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      console.log("FCM Utils: Message received in foreground: ", payload);
      // Customize how you want to handle the PWA notification here.
      // e.g., show a custom toast, update UI, etc.
      // For a simple browser notification:
      if (payload.notification) {
        new Notification(payload.notification.title || "New Message", {
          body: payload.notification.body || "",
          icon: payload.notification.icon || "/icons/icon-192x192.png", // default icon
        });
      }
    });
  }
};

// Call this function early in your app's lifecycle, e.g., in a root layout client component
// onForegroundMessage();
