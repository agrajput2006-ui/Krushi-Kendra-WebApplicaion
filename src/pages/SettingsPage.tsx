import React, { useState } from 'react';
import { Download, Upload, Trash2, RotateCcw, Lock, Shield, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GstRate, InvoiceTemplateType } from '../types/models';
import { todayISO } from '../utils/formatters';

export function SettingsPage() {
  const {
    db,
    isOwner,
    activeUser,
    updateShop,
    updateSettings,
    switchUser,
    exportBackupJson,
    importBackupJson,
    clearSampleData,
    reseedSampleData,
    lockApp,
    showToast,
    t,
  } = useApp();

  const [shopForm, setShopForm] = useState(db.shop);
  const [billPrefix, setBillPrefix] = useState(db.settings.billPrefix);
  const [receiptPrefix, setReceiptPrefix] = useState(db.settings.receiptPrefix);
  const [fy, setFy] = useState(db.settings.currentFinancialYear);
  const [template, setTemplate] = useState<InvoiceTemplateType>(db.settings.invoiceTemplate);
  const [defaultGst, setDefaultGst] = useState<GstRate>(db.settings.defaultGstRate);
  const [allowNegative, setAllowNegative] = useState(db.settings.allowNegativeStock);
  const [pinEnabled, setPinEnabled] = useState(db.settings.pinLockEnabled);
  const [pinCode, setPinCode] = useState(db.settings.shopPin);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSaveShop = (e: React.FormEvent) => {
    e.preventDefault();
    updateShop(shopForm);
    showToast('success', 'Shop profile saved!');
  };

  const handleSavePrefs = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      billPrefix: billPrefix.trim() || 'SK',
      receiptPrefix: receiptPrefix.trim() || 'RCPT',
      currentFinancialYear: fy.trim() || '2026-27',
      invoiceTemplate: template,
      defaultGstRate: defaultGst,
      allowNegativeStock: allowNegative,
      pinLockEnabled: pinEnabled,
      shopPin: pinCode.trim() || '1234',
    });
    showToast('success', 'Settings saved!');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setShopForm((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadJson = () => {
    const json = exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surana_krushikendra_backup_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'Full JSON backup downloaded.');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const res = importBackupJson(reader.result);
      if (res.ok) {
        showToast('success', 'Backup restored successfully!');
      } else {
        showToast('error', res.error || 'Import failed');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-lg font-bold text-slate-900">{t.settings.title}</h1>

      {/* User Role & PIN Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">{t.settings.usersPin}</h2>
          </div>
          {db.settings.pinLockEnabled && (
            <button
              type="button"
              onClick={lockApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock Screen Now
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {db.users.map((u) => {
            const active = u.id === activeUser.id;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  switchUser(u.id);
                  showToast('success', `Switched user to ${u.name}`);
                }}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  active
                    ? 'border-emerald-700 bg-emerald-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-900">{u.name}</span>
                  {active && <Check className="w-4 h-4 text-emerald-700" />}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {u.role === 'owner'
                    ? 'Full access: edit prices, view profit, cancel bills, backup/clear data'
                    : 'Counter Staff: can bill, receive payments, search. Cannot edit prices, see profit, or delete.'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!isOwner ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Switch to an Owner account above to edit shop profile, tax preferences, or clear/restore data.
        </div>
      ) : (
        <>
          {/* Shop Profile */}
          <form
            onSubmit={handleSaveShop}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">{t.settings.shopProfile}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Shop Name</label>
                <input
                  type="text"
                  required
                  value={shopForm.name}
                  onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                <input
                  type="text"
                  required
                  value={shopForm.address}
                  onChange={(e) => setShopForm({ ...shopForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mobile</label>
                <input
                  type="text"
                  value={shopForm.mobile}
                  onChange={(e) => setShopForm({ ...shopForm, mobile: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Shop GSTIN</label>
                <input
                  type="text"
                  value={shopForm.gstin}
                  onChange={(e) =>
                    setShopForm({ ...shopForm, gstin: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Seed License No
                </label>
                <input
                  type="text"
                  value={shopForm.seedLicense}
                  onChange={(e) => setShopForm({ ...shopForm, seedLicense: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Fertilizer License No
                </label>
                <input
                  type="text"
                  value={shopForm.fertilizerLicense}
                  onChange={(e) => setShopForm({ ...shopForm, fertilizerLicense: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Pesticide License No
                </label>
                <input
                  type="text"
                  value={shopForm.pesticideLicense}
                  onChange={(e) => setShopForm({ ...shopForm, pesticideLicense: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Shop Logo (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="w-full text-xs text-slate-600"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Invoice Terms & Conditions
                </label>
                <input
                  type="text"
                  value={shopForm.termsAndConditions}
                  onChange={(e) =>
                    setShopForm({ ...shopForm, termsAndConditions: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
              >
                Save Shop Profile
              </button>
            </div>
          </form>

          {/* Billing & Tax Preferences */}
          <form
            onSubmit={handleSavePrefs}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">{t.settings.billingPrefs}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bill Prefix</label>
                <input
                  type="text"
                  value={billPrefix}
                  onChange={(e) => setBillPrefix(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Receipt Prefix
                </label>
                <input
                  type="text"
                  value={receiptPrefix}
                  onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Financial Year
                </label>
                <input
                  type="text"
                  value={fy}
                  onChange={(e) => setFy(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Default Invoice Template
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as InvoiceTemplateType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="a4">A4 GST Tax Invoice</option>
                  <option value="thermal80">80mm Thermal Receipt</option>
                  <option value="thermal58">58mm Thermal Receipt</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Default GST Rate
                </label>
                <select
                  value={defaultGst}
                  onChange={(e) => setDefaultGst(Number(e.target.value) as GstRate)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono-num"
                >
                  {[0, 5, 12, 18].map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Shop PIN (4 digits)
                </label>
                <input
                  type="text"
                  maxLength={8}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-1 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowNegative}
                  onChange={(e) => setAllowNegative(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700"
                />
                <span>Allow Negative Stock Billing (Owner Override)</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinEnabled}
                  onChange={(e) => setPinEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700"
                />
                <span>Enable PIN Lock on App Open</span>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
              >
                Save Preferences
              </button>
            </div>
          </form>

          {/* Backup, Restore & Sample Data */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">{t.settings.backupRestore}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                <Download className="w-4 h-4" />
                {t.settings.exportBackup}
              </button>

              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50">
                <Upload className="w-4 h-4" />
                <span>{t.settings.importBackup}</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportJson}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  reseedSampleData();
                  showToast('success', 'Sample data loaded.');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-semibold hover:bg-emerald-100"
              >
                <RotateCcw className="w-4 h-4" />
                {t.settings.reseedSample}
              </button>

              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                  {t.settings.clearSample}
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 border border-red-300 px-3 py-1.5 rounded-lg">
                  <span className="text-xs text-red-800 font-medium">Clear all bills, items & parties?</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearSampleData();
                      setConfirmClear(false);
                      showToast('warning', 'All sample data cleared.');
                    }}
                    className="px-2.5 py-1 bg-red-600 text-white text-xs font-semibold rounded"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1 bg-white border border-slate-300 text-xs rounded"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
