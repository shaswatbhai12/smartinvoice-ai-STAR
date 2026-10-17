import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react';
import App from '../App';
import { CloudSync, SyncStatus } from '../services/cloudSync';
import { createUserClient, isSupabaseConfigured } from '../services/supabaseClient';

const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md text-center space-y-5">
      <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto">
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">SmartInvoice AI</h1>
      {children}
    </div>
  </div>
);

const AuthGate: React.FC = () => {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Always call the latest getToken without recreating the Supabase client.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const sync = useMemo(() => {
    if (!isSignedIn || !userId || !isSupabaseConfigured) return null;
    const client = createUserClient(async () => (await getTokenRef.current()) ?? null);
    return new CloudSync(client, userId, setSyncStatus);
  }, [isSignedIn, userId]);

  useEffect(() => setSyncStatus('idle'), [userId]);

  if (!isLoaded) {
    return (
      <Screen>
        <p className="text-gray-500">Loading…</p>
      </Screen>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <p className="text-red-600 font-medium">Database is not configured.</p>
        <p className="text-sm text-gray-500">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment, then redeploy.
        </p>
      </Screen>
    );
  }

  if (!isSignedIn || !sync) {
    return (
      <Screen>
        <p className="text-gray-500">Sign in to open your invoices from any device.</p>
        <div className="flex flex-col gap-3">
          <SignInButton mode="modal">
            <button className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition">Sign in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="w-full bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition">Create account</button>
          </SignUpButton>
        </div>
      </Screen>
    );
  }

  return <App key={userId} sync={sync} syncStatus={syncStatus} accountSlot={<UserButton />} />;
};

export default AuthGate;
