
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage"; // Import Firebase Storage

// Your web app's Firebase configuration
// IMPORTANT: Make sure these are correct and your Firebase project is set up.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, // Read from environment variable
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app: FirebaseApp;

// Add more detailed logging
console.log("Firebase Config Check: NEXT_PUBLIC_FIREBASE_API_KEY raw value is:", "'" + process.env.NEXT_PUBLIC_FIREBASE_API_KEY + "'");

if (!firebaseConfig.apiKey) {
  console.error("Firebase API Key from process.env.NEXT_PUBLIC_FIREBASE_API_KEY is undefined or empty.");
  throw new Error("Firebase API key is not set. Please check your environment variables NEXT_PUBLIC_FIREBASE_API_KEY.");
}

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app); // Initialize Firebase Storage

export { app, db, auth, storage }; // Export storage
