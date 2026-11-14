export function formatINR(value: number, showSymbol = true): string {
  const num = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));
  const prefix = num < 0 ? '-' : '';
  return showSymbol ? `${prefix}₹${formatted}` : `${prefix}${formatted}`;
}

export function formatINRCompact(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  return formatINR(num, true);
}

export function formatIndianNumber(value: number, decimals = 0): string {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysISO(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateDDMMYYYY(isoDate?: string): string {
  if (!isoDate) return '-';
  const datePart = isoDate.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return isoDate;
  const [yyyy, mm, dd] = parts;
  if (!yyyy || !mm || !dd) return isoDate;
  return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
}

export function formatDateTimeDDMMYYYY(isoTimestamp?: string): string {
  if (!isoTimestamp) return '-';
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return isoTimestamp;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function daysBetweenISO(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  const t1 = new Date(y1, (m1 || 1) - 1, d1 || 1).getTime();
  const t2 = new Date(y2, (m2 || 1) - 1, d2 || 1).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

export function getFinancialYear(isoDate: string): string {
  const [yearStr, monthStr] = isoDate.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  // Indian Financial Year runs April (4) to March (3)
  if (month >= 4) {
    const nextShort = String((year + 1) % 100).padStart(2, '0');
    return `${year}-${nextShort}`;
  } else {
    const currShort = String(year % 100).padStart(2, '0');
    return `${year - 1}-${currShort}`;
  }
}

export function validateMobile(mobile: string): boolean {
  const cleaned = mobile.trim();
  return /^[6-9]\d{9}$/.test(cleaned);
}

export function validateGSTIN(gstin: string): boolean {
  const cleaned = gstin.trim().toUpperCase();
  if (!cleaned) return true; // optional unless required explicitly
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleaned);
}

export function amountInWordsINR(amount: number): string {
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`.trim();
  };

  const threeDigits = (n: number): string => {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return `${h ? ones[h] + ' Hundred' : ''}${h && rem ? ' ' : ''}${twoDigits(rem)}`.trim();
  };

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let words = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  if (crore) words += `${twoDigits(crore)} Crore `;
  if (lakh) words += `${twoDigits(lakh)} Lakh `;
  if (thousand) words += `${twoDigits(thousand)} Thousand `;
  if (rest) words += `${threeDigits(rest)}`;

  words = words.trim();
  let result = words ? `${words} Rupees` : '';
  if (paise > 0) {
    result += `${result ? ' and ' : ''}${twoDigits(paise)} Paise`;
  }
  return `${result} Only`;
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
