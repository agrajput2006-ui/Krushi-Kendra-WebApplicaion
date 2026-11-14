import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Download, BookOpen, X, FileText, Edit2, FilePlus2, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Supplier } from '../types/models';
import {
  calculateCustomerLedger,
  calculateSupplierLedger,
  getCustomerClosingBalance,
  getSupplierPayableBalance,
} from '../utils/calculations';
import { formatDateDDMMYYYY, formatINR, todayISO } from '../utils/formatters';
import { downloadStatementPDF, exportToCSV } from '../utils/exports';
import { CustomerFormModal } from '../components/CustomerFormModal';

export function AccountsPage({ mode }: { mode: 'customers' | 'suppliers' }) {
  const {
    db,
    saveSupplier,
    setViewingBillId,
    setViewingPaymentId,
    startBillForCustomer,
    startPaymentForParty,
    ledgerPreselectCustomerId,
    clearLedgerPreselectCustomer,
    showToast,
    t,
  } = useApp();

  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [ledgerPartyId, setLedgerPartyId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Form fields (used for Suppliers)
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [village, setVillage] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');

  const isCust = mode === 'customers';

  useEffect(() => {
    if (isCust && ledgerPreselectCustomerId) {
      setLedgerPartyId(ledgerPreselectCustomerId);
      setDateFrom('');
      setDateTo('');
      clearLedgerPreselectCustomer();
    }
  }, [isCust, ledgerPreselectCustomerId, clearLedgerPreselectCustomer]);

  const openAdd = () => {
    if (isCust) {
      setEditingCustomer(null);
      setShowForm(true);
      return;
    }
    setEditingId(null);
    setName('');
    setMobile('');
    setVillage('');
    setAddress('');
    setGstin('');
    setOpeningBalance('0');
    setShowForm(true);
  };

  const openEdit = (p: Customer | Supplier) => {
    if (isCust) {
      setEditingCustomer(p as Customer);
      setShowForm(true);
      return;
    }
    setEditingId(p.id);
    setName(p.name);
    setMobile(p.mobile);
    setVillage(p.village);
    setAddress(p.address);
    setGstin(p.gstin || '');
    setOpeningBalance(String(p.openingBalance || 0));
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const res = saveSupplier({
      id: editingId || undefined,
      name,
      mobile,
      village,
      address,
      gstin,
      openingBalance: Number(openingBalance) || 0,
    });

    if (!res.ok) {
      showToast('error', res.error || 'Validation failed');
      return;
    }
    showToast('success', `${editingId ? 'Updated' : 'Saved'} ${name}`);
    setShowForm(false);
  };

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (isCust) {
      return db.customers
        .filter(
          (c) =>
            !q ||
            c.name.toLowerCase().includes(q) ||
            c.mobile.includes(q) ||
            c.village.toLowerCase().includes(q) ||
            (c.gstin && c.gstin.toLowerCase().includes(q))
        )
        .map((c) => ({
          party: c,
          balance: getCustomerClosingBalance(c, db.bills, db.payments),
        }));
    } else {
      return db.suppliers
        .filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.mobile.includes(q) ||
            s.village.toLowerCase().includes(q) ||
            (s.gstin && s.gstin.toLowerCase().includes(q))
        )
        .map((s) => ({
          party: s,
          balance: getSupplierPayableBalance(s, db.purchases, db.payments),
        }));
    }
  }, [isCust, query, db.customers, db.suppliers, db.bills, db.purchases, db.payments]);

  const handleExportList = () => {
    exportToCSV(
      `${mode}_${todayISO()}`,
      ['Name', 'Mobile', 'Village', 'GSTIN', 'Opening Balance', 'Closing Balance'],
      filteredList.map(({ party, balance }) => [
        party.name,
        party.mobile,
        party.village,
        party.gstin || '',
        party.openingBalance,
        balance,
      ])
    );
  };

  const activeLedgerCustomer =
    isCust && ledgerPartyId ? db.customers.find((c) => c.id === ledgerPartyId) : null;
  const activeLedgerSupplier =
    !isCust && ledgerPartyId ? db.suppliers.find((s) => s.id === ledgerPartyId) : null;

  const ledgerData = useMemo(() => {
    if (activeLedgerCustomer) {
      return calculateCustomerLedger(
        activeLedgerCustomer,
        db.bills,
        db.payments,
        dateFrom || undefined,
        dateTo || undefined
      );
    }
    if (activeLedgerSupplier) {
      const sup = calculateSupplierLedger(
        activeLedgerSupplier,
        db.purchases,
        db.payments,
        dateFrom || undefined,
        dateTo || undefined
      );
      return {
        entries: sup.entries,
        closingBalance: sup.closingPayable,
      };
    }
    return null;
  }, [activeLedgerCustomer, activeLedgerSupplier, db.bills, db.purchases, db.payments, dateFrom, dateTo]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">
          {isCust ? t.accounts.customersTitle : t.accounts.suppliersTitle}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportList}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            {t.common.exportCsv}
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="min-h-[52px] inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#15803D] text-white text-base font-bold hover:bg-emerald-800 shadow-xs cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            {isCust ? t.accounts.addCustomer : t.accounts.addSupplier}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.accounts.searchPlaceholder}
            className="w-full min-h-[52px] pl-11 pr-3.5 py-2.5 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-10 text-center text-base text-slate-500">{t.common.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F3F4F6] border-b border-slate-200 text-xs text-slate-700">
                <tr>
                  <th className="py-2.5 px-4 text-left">Name</th>
                  <th className="py-2.5 px-4 text-left">{t.accounts.mobile}</th>
                  <th className="py-2.5 px-4 text-left">{t.accounts.village}</th>
                  <th className="py-2.5 px-4 text-left">GSTIN</th>
                  <th className="py-2.5 px-4 text-right">{t.accounts.closingBal}</th>
                  <th className="py-2.5 px-4 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map(({ party, balance }) => (
                  <tr key={party.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{party.name}</td>
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                      {party.mobile}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs">{party.village || '-'}</td>
                    <td className="py-2.5 px-4 font-mono-num text-xs text-slate-500">
                      {party.gstin || '-'}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono-num font-bold ${
                        balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatINR(balance)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1">
                      {isCust && (
                        <button
                          type="button"
                          onClick={() => startBillForCustomer(party.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#15803D] text-white hover:bg-emerald-800 rounded-lg cursor-pointer"
                        >
                          <FilePlus2 className="w-3.5 h-3.5" />
                          {t.accounts.makeBill}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          startPaymentForParty(party.id, isCust ? 'receipt' : 'payout')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#FACC15]/40 text-slate-900 hover:bg-[#FACC15]/70 rounded-lg cursor-pointer"
                      >
                        <Wallet className="w-3.5 h-3.5 text-[#15803D]" />
                        {t.accounts.receivePay}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLedgerPartyId(party.id);
                          setDateFrom('');
                          setDateTo('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#15803D] hover:bg-emerald-50 rounded-lg cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {t.accounts.viewLedger}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(party)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        {t.common.edit}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Add/Edit Modal */}
      {isCust && (
        <CustomerFormModal
          open={showForm}
          onClose={() => setShowForm(false)}
          initialCustomer={editingCustomer}
        />
      )}

      {/* Supplier Add/Edit Modal */}
      {!isCust && showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-[#15803D]">
                {editingId ? t.accounts.editSupplier : t.accounts.addSupplier}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-base">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.accounts.fullName}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[52px] px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.accounts.mobile} *
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="9823045612"
                  className="w-full min-h-[52px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.accounts.village}
                </label>
                <input
                  type="text"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  className="w-full min-h-[52px] px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.accounts.address}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full min-h-[52px] px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.accounts.gstin}
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AABCU9603R1ZM"
                  className="w-full min-h-[52px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t.accounts.openingBal}
                </label>
                <input
                  type="number"
                  step="any"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full min-h-[52px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="min-h-[52px] px-4 py-2 rounded-xl border border-slate-300 text-base text-slate-700"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[52px] px-5 py-2 rounded-xl bg-[#15803D] text-white text-base font-bold hover:bg-emerald-800"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account Ledger Modal */}
      {ledgerPartyId && ledgerData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {activeLedgerCustomer?.name || activeLedgerSupplier?.name} — Account Ledger
                </h2>
                <div className="text-xs text-slate-500 font-mono-num">
                  Ph: {activeLedgerCustomer?.mobile || activeLedgerSupplier?.mobile} ·{' '}
                  {activeLedgerCustomer?.village || activeLedgerSupplier?.village}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeLedgerCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = activeLedgerCustomer.id;
                      setLedgerPartyId(null);
                      startBillForCustomer(id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FACC15] text-slate-900 text-xs font-bold hover:brightness-95 cursor-pointer"
                  >
                    <FilePlus2 className="w-3.5 h-3.5 text-[#15803D]" />
                    {t.accounts.makeBill}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const id = (activeLedgerCustomer || activeLedgerSupplier)?.id;
                    if (!id) return;
                    setLedgerPartyId(null);
                    startPaymentForParty(id, isCust ? 'receipt' : 'payout');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#15803D] bg-white text-[#15803D] text-xs font-bold hover:bg-emerald-50 cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  {t.accounts.receivePay}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const partyName =
                      activeLedgerCustomer?.name || activeLedgerSupplier?.name || 'Account';
                    downloadStatementPDF(
                      db.shop,
                      `${partyName} - Account Statement`,
                      `Period: ${dateFrom ? formatDateDDMMYYYY(dateFrom) : 'Start'} to ${
                        dateTo ? formatDateDDMMYYYY(dateTo) : formatDateDDMMYYYY(todayISO())
                      }`,
                      ledgerData.entries,
                      ledgerData.closingBalance,
                      activeLedgerCustomer || undefined
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {t.accounts.extractStatement} (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportToCSV(
                      `ledger_${ledgerPartyId}`,
                      ['Date', 'Ref No', 'Description', 'Debit', 'Credit', 'Running Balance'],
                      ledgerData.entries.map((e) => [
                        formatDateDDMMYYYY(e.date),
                        e.refNumber,
                        e.description,
                        e.debit,
                        e.credit,
                        e.runningBalance,
                      ])
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerPartyId(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Date filters */}
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-slate-500">From:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-slate-500">To:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono-num"
                />
              </label>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-emerald-700 font-medium hover:underline"
                >
                  {t.common.reset}
                </button>
              )}
              <div className="ml-auto font-mono-num font-bold text-sm">
                Closing Balance:{' '}
                <span className={ledgerData.closingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                  {formatINR(ledgerData.closingBalance)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Date</th>
                    <th className="py-2.5 px-4 text-left">Ref No</th>
                    <th className="py-2.5 px-4 text-left">Particulars</th>
                    <th className="py-2.5 px-4 text-right">Debit</th>
                    <th className="py-2.5 px-4 text-right">Credit</th>
                    <th className="py-2.5 px-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerData.entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono-num text-xs text-slate-600">
                        {formatDateDDMMYYYY(entry.date)}
                      </td>
                      <td className="py-2.5 px-4 font-mono-num text-xs">
                        {entry.type === 'bill' && entry.refId ? (
                          <button
                            type="button"
                            onClick={() => setViewingBillId(entry.refId!)}
                            className="text-emerald-700 font-semibold hover:underline"
                          >
                            {entry.refNumber}
                          </button>
                        ) : (entry.type === 'payment' || entry.type === 'payout') && entry.refId ? (
                          <button
                            type="button"
                            onClick={() => setViewingPaymentId(entry.refId!)}
                            className="text-emerald-700 font-semibold hover:underline"
                          >
                            {entry.refNumber}
                          </button>
                        ) : (
                          entry.refNumber
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">{entry.description}</td>
                      <td className="py-2.5 px-4 text-right font-mono-num">
                        {entry.debit > 0 ? formatINR(entry.debit) : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700">
                        {entry.credit > 0 ? formatINR(entry.credit) : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                        {formatINR(entry.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
