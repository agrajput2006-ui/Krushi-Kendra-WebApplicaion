import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bill,
  BillLine,
  Customer,
  Payment,
  Shop,
} from '../types/models';
import {
  amountInWordsINR,
  formatDateDDMMYYYY,
  formatINR,
} from './formatters';
import { LedgerEntry } from './calculations';
import { SHOP_CONFIG } from '../config/shopConfig';

export function exportToCSV(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  // Prepend UTF-8 BOM so Excel on Windows opens Hindi/Marathi/INR ₹ cleanly
  const csvContent =
    '\uFEFF' +
    [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function pdfINR(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));
  return `${num < 0 ? '-' : ''}Rs. ${formatted}`;
}

function toPdfSafeText(text: string, fallback: string): string {
  // jsPDF built-in Helvetica only renders Latin characters; fall back cleanly when Devanagari is used
  return /[^\x20-\x7E]/.test(text) ? fallback : text;
}

export function downloadBillPDF(shop: Shop, bill: Bill, lines: BillLine[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(toPdfSafeText(shop.name, SHOP_CONFIG.englishName), 14, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(toPdfSafeText(shop.address, SHOP_CONFIG.englishAddress), 14, 22);
  doc.text(`Mobile: ${shop.mobile}${shop.gstin ? '  |  GSTIN: ' + shop.gstin : ''}`, 14, 27);
  const licenses = [
    shop.seedLicense ? `Seed Lic: ${shop.seedLicense}` : '',
    shop.fertilizerLicense ? `Fert Lic: ${shop.fertilizerLicense}` : '',
    shop.pesticideLicense ? `Pest Lic: ${shop.pesticideLicense}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  if (licenses) {
    doc.text(licenses, 14, 32);
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(bill.status === 'Cancelled' ? 'TAX INVOICE (CANCELLED)' : 'TAX INVOICE', 196, 16, {
    align: 'right',
  });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bill No: ${bill.billNumber}`, 196, 22, { align: 'right' });
  doc.text(`Date: ${formatDateDDMMYYYY(bill.date)}`, 196, 27, { align: 'right' });
  doc.text(`Status: ${bill.status} (${bill.paymentMode})`, 196, 32, { align: 'right' });

  doc.line(14, 36, 196, 36);

  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 14, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(bill.customerNameSnapshot, 30, 42);
  const custMeta = [
    bill.customerMobileSnapshot ? `Ph: ${bill.customerMobileSnapshot}` : '',
    bill.customerVillageSnapshot ? `Village: ${bill.customerVillageSnapshot}` : '',
    bill.customerGstinSnapshot ? `GSTIN: ${bill.customerGstinSnapshot}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  if (custMeta) doc.text(custMeta, 30, 47);

  autoTable(doc, {
    startY: 52,
    head: [['#', 'Item / Batch', 'HSN', 'Qty', 'Rate', 'Disc', 'Taxable', 'GST%', 'GST Amt', 'Total']],
    body: lines.map((l, idx) => [
      idx + 1,
      `${l.itemName}\nBatch: ${l.batchNumber}`,
      l.hsnCode || '-',
      `${l.qty} ${l.unit}`,
      pdfINR(l.rate),
      l.discountAmount > 0 ? pdfINR(l.discountAmount) : '-',
      pdfINR(l.taxableValue),
      `${l.gstRate}%`,
      pdfINR(l.cgstAmount + l.sgstAmount + l.igstAmount),
      pdfINR(l.lineTotal),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [21, 128, 61], textColor: 255 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFontSize(9);
  doc.text(`Amount in Words: ${amountInWordsINR(bill.grandTotal)}`, 14, finalY);
  if (shop.termsAndConditions) {
    doc.setFontSize(8);
    doc.text(`Jurisdiction / Terms: ${toPdfSafeText(shop.termsAndConditions, 'Subject to Pachora Jurisdiction')}`, 14, finalY + 6, { maxWidth: 110 });
  }

  const rightX = 196;
  doc.setFontSize(9);
  doc.text(`Taxable Value: ${pdfINR(bill.taxableTotal)}`, rightX, finalY, { align: 'right' });
  if (bill.supplyType === 'inter') {
    doc.text(`IGST: ${pdfINR(bill.igstTotal)}`, rightX, finalY + 5, { align: 'right' });
  } else {
    doc.text(`CGST: ${pdfINR(bill.cgstTotal)}  |  SGST: ${pdfINR(bill.sgstTotal)}`, rightX, finalY + 5, {
      align: 'right',
    });
  }
  doc.text(`Round Off: ${pdfINR(bill.roundOff)}`, rightX, finalY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Grand Total: ${pdfINR(bill.grandTotal)}`, rightX, finalY + 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Paid: ${pdfINR(bill.paidAmount)}  |  Balance Due: ${pdfINR(bill.balanceDue)}`, rightX, finalY + 21, {
    align: 'right',
  });

  doc.text('Authorized Signatory', 196, finalY + 36, { align: 'right' });

  const safeName = bill.billNumber.replace(/[/\\]/g, '_');
  doc.save(`${safeName}.pdf`);
}

export function downloadReceiptPDF(shop: Shop, payment: Payment) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(toPdfSafeText(shop.name, SHOP_CONFIG.englishName), 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${toPdfSafeText(shop.address, SHOP_CONFIG.englishAddress)} | Ph: ${shop.mobile}`, 14, 22);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(payment.type === 'receipt' ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER', 196, 16, {
    align: 'right',
  });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Receipt No: ${payment.receiptNumber}`, 196, 22, { align: 'right' });
  doc.text(`Date: ${formatDateDDMMYYYY(payment.date)}`, 196, 27, { align: 'right' });

  doc.line(14, 31, 196, 31);

  doc.setFontSize(10);
  doc.text(
    `${payment.type === 'receipt' ? 'Received with thanks from' : 'Paid to'}: ${payment.partyNameSnapshot}`,
    14,
    42
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Amount: ${pdfINR(payment.amount)}`, 14, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`In Words: ${amountInWordsINR(payment.amount)}`, 14, 60);
  doc.text(
    `Mode: ${payment.mode}${payment.referenceNo ? '  |  Ref/UTR: ' + payment.referenceNo : ''}`,
    14,
    68
  );
  if (payment.notes) {
    doc.text(`Notes: ${payment.notes}`, 14, 76);
  }
  doc.text('Receiver Signature', 14, 105);
  doc.text('Authorized Signatory', 196, 105, { align: 'right' });

  const safeName = payment.receiptNumber.replace(/[/\\]/g, '_');
  doc.save(`${safeName}.pdf`);
}

export function downloadStatementPDF(
  shop: Shop,
  title: string,
  subtitle: string,
  entries: LedgerEntry[],
  closingBalance: number,
  customer?: Customer
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(toPdfSafeText(shop.name, SHOP_CONFIG.englishName), 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${toPdfSafeText(shop.address, SHOP_CONFIG.englishAddress)} | Mobile: ${shop.mobile}`, 14, 21);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 30);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 14, 35);
  if (customer) {
    doc.text(
      `Customer: ${customer.name} | Mobile: ${customer.mobile}${customer.village ? ' | ' + customer.village : ''}`,
      14,
      40
    );
  }

  autoTable(doc, {
    startY: customer ? 45 : 40,
    head: [['Date', 'Ref No', 'Particulars', 'Debit (Bill)', 'Credit (Paid)', 'Balance']],
    body: entries.map((e) => [
      formatDateDDMMYYYY(e.date),
      e.refNumber,
      e.description,
      e.debit > 0 ? pdfINR(e.debit) : '-',
      e.credit > 0 ? pdfINR(e.credit) : '-',
      pdfINR(e.runningBalance),
    ]),
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [21, 128, 61], textColor: 255 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Closing Balance: ${pdfINR(closingBalance)}`, 196, finalY, { align: 'right' });

  doc.save(`${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
}

export function buildWhatsAppBillUrl(shop: Shop, bill: Bill, lines: BillLine[]): string {
  const itemLines = lines
    .slice(0, 12)
    .map((l, i) => `${i + 1}. ${l.itemName} (${l.qty} ${l.unit}) - ${formatINR(l.lineTotal)}`)
    .join('\n');
  const text = [
    `*${shop.name}*`,
    `Bill No: ${bill.billNumber}`,
    `Date: ${formatDateDDMMYYYY(bill.date)}`,
    `Customer: ${bill.customerNameSnapshot}`,
    `------------------`,
    itemLines,
    lines.length > 12 ? `... +${lines.length - 12} more items` : '',
    `------------------`,
    `*Total: ${formatINR(bill.grandTotal)}*`,
    `Paid: ${formatINR(bill.paidAmount)} | Balance Due: ${formatINR(bill.balanceDue)}`,
    `Thank you for shopping with us!`,
  ]
    .filter(Boolean)
    .join('\n');

  const phone = bill.customerMobileSnapshot?.replace(/\D/g, '');
  const prefix = phone && phone.length === 10 ? `https://wa.me/91${phone}` : 'https://wa.me/';
  return `${prefix}?text=${encodeURIComponent(text)}`;
}

export function buildWhatsAppReceiptUrl(shop: Shop, payment: Payment, mobile?: string): string {
  const text = [
    `*${shop.name}*`,
    `Payment Receipt: ${payment.receiptNumber}`,
    `Date: ${formatDateDDMMYYYY(payment.date)}`,
    `Party: ${payment.partyNameSnapshot}`,
    `Amount Received: *${formatINR(payment.amount)}* (${payment.mode})`,
    payment.referenceNo ? `Ref/UTR: ${payment.referenceNo}` : '',
    `Thank you!`,
  ]
    .filter(Boolean)
    .join('\n');

  const phone = mobile?.replace(/\D/g, '');
  const prefix = phone && phone.length === 10 ? `https://wa.me/91${phone}` : 'https://wa.me/';
  return `${prefix}?text=${encodeURIComponent(text)}`;
}
