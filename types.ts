
export interface InvoiceItem {
  id: string;
  description: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
}

export interface InvoiceReceipt {
  id: string;
  amount: number;
  date: string;
}

export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Overpaid';

export interface InvoiceData {
  vendorProfileId?: string;
  isGstRegistered: boolean;
  invoiceNumber: string;
  date: string;
  transportMode: string;
  grrrpr: string;
  
  // Vendor Info
  vendorName: string;
  vendorAddress: string;
  vendorEmail: string;
  vendorPhone: string;
  vendorGstin: string;
  dealsIn: string;
  
  // Client Info
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientGstin: string;
  clientState: string;
  clientStateCode: string;
  
  // Items
  items: InvoiceItem[];
  
  // Financial Details
  pan: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  
  // Taxes
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  
  notes: string;
  currency: string;
  amountReceived?: number;
  receipts?: InvoiceReceipt[];
  paymentStatusOverride?: PaymentStatus;
}

export interface VendorProfile {
  id: string;
  isGstRegistered: boolean;
  vendorName: string;
  vendorAddress: string;
  vendorEmail: string;
  vendorPhone: string;
  vendorGstin: string;
  pan: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  dealsIn: string;
  lastInvoiceNumber: number;
}

export interface AppState {
  history: InvoiceData[];
  currentInvoice: InvoiceData;
  isProcessing: boolean;
  error: string | null;
}

export const EMPTY_INVOICE: InvoiceData = {
  isGstRegistered: true,
  invoiceNumber: '',
  date: new Date().toISOString().split('T')[0],
  vendorName: '',
  vendorAddress: '',
  vendorEmail: '',
  vendorPhone: '',
  vendorGstin: '',
  dealsIn: '',
  clientName: '',
  clientAddress: '',
  clientEmail: '',
  clientGstin: '',
  clientState: '',
  clientStateCode: '',
  transportMode: '',
  grrrpr: '',
  items: [
    { id: '1', description: '', hsnCode: '', quantity: 1, unit: '', unitPrice: 0 }
  ],
  pan: '',
  bankName: '',
  bankAccount: '',
  bankIfsc: '',
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 0,
  notes: 'Goods once sold will not take back.',
  currency: 'INR',
  amountReceived: 0,
  receipts: []
};
