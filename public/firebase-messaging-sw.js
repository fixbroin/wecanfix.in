
// This service worker handles background push notifications from Firebase Cloud Messaging.

// Import the Firebase scripts for the service worker
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Import the dynamic config served by our API route
// This is necessary because service workers cannot access environment variables directly.
importScripts('/api/firebase-config');

// Initialize the Firebase app in the service worker with the fetched config
if (typeof firebaseConfig !== 'undefined') {
    firebase.initializeApp(firebaseConfig);

    // Retrieve an instance of Firebase Messaging so that it can handle background messages.
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        console.log('[firebase-messaging-sw.js] Received background message ', payload);

        // Customize the notification that will be shown to the user
        const notificationTitle = payload.notification.title;
        const notificationOptions = {
            body: payload.notification.body,
            icon: payload.notification.icon || '/android-chrome-192x192.png' // A default icon
        };

        // The self.registration.showNotification() method displays the notification
        self.registration.showNotification(notificationTitle, notificationOptions);
    });
} else {
    console.error("firebase-messaging-sw.js: firebaseConfig is not defined. Firebase could not be initialized. Was /api/firebase-config fetched correctly?");
}
