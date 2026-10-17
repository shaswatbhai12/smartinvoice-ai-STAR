
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import AuthGate from './components/AuthGate';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// With a Clerk key the app requires login and stores data in the cloud database.
// Without one it keeps working exactly as before, saving in this browser only.
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
        <AuthGate />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
