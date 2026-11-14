import React, { useState } from 'react';
import { Printer, Download, MessageCircle, X, Ban, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { InvoiceTemplateType } from '../types/models';
import { amountInWordsINR, formatDateDDMMYYYY, formatINR } from '../utils/formatters';
import { buildWhatsAppBillUrl, downloadBillPDF } from '../utils/exports';

import { SHOP_CONFIG } from '../config/shopConfig';

export function InvoiceModal() {
  const {
    db,
    viewingBillId,
    setViewingBillId,
    isOwner,
    cancelBill,
    showToast,
    t,
  } = useApp();

  const [template, setTemplate] = useState<InvoiceTemplateType>(db.settings.invoiceTemplate || 'a4');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (!viewingBillId) return null;

  const bill = db.bills.find((b) => b.id === viewingBillId);
  if (!bill) return null;
  const lines = db.billLines.filter((l) => l.billId === bill.id);
  const { shop } = db;

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = cancelBill(bill.id, cancelReason || 'Cancelled by owner');
    if (res.ok) {
      showToast('warning', `Bill ${bill.billNumber} cancelled & stock restored.`);
      setShowCancelForm(false);
      setCancelReason('');
    } else {
      showToast('error', res.error || 'Could not cancel bill');
    }
  };

  const thermalClass =
    template === 'thermal58'
      ? 'thermal-58 max-w-[260px] mx-auto text-[11px]'
      : template === 'thermal80'
      ? 'thermal-80 max-w-[340px] mx-auto text-xs'
      : 'w-full text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-[#F3F4F6]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 font-mono-num">{bill.billNumber}</span>
            <span className="text-slate-300">·</span>
            <span
              className={`text-xs font-medium ${
                bill.status === 'Paid'
                  ? 'text-[#15803D]'
                  : bill.status === 'Cancelled'
                  ? 'text-red-600'
                  : 'text-amber-700'
              }`}
            >
              {bill.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg">
              {(['a4', 'thermal80', 'thermal58'] as InvoiceTemplateType[]).map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => setTemplate(tpl)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    template === tpl ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tpl === 'a4' ? 'A4 GST' : tpl === 'thermal80' ? '80mm' : '58mm'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.common.print}
            </button>

            <button
              type="button"
              onClick={() => downloadBillPDF(shop, bill, lines)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {t.common.exportPdf}
            </button>

            <a
              href={buildWhatsAppBillUrl(shop, bill, lines)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t.common.whatsapp}
            </a>

            {isOwner && bill.status !== 'Cancelled' && (
              <button
                type="button"
                onClick={() => setShowCancelForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 whitespace-nowrap"
              >
                <Ban className="w-3.5 h-3.5" />
                {t.billing.cancelBill}
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewingBillId(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cancel Bill confirmation form */}
        {showCancelForm && (
          <form
            onSubmit={handleCancelSubmit}
            className="no-print bg-red-50 border-b border-red-200 px-4 py-3 flex flex-wrap items-center gap-3"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <input
              type="text"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t.billing.cancelReasonPrompt}
              className="flex-1 min-w-[220px] px-3 py-1.5 text-sm border border-red-300 rounded-lg bg-white"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
            >
              {t.common.confirm}
            </button>
            <button
              type="button"
              onClick={() => setShowCancelForm(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium"
            >
              {t.common.close}
            </button>
          </form>
        )}

        {/* Printable Invoice Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/60">
          <div
            id="print-invoice-area"
            className={`${thermalClass} bg-white border border-slate-200 p-4 sm:p-6 text-slate-900`}
          >
            {bill.status === 'Cancelled' && (
              <div className="mb-3 p-2 border border-red-300 bg-red-50 text-red-700 text-center font-semibold text-xs">
                {t.billing.cancelledTag} — {bill.cancelReason}
              </div>
            )}

            {template === 'a4' ? (
              <>
                {/* A4 Grey Header Band matching printed bill */}
                <div className="bg-[#F3F4F6] border border-slate-300 rounded-lg p-4 mb-4">
                  <div className="text-center text-xs font-semibold text-slate-700 mb-1">
                    {SHOP_CONFIG.blessingLine}
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {shop.logoDataUrl && (
                        <img
                          src={shop.logoDataUrl}
                          alt={shop.name}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 object-contain border border-slate-200 rounded-lg bg-white"
                        />
                      )}
                      <div>
                        <h2 className="text-xl font-extrabold text-[#15803D]">{shop.name}</h2>
                        <p className="text-xs text-slate-800 font-medium">{SHOP_CONFIG.tagline}</p>
                        <p className="text-xs text-slate-700 mt-1">{shop.address}</p>
                        <p className="text-xs text-slate-700 mt-0.5 font-mono-num">
                          मो.: {shop.mobile}
                          {shop.gstin && ` · GSTIN: ${shop.gstin}`}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {[
                            shop.fertilizerLicense && `खत परवाना क्र.: ${shop.fertilizerLicense}`,
                            shop.seedLicense && `Seed: ${shop.seedLicense}`,
                            shop.pesticideLicense && `Pest: ${shop.pesticideLicense}`,
                            SHOP_CONFIG.jurisdiction,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <div className="text-xs font-bold tracking-wide text-[#15803D] uppercase">
                        Tax Invoice
                      </div>
                      <div className="text-base font-bold font-mono-num mt-0.5">{bill.billNumber}</div>
                      <div className="text-xs text-slate-700 mt-0.5">
                        Date: <span className="font-mono-num">{formatDateDDMMYYYY(bill.date)}</span>
                      </div>
                      <div className="text-xs text-slate-700">
                        {bill.paymentMode} · {bill.status}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bill To */}
                <div className="py-3 border-b border-slate-200 flex flex-wrap justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Customer: </span>
                    <span className="font-semibold text-slate-900">{bill.customerNameSnapshot}</span>
                    {bill.customerVillageSnapshot && (
                      <span className="text-slate-600"> · {bill.customerVillageSnapshot}</span>
                    )}
                  </div>
                  <div className="text-slate-600 font-mono-num">
                    {bill.customerMobileSnapshot && `Ph: ${bill.customerMobileSnapshot}`}
                    {bill.customerGstinSnapshot && ` · GSTIN: ${bill.customerGstinSnapshot}`}
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-50 text-slate-700">
                        <th className="py-2 px-2 text-left">#</th>
                        <th className="py-2 px-2 text-left">Item & Batch</th>
                        <th className="py-2 px-2 text-left">HSN</th>
                        <th className="py-2 px-2 text-right">Qty</th>
                        <th className="py-2 px-2 text-right">Rate</th>
                        <th className="py-2 px-2 text-right">Disc</th>
                        <th className="py-2 px-2 text-right">Taxable</th>
                        <th className="py-2 px-2 text-right">GST</th>
                        <th className="py-2 px-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => (
                        <tr key={l.id} className="border-b border-slate-100">
                          <td className="py-2 px-2 font-mono-num text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <div className="font-medium text-slate-900">{l.itemName}</div>
                            <div className="text-[11px] text-slate-500 font-mono-num">
                              Batch: {l.batchNumber}
                            </div>
                          </td>
                          <td className="py-2 px-2 font-mono-num text-slate-600">{l.hsnCode || '-'}</td>
                          <td className="py-2 px-2 text-right font-mono-num">
                            {l.qty} {l.unit}
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num">{formatINR(l.rate)}</td>
                          <td className="py-2 px-2 text-right font-mono-num text-slate-600">
                            {l.discountAmount > 0 ? formatINR(l.discountAmount) : '-'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num">{formatINR(l.taxableValue)}</td>
                          <td className="py-2 px-2 text-right font-mono-num text-slate-600">
                            {l.gstRate}% ({formatINR(l.cgstAmount + l.sgstAmount + l.igstAmount)})
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num font-semibold">
                            {formatINR(l.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Footer */}
                <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="font-medium text-slate-700">Amount in Words:</div>
                    <div className="text-slate-900 font-semibold mt-0.5">
                      {amountInWordsINR(bill.grandTotal)}
                    </div>
                    {shop.bankDetails && (
                      <div className="text-slate-500 mt-2">Bank: {shop.bankDetails}</div>
                    )}
                    <div className="text-slate-500 mt-2">{shop.termsAndConditions}</div>
                  </div>
                  <div className="space-y-1 sm:text-right font-mono-num">
                    <div className="flex justify-between sm:justify-end gap-6">
                      <span className="text-slate-600">Taxable Value:</span>
                      <span>{formatINR(bill.taxableTotal)}</span>
                    </div>
                    {bill.supplyType === 'inter' ? (
                      <div className="flex justify-between sm:justify-end gap-6">
                        <span className="text-slate-600">IGST:</span>
                        <span>{formatINR(bill.igstTotal)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between sm:justify-end gap-6">
                          <span className="text-slate-600">CGST:</span>
                          <span>{formatINR(bill.cgstTotal)}</span>
                        </div>
                        <div className="flex justify-between sm:justify-end gap-6">
                          <span className="text-slate-600">SGST:</span>
                          <span>{formatINR(bill.sgstTotal)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between sm:justify-end gap-6">
                      <span className="text-slate-600">Round Off:</span>
                      <span>{formatINR(bill.roundOff)}</span>
                    </div>
                    <div className="flex justify-between sm:justify-end gap-6 text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                      <span>Grand Total:</span>
                      <span>{formatINR(bill.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between sm:justify-end gap-6 text-emerald-700">
                      <span>Paid:</span>
                      <span>{formatINR(bill.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between sm:justify-end gap-6 text-amber-700 font-semibold">
                      <span>Balance Due:</span>
                      <span>{formatINR(bill.balanceDue)}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* 58mm / 80mm Thermal Layout */
              <div className="space-y-2 font-mono-num">
                <div className="text-center border-b border-dashed border-slate-400 pb-2 bg-[#F3F4F6] p-2 rounded">
                  <div className="text-[10px]">{SHOP_CONFIG.blessingLine}</div>
                  <div className="font-bold text-sm text-[#15803D]">{shop.name}</div>
                  <div>{shop.address}</div>
                  <div>Ph: {shop.mobile}</div>
                  {shop.gstin && <div>GSTIN: {shop.gstin}</div>}
                </div>
                <div className="border-b border-dashed border-slate-400 pb-1.5">
                  <div>Bill: {bill.billNumber}</div>
                  <div>Date: {formatDateDDMMYYYY(bill.date)}</div>
                  <div>Cust: {bill.customerNameSnapshot}</div>
                  <div>Mode: {bill.paymentMode}</div>
                </div>
                <div className="border-b border-dashed border-slate-400 pb-1.5 space-y-1">
                  {lines.map((l) => (
                    <div key={l.id}>
                      <div className="font-medium">{l.itemName}</div>
                      <div className="flex justify-between">
                        <span>
                          {l.qty} {l.unit} x {l.rate}
                        </span>
                        <span>{formatINR(l.lineTotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span>Taxable:</span>
                    <span>{formatINR(bill.taxableTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST:</span>
                    <span>{formatINR(bill.cgstTotal + bill.sgstTotal + bill.igstTotal)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-slate-400">
                    <span>TOTAL:</span>
                    <span>{formatINR(bill.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paid:</span>
                    <span>{formatINR(bill.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Due:</span>
                    <span>{formatINR(bill.balanceDue)}</span>
                  </div>
                </div>
                <div className="text-center pt-2 border-t border-dashed border-slate-400">
                  <div>{SHOP_CONFIG.jurisdiction}</div>
                  <div>Thank you! Visit again.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
