import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import PDFDocument from 'https://esm.sh/pdfkit@0.15.0?target=deno';

type InvoiceItem = { quantity?: number; unitPrice?: number };
type Receipt = { amount?: number; date?: string };
type Invoice = {
  vendorProfileId?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorEmail?: string;
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

const normalizePasswordPart = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const reportPassword = (profile: VendorProfile) => {
  const company = normalizePasswordPart(profile.vendorName || 'SMARTINVOICE').slice(0, 4).padEnd(4, 'X');
  const pan = normalizePasswordPart(profile.pan || 'NOPAN').slice(0, 5).padEnd(5, 'X');
  return `${company}${pan}`;
};

const pdf = async (
  title: string,
  headers: string[],
  rows: string[][],
  summary: string,
  headerLines: string[] = [],
  totalRow?: string[],
  columnWidths?: number[],
  password?: string,
) => {
  const chunks: Uint8Array[] = [];
  const document = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });
  document.on('data', (chunk: Uint8Array) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    document.on('end', resolve);
    document.on('error', reject);
  });
  const navy = '#153b6b';
  const lightBlue = '#e8eff7';
  const borderBlue = '#9eafc9';
  const white = '#ffffff';
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const widths = columnWidths && columnWidths.length === headers.length
    ? columnWidths
    : headers.map(() => 1 / headers.length);
  const columnWidthsInPoints = widths.map(width => contentWidth * width);
  let y = pageHeight - margin;
  let page = document;
  const drawCell = (text: string, x: number, top: number, width: number, height: number, isHeader = false, alignRight = false, isTotal = false) => {
    const value = String(text || '');
    document.font(isHeader || isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 8 : 7.5);
    document.fillColor(isHeader ? white : '#0d141f');
    document.text(value, x + 4, top + 5, {
      width: width - 8,
      height: height - 8,
      align: alignRight ? 'right' : 'left',
      lineGap: 0,
      ellipsis: true,
    });
  };
  const drawCentered = (text: string, size: number, bold = false, color = '#334155') => {
    document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
    document.text(text, margin, y, { width: contentWidth, align: 'center' });
    y -= size + 5;
  };
  if (headerLines.length > 0) {
    drawCentered(headerLines[0], 16, true, navy);
    headerLines.slice(1).forEach(line => drawCentered(line, 8.5));
    drawCentered(title, 11, true, navy);
  } else {
    drawCentered(title, 16, true, navy);
  }
  document.font('Helvetica').fontSize(8.5).fillColor('#334155').text(summary, margin, y, { width: contentWidth });
  y -= 18;
  const rowHeight = (values: string[], isHeader = false) => {
    document.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 8 : 7.5);
    return Math.max(22, values.reduce((highest, value, index) => Math.max(
      highest,
      Math.min(3, Math.ceil(document.heightOfString(String(value || ''), { width: columnWidthsInPoints[index] - 8 }) / 9)) * 9 + 8,
    ), 22));
  };
  const drawRow = (values: string[], isHeader = false, rowIndex = 0, isTotal = false) => {
    const height = rowHeight(values, isHeader);
    if (y - height < 30) {
      document.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
      y = pageHeight - margin;
      if (!isHeader) {
        drawRow(headers, true, 0);
      }
    }
    document.rect(margin, y - height, contentWidth, height)
      .fillAndStroke(isHeader && !isTotal ? navy : isTotal ? lightBlue : rowIndex % 2 === 1 ? lightBlue : white, borderBlue);
    let cellX = margin;
    values.forEach((value, index) => {
      drawCell(value, cellX, y - height, columnWidthsInPoints[index], height, isHeader && !isTotal, !isHeader && index >= headers.length - 3, isTotal);
      cellX += columnWidthsInPoints[index];
    });
    let dividerX = margin;
    for (let index = 1; index < headers.length; index++) {
      dividerX += columnWidthsInPoints[index - 1];
      document.moveTo(dividerX, y).lineTo(dividerX, y - height).lineWidth(0.5).stroke(borderBlue);
    }
    y -= height;
  };
  drawRow(headers, true);
  rows.forEach((row, index) => drawRow(row, false, index));
  if (totalRow) drawRow(totalRow, false, 0, true);
  document.end();
  await finished;
  return toBase64(new Uint8Array(chunks.reduce((all, chunk) => {
    const combined = new Uint8Array(all.length + chunk.length);
    combined.set(all);
    combined.set(chunk, all.length);
    return combined;
  }, new Uint8Array())));
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

const reportHtml = (reportMonth: string, invoices: Invoice[], profile: VendorProfile) => {
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
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;max-width:900px">
    <div style="text-align:center;background:#153b6b;color:#fff;padding:22px 18px;border-radius:10px 10px 0 0">
      <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#dbeafe;margin-bottom:8px">SMARTINVOICE AI</div>
      <h1 style="margin:0;color:#fff;font-size:24px">${escapeHtml(profile.vendorName || 'SmartInvoice')}</h1>
      <div style="font-size:13px;font-weight:700;color:#fff">GSTIN: ${escapeHtml(profile.vendorGstin || '-')} &nbsp;|&nbsp; PAN: ${escapeHtml(profile.pan || '-')}</div>
      <div style="font-size:13px;color:#fff">${escapeHtml(profile.vendorAddress || '-')} &nbsp;|&nbsp; Ph: ${escapeHtml(profile.vendorPhone || '-')}</div>
      <div style="font-size:13px;color:#fff">${escapeHtml(profile.vendorEmail || '-')} &nbsp;|&nbsp; Deals in: ${escapeHtml(profile.dealsIn || '-')}</div>
    </div>
    <div style="padding:24px 20px;background:#f7faff;border:1px solid #d5dfeb;border-top:0;border-radius:0 0 10px 10px">
      <p style="margin:0;color:#64748b;font-size:13px">MONTHLY BUSINESS REPORT</p>
      <h2 style="margin:5px 0 8px;color:#153b6b;font-size:22px">Sales and receivables summary</h2>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.55">
        This report covers invoices billed during <strong>${escapeHtml(monthLabel(reportMonth))}</strong>.
        The detailed invoice register and receivables statement are attached as PDF documents for your records.
      </p>
      <table style="border-collapse:separate;border-spacing:8px;width:calc(100% + 16px);margin:0 -8px 18px;font-size:13px">
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
      <div style="background:#fff;border-left:4px solid #2864a5;padding:12px 14px;margin:0 0 18px;color:#475569;font-size:13px">
        <strong style="color:#153b6b">Payment status overview</strong><br>
        ${statusText}
      </div>
      <h3 style="margin:0 0 8px;color:#153b6b;font-size:16px">Your attachments</h3>
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.6">
        <strong>${escapeHtml(reportMonth)}_Invoices_Summary.pdf</strong><br>
        Sales register with company header, invoice numbers, dates, receiver details, GSTIN, taxable amount, GST, grand total, and final totals.<br><br>
        <strong>${escapeHtml(reportMonth)}_Receivables_Statement.pdf</strong><br>
        Receivables statement with invoice totals, received payments, dated receipt lines, remaining balances, and payment status.
      </p>
      <p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:1.5">
        Please keep these documents for your monthly accounting records. This is an automated SmartInvoice AI message; the attached PDFs contain the complete invoice-level details.
      </p>
      <div style="margin-top:16px;background:#eef4fb;border:1px solid #c9d8ea;border-radius:7px;padding:12px 14px;color:#475569;font-size:12px;line-height:1.5">
        <strong style="color:#153b6b">PDF security</strong><br>
        Both PDF attachments are password protected. The password is not included in this email.
        Hint: use the first four letters of the registered company name followed by the first five characters of the PAN.
      </div>
    </div>
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
      reportPassword(profile),
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
      reportPassword(profile),
    );
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: recipientEmails,
        subject: `${isTest ? '[TEST] ' : ''}SmartInvoice AI - ${reportMonth} invoice and receivables report`,
        html: reportHtml(reportMonth, invoices, profile),
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
