import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock, Download, Package, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StockAdjustmentReason } from '../types/models';
import { getBatchExpiryStatus, getItemTotalStock, round2 } from '../utils/calculations';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { exportToCSV } from '../utils/exports';

type StockViewMode = 'batches' | 'godown' | 'category' | 'movements';

export function StockPage() {
  const { db, adjustStock, startPurchaseForItem, isOwner, showToast, t } = useApp();
  const [viewMode, setViewMode] = useState<StockViewMode>('batches');
  const [selectedGodown, setSelectedGodown] = useState<string>('ALL');

  // Adjustment modal
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjItemId, setAdjItemId] = useState(db.items[0]?.id || '');
  const [adjBatchId, setAdjBatchId] = useState('');
  const [adjReason, setAdjReason] = useState<StockAdjustmentReason>('damage');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  const today = todayISO();

  const valuation = useMemo(() => {
    let atPurchase = 0;
    let atSelling = 0;
    for (const b of db.batches) {
      if (b.quantity <= 0) continue;
      atPurchase += b.quantity * b.purchasePrice;
      atSelling += b.quantity * b.sellingPrice;
    }
    return { atPurchase: round2(atPurchase), atSelling: round2(atSelling) };
  }, [db.batches]);

  const lowStockItems = useMemo(
    () =>
      db.items.filter((it) => getItemTotalStock(it.id, db.batches) <= it.minStockLevel),
    [db.items, db.batches]
  );

  const expiryAlerts = useMemo(
    () =>
      db.batches
        .filter((b) => b.quantity > 0)
        .map((b) => ({
          batch: b,
          item: db.items.find((i) => i.id === b.itemId),
          status: getBatchExpiryStatus(b, today),
        }))
        .filter((x) => x.status === 'expired' || x.status === 'expiring_soon'),
    [db.batches, db.items, today]
  );

  const godownSummary = useMemo(() => {
    return db.godowns.map((gd) => {
      const gdBatches = db.batches.filter((b) => b.godownId === gd.id && b.quantity > 0);
      const totalQty = gdBatches.reduce((s, b) => s + b.quantity, 0);
      const purchaseVal = gdBatches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
      const sellingVal = gdBatches.reduce((s, b) => s + b.quantity * b.sellingPrice, 0);
      return { gd, batchCount: gdBatches.length, totalQty, purchaseVal, sellingVal };
    });
  }, [db.godowns, db.batches]);

  const categorySummary = useMemo(() => {
    const map = new Map<string, { items: number; qty: number; purchaseVal: number; sellingVal: number }>();
    for (const it of db.items) {
      const entry = map.get(it.category) || { items: 0, qty: 0, purchaseVal: 0, sellingVal: 0 };
      entry.items += 1;
      const itBatches = db.batches.filter((b) => b.itemId === it.id && b.quantity > 0);
      for (const b of itBatches) {
        entry.qty += b.quantity;
        entry.purchaseVal += b.quantity * b.purchasePrice;
        entry.sellingVal += b.quantity * b.sellingPrice;
      }
      map.set(it.category, entry);
    }
    return Array.from(map.entries());
  }, [db.items, db.batches]);

  const filteredBatches = useMemo(() => {
    return db.batches.filter((b) => {
      if (selectedGodown !== 'ALL' && b.godownId !== selectedGodown) return false;
      return true;
    });
  }, [db.batches, selectedGodown]);

  const openAdjModal = (itemId?: string, batchId?: string) => {
    const iId = itemId || db.items[0]?.id || '';
    const firstBatch = batchId || db.batches.find((b) => b.itemId === iId)?.id || '';
    setAdjItemId(iId);
    setAdjBatchId(firstBatch);
    setAdjDelta('');
    setAdjReason('damage');
    setAdjNotes('');
    setShowAdjModal(true);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = adjustStock({
      itemId: adjItemId,
      batchId: adjBatchId,
      qtyChange: Number(adjDelta) || 0,
      reason: adjReason,
      notes: adjNotes,
    });
    if (!res.ok) {
      showToast('error', res.error || 'Adjustment failed');
      return;
    }
    showToast('success', 'Stock adjusted & logged.');
    setShowAdjModal(false);
  };

  const handleExport = () => {
    exportToCSV(
      `stock_report_${today}`,
      [
        'Item Code',
        'Item Name',
        'Category',
        'Batch',
        'Godown',
        'Expiry',
        'Qty',
        'Unit',
        ...(isOwner ? ['Purchase Value (INR)'] : []),
        'Selling Value (INR)',
      ],
      filteredBatches.map((b) => {
        const it = db.items.find((i) => i.id === b.itemId);
        const gd = db.godowns.find((g) => g.id === b.godownId);
        return [
          it?.code || '',
          it?.name || '',
          it?.category || '',
          b.batchNumber,
          gd?.name || '',
          b.expiryDate ? formatDateDDMMYYYY(b.expiryDate) : '-',
          b.quantity,
          it?.unit || '',
          ...(isOwner ? [round2(b.quantity * b.purchasePrice)] : []),
          round2(b.quantity * b.sellingPrice),
        ];
      })
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">{t.stock.title}</h1>
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
            onClick={() => openAdjModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {t.stock.adjustStock}
          </button>
        </div>
      </div>

      {/* Valuation & Alert KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isOwner && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">{t.stock.valuationPurchase}</div>
            <div className="text-xl font-bold font-mono-num text-slate-900 mt-1">
              {formatINR(valuation.atPurchase)}
            </div>
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{t.stock.valuationSelling}</div>
          <div className="text-xl font-bold font-mono-num text-emerald-800 mt-1">
            {formatINR(valuation.atSelling)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            {t.stock.lowStockAlerts}
          </div>
          <div className="text-xl font-bold font-mono-num text-amber-700 mt-1">
            {lowStockItems.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-red-600" />
            {t.stock.expiryAlerts}
          </div>
          <div className="text-xl font-bold font-mono-num text-red-600 mt-1">
            {expiryAlerts.length}
          </div>
        </div>
      </div>

      {/* Low Stock & Expiry Alerts Banner */}
      {(lowStockItems.length > 0 || expiryAlerts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-amber-900 mb-2">
              {t.stock.lowStockAlerts} ({lowStockItems.length})
            </h2>
            {lowStockItems.length === 0 ? (
              <p className="text-xs text-slate-500">All items above minimum level.</p>
            ) : (
              <div className="divide-y divide-amber-100 text-xs">
                {lowStockItems.map((it) => (
                  <div key={it.id} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{it.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-amber-800 font-semibold">
                        {getItemTotalStock(it.id, db.batches)} / Min {it.minStockLevel} {it.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => startPurchaseForItem(it.id)}
                        className="px-2 py-1 rounded bg-[#FACC15]/40 text-slate-900 font-bold hover:bg-[#FACC15]/70 cursor-pointer"
                      >
                        {t.accounts.restockItem}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-red-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-red-900 mb-2">
              {t.stock.expiryAlerts} ({expiryAlerts.length})
            </h2>
            {expiryAlerts.length === 0 ? (
              <p className="text-xs text-slate-500">No batches expiring within 60 days.</p>
            ) : (
              <div className="divide-y divide-red-100 text-xs">
                {expiryAlerts.map(({ batch, item, status }) => (
                  <div key={batch.id} className="py-1.5 flex justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{item?.name}</span>
                      <span className="text-slate-500 font-mono-num"> · {batch.batchNumber}</span>
                    </div>
                    <span
                      className={`font-mono-num font-semibold ${
                        status === 'expired' ? 'text-red-600' : 'text-amber-700'
                      }`}
                    >
                      {status === 'expired' ? 'EXPIRED ' : 'Exp '}
                      {formatDateDDMMYYYY(batch.expiryDate)} ({batch.quantity})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 bg-slate-200/70 p-1 rounded-lg">
          {(
            [
              ['batches', 'Item & Batch Stock'],
              ['godown', t.stock.godownReport],
              ['category', t.stock.categoryReport],
              ['movements', t.stock.movementLog],
            ] as Array<[StockViewMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'batches' && (
          <select
            value={selectedGodown}
            onChange={(e) => setSelectedGodown(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">All Godowns</option>
            {db.godowns.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* View Contents */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {viewMode === 'batches' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Item</th>
                  <th className="py-2.5 px-4 text-left">Batch / Lot</th>
                  <th className="py-2.5 px-4 text-left">Godown</th>
                  <th className="py-2.5 px-4 text-left">Expiry</th>
                  <th className="py-2.5 px-4 text-right">Qty</th>
                  {isOwner && <th className="py-2.5 px-4 text-right">Purchase Val</th>}
                  <th className="py-2.5 px-4 text-right">Selling Val</th>
                  <th className="py-2.5 px-4 text-right">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBatches.map((b) => {
                  const item = db.items.find((i) => i.id === b.itemId);
                  const gd = db.godowns.find((g) => g.id === b.godownId);
                  const expStatus = getBatchExpiryStatus(b, today);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {item?.photoDataUrl ? (
                            <img
                              src={item.photoDataUrl}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-slate-900">{item?.name}</div>
                            <div className="text-xs text-slate-500 font-mono-num">{item?.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-num text-xs">
                        <div>{b.batchNumber}</div>
                        {b.lotOrLicenseNumber && (
                          <div className="text-slate-400">{b.lotOrLicenseNumber}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{gd?.name}</td>
                      <td className="py-2.5 px-4 font-mono-num text-xs">
                        <span
                          className={
                            expStatus === 'expired'
                              ? 'text-red-600 font-bold'
                              : expStatus === 'expiring_soon'
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-600'
                          }
                        >
                          {b.expiryDate ? formatDateDDMMYYYY(b.expiryDate) : '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                        {b.quantity} {item?.unit}
                      </td>
                      {isOwner && (
                        <td className="py-2.5 px-4 text-right font-mono-num text-slate-600">
                          {formatINR(b.quantity * b.purchasePrice)}
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                        {formatINR(b.quantity * b.sellingPrice)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openAdjModal(b.itemId, b.id)}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'godown' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Godown</th>
                  <th className="py-2.5 px-4 text-left">Location / Racks</th>
                  <th className="py-2.5 px-4 text-right">Active Batches</th>
                  <th className="py-2.5 px-4 text-right">Total Units</th>
                  {isOwner && <th className="py-2.5 px-4 text-right">Purchase Value</th>}
                  <th className="py-2.5 px-4 text-right">Selling Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {godownSummary.map((row) => (
                  <tr key={row.gd.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">{row.gd.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {row.gd.location} · {row.gd.rackInfo}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num">{row.batchCount}</td>
                    <td className="py-3 px-4 text-right font-mono-num">{row.totalQty}</td>
                    {isOwner && (
                      <td className="py-3 px-4 text-right font-mono-num">
                        {formatINR(row.purchaseVal)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono-num font-semibold">
                      {formatINR(row.sellingVal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'category' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Category</th>
                  <th className="py-2.5 px-4 text-right">Items</th>
                  <th className="py-2.5 px-4 text-right">Total Units</th>
                  {isOwner && <th className="py-2.5 px-4 text-right">Purchase Value</th>}
                  <th className="py-2.5 px-4 text-right">Selling Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categorySummary.map(([cat, stat]) => (
                  <tr key={cat}>
                    <td className="py-3 px-4 font-semibold text-slate-900">{cat}</td>
                    <td className="py-3 px-4 text-right font-mono-num">{stat.items}</td>
                    <td className="py-3 px-4 text-right font-mono-num">{stat.qty}</td>
                    {isOwner && (
                      <td className="py-3 px-4 text-right font-mono-num">
                        {formatINR(stat.purchaseVal)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono-num font-semibold">
                      {formatINR(stat.sellingVal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'movements' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">When</th>
                  <th className="py-2.5 px-4 text-left">Item & Batch</th>
                  <th className="py-2.5 px-4 text-left">Type / Reason</th>
                  <th className="py-2.5 px-4 text-right">Change</th>
                  <th className="py-2.5 px-4 text-right">New Qty</th>
                  <th className="py-2.5 px-4 text-left">User / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {db.stockMovements.map((m) => {
                  const it = db.items.find((i) => i.id === m.itemId);
                  const bat = db.batches.find((b) => b.id === m.batchId);
                  return (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-mono-num text-slate-500">
                        {formatDateTimeDDMMYYYY(m.createdAt)}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{it?.name}</div>
                        <div className="font-mono-num text-slate-400">{bat?.batchNumber}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        {m.type} · {m.reason}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono-num font-semibold ${
                          m.qtyChange > 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {m.qtyChange > 0 ? `+${m.qtyChange}` : m.qtyChange}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num">{m.newQty}</td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {m.userName}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleAdjustSubmit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">{t.stock.adjustStock}</h2>
              <button type="button" onClick={() => setShowAdjModal(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Item</label>
                <select
                  value={adjItemId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setAdjItemId(id);
                    setAdjBatchId(db.batches.find((b) => b.itemId === id)?.id || '');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {db.items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Batch</label>
                <select
                  value={adjBatchId}
                  onChange={(e) => setAdjBatchId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono-num"
                >
                  {db.batches
                    .filter((b) => b.itemId === adjItemId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} (Current: {b.quantity})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.stock.reason}
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value as StockAdjustmentReason)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="damage">Damage / Leakage</option>
                  <option value="expiry">Expired Write-off</option>
                  <option value="return">Customer / Supplier Return</option>
                  <option value="correction">Physical Count Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.stock.qtyDelta} (e.g. -2 or +5)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                  placeholder="-2"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.common.notes}
                </label>
                <input
                  type="text"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="Optional remark"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAdjModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
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
