import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppDatabase,
  AuditLog,
  Batch,
  Bill,
  BillLine,
  BillPaymentMode,
  Customer,
  Godown,
  Item,
  LanguageCode,
  NavTab,
  Payment,
  PaymentAllocation,
  Purchase,
  PurchaseLine,
  ReceiptPaymentMode,
  Settings,
  Shop,
  StockAdjustmentReason,
  StockMovement,
  Supplier,
  SupplyType,
  User,
} from '../types/models';
import { dbAdapter } from '../db/storage';
import { createEmptyDatabase, createSampleDatabase } from '../db/seed';
import { TRANSLATIONS, TranslationBundle } from '../i18n/translations';
import {
  calculateBillTotals,
  calculateLineTotals,
  generateNextSequentialNumber,
  getBatchExpiryStatus,
  getCustomerClosingBalance,
  recomputeBillPaymentStatus,
  recomputePurchasePaymentStatus,
  round2,
} from '../utils/calculations';
import { generateId, getFinancialYear, todayISO } from '../utils/formatters';
import { SHOP_CONFIG } from '../config/shopConfig';

export type AppRoute = '/' | '/login' | '/signup' | '/app';

export interface AuthAccount {
  id: string;
  name: string;
  mobile: string;
  pin: string;
  role: 'owner' | 'staff';
}

const LANG_LS_KEY = 'surana_lang';
const AUTH_ACCOUNTS_KEY = 'surana_auth_accounts_v1';
const AUTH_SESSION_KEY = 'surana_auth_session_v1';

function normalizeRoute(pathname: string): AppRoute {
  if (pathname === '/login') return '/login';
  if (pathname === '/signup') return '/signup';
  if (pathname === '/app') return '/app';
  return '/';
}

function loadSavedLanguage(): LanguageCode {
  try {
    const saved = window.localStorage.getItem(LANG_LS_KEY);
    if (saved === 'mr' || saved === 'hi' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return 'mr';
}

function loadAuthAccounts(): AuthAccount[] {
  const defaults: AuthAccount[] = [
    {
      id: 'u_owner',
      name: 'सुराणा कृषी केंद्र (मालक)',
      mobile: SHOP_CONFIG.mobiles[0],
      pin: '1234',
      role: 'owner',
    },
    {
      id: 'u_staff',
      name: 'काउंटर कर्मचारी (Staff)',
      mobile: SHOP_CONFIG.mobiles[1],
      pin: '1234',
      role: 'staff',
    },
  ];
  try {
    const raw = window.localStorage.getItem(AUTH_ACCOUNTS_KEY);
    if (!raw) {
      window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as AuthAccount[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaults;
  } catch {
    return defaults;
  }
}

function loadAuthSession(): AuthAccount | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthAccount) : null;
  } catch {
    return null;
  }
}

export interface CreateBillLineInput {
  itemId: string;
  batchId: string;
  qty: number;
  rate: number;
  discountPercent: number;
}

export interface CreateBillInput {
  date: string;
  customerId: string; // 'CASH' or customer.id
  supplyType: SupplyType;
  paymentMode: BillPaymentMode;
  paidAmountNow: number;
  paymentReference?: string;
  notes?: string;
  allowExpiredOverride?: boolean;
  lines: CreateBillLineInput[];
}

export interface CreatePurchaseLineInput {
  itemId: string;
  godownId: string;
  batchNumber: string;
  lotNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  qty: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstRate: Item['gstRate'];
}

export interface CreatePurchaseInput {
  supplierId: string;
  supplierInvoiceNo: string;
  date: string;
  paidAmountNow: number;
  paymentMode?: ReceiptPaymentMode;
  paymentReference?: string;
  notes?: string;
  lines: CreatePurchaseLineInput[];
}

export interface CreatePaymentInput {
  type: 'receipt' | 'payout';
  partyId: string;
  date: string;
  amount: number;
  mode: ReceiptPaymentMode;
  referenceNo?: string;
  notes?: string;
  allocations: Array<{ targetType: 'bill' | 'purchase'; targetId: string; amount: number }>;
}

interface AppContextValue {
  db: AppDatabase;
  loading: boolean;
  routePath: AppRoute;
  navigateTo: (path: AppRoute, tab?: NavTab) => void;
  authSession: AuthAccount | null;
  loginAccount: (mobile: string, pin: string) => { ok: boolean; error?: string };
  signupAccount: (input: { name: string; mobile: string; pin: string; role: 'owner' | 'staff' }) => { ok: boolean; error?: string };
  logoutAccount: () => void;
  demoLogin: () => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  activeUser: User;
  isOwner: boolean;
  isLocked: boolean;
  unlockApp: (pin: string) => boolean;
  lockApp: () => void;
  t: TranslationBundle;
  setLanguage: (lang: LanguageCode) => void;
  toast: { type: 'success' | 'error' | 'warning'; message: string } | null;
  showToast: (type: 'success' | 'error' | 'warning', message: string) => void;
  clearToast: () => void;

  // Cross-module connected intents
  billPreselectCustomerId: string | null;
  clearBillPreselectCustomer: () => void;
  billPreselectItemId: string | null;
  clearBillPreselectItem: () => void;
  paymentIntent: { type: 'receipt' | 'payout'; partyId: string } | null;
  clearPaymentIntent: () => void;
  purchasePreselectItemId: string | null;
  clearPurchasePreselectItem: () => void;
  ledgerPreselectCustomerId: string | null;
  clearLedgerPreselectCustomer: () => void;
  startBillForCustomer: (customerId: string) => void;
  addItemAndGoToBill: (itemId: string) => void;
  startPaymentForParty: (partyId: string, type?: 'receipt' | 'payout') => void;
  startPurchaseForItem: (itemId: string) => void;
  viewCustomerKhata: (customerId: string) => void;

  // Inspection modals state (for "Extract / View Bill" from anywhere)
  viewingBillId: string | null;
  setViewingBillId: (id: string | null) => void;
  viewingPaymentId: string | null;
  setViewingPaymentId: (id: string | null) => void;

  // Domain actions
  saveItem: (item: Omit<Item, 'id' | 'code' | 'createdAt'> & { id?: string; code?: string }, initialBatch?: {
    batchNumber: string;
    lotOrLicenseNumber?: string;
    mfgDate?: string;
    expiryDate?: string;
    godownId: string;
    quantity: number;
  }) => { ok: boolean; error?: string; item?: Item; batchId?: string };
  adjustStock: (params: {
    itemId: string;
    batchId: string;
    qtyChange: number;
    reason: StockAdjustmentReason;
    notes?: string;
  }) => { ok: boolean; error?: string };
  saveCustomer: (cust: Omit<Customer, 'id' | 'createdAt'> & { id?: string }) => { ok: boolean; error?: string; customer?: Customer };
  saveSupplier: (sup: Omit<Supplier, 'id' | 'createdAt'> & { id?: string }) => { ok: boolean; error?: string; supplier?: Supplier };
  saveGodown: (gd: Omit<Godown, 'id'> & { id?: string }) => void;

  createBill: (input: CreateBillInput) => { ok: boolean; error?: string; bill?: Bill };
  cancelBill: (billId: string, reason: string) => { ok: boolean; error?: string };
  createPurchase: (input: CreatePurchaseInput) => { ok: boolean; error?: string; purchase?: Purchase };
  createPayment: (input: CreatePaymentInput) => { ok: boolean; error?: string; payment?: Payment };

  updateShop: (shop: Shop) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  switchUser: (userId: string) => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonText: string) => { ok: boolean; error?: string };
  clearSampleData: () => void;
  reseedSampleData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<AppDatabase>(() => createEmptyDatabase());
  const [loading, setLoading] = useState(true);
  const [routePath, setRoutePath] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? normalizeRoute(window.location.pathname) : '/'
  );
  const [authSession, setAuthSession] = useState<AuthAccount | null>(() =>
    typeof window !== 'undefined' ? loadAuthSession() : null
  );
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isLocked, setIsLocked] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [viewingBillId, setViewingBillId] = useState<string | null>(null);
  const [viewingPaymentId, setViewingPaymentId] = useState<string | null>(null);
  const [billPreselectCustomerId, setBillPreselectCustomerId] = useState<string | null>(null);
  const [billPreselectItemId, setBillPreselectItemId] = useState<string | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<{ type: 'receipt' | 'payout'; partyId: string } | null>(null);
  const [purchasePreselectItemId, setPurchasePreselectItemId] = useState<string | null>(null);
  const [ledgerPreselectCustomerId, setLedgerPreselectCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setRoutePath(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (path: AppRoute, tab?: NavTab) => {
    if (tab) setActiveTab(tab);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoutePath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startBillForCustomer = (customerId: string) => {
    setBillPreselectCustomerId(customerId);
    navigateTo('/app', 'new-bill');
  };

  const addItemAndGoToBill = (itemId: string) => {
    setBillPreselectItemId(itemId);
    navigateTo('/app', 'new-bill');
  };

  const startPaymentForParty = (partyId: string, type: 'receipt' | 'payout' = 'receipt') => {
    setPaymentIntent({ partyId, type });
    navigateTo('/app', 'payments');
  };

  const startPurchaseForItem = (itemId: string) => {
    setPurchasePreselectItemId(itemId);
    navigateTo('/app', 'purchases');
  };

  const viewCustomerKhata = (customerId: string) => {
    setLedgerPreselectCustomerId(customerId);
    navigateTo('/app', 'customers');
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedLang = loadSavedLanguage();
        const stored = await dbAdapter.load();
        if (!mounted) return;
        if (stored && stored.shop && stored.settings) {
          let migrated = stored;
          // Upgrade legacy default shop details to Surana Krushikendra if still on old placeholder
          if (stored.shop.name === 'Shri Ganesh Khushi Kendra & Biyane') {
            migrated = {
              ...stored,
              shop: {
                ...stored.shop,
                name: SHOP_CONFIG.name,
                address: SHOP_CONFIG.address,
                mobile: SHOP_CONFIG.mobiles.join(', '),
                gstin: SHOP_CONFIG.gstin,
                fertilizerLicense: SHOP_CONFIG.fertilizerLicense,
                termsAndConditions: SHOP_CONFIG.jurisdiction,
              },
              settings: {
                ...stored.settings,
                billPrefix: 'SK',
                language: savedLang,
              },
            };
            await dbAdapter.save(migrated);
          } else if (stored.settings.language !== savedLang) {
            migrated = {
              ...stored,
              settings: { ...stored.settings, language: savedLang },
            };
          }
          setDb(migrated);
          if (migrated.settings.pinLockEnabled) {
            setIsLocked(true);
          }
        } else {
          const seeded = createSampleDatabase();
          seeded.settings.language = savedLang;
          setDb(seeded);
          await dbAdapter.save(seeded);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const showToast = (type: 'success' | 'error' | 'warning', message: string) => {
    setToast({ type, message });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const commitDb = (updater: (prev: AppDatabase) => AppDatabase) => {
    setDb((prev) => {
      const next = updater(prev);
      void dbAdapter.save(next);
      return next;
    });
  };

  const activeUser = useMemo(() => {
    return db.users.find((u) => u.id === db.settings.activeUserId) || db.users[0];
  }, [db.users, db.settings.activeUserId]);

  const isOwner = activeUser?.role === 'owner';
  const t = TRANSLATIONS[db.settings.language] || TRANSLATIONS.mr;

  const appendAudit = (
    prev: AppDatabase,
    entry: Omit<AuditLog, 'id' | 'userId' | 'userName' | 'timestamp'>
  ): AuditLog => ({
    id: generateId('aud'),
    userId: activeUser.id,
    userName: activeUser.name,
    timestamp: new Date().toISOString(),
    ...entry,
  });

  const setLanguage = (lang: LanguageCode) => {
    try {
      window.localStorage.setItem(LANG_LS_KEY, lang);
    } catch {
      // ignore
    }
    commitDb((prev) => ({
      ...prev,
      settings: { ...prev.settings, language: lang },
    }));
  };

  const loginAccount: AppContextValue['loginAccount'] = (mobile, pin) => {
    const cleanMobile = mobile.trim();
    const cleanPin = pin.trim();
    const accounts = loadAuthAccounts();
    const match = accounts.find((a) => a.mobile === cleanMobile && a.pin === cleanPin);
    if (!match) {
      return { ok: false, error: t.auth.invalidCreds };
    }
    try {
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(match));
    } catch {
      // ignore
    }
    setAuthSession(match);
    commitDb((prev) => {
      const hasUser = prev.users.some((u) => u.id === match.id);
      const nextUsers = hasUser
        ? prev.users
        : [...prev.users, { id: match.id, name: match.name, role: match.role, mobile: match.mobile, active: true }];
      return {
        ...prev,
        users: nextUsers,
        settings: { ...prev.settings, activeUserId: match.id },
      };
    });
    navigateTo('/app');
    return { ok: true };
  };

  const signupAccount: AppContextValue['signupAccount'] = ({ name, mobile, pin, role }) => {
    const cleanName = name.trim();
    const cleanMobile = mobile.trim();
    const cleanPin = pin.trim();
    if (!cleanName) return { ok: false, error: 'Name is required.' };
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      return { ok: false, error: 'Enter valid 10-digit mobile number.' };
    }
    if (cleanPin.length < 4) {
      return { ok: false, error: 'PIN must be at least 4 digits.' };
    }

    const accounts = loadAuthAccounts();
    if (accounts.some((a) => a.mobile === cleanMobile)) {
      return { ok: false, error: t.auth.duplicateMobile };
    }

    const newAcc: AuthAccount = {
      id: generateId('usr'),
      name: cleanName,
      mobile: cleanMobile,
      pin: cleanPin,
      role,
    };
    const nextAccounts = [...accounts, newAcc];
    try {
      window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(nextAccounts));
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newAcc));
    } catch {
      // ignore
    }
    setAuthSession(newAcc);
    commitDb((prev) => ({
      ...prev,
      users: [
        ...prev.users,
        { id: newAcc.id, name: newAcc.name, role: newAcc.role, mobile: newAcc.mobile, active: true },
      ],
      settings: { ...prev.settings, activeUserId: newAcc.id },
    }));
    navigateTo('/app');
    return { ok: true };
  };

  const logoutAccount = () => {
    try {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
    } catch {
      // ignore
    }
    setAuthSession(null);
    navigateTo('/');
  };

  const demoLogin = () => {
    const accounts = loadAuthAccounts();
    const owner = accounts[0];
    try {
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(owner));
    } catch {
      // ignore
    }
    setAuthSession(owner);
    commitDb((prev) => ({
      ...prev,
      settings: { ...prev.settings, activeUserId: owner.id },
    }));
    navigateTo('/app', 'dashboard');
  };

  const unlockApp = (pin: string) => {
    if (pin.trim() === db.settings.shopPin) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const lockApp = () => {
    if (db.settings.pinLockEnabled) {
      setIsLocked(true);
    }
  };

  const saveItem: AppContextValue['saveItem'] = (itemInput, initialBatch) => {
    if (!itemInput.name.trim()) return { ok: false, error: 'Item name is required.' };
    if (itemInput.id && !isOwner) {
      const existing = db.items.find((i) => i.id === itemInput.id);
      if (
        existing &&
        (existing.purchasePrice !== itemInput.purchasePrice ||
          existing.sellingPrice !== itemInput.sellingPrice)
      ) {
        return { ok: false, error: 'Staff users cannot edit item prices.' };
      }
    }

    const existing = itemInput.id ? db.items.find((i) => i.id === itemInput.id) : undefined;
    const nextCodeNum = db.items.length + 1;
    const autoCode = itemInput.code?.trim() || `SK-${String(nextCodeNum).padStart(3, '0')}`;

    const itemObj: Item = {
      id: existing ? existing.id : generateId('item'),
      code: existing ? existing.code : autoCode,
      barcode: itemInput.barcode?.trim() || '',
      name: itemInput.name.trim(),
      category: itemInput.category,
      brand: itemInput.brand.trim(),
      hsnCode: itemInput.hsnCode.trim(),
      gstRate: itemInput.gstRate,
      unit: itemInput.unit,
      purchasePrice: round2(itemInput.purchasePrice),
      sellingPrice: round2(itemInput.sellingPrice),
      mrp: round2(itemInput.mrp),
      minStockLevel: Math.max(0, Number(itemInput.minStockLevel) || 0),
      defaultGodownId: itemInput.defaultGodownId || db.godowns[0]?.id || 'gd_main',
      rackLocation: itemInput.rackLocation?.trim() || '',
      photoDataUrl: itemInput.photoDataUrl,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };

    let createdBatch: Batch | undefined;
    if (!existing && initialBatch && initialBatch.batchNumber.trim()) {
      const qty = Math.max(0, Number(initialBatch.quantity) || 0);
      createdBatch = {
        id: generateId('bat'),
        itemId: itemObj.id,
        batchNumber: initialBatch.batchNumber.trim(),
        lotOrLicenseNumber: initialBatch.lotOrLicenseNumber?.trim() || '',
        mfgDate: initialBatch.mfgDate || '',
        expiryDate: initialBatch.expiryDate || '',
        godownId: initialBatch.godownId || itemObj.defaultGodownId,
        quantity: qty,
        purchasePrice: itemObj.purchasePrice,
        sellingPrice: itemObj.sellingPrice,
        mrp: itemObj.mrp,
        createdAt: new Date().toISOString(),
      };
    }

    commitDb((prev) => {
      const existsInPrev = prev.items.some((i) => i.id === itemObj.id);
      const nextItems = existsInPrev
        ? prev.items.map((i) => (i.id === itemObj.id ? itemObj : i))
        : [...prev.items, itemObj];

      const nextBatches = createdBatch ? [...prev.batches, createdBatch] : [...prev.batches];
      const nextMovements = [...prev.stockMovements];

      if (createdBatch && createdBatch.quantity > 0) {
        nextMovements.unshift({
          id: generateId('sm'),
          itemId: itemObj.id,
          batchId: createdBatch.id,
          godownId: createdBatch.godownId,
          type: 'opening',
          reason: 'opening',
          qtyChange: createdBatch.quantity,
          prevQty: 0,
          newQty: createdBatch.quantity,
          refType: 'manual',
          refId: itemObj.id,
          notes: `Opening stock for ${itemObj.name}`,
          userId: activeUser.id,
          userName: activeUser.name,
          createdAt: new Date().toISOString(),
        });
      }

      const log = appendAudit(prev, {
        entityType: 'item',
        entityId: itemObj.id,
        action: existsInPrev ? 'update' : 'create',
        summary: `${existsInPrev ? 'Updated' : 'Created'} item ${itemObj.name} (${itemObj.code})`,
        oldValue: existing ? JSON.stringify(existing) : undefined,
        newValue: JSON.stringify(itemObj),
      });

      return {
        ...prev,
        items: nextItems,
        batches: nextBatches,
        stockMovements: nextMovements,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true, item: itemObj, batchId: createdBatch?.id };
  };

  const adjustStock: AppContextValue['adjustStock'] = ({ itemId, batchId, qtyChange, reason, notes }) => {
    const batch = db.batches.find((b) => b.id === batchId && b.itemId === itemId);
    if (!batch) return { ok: false, error: 'Selected batch not found.' };
    if (!Number.isFinite(qtyChange) || qtyChange === 0) {
      return { ok: false, error: 'Enter a non-zero quantity change.' };
    }
    const newQty = round2(batch.quantity + qtyChange);
    if (newQty < 0 && !db.settings.allowNegativeStock) {
      return { ok: false, error: 'Stock cannot go negative (check Settings to override).' };
    }

    commitDb((prev) => {
      const target = prev.batches.find((b) => b.id === batchId)!;
      const prevQty = target.quantity;
      const updatedQty = round2(prevQty + qtyChange);

      const movement: StockMovement = {
        id: generateId('sm'),
        itemId,
        batchId,
        godownId: target.godownId,
        type: 'adjustment',
        reason,
        qtyChange: round2(qtyChange),
        prevQty,
        newQty: updatedQty,
        refType: 'manual',
        refId: batchId,
        notes: notes?.trim() || '',
        userId: activeUser.id,
        userName: activeUser.name,
        createdAt: new Date().toISOString(),
      };

      const log = appendAudit(prev, {
        entityType: 'stock',
        entityId: batchId,
        action: 'adjust',
        summary: `Adjusted batch ${target.batchNumber} by ${qtyChange > 0 ? '+' : ''}${qtyChange} (${reason})`,
        oldValue: String(prevQty),
        newValue: String(updatedQty),
      });

      return {
        ...prev,
        batches: prev.batches.map((b) => (b.id === batchId ? { ...b, quantity: updatedQty } : b)),
        stockMovements: [movement, ...prev.stockMovements],
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true };
  };

  const saveCustomer: AppContextValue['saveCustomer'] = (custInput) => {
    if (!custInput.name.trim()) return { ok: false, error: 'Customer name is required.' };
    if (!/^[6-9]\d{9}$/.test(custInput.mobile.trim())) {
      return { ok: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    }
    const gstin = custInput.gstin?.trim().toUpperCase() || '';
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      return { ok: false, error: 'Invalid 15-character GSTIN format (e.g. 27AABCU9603R1ZM).' };
    }

    const existing = custInput.id ? db.customers.find((c) => c.id === custInput.id) : undefined;
    const saved: Customer = {
      id: existing ? existing.id : generateId('cust'),
      name: custInput.name.trim(),
      mobile: custInput.mobile.trim(),
      village: custInput.village.trim(),
      address: custInput.address.trim(),
      gstin,
      aadhaarFarmerId: custInput.aadhaarFarmerId?.trim() || '',
      creditLimit: Math.max(0, Number(custInput.creditLimit) || 0),
      openingBalance: round2(Number(custInput.openingBalance) || 0),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };

    commitDb((prev) => {
      const existsInPrev = prev.customers.some((c) => c.id === saved.id);
      const log = appendAudit(prev, {
        entityType: 'customer',
        entityId: saved.id,
        action: existsInPrev ? 'update' : 'create',
        summary: `${existsInPrev ? 'Updated' : 'Added'} customer ${saved.name}`,
      });

      return {
        ...prev,
        customers: existsInPrev
          ? prev.customers.map((c) => (c.id === saved.id ? saved : c))
          : [...prev.customers, saved],
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true, customer: saved };
  };

  const saveSupplier: AppContextValue['saveSupplier'] = (supInput) => {
    if (!supInput.name.trim()) return { ok: false, error: 'Supplier name is required.' };
    if (!/^[6-9]\d{9}$/.test(supInput.mobile.trim())) {
      return { ok: false, error: 'Please enter a valid 10-digit mobile number.' };
    }
    const gstin = supInput.gstin?.trim().toUpperCase() || '';
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      return { ok: false, error: 'Invalid 15-character GSTIN format.' };
    }

    let saved: Supplier | undefined;
    commitDb((prev) => {
      const existing = supInput.id ? prev.suppliers.find((s) => s.id === supInput.id) : undefined;
      const obj: Supplier = {
        id: existing ? existing.id : generateId('sup'),
        name: supInput.name.trim(),
        mobile: supInput.mobile.trim(),
        village: supInput.village.trim(),
        address: supInput.address.trim(),
        gstin,
        openingBalance: round2(Number(supInput.openingBalance) || 0),
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
      };
      saved = obj;

      const log = appendAudit(prev, {
        entityType: 'supplier',
        entityId: obj.id,
        action: existing ? 'update' : 'create',
        summary: `${existing ? 'Updated' : 'Added'} supplier ${obj.name}`,
      });

      return {
        ...prev,
        suppliers: existing
          ? prev.suppliers.map((s) => (s.id === existing.id ? obj : s))
          : [...prev.suppliers, obj],
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true, supplier: saved };
  };

  const saveGodown: AppContextValue['saveGodown'] = (gdInput) => {
    commitDb((prev) => {
      const existing = gdInput.id ? prev.godowns.find((g) => g.id === gdInput.id) : undefined;
      const obj: Godown = {
        id: existing ? existing.id : generateId('gd'),
        name: gdInput.name.trim(),
        location: gdInput.location.trim(),
        rackInfo: gdInput.rackInfo.trim(),
        isDefault: gdInput.isDefault,
      };
      let nextGodowns = existing
        ? prev.godowns.map((g) => (g.id === existing.id ? obj : g))
        : [...prev.godowns, obj];
      if (obj.isDefault) {
        nextGodowns = nextGodowns.map((g) => ({ ...g, isDefault: g.id === obj.id }));
      }
      return { ...prev, godowns: nextGodowns };
    });
  };

  const createBill: AppContextValue['createBill'] = (input) => {
    if (!input.lines.length) {
      return { ok: false, error: 'Add at least one item to create a bill.' };
    }

    const customer =
      input.customerId !== 'CASH'
        ? db.customers.find((c) => c.id === input.customerId)
        : undefined;

    if (input.customerId !== 'CASH' && !customer) {
      return { ok: false, error: 'Selected customer does not exist.' };
    }

    // Validate batches, expiry, and stock availability
    const batchUsageMap = new Map<string, number>();
    let usedExpired = false;

    for (const line of input.lines) {
      if (!line.qty || line.qty <= 0) {
        return { ok: false, error: 'Item quantity must be greater than zero.' };
      }
      const item = db.items.find((i) => i.id === line.itemId);
      const batch = db.batches.find((b) => b.id === line.batchId && b.itemId === line.itemId);
      if (!item || !batch) {
        return { ok: false, error: 'Invalid item or batch selected.' };
      }

      const expStatus = getBatchExpiryStatus(batch, input.date || todayISO());
      if (expStatus === 'expired') {
        if (!input.allowExpiredOverride || !isOwner) {
          return {
            ok: false,
            error: `Batch ${batch.batchNumber} (${item.name}) is expired! Owner override required.`,
          };
        }
        usedExpired = true;
      }

      const used = (batchUsageMap.get(batch.id) || 0) + line.qty;
      batchUsageMap.set(batch.id, used);

      if (!db.settings.allowNegativeStock && used > batch.quantity + 0.0001) {
        return {
          ok: false,
          error: `Insufficient stock for ${item.name} (Batch ${batch.batchNumber}). Available: ${batch.quantity} ${item.unit}`,
        };
      }
    }

    let createdBill: Bill | undefined;

    commitDb((prev) => {
      const fy = getFinancialYear(input.date || todayISO());
      const billId = generateId('bill');
      const billNumber = generateNextSequentialNumber(
        prev.settings.billPrefix || 'KK',
        fy,
        prev.bills.map((b) => b.billNumber)
      );

      const builtLines: BillLine[] = input.lines.map((rl, idx) => {
        const item = prev.items.find((i) => i.id === rl.itemId)!;
        const batch = prev.batches.find((b) => b.id === rl.batchId)!;
        const calc = calculateLineTotals({
          qty: rl.qty,
          rate: rl.rate,
          discountPercent: rl.discountPercent,
          gstRate: item.gstRate,
          supplyType: input.supplyType,
        });

        return {
          id: `${billId}_l${idx + 1}`,
          billId,
          itemId: item.id,
          batchId: batch.id,
          godownId: batch.godownId,
          itemName: item.name,
          hsnCode: item.hsnCode,
          batchNumber: batch.batchNumber,
          unit: item.unit,
          qty: round2(rl.qty),
          rate: round2(rl.rate),
          discountPercent: round2(rl.discountPercent),
          discountAmount: calc.discountAmount,
          taxableValue: calc.taxableValue,
          gstRate: item.gstRate,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          lineTotal: calc.lineTotal,
          purchasePriceSnapshot: batch.purchasePrice,
        };
      });

      const totals = calculateBillTotals(builtLines);

      let paidNow = 0;
      if (input.paymentMode === 'Credit') {
        paidNow = 0;
      } else if (input.paymentMode === 'Part') {
        paidNow = Math.min(totals.grandTotal, Math.max(0, round2(input.paidAmountNow)));
      } else {
        paidNow = totals.grandTotal;
      }

      const balanceDue = round2(Math.max(0, totals.grandTotal - paidNow));
      const status: Bill['status'] =
        balanceDue <= 0.01 ? 'Paid' : paidNow > 0.01 ? 'Partly paid' : 'Unpaid';

      const bill: Bill = {
        id: billId,
        billNumber,
        financialYear: fy,
        date: input.date || todayISO(),
        customerId: customer ? customer.id : 'CASH',
        customerNameSnapshot: customer ? customer.name : 'Cash Customer',
        customerMobileSnapshot: customer?.mobile,
        customerVillageSnapshot: customer?.village,
        customerGstinSnapshot: customer?.gstin,
        supplyType: input.supplyType,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxableTotal: totals.taxableTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paidAmount: paidNow,
        balanceDue,
        paymentMode: input.paymentMode,
        status,
        notes: input.notes?.trim() || '',
        expiredOverrideUsed: usedExpired,
        createdBy: activeUser.id,
        createdAt: new Date().toISOString(),
      };
      createdBill = bill;

      // Deduct stock per batch & write StockMovements
      let nextBatches = [...prev.batches];
      const newMovements: StockMovement[] = [];

      for (const line of builtLines) {
        const bIndex = nextBatches.findIndex((b) => b.id === line.batchId);
        if (bIndex >= 0) {
          const prevQty = nextBatches[bIndex].quantity;
          const newQty = round2(prevQty - line.qty);
          nextBatches[bIndex] = { ...nextBatches[bIndex], quantity: newQty };
          newMovements.push({
            id: generateId('sm'),
            itemId: line.itemId,
            batchId: line.batchId,
            godownId: line.godownId,
            type: 'sale',
            reason: 'sale',
            qtyChange: -line.qty,
            prevQty,
            newQty,
            refType: 'bill',
            refId: bill.id,
            notes: `Sold via ${bill.billNumber}`,
            userId: activeUser.id,
            userName: activeUser.name,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // If paidNow > 0, record receipt Payment + PaymentAllocation so receipts & ledgers stay 100% reconciled!
      const nextPayments = [...prev.payments];
      const nextAllocations = [...prev.paymentAllocations];

      if (paidNow > 0) {
        const payId = generateId('pay');
        const receiptNumber = generateNextSequentialNumber(
          prev.settings.receiptPrefix || 'RCPT',
          fy,
          prev.payments.map((p) => p.receiptNumber)
        );
        const receiptMode: ReceiptPaymentMode =
          input.paymentMode === 'UPI' ||
          input.paymentMode === 'Card' ||
          input.paymentMode === 'Bank'
            ? input.paymentMode
            : 'Cash';

        nextPayments.unshift({
          id: payId,
          receiptNumber,
          financialYear: fy,
          type: 'receipt',
          partyId: bill.customerId,
          partyNameSnapshot: bill.customerNameSnapshot,
          date: bill.date,
          amount: paidNow,
          mode: receiptMode,
          referenceNo: input.paymentReference?.trim() || '',
          notes: `Payment on Bill ${bill.billNumber}`,
          createdBy: activeUser.id,
          createdAt: new Date().toISOString(),
        });

        nextAllocations.push({
          id: generateId('pa'),
          paymentId: payId,
          targetType: 'bill',
          targetId: bill.id,
          amount: paidNow,
        });
      }

      const log = appendAudit(prev, {
        entityType: 'bill',
        entityId: bill.id,
        action: 'create',
        summary: `Created Bill ${bill.billNumber} for ${bill.customerNameSnapshot} (Total ₹${bill.grandTotal}, Paid ₹${bill.paidAmount})`,
        newValue: JSON.stringify({ billNumber: bill.billNumber, grandTotal: bill.grandTotal, paidAmount: bill.paidAmount }),
      });

      return {
        ...prev,
        batches: nextBatches,
        stockMovements: [...newMovements, ...prev.stockMovements],
        bills: [bill, ...prev.bills],
        billLines: [...prev.billLines, ...builtLines],
        payments: nextPayments,
        paymentAllocations: nextAllocations,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true, bill: createdBill };
  };

  const cancelBill: AppContextValue['cancelBill'] = (billId, reason) => {
    if (!isOwner) {
      return { ok: false, error: 'Only Owner can cancel bills.' };
    }
    const bill = db.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: 'Bill not found.' };
    if (bill.status === 'Cancelled') return { ok: false, error: 'Bill is already cancelled.' };

    commitDb((prev) => {
      const targetBill = prev.bills.find((b) => b.id === billId)!;
      const lines = prev.billLines.filter((l) => l.billId === billId);

      let nextBatches = [...prev.batches];
      const restoreMovements: StockMovement[] = [];

      for (const line of lines) {
        const bIdx = nextBatches.findIndex((b) => b.id === line.batchId);
        if (bIdx >= 0) {
          const prevQty = nextBatches[bIdx].quantity;
          const newQty = round2(prevQty + line.qty);
          nextBatches[bIdx] = { ...nextBatches[bIdx], quantity: newQty };
          restoreMovements.push({
            id: generateId('sm'),
            itemId: line.itemId,
            batchId: line.batchId,
            godownId: line.godownId,
            type: 'sale_cancel',
            reason: 'cancel',
            qtyChange: line.qty,
            prevQty,
            newQty,
            refType: 'bill',
            refId: billId,
            notes: `Stock restored from cancelled Bill ${targetBill.billNumber}`,
            userId: activeUser.id,
            userName: activeUser.name,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Remove allocations tied to this cancelled bill so customer ledger only counts active bills - payments
      const nextAllocations = prev.paymentAllocations.filter(
        (a) => !(a.targetType === 'bill' && a.targetId === billId)
      );

      const updatedBill: Bill = {
        ...targetBill,
        status: 'Cancelled',
        balanceDue: 0,
        cancelledAt: new Date().toISOString(),
        cancelReason: reason.trim() || 'Cancelled by owner',
      };

      const log = appendAudit(prev, {
        entityType: 'bill',
        entityId: billId,
        action: 'cancel',
        summary: `Cancelled Bill ${targetBill.billNumber} (${reason || 'No reason'}). Stock restored.`,
        oldValue: targetBill.status,
        newValue: 'Cancelled',
      });

      return {
        ...prev,
        batches: nextBatches,
        stockMovements: [...restoreMovements, ...prev.stockMovements],
        bills: prev.bills.map((b) => (b.id === billId ? updatedBill : b)),
        paymentAllocations: nextAllocations,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true };
  };

  const createPurchase: AppContextValue['createPurchase'] = (input) => {
    const supplier = db.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier) return { ok: false, error: 'Please select a supplier.' };
    if (!input.supplierInvoiceNo.trim()) return { ok: false, error: 'Supplier invoice number is required.' };
    if (!input.lines.length) return { ok: false, error: 'Add at least one item row.' };

    let createdPurchase: Purchase | undefined;

    commitDb((prev) => {
      const purId = generateId('pur');
      const purNo = `PUR/${String(prev.purchases.length + 1).padStart(4, '0')}`;
      const fy = getFinancialYear(input.date || todayISO());

      let nextBatches = [...prev.batches];
      let nextItems = [...prev.items];
      const newMovements: StockMovement[] = [];
      const builtLines: PurchaseLine[] = [];

      let subtotal = 0;
      let gstTotal = 0;

      for (let i = 0; i < input.lines.length; i++) {
        const rl = input.lines[i];
        const item = nextItems.find((it) => it.id === rl.itemId);
        if (!item) continue;

        const qty = Math.max(0, round2(rl.qty));
        const pPrice = round2(rl.purchasePrice);
        const sPrice = round2(rl.sellingPrice || item.sellingPrice);
        const mrp = round2(rl.mrp || item.mrp);
        const lineSub = round2(qty * pPrice);
        const lineGst = round2((lineSub * rl.gstRate) / 100);
        const lineTotal = round2(lineSub + lineGst);

        subtotal = round2(subtotal + lineSub);
        gstTotal = round2(gstTotal + lineGst);

        // Update item's latest purchase/selling price
        nextItems = nextItems.map((it) =>
          it.id === item.id
            ? {
                ...it,
                purchasePrice: pPrice,
                sellingPrice: isOwner ? sPrice : it.sellingPrice,
                mrp: isOwner ? mrp : it.mrp,
              }
            : it
        );

        const bNum = rl.batchNumber.trim() || `BAT-${Date.now().toString().slice(-4)}`;
        const existingBatchIdx = nextBatches.findIndex(
          (b) =>
            b.itemId === item.id &&
            b.batchNumber.toLowerCase() === bNum.toLowerCase() &&
            b.godownId === rl.godownId
        );

        let batchId: string;
        let prevQty = 0;
        let newQty = qty;

        if (existingBatchIdx >= 0) {
          const existingB = nextBatches[existingBatchIdx];
          batchId = existingB.id;
          prevQty = existingB.quantity;
          newQty = round2(prevQty + qty);
          nextBatches[existingBatchIdx] = {
            ...existingB,
            quantity: newQty,
            purchasePrice: pPrice,
            sellingPrice: sPrice,
            mrp,
            expiryDate: rl.expiryDate || existingB.expiryDate,
            mfgDate: rl.mfgDate || existingB.mfgDate,
            lotOrLicenseNumber: rl.lotNumber || existingB.lotOrLicenseNumber,
          };
        } else {
          batchId = generateId('bat');
          nextBatches.push({
            id: batchId,
            itemId: item.id,
            batchNumber: bNum,
            lotOrLicenseNumber: rl.lotNumber?.trim() || '',
            mfgDate: rl.mfgDate || '',
            expiryDate: rl.expiryDate || '',
            godownId: rl.godownId || item.defaultGodownId,
            quantity: qty,
            purchasePrice: pPrice,
            sellingPrice: sPrice,
            mrp,
            createdAt: new Date().toISOString(),
          });
        }

        newMovements.push({
          id: generateId('sm'),
          itemId: item.id,
          batchId,
          godownId: rl.godownId || item.defaultGodownId,
          type: 'purchase',
          reason: 'purchase',
          qtyChange: qty,
          prevQty,
          newQty,
          refType: 'purchase',
          refId: purId,
          notes: `Purchase ${input.supplierInvoiceNo}`,
          userId: activeUser.id,
          userName: activeUser.name,
          createdAt: new Date().toISOString(),
        });

        builtLines.push({
          id: `${purId}_l${i + 1}`,
          purchaseId: purId,
          itemId: item.id,
          batchId,
          godownId: rl.godownId || item.defaultGodownId,
          itemName: item.name,
          batchNumber: bNum,
          lotNumber: rl.lotNumber?.trim() || '',
          mfgDate: rl.mfgDate || '',
          expiryDate: rl.expiryDate || '',
          unit: item.unit,
          qty,
          purchasePrice: pPrice,
          sellingPrice: sPrice,
          mrp,
          gstRate: rl.gstRate,
          gstAmount: lineGst,
          lineTotal,
        });
      }

      const grandTotal = Math.round(subtotal + gstTotal);
      const paidNow = Math.min(grandTotal, Math.max(0, round2(input.paidAmountNow || 0)));
      const balanceDue = round2(Math.max(0, grandTotal - paidNow));
      const status: Purchase['status'] =
        balanceDue <= 0.01 ? 'Paid' : paidNow > 0.01 ? 'Partly paid' : 'Unpaid';

      const purchase: Purchase = {
        id: purId,
        purchaseNumber: purNo,
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.name,
        supplierInvoiceNo: input.supplierInvoiceNo.trim(),
        date: input.date || todayISO(),
        subtotal,
        gstTotal,
        grandTotal,
        paidAmount: paidNow,
        balanceDue,
        status,
        notes: input.notes?.trim() || '',
        createdBy: activeUser.id,
        createdAt: new Date().toISOString(),
      };
      createdPurchase = purchase;

      const nextPayments = [...prev.payments];
      const nextAllocations = [...prev.paymentAllocations];

      if (paidNow > 0) {
        const payId = generateId('pay');
        const receiptNumber = generateNextSequentialNumber(
          prev.settings.receiptPrefix || 'RCPT',
          fy,
          prev.payments.map((p) => p.receiptNumber)
        );
        nextPayments.unshift({
          id: payId,
          receiptNumber,
          financialYear: fy,
          type: 'payout',
          partyId: supplier.id,
          partyNameSnapshot: supplier.name,
          date: purchase.date,
          amount: paidNow,
          mode: input.paymentMode || 'Bank',
          referenceNo: input.paymentReference?.trim() || '',
          notes: `Payment on Purchase ${purchase.supplierInvoiceNo}`,
          createdBy: activeUser.id,
          createdAt: new Date().toISOString(),
        });
        nextAllocations.push({
          id: generateId('pa'),
          paymentId: payId,
          targetType: 'purchase',
          targetId: purchase.id,
          amount: paidNow,
        });
      }

      const log = appendAudit(prev, {
        entityType: 'purchase',
        entityId: purchase.id,
        action: 'create',
        summary: `Recorded Purchase ${purchase.supplierInvoiceNo} from ${supplier.name} (₹${purchase.grandTotal})`,
      });

      return {
        ...prev,
        items: nextItems,
        batches: nextBatches,
        stockMovements: [...newMovements, ...prev.stockMovements],
        purchases: [purchase, ...prev.purchases],
        purchaseLines: [...prev.purchaseLines, ...builtLines],
        payments: nextPayments,
        paymentAllocations: nextAllocations,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true, purchase: createdPurchase };
  };

  const createPayment: AppContextValue['createPayment'] = (input) => {
    if (!input.partyId) return { ok: false, error: 'Please select a party.' };
    if (!input.amount || input.amount <= 0) {
      return { ok: false, error: 'Payment amount must be greater than zero.' };
    }

    const allocatedTotal = round2(input.allocations.reduce((s, a) => s + a.amount, 0));
    if (allocatedTotal > input.amount + 0.01) {
      return { ok: false, error: 'Allocated bill amounts cannot exceed payment amount.' };
    }

    let createdPay: Payment | undefined;

    commitDb((prev) => {
      const fy = getFinancialYear(input.date || todayISO());
      const payId = generateId('pay');
      const receiptNumber = generateNextSequentialNumber(
        prev.settings.receiptPrefix || 'RCPT',
        fy,
        prev.payments.map((p) => p.receiptNumber)
      );

      let partyName = 'Cash Customer';
      if (input.type === 'receipt' && input.partyId !== 'CASH') {
        partyName = prev.customers.find((c) => c.id === input.partyId)?.name || 'Customer';
      } else if (input.type === 'payout') {
        partyName = prev.suppliers.find((s) => s.id === input.partyId)?.name || 'Supplier';
      }

      const payment: Payment = {
        id: payId,
        receiptNumber,
        financialYear: fy,
        type: input.type,
        partyId: input.partyId,
        partyNameSnapshot: partyName,
        date: input.date || todayISO(),
        amount: round2(input.amount),
        mode: input.mode,
        referenceNo: input.referenceNo?.trim() || '',
        notes: input.notes?.trim() || '',
        createdBy: activeUser.id,
        createdAt: new Date().toISOString(),
      };
      createdPay = payment;

      const newAllocs: PaymentAllocation[] = input.allocations
        .filter((a) => a.amount > 0)
        .map((a) => ({
          id: generateId('pa'),
          paymentId: payId,
          targetType: a.targetType,
          targetId: a.targetId,
          amount: round2(a.amount),
        }));

      const nextAllocations = [...prev.paymentAllocations, ...newAllocs];

      // Recompute status for all affected bills & purchases
      const affectedBillIds = new Set(
        newAllocs.filter((a) => a.targetType === 'bill').map((a) => a.targetId)
      );
      const nextBills = prev.bills.map((b) => {
        if (!affectedBillIds.has(b.id)) return b;
        const recomputed = recomputeBillPaymentStatus(b, nextAllocations);
        return { ...b, ...recomputed };
      });

      const affectedPurchaseIds = new Set(
        newAllocs.filter((a) => a.targetType === 'purchase').map((a) => a.targetId)
      );
      const nextPurchases = prev.purchases.map((p) => {
        if (!affectedPurchaseIds.has(p.id)) return p;
        const recomputed = recomputePurchasePaymentStatus(p, nextAllocations);
        return { ...p, ...recomputed };
      });

      const log = appendAudit(prev, {
        entityType: 'payment',
        entityId: payId,
        action: 'create',
        summary: `${input.type === 'receipt' ? 'Received' : 'Paid'} ₹${payment.amount} (${payment.receiptNumber}) ${input.type === 'receipt' ? 'from' : 'to'} ${partyName}`,
      });

      return {
        ...prev,
        payments: [payment, ...prev.payments],
        paymentAllocations: nextAllocations,
        bills: nextBills,
        purchases: nextPurchases,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    return { ok: true, payment: createdPay };
  };

  const updateShop = (shop: Shop) => {
    commitDb((prev) => ({
      ...prev,
      shop,
      auditLogs: [
        appendAudit(prev, {
          entityType: 'settings',
          entityId: shop.id,
          action: 'update',
          summary: 'Updated shop profile and license details',
        }),
        ...prev.auditLogs,
      ],
    }));
  };

  const updateSettings = (patch: Partial<Settings>) => {
    commitDb((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
      auditLogs: [
        appendAudit(prev, {
          entityType: 'settings',
          entityId: prev.settings.id,
          action: 'update',
          summary: `Updated settings (${Object.keys(patch).join(', ')})`,
        }),
        ...prev.auditLogs,
      ],
    }));
  };

  const switchUser = (userId: string) => {
    commitDb((prev) => ({
      ...prev,
      settings: { ...prev.settings, activeUserId: userId },
    }));
  };

  const exportBackupJson = () => {
    commitDb((prev) => ({
      ...prev,
      auditLogs: [
        appendAudit(prev, {
          entityType: 'backup',
          entityId: 'json',
          action: 'backup',
          summary: 'Exported full JSON backup',
        }),
        ...prev.auditLogs,
      ],
    }));
    return JSON.stringify(db, null, 2);
  };

  const importBackupJson = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as AppDatabase;
      if (!parsed.shop || !Array.isArray(parsed.items) || !Array.isArray(parsed.bills)) {
        return { ok: false, error: 'Invalid backup file structure.' };
      }
      const log = appendAudit(parsed, {
        entityType: 'backup',
        entityId: 'json',
        action: 'restore',
        summary: 'Restored database from JSON backup',
      });
      const restored: AppDatabase = {
        ...parsed,
        auditLogs: [log, ...(parsed.auditLogs || [])],
      };
      setDb(restored);
      void dbAdapter.save(restored);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not parse JSON backup file.' };
    }
  };

  const clearSampleData = () => {
    commitDb((prev) => {
      const empty = createEmptyDatabase(prev.shop, prev.settings);
      return {
        ...empty,
        auditLogs: [
          appendAudit(empty, {
            entityType: 'settings',
            entityId: 'sample',
            action: 'delete',
            summary: 'Cleared sample data and reset shop records',
          }),
        ],
      };
    });
  };

  const reseedSampleData = () => {
    const seeded = createSampleDatabase();
    seeded.settings.language = db.settings.language;
    setDb(seeded);
    void dbAdapter.save(seeded);
  };

  // Expose helper to compute balance quickly when needed
  void getCustomerClosingBalance;

  return (
    <AppContext.Provider
      value={{
        db,
        loading,
        routePath,
        navigateTo,
        authSession,
        loginAccount,
        signupAccount,
        logoutAccount,
        demoLogin,
        activeTab,
        setActiveTab,
        activeUser,
        isOwner,
        isLocked,
        unlockApp,
        lockApp,
        t,
        setLanguage,
        toast,
        showToast,
        clearToast: () => setToast(null),
        billPreselectCustomerId,
        clearBillPreselectCustomer: () => setBillPreselectCustomerId(null),
        billPreselectItemId,
        clearBillPreselectItem: () => setBillPreselectItemId(null),
        paymentIntent,
        clearPaymentIntent: () => setPaymentIntent(null),
        purchasePreselectItemId,
        clearPurchasePreselectItem: () => setPurchasePreselectItemId(null),
        ledgerPreselectCustomerId,
        clearLedgerPreselectCustomer: () => setLedgerPreselectCustomerId(null),
        startBillForCustomer,
        addItemAndGoToBill,
        startPaymentForParty,
        startPurchaseForItem,
        viewCustomerKhata,
        viewingBillId,
        setViewingBillId,
        viewingPaymentId,
        setViewingPaymentId,
        saveItem,
        adjustStock,
        saveCustomer,
        saveSupplier,
        saveGodown,
        createBill,
        cancelBill,
        createPurchase,
        createPayment,
        updateShop,
        updateSettings,
        switchUser,
        exportBackupJson,
        importBackupJson,
        clearSampleData,
        reseedSampleData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
