import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateBillLineProfit, round2 } from '../utils/calculations';
import { daysBetweenISO, formatDateDDMMYYYY, formatDateTimeDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { exportToCSV } from '../utils/exports';

type ReportTab =
  | 'sales'
  | 'gst'
  | 'purchases'
  | 'pnl'
  | 'ageing'
  | 'top_items'
  | 'customer_sales'
  | 'audit';

export function ReportsPage() {
  const { db, isOwner, setViewingBillId, t } = useApp();
  const [tab, setTab] = useState<ReportTab>('sales');
  const today = todayISO();

  const activeBills = useMemo(
    () => db.bills.filter((b) => b.status !== 'Cancelled'),
    [db.bills]
  );

  // 1. Daily & Monthly Sales
  const dailySales = useMemo(() => {
    const map = new Map<string, { count: number; taxable: number; gst: number; total: number }>();
    for (const b of activeBills) {
      const e = map.get(b.date) || { count: 0, taxable: 0, gst: 0, total: 0 };
      e.count += 1;
      e.taxable = round2(e.taxable + b.taxableTotal);
      e.gst = round2(e.gst + b.cgstTotal + b.sgstTotal + b.igstTotal);
      e.total = round2(e.total + b.grandTotal);
      map.set(b.date, e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activeBills]);

  const monthlySales = useMemo(() => {
    const map = new Map<string, { count: number; taxable: number; gst: number; total: number }>();
    for (const b of activeBills) {
      const ym = b.date.slice(0, 7);
      const e = map.get(ym) || { count: 0, taxable: 0, gst: 0, total: 0 };
      e.count += 1;
      e.taxable = round2(e.taxable + b.taxableTotal);
      e.gst = round2(e.gst + b.cgstTotal + b.sgstTotal + b.igstTotal);
      e.total = round2(e.total + b.grandTotal);
      map.set(ym, e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activeBills]);

  // 2. GSTR-1 Style GST Summary (B2B vs B2C, rate-wise)
  const gstSummary = useMemo(() => {
    const activeBillIds = new Set(activeBills.map((b) => b.id));
    const b2b = { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    const b2c = { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };

    for (const b of activeBills) {
      const bucket = b.customerGstinSnapshot ? b2b : b2c;
      bucket.count += 1;
      bucket.taxable = round2(bucket.taxable + b.taxableTotal);
      bucket.cgst = round2(bucket.cgst + b.cgstTotal);
      bucket.sgst = round2(bucket.sgst + b.sgstTotal);
      bucket.igst = round2(bucket.igst + b.igstTotal);
      bucket.total = round2(bucket.total + b.grandTotal);
    }

    const rateMap = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number; total: number }>();
    for (const l of db.billLines) {
      if (!activeBillIds.has(l.billId)) continue;
      const e = rateMap.get(l.gstRate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      e.taxable = round2(e.taxable + l.taxableValue);
      e.cgst = round2(e.cgst + l.cgstAmount);
      e.sgst = round2(e.sgst + l.sgstAmount);
      e.igst = round2(e.igst + l.igstAmount);
      e.total = round2(e.total + l.lineTotal);
      rateMap.set(l.gstRate, e);
    }

    return { b2b, b2c, byRate: Array.from(rateMap.entries()).sort((a, b) => a[0] - b[0]) };
  }, [activeBills, db.billLines]);

  // 3. Profit & Loss (Owner only)
  const pnl = useMemo(() => {
    const activeBillMap = new Map(activeBills.map((b) => [b.id, b]));
    const byItem = new Map<string, { name: string; qty: number; revenue: number; cost: number; profit: number }>();
    const byMonth = new Map<string, { revenue: number; cost: number; profit: number }>();

    for (const l of db.billLines) {
      const bill = activeBillMap.get(l.billId);
      if (!bill) continue;
      const cost = round2(l.qty * (l.purchasePriceSnapshot || 0));
      const profit = calculateBillLineProfit(l);

      const itEntry = byItem.get(l.itemId) || {
        name: l.itemName,
        qty: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      itEntry.qty = round2(itEntry.qty + l.qty);
      itEntry.revenue = round2(itEntry.revenue + l.taxableValue);
      itEntry.cost = round2(itEntry.cost + cost);
      itEntry.profit = round2(itEntry.profit + profit);
      byItem.set(l.itemId, itEntry);

      const ym = bill.date.slice(0, 7);
      const mEntry = byMonth.get(ym) || { revenue: 0, cost: 0, profit: 0 };
      mEntry.revenue = round2(mEntry.revenue + l.taxableValue);
      mEntry.cost = round2(mEntry.cost + cost);
      mEntry.profit = round2(mEntry.profit + profit);
      byMonth.set(ym, mEntry);
    }

    return {
      items: Array.from(byItem.values()).sort((a, b) => b.profit - a.profit),
      months: Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [activeBills, db.billLines]);

  // 4. Ageing Receivables & Payables
  const ageing = useMemo(() => {
    const rec = new Map<string, { name: string; b0_30: number; b31_60: number; b60p: number; total: number }>();
    for (const b of activeBills) {
      if (b.balanceDue <= 0) continue;
      const days = daysBetweenISO(b.date, today);
      const e = rec.get(b.customerId) || {
        name: b.customerNameSnapshot,
        b0_30: 0,
        b31_60: 0,
        b60p: 0,
        total: 0,
      };
      if (days <= 30) e.b0_30 = round2(e.b0_30 + b.balanceDue);
      else if (days <= 60) e.b31_60 = round2(e.b31_60 + b.balanceDue);
      else e.b60p = round2(e.b60p + b.balanceDue);
      e.total = round2(e.total + b.balanceDue);
      rec.set(b.customerId, e);
    }

    const pay = new Map<string, { name: string; b0_30: number; b31_60: number; b60p: number; total: number }>();
    for (const p of db.purchases) {
      if (p.balanceDue <= 0) continue;
      const days = daysBetweenISO(p.date, today);
      const e = pay.get(p.supplierId) || {
        name: p.supplierNameSnapshot,
        b0_30: 0,
        b31_60: 0,
        b60p: 0,
        total: 0,
      };
      if (days <= 30) e.b0_30 = round2(e.b0_30 + p.balanceDue);
      else if (days <= 60) e.b31_60 = round2(e.b31_60 + p.balanceDue);
      else e.b60p = round2(e.b60p + p.balanceDue);
      e.total = round2(e.total + p.balanceDue);
      pay.set(p.supplierId, e);
    }

    return {
      receivables: Array.from(rec.values()),
      payables: Array.from(pay.values()),
    };
  }, [activeBills, db.purchases, today]);

  // 5. Top Selling Items
  const topItems = useMemo(() => {
    const activeIds = new Set(activeBills.map((b) => b.id));
    const map = new Map<string, { name: string; unit: string; qty: number; sales: number }>();
    for (const l of db.billLines) {
      if (!activeIds.has(l.billId)) continue;
      const e = map.get(l.itemId) || { name: l.itemName, unit: l.unit, qty: 0, sales: 0 };
      e.qty = round2(e.qty + l.qty);
      e.sales = round2(e.sales + l.lineTotal);
      map.set(l.itemId, e);
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [activeBills, db.billLines]);

  // 6. Customer-wise Sales
  const customerSales = useMemo(() => {
    const map = new Map<string, { name: string; bills: number; total: number; paid: number; due: number }>();
    for (const b of activeBills) {
      const e = map.get(b.customerId) || {
        name: b.customerNameSnapshot,
        bills: 0,
        total: 0,
        paid: 0,
        due: 0,
      };
      e.bills += 1;
      e.total = round2(e.total + b.grandTotal);
      e.paid = round2(e.paid + b.paidAmount);
      e.due = round2(e.due + b.balanceDue);
      map.set(b.customerId, e);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeBills]);

  const handleExportCurrent = () => {
    if (tab === 'sales') {
      exportToCSV(
        `daily_sales_${today}`,
        ['Date', 'Bills', 'Taxable', 'GST', 'Total Sales'],
        dailySales.map(([d, s]) => [formatDateDDMMYYYY(d), s.count, s.taxable, s.gst, s.total])
      );
    } else if (tab === 'gst') {
      exportToCSV(
        `gstr1_summary_${today}`,
        ['GST Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total'],
        gstSummary.byRate.map(([rate, s]) => [`${rate}%`, s.taxable, s.cgst, s.sgst, s.igst, s.total])
      );
    } else if (tab === 'purchases') {
      exportToCSV(
        `purchase_report_${today}`,
        ['Date', 'Supplier', 'Invoice No', 'Subtotal', 'GST', 'Grand Total', 'Due'],
        db.purchases.map((p) => [
          formatDateDDMMYYYY(p.date),
          p.supplierNameSnapshot,
          p.supplierInvoiceNo,
          p.subtotal,
          p.gstTotal,
          p.grandTotal,
          p.balanceDue,
        ])
      );
    } else if (tab === 'pnl' && isOwner) {
      exportToCSV(
        `profit_loss_items_${today}`,
        ['Item', 'Qty Sold', 'Revenue (Taxable)', 'Cost', 'Profit'],
        pnl.items.map((x) => [x.name, x.qty, x.revenue, x.cost, x.profit])
      );
    } else if (tab === 'ageing') {
      exportToCSV(
        `receivables_ageing_${today}`,
        ['Customer', '0-30 Days', '31-60 Days', '60+ Days', 'Total Due'],
        ageing.receivables.map((r) => [r.name, r.b0_30, r.b31_60, r.b60p, r.total])
      );
    } else if (tab === 'top_items') {
      exportToCSV(
        `top_selling_items_${today}`,
        ['Item', 'Qty Sold', 'Unit', 'Total Sales'],
        topItems.map((x) => [x.name, x.qty, x.unit, x.sales])
      );
    } else if (tab === 'customer_sales') {
      exportToCSV(
        `customer_sales_${today}`,
        ['Customer', 'Bills', 'Total Sales', 'Paid', 'Balance Due'],
        customerSales.map((x) => [x.name, x.bills, x.total, x.paid, x.due])
      );
    } else if (tab === 'audit') {
      exportToCSV(
        `audit_log_${today}`,
        ['Timestamp', 'User', 'Entity', 'Action', 'Summary'],
        db.auditLogs.map((a) => [
          formatDateTimeDDMMYYYY(a.timestamp),
          a.userName,
          a.entityType,
          a.action,
          a.summary,
        ])
      );
    }
  };

  const tabs: Array<[ReportTab, string]> = [
    ['sales', t.reports.dailyMonthly],
    ['gst', t.reports.gstSummary],
    ['purchases', t.reports.purchaseReport],
    ...(isOwner ? [['pnl', t.reports.profitLoss] as [ReportTab, string]] : []),
    ['ageing', t.reports.ageing],
    ['top_items', t.reports.topItems],
    ['customer_sales', t.reports.customerSales],
    ['audit', t.reports.auditLog],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">{t.reports.title}</h1>
        <button
          type="button"
          onClick={handleExportCurrent}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          {t.common.exportCsv}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-200/70 p-1 rounded-lg">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === id ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'sales' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Daily Sales
            </div>
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2 px-3 text-left">Date</th>
                  <th className="py-2 px-3 text-right">Bills</th>
                  <th className="py-2 px-3 text-right">Taxable</th>
                  <th className="py-2 px-3 text-right">GST</th>
                  <th className="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-num">
                {dailySales.map(([d, s]) => (
                  <tr key={d}>
                    <td className="py-2 px-3">{formatDateDDMMYYYY(d)}</td>
                    <td className="py-2 px-3 text-right">{s.count}</td>
                    <td className="py-2 px-3 text-right">{formatINR(s.taxable)}</td>
                    <td className="py-2 px-3 text-right">{formatINR(s.gst)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatINR(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Monthly Sales
            </div>
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2 px-3 text-left">Month</th>
                  <th className="py-2 px-3 text-right">Bills</th>
                  <th className="py-2 px-3 text-right">Taxable</th>
                  <th className="py-2 px-3 text-right">GST</th>
                  <th className="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-num">
                {monthlySales.map(([m, s]) => (
                  <tr key={m}>
                    <td className="py-2 px-3">{m}</td>
                    <td className="py-2 px-3 text-right">{s.count}</td>
                    <td className="py-2 px-3 text-right">{formatINR(s.taxable)}</td>
                    <td className="py-2 px-3 text-right">{formatINR(s.gst)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatINR(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'gst' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-900">B2B (Registered GSTIN Customers)</div>
              <div className="text-xs text-slate-500 font-mono-num">
                Invoices: {gstSummary.b2b.count} · Taxable: {formatINR(gstSummary.b2b.taxable)}
              </div>
              <div className="text-sm font-bold font-mono-num text-emerald-800">
                Total: {formatINR(gstSummary.b2b.total)} (GST{' '}
                {formatINR(gstSummary.b2b.cgst + gstSummary.b2b.sgst + gstSummary.b2b.igst)})
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-900">B2C (Unregistered / Farmers)</div>
              <div className="text-xs text-slate-500 font-mono-num">
                Invoices: {gstSummary.b2c.count} · Taxable: {formatINR(gstSummary.b2c.taxable)}
              </div>
              <div className="text-sm font-bold font-mono-num text-emerald-800">
                Total: {formatINR(gstSummary.b2c.total)} (GST{' '}
                {formatINR(gstSummary.b2c.cgst + gstSummary.b2c.sgst + gstSummary.b2c.igst)})
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Rate-wise GST Breakdown
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">GST Rate</th>
                  <th className="py-2.5 px-4 text-right">Taxable Value</th>
                  <th className="py-2.5 px-4 text-right">CGST</th>
                  <th className="py-2.5 px-4 text-right">SGST</th>
                  <th className="py-2.5 px-4 text-right">IGST</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-num">
                {gstSummary.byRate.map(([rate, r]) => (
                  <tr key={rate}>
                    <td className="py-2.5 px-4 font-semibold">{rate}%</td>
                    <td className="py-2.5 px-4 text-right">{formatINR(r.taxable)}</td>
                    <td className="py-2.5 px-4 text-right">{formatINR(r.cgst)}</td>
                    <td className="py-2.5 px-4 text-right">{formatINR(r.sgst)}</td>
                    <td className="py-2.5 px-4 text-right">{formatINR(r.igst)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">{formatINR(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'purchases' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Date</th>
                <th className="py-2.5 px-4 text-left">Supplier</th>
                <th className="py-2.5 px-4 text-left">Invoice No</th>
                <th className="py-2.5 px-4 text-right">Subtotal</th>
                <th className="py-2.5 px-4 text-right">GST</th>
                <th className="py-2.5 px-4 text-right">Grand Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.purchases.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-4 font-mono-num text-xs">
                    {formatDateDDMMYYYY(p.date)}
                  </td>
                  <td className="py-2.5 px-4 font-medium">{p.supplierNameSnapshot}</td>
                  <td className="py-2.5 px-4 font-mono-num text-xs">{p.supplierInvoiceNo}</td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {formatINR(p.subtotal)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {formatINR(p.gstTotal)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                    {formatINR(p.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pnl' && isOwner && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Profit & Loss by Month (Taxable Revenue - Purchase Cost)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Month</th>
                  <th className="py-2.5 px-4 text-right">Sales (Excl. GST)</th>
                  <th className="py-2.5 px-4 text-right">Purchase Cost</th>
                  <th className="py-2.5 px-4 text-right">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-num">
                {pnl.months.map(([m, s]) => (
                  <tr key={m}>
                    <td className="py-2.5 px-4">{m}</td>
                    <td className="py-2.5 px-4 text-right">{formatINR(s.revenue)}</td>
                    <td className="py-2.5 px-4 text-right">{formatINR(s.cost)}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-bold ${
                        s.profit >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatINR(s.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Profit & Loss by Item
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Item</th>
                  <th className="py-2.5 px-4 text-right">Qty Sold</th>
                  <th className="py-2.5 px-4 text-right">Revenue</th>
                  <th className="py-2.5 px-4 text-right">Cost</th>
                  <th className="py-2.5 px-4 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pnl.items.map((x) => (
                  <tr key={x.name}>
                    <td className="py-2.5 px-4 font-medium">{x.name}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{x.qty}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(x.revenue)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(x.cost)}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono-num font-bold ${
                        x.profit >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatINR(x.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ageing' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Receivables Ageing (Customer Udhaar)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Customer</th>
                  <th className="py-2.5 px-4 text-right">0–30 Days</th>
                  <th className="py-2.5 px-4 text-right">31–60 Days</th>
                  <th className="py-2.5 px-4 text-right">60+ Days</th>
                  <th className="py-2.5 px-4 text-right">Total Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ageing.receivables.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2.5 px-4 font-medium">{r.name}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(r.b0_30)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(r.b31_60)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num text-red-600">
                      {formatINR(r.b60p)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-bold text-amber-700">
                      {formatINR(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
              Payables Ageing (Due to Suppliers)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Supplier</th>
                  <th className="py-2.5 px-4 text-right">0–30 Days</th>
                  <th className="py-2.5 px-4 text-right">31–60 Days</th>
                  <th className="py-2.5 px-4 text-right">60+ Days</th>
                  <th className="py-2.5 px-4 text-right">Total Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ageing.payables.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2.5 px-4 font-medium">{p.name}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(p.b0_30)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(p.b31_60)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(p.b60p)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-bold">
                      {formatINR(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'top_items' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Item</th>
                <th className="py-2.5 px-4 text-right">Qty Sold</th>
                <th className="py-2.5 px-4 text-right">Total Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topItems.map((x) => (
                <tr key={x.name}>
                  <td className="py-2.5 px-4 font-medium">{x.name}</td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {x.qty} {x.unit}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                    {formatINR(x.sales)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'customer_sales' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Customer</th>
                <th className="py-2.5 px-4 text-right">Bills</th>
                <th className="py-2.5 px-4 text-right">Total Sales</th>
                <th className="py-2.5 px-4 text-right">Paid</th>
                <th className="py-2.5 px-4 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customerSales.map((x) => (
                <tr key={x.name}>
                  <td className="py-2.5 px-4 font-medium">{x.name}</td>
                  <td className="py-2.5 px-4 text-right font-mono-num">{x.bills}</td>
                  <td className="py-2.5 px-4 text-right font-mono-num">{formatINR(x.total)}</td>
                  <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700">
                    {formatINR(x.paid)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-amber-700">
                    {formatINR(x.due)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left">Timestamp</th>
                <th className="py-2.5 px-4 text-left">User</th>
                <th className="py-2.5 px-4 text-left">Entity / Action</th>
                <th className="py-2.5 px-4 text-left">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.auditLogs.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                    {formatDateTimeDDMMYYYY(a.timestamp)}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-800">{a.userName}</td>
                  <td className="py-2.5 px-4 font-mono-num text-slate-600">
                    {a.entityType} · {a.action}
                  </td>
                  <td className="py-2.5 px-4 text-slate-800">
                    {a.summary}
                    {a.entityType === 'bill' && (
                      <button
                        type="button"
                        onClick={() => setViewingBillId(a.entityId)}
                        className="ml-2 text-emerald-700 hover:underline font-medium"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
