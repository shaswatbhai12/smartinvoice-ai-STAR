# SmartInvoice AI

GST invoice generator with login (Clerk) and a cloud database (Supabase), so your invoices are available on every device.

- Vendor profiles, GST invoices (CGST+SGST or IGST chosen from the client GSTIN), non-GST invoices, print / PDF
- Receiver autocomplete: type part of a previously billed client's name and select a suggestion to fill their saved details; different saved addresses for the same receiver are shown separately, with the highest invoice number first
- Receivables statement: search a receiver by company name or GSTIN, record multiple payments with individual dates per invoice, view billed/GST/received/remaining totals, and print or export the statement in ascending invoice-number order
- Search saved invoices by client name, GSTIN or invoice number
- Unlimited invoice history, with Export / Import backup
- Installable as an app (PWA)
- Optional scheduled monthly email: the previous month's invoice list and receivables statement

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

## Monthly invoice and receivables email

The scheduled report is implemented in `supabase/functions/monthly-report`. It sends an
HTML report plus two A4 landscape PDF attachments on the first day of each month using the
previous month's invoices:

- `<YYYY-MM>_Invoices_Summary.pdf`
- `<YYYY-MM>_Receivables_Statement.pdf`

The second PDF covers invoices dated from day 1 through the last day of the previous month.
It includes billed total, receipts, remaining balance, payment status, and receipt values
as of that month's end. Receipt amounts are read from each invoice's saved `receipts` list.
The PDFs are currently sent without password protection so they can be opened reliably in common
mail and PDF applications. Password protection can be added later if a secure password-sharing
process is chosen.

Transactional welcome and company-profile emails are handled by
`supabase/functions/transactional-email`. Run the updated `supabase/schema.sql` once in the
Supabase SQL Editor to create `email_preferences`, then deploy both functions. The app sends the
welcome message on the first authenticated session for a new browser/account and sends a
company-added confirmation to the login email plus the vendor-profile email (deduplicated).
Each message includes a signed unsubscribe link. Unsubscribing stops all SmartInvoice emails for
that account, including monthly reports. The current implementation does not require the user to
share any password or API key with the app.

To enable it:

1. Deploy the function with the Supabase CLI:
   ```
   supabase functions deploy monthly-report
   ```
2. Set these Supabase Function secrets. Do not put them in `.env.local` or the frontend:
   ```
   supabase secrets set RESEND_API_KEY=... MONTHLY_REPORT_FROM="SmartInvoice <reports@send.starliftandcontroller.xyz>" MONTHLY_REPORT_CRON_SECRET=...
   ```
   `reports@send.starliftandcontroller.xyz` must be a sender verified in Resend. The function already receives
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase.
3. In Supabase SQL Editor, add one settings row for the signed-in Clerk user. Replace
   `user_xxx` with the user's Clerk subject/user ID. The report recipient is taken from
   every non-empty `vendorEmail` in that user's vendor profiles; the placeholder below is
   retained only because the settings table requires a value:
   ```
   insert into public.monthly_report_settings (user_id, recipient_email, timezone)
   values ('user_xxx', 'placeholder@example.com', 'Asia/Kolkata')
   on conflict (user_id) do update
     set recipient_email = excluded.recipient_email,
         timezone = excluded.timezone,
         enabled = true,
         updated_at = now();
   ```
4. Schedule the function to run daily at 00:05 India time. The function itself sends only
   when the local date is the 1st, and Supabase cron uses UTC, so 00:05 IST is 18:35 UTC
   on the previous day:
   ```
   select cron.schedule(
     'smartinvoice-monthly-report',
     '35 18 * * *',
     $$
     select net.http_post(
       url := current_setting('app.settings.supabase_url') || '/functions/v1/monthly-report',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-monthly-report-secret', current_setting('app.settings.monthly_report_cron_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   Configure the two `app.settings.*` values using your Supabase project's preferred
   secrets mechanism. The function's month-level run log prevents duplicate emails if
   the schedule runs more than once.

To send one immediate test email before the 1st of the month, use the same cron secret and
add this header to the request:

```text
x-monthly-report-test: true
```

The test uses the previous month's invoices, adds `[TEST]` to the subject, and records a
one-time test run for the user. Repeating the test request will not send another email.

## Notes
- Each account's data is private: the database only returns rows belonging to the signed-in user.
- Clerk "development" keys are for testing. For real use, switch the Clerk app to a production instance (it asks for a
  domain you own). If only you will use the app, restrict sign-ups in your Clerk settings.
- Without `VITE_CLERK_PUBLISHABLE_KEY` the app works in local-only mode, saving in the browser.
- Never commit `.env*` files or the Android keystore. `.gitignore` already excludes them.
- The Android (Bubblewrap) notes are in `android/`. Add your keystore's SHA-256 fingerprint to
  `public/.well-known/assetlinks.json` so the app opens without a browser bar.
