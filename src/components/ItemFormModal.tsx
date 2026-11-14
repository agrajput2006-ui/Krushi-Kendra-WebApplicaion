import React, { useEffect, useState } from 'react';
import { Camera, ImagePlus, PackagePlus, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GstRate, Item, ItemCategory, ItemUnit } from '../types/models';

async function compressImageToDataUrl(file: File, maxDim = 640): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

const CATEGORIES: ItemCategory[] = ['Seeds', 'Fertilizer', 'Pesticide', 'General', 'Other'];
const UNITS: ItemUnit[] = ['packet', 'bag', 'kg', 'g', 'litre', 'ml', 'piece', 'box'];
const GST_RATES: GstRate[] = [0, 5, 12, 18];

interface ItemFormModalProps {
  open: boolean;
  onClose: () => void;
  editingItem?: Item | null;
  defaultOpeningQty?: string;
  onSaved?: (item: Item, batchId?: string) => void;
}

export function ItemFormModal({
  open,
  onClose,
  editingItem,
  defaultOpeningQty = '10',
  onSaved,
}: ItemFormModalProps) {
  const { db, saveItem, isOwner, showToast, t } = useApp();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('Seeds');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [gstRate, setGstRate] = useState<GstRate>(db.settings.defaultGstRate || 5);
  const [unit, setUnit] = useState<ItemUnit>('packet');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('10');
  const [defaultGodownId, setDefaultGodownId] = useState(db.godowns[0]?.id || 'gd_main');
  const [rackLocation, setRackLocation] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');

  const [batchNumber, setBatchNumber] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [openingQty, setOpeningQty] = useState(defaultOpeningQty);
  const [error, setError] = useState('');
  const [zoomPhoto, setZoomPhoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setZoomPhoto(false);
    if (editingItem) {
      setName(editingItem.name);
      setCategory(editingItem.category);
      setBrand(editingItem.brand);
      setBarcode(editingItem.barcode || '');
      setHsnCode(editingItem.hsnCode);
      setGstRate(editingItem.gstRate);
      setUnit(editingItem.unit);
      setPurchasePrice(String(editingItem.purchasePrice));
      setSellingPrice(String(editingItem.sellingPrice));
      setMrp(String(editingItem.mrp));
      setMinStockLevel(String(editingItem.minStockLevel));
      setDefaultGodownId(editingItem.defaultGodownId);
      setRackLocation(editingItem.rackLocation || '');
      setPhotoDataUrl(editingItem.photoDataUrl || '');
    } else {
      setName('');
      setCategory('Seeds');
      setBrand('');
      setBarcode('');
      setHsnCode('');
      setGstRate(db.settings.defaultGstRate || 5);
      setUnit('packet');
      setPurchasePrice('0');
      setSellingPrice('');
      setMrp('');
      setMinStockLevel('10');
      setDefaultGodownId(db.godowns[0]?.id || 'gd_main');
      setRackLocation('');
      setPhotoDataUrl('');
      setBatchNumber(`BAT-${Date.now().toString().slice(-4)}`);
      setLotNumber('');
      setMfgDate('');
      setExpiryDate('');
      setOpeningQty(defaultOpeningQty);
    }
  }, [open, editingItem, db.settings.defaultGstRate, db.godowns, defaultOpeningQty]);

  if (!open) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoDataUrl(compressed);
    } catch {
      setError('Could not load selected image.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');

    const sellNum = Number(sellingPrice) || 0;
    if (sellNum <= 0) {
      setError('Enter unit selling price greater than 0.');
      return;
    }

    const res = saveItem(
      {
        id: editingItem?.id,
        code: editingItem?.code,
        name,
        category,
        brand,
        barcode,
        hsnCode,
        gstRate,
        unit,
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: sellNum,
        mrp: Number(mrp) || sellNum,
        minStockLevel: Number(minStockLevel) || 0,
        defaultGodownId,
        rackLocation,
        photoDataUrl,
      },
      !editingItem
        ? {
            batchNumber: batchNumber || 'OPENING',
            lotOrLicenseNumber: lotNumber,
            mfgDate,
            expiryDate,
            godownId: defaultGodownId,
            quantity: Number(openingQty) || 0,
          }
        : undefined
    );

    if (!res.ok || !res.item) {
      setError(res.error || 'Could not save item.');
      return;
    }

    showToast('success', `${editingItem ? 'Updated' : 'Added'} ${res.item.name}`);
    onSaved?.(res.item, res.batchId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 bg-[#F3F4F6] border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#15803D] text-white flex items-center justify-center">
              <PackagePlus className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-extrabold text-[#15803D]">
              {editingItem ? `${t.common.edit}: ${editingItem.name}` : t.items.addItem}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-white hover:text-slate-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-base">
          {/* Item Image Picker (Camera + File Upload + Preview + Remove) */}
          <div className="bg-[#F3F4F6] border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              type="button"
              onClick={() => photoDataUrl && setZoomPhoto(true)}
              className={`w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden bg-white ${
                photoDataUrl
                  ? 'border-[#15803D] cursor-zoom-in'
                  : 'border-slate-300 text-slate-400 cursor-default'
              }`}
            >
              {photoDataUrl ? (
                <img
                  src={photoDataUrl}
                  alt={name || t.items.itemPhoto}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImagePlus className="w-8 h-8" />
              )}
            </button>

            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <div className="text-sm font-bold text-slate-900">{t.items.itemPhoto}</div>
                <div className="text-xs text-slate-600">{t.items.addPhotoHint}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-emerald-800 inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
                  <Upload className="w-4 h-4" />
                  <span>{t.items.uploadPhoto}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>

                <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FACC15] text-slate-900 text-sm font-bold hover:brightness-95 inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
                  <Camera className="w-4 h-4 text-[#15803D]" />
                  <span>{t.items.takePhoto}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>

                {photoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl('')}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t.items.removePhoto}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.itemName} *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="उदा. Mahyco Soybean JS-335 (30kg)"
                className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.category}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ItemCategory)}
                className="w-full min-h-[52px] px-3 py-2.5 text-base border border-slate-300 rounded-xl bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.unit}
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ItemUnit)}
                className="w-full min-h-[52px] px-3 py-2.5 text-base border border-slate-300 rounded-xl bg-white"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.sellingPrice} / {unit} (₹) *
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                disabled={!isOwner && Boolean(editingItem)}
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="850"
                className="w-full min-h-[52px] px-3.5 py-2.5 text-base border border-slate-300 rounded-xl font-mono-num disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.gst}
              </label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value) as GstRate)}
                className="w-full min-h-[52px] px-3 py-2.5 text-base border border-slate-300 rounded-xl bg-white font-mono-num"
              >
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}% GST
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.brand}
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Mahyco / Bayer / IFFCO"
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.mrp} (₹)
              </label>
              <input
                type="number"
                step="any"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num"
              />
            </div>

            {isOwner && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t.items.purchasePrice} (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.hsn}
              </label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Barcode (optional)
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.minStock}
              </label>
              <input
                type="number"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl font-mono-num"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.godown}
              </label>
              <select
                value={defaultGodownId}
                onChange={(e) => setDefaultGodownId(e.target.value)}
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl bg-white"
              >
                {db.godowns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t.items.rack}
              </label>
              <input
                type="text"
                value={rackLocation}
                onChange={(e) => setRackLocation(e.target.value)}
                className="w-full min-h-[48px] px-3 py-2 text-base border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {!editingItem && (
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Opening Batch & Stock
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Batch Number</label>
                  <input
                    type="text"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">License / Lot No</label>
                  <input
                    type="text"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Opening Qty ({unit})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={openingQty}
                    onChange={(e) => setOpeningQty(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Mfg Date</label>
                  <input
                    type="date"
                    value={mfgDate}
                    onChange={(e) => setMfgDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-[#F3F4F6]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[52px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="min-h-[52px] px-6 py-2.5 rounded-xl bg-[#15803D] text-white text-base font-bold hover:bg-emerald-800 shadow-xs cursor-pointer"
          >
            {t.common.save}
          </button>
        </div>
      </form>

      {zoomPhoto && photoDataUrl && (
        <div
          onClick={() => setZoomPhoto(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 cursor-zoom-out"
        >
          <div className="relative max-w-lg w-full bg-white rounded-2xl p-3 shadow-2xl">
            <button
              type="button"
              onClick={() => setZoomPhoto(false)}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-slate-800 shadow cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={photoDataUrl}
              alt={name || t.items.itemPhoto}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
