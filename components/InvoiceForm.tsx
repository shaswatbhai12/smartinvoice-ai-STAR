
import React, { useMemo, useState } from 'react';
import { InvoiceData, InvoiceItem } from '../types';

const GSTIN_STATE_MAP: Record<string, { state: string; code: string }> = {
  '01': { state: 'Jammu & Kashmir', code: '01' },
  '02': { state: 'Himachal Pradesh', code: '02' },
  '03': { state: 'Punjab', code: '03' },
  '04': { state: 'Chandigarh', code: '04' },
  '05': { state: 'Uttarakhand', code: '05' },
  '06': { state: 'Haryana', code: '06' },
  '07': { state: 'Delhi', code: '07' },
  '08': { state: 'Rajasthan', code: '08' },
  '09': { state: 'Uttar Pradesh', code: '09' },
  '10': { state: 'Bihar', code: '10' },
  '11': { state: 'Sikkim', code: '11' },
  '12': { state: 'Arunachal Pradesh', code: '12' },
  '13': { state: 'Nagaland', code: '13' },
  '14': { state: 'Manipur', code: '14' },
  '15': { state: 'Mizoram', code: '15' },
  '16': { state: 'Tripura', code: '16' },
  '17': { state: 'Meghalaya', code: '17' },
  '18': { state: 'Assam', code: '18' },
  '19': { state: 'West Bengal', code: '19' },
  '20': { state: 'Jharkhand', code: '20' },
  '21': { state: 'Odisha', code: '21' },
  '22': { state: 'Chhattisgarh', code: '22' },
  '23': { state: 'Madhya Pradesh', code: '23' },
  '24': { state: 'Gujarat', code: '24' },
  '26': { state: 'Dadra & Nagar Haveli and Daman & Diu', code: '26' },
  '27': { state: 'Maharashtra', code: '27' },
  '28': { state: 'Andhra Pradesh', code: '28' },
  '29': { state: 'Karnataka', code: '29' },
  '30': { state: 'Goa', code: '30' },
  '31': { state: 'Lakshadweep', code: '31' },
  '32': { state: 'Kerala', code: '32' },
  '33': { state: 'Tamil Nadu', code: '33' },
  '34': { state: 'Puducherry', code: '34' },
  '35': { state: 'Andaman & Nicobar Islands', code: '35' },
  '36': { state: 'Telangana', code: '36' },
  '37': { state: 'Andhra Pradesh (New)', code: '37' },
  '38': { state: 'Ladakh', code: '38' },
  '97': { state: 'Other Territory', code: '97' },
  '99': { state: 'Centre Jurisdiction', code: '99' },
};

interface InvoiceFormProps {
  data: InvoiceData;
  onChange: (data: InvoiceData) => void;
  receiverSuggestions?: InvoiceData[];
}

const InvoiceForm: React.FC<InvoiceFormProps> = ({ data, onChange, receiverSuggestions = [] }) => {
  const isGstRegistered = data.isGstRegistered ?? true;
  const [receiverSearchFocused, setReceiverSearchFocused] = useState(false);

  const updateField = (field: keyof InvoiceData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const updateItem = (id: string, updates: Partial<InvoiceItem>) => {
    const newItems = data.items.map(item => 
      item.id === id ? { ...item, ...updates } : item
    );
    updateField('items', newItems);
  };

  const addItem = () => {
    const newItem: InvoiceItem = {
      id: Math.random().toString(36).substr(2, 9),
      description: '',
      hsnCode: '',
      quantity: 1,
      unitPrice: 0
    };
    updateField('items', [...data.items, newItem]);
  };

  const removeItem = (id: string) => {
    if (data.items.length > 1) {
      updateField('items', data.items.filter(i => i.id !== id));
    }
  };

  const updateJurisdiction = (notes: string, stateName: string) => {
    const newLine = `Subject to ${stateName} jurisdiction.`;
    const lines = notes.split('\n').filter(l => !/subject to .* jurisdiction/i.test(l));
    return [...lines, newLine].join('\n');
  };

  const handleVendorGstin = (gstin: string) => {
    if (!isGstRegistered) return;
    const prefix = gstin.slice(0, 2);
    const match = GSTIN_STATE_MAP[prefix];
    const newNotes = match ? updateJurisdiction(data.notes, match.state) : data.notes;
    onChange({ ...data, vendorGstin: gstin, notes: newNotes });
  };

  const handleClientGstin = (gstin: string) => {
    if (!isGstRegistered) return;
    const prefix = gstin.slice(0, 2);
    const match = GSTIN_STATE_MAP[prefix];
    const vendorPrefix = data.vendorGstin.slice(0, 2);
    const isInterState = match && prefix !== vendorPrefix;
    const taxRate = data.cgstRate + data.sgstRate || data.igstRate || 18;
    onChange({
      ...data,
      clientGstin: gstin,
      ...(match ? { clientState: match.state, clientStateCode: match.code } : {}),
      ...(match ? (
        isInterState
          ? { cgstRate: 0, sgstRate: 0, igstRate: taxRate }
          : { cgstRate: taxRate / 2, sgstRate: taxRate / 2, igstRate: 0 }
      ) : {}),
    });
  };

  const matchingReceivers = useMemo(() => {
    const query = data.clientName.trim().toLowerCase();
    if (!query) return [];

    const seen = new Set<string>();
    return receiverSuggestions.filter(receiver => {
      const name = receiver.clientName.trim();
      const key = [
        name,
        receiver.clientAddress,
        receiver.clientEmail,
        receiver.clientGstin,
        receiver.clientState,
        receiver.clientStateCode,
      ].map(value => value.trim().toLowerCase()).join('|');
      if (!name || seen.has(key) || !name.toLowerCase().includes(query)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [data.clientName, receiverSuggestions]);

  const selectReceiver = (receiver: InvoiceData) => {
    const nextData = {
      ...data,
      clientName: receiver.clientName,
      clientAddress: receiver.clientAddress,
      clientEmail: receiver.clientEmail,
      clientGstin: receiver.clientGstin,
      clientState: receiver.clientState,
      clientStateCode: receiver.clientStateCode,
    };
    onChange(nextData);
    setReceiverSearchFocused(false);
  };

  return (
    <div className="space-y-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Invoice Header</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Serial Number</label>
              <input type="text" value={data.invoiceNumber} onChange={(e) => updateField('invoiceNumber', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input type="date" value={data.date} onChange={(e) => updateField('date', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Transport Mode</label>
              <input type="text" placeholder="e.g. DL01AQ7900" value={data.transportMode} onChange={(e) => updateField('transportMode', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">GR/RR/PR No.</label>
              <input type="text" placeholder="GR/RR/PR No." value={data.grrrpr} onChange={(e) => updateField('grrrpr', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
            <select value={data.currency} onChange={(e) => updateField('currency', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </div>

        {isGstRegistered && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Tax Rates (%)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CGST</label>
                <input type="number" value={data.cgstRate} onChange={(e) => updateField('cgstRate', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-200 rounded-md" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">SGST</label>
                <input type="number" value={data.sgstRate} onChange={(e) => updateField('sgstRate', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-200 rounded-md" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">IGST</label>
                <input type="number" value={data.igstRate} onChange={(e) => updateField('igstRate', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-200 rounded-md" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Vendor Details (Your Info)</h3>
          <input type="text" placeholder="Vendor Name" value={data.vendorName} onChange={(e) => updateField('vendorName', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md font-medium" />
          <textarea placeholder="Vendor Address" value={data.vendorAddress} onChange={(e) => updateField('vendorAddress', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md h-20 text-sm" />
          <div className={`grid ${isGstRegistered ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
            {isGstRegistered && (
              <input type="text" placeholder="Vendor GSTIN" value={data.vendorGstin} onChange={(e) => handleVendorGstin(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
            )}
            <input type="text" placeholder="Vendor PAN" value={data.pan} onChange={(e) => updateField('pan', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Client Details (Billed To)</h3>
          <div className="relative">
            <input
              type="text"
              placeholder="Client Name"
              value={data.clientName}
              onFocus={() => setReceiverSearchFocused(true)}
              onBlur={() => setReceiverSearchFocused(false)}
              onChange={(e) => updateField('clientName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md font-medium"
              autoComplete="off"
            />
            {receiverSearchFocused && matchingReceivers.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Saved receivers</p>
                {matchingReceivers.map((receiver) => (
                  <button
                    key={[
                      receiver.clientName,
                      receiver.clientAddress,
                      receiver.clientEmail,
                      receiver.clientGstin,
                    ].join('|')}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectReceiver(receiver)}
                    className="block w-full border-t border-gray-100 px-3 py-2 text-left hover:bg-indigo-50"
                  >
                    <span className="block text-sm font-semibold text-gray-800">{receiver.clientName}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {receiver.clientAddress || receiver.clientGstin || 'Saved receiver'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea placeholder="Client Address" value={data.clientAddress} onChange={(e) => updateField('clientAddress', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md h-20 text-sm" />
          {isGstRegistered && (
            <>
              <input type="text" placeholder="Client GSTIN" value={data.clientGstin} onChange={(e) => handleClientGstin(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="State (e.g. Delhi)" value={data.clientState} onChange={(e) => updateField('clientState', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
                <input type="text" placeholder="State Code (e.g. 07)" value={data.clientStateCode} onChange={(e) => updateField('clientStateCode', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Bank Details</h3>
        <div className="grid grid-cols-3 gap-4">
          <input type="text" placeholder="Bank Name" value={data.bankName} onChange={(e) => updateField('bankName', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-md text-sm" />
          <input type="text" placeholder="Account No" value={data.bankAccount} onChange={(e) => updateField('bankAccount', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-md text-sm" />
          <input type="text" placeholder="IFSC Code" value={data.bankIfsc} onChange={(e) => updateField('bankIfsc', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-md text-sm" />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Items</h3>
        <div className="space-y-2 overflow-x-auto">
          {data.items.map((item) => (
            <div key={item.id} className="flex gap-2 items-end bg-gray-50 p-4 rounded-lg">
              <div className="flex-grow">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <input type="text" placeholder="Item description" value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
              </div>
              {isGstRegistered && (
                <div className="w-32">
                  <label className="block text-xs font-medium text-gray-500 mb-1">HSN Code</label>
                  <input type="text" placeholder="HSN" value={item.hsnCode} onChange={(e) => updateItem(item.id, { hsnCode: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
                </div>
              )}
              <div className="w-20">
                <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                <input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
              </div>
              <div className="w-20">
                <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                <input type="text" placeholder="Pcs/Set" value={item.unit || ''} onChange={(e) => updateItem(item.id, { unit: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-500 mb-1">Rate</label>
                <input type="number" placeholder="Rate" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
              </div>
              <button type="button" onClick={() => removeItem(item.id)} className="p-2 text-gray-400 hover:text-red-500 shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
          ))}
        </div>
        <button onClick={addItem} className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">Add Line Item</button>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Footnote / Declaration</label>
        <textarea value={data.notes} onChange={(e) => updateField('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md h-24 text-sm" />
      </div>
    </div>
  );
};

export default InvoiceForm;
