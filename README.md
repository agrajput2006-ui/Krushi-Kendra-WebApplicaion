# Khushi Kendra Business Manager

A complete, offline-first retail management application built for **Khushi Kendra / Biyane** shops (seeds, fertilizers, pesticides, drip/general agri-inputs) in India. Available in **English**, **Hindi (हिन्दी)**, and **Marathi (मराठी)**.

---

## Setup & Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Environment variables (optional for AI Bill Scan):**
   Copy `.env.example` to `.env` and set `GEMINI_API_KEY` if you want to use the **Scan Bill (Gemini AI)** feature. All other billing, stock, ledger, and reporting features work completely offline in the browser.
3. **Start the development server (runs on port 3000):**
   ```bash
   npm run dev
   ```
4. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

---

## Simple Shop-Owner User Guide

### 1. Switch Language (`EN | हिं | मर`)
Use the language toggle at the top-right header anytime to switch between **English**, **हिन्दी**, and **मराठी**.

### 2. Making a Fast Sale Bill (Under 30 Seconds)
- Press **`N`** on your keyboard (or tap **New Bill**).
- Tap a **Recent Customer** chip at the top (or keep **Cash Customer**).
- Search or tap items to add them. Batch and GST% are picked automatically.
- Choose payment mode: **Cash**, **UPI**, **Card**, **Bank**, **Credit (Udhaar)**, or **Part Payment**.
- Click **Save Bill & Open Invoice** — you can immediately **Print** (A4 GST, 80mm, or 58mm thermal), **Download PDF**, or **Share on WhatsApp**.
- *Note:* Expired batches are automatically blocked unless the **Owner** checks the override box.

### 3. Receiving Udhaar Payments & Printing Receipts
- Open **Payments** → **Receive Payment (Customer)**.
- Select the customer, enter amount & mode (Cash / UPI / Bank / Ref No), and click **Auto-Match** to settle oldest unpaid bills automatically (or leave **On Account**).
- Saving generates a numbered receipt (`RCPT/2026-27/0001`) and updates bill statuses (`Unpaid` → `Partly paid` → `Paid`).

### 4. Cancelling a Bill Safely
- Open any bill (from Dashboard or **Find & Extract**) as **Owner** and click **Cancel Bill**.
- The sequential bill number is preserved (never reused), marked `CANCELLED`, stock is automatically restored to the original batch, and the customer's udhaar balance updates immediately.

### 5. Stock, Expiry & Godowns
- Check **Stock & Expiry** to see items below minimum stock and batches expiring within **60 days**.
- Use **Manual Stock Adjustment** to log damage, expiry write-offs, returns, or count corrections.

### 6. Find Records & Extract Customer Statements
- Press **`F`** (or open **Find & Extract**) to search across bill numbers, receipt numbers, customer names, mobile numbers, GSTINs, or item names.
- Click **Extract / View** on any row to print, download PDF, or share on WhatsApp.
- Use the **Extract Combined Statement** bar to export all bills + payments + closing balance for any customer or date range as **PDF** or **Excel/CSV**.

### 7. Scan a Supplier or Handwritten Bill (Gemini AI)
- Open **Scan Bill (AI)**, upload or click a photo of a supplier bill.
- Review the extracted items (uncertain fields are highlighted in amber), match to existing items or create new ones, and click **Confirm & Save as Purchase** to add stock.

### 8. Backup, Restore & Sample Data
- Open **Settings** to update your Shop Name, GSTIN, Seed/Fertilizer/Pesticide licenses, switch between **Owner** and **Staff** roles, enable a **PIN Lock**, download a **Full JSON Backup**, restore from backup, or click **Clear Sample Data** when you are ready for live shop use.
