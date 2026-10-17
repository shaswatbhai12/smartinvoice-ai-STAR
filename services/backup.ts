import { InvoiceData, VendorProfile } from '../types';

export const BACKUP_APP_ID = 'smartinvoice-ai';
export const BACKUP_VERSION = 1;

export interface BackupData {
  profiles: VendorProfile[];
  history: InvoiceData[];
  activeProfileId: string | null;
}

export interface MergeResult extends BackupData {
  addedProfiles: number;
  addedInvoices: number;
  skippedInvoices: number;
}

// An invoice is "the same" when it belongs to the same vendor profile and has the same number.
export const invoiceKey = (inv: InvoiceData): string =>
  `${inv.vendorProfileId || ''}::${inv.invoiceNumber || ''}`;

export function createBackupJson(data: BackupData): string {
  return JSON.stringify(
    {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      activeProfileId: data.activeProfileId,
      profiles: data.profiles,
      history: data.history,
    },
    null,
    2
  );
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `smartinvoice-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// The browser-console backup (documented earlier) stores each list as a JSON *string*.
const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const isProfile = (p: any): p is VendorProfile =>
  p && typeof p === 'object' && typeof p.id === 'string' && p.id !== '' && typeof p.vendorName === 'string';

export const isInvoice = (i: any): i is InvoiceData =>
  i && typeof i === 'object' && Array.isArray(i.items) && typeof i.vendorName === 'string';

export function parseBackup(text: string): BackupData {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a SmartInvoice backup file.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('This file is not a SmartInvoice backup.');
  }
  if (raw.app && raw.app !== BACKUP_APP_ID) {
    throw new Error('This backup was made by a different app.');
  }
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) {
    throw new Error('This backup is from a newer version of the app. Update the app and try again.');
  }

  const profiles = asArray(raw.profiles).filter(isProfile);
  const history = asArray(raw.history).filter(isInvoice);

  if (profiles.length === 0 && history.length === 0) {
    throw new Error('No invoices or profiles were found in this file.');
  }

  const active = raw.activeProfileId ?? raw.active ?? null;
  return { profiles, history, activeProfileId: typeof active === 'string' ? active : null };
}

// Adds what is missing; never overwrites or removes anything already in the app.
export function mergeBackup(current: BackupData, incoming: BackupData): MergeResult {
  const profileMap = new Map(current.profiles.map(p => [p.id, p]));
  let addedProfiles = 0;
  for (const p of incoming.profiles) {
    const existing = profileMap.get(p.id);
    if (!existing) {
      profileMap.set(p.id, p);
      addedProfiles++;
    } else if ((p.lastInvoiceNumber ?? 0) > (existing.lastInvoiceNumber ?? 0)) {
      // keep the higher counter so invoice numbers are never reused
      profileMap.set(p.id, { ...existing, lastInvoiceNumber: p.lastInvoiceNumber });
    }
  }

  const seen = new Set(current.history.map(invoiceKey));
  const newInvoices: InvoiceData[] = [];
  let skippedInvoices = 0;
  for (const inv of incoming.history) {
    const key = invoiceKey(inv);
    if (seen.has(key)) {
      skippedInvoices++;
    } else {
      seen.add(key);
      newInvoices.push(inv);
    }
  }

  const profiles = Array.from(profileMap.values());
  const activeProfileId =
    current.activeProfileId && profileMap.has(current.activeProfileId)
      ? current.activeProfileId
      : incoming.activeProfileId && profileMap.has(incoming.activeProfileId)
        ? incoming.activeProfileId
        : profiles[0]?.id ?? null;

  return {
    profiles,
    history: [...current.history, ...newInvoices],
    activeProfileId,
    addedProfiles,
    addedInvoices: newInvoices.length,
    skippedInvoices,
  };
}
