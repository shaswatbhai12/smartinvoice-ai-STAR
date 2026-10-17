import { InvoiceData } from '../types';

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

// Matches client name, client GSTIN or invoice number. Case and spacing are ignored.
export function matchesInvoiceSearch(inv: InvoiceData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const compact = squash(q);
  const name = (inv.clientName || '').toLowerCase();
  const gstin = squash(inv.clientGstin || '');
  const number = squash(String(inv.invoiceNumber ?? ''));
  return (
    name.includes(q) ||
    squash(name).includes(compact) ||
    gstin.includes(compact) ||
    number.includes(compact)
  );
}

export const filterInvoices = (invoices: InvoiceData[], query: string): InvoiceData[] =>
  invoices.filter(inv => matchesInvoiceSearch(inv, query));
