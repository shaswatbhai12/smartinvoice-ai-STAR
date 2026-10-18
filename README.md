# SmartInvoice AI

GST invoice generator with login (Clerk) and a cloud database (Supabase), so your invoices are available on every device.

- Vendor profiles, GST invoices (CGST+SGST or IGST chosen from the client GSTIN), non-GST invoices, print / PDF
- Receiver autocomplete: type part of a previously billed client's name and select a suggestion to fill their saved details; different saved addresses for the same receiver are shown separately, with the highest invoice number first
- Receivables statement: search a receiver by company name or GSTIN, record multiple payments with individual dates per invoice, view billed/GST/received/remaining totals, and print or export the statement in ascending invoice-number order
- Search saved invoices by client name, GSTIN or invoice number
- Unlimited invoice history, with Export / Import backup
- Installable as an app (PWA)

## Publish it (about 15 minutes)

### 1. Install
```
npm install
```

### 2. Create the accounts
1. **Clerk** (login): create an app at https://dashboard.clerk.com and copy the **Publishable key** from *API keys*.
2. Open https://dashboard.clerk.com/setup/supabase, press **Activate Supabase integration**, and copy the **Clerk domain**.
3. **Supabase** (database): create a project at https://supabase.com, then
   - *Authentication → Sign In / Providers → Third-party → Add provider → Clerk*, and paste the Clerk domain;
   - *SQL Editor → New query*, paste all of `supabase/schema.sql`, press **Run**;
   - *Project Settings → API*: copy the **Project URL** and the **Publishable key**.

### 3. Set the environment
Copy `.env.example` to `.env.local` and fill in the three values:
```
VITE_CLERK_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```
Try it locally with `npm run dev` (opens on http://localhost:3000).

### 4. Deploy to Vercel
Push the project to GitHub (or run `vercel`), import it in Vercel, and add the **same three variables** under
*Project → Settings → Environment Variables*. Deploy. To update your existing site, deploy into the **same Vercel project**.

### 5. First sign-in
Open the site **in the browser that holds your old invoices**, create your account, and press OK when the app offers to
upload the invoices found in that browser. After that, sign in on any device to see them.

## Notes
- Each account's data is private: the database only returns rows belonging to the signed-in user.
- Clerk "development" keys are for testing. For real use, switch the Clerk app to a production instance (it asks for a
  domain you own). If only you will use the app, restrict sign-ups in your Clerk settings.
- Without `VITE_CLERK_PUBLISHABLE_KEY` the app works in local-only mode, saving in the browser.
- Never commit `.env*` files or the Android keystore. `.gitignore` already excludes them.
- The Android (Bubblewrap) notes are in `android/`. Add your keystore's SHA-256 fingerprint to
  `public/.well-known/assetlinks.json` so the app opens without a browser bar.
