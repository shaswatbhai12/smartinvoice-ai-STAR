
import React from 'react';
import { InvoiceData } from '../types';
import { numberToWords } from '../utils/numberToWords';

interface InvoicePreviewProps {
  data: InvoiceData;
}

const InvoicePreview: React.FC<InvoicePreviewProps> = ({ data }) => {
  const isGstRegistered = data.isGstRegistered ?? true;
  const subtotal = data.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const cgstAmount = isGstRegistered ? (subtotal * data.cgstRate) / 100 : 0;
  const sgstAmount = isGstRegistered ? (subtotal * data.sgstRate) / 100 : 0;
  const igstAmount = isGstRegistered ? (subtotal * data.igstRate) / 100 : 0;
  const total = subtotal + cgstAmount + sgstAmount + igstAmount;
  const roundedTotal = Math.round(total);
  const roundOff = roundedTotal - total;

  const currencySymbol = data.currency === 'USD' ? '$' : '₹';
  const formatCurrency = (val: number) =>
    currencySymbol + new Intl.NumberFormat(data.currency === 'USD' ? 'en-US' : 'en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

  const formatDate = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  };

  return (
    <div className="bg-white text-black font-sans text-[11px] leading-snug flex flex-col border border-black" style={{minHeight: '267mm'}} id="printable-invoice">

      {/* Row 1: GSTIN + Tax Invoice */}
      <div className="relative flex justify-between items-center px-3 py-1.5 border-b border-black">
        <span className="font-bold text-[12px]">{isGstRegistered ? `GSTIN - ${data.vendorGstin}` : ''}</span>
        <span className="text-blue-600 font-bold text-[16px] absolute left-1/2 -translate-x-1/2">{isGstRegistered ? 'Tax Invoice' : 'Invoice'}</span>
        <span></span>
      </div>

      {/* Row 2: Vendor Name + Address */}
      <div className="grid grid-cols-[1.2fr_1fr] border-b border-black">
        <div className="px-3 py-2 border-r border-black">
          <h1 className="text-red-600 font-black text-[18px] leading-tight whitespace-nowrap">{data.vendorName}</h1>
          {data.dealsIn && <p className="text-[11px] mt-1">Deals in: {data.dealsIn}</p>}
        </div>
        <div className="px-3 py-2 flex flex-col justify-center space-y-1">
          <p className="font-bold text-[11px]" style={{ marginLeft: '10px' }}>{data.vendorAddress}</p>
          <p className="font-bold text-[11px]" style={{ marginLeft: '10px' }}>Ph. No. – {data.vendorPhone}</p>
          <p className="font-bold text-[11px]" style={{ marginLeft: '10px' }}>Email- <span className="text-blue-600 underline">{data.vendorEmail}</span></p>
        </div>
      </div>

      {/* Row 3: Billed To header + Tax reverse charge */}
      <div className="grid grid-cols-[1.2fr_1fr] border-b border-black">
        <div className="px-3 py-1.5 border-r border-black font-bold text-[15px] text-center">
          Details of receiver (Billed To)
        </div>
        {isGstRegistered ? (
          <div className="px-3 py-1.5 font-bold text-[11px]">
            Tax is payable on reverse charge &nbsp;&nbsp; Yes... &nbsp; No....
          </div>
        ) : (
          <div className="px-3 py-1.5 font-bold text-[11px]">
            Non-GST invoice
          </div>
        )}
      </div>

      {/* Row 4: Client details + Invoice meta */}
      <div className="grid grid-cols-[1.2fr_1fr] border-b border-black">
        <div className="border-r border-black">
          {/* Company + Address */}
          <div className="px-3 py-2 space-y-2 border-b border-black">
            <div className="flex gap-2">
              <span className="font-bold text-[13px] w-28 shrink-0">Company Name</span>
              <span className="text-[18px] border-b border-dotted border-black flex-grow ">{data.clientName}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-[13px] w-28 shrink-0">Address</span>
              <span className="text-[16px] border-b border-dotted border-black flex-grow min-h-[18px]">{data.clientAddress}</span>
            </div>
          </div>
          {isGstRegistered && (
            <>
              {/* GSTIN row */}
              <div className="flex gap-2 px-3 py-1 border-b border-black">
                <span className="font-bold text-[11px] shrink-0">GSTIN -</span>
                <span className="text-[15px] border-b border-dotted border-black flex-grow">{data.clientGstin}</span>
              </div>
              {/* State + State Code row */}
              <div className="flex px-3 py-1">
                <div className="flex gap-2 flex-1 border-r border-black pr-3">
                  <span className="font-bold text-[11px] shrink-0">State -</span>
                  <span className="text-[15px] border-b border-dotted border-black flex-grow">{data.clientState}</span>
                </div>
                <div className="flex gap-2 flex-1 pl-3">
                  <span className="font-bold text-[11px] shrink-0">State Code -</span>
                  <span className="text-[15px] border-b border-dotted border-black flex-grow">{data.clientStateCode}</span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="pr-4 py-2 text-[11px] flex flex-col justify-center gap-1" style={{ paddingLeft: '24px' }}>
          <div className="flex gap-2 leading-tight" style={{ marginLeft: '10px' }}><span className="font-bold w-36 shrink-0">INVOICE SERIAL NO.</span><span className="text-[13px]">- {data.invoiceNumber}</span></div>
          <div className="flex gap-2 leading-tight" style={{ marginLeft: '10px' }}><span className="font-bold w-36 shrink-0">INVOICE DATE</span><span className="text-[13px]">- {formatDate(data.date)}</span></div>
          <div className="flex gap-2 leading-tight" style={{ marginLeft: '10px' }}><span className="font-bold w-36 shrink-0">Transportation mode</span><span>- {data.transportMode}</span></div>
          <div className="flex gap-2 leading-tight" style={{ marginLeft: '10px' }}><span className="font-bold w-36 shrink-0">GR/RR/PR No.</span><span className="border-b border-dotted border-black flex-grow">{data.grrrpr}</span></div>
          <div className="flex gap-2 leading-tight" style={{ marginLeft: '10px' }}><span className="font-bold w-36 shrink-0">Date of Supply</span><span className="border-b border-dotted border-black flex-grow"></span></div>
          <div className="flex gap-2 leading-tight" style={{ marginLeft: '10px' }}><span className="font-bold w-36 shrink-0">Place of Supply.</span><span></span></div>
        </div>
      </div>

      {/* Items Table - grows to fill space */}
      <div className="items-wrapper" style={{flex: '1 1 auto', display: 'flex', flexDirection: 'column', borderBottom: '1px solid black'}}>
        <table className="invoice-items-table w-full text-center border-collapse table-fixed">
          <colgroup>
            <col className="invoice-col-sno" style={{ width: isGstRegistered ? '7%' : '8%' }} />
            <col className="invoice-col-description" style={{ width: isGstRegistered ? '34%' : '45%' }} />
            {isGstRegistered && <col className="invoice-col-hsn" style={{ width: '14%' }} />}
            <col className="invoice-col-qty" style={{ width: isGstRegistered ? '8%' : '10%' }} />
            <col className="invoice-col-rate" style={{ width: isGstRegistered ? '17%' : '18%' }} />
            <col className="invoice-col-amount" style={{ width: isGstRegistered ? '20%' : '19%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-black py-2 w-14 font-bold uppercase text-[11px]">S No.</th>
              <th className="invoice-description-header border-r border-black py-2 text-left px-3 font-bold uppercase text-[11px]">DESCRIPTION OF GOODS</th>
              {isGstRegistered && <th className="invoice-hsn-header border-r border-black py-2 w-20 font-bold uppercase text-[11px]">HSN CODE</th>}
              <th className="border-r border-black py-2 w-16 font-bold uppercase text-[11px]">QTY.</th>
              <th className="border-r border-black py-2 w-24 font-bold uppercase text-[11px]">RATE</th>
              <th className="py-2 w-28 font-bold uppercase text-[11px]">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="border-r border-black py-2 align-top">{index + 1}</td>
                <td className="invoice-description-cell border-r border-black py-2 text-left px-3 align-top font-medium">{item.description}</td>
                {isGstRegistered && <td className="invoice-hsn-cell border-r border-black py-2 px-2 align-top">{item.hsnCode}</td>}
                <td className="border-r border-black py-2 align-top">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                <td className="border-r border-black py-2 align-top">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-right pr-3 font-bold align-top">{formatCurrency(item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Spacer with column lines to fill empty space */}
        <div className={`items-spacer invoice-items-spacer ${isGstRegistered ? 'invoice-items-spacer-gst' : 'invoice-items-spacer-non-gst'}`} style={{flex: '1 1 auto', minHeight: '20px', minWidth: '0', display: 'grid', gridTemplateColumns: isGstRegistered ? '7% 34% 14% 8% 17% 20%' : '8% 45% 10% 18% 19%'}}>
          <div className="border-r border-black"></div>
          <div className="border-r border-black"></div>
          {isGstRegistered && <div className="border-r border-black"></div>}
          <div className="border-r border-black"></div>
          <div className="border-r border-black"></div>
          <div></div>
        </div>
        {/* TOTAL */}
        <table className="w-full text-center border-collapse table-fixed border-t border-black">
          <tbody>
            <tr className="font-bold">
              <td className="border-r border-black w-14"></td>
              <td className="border-r border-black text-left px-3 py-1">TOTAL</td>
              {isGstRegistered && <td className="border-r border-black w-20"></td>}
              <td className="border-r border-black w-16"></td>
              <td className="border-r border-black w-24"></td>
              <td className="py-1 text-right pr-3 w-28">{formatCurrency(subtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Row: Bank Details + Tax breakdown */}
      <div className={`${isGstRegistered ? 'grid grid-cols-[1.2fr_1fr]' : 'block'} border-t border-black`}>
        <div className={`px-3 py-2 space-y-0.5 text-[11px] ${isGstRegistered ? 'border-r border-black' : ''}`}>
          <p className="font-bold">PAN {data.pan}</p>
          <p className="font-bold">BANK DETAIL – {data.bankName}</p>
          <p className="font-bold">CURRENT A/C NO. {data.bankAccount}</p>
          <p className="font-bold">IFSC CODE- {data.bankIfsc}</p>
        </div>
        {isGstRegistered && (
          <div className="divide-y divide-black text-[11px] font-bold">
            <div className="px-3 py-1 flex justify-between"><span>CGST. = {data.cgstRate}%</span><span>{formatCurrency(cgstAmount)}</span></div>
            <div className="px-3 py-1 flex justify-between"><span>SGST = {data.sgstRate}%</span><span>{formatCurrency(sgstAmount)}</span></div>
            <div className="px-3 py-1 flex justify-between"><span>IGST. = {data.igstRate}%</span><span>{formatCurrency(igstAmount)}</span></div>
            <div className="px-3 py-1 flex justify-between font-normal italic"><span>Round off</span><span>{formatCurrency(roundOff)}</span></div>
          </div>
        )}
      </div>

      {/* Row: Amount in words + Grand Total */}
      <div className="grid grid-cols-[1.2fr_1fr] border-t border-black">
        <div className="px-3 py-2 border-r border-black">
          <p className="font-bold text-[13px] underline mb-1">Amount in words</p>
          <p className="font-bold text-[12px]">{numberToWords(roundedTotal)}</p>
        </div>
        <div className="px-3 py-2 flex items-center">
          <span className="font-black text-[15px] uppercase">Grand total =</span>
          <span className="font-black text-[15px] uppercase ml-auto text-right">{formatCurrency(roundedTotal)}</span>
        </div>
      </div>

      {/* Row: Declaration + Signature */}
      <div className="grid grid-cols-[1fr_1.4fr] border-t border-black divide-x divide-black">
        <div className="px-3 py-2 space-y-1 font-bold text-[11px]">
          <p>E.&amp;O. E</p>
          {data.notes.split('\n').filter(s => s.trim()).map((line, i) => (
            <p key={i}>{line.trim()}</p>
          ))}
        </div>
        <div className="px-3 py-2 text-center flex flex-col justify-between min-h-[80px]">
          <p className="text-[10px] uppercase font-bold">CERTIFIED THAT THE PARTICULARS GIVEN ABOVE ARE TRUE AND CORRECT</p>
          <div className="w-full mt-2">
            <p className="text-red-600 font-black uppercase text-[13px] mb-6">FOR {data.vendorName}</p>
            <div className="h-6 border-b border-dotted border-black w-2/3 mx-auto mb-1"></div>
            <p className="font-bold text-[12px]">Authorised Signatory</p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default InvoicePreview;
