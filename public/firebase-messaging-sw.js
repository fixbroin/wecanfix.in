
// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// This is a placeholder for Firebase configuration.
// In a real application, you would fetch this configuration dynamically
// or have it injected during the build process.
// For now, you'll need to manually ensure these values are correct
// or find a way to make them available to the service worker,
// possibly through a call to an endpoint that serves them, or by
// storing them in IndexedDB after fetching in the main app.

// Placeholder: Replace with your actual client-side Firebase config
// These values would ideally come from the marketingSettings.firebaseClientConfig
const firebaseConfig = {
  apiKey: "AIzaSyCFpoVtfpcWXrGOw8D4LVVdHhRfoZhaSAA",
  authDomain: "fixbroweb.firebaseapp.com",
  projectId: "fixbroweb",
  storageBucket: "fixbroweb.firebasestorage.app",
  messagingSenderId: "18586372510",
  appId: "1:18586372510:web:6de2b5d6c92d5c3836ee8f"
  
};

// Initialize the Firebase app in the service worker
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // if already initialized, use that one
}

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message.',
    icon: payload.notification?.icon || '/android-chrome-192x192.png', // Path to your app's icon
    data: payload.data || {} // Pass any data from the FCM message
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click Received.', event);
  event.notification.close();

  // Customize the action when a notification is clicked
  // For example, open a specific URL
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  
  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true // Important to find clients that are not yet controlled by this SW version
    }).then((clientList) => {
      for (const client of clientList) {
        // If a window for the app is already open, focus it
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, or no matching window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// TODO: Dynamically fetch firebaseConfig from Firestore (e.g., using marketingSettings)
// This is complex in a service worker due to its lifecycle and restrictions.
// A common approach is to have the main app fetch the config and pass it to the
// service worker via postMessage, then the SW stores it in IndexedDB.
// Or, have an endpoint `/firebase-config.json` that the SW can fetch.
// For initial setup, manually entering the messagingSenderId above is the simplest.
// The service worker needs the `messagingSenderId` to function correctly.
// The other firebaseConfig values are used by `initializeApp`.

// console.log("FixBro Service Worker: firebase-messaging-sw.js loaded and initialized (or attempted).");
// console.log("FixBro Service Worker: Using Messaging Sender ID:", firebaseConfig.messagingSenderId);

