import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Download, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GstRate, ReceiptPaymentMode } from '../types/models';
import { round2 } from '../utils/calculations';
import { formatDateDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { exportToCSV } from '../utils/exports';

interface DraftPurchaseRow {
  key: string;
  itemId: string;
  godownId: string;
  batchNumber: string;
  lotNumber: string;
  mfgDate: string;
  expiryDate: string;
  qty: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstRate: GstRate;
}

export function PurchasesPage() {
  const {
    db,
    createPurchase,
    purchasePreselectItemId,
    clearPurchasePreselectItem,
    showToast,
    t,
  } = useApp();
  const [showForm, setShowForm] = useState(false);

  const [supplierId, setSupplierId] = useState(db.suppliers[0]?.id || '');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [paidNow, setPaidNow] = useState('0');
  const [payMode, setPayMode] = useState<ReceiptPaymentMode>('Bank');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<DraftPurchaseRow[]>([]);

  useEffect(() => {
    if (!purchasePreselectItemId) return;
    const targetItem = db.items.find((i) => i.id === purchasePreselectItemId);
    if (targetItem) {
      setSupplierId(db.suppliers[0]?.id || '');
      setSupplierInvoiceNo('');
      setDate(todayISO());
      setPaidNow('0');
      setNotes('');
      setRows([
        {
          key: `pr_${Date.now()}`,
          itemId: targetItem.id,
          godownId: targetItem.defaultGodownId,
          batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
          lotNumber: '',
          mfgDate: '',
          expiryDate: '',
          qty: Math.max(10, targetItem.minStockLevel),
          purchasePrice: targetItem.purchasePrice,
          sellingPrice: targetItem.sellingPrice,
          mrp: targetItem.mrp,
          gstRate: targetItem.gstRate,
        },
      ]);
      setShowForm(true);
    }
    clearPurchasePreselectItem();
  }, [purchasePreselectItemId, db.items, db.suppliers, clearPurchasePreselectItem]);

  const openNewPurchase = () => {
    setSupplierId(db.suppliers[0]?.id || '');
    setSupplierInvoiceNo('');
    setDate(todayISO());
    setPaidNow('0');
    setNotes('');
    const firstItem = db.items[0];
    setRows(
      firstItem
        ? [
            {
              key: `pr_${Date.now()}`,
              itemId: firstItem.id,
              godownId: firstItem.defaultGodownId,
              batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
              lotNumber: '',
              mfgDate: '',
              expiryDate: '',
              qty: 10,
              purchasePrice: firstItem.purchasePrice,
              sellingPrice: firstItem.sellingPrice,
              mrp: firstItem.mrp,
              gstRate: firstItem.gstRate,
            },
          ]
        : []
    );
    setShowForm(true);
  };

  const addRow = () => {
    const firstItem = db.items[0];
    if (!firstItem) return;
    setRows((prev) => [
      ...prev,
      {
        key: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        itemId: firstItem.id,
        godownId: firstItem.defaultGodownId,
        batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
        lotNumber: '',
        mfgDate: '',
        expiryDate: '',
        qty: 1,
        purchasePrice: firstItem.purchasePrice,
        sellingPrice: firstItem.sellingPrice,
        mrp: firstItem.mrp,
        gstRate: firstItem.gstRate,
      },
    ]);
  };

  const totals = rows.reduce(
    (acc, r) => {
      const sub = round2(r.qty * r.purchasePrice);
      const gst = round2((sub * r.gstRate) / 100);
      acc.sub += sub;
      acc.gst += gst;
      acc.grand = Math.round(acc.sub + acc.gst);
      return acc;
    },
    { sub: 0, gst: 0, grand: 0 }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createPurchase({
      supplierId,
      supplierInvoiceNo,
      date,
      paidAmountNow: Number(paidNow) || 0,
      paymentMode: payMode,
      notes,
      lines: rows.map((r) => ({
        itemId: r.itemId,
        godownId: r.godownId,
        batchNumber: r.batchNumber,
        lotNumber: r.lotNumber,
        mfgDate: r.mfgDate,
        expiryDate: r.expiryDate,
        qty: r.qty,
        purchasePrice: r.purchasePrice,
        sellingPrice: r.sellingPrice,
        mrp: r.mrp,
        gstRate: r.gstRate,
      })),
    });

    if (!res.ok) {
      showToast('error', res.error || 'Could not save purchase');
      return;
    }
    showToast('success', `Purchase ${supplierInvoiceNo} saved & stock updated!`);
    setShowForm(false);
  };

  const handleExport = () => {
    exportToCSV(
      `purchases_${todayISO()}`,
      ['Purchase No', 'Date', 'Supplier', 'Invoice No', 'Subtotal', 'GST', 'Grand Total', 'Paid', 'Due', 'Status'],
      db.purchases.map((p) => [
        p.purchaseNumber,
        formatDateDDMMYYYY(p.date),
        p.supplierNameSnapshot,
        p.supplierInvoiceNo,
        p.subtotal,
        p.gstTotal,
        p.grandTotal,
        p.paidAmount,
        p.balanceDue,
        p.status,
      ])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">{t.purchases.title}</h1>
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
            onClick={openNewPurchase}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
          >
            <Plus className="w-4 h-4" />
            {t.purchases.newPurchase}
          </button>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {db.purchases.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{t.common.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Ref No</th>
                  <th className="py-2.5 px-4 text-left">Date</th>
                  <th className="py-2.5 px-4 text-left">{t.purchases.supplier}</th>
                  <th className="py-2.5 px-4 text-left">{t.purchases.supplierInvNo}</th>
                  <th className="py-2.5 px-4 text-left">{t.common.status}</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                      {p.purchaseNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                      {formatDateDDMMYYYY(p.date)}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {p.supplierNameSnapshot}
                    </td>
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-700">
                      {p.supplierInvoiceNo}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <span
                        className={
                          p.status === 'Paid'
                            ? 'text-emerald-700 font-medium'
                            : 'text-amber-700 font-medium'
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                      {formatINR(p.grandTotal)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num text-amber-700 font-semibold">
                      {formatINR(p.balanceDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Purchase Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">{t.purchases.newPurchase}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.purchases.supplier} *
                </label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Supplier...</option>
                  {db.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.purchases.supplierInvNo} *
                </label>
                <input
                  type="text"
                  required
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="INV-2026-881"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
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
            </div>

            {/* Line Rows */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-2 text-left">Item</th>
                    <th className="py-2 px-2 text-left">Godown</th>
                    <th className="py-2 px-2 text-left">Batch No</th>
                    <th className="py-2 px-2 text-left">Expiry</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Pur Rate</th>
                    <th className="py-2 px-2 text-right">Sell Rate</th>
                    <th className="py-2 px-2 text-right">GST%</th>
                    <th className="py-2 px-2 text-right">Total</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const lineSub = round2(r.qty * r.purchasePrice);
                    const lineGst = round2((lineSub * r.gstRate) / 100);
                    return (
                      <tr key={r.key}>
                        <td className="p-2 min-w-[160px]">
                          <select
                            value={r.itemId}
                            onChange={(e) => {
                              const it = db.items.find((i) => i.id === e.target.value);
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key && it
                                    ? {
                                        ...x,
                                        itemId: it.id,
                                        godownId: it.defaultGodownId,
                                        purchasePrice: it.purchasePrice,
                                        sellingPrice: it.sellingPrice,
                                        mrp: it.mrp,
                                        gstRate: it.gstRate,
                                      }
                                    : x
                                )
                              );
                            }}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                          >
                            {db.items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 min-w-[120px]">
                          <select
                            value={r.godownId}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key ? { ...x, godownId: e.target.value } : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                          >
                            {db.godowns.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 w-28">
                          <input
                            type="text"
                            value={r.batchNumber}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key ? { ...x, batchNumber: e.target.value } : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono-num"
                          />
                        </td>
                        <td className="p-2 w-32">
                          <input
                            type="date"
                            value={r.expiryDate}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key ? { ...x, expiryDate: e.target.value } : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono-num"
                          />
                        </td>
                        <td className="p-2 w-20">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={r.qty}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key ? { ...x, qty: Number(e.target.value) || 0 } : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 text-right border border-slate-300 rounded font-mono-num"
                          />
                        </td>
                        <td className="p-2 w-24">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.purchasePrice}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key
                                    ? { ...x, purchasePrice: Number(e.target.value) || 0 }
                                    : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 text-right border border-slate-300 rounded font-mono-num"
                          />
                        </td>
                        <td className="p-2 w-24">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.sellingPrice}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key
                                    ? { ...x, sellingPrice: Number(e.target.value) || 0 }
                                    : x
                                )
                              )
                            }
                            className="w-full px-2 py-1.5 text-right border border-slate-300 rounded font-mono-num"
                          />
                        </td>
                        <td className="p-2 w-20">
                          <select
                            value={r.gstRate}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.key === r.key
                                    ? { ...x, gstRate: Number(e.target.value) as GstRate }
                                    : x
                                )
                              )
                            }
                            className="w-full px-1.5 py-1.5 border border-slate-300 rounded bg-white font-mono-num"
                          >
                            {[0, 5, 12, 18].map((g) => (
                              <option key={g} value={g}>
                                {g}%
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-right font-mono-num font-semibold whitespace-nowrap">
                          {formatINR(lineSub + lineGst)}
                        </td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.purchases.addLine}
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Paid Now (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max={totals.grand}
                  step="any"
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Payment Mode
                </label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as ReceiptPaymentMode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Bank">Bank</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
              <div className="text-right font-mono-num">
                <div className="text-xs text-slate-500">
                  Sub: {formatINR(totals.sub)} · GST: {formatINR(totals.gst)}
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  Grand Total: {formatINR(totals.grand)}
                </div>
              </div>
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
                {t.purchases.savePurchase}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
