/**
 * Firebase Authentication Service
 * 
 * Google-only sign-in for Slop Board Pro.
 * Provides auth state listener, sign-in, and sign-out.
 */

import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    User,
} from 'firebase/auth';
import { auth } from './firebase';

const googleProvider = new GoogleAuthProvider();

/** Sign in with Google popup */
export const signInWithGoogle = async (): Promise<User> => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        console.log('✅ Signed in as:', result.user.displayName, result.user.email);
        return result.user;
    } catch (error: any) {
        console.error('Google sign-in failed:', error);
        // Common errors
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error('Sign-in cancelled');
        }
        if (error.code === 'auth/unauthorized-domain') {
            throw new Error(
                'This domain is not authorized for sign-in. Add it to Firebase Console → Authentication → Settings → Authorized domains.'
            );
        }
        throw new Error(error.message || 'Sign-in failed');
    }
};

/** Sign out */
export const signOut = async (): Promise<void> => {
    try {
        await firebaseSignOut(auth);
        console.log('👋 Signed out');
    } catch (error: any) {
        console.error('Sign-out failed:', error);
        throw error;
    }
};

/** Subscribe to auth state changes. Returns unsubscribe function. */
export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
    return onAuthStateChanged(auth, callback);
};

/** Get the currently signed-in user (may be null) */
export const getCurrentUser = (): User | null => {
    return auth.currentUser;
};
