/**
 * Firebase App Initialization
 * 
 * Slop Board Pro — Cloud sync & authentication via Firebase.
 * Config can be overridden via VITE_FIREBASE_* env vars for different environments.
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBYDLdyGhvgvFZtWJB2UxHTzaoD5UItids",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "slop-board-pro.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "slop-board-pro",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "slop-board-pro.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1070451506699",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1070451506699:web:cc894cd3d6b9ba5fdf910e",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4JETGK2TX6",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log('🔥 Firebase initialized — project:', firebaseConfig.projectId);
} catch (error) {
    console.error('Firebase initialization failed:', error);
    throw error;
}

export { app, auth, db, storage };
