import React, { useMemo, useState } from 'react';
import {
  PlusCircle,
  Wallet,
  ScanLine,
  Search,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Download,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getBatchExpiryStatus,
  getCustomerClosingBalance,
  getItemTotalStock,
} from '../utils/calculations';
import { addDaysISO, formatDateDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { exportToCSV } from '../utils/exports';
import { CustomerFormModal } from '../components/CustomerFormModal';

export function DashboardPage() {
  const {
    db,
    setActiveTab,
    setViewingBillId,
    setViewingPaymentId,
    t,
  } = useApp();

  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const today = todayISO();

  const metrics = useMemo(() => {
    const todaySales = db.bills
      .filter((b) => b.date === today && b.status !== 'Cancelled')
      .reduce((sum, b) => sum + b.grandTotal, 0);

    const todayReceipts = db.payments
      .filter((p) => p.type === 'receipt' && p.date === today)
      .reduce((sum, p) => sum + p.amount, 0);

    const totalUdhaar = db.customers.reduce(
      (sum, c) => sum + Math.max(0, getCustomerClosingBalance(c, db.bills, db.payments)),
      0
    );

    const lowStockItems = db.items.filter(
      (it) => getItemTotalStock(it.id, db.batches) <= it.minStockLevel
    );

    const expiryAlerts = db.batches.filter((b) => {
      if (b.quantity <= 0) return false;
      const st = getBatchExpiryStatus(b, today);
      return st === 'expiring_soon' || st === 'expired';
    });

    return {
      todaySales,
      todayReceipts,
      totalUdhaar,
      lowStockCount: lowStockItems.length,
      expiryCount: expiryAlerts.length,
    };
  }, [db.bills, db.payments, db.customers, db.items, db.batches, today]);

  // Last 30 days series
  const chartDays = useMemo(() => {
    const days: Array<{ date: string; label: string; sales: number; receipts: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDaysISO(today, -i);
      const sales = db.bills
        .filter((b) => b.date === d && b.status !== 'Cancelled')
        .reduce((s, b) => s + b.grandTotal, 0);
      const receipts = db.payments
        .filter((p) => p.type === 'receipt' && p.date === d)
        .reduce((s, p) => s + p.amount, 0);
      days.push({
        date: d,
        label: d.slice(8, 10) + '/' + d.slice(5, 7),
        sales,
        receipts,
      });
    }
    return days;
  }, [db.bills, db.payments, today]);

  const maxChartVal = Math.max(
    1000,
    ...chartDays.map((d) => Math.max(d.sales, d.receipts))
  );

  // Last 10 combined transactions (bills + payments)
  const recentTransactions = useMemo(() => {
    const billTx = db.bills.map((b) => ({
      id: b.id,
      kind: 'bill' as const,
      date: b.date,
      createdAt: b.createdAt,
      ref: b.billNumber,
      party: b.customerNameSnapshot,
      mode: b.paymentMode,
      status: b.status,
      amount: b.grandTotal,
    }));
    const payTx = db.payments.map((p) => ({
      id: p.id,
      kind: 'payment' as const,
      date: p.date,
      createdAt: p.createdAt,
      ref: p.receiptNumber,
      party: p.partyNameSnapshot,
      mode: p.mode,
      status: p.type === 'receipt' ? 'Receipt' : 'Payout',
      amount: p.amount,
    }));
    return [...billTx, ...payTx]
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, 10);
  }, [db.bills, db.payments]);

  const handleExportRecent = () => {
    exportToCSV(
      `recent_transactions_${today}`,
      ['Date', 'Type', 'Number', 'Party', 'Mode', 'Status', 'Amount (INR)'],
      recentTransactions.map((tx) => [
        formatDateDDMMYYYY(tx.date),
        tx.kind === 'bill' ? 'Sale Bill' : tx.status,
        tx.ref,
        tx.party,
        tx.mode,
        tx.status,
        tx.amount,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('new-bill')}
          className="min-h-[52px] flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-[#15803D] text-white font-bold text-base hover:bg-emerald-800 transition-colors shadow-xs cursor-pointer"
        >
          <PlusCircle className="w-5 h-5 shrink-0" />
          <span className="truncate">{t.dashboard.quickNewBill}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAddCustomer(true)}
          className="min-h-[52px] flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-[#FACC15] text-slate-900 font-bold text-base hover:brightness-95 transition-all shadow-xs cursor-pointer"
        >
          <UserPlus className="w-5 h-5 text-[#15803D] shrink-0" />
          <span className="truncate">{t.accounts.addCustomer}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className="min-h-[52px] flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base hover:bg-[#F3F4F6] transition-colors cursor-pointer"
        >
          <Wallet className="w-5 h-5 text-[#15803D] shrink-0" />
          <span className="truncate">{t.dashboard.quickReceivePay}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scan-bill')}
          className="min-h-[52px] flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base hover:bg-[#F3F4F6] transition-colors cursor-pointer"
        >
          <ScanLine className="w-5 h-5 text-[#15803D] shrink-0" />
          <span className="truncate">{t.dashboard.quickScanBill}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('find')}
          className="min-h-[52px] flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base hover:bg-[#F3F4F6] transition-colors cursor-pointer"
        >
          <Search className="w-5 h-5 text-[#15803D] shrink-0" />
          <span className="truncate">{t.dashboard.quickFind}</span>
        </button>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">{t.dashboard.todaySales}</div>
          <div className="text-2xl font-bold text-slate-900 font-mono-num mt-1.5">
            {formatINR(metrics.todaySales)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-num">
            {formatDateDDMMYYYY(today)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">{t.dashboard.todayReceipts}</div>
          <div className="text-2xl font-bold text-emerald-700 font-mono-num mt-1.5">
            {formatINR(metrics.todayReceipts)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Cash · UPI · Bank</div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>{t.dashboard.totalUdhaar}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono-num mt-1.5">
            {formatINR(metrics.totalUdhaar)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {db.customers.length} accounts
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>{t.dashboard.lowStock}</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div
            className={`text-2xl font-bold font-mono-num mt-1.5 ${
              metrics.lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {metrics.lowStockCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">Below min stock level</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>{t.dashboard.nearingExpiry}</span>
            <Clock className="w-3.5 h-3.5 text-red-600" />
          </div>
          <div
            className={`text-2xl font-bold font-mono-num mt-1.5 ${
              metrics.expiryCount > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {metrics.expiryCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">Batches ≤ 60 days / expired</div>
        </button>
      </div>

      {/* 30-Day Sales vs Payments Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t.dashboard.salesVsPayments30d}
          </h2>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-700 inline-block" />
              {t.dashboard.salesLegend}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
              {t.dashboard.paymentsLegend}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="h-44 flex items-end gap-1.5 border-b border-slate-200 pb-1">
              {chartDays.map((day) => {
                const salesH = Math.round((day.sales / maxChartVal) * 150);
                const recH = Math.round((day.receipts / maxChartVal) * 150);
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center justify-end group relative"
                    title={`${formatDateDDMMYYYY(day.date)} — Sales: ${formatINR(
                      day.sales
                    )}, Receipts: ${formatINR(day.receipts)}`}
                  >
                    <div className="w-full flex items-end justify-center gap-0.5 h-[156px]">
                      <div
                        style={{ height: `${day.sales > 0 ? Math.max(4, salesH) : 0}px` }}
                        className="w-2 bg-emerald-700 rounded-t-sm transition-all"
                      />
                      <div
                        style={{ height: `${day.receipts > 0 ? Math.max(4, recH) : 0}px` }}
                        className="w-2 bg-amber-500 rounded-t-sm transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono-num mt-1.5">
              <span>{formatDateDDMMYYYY(chartDays[0]?.date)}</span>
              <span>{formatDateDDMMYYYY(chartDays[14]?.date)}</span>
              <span>{formatDateDDMMYYYY(chartDays[29]?.date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Last 10 Transactions */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {t.dashboard.recentTransactions}
          </h2>
          <button
            type="button"
            onClick={handleExportRecent}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            {t.common.exportCsv}
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t.common.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">{t.common.date}</th>
                  <th className="py-2.5 px-4 text-left">Ref No</th>
                  <th className="py-2.5 px-4 text-left">Customer / Party</th>
                  <th className="py-2.5 px-4 text-left">{t.common.mode}</th>
                  <th className="py-2.5 px-4 text-left">{t.common.status}</th>
                  <th className="py-2.5 px-4 text-right">{t.common.amount}</th>
                  <th className="py-2.5 px-4 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <tr key={`${tx.kind}_${tx.id}`} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                      {formatDateDDMMYYYY(tx.date)}
                    </td>
                    <td className="py-2.5 px-4 font-mono-num font-medium text-slate-900">
                      {tx.ref}
                    </td>
                    <td className="py-2.5 px-4 text-slate-800">{tx.party}</td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs">{tx.mode}</td>
                    <td className="py-2.5 px-4 text-xs">
                      <span
                        className={
                          tx.status === 'Paid' || tx.status === 'Receipt'
                            ? 'text-emerald-700 font-medium'
                            : tx.status === 'Cancelled'
                            ? 'text-red-600 font-medium'
                            : 'text-amber-700 font-medium'
                        }
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-slate-900">
                      {formatINR(tx.amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          tx.kind === 'bill'
                            ? setViewingBillId(tx.id)
                            : setViewingPaymentId(tx.id)
                        }
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
                      >
                        {t.find.extractBill}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CustomerFormModal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
      />
    </div>
  );
}
