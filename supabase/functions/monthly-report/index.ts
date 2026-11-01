import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

type InvoiceItem = { quantity?: number; unitPrice?: number };
type Receipt = { amount?: number; date?: string };
type Invoice = {
  vendorProfileId?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorEmail?: string;
  receiveMonthlyReports?: boolean;
  vendorPhone?: string;
  vendorGstin?: string;
  pan?: string;
  dealsIn?: string;
  invoiceNumber?: string;
  date?: string;
  clientName?: string;
  clientGstin?: string;
  items?: InvoiceItem[];
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  amountReceived?: number;
  receipts?: Receipt[];
  paymentStatusOverride?: string;
};
type VendorProfile = {
  id?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorGstin?: string;
  pan?: string;
  dealsIn?: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
const sender = Deno.env.get('MONTHLY_REPORT_FROM') || 'SmartInvoice <reports@send.starliftandcontroller.xyz>';
const cronSecret = Deno.env.get('MONTHLY_REPORT_CRON_SECRET');
const supabase = createClient(supabaseUrl, serviceRoleKey);

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const unsubscribeToken = async (userId: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serviceRoleKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return `${userId}.${Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

const unsubscribeUrl = async (userId: string) =>
  `${supabaseUrl}/functions/v1/transactional-email?action=unsubscribe&v=3&token=${encodeURIComponent(await unsubscribeToken(userId))}`;

const currency = (value: number) => `₹${value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const pdfCurrency = (value: number) => `INR ${value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const invoiceTotals = (invoice: Invoice, receiptEnd?: string) => {
  const subtotal = (invoice.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const cgst = subtotal * ((Number(invoice.cgstRate) || 0) / 100);
  const sgst = subtotal * ((Number(invoice.sgstRate) || 0) / 100);
  const igst = subtotal * ((Number(invoice.igstRate) || 0) / 100);
  const total = subtotal + cgst + sgst + igst;
  const receipts = (invoice.receipts || []).filter(receipt => !receiptEnd || (receipt.date || '') < receiptEnd);
  const received = receipts.length > 0
    ? receipts.reduce((sum, receipt) => sum + (Number(receipt.amount) || 0), 0)
    : Number(invoice.amountReceived) || 0;
  const remaining = total - received;
  const automaticStatus = remaining < 0 ? 'Overpaid' : remaining === 0 ? 'Paid' : received > 0 ? 'Partial' : 'Unpaid';
  return { subtotal, gst: cgst + sgst + igst, total, received, remaining, status: invoice.paymentStatusOverride || automaticStatus };
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}-${month}-${year}` : value;
};

const monthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const monthNumber = Number(month);
  const name = Number.isFinite(monthNumber)
    ? new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, monthNumber - 1, 1))).toUpperCase()
    : value;
  return `${name} ${year}`;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const pdf = async (
  title: string,
  headers: string[],
  rows: string[][],
  summary: string,
  headerLines: string[] = [],
  totalRow?: string[],
  columnWidths?: number[],
) => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.08, 0.21, 0.38);
  const lightBlue = rgb(0.91, 0.94, 0.97);
  const borderBlue = rgb(0.62, 0.7, 0.79);
  const white = rgb(1, 1, 1);
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  let page = document.addPage([pageWidth, pageHeight]);
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const widths = columnWidths && columnWidths.length === headers.length
    ? columnWidths
    : headers.map(() => 1 / headers.length);
  const columnWidthsInPoints = widths.map(width => contentWidth * width);
  let y = pageHeight - margin;
  const drawCell = (text: string, x: number, top: number, width: number, isHeader = false, alignRight = false, isTotal = false) => {
    const activeFont = isHeader || isTotal ? bold : font;
    const size = isHeader ? 8 : 7.5;
    const maxChars = Math.max(8, Math.floor((width - 8) / (size * 0.52)));
    const lines = String(text || '').split('\n').flatMap(part =>
      part.match(new RegExp(`.{1,${maxChars}}(?:\\s+|$)|.{1,${maxChars}}`, 'g')) || [''],
    );
    lines.slice(0, 3).forEach((line, index) => {
      const cleanLine = line.trim();
      const textWidth = activeFont.widthOfTextAtSize(cleanLine, size);
      page.drawText(cleanLine, {
        x: alignRight ? x + width - textWidth - 4 : x + 4,
        y: top - 12 - index * 9,
        size,
        font: activeFont,
        color: isHeader ? white : rgb(0.05, 0.08, 0.12),
      });
    });
    return Math.max(22, lines.slice(0, 3).length * 9 + 8);
  };
  const drawCentered = (text: string, size: number, activeFont = font, color = rgb(0.2, 0.25, 0.3)) => {
    const textWidth = activeFont.widthOfTextAtSize(text, size);
    page.drawText(text, { x: margin + (contentWidth - textWidth) / 2, y, size, font: activeFont, color });
    y -= size + 5;
  };
  if (headerLines.length > 0) {
    drawCentered(headerLines[0], 16, bold, navy);
    headerLines.slice(1).forEach(line => drawCentered(line, 8.5));
    drawCentered(title, 11, bold, navy);
  } else {
    drawCentered(title, 16, bold, navy);
  }
  page.drawText(summary, { x: margin, y, size: 8.5, font, color: rgb(0.2, 0.25, 0.3) });
  y -= 18;
  const rowHeight = (values: string[], isHeader = false) => {
    const size = isHeader ? 8 : 7.5;
    return Math.max(22, values.reduce((highest, value, index) => {
      const maxChars = Math.max(8, Math.floor((columnWidthsInPoints[index] - 8) / (size * 0.52)));
      const lines = String(value || '').match(new RegExp(`.{1,${maxChars}}(?:\\s+|$)|.{1,${maxChars}}`, 'g')) || [''];
      return Math.max(highest, Math.min(3, lines.length) * 9 + 8);
    }, 22));
  };
  const drawRow = (values: string[], isHeader = false, rowIndex = 0, isTotal = false) => {
    const height = rowHeight(values, isHeader);
    if (y - height < 30) {
      page = document.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      if (!isHeader) {
        drawRow(headers, true, 0);
      }
    }
    page.drawRectangle({
      x: margin,
      y: y - height,
      width: contentWidth,
      height,
      borderColor: borderBlue,
      borderWidth: 0.5,
      color: isHeader && !isTotal ? navy : isTotal ? lightBlue : rowIndex % 2 === 1 ? lightBlue : white,
    });
    let cellX = margin;
    values.forEach((value, index) => {
      drawCell(value, cellX, y, columnWidthsInPoints[index], isHeader && !isTotal, !isHeader && index >= headers.length - 3, isTotal);
      cellX += columnWidthsInPoints[index];
    });
    let dividerX = margin;
    for (let index = 1; index < headers.length; index++) {
      dividerX += columnWidthsInPoints[index - 1];
      page.drawLine({
        start: { x: dividerX, y },
        end: { x: dividerX, y: y - height },
        thickness: 0.5,
        color: borderBlue,
      });
    }
    y -= height;
  };
  drawRow(headers, true);
  rows.forEach((row, index) => drawRow(row, false, index));
  if (totalRow) drawRow(totalRow, false, 0, true);
  return toBase64(await document.save());
};

const previousMonth = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const currentYear = Number(parts.find(part => part.type === 'year')?.value);
  const currentMonth = Number(parts.find(part => part.type === 'month')?.value);
  const currentDay = Number(parts.find(part => part.type === 'day')?.value);
  const year = currentMonth === 1 ? currentYear - 1 : currentYear;
  const month = currentMonth === 1 ? 12 : currentMonth - 1;
  const reportMonth = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${reportMonth}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { reportMonth, start, end, currentDay };
};

const reportHtml = (reportMonth: string, invoices: Invoice[], profile: VendorProfile, unsubscribeLink: string) => {
  const summary = invoices.reduce((result, invoice) => {
    const totals = invoiceTotals(invoice);
    result.subtotal += totals.subtotal;
    result.gst += totals.gst;
    result.total += totals.total;
    result.received += totals.received;
    result.remaining += totals.remaining;
    return result;
  }, { subtotal: 0, gst: 0, total: 0, received: 0, remaining: 0 });
  const statusCounts = invoices.reduce<Record<string, number>>((counts, invoice) => {
    const status = invoiceTotals(invoice).status;
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const statusText = Object.entries(statusCounts)
    .map(([status, count]) => `${count} ${status}`)
    .join(' &nbsp;&middot;&nbsp; ') || 'No invoices';
  return `<div style="margin:0;background:#f2f5f9;padding:24px 8px;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:720px;margin:0 auto;background:#fff;border:1px solid #d9e2ec">
      <tr>
        <td style="padding:0">
          <div style="background:#153b6b;padding:18px 24px;color:#fff">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
              <tr>
                <td style="vertical-align:middle">
                  <div style="display:inline-block;background:#fff;color:#153b6b;font-weight:800;font-size:17px;letter-spacing:-.5px;padding:8px 10px;border-radius:4px">SI</div>
                  <span style="font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle">SmartInvoice AI</span>
                </td>
                <td style="text-align:right;font-size:11px;color:#dbeafe;vertical-align:middle">AUTOMATED REPORT</td>
              </tr>
            </table>
          </div>
          <div style="height:5px;background:#e6a23c"></div>
          <div style="padding:28px 30px 30px">
            <p style="margin:0 0 5px;color:#64748b;font-size:13px">MONTHLY INVOICE AND RECEIVABLES REPORT</p>
            <h1 style="margin:0;color:#153b6b;font-size:25px;line-height:1.25">Your ${escapeHtml(monthLabel(reportMonth))} report</h1>
            <p style="margin:20px 0 0;color:#1f2937;font-size:15px;line-height:1.65">
              Dear <strong>${escapeHtml(profile.vendorName || 'Valued customer')}</strong>,
            </p>
            <p style="margin:10px 0 0;color:#475569;font-size:14px;line-height:1.65">
              Your SmartInvoice AI monthly report for <strong>${escapeHtml(monthLabel(reportMonth))}</strong> is attached to this email.
              It provides a convenient summary of your billing activity, collections, and outstanding receivables for the month.
            </p>
            <p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:1.55">
              ${escapeHtml(profile.vendorAddress || '')}${profile.vendorPhone ? ` &nbsp;|&nbsp; Ph: ${escapeHtml(profile.vendorPhone)}` : ''}<br>
              ${profile.vendorGstin ? `GSTIN: ${escapeHtml(profile.vendorGstin)}` : ''}${profile.pan ? ` &nbsp;|&nbsp; PAN: ${escapeHtml(profile.pan)}` : ''}
            </p>
            <div style="margin:22px 0;background:#f5f8fc;border-left:4px solid #153b6b;padding:15px 16px">
              <strong style="color:#153b6b;font-size:15px">Report summary</strong>
              <p style="margin:7px 0 0;color:#475569;font-size:13px;line-height:1.6">
                The detailed invoice register and receivables statement are included as PDF attachments.
                Please retain them for your accounting and payment follow-up records.
              </p>
            </div>
            <table role="presentation" cellpadding="0" cellspacing="8" style="width:calc(100% + 16px);margin:0 -8px 18px;font-size:13px">
        <tr>
          <td style="background:#fff;border:1px solid #d5dfeb;padding:14px;border-radius:7px"><span style="color:#64748b">Invoices</span><br><strong style="font-size:20px;color:#153b6b">${invoices.length}</strong></td>
          <td style="background:#fff;border:1px solid #d5dfeb;padding:14px;border-radius:7px"><span style="color:#64748b">Taxable amount</span><br><strong style="font-size:17px;color:#153b6b">${currency(summary.subtotal)}</strong></td>
          <td style="background:#fff;border:1px solid #d5dfeb;padding:14px;border-radius:7px"><span style="color:#64748b">GST</span><br><strong style="font-size:17px;color:#153b6b">${currency(summary.gst)}</strong></td>
        </tr>
        <tr>
          <td style="background:#fff;border:1px solid #d5dfeb;padding:14px;border-radius:7px"><span style="color:#64748b">Billed total</span><br><strong style="font-size:17px;color:#153b6b">${currency(summary.total)}</strong></td>
          <td style="background:#eaf7ef;border:1px solid #b7dec4;padding:14px;border-radius:7px"><span style="color:#39704a">Received</span><br><strong style="font-size:17px;color:#246238">${currency(summary.received)}</strong></td>
          <td style="background:#fff5e8;border:1px solid #f0d2a3;padding:14px;border-radius:7px"><span style="color:#8a5a16">Remaining</span><br><strong style="font-size:17px;color:#8a5a16">${currency(summary.remaining)}</strong></td>
        </tr>
            </table>
            <div style="background:#fff;border-left:4px solid #2864a5;padding:12px 14px;margin:0 0 20px;color:#475569;font-size:13px">
              <strong style="color:#153b6b">Payment status overview</strong><br>
              ${statusText}
            </div>
            <div style="background:#fff;border:1px solid #d9e2ec;padding:16px 18px;margin:0 0 20px">
              <strong style="color:#153b6b;font-size:15px">Attachments</strong>
              <p style="margin:9px 0 0;color:#475569;font-size:13px;line-height:1.65">
                <strong>${escapeHtml(reportMonth)}_Invoices_Summary.pdf</strong><br>
                Sales register containing invoice numbers, dates, receiver details, GSTIN, taxable amount, GST, grand total, and totals.<br><br>
                <strong>${escapeHtml(reportMonth)}_Receivables_Statement.pdf</strong><br>
                Receivables statement containing billed totals, receipts, dated payment lines, balances, and payment status.
              </p>
            </div>
            <div style="background:#fff8e8;border:1px solid #f0d7a1;padding:13px 15px;margin-bottom:22px;color:#72551c;font-size:12px;line-height:1.55">
              <strong>Please note:</strong> This is an automated message. The attached PDFs contain the complete invoice-level details.
              Please do not reply to this email.
            </div>
            <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">
              Thank you for using SmartInvoice AI. We hope these reports make your monthly accounting and receivables follow-up easier.
            </p>
            <p style="margin:18px 0 0;color:#475569;font-size:13px;line-height:1.5">
              Warm regards,<br>
              <strong style="color:#153b6b">SmartInvoice AI</strong><br>
              ${escapeHtml(profile.vendorEmail || '')}
            </p>
            <p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.5">
              You received this report because monthly SmartInvoice emails are enabled for your account.
              <a href="${unsubscribeLink}" style="color:#153b6b;font-weight:600">Unsubscribe from all SmartInvoice emails</a>.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#153b6b;padding:14px 24px;text-align:center;color:#dbeafe;font-size:11px">
          ${escapeHtml(profile.vendorName || 'SmartInvoice AI')} &nbsp;|&nbsp; Powered by SmartInvoice AI
        </td>
      </tr>
    </table>
  </div>`;
};

const isTestRequest = (request: Request) => request.headers.get('x-monthly-report-test') === 'true';

Deno.serve(async request => {
  try {
  if (cronSecret && request.headers.get('x-monthly-report-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const isTest = request.headers.get('x-monthly-report-test') === 'true';
  const { data: settings, error: settingsError } = await supabase
    .from('monthly_report_settings')
    .select('user_id, recipient_email, timezone')
    .eq('enabled', true);
  if (settingsError) return Response.json({ error: settingsError.message }, { status: 500 });

  const results: Array<{ userId: string; reportMonth: string; sent: boolean }> = [];
  for (const setting of settings || []) {
    const { reportMonth, start, end, currentDay } = previousMonth(setting.timezone || 'Asia/Kolkata');
    if (!isTest && currentDay !== 1) continue;
    if (isTest) {
      const { data: alreadyTested } = await supabase
        .from('monthly_report_test_runs')
        .select('user_id')
        .eq('user_id', setting.user_id)
        .maybeSingle();
      if (alreadyTested) continue;
    }
    const { data: alreadySent } = await supabase
      .from('monthly_report_runs')
      .select('user_id')
      .eq('user_id', setting.user_id)
      .eq('report_month', reportMonth)
      .maybeSingle();
    if (alreadySent) continue;

    const { data: rows, error: invoiceError } = await supabase
      .from('invoices')
      .select('data')
      .eq('user_id', setting.user_id)
      .gte('invoice_date', start)
      .lt('invoice_date', end)
      .order('invoice_date', { ascending: true });
    if (invoiceError) throw new Error(invoiceError.message);
    const invoices = (rows || [])
      .map(row => row.data as Invoice)
      .sort((left, right) => {
        const leftNumber = Number(left.invoiceNumber);
        const rightNumber = Number(right.invoiceNumber);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left.invoiceNumber || '').localeCompare(String(right.invoiceNumber || ''), undefined, { numeric: true });
      });
    const { data: profileRows, error: profileError } = await supabase
      .from('vendor_profiles')
      .select('data')
      .eq('user_id', setting.user_id);
    if (profileError) throw new Error(profileError.message);
    const profiles = (profileRows || []).map(row => row.data as VendorProfile);
    const { data: emailPreference, error: preferenceError } = await supabase
      .from('email_preferences')
      .select('unsubscribed')
      .eq('user_id', setting.user_id)
      .maybeSingle();
    if (preferenceError) throw new Error(preferenceError.message);
    if (emailPreference?.unsubscribed) continue;
    const firstInvoice = invoices[0];
    const profile = profiles.find(candidate =>
      candidate.id === firstInvoice?.vendorProfileId
      || (candidate.vendorGstin && candidate.vendorGstin === firstInvoice?.vendorGstin)
      || (candidate.vendorName && candidate.vendorName === firstInvoice?.vendorName)
    ) || profiles[0] || firstInvoice;
    const reportHeader = [
      profile?.vendorName || 'SmartInvoice',
      `GSTIN: ${profile?.vendorGstin || '-'} | PAN: ${profile?.pan || '-'}`,
      `Address: ${profile?.vendorAddress || '-'} | Ph: ${profile?.vendorPhone || '-'}`,
      `Email: ${profile?.vendorEmail || '-'} | Deals in: ${profile?.dealsIn || '-'}`,
    ];
    const recipientEmails = Array.from(new Set(
      profiles
        .filter(candidate => candidate.receiveMonthlyReports !== false)
        .map(candidate => candidate.vendorEmail?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ));
    if (recipientEmails.length === 0) {
      throw new Error(`No vendor profile email found for user ${setting.user_id}`);
    }
    const invoiceRows = invoices.map(invoice => {
      const totals = invoiceTotals(invoice);
      return [
        String(invoices.indexOf(invoice) + 1),
        invoice.invoiceNumber || '',
        formatDate(invoice.date || ''),
        invoice.clientName || '',
        invoice.clientGstin || '',
        pdfCurrency(totals.subtotal),
        pdfCurrency(totals.gst),
        pdfCurrency(totals.total),
      ];
    });
    const receivableRows = invoices.map(invoice => {
      const totals = invoiceTotals(invoice);
      const receiptLines = (invoice.receipts || [])
        .filter(receipt => Number(receipt.amount) > 0)
        .map(receipt => `${formatDate(receipt.date || '')}: ${pdfCurrency(Number(receipt.amount) || 0)}`)
        .join('\n');
      return [
        `#${invoice.invoiceNumber || ''}`,
        formatDate(invoice.date || ''),
        [invoice.clientName || '', invoice.clientGstin || ''].filter(Boolean).join('\n'),
        pdfCurrency(totals.subtotal),
        pdfCurrency(totals.gst),
        pdfCurrency(totals.total),
        [`Total: ${pdfCurrency(totals.received)}`, receiptLines].filter(Boolean).join('\n'),
        pdfCurrency(totals.remaining),
        totals.status,
      ];
    });
    const summaryTotals = invoices.reduce((result, invoice) => {
      const totals = invoiceTotals(invoice);
      result.subtotal += totals.subtotal;
      result.gst += totals.gst;
      result.total += totals.total;
      result.received += totals.received;
      result.remaining += totals.remaining;
      return result;
    }, { subtotal: 0, gst: 0, total: 0, received: 0, remaining: 0 });
    const invoiceSummaryPdf = await pdf(
      `SALES REGISTER / GST OUTWARD SUPPLIES SUMMARY — ${monthLabel(reportMonth)}`,
      ['S.No.', 'Bill No.', 'Date', 'Client Name', 'GSTIN of Client', 'Total Amount (Taxable)', 'GST Amount', 'Amount with GST (Grand Total)'],
      invoiceRows,
      `Total invoices: ${invoices.length} | Taxable total: ${pdfCurrency(summaryTotals.subtotal)} | GST: ${pdfCurrency(summaryTotals.gst)} | Grand total: ${pdfCurrency(summaryTotals.total)}`,
      [
        ...reportHeader,
      ],
      ['TOTAL', '', '', '', '', pdfCurrency(summaryTotals.subtotal), pdfCurrency(summaryTotals.gst), pdfCurrency(summaryTotals.total)],
      [0.05, 0.08, 0.09, 0.23, 0.16, 0.13, 0.11, 0.15],
    );
    const receivablesPdf = await pdf(
      `RECEIVABLES STATEMENT - ${monthLabel(reportMonth)}`,
      ['INVOICE', 'DATE', 'RECEIVER', 'SUBTOTAL', 'GST', 'TOTAL', 'RECEIVED', 'REMAINING', 'STATUS'],
      receivableRows,
      `All receivers ${invoices.length} invoices | Subtotal ${pdfCurrency(summaryTotals.subtotal)} | GST ${pdfCurrency(summaryTotals.gst)} | Billed total ${pdfCurrency(summaryTotals.total)} | Received ${pdfCurrency(summaryTotals.received)} | Remaining ${pdfCurrency(summaryTotals.remaining)}`,
      [
        ...reportHeader,
      ],
      undefined,
      [0.07, 0.09, 0.20, 0.09, 0.09, 0.10, 0.16, 0.10, 0.10],
    );
    const unsubscribeLink = await unsubscribeUrl(setting.user_id);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: recipientEmails,
        subject: `${isTest ? '[TEST] ' : ''}SmartInvoice AI - ${reportMonth} invoice and receivables report`,
        headers: {
          'List-Unsubscribe': `<${unsubscribeLink}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: reportHtml(reportMonth, invoices, profile, unsubscribeLink),
        attachments: [
          { filename: `${reportMonth}_Invoices_Summary.pdf`, content: invoiceSummaryPdf },
          { filename: `${reportMonth}_Receivables_Statement.pdf`, content: receivablesPdf },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Email delivery failed: ${await response.text()}`);
    const { error: runError } = isTest
      ? await supabase.from('monthly_report_test_runs').insert({
          user_id: setting.user_id,
          recipient_email: recipientEmails.join(', '),
        })
      : await supabase.from('monthly_report_runs').insert({
          user_id: setting.user_id,
          report_month: reportMonth,
          recipient_email: recipientEmails.join(', '),
        });
    if (runError) throw new Error(runError.message);
    results.push({ userId: setting.user_id, reportMonth, sent: true });
  }
    return Response.json({ results });
  } catch (error) {
    console.error('Monthly report failed:', error);
    return Response.json(
      { error: isTestRequest(request) ? String(error instanceof Error ? error.message : error) : 'Monthly report failed' },
      { status: 500 },
    );
  }
});
