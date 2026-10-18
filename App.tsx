
import React, { useState, useEffect, useRef } from 'react';
import { InvoiceData, InvoiceReceipt, EMPTY_INVOICE, VendorProfile } from './types';
import InvoiceForm from './components/InvoiceForm';
import InvoicePreview from './components/InvoicePreview';
import { CloudSync, SyncStatus, readLegacyLocal } from './services/cloudSync';
import { filterInvoices } from './services/searchInvoices';
import { backupFileName, createBackupJson, invoiceKey, mergeBackup, parseBackup } from './services/backup';

const EMPTY_PROFILE: Omit<VendorProfile, 'id'> = {
  isGstRegistered: true,
  vendorName: '',
  vendorAddress: '',
  vendorEmail: '',
  vendorPhone: '',
  vendorGstin: '',
  pan: '',
  bankName: '',
  bankAccount: '',
  bankIfsc: '',
  dealsIn: '',
  lastInvoiceNumber: 114,
};

const invoiceAmounts = (invoice: InvoiceData) => {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxRate = (Number(invoice.cgstRate) || 0) +
    (Number(invoice.sgstRate) || 0) +
    (Number(invoice.igstRate) || 0);
  const isGstInvoice = invoice.isGstRegistered ?? Boolean(invoice.vendorGstin || taxRate > 0);
  const gst = isGstInvoice
    ? subtotal * taxRate / 100
    : 0;
  const total = Math.round(subtotal + gst);
  const received = invoice.receipts?.length
    ? invoice.receipts.reduce((sum, receipt) => sum + Math.max(0, Number(receipt.amount) || 0), 0)
    : Math.max(0, Number(invoice.amountReceived) || 0);
  return { subtotal, gst, total, received, remaining: total - received };
};

const invoicePaymentStatus = (invoice: InvoiceData) => {
  const { received, remaining } = invoiceAmounts(invoice);
  if (remaining < 0) return 'Overpaid';
  if (remaining === 0) return 'Paid';
  if (received > 0) return 'Partial';
  return 'Unpaid';
};

const receiptDate = () => new Date().toISOString().split('T')[0];

interface ProfileFormModalProps {
  profileDraft: Omit<VendorProfile, 'id'>;
  setProfileDraft: React.Dispatch<React.SetStateAction<Omit<VendorProfile, 'id'>>>;
  editingProfile: VendorProfile | null;
  profiles: VendorProfile[];
  onSave: () => void;
  onCancel: () => void;
  onImport: () => void;
}

const ProfileFormModal: React.FC<ProfileFormModalProps> = ({ profileDraft, setProfileDraft, editingProfile, profiles, onSave, onCancel, onImport }) => {
  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none";
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900">{editingProfile ? 'Edit Profile' : 'New Vendor Profile'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Company Name *</label>
            <input className={inputCls} placeholder="e.g. STAR LIFT AND CONTROLLER" value={profileDraft.vendorName} onChange={e => setProfileDraft(d => ({ ...d, vendorName: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Deals In</label>
            <input className={inputCls} placeholder="e.g. New Elevator Installation, Repair, AMC" value={profileDraft.dealsIn} onChange={e => setProfileDraft(d => ({ ...d, dealsIn: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
            <textarea className={`${inputCls} h-16`} placeholder="Full address" value={profileDraft.vendorAddress} onChange={e => setProfileDraft(d => ({ ...d, vendorAddress: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input className={inputCls} placeholder="Phone number" value={profileDraft.vendorPhone} onChange={e => setProfileDraft(d => ({ ...d, vendorPhone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input className={inputCls} placeholder="Email" value={profileDraft.vendorEmail} onChange={e => setProfileDraft(d => ({ ...d, vendorEmail: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">GST Registered?</label>
            <select
              className={inputCls}
              value={profileDraft.isGstRegistered ? 'yes' : 'no'}
              onChange={e => setProfileDraft(d => ({ ...d, isGstRegistered: e.target.value === 'yes', vendorGstin: e.target.value === 'yes' ? d.vendorGstin : '' }))}
            >
              <option value="yes">Yes, has GST</option>
              <option value="no">No GST</option>
            </select>
          </div>
          {profileDraft.isGstRegistered && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">GSTIN</label>
              <input className={inputCls} placeholder="GSTIN" value={profileDraft.vendorGstin} onChange={e => setProfileDraft(d => ({ ...d, vendorGstin: e.target.value }))} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">PAN</label>
            <input className={inputCls} placeholder="PAN" value={profileDraft.pan} onChange={e => setProfileDraft(d => ({ ...d, pan: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bank Name</label>
            <input className={inputCls} placeholder="Bank Name" value={profileDraft.bankName} onChange={e => setProfileDraft(d => ({ ...d, bankName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Account No</label>
            <input className={inputCls} placeholder="Account No" value={profileDraft.bankAccount} onChange={e => setProfileDraft(d => ({ ...d, bankAccount: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">IFSC Code</label>
            <input className={inputCls} placeholder="IFSC Code" value={profileDraft.bankIfsc} onChange={e => setProfileDraft(d => ({ ...d, bankIfsc: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Starting Invoice No.</label>
            <input type="number" className={inputCls} value={profileDraft.lastInvoiceNumber} onChange={e => setProfileDraft(d => ({ ...d, lastInvoiceNumber: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onSave} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition">Save Profile</button>
          {profiles.length > 0 && (
            <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-200 transition">Cancel</button>
          )}
        </div>
        {profiles.length === 0 && (
          <p className="text-sm text-gray-500 text-center">
            Already have invoices?{' '}
            <button type="button" onClick={onImport} className="text-indigo-600 font-semibold hover:underline">Import a backup file</button>
          </p>
        )}
      </div>
    </div>
  );
};

interface AppProps {
  sync?: CloudSync | null;          // present when signed in: data lives in the cloud database
  syncStatus?: SyncStatus;
  accountSlot?: React.ReactNode;    // e.g. the Clerk user button
}

const LEGACY_DONE_KEY = 'legacy_upload_done';

const App: React.FC<AppProps> = ({ sync = null, syncStatus = 'idle', accountSlot = null }) => {
  const [profiles, setProfiles] = useState<VendorProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [view, setView] = useState<'editor' | 'history' | 'receivables' | 'profiles'>('editor');
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<VendorProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<Omit<VendorProfile, 'id'>>(EMPTY_PROFILE);
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceData>(EMPTY_INVOICE);
  const [history, setHistory] = useState<InvoiceData[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statementQuery, setStatementQuery] = useState('');
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');

  const parseLocalJSON = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>(sync ? 'loading' : 'ready');
  const [bootError, setBootError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const startedAttemptRef = useRef(-1);
  const profilesRef = useRef<VendorProfile[]>([]);
  const historyRef = useRef<InvoiceData[]>([]);
  const activeIdRef = useRef<string | null>(null);
  profilesRef.current = profiles;
  historyRef.current = history;
  activeIdRef.current = activeProfileId;

  // Signed in: the active profile is remembered per account. Signed out: the original key.
  const activeKey = sync ? `active_profile_id:${sync.userId}` : 'active_profile_id';
  const rememberActive = (id: string) => localStorage.setItem(activeKey, id);

  // Load: from the cloud database when signed in, otherwise from this browser.
  useEffect(() => {
    if (startedAttemptRef.current === loadAttempt) return;
    startedAttemptRef.current = loadAttempt;

    const finish = (loadedProfiles: VendorProfile[], loadedHistory: InvoiceData[]) => {
      setProfiles(loadedProfiles);
      setHistory(loadedHistory);
      if (loadedProfiles.length === 0) {
        setView('profiles');
        setShowProfileForm(true);
      } else {
        const savedId = localStorage.getItem(activeKey);
        const active = loadedProfiles.find(p => p.id === savedId) ?? loadedProfiles[0];
        setActiveProfileId(active.id);
        rememberActive(active.id);
        applyProfile(active, active.lastInvoiceNumber);
      }
      setBoot('ready');
    };

    const load = async () => {
      if (!sync) {
        finish(
          parseLocalJSON<VendorProfile[]>(localStorage.getItem('vendor_profiles'), []),
          parseLocalJSON<InvoiceData[]>(localStorage.getItem('invoice_history'), [])
        );
        return;
      }
      try {
        setBoot('loading');
        const cloud = await sync.load();
        let loadedProfiles = cloud.profiles;
        let loadedHistory = cloud.history;

        // One-time: offer to move invoices saved in this browser before login into the account.
        const legacy = readLegacyLocal(localStorage);
        if (legacy && localStorage.getItem(LEGACY_DONE_KEY) !== '1') {
          const merged = mergeBackup({ profiles: loadedProfiles, history: loadedHistory, activeProfileId: null }, legacy);
          if (merged.addedInvoices === 0 && merged.addedProfiles === 0) {
            localStorage.setItem(LEGACY_DONE_KEY, '1');
          } else if (
            confirm(
              `Found ${merged.addedInvoices} invoice(s) and ${merged.addedProfiles} profile(s) saved in this browser from before you signed in.\n\n` +
                'Upload them to your account so you can open them on any device?\n(They also stay in this browser as a backup.)'
            )
          ) {
            loadedProfiles = merged.profiles;
            loadedHistory = merged.history;
            const [okProfiles, okHistory] = await Promise.all([
              sync.pushProfiles(loadedProfiles),
              sync.pushHistory(loadedHistory),
            ]);
            if (okProfiles && okHistory) localStorage.setItem(LEGACY_DONE_KEY, '1');
          }
        }
        finish(loadedProfiles, loadedHistory);
      } catch (err: any) {
        setBootError(err?.message || 'Could not load your invoices.');
        setBoot('error');
      }
    };

    void load();
  }, [loadAttempt]);

  // Pick up changes made on another device when this tab comes back into view.
  useEffect(() => {
    if (!sync || boot !== 'ready') return;
    let lastRun = Date.now();
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRun < 15000) return;
      lastRun = Date.now();
      try {
        const fresh = await sync.refresh();
        if (!fresh) return;
        setProfiles(fresh.profiles);
        setHistory(fresh.history);
        if (fresh.profiles.length > 0 && !fresh.profiles.some(p => p.id === activeIdRef.current)) {
          const first = fresh.profiles[0];
          setActiveProfileId(first.id);
          rememberActive(first.id);
          applyProfile(first, first.lastInvoiceNumber);
        }
      } catch (err) {
        console.error('Could not refresh from the cloud', err);
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [boot]);

  const retrySync = () => {
    if (!sync) return;
    void sync.pushProfiles(profilesRef.current);
    void sync.pushHistory(historyRef.current);
  };

  const GSTIN_STATE_MAP: Record<string, string> = {
    '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand',
    '06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim',
    '12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura',
    '17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha',
    '22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','26':'Dadra & Nagar Haveli and Daman & Diu',
    '27':'Maharashtra','28':'Andhra Pradesh','29':'Karnataka','30':'Goa','31':'Lakshadweep',
    '32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar Islands',
    '36':'Telangana','37':'Andhra Pradesh (New)','38':'Ladakh','97':'Other Territory','99':'Centre Jurisdiction',
  };

  const notesWithJurisdiction = (gstin: string, notes: string) => {
    const state = GSTIN_STATE_MAP[gstin.slice(0, 2)];
    if (!state) return notes;
    const newLine = `Subject to ${state} jurisdiction.`;
    const lines = notes.split('\n').filter(l => !/subject to .* jurisdiction/i.test(l));
    return [...lines, newLine].join('\n');
  };

  const isProfileGstRegistered = (profile: VendorProfile) => profile.isGstRegistered ?? Boolean(profile.vendorGstin);

  const applyProfile = (profile: VendorProfile, lastNum: number) => {
    const isGstRegistered = isProfileGstRegistered(profile);
    setCurrentInvoice({
      ...EMPTY_INVOICE,
      vendorProfileId: profile.id,
      isGstRegistered,
      vendorName: profile.vendorName,
      vendorAddress: profile.vendorAddress,
      vendorEmail: profile.vendorEmail,
      vendorPhone: profile.vendorPhone,
      vendorGstin: isGstRegistered ? profile.vendorGstin : '',
      pan: profile.pan,
      bankName: profile.bankName,
      bankAccount: profile.bankAccount,
      bankIfsc: profile.bankIfsc,
      dealsIn: profile.dealsIn,
      invoiceNumber: '',
      cgstRate: isGstRegistered ? EMPTY_INVOICE.cgstRate : 0,
      sgstRate: isGstRegistered ? EMPTY_INVOICE.sgstRate : 0,
      igstRate: 0,
      notes: isGstRegistered ? notesWithJurisdiction(profile.vendorGstin, EMPTY_INVOICE.notes) : EMPTY_INVOICE.notes,
    });
  };

  const saveProfiles = (updated: VendorProfile[]) => {
    setProfiles(updated);
    if (sync) void sync.pushProfiles(updated);
    else localStorage.setItem('vendor_profiles', JSON.stringify(updated));
  };

  const persistHistory = (newHistory: InvoiceData[]) => {
    setHistory(newHistory);
    if (sync) void sync.pushHistory(newHistory);
    else localStorage.setItem('invoice_history', JSON.stringify(newHistory));
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const belongsToActiveProfile = (invoice: InvoiceData) => {
    if (invoice.vendorProfileId === activeProfileId) return true;
    if (invoice.vendorProfileId || !activeProfile) return false;
    const sameName = invoice.vendorName.trim().toLowerCase() === activeProfile.vendorName.trim().toLowerCase();
    const sameGstin = !invoice.vendorGstin || !activeProfile.vendorGstin ||
      invoice.vendorGstin.trim().toLowerCase() === activeProfile.vendorGstin.trim().toLowerCase();
    return sameName && sameGstin;
  };
  const compareInvoiceNumbers = (left: InvoiceData, right: InvoiceData) => {
    const leftNumber = Number(left.invoiceNumber);
    const rightNumber = Number(right.invoiceNumber);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return rightNumber - leftNumber;
    }
    return String(right.invoiceNumber || '').localeCompare(String(left.invoiceNumber || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  };

  const profileHistory = history
    .filter(belongsToActiveProfile)
    .sort(compareInvoiceNumbers);
  const filteredHistory = filterInvoices(profileHistory, searchQuery);
  const receiverSuggestions = profileHistory
    .filter(inv => inv.clientName.trim());
  const statementInvoices = profileHistory.filter(invoice => {
    const query = statementQuery.trim().toLowerCase();
    const matchesReceiver = !query ||
      invoice.clientName.toLowerCase().includes(query) ||
      invoice.clientGstin.toLowerCase().includes(query);
    const matchesFrom = !statementFrom || invoice.date >= statementFrom;
    const matchesTo = !statementTo || invoice.date <= statementTo;
    return matchesReceiver && matchesFrom && matchesTo;
  }).sort(compareInvoiceNumbers);
  const statementTotals = statementInvoices.reduce(
    (totals, invoice) => {
      const amounts = invoiceAmounts(invoice);
      return {
        subtotal: totals.subtotal + amounts.subtotal,
        gst: totals.gst + amounts.gst,
        total: totals.total + amounts.total,
        received: totals.received + amounts.received,
        remaining: totals.remaining + amounts.remaining,
      };
    },
    { subtotal: 0, gst: 0, total: 0, received: 0, remaining: 0 }
  );
  const formatStatementCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);

  const switchProfile = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    setActiveProfileId(id);
    rememberActive(id);
    applyProfile(profile, profile.lastInvoiceNumber);
    setView('editor');
  };

  const saveProfile = () => {
    if (!profileDraft.vendorName.trim()) return alert('Vendor name is required');
    const normalizedDraft = {
      ...profileDraft,
      vendorGstin: profileDraft.isGstRegistered ? profileDraft.vendorGstin : '',
    };
    if (editingProfile) {
      const updated = profiles.map(p => p.id === editingProfile.id ? { ...normalizedDraft, id: editingProfile.id } : p);
      saveProfiles(updated);
      if (activeProfileId === editingProfile.id) applyProfile({ ...normalizedDraft, id: editingProfile.id }, normalizedDraft.lastInvoiceNumber);
    } else {
      const newProfile: VendorProfile = { ...normalizedDraft, id: Date.now().toString() };
      const updated = [...profiles, newProfile];
      saveProfiles(updated);
      setActiveProfileId(newProfile.id);
      rememberActive(newProfile.id);
      applyProfile(newProfile, newProfile.lastInvoiceNumber);
    }
    setShowProfileForm(false);
    setEditingProfile(null);
    setProfileDraft(EMPTY_PROFILE);
    setView('editor');
  };

  const deleteProfile = (id: string) => {
    if (profiles.length === 1) return alert('You need at least one profile.');
    if (!confirm('Delete this profile?')) return;
    const updated = profiles.filter(p => p.id !== id);
    saveProfiles(updated);
    if (activeProfileId === id) switchProfile(updated[0].id);
  };

  const startNew = async () => {
    if (!activeProfile) return;
    const isGstRegistered = isProfileGstRegistered(activeProfile);
    let latest = activeProfile.lastInvoiceNumber;
    if (sync) {
      const remote = await sync.fetchLastInvoiceNumber(activeProfile.id);
      if (remote !== null && remote > latest) latest = remote;
    }
    const nextNum = latest + 1;
    const updatedProfiles = profilesRef.current.map(p => p.id === activeProfile.id ? { ...p, lastInvoiceNumber: nextNum } : p);
    saveProfiles(updatedProfiles);
    setCurrentInvoice({
      ...EMPTY_INVOICE,
      vendorProfileId: activeProfile.id,
      isGstRegistered,
      vendorName: activeProfile.vendorName,
      vendorAddress: activeProfile.vendorAddress,
      vendorEmail: activeProfile.vendorEmail,
      vendorPhone: activeProfile.vendorPhone,
      vendorGstin: isGstRegistered ? activeProfile.vendorGstin : '',
      pan: activeProfile.pan,
      bankName: activeProfile.bankName,
      bankAccount: activeProfile.bankAccount,
      bankIfsc: activeProfile.bankIfsc,
      dealsIn: activeProfile.dealsIn,
      invoiceNumber: `${nextNum}`,
      cgstRate: isGstRegistered ? EMPTY_INVOICE.cgstRate : 0,
      sgstRate: isGstRegistered ? EMPTY_INVOICE.sgstRate : 0,
      igstRate: 0,
      notes: isGstRegistered ? notesWithJurisdiction(activeProfile.vendorGstin, EMPTY_INVOICE.notes) : EMPTY_INVOICE.notes,
    });
  };

  const saveToHistory = () => {
    const filtered = history.filter(h => invoiceKey(h) !== invoiceKey(currentInvoice));
    persistHistory([currentInvoice, ...filtered]);
    alert('Invoice saved to history!');
  };

  const deleteFromHistory = (idx: number) => {
    persistHistory(history.filter((_, i) => i !== idx));
  };

  const handlePrint = () => {
    const filtered = history.filter(h => invoiceKey(h) !== invoiceKey(currentInvoice));
    persistHistory([currentInvoice, ...filtered]);
    const prev = document.title;
    document.title = `${currentInvoice.clientName || 'Invoice'} - ${currentInvoice.invoiceNumber}`.trim();
    window.print();
    document.title = prev;
  };

  const updateReceipts = (invoice: InvoiceData, receipts: InvoiceReceipt[]) => {
    persistHistory(history.map(item =>
      invoiceKey(item) === invoiceKey(invoice) ? { ...item, receipts } : item
    ));
  };

  const addReceipt = (invoice: InvoiceData) => {
    const legacyReceipt = !invoice.receipts?.length && Number(invoice.amountReceived) > 0
      ? [{
          id: `legacy-${invoice.invoiceNumber}`,
          amount: Number(invoice.amountReceived),
          date: invoice.date || receiptDate(),
        }]
      : [];
    updateReceipts(invoice, [
      ...legacyReceipt,
      ...(invoice.receipts || []),
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, amount: 0, date: receiptDate() },
    ]);
  };

  const removeReceipt = (invoice: InvoiceData, receiptId: string) => {
    updateReceipts(invoice, (invoice.receipts || []).filter(receipt => receipt.id !== receiptId));
  };

  const changeReceipt = (invoice: InvoiceData, receiptId: string, changes: Partial<InvoiceReceipt>) => {
    updateReceipts(invoice, (invoice.receipts || []).map(receipt =>
      receipt.id === receiptId ? { ...receipt, ...changes } : receipt
    ));
  };

  const handleStatementPrint = () => {
    const statement = document.getElementById('printable-statement');
    if (!statement) {
      alert('Could not prepare the receivables statement for printing.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      alert('Please allow pop-ups to print the receivables statement.');
      return;
    }

    const title = `${statementQuery || 'Receivables Statement'} - ${activeProfile?.vendorName || ''}`.trim();
    const statementCopy = statement.cloneNode(true) as HTMLElement;
    const statementTableBody = statementCopy.querySelector('tbody');
    if (statementTableBody) {
      Array.from(statementTableBody.children)
        .sort((left, right) => {
          const leftNumber = Number(left.querySelector('td')?.textContent?.replace('#', '').trim());
          const rightNumber = Number(right.querySelector('td')?.textContent?.replace('#', '').trim());
          if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
          return (left.querySelector('td')?.textContent || '').localeCompare(right.querySelector('td')?.textContent || '', undefined, { numeric: true });
        })
        .forEach(row => statementTableBody.appendChild(row));
    }
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(style => style.outerHTML)
      .join('');
    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title.replace(/[<>&"]/g, '')}</title>
          ${styles}
          <style>
            @page { size: A4 landscape; margin: 6mm; }
            html, body { margin: 0; padding: 0; background: white; }
            body { width: 100%; overflow: visible; }
          </style>
        </head>
        <body>${statementCopy.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const exportBackup = () => {
    const json = createBackupJson({ profiles, history, activeProfileId });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = parseBackup(await file.text());
      const merged = mergeBackup({ profiles, history, activeProfileId }, incoming);
      if (merged.addedInvoices === 0 && merged.addedProfiles === 0) {
        return alert(`Nothing new to import. All ${incoming.history.length} invoices in this file are already in the app.`);
      }
      const summary = `Import ${merged.addedInvoices} new invoice(s) and ${merged.addedProfiles} new profile(s)?` +
        (merged.skippedInvoices ? `\n${merged.skippedInvoices} invoice(s) already exist and will be skipped.` : '') +
        '\nNothing in the app will be deleted or overwritten.';
      if (!confirm(summary)) return;

      saveProfiles(merged.profiles);
      persistHistory(merged.history);
      if (merged.activeProfileId && merged.activeProfileId !== activeProfileId) {
        const profile = merged.profiles.find(p => p.id === merged.activeProfileId);
        if (profile) {
          setActiveProfileId(profile.id);
          rememberActive(profile.id);
          applyProfile(profile, profile.lastInvoiceNumber);
        }
      }
      setShowProfileForm(false);
      setEditingProfile(null);
      setView('history');
      alert(`Imported ${merged.addedInvoices} invoice(s) and ${merged.addedProfiles} profile(s).`);
    } catch (err: any) {
      alert(err?.message || 'Could not read this backup file.');
    }
  };

  const handleCancel = () => { setShowProfileForm(false); setEditingProfile(null); setProfileDraft(EMPTY_PROFILE); };

  if (boot !== 'ready') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md text-center space-y-4">
          {boot === 'loading' ? (
            <p className="text-gray-500">Loading your invoices…</p>
          ) : (
            <>
              <p className="text-red-600 font-medium">Could not load your invoices.</p>
              <p className="text-sm text-gray-500">{bootError}</p>
              <button onClick={() => setLoadAttempt(a => a + 1)} className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-indigo-700 transition">Try again</button>
            </>
          )}
          {accountSlot && <div className="flex justify-center pt-2">{accountSlot}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {showProfileForm && (
        <ProfileFormModal
          profileDraft={profileDraft}
          setProfileDraft={setProfileDraft}
          editingProfile={editingProfile}
          profiles={profiles}
          onSave={saveProfile}
          onCancel={handleCancel}
          onImport={() => importInputRef.current?.click()}
        />
      )}

      <input type="file" ref={importInputRef} accept=".json,application/json" className="hidden" onChange={importBackup} />

      {/* Navigation */}
      <nav className="no-print bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="truncate text-lg sm:text-xl font-bold text-gray-900 tracking-tight">SmartInvoice AI</span>
              {/* Profile switcher */}
              {profiles.length > 0 && (
                <select
                  value={activeProfileId || ''}
                  onChange={e => switchProfile(e.target.value)}
                  className="ml-0 max-w-[42vw] text-sm border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none sm:ml-2 sm:max-w-none"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.vendorName}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto sm:gap-2">
              <button onClick={() => setView('editor')} className={`px-3 py-2 text-sm font-medium rounded-md transition ${view === 'editor' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Generator</button>
              <button onClick={() => setView('history')} className={`px-3 py-2 text-sm font-medium rounded-md transition ${view === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>History ({profileHistory.length})</button>
              <button onClick={() => setView('receivables')} className={`px-3 py-2 text-sm font-medium rounded-md transition ${view === 'receivables' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Receivables</button>
              <button onClick={() => setView('profiles')} className={`px-3 py-2 text-sm font-medium rounded-md transition ${view === 'profiles' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Profiles</button>
              {sync && (
                <span className={`${syncStatus === 'error' ? 'inline bg-red-50 text-red-600' : 'hidden sm:inline bg-gray-100 text-gray-500'} text-xs font-medium px-2 py-1 rounded-full`}>
                  {syncStatus === 'saving' && 'Saving…'}
                  {syncStatus === 'idle' && 'Saved to cloud'}
                  {syncStatus === 'error' && (
                    <>Not saved <button onClick={retrySync} className="underline font-semibold ml-1">Retry</button></>
                  )}
                </span>
              )}
              {accountSlot && <div className="ml-1 flex items-center">{accountSlot}</div>}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow container mx-auto w-full px-3 py-5 sm:px-4 sm:py-8 max-w-7xl">

        {/* EDITOR VIEW */}
        {view === 'editor' && (
          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="no-print space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={startNew} className="w-full bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition sm:w-auto">
                  + Start New Invoice
                </button>
                {activeProfile && (
                  <span className="text-sm text-gray-500">Profile: <span className="font-semibold text-gray-700">{activeProfile.vendorName}</span></span>
                )}
              </div>
              <InvoiceForm
                data={currentInvoice}
                onChange={setCurrentInvoice}
                receiverSuggestions={receiverSuggestions}
              />
            </div>
            <div className="min-w-0 space-y-4">
              <div className="no-print flex flex-wrap justify-between items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-gray-900">Live Preview</h3>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <button onClick={saveToHistory} className="flex-1 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-md font-semibold hover:bg-gray-50 transition sm:flex-none">Save Draft</button>
                  <button onClick={handlePrint} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2 sm:flex-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print / Export PDF
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto pb-2">
                <InvoicePreview data={currentInvoice} />
              </div>
            </div>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Past Invoices</h2>
                <p className="text-sm text-gray-500 mt-1">Backup includes all {history.length} saved invoice{history.length === 1 ? '' : 's'} and all profiles.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => importInputRef.current?.click()} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-md font-semibold hover:bg-gray-50 transition">Import backup</button>
                <button onClick={exportBackup} disabled={history.length === 0 && profiles.length === 0} className="bg-indigo-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-indigo-700 transition disabled:opacity-50">Export backup</button>
              </div>
            </div>
            {profileHistory.length > 0 && (
              <div className="relative">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by client name, GSTIN or invoice number"
                  aria-label="Search invoices"
                  className="w-full px-4 py-2.5 pr-24 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                {searchQuery && (
                  <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                    <span className="text-xs text-gray-400">{filteredHistory.length} of {profileHistory.length}</span>
                    <button onClick={() => setSearchQuery('')} className="text-xs font-semibold text-indigo-600 hover:underline">Clear</button>
                  </div>
                )}
              </div>
            )}
            {profileHistory.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">No invoices yet</h3>
                <p className="text-gray-500 mt-1">Save or print an invoice to see it here.</p>
                <button onClick={() => setView('editor')} className="mt-6 text-indigo-600 font-bold hover:underline">Start creating</button>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">No invoices match "{searchQuery.trim()}"</h3>
                <p className="text-gray-500 mt-1">Check the spelling, or search by GSTIN or invoice number.</p>
                <button onClick={() => setSearchQuery('')} className="mt-6 text-indigo-600 font-bold hover:underline">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredHistory.map((inv, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer group" onClick={() => { setCurrentInvoice(inv); setView('editor'); }}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-sm font-bold text-indigo-600">#{inv.invoiceNumber}</div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-xs text-gray-400 font-medium">{inv.date}</div>
                          {(() => {
                            const status = invoicePaymentStatus(inv);
                            return (
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status === 'Paid' ? 'bg-green-50 text-green-700' : status === 'Overpaid' ? 'bg-blue-50 text-blue-700' : status === 'Partial' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                                {status}
                              </span>
                            );
                          })()}
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteFromHistory(history.indexOf(inv)); }} className="text-gray-300 hover:text-red-500 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="mb-3">
                      <div className="text-gray-900 font-bold text-lg leading-tight group-hover:text-indigo-600 transition">{inv.clientName || 'Unknown Client'}</div>
                      <div className="text-sm text-gray-500">{inv.vendorName}</div>
                      {inv.clientGstin && <div className="text-xs text-gray-400 mt-0.5">GSTIN {inv.clientGstin}</div>}
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-xs text-gray-400">{inv.items.length} {inv.items.length === 1 ? 'item' : 'items'}</div>
                      <div className="text-lg font-bold text-gray-900">
                        {new Intl.NumberFormat(inv.currency === 'USD' ? 'en-US' : 'en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(
                          inv.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0) * (1 + (inv.cgstRate + inv.sgstRate + inv.igstRate) / 100)
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RECEIVABLES VIEW */}
        {view === 'receivables' && (
          <div id="printable-statement" className="space-y-6">
            <div className="no-print flex flex-wrap justify-between items-end gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Receivables Statement</h2>
                <p className="text-sm text-gray-500 mt-1">Track billed, GST, received, and remaining amounts by receiver.</p>
              </div>
              <button onClick={handleStatementPrint} className="bg-indigo-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-indigo-700 transition">
                Print / Export PDF
              </button>
            </div>
            <div className="no-print grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="search"
                value={statementQuery}
                onChange={e => setStatementQuery(e.target.value)}
                placeholder="Search company name or GSTIN"
                aria-label="Search receiver statement"
                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none md:col-span-3"
              />
              <label className="text-xs font-medium text-gray-500">
                From date
                <input type="date" value={statementFrom} onChange={e => setStatementFrom(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </label>
              <label className="text-xs font-medium text-gray-500">
                To date
                <input type="date" value={statementTo} onChange={e => setStatementTo(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </label>
              <button
                type="button"
                onClick={() => { setStatementQuery(''); setStatementFrom(''); setStatementTo(''); }}
                className="self-end px-4 py-2 text-sm font-semibold text-indigo-600 hover:underline text-left"
              >
                Clear filters
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{statementQuery || 'All receivers'}</h3>
                  {statementQuery && <p className="text-sm text-gray-500">Company name or GSTIN match</p>}
                </div>
                <p className="text-sm text-gray-500">{statementInvoices.length} invoice{statementInvoices.length === 1 ? '' : 's'}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  ['Subtotal', statementTotals.subtotal],
                  ['GST', statementTotals.gst],
                  ['Billed total', statementTotals.total],
                  ['Received', statementTotals.received],
                  ['Remaining', statementTotals.remaining],
                ].map(([label, amount]) => (
                  <div key={label as string} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="mt-1 font-bold text-gray-900">{formatStatementCurrency(amount as number)}</p>
                  </div>
                ))}
              </div>
            </div>
            {statementInvoices.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">No matching invoices</h3>
                <p className="text-gray-500 mt-1">Search by receiver company name or GSTIN.</p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="statement-invoice-col" />
                    <col className="statement-date-col" />
                    <col className="statement-receiver-col" />
                    <col className="statement-money-col" />
                    <col className="statement-money-col" />
                    <col className="statement-money-col" />
                    <col className="statement-received-col" />
                    <col className="statement-money-col" />
                    <col className="no-print-status statement-status-col" />
                  </colgroup>
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Receiver</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">GST</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Received</th>
                      <th className="px-4 py-3 text-right">Remaining</th>
                      <th className="no-print-status statement-status-cell px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {statementInvoices.map(invoice => {
                      const amounts = invoiceAmounts(invoice);
                      const status = amounts.remaining < 0
                        ? 'Overpaid'
                        : amounts.remaining === 0
                          ? 'Paid'
                          : amounts.received > 0
                            ? 'Partial'
                            : 'Unpaid';
                      return (
                        <tr key={invoiceKey(invoice)}>
                          <td className="px-4 py-3 font-semibold text-indigo-600">#{invoice.invoiceNumber}</td>
                          <td className="px-4 py-3 text-gray-500">{invoice.date}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{invoice.clientName}</div>
                            {invoice.clientGstin && <div className="text-xs text-gray-500">{invoice.clientGstin}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">{formatStatementCurrency(amounts.subtotal)}</td>
                          <td className="px-4 py-3 text-right">{formatStatementCurrency(amounts.gst)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatStatementCurrency(amounts.total)}</td>
                          <td className="px-2 py-2 text-right align-top">
                            <div className="space-y-1">
                              {(invoice.receipts || []).map(receipt => (
                                <div key={receipt.id} className="no-print flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={receipt.amount}
                                    onChange={e => changeReceipt(invoice, receipt.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                                    onBlur={() => {
                                      if (receipt.amount <= 0) removeReceipt(invoice, receipt.id);
                                    }}
                                    className="w-24 px-1.5 py-1 border border-gray-200 rounded text-right"
                                    placeholder="Amount"
                                    aria-label={`Received amount for invoice ${invoice.invoiceNumber}`}
                                  />
                                  <input
                                    type="date"
                                    value={receipt.date}
                                    onChange={e => changeReceipt(invoice, receipt.id, { date: e.target.value })}
                                    className="w-28 px-1 py-1 border border-gray-200 rounded text-xs"
                                    aria-label={`Receipt date for invoice ${invoice.invoiceNumber}`}
                                  />
                                  <button type="button" onClick={() => removeReceipt(invoice, receipt.id)} className="text-red-500 px-1" aria-label="Remove receipt">×</button>
                                </div>
                              ))}
                              <span className="print-only">
                                {formatStatementCurrency(amounts.received)}
                                {(invoice.receipts || []).some(receipt => receipt.amount > 0) && (
                                  <span className="block text-xs font-normal">
                                    {(invoice.receipts || [])
                                      .filter(receipt => receipt.amount > 0)
                                      .map(receipt => `${receipt.date}: ${formatStatementCurrency(receipt.amount)}`)
                                      .join(', ')}
                                  </span>
                                )}
                              </span>
                              <button type="button" onClick={() => addReceipt(invoice)} className="no-print text-xs font-semibold text-indigo-600 hover:underline">+ receipt</button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{formatStatementCurrency(amounts.remaining)}</td>
                          <td className="no-print-status statement-status-cell px-4 py-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status === 'Paid' ? 'bg-green-50 text-green-700' : status === 'Overpaid' ? 'bg-blue-50 text-blue-700' : status === 'Partial' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PROFILES VIEW */}
        {view === 'profiles' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Vendor Profiles</h2>
              <button onClick={() => { setProfileDraft(EMPTY_PROFILE); setEditingProfile(null); setShowProfileForm(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition">+ Add Profile</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profiles.map(p => {
                const profileHasGst = isProfileGstRegistered(p);
                return (
                <div key={p.id} className={`bg-white p-6 rounded-xl border-2 shadow-sm transition ${activeProfileId === p.id ? 'border-indigo-500' : 'border-gray-100'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-gray-900 text-lg">{p.vendorName}</div>
                      {activeProfileId === p.id && <span className="text-xs text-indigo-600 font-semibold">● Active</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingProfile(p); setProfileDraft({ ...p, isGstRegistered: profileHasGst }); setShowProfileForm(true); }} className="text-gray-400 hover:text-indigo-600 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => deleteProfile(p.id)} className="text-gray-400 hover:text-red-500 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 space-y-0.5">
                    <p>{profileHasGst ? p.vendorGstin : 'No GST'}</p>
                    <p>{p.vendorPhone}</p>
                    <p className="text-xs">{p.bankName} · {p.bankAccount}</p>
                  </div>
                  {activeProfileId !== p.id && (
                    <button onClick={() => switchProfile(p.id)} className="mt-4 w-full bg-indigo-50 text-indigo-700 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition">Switch to this profile</button>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
