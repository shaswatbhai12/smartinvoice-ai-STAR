import { InvoiceData, VendorProfile } from '../types';
import { BackupData, invoiceKey, isInvoice, isProfile } from './backup';

export type SyncStatus = 'idle' | 'saving' | 'error';

// The small slice of the Supabase client this file uses (keeps it testable without the SDK).
export interface SupabaseLike {
  from(table: string): any;
}

const PROFILES_TABLE = 'vendor_profiles';
const INVOICES_TABLE = 'invoices';
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

// ---------- helpers ----------

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort()
      .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}

// Keeps the first item for each key (lists are newest-first, so the newest wins).
export function dedupeByKey<T>(list: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const key = keyOf(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// Which items must be written, and which were removed, to turn `prev` into `next`.
export function diffByKey<T>(prev: T[], next: T[], keyOf: (item: T) => string) {
  const prevJson = new Map(prev.map(p => [keyOf(p), stableStringify(p)] as const));
  const nextKeys = new Set(next.map(keyOf));
  const upserts = next.filter(n => prevJson.get(keyOf(n)) !== stableStringify(n));
  const removed = prev.filter(p => !nextKeys.has(keyOf(p)));
  return { upserts, removed };
}

export const invoiceToRow = (userId: string, inv: InvoiceData) => ({
  user_id: userId,
  profile_id: inv.vendorProfileId || '',
  invoice_number: String(inv.invoiceNumber ?? ''),
  invoice_date: inv.date || '',
  client_name: inv.clientName || '',
  client_gstin: inv.clientGstin || '',
  data: inv,
  updated_at: new Date().toISOString(),
});

export const profileToRow = (userId: string, p: VendorProfile) => ({
  user_id: userId,
  id: p.id,
  data: p,
  updated_at: new Date().toISOString(),
});

// ---------- reading ----------

async function fetchAll<T>(
  client: SupabaseLike,
  table: string,
  order: Array<{ column: string; ascending: boolean }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select('data');
    for (const o of order) query = query.order(o.column, { ascending: o.ascending });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || `Could not load ${table}`);
    const rows = (data ?? []) as Array<{ data: T }>;
    out.push(...rows.map(r => r.data));
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

async function fetchRemote(client: SupabaseLike) {
  const [profiles, history] = await Promise.all([
    fetchAll<VendorProfile>(client, PROFILES_TABLE, [{ column: 'id', ascending: true }]),
    fetchAll<InvoiceData>(client, INVOICES_TABLE, [
      { column: 'updated_at', ascending: false },
      { column: 'invoice_number', ascending: false },
    ]),
  ]);
  return {
    profiles: dedupeByKey(profiles.filter(isProfile), p => p.id),
    history: dedupeByKey(history.filter(isInvoice), invoiceKey),
  };
}

// Data saved in this browser before login existed (the old localStorage keys).
export function readLegacyLocal(storage: Pick<Storage, 'getItem'>): BackupData | null {
  const parse = (key: string): unknown[] => {
    try {
      const value = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const profiles = parse('vendor_profiles').filter(isProfile);
  const history = parse('invoice_history').filter(isInvoice);
  if (profiles.length === 0 && history.length === 0) return null;
  return { profiles, history, activeProfileId: storage.getItem('active_profile_id') };
}

// ---------- writing ----------

async function upsertRows(client: SupabaseLike, table: string, rows: object[], onConflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict });
    if (error) throw new Error(error.message || `Could not save to ${table}`);
  }
}

// ---------- sync engine ----------

export class CloudSync {
  private profiles: VendorProfile[] = [];
  private history: InvoiceData[] = [];
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private version = 0;
  private failed = { profiles: false, history: false };

  constructor(
    private client: SupabaseLike,
    readonly userId: string,
    private onStatus: (status: SyncStatus) => void = () => {}
  ) {}

  private emit() {
    if (this.pending > 0) this.onStatus('saving');
    else this.onStatus(this.failed.profiles || this.failed.history ? 'error' : 'idle');
  }

  private enqueue(kind: 'profiles' | 'history', task: () => Promise<void>): Promise<boolean> {
    this.version++;
    this.pending++;
    this.emit();
    const run = this.chain.then(task).then(
      () => {
        this.failed[kind] = false;
        return true;
      },
      (err: unknown) => {
        console.error(`Cloud save failed (${kind})`, err);
        this.failed[kind] = true;
        return false;
      }
    );
    this.chain = run.then(() => undefined);
    return run.then(ok => {
      this.pending--;
      this.emit();
      return ok;
    });
  }

  async load(): Promise<{ profiles: VendorProfile[]; history: InvoiceData[] }> {
    const data = await fetchRemote(this.client);
    this.profiles = data.profiles;
    this.history = data.history;
    return { profiles: [...data.profiles], history: [...data.history] };
  }

  // Re-read from the cloud (e.g. when the tab regains focus). Returns null when nothing
  // changed, or when local changes are unsaved/in flight so they are never overwritten.
  async refresh(): Promise<{ profiles: VendorProfile[]; history: InvoiceData[] } | null> {
    if (this.pending > 0 || this.failed.profiles || this.failed.history) return null;
    const startVersion = this.version;
    const data = await fetchRemote(this.client);
    if (this.pending > 0 || this.version !== startVersion) return null;
    const unchanged =
      stableStringify(data.profiles) === stableStringify(this.profiles) &&
      stableStringify(data.history) === stableStringify(this.history);
    if (unchanged) return null;
    this.profiles = data.profiles;
    this.history = data.history;
    return { profiles: [...data.profiles], history: [...data.history] };
  }

  // Writes only what changed since the last successful save, one row at a time.
  pushProfiles(next: VendorProfile[]): Promise<boolean> {
    return this.enqueue('profiles', async () => {
      const target = dedupeByKey(next, p => p.id);
      const { upserts, removed } = diffByKey(this.profiles, target, p => p.id);
      await upsertRows(
        this.client,
        PROFILES_TABLE,
        upserts.map(p => profileToRow(this.userId, p)),
        'user_id,id'
      );
      for (const p of removed) {
        const { error } = await this.client
          .from(PROFILES_TABLE)
          .delete()
          .eq('user_id', this.userId)
          .eq('id', p.id);
        if (error) throw new Error(error.message || 'Could not delete profile');
      }
      this.profiles = target;
    });
  }

  pushHistory(next: InvoiceData[]): Promise<boolean> {
    return this.enqueue('history', async () => {
      const target = dedupeByKey(next, invoiceKey);
      const { upserts, removed } = diffByKey(this.history, target, invoiceKey);
      await upsertRows(
        this.client,
        INVOICES_TABLE,
        upserts.map(inv => invoiceToRow(this.userId, inv)),
        'user_id,profile_id,invoice_number'
      );
      for (const inv of removed) {
        const { error } = await this.client
          .from(INVOICES_TABLE)
          .delete()
          .eq('user_id', this.userId)
          .eq('profile_id', inv.vendorProfileId || '')
          .eq('invoice_number', String(inv.invoiceNumber ?? ''));
        if (error) throw new Error(error.message || 'Could not delete invoice');
      }
      this.history = target;
    });
  }

  // Latest invoice counter stored in the cloud (another device may have used newer numbers).
  async fetchLastInvoiceNumber(profileId: string): Promise<number | null> {
    try {
      const { data, error } = await this.client
        .from(PROFILES_TABLE)
        .select('data')
        .eq('user_id', this.userId)
        .eq('id', profileId)
        .maybeSingle();
      if (error || !data?.data) return null;
      const n = Number((data.data as VendorProfile).lastInvoiceNumber);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
}
