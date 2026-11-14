export type LanguageCode = 'en' | 'hi' | 'mr';
export type UserRole = 'owner' | 'staff';
export type GstRate = 0 | 5 | 12 | 18;
export type ItemCategory = 'Seeds' | 'Fertilizer' | 'Pesticide' | 'General' | 'Other';
export type ItemUnit = 'kg' | 'g' | 'packet' | 'bag' | 'litre' | 'ml' | 'piece' | 'box';
export type SupplyType = 'intra' | 'inter';
export type BillPaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank' | 'Credit' | 'Part';
export type ReceiptPaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank';
export type DocumentStatus = 'Unpaid' | 'Partly paid' | 'Paid' | 'Cancelled';
export type InvoiceTemplateType = 'a4' | 'thermal80' | 'thermal58';

export type NavTab =
  | 'dashboard'
  | 'new-bill'
  | 'items'
  | 'stock'
  | 'customers'
  | 'suppliers'
  | 'payments'
  | 'purchases'
  | 'find'
  | 'scan-bill'
  | 'reports'
  | 'settings';

export interface Shop {
  id: string;
  name: string;
  address: string;
  mobile: string;
  email: string;
  gstin: string;
  stateName: string;
  stateCode: string;
  pesticideLicense: string;
  seedLicense: string;
  fertilizerLicense: string;
  logoDataUrl?: string;
  bankDetails?: string;
  termsAndConditions: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  mobile?: string;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  village: string;
  address: string;
  gstin?: string;
  aadhaarFarmerId?: string;
  creditLimit: number;
  openingBalance: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  mobile: string;
  village: string;
  address: string;
  gstin?: string;
  openingBalance: number;
  createdAt: string;
}

export interface Godown {
  id: string;
  name: string;
  location: string;
  rackInfo: string;
  isDefault: boolean;
}

export interface Item {
  id: string;
  code: string;
  barcode?: string;
  name: string;
  category: ItemCategory;
  brand: string;
  hsnCode: string;
  gstRate: GstRate;
  unit: ItemUnit;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  minStockLevel: number;
  defaultGodownId: string;
  rackLocation?: string;
  photoDataUrl?: string;
  createdAt: string;
}

export interface Batch {
  id: string;
  itemId: string;
  batchNumber: string;
  lotOrLicenseNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  godownId: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  createdAt: string;
}

export type StockMovementType = 'purchase' | 'sale' | 'sale_cancel' | 'adjustment' | 'opening';
export type StockAdjustmentReason =
  | 'damage'
  | 'return'
  | 'expiry'
  | 'correction'
  | 'purchase'
  | 'sale'
  | 'cancel'
  | 'opening';

export interface StockMovement {
  id: string;
  itemId: string;
  batchId: string;
  godownId: string;
  type: StockMovementType;
  reason: StockAdjustmentReason;
  qtyChange: number;
  prevQty: number;
  newQty: number;
  refType: 'bill' | 'purchase' | 'manual';
  refId: string;
  notes?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  financialYear: string;
  date: string;
  customerId: string; // 'CASH' or customer.id
  customerNameSnapshot: string;
  customerMobileSnapshot?: string;
  customerVillageSnapshot?: string;
  customerGstinSnapshot?: string;
  supplyType: SupplyType;
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  paymentMode: BillPaymentMode;
  status: DocumentStatus;
  cancelledAt?: string;
  cancelReason?: string;
  notes?: string;
  expiredOverrideUsed?: boolean;
  createdBy: string;
  createdAt: string;
}

export interface BillLine {
  id: string;
  billId: string;
  itemId: string;
  batchId: string;
  godownId: string;
  itemName: string;
  hsnCode: string;
  batchNumber: string;
  unit: ItemUnit;
  qty: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxableValue: number;
  gstRate: GstRate;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
  purchasePriceSnapshot: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierInvoiceNo: string;
  date: string;
  subtotal: number;
  gstTotal: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  status: Exclude<DocumentStatus, 'Cancelled'>;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseLine {
  id: string;
  purchaseId: string;
  itemId: string;
  batchId: string;
  godownId: string;
  itemName: string;
  batchNumber: string;
  lotNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  unit: ItemUnit;
  qty: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstRate: GstRate;
  gstAmount: number;
  lineTotal: number;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  financialYear: string;
  type: 'receipt' | 'payout'; // receipt = from customer, payout = to supplier
  partyId: string;
  partyNameSnapshot: string;
  date: string;
  amount: number;
  mode: ReceiptPaymentMode;
  referenceNo?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  targetType: 'bill' | 'purchase';
  targetId: string;
  amount: number;
}

export interface Settings {
  id: string;
  billPrefix: string;
  receiptPrefix: string;
  currentFinancialYear: string;
  invoiceTemplate: InvoiceTemplateType;
  defaultGstRate: GstRate;
  allowNegativeStock: boolean;
  pinLockEnabled: boolean;
  shopPin: string;
  activeUserId: string;
  language: LanguageCode;
  sampleDataSeeded: boolean;
}

export interface AuditLog {
  id: string;
  entityType: 'bill' | 'payment' | 'purchase' | 'stock' | 'item' | 'customer' | 'supplier' | 'settings' | 'backup';
  entityId: string;
  action: 'create' | 'update' | 'cancel' | 'adjust' | 'delete' | 'backup' | 'restore';
  userId: string;
  userName: string;
  timestamp: string;
  summary: string;
  oldValue?: string;
  newValue?: string;
}

export interface AppDatabase {
  shop: Shop;
  users: User[];
  customers: Customer[];
  suppliers: Supplier[];
  godowns: Godown[];
  items: Item[];
  batches: Batch[];
  stockMovements: StockMovement[];
  bills: Bill[];
  billLines: BillLine[];
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
  settings: Settings;
  auditLogs: AuditLog[];
}
