import React, { useMemo, useState } from 'react';
import { Plus, Search, Download, Package, Edit2, Eye, X, ShoppingCart, PackagePlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Item, ItemCategory } from '../types/models';
import { getBatchExpiryStatus, getItemTotalStock } from '../utils/calculations';
import { formatDateDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { exportToCSV } from '../utils/exports';
import { ItemFormModal } from '../components/ItemFormModal';

const CATEGORIES: ItemCategory[] = ['Seeds', 'Fertilizer', 'Pesticide', 'General', 'Other'];

export function ItemsPage() {
  const {
    db,
    isOwner,
    setViewingBillId,
    addItemAndGoToBill,
    startPurchaseForItem,
    t,
  } = useApp();

  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<{ src: string; alt: string } | null>(null);

  const openAddForm = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const openEditForm = (item: Item) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.items.filter((it) => {
      if (catFilter !== 'ALL' && it.category !== catFilter) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.code.toLowerCase().includes(q) ||
        it.brand.toLowerCase().includes(q) ||
        it.hsnCode.toLowerCase().includes(q) ||
        (it.barcode && it.barcode.toLowerCase().includes(q))
      );
    });
  }, [db.items, query, catFilter]);

  const handleExport = () => {
    exportToCSV(
      `items_master_${todayISO()}`,
      [
        'Code',
        'Name',
        'Category',
        'Brand',
        'HSN',
        'GST%',
        'Unit',
        ...(isOwner ? ['Purchase Price'] : []),
        'Selling Price',
        'MRP',
        'Current Stock',
        'Min Stock',
      ],
      filtered.map((it) => [
        it.code,
        it.name,
        it.category,
        it.brand,
        it.hsnCode,
        it.gstRate,
        it.unit,
        ...(isOwner ? [it.purchasePrice] : []),
        it.sellingPrice,
        it.mrp,
        getItemTotalStock(it.id, db.batches),
        it.minStockLevel,
      ])
    );
  };

  const detailItem = detailItemId ? db.items.find((i) => i.id === detailItemId) : null;
  const detailBatches = detailItem ? db.batches.filter((b) => b.itemId === detailItem.id) : [];
  const detailSales = detailItem
    ? db.billLines
        .filter((l) => l.itemId === detailItem.id)
        .map((l) => ({
          line: l,
          bill: db.bills.find((b) => b.id === l.billId),
        }))
        .filter((x) => x.bill && x.bill.status !== 'Cancelled')
    : [];
  const detailPurchases = detailItem
    ? db.purchaseLines
        .filter((l) => l.itemId === detailItem.id)
        .map((l) => ({
          line: l,
          purchase: db.purchases.find((p) => p.id === l.purchaseId),
        }))
    : [];

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">{t.items.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 min-h-[52px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {t.common.exportCsv}
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-2 min-h-[52px] px-5 py-2.5 rounded-xl bg-[#15803D] text-white text-base font-bold hover:bg-emerald-800 shadow-xs cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            {t.items.addItem}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.billing.addItemSearch}
            className="w-full min-h-[52px] pl-11 pr-3 py-2 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-[#F3F4F6] p-1 rounded-xl">
          {['ALL', ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`min-h-[40px] px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                catFilter === cat
                  ? 'bg-[#15803D] text-white'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              {cat === 'ALL' ? t.common.all : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-base text-slate-500">{t.common.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead className="bg-[#F3F4F6] border-b border-slate-200 text-xs font-bold uppercase text-slate-700">
                <tr>
                  <th className="py-3 px-4 text-left">{t.items.itemCode}</th>
                  <th className="py-3 px-4 text-left">{t.items.itemName}</th>
                  <th className="py-3 px-4 text-left">{t.items.hsn} / GST</th>
                  {isOwner && <th className="py-3 px-4 text-right">{t.items.purchasePrice}</th>}
                  <th className="py-3 px-4 text-right">{t.items.sellingPrice}</th>
                  <th className="py-3 px-4 text-right">{t.items.currentStock}</th>
                  <th className="py-3 px-4 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const stock = getItemTotalStock(item.id, db.batches);
                  const isLow = stock <= item.minStockLevel;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600">
                        {item.code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {item.photoDataUrl ? (
                            <button
                              type="button"
                              onClick={() => setZoomPhoto({ src: item.photoDataUrl!, alt: item.name })}
                              className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-zoom-in hover:ring-2 hover:ring-[#15803D]"
                            >
                              <img
                                src={item.photoDataUrl}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#F3F4F6] flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-900">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              {item.category} · {item.brand || 'Generic'}
                              {item.rackLocation ? ` · Rack ${item.rackLocation}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600">
                        {item.hsnCode || '-'} · {item.gstRate}%
                      </td>
                      {isOwner && (
                        <td className="py-3 px-4 text-right font-mono-num text-slate-600">
                          {formatINR(item.purchasePrice)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                        {formatINR(item.sellingPrice)}{' '}
                        <span className="text-xs font-normal text-slate-500">/ {item.unit}</span>
                        <div className="text-[11px] font-normal text-slate-400">
                          MRP {formatINR(item.mrp)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num">
                        <span className={isLow ? 'text-amber-700 font-bold' : 'text-slate-900 font-semibold'}>
                          {stock} {item.unit}
                        </span>
                        {isLow && <div className="text-[11px] text-amber-700">Low stock</div>}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => addItemAndGoToBill(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            {t.accounts.billThisItem}
                          </button>
                          <button
                            type="button"
                            onClick={() => startPurchaseForItem(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FACC15] text-slate-900 text-xs font-bold hover:bg-yellow-300 cursor-pointer"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            {t.accounts.restockItem}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailItemId(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t.common.view}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            {t.common.edit}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reusable Add / Edit Item Modal */}
      <ItemFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        editingItem={editingItem}
      />

      {/* Item Detail Modal (Stock, Batches, Purchase History, Sales History, Profit/Unit) */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl p-5 space-y-5 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                {detailItem.photoDataUrl ? (
                  <button
                    type="button"
                    onClick={() => setZoomPhoto({ src: detailItem.photoDataUrl!, alt: detailItem.name })}
                    className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 shrink-0 cursor-zoom-in hover:ring-2 hover:ring-[#15803D]"
                  >
                    <img
                      src={detailItem.photoDataUrl}
                      alt={detailItem.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center text-slate-400 shrink-0">
                    <Package className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <div className="text-xs font-mono-num text-slate-500">
                    {detailItem.code} · {detailItem.category} · HSN {detailItem.hsnCode || '-'}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{detailItem.name}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = detailItem.id;
                    setDetailItemId(null);
                    addItemAndGoToBill(id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#15803D] text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  {t.accounts.billThisItem}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = detailItem.id;
                    setDetailItemId(null);
                    startPurchaseForItem(id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FACC15] text-slate-900 text-xs font-bold hover:bg-yellow-300 cursor-pointer"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  {t.accounts.restockItem}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailItemId(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500">{t.items.currentStock}</div>
                <div className="text-lg font-bold font-mono-num mt-0.5">
                  {getItemTotalStock(detailItem.id, db.batches)} {detailItem.unit}
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500">{t.items.sellingPrice}</div>
                <div className="text-lg font-bold font-mono-num mt-0.5">
                  {formatINR(detailItem.sellingPrice)}
                </div>
              </div>
              {isOwner && (
                <>
                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="text-xs text-slate-500">{t.items.purchasePrice}</div>
                    <div className="text-lg font-bold font-mono-num mt-0.5">
                      {formatINR(detailItem.purchasePrice)}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-3">
                    <div className="text-xs text-slate-500">{t.items.profitPerUnit}</div>
                    <div className="text-lg font-bold font-mono-num text-emerald-700 mt-0.5">
                      {formatINR(detailItem.sellingPrice - detailItem.purchasePrice)}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{t.items.batches}</h3>
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="py-2 px-3 text-left">Batch</th>
                    <th className="py-2 px-3 text-left">Godown</th>
                    <th className="py-2 px-3 text-left">Expiry</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-num">
                  {detailBatches.map((b) => {
                    const gd = db.godowns.find((g) => g.id === b.godownId);
                    const st = getBatchExpiryStatus(b);
                    return (
                      <tr key={b.id}>
                        <td className="py-2 px-3">{b.batchNumber}</td>
                        <td className="py-2 px-3 font-sans">{gd?.name}</td>
                        <td
                          className={`py-2 px-3 ${
                            st === 'expired'
                              ? 'text-red-600 font-semibold'
                              : st === 'expiring_soon'
                              ? 'text-amber-700 font-semibold'
                              : ''
                          }`}
                        >
                          {b.expiryDate ? formatDateDDMMYYYY(b.expiryDate) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {b.quantity} {detailItem.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  {t.items.purchaseHistory}
                </h3>
                {detailPurchases.length === 0 ? (
                  <p className="text-xs text-slate-500">No purchase entries yet.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                    {detailPurchases.map(({ line, purchase }) => (
                      <div key={line.id} className="p-2.5 flex justify-between">
                        <div>
                          <div className="font-medium">{purchase?.supplierNameSnapshot}</div>
                          <div className="text-slate-500 font-mono-num">
                            {formatDateDDMMYYYY(purchase?.date)} · {purchase?.supplierInvoiceNo}
                          </div>
                        </div>
                        <div className="text-right font-mono-num">
                          <div className="font-semibold">
                            +{line.qty} {line.unit}
                          </div>
                          {isOwner && (
                            <div className="text-slate-500">{formatINR(line.purchasePrice)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  {t.items.salesHistory}
                </h3>
                {detailSales.length === 0 ? (
                  <p className="text-xs text-slate-500">No sales bills yet.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                    {detailSales.map(({ line, bill }) => (
                      <button
                        key={line.id}
                        type="button"
                        onClick={() => bill && setViewingBillId(bill.id)}
                        className="w-full p-2.5 flex justify-between text-left hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-medium text-emerald-800">{bill?.billNumber}</div>
                          <div className="text-slate-500">
                            {formatDateDDMMYYYY(bill?.date)} · {bill?.customerNameSnapshot}
                          </div>
                        </div>
                        <div className="text-right font-mono-num">
                          <div className="font-semibold">
                            -{line.qty} {line.unit}
                          </div>
                          <div className="text-slate-500">{formatINR(line.rate)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {zoomPhoto && (
        <div
          onClick={() => setZoomPhoto(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 cursor-zoom-out"
        >
          <div className="relative max-w-lg w-full bg-white rounded-2xl p-3 shadow-2xl">
            <button
              type="button"
              onClick={() => setZoomPhoto(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-slate-800 shadow cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomPhoto.src}
              alt={zoomPhoto.alt}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
