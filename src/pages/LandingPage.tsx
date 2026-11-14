import React from 'react';
import {
  Sprout,
  FilePlus2,
  Package,
  Users,
  BarChart3,
  Phone,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SHOP_CONFIG } from '../config/shopConfig';
import { LANGUAGES } from '../i18n/translations';

export function LandingPage() {
  const { db, setLanguage, navigateTo, demoLogin, t } = useApp();

  const featureCards = [
    {
      id: 'new-bill' as const,
      label: t.landing.cardBill,
      icon: FilePlus2,
    },
    {
      id: 'items' as const,
      label: t.landing.cardStock,
      icon: Package,
    },
    {
      id: 'customers' as const,
      label: t.landing.cardCustomers,
      icon: Users,
    },
    {
      id: 'reports' as const,
      label: t.landing.cardReports,
      icon: BarChart3,
    },
  ];

  const openModule = (tab: 'new-bill' | 'items' | 'customers' | 'reports') => {
    navigateTo('/app', tab);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 text-base">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Logo + Name */}
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="flex items-center gap-2.5 text-left cursor-pointer shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-[#15803D] text-white flex items-center justify-center shadow-sm">
              <Sprout className="w-6 h-6" />
            </div>
            <span className="text-lg sm:text-xl font-extrabold text-[#15803D] whitespace-nowrap">
              {SHOP_CONFIG.name}
            </span>
          </button>

          {/* Language Toggle + Login & Signup */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center bg-[#F3F4F6] p-1 rounded-xl border border-slate-200">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    db.settings.language === lang.code
                      ? 'bg-[#15803D] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold hover:bg-[#F3F4F6] transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.landing.loginBtn}
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/signup')}
              className="px-4 py-2.5 rounded-xl bg-[#FACC15] text-slate-900 text-sm font-bold hover:brightness-95 transition-all whitespace-nowrap shadow-xs cursor-pointer"
            >
              {t.landing.signupBtn}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-14 text-center">
          <div className="inline-block bg-[#F3F4F6] border border-slate-200 rounded-xl px-5 py-2 text-sm font-semibold text-slate-700 mb-6">
            {SHOP_CONFIG.blessingLine}
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-[#15803D] tracking-tight leading-tight">
            {SHOP_CONFIG.name}
          </h1>

          <p className="mt-4 text-base sm:text-xl text-slate-700 font-medium max-w-4xl mx-auto">
            {SHOP_CONFIG.tagline}
          </p>

          {/* Hero Primary + Secondary CTA */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={demoLogin}
              className="w-full sm:w-auto min-h-[56px] px-8 py-3.5 rounded-2xl bg-[#15803D] text-white text-lg font-bold shadow-md hover:bg-emerald-800 transition-all inline-flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>{t.landing.startBtn}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="w-full sm:w-auto min-h-[52px] px-6 py-3 rounded-2xl border-2 border-slate-300 bg-white text-slate-800 text-base font-semibold hover:bg-[#F3F4F6] transition-colors cursor-pointer"
            >
              {t.landing.loginBtn}
            </button>
          </div>
        </section>

        {/* Exactly 4 Icon Cards (2-3 words each) */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => openModule(card.id)}
                  className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md hover:border-[#15803D] transition-all flex flex-col items-center justify-center gap-4 text-center min-h-[148px] cursor-pointer group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] group-hover:bg-[#FACC15]/30 text-[#15803D] flex items-center justify-center transition-colors">
                    <Icon className="w-9 h-9" />
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-slate-900">
                    {card.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Address & Two Tap-to-Call Phone Numbers Strip */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <div className="bg-[#F3F4F6] border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-800 text-base font-semibold text-center md:text-left">
              <MapPin className="w-6 h-6 text-[#15803D] shrink-0" />
              <span>{SHOP_CONFIG.address}</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {SHOP_CONFIG.mobiles.map((num) => (
                <a
                  key={num}
                  href={`tel:${num}`}
                  className="min-h-[52px] px-5 py-3 rounded-xl bg-white border border-slate-300 hover:border-[#15803D] text-slate-900 font-bold text-base font-mono-num inline-flex items-center gap-2 shadow-xs transition-colors"
                >
                  <Phone className="w-5 h-5 text-[#15803D]" />
                  <span>{num}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="bg-[#F3F4F6] border-t border-slate-200 py-5 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-700">
          <span className="font-bold text-[#15803D]">{SHOP_CONFIG.name}</span>
          <span className="font-mono-num">
            {SHOP_CONFIG.mobiles.join(' · ')}
          </span>
          <span>
            {t.landing.copyright} · {SHOP_CONFIG.jurisdiction}
          </span>
        </div>
      </footer>
    </div>
  );
}
