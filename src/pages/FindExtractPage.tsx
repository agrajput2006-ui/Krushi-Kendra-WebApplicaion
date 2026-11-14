import React, { useMemo, useState } from 'react';
import { Search, FileText, Download, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateCustomerLedger, LedgerEntry } from '../utils/calculations';
import { formatDateDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { downloadStatementPDF, exportToCSV } from '../utils/exports';

interface SearchResultRow {
  id: string;
  kind: 'bill' | 'payment' | 'customer' | 'item';
  date: string;
  refNumber: string;
  title: string;
  subtitle: string;
  mode: string;
  status: string;
  amount: number;
  targetId: string;
}

export function FindExtractPage() {
  const {
    db,
    setViewingBillId,
    setViewingPaymentId,
    setActiveTab,
    viewCustomerKhata,
    t,
  } = useApp();

  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [statementCustomerId, setStatementCustomerId] = useState<string>('ALL');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: SearchResultRow[] = [];

    // 1. Bills
    for (const b of db.bills) {
      if (dateFrom && b.date < dateFrom) continue;
      if (dateTo && b.date > dateTo) continue;
      if (modeFilter !== 'ALL' && b.paymentMode !== modeFilter) continue;
      if (statusFilter !== 'ALL' && b.status !== statusFilter) continue;

      const lines = db.billLines.filter((l) => l.billId === b.id);
      const itemNames = lines.map((l) => l.itemName).join(', ');
      const matchesQuery =
        !q ||
        b.billNumber.toLowerCase().includes(q) ||
        b.customerNameSnapshot.toLowerCase().includes(q) ||
        (b.customerMobileSnapshot && b.customerMobileSnapshot.includes(q)) ||
        (b.customerGstinSnapshot && b.customerGstinSnapshot.toLowerCase().includes(q)) ||
        itemNames.toLowerCase().includes(q);

      if (matchesQuery) {
        out.push({
          id: `bill_${b.id}`,
          kind: 'bill',
          date: b.date,
          refNumber: b.billNumber,
          title: b.customerNameSnapshot,
          subtitle: `${lines.length} items (${lines.map((l) => l.itemName).slice(0, 2).join(', ')})`,
          mode: b.paymentMode,
          status: b.status,
          amount: b.grandTotal,
          targetId: b.id,
        });
      }
    }

    // 2. Payments / Receipts
    if (statusFilter === 'ALL') {
      for (const p of db.payments) {
        if (dateFrom && p.date < dateFrom) continue;
        if (dateTo && p.date > dateTo) continue;
        if (modeFilter !== 'ALL' && p.mode !== modeFilter) continue;

        const party =
          p.type === 'receipt'
            ? db.customers.find((c) => c.id === p.partyId)
            : db.suppliers.find((s) => s.id === p.partyId);

        const matchesQuery =
          !q ||
          p.receiptNumber.toLowerCase().includes(q) ||
          p.partyNameSnapshot.toLowerCase().includes(q) ||
          (party?.mobile && party.mobile.includes(q)) ||
          (party?.gstin && party.gstin.toLowerCase().includes(q)) ||
          (p.referenceNo && p.referenceNo.toLowerCase().includes(q));

        if (matchesQuery) {
          out.push({
            id: `pay_${p.id}`,
            kind: 'payment',
            date: p.date,
            refNumber: p.receiptNumber,
            title: p.partyNameSnapshot,
            subtitle: p.type === 'receipt' ? 'Payment Receipt' : 'Supplier Payout',
            mode: p.mode,
            status: p.type === 'receipt' ? 'Receipt' : 'Payout',
            amount: p.amount,
            targetId: p.id,
          });
        }
      }
    }

    // 3. Customers (when text query matches customer and no mode/status filters restrict)
    if (q && modeFilter === 'ALL' && statusFilter === 'ALL') {
      for (const c of db.customers) {
        if (
          c.name.toLowerCase().includes(q) ||
          c.mobile.includes(q) ||
          (c.gstin && c.gstin.toLowerCase().includes(q)) ||
          c.village.toLowerCase().includes(q)
        ) {
          const custBills = db.bills.filter(
            (b) => b.customerId === c.id && b.status !== 'Cancelled'
          );
          out.push({
            id: `cust_${c.id}`,
            kind: 'customer',
            date: c.createdAt.split('T')[0],
            refNumber: c.mobile,
            title: `${c.name} (${c.village})`,
            subtitle: `Customer Account · ${custBills.length} bills`,
            mode: '-',
            status: 'Account',
            amount: custBills.reduce((s, b) => s + b.balanceDue, 0),
            targetId: c.id,
          });
        }
      }

      for (const it of db.items) {
        if (
          it.name.toLowerCase().includes(q) ||
          it.code.toLowerCase().includes(q) ||
          it.hsnCode.toLowerCase().includes(q)
        ) {
          out.push({
            id: `item_${it.id}`,
            kind: 'item',
            date: it.createdAt.split('T')[0],
            refNumber: it.code,
            title: it.name,
            subtitle: `${it.category} · ${it.brand} · HSN ${it.hsnCode || '-'}`,
            mode: '-',
            status: 'Item',
            amount: it.sellingPrice,
            targetId: it.id,
          });
        }
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [db, query, dateFrom, dateTo, modeFilter, statusFilter]);

  const handleExtractRow = (row: SearchResultRow) => {
    if (row.kind === 'bill') {
      setViewingBillId(row.targetId);
    } else if (row.kind === 'payment') {
      setViewingPaymentId(row.targetId);
    } else if (row.kind === 'customer') {
      viewCustomerKhata(row.targetId);
    } else if (row.kind === 'item') {
      setActiveTab('items');
    }
  };

  // Combined Statement Builder (Customer OR All Records in Date Range)
  const buildCombinedStatement = (): {
    title: string;
    subtitle: string;
    entries: LedgerEntry[];
    closingBalance: number;
    customer?: typeof db.customers[number];
  } => {
    if (statementCustomerId !== 'ALL') {
      const cust = db.customers.find((c) => c.id === statementCustomerId);
      if (cust) {
        const ledger = calculateCustomerLedger(
          cust,
          db.bills,
          db.payments,
          dateFrom || undefined,
          dateTo || undefined
        );
        return {
          title: `${cust.name} - Combined Statement`,
          subtitle: `Period: ${dateFrom ? formatDateDDMMYYYY(dateFrom) : 'Beginning'} to ${
            dateTo ? formatDateDDMMYYYY(dateTo) : formatDateDDMMYYYY(todayISO())
          }`,
          entries: ledger.entries,
          closingBalance: ledger.closingBalance,
          customer: cust,
        };
      }
    }

    // All transactions in date range
    const billsInRange = db.bills
      .filter((b) => b.status !== 'Cancelled')
      .filter((b) => (!dateFrom || b.date >= dateFrom) && (!dateTo || b.date <= dateTo))
      .map((b) => ({
        id: `b_${b.id}`,
        date: b.date,
        createdAt: b.createdAt,
        type: 'bill' as const,
        refNumber: b.billNumber,
        refId: b.id,
        description: `${b.customerNameSnapshot} (${b.paymentMode})`,
        debit: b.grandTotal,
        credit: 0,
      }));

    const paysInRange = db.payments
      .filter((p) => p.type === 'receipt')
      .filter((p) => (!dateFrom || p.date >= dateFrom) && (!dateTo || p.date <= dateTo))
      .map((p) => ({
        id: `p_${p.id}`,
        date: p.date,
        createdAt: p.createdAt,
        type: 'payment' as const,
        refNumber: p.receiptNumber,
        refId: p.id,
        description: `Receipt: ${p.partyNameSnapshot} (${p.mode})`,
        debit: 0,
        credit: p.amount,
      }));

    const combined = [...billsInRange, ...paysInRange].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.localeCompare(b.createdAt)
    );

    let running = 0;
    const entries: LedgerEntry[] = combined.map((r) => {
      running = running + r.debit - r.credit;
      return { ...r, runningBalance: running };
    });

    return {
      title: 'All Sales & Receipts Statement',
      subtitle: `Period: ${dateFrom ? formatDateDDMMYYYY(dateFrom) : 'Beginning'} to ${
        dateTo ? formatDateDDMMYYYY(dateTo) : formatDateDDMMYYYY(todayISO())
      }`,
      entries,
      closingBalance: running,
    };
  };

  const handleExtractStatementPDF = () => {
    const st = buildCombinedStatement();
    downloadStatementPDF(
      db.shop,
      st.title,
      st.subtitle,
      st.entries,
      st.closingBalance,
      st.customer
    );
  };

  const handleExtractStatementCSV = () => {
    const st = buildCombinedStatement();
    exportToCSV(
      st.title,
      ['Date', 'Ref No', 'Particulars', 'Debit (Bills)', 'Credit (Receipts)', 'Running Balance'],
      st.entries.map((e) => [
        formatDateDDMMYYYY(e.date),
        e.refNumber,
        e.description,
        e.debit,
        e.credit,
        e.runningBalance,
      ])
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{t.find.title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t.find.subtitle}</p>
      </div>

      {/* Global Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.find.searchPlaceholder}
            className="w-full pl-11 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-500 mb-1">{t.find.fromDate}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">{t.find.toDate}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">{t.common.mode}</label>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Modes</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Bank">Bank</option>
              <option value="Credit">Credit</option>
              <option value="Part">Part</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">{t.common.status}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Partly paid">Partly paid</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Extract All Records Statement Panel */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-semibold text-emerald-900">
            Extract Combined Statement (Bills + Payments + Closing Balance):
          </div>
          <select
            value={statementCustomerId}
            onChange={(e) => setStatementCustomerId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-emerald-300 rounded-lg bg-white"
          >
            <option value="ALL">All Customers (Date Range)</option>
            {db.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.mobile})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExtractStatementPDF}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
          >
            <FileText className="w-3.5 h-3.5" />
            Statement PDF
          </button>
          <button
            type="button"
            onClick={handleExtractStatementCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-xs font-semibold hover:bg-emerald-50"
          >
            <Download className="w-3.5 h-3.5" />
            Statement Excel/CSV
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing <strong className="font-mono-num text-slate-900">{results.length}</strong>{' '}
            matching records
          </span>
          <button
            type="button"
            onClick={() =>
              exportToCSV(
                `search_results_${todayISO()}`,
                ['Type', 'Date', 'Ref No', 'Party / Title', 'Details', 'Mode', 'Status', 'Amount'],
                results.map((r) => [
                  r.kind,
                  formatDateDDMMYYYY(r.date),
                  r.refNumber,
                  r.title,
                  r.subtitle,
                  r.mode,
                  r.status,
                  r.amount,
                ])
              )
            }
            className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            {t.common.exportCsv}
          </button>
        </div>

        {results.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{t.common.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left">Date</th>
                  <th className="py-2.5 px-4 text-left">Ref No</th>
                  <th className="py-2.5 px-4 text-left">Customer / Record</th>
                  <th className="py-2.5 px-4 text-left">Mode / Status</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                      {formatDateDDMMYYYY(row.date)}
                    </td>
                    <td className="py-2.5 px-4 font-mono-num font-semibold text-slate-900">
                      {row.refNumber}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{row.title}</div>
                      <div className="text-xs text-slate-500 truncate max-w-md">{row.subtitle}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <span className="text-slate-600">{row.mode}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span
                        className={
                          row.status === 'Paid' || row.status === 'Receipt'
                            ? 'text-emerald-700 font-medium'
                            : row.status === 'Cancelled'
                            ? 'text-red-600 font-medium'
                            : 'text-amber-700 font-medium'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-bold text-slate-900">
                      {formatINR(row.amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleExtractRow(row)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {row.kind === 'bill' || row.kind === 'payment'
                          ? t.find.extractBill
                          : t.common.view}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
