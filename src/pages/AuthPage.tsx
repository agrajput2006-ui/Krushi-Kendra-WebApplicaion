import React, { useState } from 'react';
import { Sprout, ArrowLeft, LogIn, UserPlus, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SHOP_CONFIG } from '../config/shopConfig';
import { LANGUAGES } from '../i18n/translations';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const {
    db,
    setLanguage,
    navigateTo,
    loginAccount,
    signupAccount,
    demoLogin,
    t,
  } = useApp();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('owner');
  const [error, setError] = useState('');

  const isLogin = mode === 'login';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isLogin) {
      const res = loginAccount(mobile, pin);
      if (!res.ok) setError(res.error || t.auth.invalidCreds);
    } else {
      const res = signupAccount({ name, mobile, pin, role });
      if (!res.ok) setError(res.error || 'Could not create account.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 text-base">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="inline-flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#15803D] text-white flex items-center justify-center">
              <Sprout className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-lg text-[#15803D]">
              {SHOP_CONFIG.name}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#F3F4F6] p-1 rounded-xl border border-slate-200">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`px-2.5 py-1 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                    db.settings.language === lang.code
                      ? 'bg-[#15803D] text-white'
                      : 'text-slate-700'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-[#F3F4F6] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t.landing.home}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Auth Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden">
          <div className="bg-[#F3F4F6] border-b border-slate-200 px-6 py-5 text-center">
            <div className="text-xs font-semibold text-slate-600 mb-1">
              {SHOP_CONFIG.blessingLine}
            </div>
            <h1 className="text-2xl font-extrabold text-[#15803D]">
              {isLogin ? t.auth.loginTitle : t.auth.signupTitle}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {isLogin ? t.auth.loginSub : t.auth.signupSub}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t.auth.nameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="उदा. राजेश सुराणा"
                  className="w-full min-h-[52px] px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t.auth.mobileLabel}
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9405828497"
                className="w-full min-h-[52px] px-4 py-3 text-base border border-slate-300 rounded-xl font-mono-num focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t.auth.pinLabel}
              </label>
              <input
                type="password"
                inputMode="numeric"
                required
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="1234"
                className="w-full min-h-[52px] px-4 py-3 text-base border border-slate-300 rounded-xl font-mono-num tracking-widest focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t.auth.roleLabel}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('owner')}
                    className={`min-h-[52px] rounded-xl border text-sm font-bold transition-colors cursor-pointer ${
                      role === 'owner'
                        ? 'bg-[#15803D] text-white border-[#15803D]'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {t.common.owner}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('staff')}
                    className={`min-h-[52px] rounded-xl border text-sm font-bold transition-colors cursor-pointer ${
                      role === 'staff'
                        ? 'bg-[#15803D] text-white border-[#15803D]'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {t.common.staff}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[52px] rounded-xl bg-[#15803D] text-white text-base font-bold hover:bg-emerald-800 transition-colors inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              {isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              <span>{isLogin ? t.auth.loginSubmit : t.auth.signupSubmit}</span>
            </button>

            {isLogin && (
              <button
                type="button"
                onClick={demoLogin}
                className="w-full min-h-[52px] rounded-xl bg-[#FACC15] text-slate-900 text-base font-bold hover:brightness-95 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>{t.auth.demoOwnerBtn}</span>
              </button>
            )}

            <div className="pt-2 text-center text-sm text-slate-600">
              {isLogin ? t.auth.noAccount : t.auth.hasAccount}{' '}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  navigateTo(isLogin ? '/signup' : '/login');
                }}
                className="font-bold text-[#15803D] hover:underline cursor-pointer"
              >
                {isLogin ? t.landing.signupBtn : t.landing.loginBtn}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
