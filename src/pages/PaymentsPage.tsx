import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Download, Receipt, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ReceiptPaymentMode } from '../types/models';
import { round2 } from '../utils/calculations';
import { formatDateDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { exportToCSV } from '../utils/exports';

export function PaymentsPage() {
  const {
    db,
    createPayment,
    setViewingPaymentId,
    paymentIntent,
    clearPaymentIntent,
    showToast,
    t,
  } = useApp();

  const [filterType, setFilterType] = useState<'ALL' | 'receipt' | 'payout'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [payType, setPayType] = useState<'receipt' | 'payout'>('receipt');
  const [partyId, setPartyId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<ReceiptPaymentMode>('Cash');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [allocMap, setAllocMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (paymentIntent) {
      setPayType(paymentIntent.type);
      setPartyId(paymentIntent.partyId);
      setDate(todayISO());
      setAmount('');
      setMode('Cash');
      setRefNo('');
      setNotes('');
      setAllocMap({});
      setShowForm(true);
      clearPaymentIntent();
    }
  }, [paymentIntent, clearPaymentIntent]);

  const openNewPayment = (type: 'receipt' | 'payout') => {
    setPayType(type);
    const firstParty = type === 'receipt' ? db.customers[0]?.id || '' : db.suppliers[0]?.id || '';
    setPartyId(firstParty);
    setDate(todayISO());
    setAmount('');
    setMode('Cash');
    setRefNo('');
    setNotes('');
    setAllocMap({});
    setShowForm(true);
  };

  const unpaidDocs = useMemo(() => {
    if (!partyId) return [];
    if (payType === 'receipt') {
      return db.bills
        .filter(
          (b) =>
            b.customerId === partyId &&
            b.status !== 'Cancelled' &&
            b.status !== 'Paid' &&
            b.balanceDue > 0
        )
        .map((b) => ({
          id: b.id,
          targetType: 'bill' as const,
          number: b.billNumber,
          date: b.date,
          total: b.grandTotal,
          due: b.balanceDue,
        }));
    } else {
      return db.purchases
        .filter((p) => p.supplierId === partyId && p.status !== 'Paid' && p.balanceDue > 0)
        .map((p) => ({
          id: p.id,
          targetType: 'purchase' as const,
          number: p.supplierInvoiceNo || p.purchaseNumber,
          date: p.date,
          total: p.grandTotal,
          due: p.balanceDue,
        }));
    }
  }, [payType, partyId, db.bills, db.purchases]);

  const autoAllocate = (totalAmt: number) => {
    let remaining = totalAmt;
    const next: Record<string, number> = {};
    // Oldest unpaid first
    const sorted = [...unpaidDocs].sort((a, b) => a.date.localeCompare(b.date));
    for (const doc of sorted) {
      if (remaining <= 0) break;
      const take = round2(Math.min(doc.due, remaining));
      if (take > 0) {
        next[doc.id] = take;
        remaining = round2(remaining - take);
      }
    }
    setAllocMap(next);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = Number(amount) || 0;
    const allocations = Object.entries(allocMap)
      .filter(([, val]) => val > 0)
      .map(([targetId, val]) => ({
        targetType: (payType === 'receipt' ? 'bill' : 'purchase') as 'bill' | 'purchase',
        targetId,
        amount: val,
      }));

    const res = createPayment({
      type: payType,
      partyId,
      date,
      amount: amtNum,
      mode,
      referenceNo: refNo,
      notes,
      allocations,
    });

    if (!res.ok) {
      showToast('error', res.error || 'Could not record payment');
      return;
    }

    showToast('success', `Recorded ${res.payment?.receiptNumber}`);
    setShowForm(false);
    if (res.payment) setViewingPaymentId(res.payment.id);
  };

  const filteredPayments = useMemo(() => {
    return db.payments.filter((p) => filterType === 'ALL' || p.type === filterType);
  }, [db.payments, filterType]);

  const handleExport = () => {
    exportToCSV(
      `payments_${todayISO()}`,
      ['Receipt No', 'Date', 'Type', 'Party', 'Mode', 'Ref/UTR', 'Amount'],
      filteredPayments.map((p) => [
        p.receiptNumber,
        formatDateDDMMYYYY(p.date),
        p.type === 'receipt' ? 'Customer Receipt' : 'Supplier Payment',
        p.partyNameSnapshot,
        p.mode,
        p.referenceNo || '',
        p.amount,
      ])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">{t.payments.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            {t.common.exportCsv}
          </button>
          <button
            type="button"
            onClick={() => openNewPayment('payout')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50"
          >
            <Plus className="w-4 h-4" />
            {t.payments.payToSupplier}
          </button>
          <button
            type="button"
            onClick={() => openNewPayment('receipt')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
          >
            <Plus className="w-4 h-4" />
            {t.payments.receiveFromCustomer}
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-200/70 p-1 rounded-lg w-fit">
        {(
          [
            ['ALL', t.common.all],
            ['receipt', 'Receipts (In)'],
            ['payout', 'Payouts (Out)'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilterType(val)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              filterType === val ? 'bg-white text-slate-900' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{t.common.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">{t.payments.receiptNo}</th>
                  <th className="py-2.5 px-4 text-left">{t.common.date}</th>
                  <th className="py-2.5 px-4 text-left">{t.payments.party}</th>
                  <th className="py-2.5 px-4 text-left">{t.common.mode} / Ref</th>
                  <th className="py-2.5 px-4 text-right">{t.common.amount}</th>
                  <th className="py-2.5 px-4 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono-num font-semibold text-slate-900">
                      {p.receiptNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                      {formatDateDDMMYYYY(p.date)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{p.partyNameSnapshot}</div>
                      <div className="text-xs text-slate-500">
                        {p.type === 'receipt' ? 'Received from Customer' : 'Paid to Supplier'}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 font-mono-num">
                      {p.mode}
                      {p.referenceNo ? ` · ${p.referenceNo}` : ''}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono-num font-bold ${
                        p.type === 'receipt' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {formatINR(p.amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setViewingPaymentId(p.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        {t.payments.viewReceipt}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {payType === 'receipt' ? t.payments.receiveFromCustomer : t.payments.payToSupplier}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.payments.party} *
                </label>
                <select
                  required
                  value={partyId}
                  onChange={(e) => {
                    setPartyId(e.target.value);
                    setAllocMap({});
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select...</option>
                  {payType === 'receipt'
                    ? db.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.mobile})
                        </option>
                      ))
                    : db.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.mobile})
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.common.date}
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.common.amount} (₹) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                  {unpaidDocs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => autoAllocate(Number(amount) || 0)}
                      className="px-2.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                    >
                      Auto-Match
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.common.mode}
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ReceiptPaymentMode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.payments.refNo}
                </label>
                <input
                  type="text"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  placeholder="UTR / Cheque / Txn ID"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.common.notes}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Unpaid Bill Allocation */}
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                {t.payments.settleBills}
              </div>
              {unpaidDocs.length === 0 ? (
                <p className="text-xs text-slate-500">{t.payments.onAccount}</p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {unpaidDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 text-xs"
                    >
                      <div>
                        <div className="font-mono-num font-semibold text-slate-900">
                          {doc.number}
                        </div>
                        <div className="text-slate-500 font-mono-num">
                          {formatDateDDMMYYYY(doc.date)} · Due: {formatINR(doc.due)}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={doc.due}
                        step="any"
                        value={allocMap[doc.id] || ''}
                        onChange={(e) =>
                          setAllocMap((prev) => ({
                            ...prev,
                            [doc.id]: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="0.00"
                        className="w-28 px-2 py-1.5 text-right border border-slate-300 rounded-md font-mono-num"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
