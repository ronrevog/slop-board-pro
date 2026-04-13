/**
 * AuthGate — Login screen for Slop Board Pro
 * 
 * Shows a Google sign-in button. Displayed when the user is not authenticated.
 */

import React, { useState } from 'react';
import { Film } from 'lucide-react';
import { signInWithGoogle } from '../services/firebaseAuth';

interface AuthGateProps {
    onSignedIn: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onSignedIn }) => {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setIsSigningIn(true);
        setError(null);
        try {
            await signInWithGoogle();
            onSignedIn();
        } catch (err: any) {
            setError(err.message || 'Sign-in failed');
        } finally {
            setIsSigningIn(false);
        }
    };

    return (
        <div className="h-screen flex items-center justify-center bg-neutral-950 text-white p-8">
            <div className="w-full max-w-md text-center space-y-8">
                {/* Logo */}
                <div className="space-y-3">
                    <div className="flex items-center justify-center gap-3">
                        <Film className="w-12 h-12 text-red-600" />
                        <h1 className="text-5xl font-serif font-bold tracking-tight">Slop Board</h1>
                    </div>
                    <p className="text-neutral-500 uppercase tracking-widest text-sm font-medium">
                        Cinematic Project Manager
                    </p>
                </div>

                {/* Sign-in Card */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 space-y-6">
                    <div className="space-y-2">
                        <h2 className="text-xl font-medium text-white">Welcome</h2>
                        <p className="text-sm text-neutral-400">
                            Sign in to sync your projects across devices
                        </p>
                    </div>

                    {/* Google Sign-In Button */}
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-900 font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSigningIn ? (
                            <div className="w-5 h-5 border-2 border-neutral-400 border-t-neutral-700 rounded-full animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                        )}
                        <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
                    </button>

                    {/* Error */}
                    {error && (
                        <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-xs text-neutral-600">
                    Your projects are saved to the cloud and synced across all your devices.
                </p>
            </div>
        </div>
    );
};
