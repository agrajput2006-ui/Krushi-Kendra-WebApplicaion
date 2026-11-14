import React, { useState } from 'react';
import { Camera, Upload, AlertTriangle, CheckCircle2, Loader2, Trash2, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GstRate, ItemUnit } from '../types/models';
import { formatINR, todayISO } from '../utils/formatters';
import { round2 } from '../utils/calculations';

interface ExtractedItemRow {
  key: string;
  matchedItemId: string; // '' = create new item
  name: string;
  batchNumber: string;
  expiryDate: string;
  hsnCode: string;
  qty: number;
  unit: ItemUnit;
  rate: number;
  sellingPrice: number;
  gstRate: GstRate;
  godownId: string;
  confidence: string;
}

const VALID_UNITS: ItemUnit[] = ['kg', 'g', 'packet', 'bag', 'litre', 'ml', 'piece', 'box'];

export function ScanBillPage() {
  const { db, createPurchase, saveItem, saveSupplier, showToast, setActiveTab, t } = useApp();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Editable review state
  const [hasExtracted, setHasExtracted] = useState(false);
  const [supplierId, setSupplierId] = useState<string>('');
  const [extractedSupplierName, setExtractedSupplierName] = useState('');
  const [extractedSupplierGstin, setExtractedSupplierGstin] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [lowConfFields, setLowConfFields] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ExtractedItemRow[]>([]);

  const isLowConf = (fieldKey: string) =>
    lowConfFields.some((f) => f.toLowerCase().includes(fieldKey.toLowerCase()));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setHasExtracted(false);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') return;
      setPreviewUrl(dataUrl);
      await runGeminiScan(dataUrl, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  };

  const runGeminiScan = async (dataUrl: string, mimeType: string) => {
    setScanning(true);
    setScanError(null);
    try {
      const resp = await fetch('/api/scan-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, mimeType }),
      });

      const payload = await resp.json();
      if (!resp.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to extract bill');
      }

      const data = payload.data || {};
      const supName = String(data.supplierName || '').trim();
      setExtractedSupplierName(supName);
      setExtractedSupplierGstin(String(data.supplierGstin || '').trim());

      // Auto-match existing supplier
      const matchedSup = db.suppliers.find(
        (s) =>
          (data.supplierGstin && s.gstin?.toUpperCase() === String(data.supplierGstin).toUpperCase()) ||
          (supName && s.name.toLowerCase().includes(supName.toLowerCase()))
      );
      setSupplierId(matchedSup?.id || db.suppliers[0]?.id || '');

      setBillNumber(String(data.billNumber || `SCAN-${Date.now().toString().slice(-4)}`));
      setBillDate(
        data.billDate && /^\d{4}-\d{2}-\d{2}$/.test(data.billDate) ? data.billDate : todayISO()
      );
      setLowConfFields(Array.isArray(data.lowConfidenceFields) ? data.lowConfidenceFields : []);
      setNotes(String(data.notes || ''));

      const rawItems = Array.isArray(data.items) ? data.items : [];
      const mappedRows: ExtractedItemRow[] = rawItems.map((it: Record<string, unknown>, idx: number) => {
        const itemName = String(it.name || `Scanned Item ${idx + 1}`).trim();
        const existingMatch = db.items.find(
          (m) =>
            m.name.toLowerCase().includes(itemName.toLowerCase()) ||
            itemName.toLowerCase().includes(m.name.toLowerCase())
        );
        const unitRaw = String(it.unit || 'packet').toLowerCase() as ItemUnit;
        const unit: ItemUnit = VALID_UNITS.includes(unitRaw) ? unitRaw : 'packet';
        const gstNum = Number(it.gstRate);
        const gstRate: GstRate = [0, 5, 12, 18].includes(gstNum) ? (gstNum as GstRate) : 5;
        const rate = Number(it.rate) || existingMatch?.purchasePrice || 0;

        return {
          key: `sc_${Date.now()}_${idx}`,
          matchedItemId: existingMatch?.id || '',
          name: itemName,
          batchNumber: String(it.batchNumber || `BAT-${Date.now().toString().slice(-4)}`),
          expiryDate:
            typeof it.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.expiryDate)
              ? it.expiryDate
              : '',
          hsnCode: String(it.hsnCode || existingMatch?.hsnCode || ''),
          qty: Number(it.qty) || 1,
          unit,
          rate,
          sellingPrice: existingMatch?.sellingPrice || round2(rate * 1.15),
          gstRate,
          godownId: existingMatch?.defaultGodownId || db.godowns[0]?.id || 'gd_main',
          confidence: String(it.confidence || 'medium'),
        };
      });

      setItems(mappedRows);
      setHasExtracted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan error';
      setScanError(msg);
      showToast('error', msg);
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      showToast('error', 'No items to save.');
      return;
    }

    let finalSupplierId = supplierId;
    if (!finalSupplierId && extractedSupplierName) {
      const supRes = saveSupplier({
        name: extractedSupplierName,
        mobile: '9800000000',
        village: '',
        address: '',
        gstin: extractedSupplierGstin,
        openingBalance: 0,
      });
      if (supRes.ok && supRes.supplier) {
        finalSupplierId = supRes.supplier.id;
      }
    }

    if (!finalSupplierId) {
      showToast('error', 'Please select or enter a supplier.');
      return;
    }

    // Create any unmatched new items first
    const resolvedLines = items.map((row) => {
      let itemId = row.matchedItemId;
      if (!itemId) {
        const created = saveItem({
          name: row.name,
          category: 'General',
          brand: '',
          hsnCode: row.hsnCode,
          gstRate: row.gstRate,
          unit: row.unit,
          purchasePrice: row.rate,
          sellingPrice: row.sellingPrice,
          mrp: row.sellingPrice,
          minStockLevel: 5,
          defaultGodownId: row.godownId,
        });
        if (created.ok && created.item) {
          itemId = created.item.id;
        }
      }
      return {
        itemId,
        godownId: row.godownId,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        qty: row.qty,
        purchasePrice: row.rate,
        sellingPrice: row.sellingPrice,
        mrp: row.sellingPrice,
        gstRate: row.gstRate,
      };
    });

    const purRes = createPurchase({
      supplierId: finalSupplierId,
      supplierInvoiceNo: billNumber || `SCAN-${Date.now().toString().slice(-4)}`,
      date: billDate,
      paidAmountNow: 0,
      notes: notes || 'Imported via Gemini Bill Scanner',
      lines: resolvedLines.filter((l) => Boolean(l.itemId)),
    });

    if (!purRes.ok) {
      showToast('error', purRes.error || 'Could not save scanned purchase');
      return;
    }

    showToast('success', 'Scanned bill saved as Purchase & stock added!');
    setHasExtracted(false);
    setPreviewUrl(null);
    setItems([]);
    setActiveTab('purchases');
  };

  const reviewTotals = items.reduce(
    (acc, r) => {
      const sub = round2(r.qty * r.rate);
      const gst = round2((sub * r.gstRate) / 100);
      acc.sub += sub;
      acc.gst += gst;
      acc.grand = Math.round(acc.sub + acc.gst);
      return acc;
    },
    { sub: 0, gst: 0, grand: 0 }
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{t.scan.title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t.scan.subtitle}</p>
      </div>

      {/* Upload Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-5">
        <label className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors">
          <Camera className="w-5 h-5" />
          <span>{t.scan.uploadBtn}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Upload className="w-4 h-4 text-slate-400" />
          <span>
            Supports printed GST purchase invoices or handwritten slips (JPG, PNG, WEBP). Nothing is
            saved until you review and confirm.
          </span>
        </div>
      </div>

      {scanning && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center gap-3 text-sm font-medium text-emerald-800">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{t.scan.scanning}</span>
        </div>
      )}

      {scanError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <div>
            <div className="font-semibold">Bill Scan Failed</div>
            <div className="text-xs mt-0.5">{scanError}</div>
          </div>
        </div>
      )}

      {/* Editable Review Screen */}
      {hasExtracted && (
        <form onSubmit={handleConfirmSave} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{t.scan.lowConfBanner}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {previewUrl && (
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-semibold text-slate-600 mb-2">Uploaded Bill Photo</div>
                <img
                  src={previewUrl}
                  alt="Scanned bill preview"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[420px] object-contain rounded-lg border border-slate-100"
                />
              </div>
            )}

            <div
              className={`bg-white border border-slate-200 rounded-xl p-4 space-y-4 ${
                previewUrl ? 'lg:col-span-2' : 'lg:col-span-3'
              }`}
            >
              <h2 className="text-base font-bold text-slate-900">{t.scan.reviewTitle}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Supplier (Detected: {extractedSupplierName || 'Unknown'})
                  </label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg bg-white ${
                      isLowConf('supplier')
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-300'
                    }`}
                  >
                    <option value="">
                      + Create New: {extractedSupplierName || 'Scanned Supplier'}
                    </option>
                    {db.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bill / Invoice No
                  </label>
                  <input
                    type="text"
                    required
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg font-mono-num ${
                      isLowConf('billNumber')
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Bill Date
                  </label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg font-mono-num ${
                      isLowConf('billDate')
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
              </div>

              {/* Editable Extracted Items */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-2 text-left">Extracted Name & Map to Master</th>
                      <th className="py-2 px-2 text-left">Batch / Exp</th>
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2 text-right">Rate (₹)</th>
                      <th className="py-2 px-2 text-right">GST%</th>
                      <th className="py-2 px-2 text-right">Total</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((row, idx) => {
                      const lowRow =
                        row.confidence === 'low' || isLowConf(`item[${idx}]`);
                      const lineTotal = round2(row.qty * row.rate * (1 + row.gstRate / 100));
                      return (
                        <tr key={row.key} className={lowRow ? 'bg-amber-50/70' : ''}>
                          <td className="p-2 min-w-[200px] space-y-1">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, name: e.target.value } : x
                                  )
                                )
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-medium"
                            />
                            <select
                              value={row.matchedItemId}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key
                                      ? { ...x, matchedItemId: e.target.value }
                                      : x
                                  )
                                )
                              }
                              className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-[11px]"
                            >
                              <option value="">+ Auto-create new item in Maal Master</option>
                              {db.items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  Match: {it.name} ({it.code})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 min-w-[130px] space-y-1">
                            <input
                              type="text"
                              value={row.batchNumber}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, batchNumber: e.target.value } : x
                                  )
                                )
                              }
                              placeholder="Batch"
                              className="w-full px-2 py-1 border border-slate-300 rounded font-mono-num bg-white"
                            />
                            <input
                              type="date"
                              value={row.expiryDate}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key ? { ...x, expiryDate: e.target.value } : x
                                  )
                                )
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded font-mono-num bg-white"
                            />
                          </td>
                          <td className="p-2 w-20">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={row.qty}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key
                                      ? { ...x, qty: Number(e.target.value) || 0 }
                                      : x
                                  )
                                )
                              }
                              className="w-full px-2 py-1 text-right border border-slate-300 rounded font-mono-num bg-white"
                            />
                          </td>
                          <td className="p-2 w-24">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={row.rate}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key
                                      ? { ...x, rate: Number(e.target.value) || 0 }
                                      : x
                                  )
                                )
                              }
                              className="w-full px-2 py-1 text-right border border-slate-300 rounded font-mono-num bg-white"
                            />
                          </td>
                          <td className="p-2 w-20">
                            <select
                              value={row.gstRate}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.key === row.key
                                      ? { ...x, gstRate: Number(e.target.value) as GstRate }
                                      : x
                                  )
                                )
                              }
                              className="w-full px-1 py-1 border border-slate-300 rounded bg-white font-mono-num"
                            >
                              {[0, 5, 12, 18].map((g) => (
                                <option key={g} value={g}>
                                  {g}%
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-right font-mono-num font-semibold whitespace-nowrap">
                            {formatINR(lineTotal)}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setItems((prev) => prev.filter((x) => x.key !== row.key))
                              }
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      {
                        key: `sc_${Date.now()}`,
                        matchedItemId: '',
                        name: '',
                        batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
                        expiryDate: '',
                        hsnCode: '',
                        qty: 1,
                        unit: 'packet',
                        rate: 0,
                        sellingPrice: 0,
                        gstRate: 5,
                        godownId: db.godowns[0]?.id || 'gd_main',
                        confidence: 'high',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>

                <div className="text-right font-mono-num">
                  <div className="text-xs text-slate-500">
                    Sub: {formatINR(reviewTotals.sub)} · GST: {formatINR(reviewTotals.gst)}
                  </div>
                  <div className="text-base font-bold text-slate-900">
                    Total: {formatINR(reviewTotals.grand)}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setHasExtracted(false);
                    setPreviewUrl(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t.scan.confirmSave}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
