import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SHOP_CONFIG } from '../config/shopConfig';

export function PinLockOverlay() {
  const { isLocked, unlockApp, db, t } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (!isLocked) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockApp(pin)) {
      setPin('');
      setError('');
    } else {
      setError('Incorrect PIN (default: 1234).');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 space-y-4 text-center shadow-lg"
      >
        <div className="text-xs font-semibold text-slate-600">{SHOP_CONFIG.blessingLine}</div>
        <div className="w-12 h-12 rounded-xl bg-[#F3F4F6] text-[#15803D] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-[#15803D]">{db.shop.name}</h2>
          <p className="text-sm text-slate-600 mt-1">{t.common.locked}</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Shop PIN"
          className="w-full min-h-[52px] px-4 py-3 text-center text-lg tracking-widest font-mono-num border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full min-h-[52px] py-3 rounded-xl bg-[#15803D] text-white font-bold hover:bg-emerald-800 transition-colors cursor-pointer"
        >
          {t.common.unlock}
        </button>
      </form>
    </div>
  );
}
