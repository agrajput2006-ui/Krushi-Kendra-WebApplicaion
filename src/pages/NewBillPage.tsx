import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Search,
  ShieldAlert,
  UserPlus,
  PackagePlus,
  Lock,
  Unlock,
  BookOpen,
  Phone,
  MapPin,
  Package,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BillPaymentMode, Item, SupplyType } from '../types/models';
import {
  calculateBillTotals,
  calculateLineTotals,
  generateNextSequentialNumber,
  getBatchExpiryStatus,
  getCustomerClosingBalance,
} from '../utils/calculations';
import { formatDateDDMMYYYY, formatINR, getFinancialYear, todayISO } from '../utils/formatters';
import { CustomerFormModal } from '../components/CustomerFormModal';
import { ItemFormModal } from '../components/ItemFormModal';

interface DraftLine {
  key: string;
  itemId: string;
  batchId: string;
  qty: number;
  rate: number;
  discountPercent: number;
  rateUnlocked?: boolean;
}

const CATEGORIES = ['ALL', 'Seeds', 'Fertilizer', 'Pesticide', 'General', 'Other'] as const;

export function NewBillPage() {
  const {
    db,
    createBill,
    setViewingBillId,
    showToast,
    isOwner,
    billPreselectCustomerId,
    clearBillPreselectCustomer,
    billPreselectItemId,
    clearBillPreselectItem,
    viewCustomerKhata,
    t,
  } = useApp();

  const [billDate, setBillDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState<string>('CASH');
  const [supplyType, setSupplyType] = useState<SupplyType>('intra');
  const [paymentMode, setPaymentMode] = useState<BillPaymentMode>('Cash');
  const [paidNow, setPaidNow] = useState<string>('');
  const [paymentRef, setPaymentRef] = useState('');
  const [notes, setNotes] = useState('');
  const [allowExpiredOverride, setAllowExpiredOverride] = useState(false);

  const [itemQuery, setItemQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const addItemToBill = (itemId: string, preferredBatchId?: string, overrideItem?: Item) => {
    const item = overrideItem || db.items.find((i) => i.id === itemId);
    if (!item) return;

    const itemBatches = db.batches.filter((b) => b.itemId === item.id);
    const validBatch =
      (preferredBatchId ? itemBatches.find((b) => b.id === preferredBatchId) : undefined) ||
      itemBatches.find((b) => b.quantity > 0 && getBatchExpiryStatus(b, billDate) !== 'expired') ||
      itemBatches.find((b) => b.quantity > 0) ||
      itemBatches[0];

    const batchIdToUse = validBatch?.id || preferredBatchId || '';
    if (!batchIdToUse) {
      showToast('error', `No stock batch found for ${item.name}. Add a purchase or opening batch first.`);
      return;
    }

    const unitRate = validBatch?.sellingPrice || item.sellingPrice;

    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (l) => l.itemId === item.id && l.batchId === batchIdToUse
      );
      if (existingIdx >= 0) {
        return prev.map((l, idx) => (idx === existingIdx ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          key: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          itemId: item.id,
          batchId: batchIdToUse,
          qty: 1,
          rate: unitRate,
          discountPercent: 0,
          rateUnlocked: false,
        },
      ];
    });
    setItemQuery('');
    searchInputRef.current?.focus();
  };

  // Consume cross-module customer or item pre-selection intents
  useEffect(() => {
    if (billPreselectCustomerId) {
      setCustomerId(billPreselectCustomerId);
      clearBillPreselectCustomer();
    }
  }, [billPreselectCustomerId, clearBillPreselectCustomer]);

  useEffect(() => {
    if (billPreselectItemId) {
      addItemToBill(billPreselectItemId);
      clearBillPreselectItem();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billPreselectItemId]);

  const nextBillNoPreview = useMemo(() => {
    const fy = getFinancialYear(billDate || todayISO());
    return generateNextSequentialNumber(
      db.settings.billPrefix || 'SK',
      fy,
      db.bills.map((b) => b.billNumber)
    );
  }, [billDate, db.bills, db.settings.billPrefix]);

  const selectedCustomer = useMemo(
    () => (customerId !== 'CASH' ? db.customers.find((c) => c.id === customerId) : undefined),
    [customerId, db.customers]
  );

  const currentCustomerBalance = useMemo(() => {
    if (!selectedCustomer) return 0;
    return getCustomerClosingBalance(selectedCustomer, db.bills, db.payments);
  }, [selectedCustomer, db.bills, db.payments]);

  // Item search + category filter
  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return db.items
      .filter((it) => {
        if (catFilter !== 'ALL' && it.category !== catFilter) return false;
        if (!q) return true;
        return (
          it.name.toLowerCase().includes(q) ||
          it.code.toLowerCase().includes(q) ||
          (it.barcode && it.barcode.toLowerCase().includes(q)) ||
          it.brand.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [itemQuery, catFilter, db.items]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredItems.length > 0) {
      e.preventDefault();
      const exactBarcode = db.items.find(
        (it) => it.barcode && it.barcode.toLowerCase() === itemQuery.trim().toLowerCase()
      );
      addItemToBill((exactBarcode || filteredItems[0]).id);
    }
  };

  const calculatedLines = useMemo(() => {
    return lines.map((line) => {
      const item = db.items.find((i) => i.id === line.itemId);
      const batch = db.batches.find((b) => b.id === line.batchId);
      const gstRate = item?.gstRate ?? 0;
      const calc = calculateLineTotals({
        qty: line.qty,
        rate: line.rate,
        discountPercent: line.discountPercent,
        gstRate,
        supplyType,
      });
      const expStatus = batch ? getBatchExpiryStatus(batch, billDate) : 'none';
      const stockInsufficient =
        batch && !db.settings.allowNegativeStock && line.qty > batch.quantity + 0.0001;

      return {
        ...line,
        item,
        batch,
        gstRate,
        expStatus,
        stockInsufficient,
        ...calc,
      };
    });
  }, [lines, db.items, db.batches, supplyType, billDate, db.settings.allowNegativeStock]);

  const billTotals = useMemo(() => calculateBillTotals(calculatedLines), [calculatedLines]);

  const totalUnitsQty = useMemo(
    () => calculatedLines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0),
    [calculatedLines]
  );

  const effectivePaidNow = useMemo(() => {
    if (paymentMode === 'Credit') return 0;
    if (paymentMode === 'Part') {
      return Math.min(billTotals.grandTotal, Math.max(0, Number(paidNow) || 0));
    }
    return billTotals.grandTotal;
  }, [paymentMode, paidNow, billTotals.grandTotal]);

  const effectiveBalanceDue = Math.max(0, billTotals.grandTotal - effectivePaidNow);

  const hasExpiredLine = calculatedLines.some((l) => l.expStatus === 'expired');
  const creditLimitExceeded =
    selectedCustomer &&
    selectedCustomer.creditLimit > 0 &&
    currentCustomerBalance + effectiveBalanceDue > selectedCustomer.creditLimit;

  const handleSaveBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (customerId === 'CASH' && (paymentMode === 'Credit' || paymentMode === 'Part')) {
      showToast('error', 'Credit or Part payment requires selecting a registered customer.');
      return;
    }

    const res = createBill({
      date: billDate,
      customerId,
      supplyType,
      paymentMode,
      paidAmountNow: effectivePaidNow,
      paymentReference: paymentRef,
      notes,
      allowExpiredOverride,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        batchId: l.batchId,
        qty: l.qty,
        rate: l.rate,
        discountPercent: l.discountPercent,
      })),
    });

    if (!res.ok) {
      showToast('error', res.error || 'Could not save bill');
      return;
    }

    showToast('success', `Bill ${res.bill?.billNumber} saved!`);
    setLines([]);
    setPaidNow('');
    setPaymentRef('');
    setNotes('');
    setAllowExpiredOverride(false);
    if (res.bill) {
      setViewingBillId(res.bill.id);
    }
  };

  return (
    <>
      <form onSubmit={handleSaveBill} className="space-y-5">
        {/* STEP 1: Structured Customer Card */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-[#F3F4F6] border-b border-slate-200 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-base sm:text-lg font-extrabold text-[#15803D]">
              {t.billing.step1Customer}
            </h1>
            <div className="font-mono-num text-sm font-bold text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200">
              {t.billing.billNo}: <span className="text-[#15803D]">{nextBillNoPreview}</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-6">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t.billing.selectCustomer}
                </label>
                <div className="flex gap-2">
                  <select
                    value={customerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setCustomerId(nextId);
                      if (nextId === 'CASH' && (paymentMode === 'Credit' || paymentMode === 'Part')) {
                        setPaymentMode('Cash');
                      }
                    }}
                    className="flex-1 min-w-0 min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  >
                    <option value="CASH">{t.billing.cashCustomer}</option>
                    {db.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.mobile} {c.village ? `(${c.village})` : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowAddCustomer(true)}
                    className="min-h-[52px] px-4 py-2.5 rounded-xl bg-[#FACC15] text-slate-900 text-sm sm:text-base font-bold hover:brightness-95 transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
                  >
                    <UserPlus className="w-5 h-5 text-[#15803D]" />
                    <span>{t.accounts.newCustomerQuick}</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t.billing.billDate}
                </label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl bg-white font-mono-num"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t.billing.supplyType}
                </label>
                <select
                  value={supplyType}
                  onChange={(e) => setSupplyType(e.target.value as SupplyType)}
                  className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl bg-white"
                >
                  <option value="intra">{t.billing.intraState}</option>
                  <option value="inter">{t.billing.interState}</option>
                </select>
              </div>
            </div>

            {/* Structured Customer Profile Strip */}
            {selectedCustomer && (
              <div className="bg-[#F3F4F6] border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                  <span className="font-bold text-slate-900 text-base">
                    {selectedCustomer.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-700 font-mono-num">
                    <Phone className="w-4 h-4 text-[#15803D]" />
                    {selectedCustomer.mobile}
                  </span>
                  {selectedCustomer.village && (
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <MapPin className="w-4 h-4 text-[#15803D]" />
                      {selectedCustomer.village}
                    </span>
                  )}
                  {selectedCustomer.gstin && (
                    <span className="text-xs font-mono-num text-slate-600">
                      GSTIN: {selectedCustomer.gstin}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm font-mono-num">
                    <span className="text-slate-600">{t.common.balance}: </span>
                    <strong
                      className={
                        currentCustomerBalance > 0 ? 'text-amber-700' : 'text-[#15803D]'
                      }
                    >
                      {formatINR(currentCustomerBalance)}
                    </strong>
                    {selectedCustomer.creditLimit > 0 && (
                      <span className="text-slate-500">
                        {' '}
                        / {formatINR(selectedCustomer.creditLimit)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => viewCustomerKhata(selectedCustomer.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-[#15803D] hover:bg-emerald-50 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {t.accounts.viewLedger}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* STEP 2: Item-Based Pricing & Line Items */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-[#F3F4F6] border-b border-slate-200 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#15803D]">
                {t.billing.step2Items}
              </h2>
              <p className="text-xs text-slate-600">{t.billing.priceAutoFromItems}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddItem(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#15803D] text-[#15803D] text-sm font-bold hover:bg-emerald-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              {t.billing.addNewItemQuick}
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Search & Category Filter */}
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t.billing.addItemSearch}
                  className="w-full min-h-[52px] pl-11 pr-4 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-[#F3F4F6] p-1 rounded-xl border border-slate-200">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
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

            {/* Structured Item Catalog Picker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {filteredItems.map((it) => {
                const totalStock = db.batches
                  .filter((b) => b.itemId === it.id)
                  .reduce((s, b) => s + b.quantity, 0);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => addItemToBill(it.id)}
                    className="flex items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-[#15803D] hover:bg-emerald-50/40 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {it.photoDataUrl ? (
                        <img
                          src={it.photoDataUrl}
                          alt={it.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-[#F3F4F6] flex items-center justify-center text-slate-400 shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{it.name}</div>
                        <div className="text-xs font-semibold text-[#15803D] font-mono-num mt-0.5">
                          {formatINR(it.sellingPrice)} / {it.unit}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {it.code} · GST {it.gstRate}% · Stk: {totalStock}
                        </div>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-[#F3F4F6] text-[#15803D] flex items-center justify-center shrink-0">
                      <Plus className="w-5 h-5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Structured Line Items Table */}
            {calculatedLines.length === 0 ? (
              <div className="py-8 text-center text-base text-slate-500 border border-dashed border-slate-300 rounded-xl bg-[#F3F4F6]/40">
                Select any item above to build the bill total from item prices.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-[#F3F4F6] border-b border-slate-200 text-xs text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Item</th>
                      <th className="py-2.5 px-3 text-left">{t.billing.batch}</th>
                      <th className="py-2.5 px-3 text-center">{t.billing.qty}</th>
                      <th className="py-2.5 px-3 text-right">{t.billing.unitRateHint}</th>
                      <th className="py-2.5 px-3 text-right">{t.billing.discPct}</th>
                      <th className="py-2.5 px-3 text-right">{t.billing.gstPct}</th>
                      <th className="py-2.5 px-3 text-right">{t.billing.lineTotal}</th>
                      <th className="py-2.5 px-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {calculatedLines.map((line) => {
                      const itemBatches = db.batches.filter((b) => b.itemId === line.itemId);
                      return (
                        <tr key={line.key} className="align-top">
                          <td className="py-3 px-3 min-w-[190px]">
                            <div className="flex items-start gap-2.5">
                              {line.item?.photoDataUrl ? (
                                <img
                                  src={line.item.photoDataUrl}
                                  alt={line.item.name}
                                  referrerPolicy="no-referrer"
                                  className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-slate-400 shrink-0">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-900">{line.item?.name}</div>
                                <div className="text-xs text-slate-500 font-mono-num">
                                  HSN {line.item?.hsnCode || '-'} · {t.billing.stockAvail}:{' '}
                                  {line.batch?.quantity ?? 0} {line.item?.unit}
                                </div>
                              </div>
                            </div>
                            {line.expStatus === 'expired' && (
                              <div className="text-xs text-red-600 font-semibold mt-0.5 flex items-center gap-1">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Expired ({formatDateDDMMYYYY(line.batch?.expiryDate)})
                              </div>
                            )}
                            {line.stockInsufficient && (
                              <div className="text-xs text-red-600 font-semibold mt-0.5">
                                {t.billing.negativeStockBlock}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 min-w-[140px]">
                            <select
                              value={line.batchId}
                              onChange={(e) => {
                                const nextBatch = itemBatches.find((b) => b.id === e.target.value);
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.key === line.key
                                      ? {
                                          ...l,
                                          batchId: e.target.value,
                                          rate: nextBatch?.sellingPrice || line.item?.sellingPrice || l.rate,
                                        }
                                      : l
                                  )
                                );
                              }}
                              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono-num"
                            >
                              {itemBatches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.batchNumber} ({b.quantity})
                                  {b.expiryDate ? ` · Exp ${formatDateDDMMYYYY(b.expiryDate)}` : ''}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1 border border-slate-300 rounded-lg bg-white p-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key
                                        ? { ...l, qty: Math.max(1, Number((l.qty - 1).toFixed(2))) }
                                        : l
                                    )
                                  )
                                }
                                className="w-8 h-8 rounded-md hover:bg-[#F3F4F6] flex items-center justify-center text-slate-700 cursor-pointer"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={line.qty}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key
                                        ? { ...l, qty: Number(e.target.value) || 0 }
                                        : l
                                    )
                                  )
                                }
                                className="w-14 text-center text-sm font-bold font-mono-num focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key
                                        ? { ...l, qty: Number((l.qty + 1).toFixed(2)) }
                                        : l
                                    )
                                  )
                                }
                                className="w-8 h-8 rounded-md bg-[#F3F4F6] hover:bg-emerald-100 text-[#15803D] flex items-center justify-center cursor-pointer"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-[11px] text-center text-slate-500 mt-0.5">
                              {line.item?.unit}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {line.rateUnlocked && isOwner ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={line.rate}
                                  onChange={(e) =>
                                    setLines((prev) =>
                                      prev.map((l) =>
                                        l.key === line.key
                                          ? { ...l, rate: Number(e.target.value) || 0 }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-24 px-2 py-1.5 text-right border border-[#15803D] rounded-lg font-mono-num"
                                />
                              ) : (
                                <span className="font-mono-num font-semibold text-slate-900">
                                  {formatINR(line.rate)}
                                </span>
                              )}

                              {isOwner && (
                                <button
                                  type="button"
                                  title={
                                    line.rateUnlocked ? t.billing.lockRate : t.billing.unlockRate
                                  }
                                  onClick={() =>
                                    setLines((prev) =>
                                      prev.map((l) => {
                                        if (l.key !== line.key) return l;
                                        const nextUnlocked = !l.rateUnlocked;
                                        return {
                                          ...l,
                                          rateUnlocked: nextUnlocked,
                                          rate: nextUnlocked
                                            ? l.rate
                                            : line.batch?.sellingPrice ||
                                              line.item?.sellingPrice ||
                                              l.rate,
                                        };
                                      })
                                    )
                                  }
                                  className="p-1 text-slate-400 hover:text-[#15803D] cursor-pointer"
                                >
                                  {line.rateUnlocked ? (
                                    <Unlock className="w-3.5 h-3.5 text-[#15803D]" />
                                  ) : (
                                    <Lock className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">per {line.item?.unit}</div>
                          </td>

                          <td className="py-3 px-3 w-20">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={line.discountPercent}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.key === line.key
                                      ? { ...l, discountPercent: Number(e.target.value) || 0 }
                                      : l
                                  )
                                )
                              }
                              className="w-16 ml-auto block px-2 py-1.5 text-right border border-slate-300 rounded-lg font-mono-num"
                            />
                          </td>

                          <td className="py-3 px-3 text-right font-mono-num text-xs text-slate-600 whitespace-nowrap">
                            <div>{line.gstRate}%</div>
                            <div>
                              {formatINR(line.cgstAmount + line.sgstAmount + line.igstAmount)}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono-num font-bold text-slate-900 whitespace-nowrap">
                            {formatINR(line.lineTotal)}
                          </td>

                          <td className="py-3 px-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setLines((prev) => prev.filter((l) => l.key !== line.key))
                              }
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                              aria-label="Remove item"
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
            )}
          </div>
        </section>

        {/* Warnings: Expired override & Credit limit */}
        {hasExpiredLine && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-red-800 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t.billing.expiredBlock}</span>
            </div>
            {isOwner && (
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-red-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowExpiredOverride}
                  onChange={(e) => setAllowExpiredOverride(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                {t.billing.allowExpiredOverride}
              </label>
            )}
          </div>
        )}

        {creditLimitExceeded && selectedCustomer && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              {t.billing.creditWarning}{' '}
              <strong className="font-mono-num">{formatINR(selectedCustomer.creditLimit)}</strong>
            </span>
          </div>
        )}

        {/* STEP 3: Payment & Item-Computed Total */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-[#F3F4F6] border-b border-slate-200 px-4 sm:px-5 py-3">
            <h2 className="text-base sm:text-lg font-extrabold text-[#15803D]">
              {t.billing.step3Payment}
            </h2>
          </div>

          <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {t.billing.paymentMode}
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(['Cash', 'UPI', 'Card', 'Bank', 'Credit', 'Part'] as BillPaymentMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`min-h-[48px] py-2 px-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                          paymentMode === mode
                            ? 'bg-[#15803D] text-white border-[#15803D]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-[#F3F4F6]'
                        }`}
                      >
                        {mode}
                      </button>
                    )
                  )}
                </div>
              </div>

              {paymentMode === 'Part' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t.billing.paidNow}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={billTotals.grandTotal}
                    step="any"
                    value={paidNow}
                    onChange={(e) => setPaidNow(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
              )}

              {(paymentMode === 'UPI' || paymentMode === 'Card' || paymentMode === 'Bank') && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t.payments.refNo}
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="UTR / Transaction Ref"
                    className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t.common.notes}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional delivery or crop note"
                  className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex flex-col justify-between space-y-4">
              <div className="bg-[#F3F4F6] border border-slate-200 rounded-xl p-4 space-y-2 text-sm font-mono-num">
                <div className="flex justify-between text-slate-600">
                  <span>{t.billing.itemsCountLabel}:</span>
                  <span>
                    {calculatedLines.length} ({totalUnitsQty} units)
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Subtotal:</span>
                  <span>{formatINR(billTotals.taxableTotal)}</span>
                </div>
                {supplyType === 'inter' ? (
                  <div className="flex justify-between text-slate-600">
                    <span>IGST:</span>
                    <span>{formatINR(billTotals.igstTotal)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-slate-600">
                    <span>CGST + SGST:</span>
                    <span>{formatINR(billTotals.cgstTotal + billTotals.sgstTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Round Off:</span>
                  <span>{formatINR(billTotals.roundOff)}</span>
                </div>
                <div className="flex justify-between text-2xl font-extrabold text-[#15803D] pt-2 border-t border-slate-300">
                  <span>{t.common.total}:</span>
                  <span>{formatINR(billTotals.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-[#15803D] font-semibold">
                  <span>Paid Now:</span>
                  <span>{formatINR(effectivePaidNow)}</span>
                </div>
                <div className="flex justify-between text-xs text-amber-700 font-semibold">
                  <span>{t.billing.balanceDue}:</span>
                  <span>{formatINR(effectiveBalanceDue)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={lines.length === 0}
                className="w-full min-h-[52px] py-3.5 px-5 rounded-xl bg-[#15803D] text-white font-bold text-base hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                {t.billing.saveAndPrint}
              </button>
            </div>
          </div>
        </section>
      </form>

      <CustomerFormModal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onSaved={(customer) => setCustomerId(customer.id)}
        onSaveAndBill={(customer) => setCustomerId(customer.id)}
      />

      <ItemFormModal
        open={showAddItem}
        onClose={() => setShowAddItem(false)}
        defaultOpeningQty="20"
        onSaved={(item, batchId) => addItemToBill(item.id, batchId, item)}
      />
    </>
  );
}
