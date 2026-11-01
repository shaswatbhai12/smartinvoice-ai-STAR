import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Profile = { vendorName?: string; vendorEmail?: string };
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
const sender = Deno.env.get('MONTHLY_REPORT_FROM') || 'SmartInvoice <reports@send.starliftandcontroller.xyz>';
const appUrl = Deno.env.get('SMARTINVOICE_APP_URL') || 'https://invoice.starliftandcontroller.xyz';
const supabase = createClient(supabaseUrl, serviceRoleKey);
const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const tokenFor = async (userId: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceRoleKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return `${userId}.${Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
};
const preferenceUrl = async (userId: string) => `${supabaseUrl}/functions/v1/transactional-email?action=unsubscribe&v=4&token=${encodeURIComponent(await tokenFor(userId))}`;
const subscribeUrl = async (userId: string) => `${supabaseUrl}/functions/v1/transactional-email?action=subscribe&v=4&token=${encodeURIComponent(await tokenFor(userId))}`;
const preferencePage = (title: string, message: string, actionUrl?: string, actionLabel?: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)} - SmartInvoice AI</title>
  </head>
  <body style="margin:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
    <main style="max-width:640px;margin:48px auto;padding:0 16px">
      <section style="background:#fff;border:1px solid #d9e2ec;border-radius:10px;overflow:hidden">
        <header style="background:#153b6b;color:#fff;padding:22px 26px;font-size:21px;font-weight:700">SmartInvoice AI</header>
        <div style="height:5px;background:#e6a23c"></div>
        <div style="padding:30px">
          <h1 style="margin:0;color:#153b6b;font-size:24px">${escape(title)}</h1>
          <p style="font-size:15px;line-height:1.7">${escape(message)}</p>
          ${actionUrl && actionLabel ? `<p style="margin-top:24px"><a href="${actionUrl}" style="display:inline-block;background:#153b6b;color:#fff;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700">${escape(actionLabel)}</a></p>` : ''}
        </div>
      </section>
    </main>
  </body>
</html>`;
const htmlResponse = (html: string, status = 200) => new Response(html, {
  status,
  headers: {
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Disposition': 'inline',
    'cache-control': 'no-store, max-age=0',
    'x-content-type-options': 'nosniff',
  },
});
const preferenceRedirect = (state: 'unsubscribed' | 'subscribed' | 'invalid' | 'error', token: string) => {
  const redirectUrl = new URL('/email-preferences', appUrl);
  redirectUrl.searchParams.set('state', state);
  if (token) redirectUrl.searchParams.set('token', token);
  return Response.redirect(redirectUrl.toString(), 303);
};

const send = async (to: string[], subject: string, title: string, body: string, unsubscribe: string) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender, to, subject,
      headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      html: `<div style="font-family:Arial,sans-serif;background:#f2f5f9;padding:24px;color:#1f2937"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #d9e2ec"><div style="background:#153b6b;color:#fff;padding:22px 26px;font-size:21px;font-weight:bold">SmartInvoice AI</div><div style="height:5px;background:#e6a23c"></div><div style="padding:28px"><h1 style="color:#153b6b;font-size:24px">${escape(title)}</h1><p style="font-size:15px;line-height:1.7">${body}</p><p style="margin-top:28px;font-size:12px;color:#64748b">You received this message because you use SmartInvoice AI. <a href="${unsubscribe}" style="color:#153b6b">Unsubscribe from SmartInvoice emails</a>.</p></div></div></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Email delivery failed: ${await response.text()}`);
};

Deno.serve(async request => {
  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'unsubscribe' || url.searchParams.get('action') === 'subscribe') {
    const action = url.searchParams.get('action');
    const token = url.searchParams.get('token') || '';
    const separator = token.indexOf('.');
    const userId = separator > 0 ? token.slice(0, separator) : '';
    const expected = userId ? await tokenFor(userId) : '';
    if (!userId || token !== expected) {
      return preferenceRedirect('invalid', '');
    }
    const { data: existing, error: existingError } = await supabase
      .from('email_preferences')
      .select('email')
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) {
      console.error('Email preference lookup failed:', existingError.message);
    }
    const { error } = await supabase.from('email_preferences').upsert({
      user_id: userId,
      email: existing?.email || '',
      unsubscribed: action === 'unsubscribe',
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error('Email preference update failed:', error.message);
      return preferenceRedirect('error', '');
    }
    if (action === 'subscribe') {
      return preferenceRedirect('subscribed', '');
    }
    return preferenceRedirect('unsubscribed', token);
  }
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '');
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await request.json() as { type?: 'welcome' | 'company'; profile?: Profile };
  const loginEmail = user.email || user.user_metadata?.email;
  if (!loginEmail) return Response.json({ error: 'No verified login email available' }, { status: 400 });
  const { data: preference } = await supabase.from('email_preferences').select('unsubscribed').eq('user_id', user.id).maybeSingle();
  if (preference?.unsubscribed) return Response.json({ sent: false, reason: 'unsubscribed' });
  await supabase.from('email_preferences').upsert({ user_id: user.id, email: loginEmail, unsubscribed: false, updated_at: new Date().toISOString() });
  const profile = payload.profile || {};
  const vendorEmail = profile.vendorEmail?.trim().toLowerCase();
  const recipients = Array.from(new Set([loginEmail.toLowerCase(), ...(payload.type === 'company' && vendorEmail ? [vendorEmail] : [])]));
  const unsubscribe = await preferenceUrl(user.id);
  if (payload.type === 'company') {
    await send(recipients, `SmartInvoice AI - ${profile.vendorName || 'Company'} added successfully`, 'Company added successfully', `Your company profile <strong>${escape(profile.vendorName || 'Company')}</strong> was successfully added to SmartInvoice AI. You can now create invoices and manage receivables for this profile.`, unsubscribe);
  } else {
    await send([loginEmail], 'Welcome to SmartInvoice AI', 'Thank you for registering', 'Thank you for registering with SmartInvoice AI. Your account is ready to help you create invoices, track payments, and manage receivables.', unsubscribe);
  }
  return Response.json({ sent: true, recipients });
});
