import React from 'react';
import { Printer, Download, MessageCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { amountInWordsINR, formatDateDDMMYYYY, formatINR } from '../utils/formatters';
import { buildWhatsAppReceiptUrl, downloadReceiptPDF } from '../utils/exports';
import { SHOP_CONFIG } from '../config/shopConfig';

export function ReceiptModal() {
  const { db, viewingPaymentId, setViewingPaymentId, t } = useApp();

  if (!viewingPaymentId) return null;
  const payment = db.payments.find((p) => p.id === viewingPaymentId);
  if (!payment) return null;

  const allocs = db.paymentAllocations.filter((a) => a.paymentId === payment.id);
  const party =
    payment.type === 'receipt'
      ? db.customers.find((c) => c.id === payment.partyId)
      : db.suppliers.find((s) => s.id === payment.partyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl overflow-hidden">
        <div className="no-print flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <span className="font-semibold text-slate-900 font-mono-num">{payment.receiptNumber}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.common.print}
            </button>
            <button
              type="button"
              onClick={() => downloadReceiptPDF(db.shop, payment)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
            >
              <Download className="w-3.5 h-3.5" />
              {t.common.exportPdf}
            </button>
            <a
              href={buildWhatsAppReceiptUrl(db.shop, payment, party?.mobile)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t.common.whatsapp}
            </a>
            <button
              type="button"
              onClick={() => setViewingPaymentId(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div id="print-invoice-area" className="p-6 space-y-4 text-sm text-slate-900">
          <div className="bg-[#F3F4F6] border border-slate-300 rounded-lg p-4">
            <div className="text-center text-xs font-semibold text-slate-700 mb-1">
              {SHOP_CONFIG.blessingLine}
            </div>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-[#15803D]">{db.shop.name}</h2>
                <p className="text-xs text-slate-700">{db.shop.address}</p>
                <p className="text-xs text-slate-700 font-mono-num">मो.: {db.shop.mobile}</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase text-[#15803D]">
                  {payment.type === 'receipt' ? 'Payment Receipt' : 'Payment Voucher'}
                </div>
                <div className="font-bold font-mono-num">{payment.receiptNumber}</div>
                <div className="text-xs text-slate-700 font-mono-num">
                  Date: {formatDateDDMMYYYY(payment.date)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 py-2">
            <div className="flex justify-between">
              <span className="text-slate-500">
                {payment.type === 'receipt' ? 'Received From:' : 'Paid To:'}
              </span>
              <span className="font-semibold">{payment.partyNameSnapshot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="text-lg font-bold font-mono-num text-emerald-800">
                {formatINR(payment.amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">In Words:</span>
              <span className="text-right font-medium">{amountInWordsINR(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Mode:</span>
              <span className="font-mono-num">
                {payment.mode}
                {payment.referenceNo ? ` · Ref: ${payment.referenceNo}` : ''}
              </span>
            </div>
            {payment.notes && (
              <div className="flex justify-between">
                <span className="text-slate-500">Notes:</span>
                <span>{payment.notes}</span>
              </div>
            )}
          </div>

          {allocs.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-slate-600 mb-2">Settled Against:</div>
              <div className="space-y-1 text-xs font-mono-num">
                {allocs.map((a) => {
                  const docNo =
                    a.targetType === 'bill'
                      ? db.bills.find((b) => b.id === a.targetId)?.billNumber
                      : db.purchases.find((p) => p.id === a.targetId)?.supplierInvoiceNo;
                  return (
                    <div key={a.id} className="flex justify-between">
                      <span>{docNo || a.targetId}</span>
                      <span>{formatINR(a.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-8 flex justify-between text-xs text-slate-500">
            <span>Receiver Signature</span>
            <span>Authorized Signatory</span>
          </div>
        </div>
      </div>
    </div>
  );
}
