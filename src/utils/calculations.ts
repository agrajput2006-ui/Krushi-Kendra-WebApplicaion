import {
  Batch,
  Bill,
  BillLine,
  Customer,
  GstRate,
  Payment,
  PaymentAllocation,
  Purchase,
  Supplier,
  SupplyType,
} from '../types/models';
import { daysBetweenISO, getFinancialYear, todayISO } from './formatters';

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface LineCalcInput {
  qty: number;
  rate: number;
  discountPercent: number;
  gstRate: GstRate;
  supplyType: SupplyType;
}

export interface LineCalcResult {
  grossAmount: number;
  discountAmount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstTotal: number;
  lineTotal: number;
}

export function calculateLineTotals(input: LineCalcInput): LineCalcResult {
  const qty = Math.max(0, Number(input.qty) || 0);
  const rate = Math.max(0, Number(input.rate) || 0);
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent) || 0));

  const grossAmount = round2(qty * rate);
  const discountAmount = round2((grossAmount * discountPercent) / 100);
  const taxableValue = round2(grossAmount - discountAmount);
  const gstTotal = round2((taxableValue * input.gstRate) / 100);

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (input.supplyType === 'inter') {
    igstAmount = gstTotal;
  } else {
    cgstAmount = round2(gstTotal / 2);
    sgstAmount = round2(gstTotal - cgstAmount);
  }

  const lineTotal = round2(taxableValue + cgstAmount + sgstAmount + igstAmount);
  return {
    grossAmount,
    discountAmount,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstTotal,
    lineTotal,
  };
}

export interface BillTotalsSummary {
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  rawTotal: number;
  roundOff: number;
  grandTotal: number;
}

export function calculateBillTotals(lines: Array<{
  qty: number;
  rate: number;
  discountAmount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}>): BillTotalsSummary {
  let subtotal = 0;
  let discountTotal = 0;
  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  let rawTotal = 0;

  for (const line of lines) {
    subtotal += round2(line.qty * line.rate);
    discountTotal += line.discountAmount;
    taxableTotal += line.taxableValue;
    cgstTotal += line.cgstAmount;
    sgstTotal += line.sgstAmount;
    igstTotal += line.igstAmount;
    rawTotal += line.lineTotal;
  }

  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  taxableTotal = round2(taxableTotal);
  cgstTotal = round2(cgstTotal);
  sgstTotal = round2(sgstTotal);
  igstTotal = round2(igstTotal);
  rawTotal = round2(rawTotal);

  const grandTotal = Math.round(rawTotal);
  const roundOff = round2(grandTotal - rawTotal);

  return {
    subtotal,
    discountTotal,
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    rawTotal,
    roundOff,
    grandTotal,
  };
}

export function generateNextSequentialNumber(
  prefix: string,
  financialYear: string,
  existingNumbers: string[]
): string {
  const base = `${prefix}/${financialYear}/`;
  let maxSeq = 0;
  for (const num of existingNumbers) {
    if (num.startsWith(base)) {
      const suffix = num.slice(base.length);
      const parsed = parseInt(suffix, 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  return `${base}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function getBatchExpiryStatus(
  batch: Batch,
  referenceDate = todayISO()
): 'expired' | 'expiring_soon' | 'ok' | 'none' {
  if (!batch.expiryDate) return 'none';
  const days = daysBetweenISO(referenceDate, batch.expiryDate);
  if (days < 0) return 'expired';
  if (days <= 60) return 'expiring_soon';
  return 'ok';
}

export function getItemTotalStock(itemId: string, batches: Batch[]): number {
  return round2(
    batches
      .filter((b) => b.itemId === itemId)
      .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0)
  );
}

export interface LedgerEntry {
  id: string;
  date: string;
  createdAt: string;
  type: 'opening' | 'bill' | 'payment' | 'purchase' | 'payout';
  refNumber: string;
  refId?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export function calculateCustomerLedger(
  customer: Customer,
  bills: Bill[],
  payments: Payment[],
  dateFrom?: string,
  dateTo?: string
): {
  entries: LedgerEntry[];
  openingForPeriod: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
} {
  const custBills = bills.filter(
    (b) => b.customerId === customer.id && b.status !== 'Cancelled'
  );
  const custPayments = payments.filter(
    (p) => p.type === 'receipt' && p.partyId === customer.id
  );

  const combined: Array<{
    id: string;
    date: string;
    createdAt: string;
    type: 'bill' | 'payment';
    refNumber: string;
    refId: string;
    description: string;
    debit: number;
    credit: number;
  }> = [
    ...custBills.map((b) => ({
      id: `b_${b.id}`,
      date: b.date,
      createdAt: b.createdAt,
      type: 'bill' as const,
      refNumber: b.billNumber,
      refId: b.id,
      description: `Sale Bill (${b.paymentMode})`,
      debit: b.grandTotal,
      credit: 0,
    })),
    ...custPayments.map((p) => ({
      id: `p_${p.id}`,
      date: p.date,
      createdAt: p.createdAt,
      type: 'payment' as const,
      refNumber: p.receiptNumber,
      refId: p.id,
      description: `Payment Received (${p.mode}${p.referenceNo ? ' · ' + p.referenceNo : ''})`,
      debit: 0,
      credit: p.amount,
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  let running = round2(customer.openingBalance || 0);
  let openingForPeriod = running;
  const entries: LedgerEntry[] = [];

  if (!dateFrom) {
    entries.push({
      id: `open_${customer.id}`,
      date: customer.createdAt.split('T')[0] || todayISO(),
      createdAt: customer.createdAt,
      type: 'opening',
      refNumber: '-',
      description: 'Opening Balance',
      debit: running > 0 ? running : 0,
      credit: running < 0 ? Math.abs(running) : 0,
      runningBalance: running,
    });
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const row of combined) {
    if (dateFrom && row.date < dateFrom) {
      running = round2(running + row.debit - row.credit);
      openingForPeriod = running;
      continue;
    }
    if (dateTo && row.date > dateTo) {
      continue;
    }

    if (dateFrom && entries.length === 0) {
      entries.push({
        id: `open_period_${customer.id}`,
        date: dateFrom,
        createdAt: dateFrom,
        type: 'opening',
        refNumber: '-',
        description: 'Balance Brought Forward',
        debit: openingForPeriod > 0 ? openingForPeriod : 0,
        credit: openingForPeriod < 0 ? Math.abs(openingForPeriod) : 0,
        runningBalance: openingForPeriod,
      });
    }

    running = round2(running + row.debit - row.credit);
    totalDebits = round2(totalDebits + row.debit);
    totalCredits = round2(totalCredits + row.credit);

    entries.push({
      id: row.id,
      date: row.date,
      createdAt: row.createdAt,
      type: row.type,
      refNumber: row.refNumber,
      refId: row.refId,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      runningBalance: running,
    });
  }

  if (dateFrom && entries.length === 0) {
    entries.push({
      id: `open_period_${customer.id}`,
      date: dateFrom,
      createdAt: dateFrom,
      type: 'opening',
      refNumber: '-',
      description: 'Balance Brought Forward',
      debit: openingForPeriod > 0 ? openingForPeriod : 0,
      credit: openingForPeriod < 0 ? Math.abs(openingForPeriod) : 0,
      runningBalance: openingForPeriod,
    });
  }

  return {
    entries,
    openingForPeriod,
    totalDebits,
    totalCredits,
    closingBalance: running,
  };
}

export function getCustomerClosingBalance(
  customer: Customer,
  bills: Bill[],
  payments: Payment[]
): number {
  const billTotal = bills
    .filter((b) => b.customerId === customer.id && b.status !== 'Cancelled')
    .reduce((sum, b) => sum + b.grandTotal, 0);
  const paymentTotal = payments
    .filter((p) => p.type === 'receipt' && p.partyId === customer.id)
    .reduce((sum, p) => sum + p.amount, 0);
  return round2((customer.openingBalance || 0) + billTotal - paymentTotal);
}

export function calculateSupplierLedger(
  supplier: Supplier,
  purchases: Purchase[],
  payments: Payment[],
  dateFrom?: string,
  dateTo?: string
): {
  entries: LedgerEntry[];
  openingForPeriod: number;
  totalPurchases: number;
  totalPaid: number;
  closingPayable: number;
} {
  const supPurchases = purchases.filter((p) => p.supplierId === supplier.id);
  const supPayouts = payments.filter(
    (p) => p.type === 'payout' && p.partyId === supplier.id
  );

  const combined = [
    ...supPurchases.map((pu) => ({
      id: `pu_${pu.id}`,
      date: pu.date,
      createdAt: pu.createdAt,
      type: 'purchase' as const,
      refNumber: pu.supplierInvoiceNo || pu.purchaseNumber,
      refId: pu.id,
      description: `Purchase Bill (${pu.purchaseNumber})`,
      credit: pu.grandTotal,
      debit: 0,
    })),
    ...supPayouts.map((py) => ({
      id: `py_${py.id}`,
      date: py.date,
      createdAt: py.createdAt,
      type: 'payout' as const,
      refNumber: py.receiptNumber,
      refId: py.id,
      description: `Payment Made (${py.mode}${py.referenceNo ? ' · ' + py.referenceNo : ''})`,
      credit: 0,
      debit: py.amount,
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Payable balance: positive = shop owes supplier
  let running = round2(supplier.openingBalance || 0);
  let openingForPeriod = running;
  const entries: LedgerEntry[] = [];

  if (!dateFrom) {
    entries.push({
      id: `open_${supplier.id}`,
      date: supplier.createdAt.split('T')[0] || todayISO(),
      createdAt: supplier.createdAt,
      type: 'opening',
      refNumber: '-',
      description: 'Opening Payable Balance',
      debit: 0,
      credit: running,
      runningBalance: running,
    });
  }

  let totalPurchases = 0;
  let totalPaid = 0;

  for (const row of combined) {
    if (dateFrom && row.date < dateFrom) {
      running = round2(running + row.credit - row.debit);
      openingForPeriod = running;
      continue;
    }
    if (dateTo && row.date > dateTo) {
      continue;
    }

    if (dateFrom && entries.length === 0) {
      entries.push({
        id: `open_period_${supplier.id}`,
        date: dateFrom,
        createdAt: dateFrom,
        type: 'opening',
        refNumber: '-',
        description: 'Balance Brought Forward',
        debit: 0,
        credit: openingForPeriod,
        runningBalance: openingForPeriod,
      });
    }

    running = round2(running + row.credit - row.debit);
    totalPurchases = round2(totalPurchases + row.credit);
    totalPaid = round2(totalPaid + row.debit);

    entries.push({
      id: row.id,
      date: row.date,
      createdAt: row.createdAt,
      type: row.type,
      refNumber: row.refNumber,
      refId: row.refId,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      runningBalance: running,
    });
  }

  return {
    entries,
    openingForPeriod,
    totalPurchases,
    totalPaid,
    closingPayable: running,
  };
}

export function getSupplierPayableBalance(
  supplier: Supplier,
  purchases: Purchase[],
  payments: Payment[]
): number {
  const purTotal = purchases
    .filter((p) => p.supplierId === supplier.id)
    .reduce((sum, p) => sum + p.grandTotal, 0);
  const payTotal = payments
    .filter((p) => p.type === 'payout' && p.partyId === supplier.id)
    .reduce((sum, p) => sum + p.amount, 0);
  return round2((supplier.openingBalance || 0) + purTotal - payTotal);
}

export function recomputeBillPaymentStatus(
  bill: Bill,
  allocations: PaymentAllocation[]
): { paidAmount: number; balanceDue: number; status: Bill['status'] } {
  if (bill.status === 'Cancelled') {
    return { paidAmount: bill.paidAmount, balanceDue: 0, status: 'Cancelled' };
  }
  const allocatedSum = round2(
    allocations
      .filter((a) => a.targetType === 'bill' && a.targetId === bill.id)
      .reduce((s, a) => s + a.amount, 0)
  );
  // If bill had upfront paidAmount not tied to a receipt (e.g. cash sale) vs receipt allocations:
  // In our system, every payment received (including upfront cash/UPI/part on a bill) creates a Payment + PaymentAllocation!
  const paidAmount = Math.min(bill.grandTotal, allocatedSum);
  const balanceDue = round2(Math.max(0, bill.grandTotal - paidAmount));
  let status: Bill['status'] = 'Unpaid';
  if (balanceDue <= 0.01) {
    status = 'Paid';
  } else if (paidAmount > 0.01) {
    status = 'Partly paid';
  }
  return { paidAmount, balanceDue, status };
}

export function recomputePurchasePaymentStatus(
  purchase: Purchase,
  allocations: PaymentAllocation[]
): { paidAmount: number; balanceDue: number; status: Purchase['status'] } {
  const allocatedSum = round2(
    allocations
      .filter((a) => a.targetType === 'purchase' && a.targetId === purchase.id)
      .reduce((s, a) => s + a.amount, 0)
  );
  const paidAmount = Math.min(purchase.grandTotal, allocatedSum);
  const balanceDue = round2(Math.max(0, purchase.grandTotal - paidAmount));
  let status: Purchase['status'] = 'Unpaid';
  if (balanceDue <= 0.01) status = 'Paid';
  else if (paidAmount > 0.01) status = 'Partly paid';
  return { paidAmount, balanceDue, status };
}

export function calculateBillLineProfit(line: BillLine): number {
  const cost = round2(line.qty * (line.purchasePriceSnapshot || 0));
  return round2(line.taxableValue - cost);
}

export function getCurrentFY(): string {
  return getFinancialYear(todayISO());
}
