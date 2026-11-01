import React from 'react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const EmailPreferences: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  const token = params.get('token');
  const actionUrl = supabaseUrl && token
    ? `${supabaseUrl}/functions/v1/transactional-email?action=subscribe&v=4&token=${encodeURIComponent(token)}`
    : null;

  const content = state === 'unsubscribed'
    ? {
        title: 'You are unsubscribed',
        message: 'SmartInvoice emails have been stopped for this account.',
        action: actionUrl,
        label: 'Subscribe again',
      }
    : state === 'subscribed'
      ? {
          title: 'You are subscribed again',
          message: 'SmartInvoice emails have been enabled for this account.',
          action: null,
          label: '',
        }
      : state === 'invalid'
        ? {
            title: 'Invalid link',
            message: 'This email preference link is invalid or has expired.',
            action: null,
            label: '',
          }
        : {
            title: 'Something went wrong',
            message: 'We could not update your email preference. Please try again later.',
            action: null,
            label: '',
          };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12 font-sans text-slate-800">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-[#153b6b] px-7 py-6 text-xl font-bold text-white">SmartInvoice AI</header>
        <div className="h-1.5 bg-[#e6a23c]" />
        <div className="p-8">
          <h1 className="text-2xl font-bold text-[#153b6b]">{content.title}</h1>
          <p className="mt-4 text-[15px] leading-7">{content.message}</p>
          {content.action && (
            <a
              href={content.action}
              className="mt-6 inline-block rounded-md bg-[#153b6b] px-4 py-3 font-bold text-white no-underline"
            >
              {content.label}
            </a>
          )}
        </div>
      </section>
    </main>
  );
};

export default EmailPreferences;
