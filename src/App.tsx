import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  Package,
  Boxes,
  Users,
  Truck,
  Wallet,
  ShoppingBag,
  Search,
  ScanLine,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
  X,
  Sprout,
  Home,
  LogOut,
} from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { SHOP_CONFIG } from './config/shopConfig';
import { LANGUAGES } from './i18n/translations';
import { NavTab } from './types/models';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewBillPage } from './pages/NewBillPage';
import { ItemsPage } from './pages/ItemsPage';
import { StockPage } from './pages/StockPage';
import { AccountsPage } from './pages/AccountsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { FindExtractPage } from './pages/FindExtractPage';
import { ScanBillPage } from './pages/ScanBillPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { InvoiceModal } from './components/InvoiceModal';
import { ReceiptModal } from './components/ReceiptModal';
import { PinLockOverlay } from './components/PinLockOverlay';

function AppShell() {
  const {
    db,
    loading,
    routePath,
    navigateTo,
    authSession,
    logoutAccount,
    activeTab,
    setActiveTab,
    activeUser,
    t,
    setLanguage,
    toast,
    clearToast,
    setViewingBillId,
    setViewingPaymentId,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Desktop keyboard shortcuts: N = New Bill, F = Find & Extract, Esc = Close modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (routePath !== '/app') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        setViewingBillId(null);
        setViewingPaymentId(null);
        setMobileMenuOpen(false);
        return;
      }

      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setActiveTab('new-bill');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setActiveTab('find');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [routePath, setActiveTab, setViewingBillId, setViewingPaymentId]);

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'new-bill', label: t.nav.newBill, icon: FilePlus2 },
    { id: 'find', label: t.nav.find, icon: Search },
    { id: 'items', label: t.nav.items, icon: Package },
    { id: 'stock', label: t.nav.stock, icon: Boxes },
    { id: 'customers', label: t.nav.customers, icon: Users },
    { id: 'payments', label: t.nav.payments, icon: Wallet },
    { id: 'purchases', label: t.nav.purchases, icon: ShoppingBag },
    { id: 'suppliers', label: t.nav.suppliers, icon: Truck },
    { id: 'scan-bill', label: t.nav.scanBill, icon: ScanLine },
    { id: 'reports', label: t.nav.reports, icon: BarChart3 },
    { id: 'settings', label: t.nav.settings, icon: SettingsIcon },
  ];

  const mobileTabs: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'new-bill', label: t.nav.newBill, icon: FilePlus2 },
    { id: 'find', label: t.common.search, icon: Search },
    { id: 'stock', label: t.nav.stock, icon: Boxes },
  ];

  const handleNavClick = (id: NavTab) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-slate-600 text-base">
        {t.common.loading}
      </div>
    );
  }

  if (routePath === '/') {
    return <LandingPage />;
  }

  if (routePath === '/login') {
    return <AuthPage mode="login" />;
  }

  if (routePath === '/signup') {
    return <AuthPage mode="signup" />;
  }

  return (
    <div className="min-h-screen flex bg-white text-slate-900 text-base">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-[#F3F4F6] border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-slate-200 bg-white flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="w-9 h-9 rounded-xl bg-[#15803D] text-white flex items-center justify-center shrink-0 cursor-pointer"
            title={t.landing.home}
          >
            <Sprout className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="font-extrabold text-base text-[#15803D] truncate">
              {SHOP_CONFIG.name}
            </div>
            <div className="text-xs text-slate-500 truncate">{SHOP_CONFIG.address}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-base font-medium transition-colors text-left cursor-pointer ${
                  active
                    ? 'bg-[#15803D] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-slate-200 bg-white text-xs text-slate-600 space-y-2">
          <div className="font-semibold text-slate-900 truncate">
            {authSession?.name || activeUser.name}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] hover:underline cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              {t.landing.home}
            </button>
            <button
              type="button"
              onClick={logoutAccount}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-red-600 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t.landing.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-6 bg-white">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="lg:hidden font-extrabold text-base text-[#15803D] whitespace-nowrap cursor-pointer"
            >
              {SHOP_CONFIG.name}
            </button>
            <span className="hidden lg:inline font-bold text-lg text-slate-900 whitespace-nowrap">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Language Toggle मराठी | हिंदी | English */}
            <div className="flex items-center bg-[#F3F4F6] p-1 rounded-xl border border-slate-200">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`px-2.5 py-1 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    db.settings.language === lang.code
                      ? 'bg-[#15803D] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            {activeTab !== 'new-bill' && (
              <button
                type="button"
                onClick={() => setActiveTab('new-bill')}
                className="hidden sm:inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-emerald-800 whitespace-nowrap cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" />
                {t.nav.newBill}
              </button>
            )}
          </div>
        </header>

        {/* Toast notification */}
        {toast && (
          <div className="fixed top-16 right-4 z-50 max-w-sm">
            <div
              className={`px-4 py-3 rounded-xl border text-sm font-medium flex items-center justify-between gap-3 shadow-md ${
                toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : toast.type === 'warning'
                  ? 'bg-[#FACC15]/25 border-[#FACC15] text-slate-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <span>{toast.message}</span>
              <button type="button" onClick={clearToast} className="p-0.5 opacity-70 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'new-bill' && <NewBillPage />}
          {activeTab === 'items' && <ItemsPage />}
          {activeTab === 'stock' && <StockPage />}
          {activeTab === 'customers' && <AccountsPage mode="customers" />}
          {activeTab === 'suppliers' && <AccountsPage mode="suppliers" />}
          {activeTab === 'payments' && <PaymentsPage />}
          {activeTab === 'purchases' && <PurchasesPage />}
          {activeTab === 'find' && <FindExtractPage />}
          {activeTab === 'scan-bill' && <ScanBillPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>

        {/* Minimal App Footer */}
        <footer className="hidden lg:flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-[#F3F4F6] text-xs text-slate-600">
          <span className="font-semibold text-[#15803D]">{SHOP_CONFIG.name}</span>
          <span className="font-mono-num">
            {SHOP_CONFIG.mobiles.join(' · ')} · GSTIN: {SHOP_CONFIG.gstin}
          </span>
          <span>{SHOP_CONFIG.jurisdiction}</span>
        </footer>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 h-16">
        {mobileTabs.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                active ? 'text-[#15803D] font-bold' : 'text-slate-600'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[68px]">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${
            mobileMenuOpen ? 'text-[#15803D] font-bold' : 'text-slate-600'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-4 pb-20 max-h-[80vh] overflow-y-auto space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-base text-[#15803D]">{SHOP_CONFIG.name}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`min-h-[52px] flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm font-semibold ${
                      activeTab === item.id
                        ? 'bg-[#15803D] text-white border-[#15803D]'
                        : 'bg-[#F3F4F6] text-slate-800 border-slate-200'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateTo('/');
                }}
                className="min-h-[52px] flex items-center gap-2.5 p-3 rounded-xl border bg-white text-slate-800 border-slate-200 text-left text-sm font-semibold"
              >
                <Home className="w-5 h-5 shrink-0 text-[#15803D]" />
                <span>{t.landing.home}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logoutAccount();
                }}
                className="min-h-[52px] flex items-center gap-2.5 p-3 rounded-xl border bg-white text-red-700 border-red-200 text-left text-sm font-semibold"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span>{t.landing.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Overlays */}
      <InvoiceModal />
      <ReceiptModal />
      <PinLockOverlay />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
