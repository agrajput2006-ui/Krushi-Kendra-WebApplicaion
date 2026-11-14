import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FilePlus2, UserPlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer } from '../types/models';

interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  initialCustomer?: Customer | null;
  onSaved?: (customer: Customer) => void;
  onSaveAndBill?: (customer: Customer) => void;
}

export function CustomerFormModal({
  open,
  onClose,
  initialCustomer,
  onSaved,
  onSaveAndBill,
}: CustomerFormModalProps) {
  const { saveCustomer, startBillForCustomer, showToast, t } = useApp();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [village, setVillage] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [creditLimit, setCreditLimit] = useState('25000');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [showOptional, setShowOptional] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialCustomer) {
      setName(initialCustomer.name);
      setMobile(initialCustomer.mobile);
      setVillage(initialCustomer.village);
      setAddress(initialCustomer.address);
      setGstin(initialCustomer.gstin || '');
      setFarmerId(initialCustomer.aadhaarFarmerId || '');
      setCreditLimit(String(initialCustomer.creditLimit ?? 25000));
      setOpeningBalance(String(initialCustomer.openingBalance ?? 0));
      setShowOptional(
        Boolean(initialCustomer.gstin || initialCustomer.aadhaarFarmerId || initialCustomer.openingBalance)
      );
    } else {
      setName('');
      setMobile('');
      setVillage('');
      setAddress('');
      setGstin('');
      setFarmerId('');
      setCreditLimit('25000');
      setOpeningBalance('0');
      setShowOptional(false);
    }
  }, [open, initialCustomer]);

  if (!open) return null;

  const submitCustomer = (andCreateBill: boolean) => {
    setError('');
    const res = saveCustomer({
      id: initialCustomer?.id,
      name,
      mobile,
      village,
      address,
      gstin,
      aadhaarFarmerId: farmerId,
      creditLimit: Number(creditLimit) || 0,
      openingBalance: initialCustomer ? Number(openingBalance) || 0 : Number(openingBalance) || 0,
    });

    if (!res.ok || !res.customer) {
      setError(res.error || 'Could not save customer.');
      return;
    }

    showToast('success', `${t.accounts.customerSaved} (${res.customer.name})`);
    onSaved?.(res.customer);
    onClose();

    if (andCreateBill) {
      if (onSaveAndBill) {
        onSaveAndBill(res.customer);
      } else {
        startBillForCustomer(res.customer.id);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    submitCustomer(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 bg-[#F3F4F6] border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#15803D] text-white flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-extrabold text-[#15803D]">
              {initialCustomer ? t.accounts.editCustomer : t.accounts.addCustomer}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-white hover:text-slate-900 cursor-pointer"
            aria-label={t.common.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-base">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.accounts.fullName}
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="उदा. रमेश तुकाराम पाटील"
                className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.accounts.mobile} *
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                inputMode="numeric"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9823045612"
                className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl font-mono-num focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.accounts.village}
              </label>
              <input
                type="text"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder="कासमपुरा / पाचोरा"
                className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.accounts.address}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>
          </div>

          {/* Optional Tax, Credit Limit & Previous Khata Carry-Forward */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="w-full px-4 py-3 bg-[#F3F4F6] flex items-center justify-between text-sm font-semibold text-slate-700 cursor-pointer"
            >
              <span>{t.accounts.optionalTaxCredit}</span>
              {showOptional ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showOptional && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t.accounts.creditLimit}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t.accounts.openingBal}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t.accounts.gstin}
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="27AABCU9603R1ZM"
                    className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t.accounts.farmerId}
                  </label>
                  <input
                    type="text"
                    value={farmerId}
                    onChange={(e) => setFarmerId(e.target.value)}
                    className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-200 bg-[#F3F4F6]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[52px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t.common.cancel}
          </button>
          {!initialCustomer && (
            <button
              type="button"
              onClick={() => submitCustomer(true)}
              className="min-h-[52px] px-4 py-2.5 rounded-xl bg-[#FACC15] text-slate-900 text-base font-bold hover:brightness-95 inline-flex items-center gap-2 cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4 text-[#15803D]" />
              {t.accounts.saveAndBillBtn}
            </button>
          )}
          <button
            type="submit"
            className="min-h-[52px] px-6 py-2.5 rounded-xl bg-[#15803D] text-white text-base font-bold hover:bg-emerald-800 shadow-xs cursor-pointer"
          >
            {t.accounts.saveCustomerBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
