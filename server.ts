import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/scan-bill', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.',
        });
      }

      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: 'Missing imageBase64 or mimeType in request body.' });
      }

      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `You are an expert Indian agricultural retail (Khushi Kendra / Seeds, Fertilizers, Pesticides) invoice OCR extractor.
Extract the supplier purchase bill or handwritten bill from this image into strict JSON.
Rules:
- Convert any dates to YYYY-MM-DD format if possible (Indian bills use DD/MM/YYYY or DD-MM-YYYY).
- Normalize GST rates to one of 0, 5, 12, or 18 where clearly indicated (or 0 if missing/exempt).
- Normalize unit to one of: kg, g, packet, bag, litre, ml, piece, box.
- For any field that is blurry, handwritten, ambiguous, missing, or uncertain, populate lowConfidenceFields with descriptive field keys (e.g. "supplierName", "billDate", "billNumber", "item[0].qty", "item[1].rate", "grandTotal") and set item confidence to "low" or "medium" or "high".
- Never invent items that are not in the image.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              supplierName: { type: Type.STRING, description: 'Supplier / distributor business name' },
              supplierGstin: { type: Type.STRING, description: '15-char GSTIN if visible, else empty string' },
              supplierMobile: { type: Type.STRING, description: 'Supplier phone number if visible' },
              billNumber: { type: Type.STRING, description: 'Invoice / bill number' },
              billDate: { type: Type.STRING, description: 'Bill date in YYYY-MM-DD format' },
              subtotal: { type: Type.NUMBER, description: 'Taxable subtotal before GST' },
              gstTotal: { type: Type.NUMBER, description: 'Total GST amount' },
              grandTotal: { type: Type.NUMBER, description: 'Final invoice grand total in INR' },
              lowConfidenceFields: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of field paths that are blurry or uncertain',
              },
              notes: { type: Type.STRING, description: 'Any extraction warnings or notes' },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Product / item name' },
                    batchNumber: { type: Type.STRING, description: 'Batch or lot number if visible' },
                    expiryDate: { type: Type.STRING, description: 'Expiry date in YYYY-MM-DD if visible' },
                    hsnCode: { type: Type.STRING, description: 'HSN code if visible' },
                    qty: { type: Type.NUMBER, description: 'Quantity' },
                    unit: { type: Type.STRING, description: 'Unit: kg, g, packet, bag, litre, ml, piece, or box' },
                    rate: { type: Type.NUMBER, description: 'Unit purchase rate before or per bill' },
                    gstRate: { type: Type.NUMBER, description: 'GST percentage: 0, 5, 12, or 18' },
                    amount: { type: Type.NUMBER, description: 'Line total amount' },
                    confidence: { type: Type.STRING, description: 'high, medium, or low' },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({ success: true, data: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to scan bill';
      console.error('Scan bill error:', err);
      res.status(500).json({ error: message });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Khushi Kendra Business Manager running on http://localhost:${PORT}`);
  });
}

startServer();
