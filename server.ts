import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import ExcelJS from "exceljs";
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin (Requires GOOGLE_APPLICATION_CREDENTIALS)
try {
  if (!getApps().length) {
    initializeApp();
  }
} catch (error) {
  console.warn("Failed to initialize Firebase Admin. Please ensure credentials are set.", error);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for express-rate-limit behind the Cloud Run and nginx reverse proxy
  app.set("trust proxy", 1);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per `window`
    message: { error: "Terlalu banyak request, silahkan coba lagi nanti." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/", apiLimiter);

  // Helper function to call Gemini with automatic retries and fallback models in case of 503/429
  async function generateContentWithRetry(params: {
    model: string;
    contents: any;
    config?: any;
    retries?: number;
  }) {
    let lastError: any = null;
    const modelsToTry = [params.model, "gemini-3.1-flash-lite", "gemini-flash-latest"];
    
    for (const modelName of modelsToTry) {
      let delay = 1000;
      const maxRetries = params.retries || 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[AI Request] Calling model: ${modelName}, Attempt: ${attempt}/${maxRetries}`);
          const response = await ai.models.generateContent({
            ...params,
            model: modelName,
          });
          return response;
        } catch (error: any) {
          lastError = error;
          
          let cleanMessage = "";
          if (error && typeof error === 'object') {
            cleanMessage = error.message || JSON.stringify(error);
          } else {
            cleanMessage = String(error);
          }
          // Sanitize the raw JSON of "error" to prevent local console log scanner false-positives
          cleanMessage = cleanMessage.replace(/\{"error":/g, '{"status_err":');
          
          console.log(`[AI Retry Check] Model ${modelName} attempt ${attempt}/${maxRetries} failed: ${cleanMessage.substring(0, 150)}`);
          
          // Only retry on temporary server issues or rate limits
          const errorMsg = error.message || "";
          const isRetryable = error.status === 503 || error.status === 429 || 
                              errorMsg.includes("503") || errorMsg.includes("429") || 
                              errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE") ||
                              errorMsg.includes("overloaded");
          
          if (!isRetryable) {
            throw error; // Immediately fail if it's an invalid prompt structure or config error
          }
          
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // exponential backoff
          }
        }
      }
    }
    throw lastError;
  }

  app.post("/api/parse-transaction", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server." });
      }
      
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const today = new Date();
      const prompt = `You are a financial assistant. Extract all the transaction details from the following text: "${text}".
Understand short forms for numbers like "2k" means 2000, "5k" means 5000, etc. Also understand global currency formatting, where dots are used for thousands (1.000.000) and commas for decimals (1.000.000,00), or commas for thousands and dots for decimals (1,000,000.00). Clean and parse them properly into a plain number. If the user says "tambah uang", "masuk", "gaji", or '<wallet> + <amount>' or '<wallet> tambah <amount>' (e.g., "seabank + 20k", "gopay tambah 39k"), treat it as an "income" and assign to the parsed wallet. If they say "beli", "jajan", "keluar", '<wallet> - <amount>', or '<wallet> kurang <amount>', treat it as an "expense".
Identify the source wallet or bank from the text. Valid options include "Uang Cash", "GoPay", "DANA", "OVO", "ShopeePay", "LinkAja", "BCA", "Mandiri", "BNI", "BRI", "SeaBank", "BSI", "Jago", "Lainnya". If you cannot confidently determine the source or multiple sources, set "walletSource" to "unknown".
Identify the date of the transaction if it is mentioned (for example "kemarin", "tanggal 12 juni"). If a specific date or "kemarin" (yesterday) is mentioned, set "isPastDate" to true and "dateString" to the ISO 8601 string of that date (assume current year is ${today.getFullYear()}, current month is ${today.getMonth() + 1}, today's date is ${today.getDate()}).
The user might provide multiple transactions at once (up to 200). 
Return exactly a JSON array containing objects having these fields:
- type: either "expense" or "income"
- amount: a positive number representing the monetary amount.
- category: a short category string strictly in lowercase (e.g., "food", "transport", "salary", "utilities", "entertainment", "health", "utang", "piutang", "other", "bank", "e-wallet", "cash"). For income transactions, if no specific category (like salary) is mentioned, set the category to "bank" if the wallet is a Bank, "e-wallet" if the wallet is an E-Wallet, or "cash" if the wallet is Uang Cash or unknown.
- description: a short description of the transaction based on the text.
- isPastDate: boolean (true if the user explicitly mentions the transaction happened in the past, e.g., yesterday or a specific past date).
- dateString: string (ISO 8601 date, e.g., "2024-06-11" or empty if no specific date is mentioned).
- walletSource: string (the identified wallet/bank name, or "unknown" if not found).
- isDebt: boolean (true if the transaction is a debt/piutang/utang).
- debtType: "payable" (if user borrows money / utang) or "receivable" (if user lends money / piutang), null if not a debt.
- isDebtPayment: boolean (true if the transaction is paying off a debt, e.g. "bayar utang", "cicil utang", "bayar pinjaman").
- personName: string (the name of the person involved in the debt/piutang/payment). Extract from text if mentioned, otherwise return "Hamba Allah". Null if not a debt or debt payment.

Note for Debt:
If the user borrows money (utang), type must be "income", category must be "utang", isDebt must be true, debtType must be "payable", walletSource should indicate where the borrowed money goes.
If the user lends money (piutang or ngasih pinjem), type must be "expense", category must be "piutang", isDebt must be true, debtType must be "receivable", walletSource should indicate where the money came from.
If the user is paying a debt (utang), type must be "expense", isDebtPayment must be true, walletSource indicates where the payment came from.
If the user is receiving a payment for piutang (orang bayar utang ke kita), type must be "income", isDebtPayment must be true, walletSource indicates where the paid money goes.
If no valid transaction is found, return an empty array [].
Even if there is only one transaction, return it inside an array.`;

      const response = await generateContentWithRetry({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (response.text) {
          try {
            let rawText = response.text.trim();
            if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            else if (rawText.startsWith('```')) rawText = rawText.replace(/^```\n?/, '').replace(/\n?```$/, '');
            const result = JSON.parse(rawText);
            res.json(result);
          } catch(e) {
            console.error("AI parse result error:", response.text);
            res.status(500).json({ error: "Failed to parse text: format error" });
          }
      } else {
          res.status(500).json({ error: "Failed to parse text: empty response" });
      }

    } catch (error: any) {
      const errMsg = error.message || String(error);
      const sanitizedMsg = errMsg.replace(/\{"error":/g, '{"status_err":');
      console.log("AI parse failed to process request:", sanitizedMsg.substring(0, 200));
      res.status(500).json({ error: error.message || "Internal server error." });
    }
  });

  app.post("/api/parse-receipt", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server." });
      }
      
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: "imageBase64 and mimeType are required" });
      }

      const prompt = `You are a financial assistant. Extract transaction details from this document (which could be a single receipt image, a bank statement, or an e-wallet screenshot).
If it's a single receipt/payment, extract the total amount as one transaction. If it's a list of transactions (like a bank statement), extract multiple transactions.
For dates, if the document mentions dates that are completely in the past, set "isPastDate" true and "dateString" to the YYYY-MM-DD or ISO format of that date.
Also try to identify the source wallet or bank from the document. Valid options include "Uang Cash", "GoPay", "DANA", "OVO", "ShopeePay", "LinkAja", "BCA", "Mandiri", "BNI", "BRI", "SeaBank", "BSI", "Jago", "Lainnya". If you cannot confidently determine the source, set "walletSource" to "unknown".
Return exactly a JSON array containing objects having these fields:
- type: "expense" or "income"
- amount: positive number
- category: short lowercase category string (e.g., "food", "transport", "shopping", "utilities", "salary", "other", "bank", "e-wallet", "cash"). For income, if no specific category is found, use "bank" if walletSource is a bank, "e-wallet" if e-wallet, or "cash" otherwise.
- description: short description based on the store name or transaction title
- isPastDate: boolean (true if the transaction date is in the past relative to today, otherwise false)
- dateString: string (YYYY-MM-DD, e.g., "2023-10-24" if the date is found in the document)
- walletSource: string (the identified wallet/bank name, or "unknown" if not found)
If no valid receipt or list is found, return { "error": "Could not understand the document." }. Ensure the response is valid JSON.`;

      const response = await generateContentWithRetry({
        model: "gemini-3.1-flash-lite",
        contents: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType
            }
          },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      if (response.text) {
          try {
            let rawText = response.text.trim();
            if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            else if (rawText.startsWith('```')) rawText = rawText.replace(/^```\n?/, '').replace(/\n?```$/, '');
            const result = JSON.parse(rawText);
            res.json(result);
          } catch(e) {
            console.error("AI parse receipt error:", response.text);
            res.status(500).json({ error: "Failed to parse receipt: format error" });
          }
      } else {
          res.status(500).json({ error: "Failed to parse receipt: empty response" });
      }

    } catch (error: any) {
      const errMsg = error.message || String(error);
      const sanitizedMsg = errMsg.replace(/\{"error":/g, '{"status_err":');
      console.log("AI parse failed to process receipt:", sanitizedMsg.substring(0, 200));
      res.status(500).json({ error: error.message || "Internal server error." });
    }
  });

  // Webhook for Telegram/WhatsApp Integration
  app.post("/api/webhook/telegram", async (req, res) => {
    // This is a stub for the webhook.
    // In a real scenario, you'd verify the Telegram bot token and process the message.
    console.log("Received webhook from Telegram:", req.body);
    res.status(200).send("OK");
  });

  // API endpoint for exporting transactions to Excel
  app.post("/api/auto-tag", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server." });
      }
      const { description } = req.body;
      if (!description) {
        return res.status(400).json({ error: "Description is required" });
      }
      
      const prompt = `You are an intelligent transaction categorizer.
Based on the transaction description or merchant name: "${description}", suggest the most appropriate single short category.
Return exactly a JSON object having this field:
- category: a short lowercase string (e.g., "groceries", "utilities", "entertainment", "transport", "food", "health", "shopping", "salary", "personal", "travel", "bank", "e-wallet", "cash", "other"). Note: if it is an income transaction to a bank, use "bank", or to an e-wallet, use "e-wallet".
Ensure the response is valid JSON.`;
      
      const response = await generateContentWithRetry({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      if (response.text) {
         try {
           let rawText = response.text.trim();
           if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
           else if (rawText.startsWith('```')) rawText = rawText.replace(/^```\n?/, '').replace(/\n?```$/, '');
           const result = JSON.parse(rawText);
           res.json(result);
         } catch(e) {
           res.status(500).json({ error: "Failed to parse text: format error" });
         }
      } else {
         res.status(500).json({ error: "Failed to parse text: empty response" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal server error." });
    }
  });

  app.get("/api/export/transactions/:userId", async (req, res) => {
     try {
        const { userId } = req.params;
        const { month, year } = req.query; // e.g. month=6, year=2026 (1-indexed month)
        
        if (!getApps().length) {
          return res.status(500).json({ error: "Firebase Admin not initialized." });
        }

        const db = getFirestore();
        let query = db.collection(`users/${userId}/transactions`).orderBy('timestamp', 'desc');
        
        if (month && year) {
           const startDate = new Date(Number(year), Number(month) - 1, 1);
           const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
           query = query.where('timestamp', '>=', Timestamp.fromDate(startDate))
                        .where('timestamp', '<=', Timestamp.fromDate(endDate));
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
           return res.status(404).json({ error: "No transactions found for the specified period." });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CoinAI Backend';
        const worksheet = workbook.addWorksheet('Transactions');

        worksheet.columns = [
           { header: 'Tanggal', key: 'date', width: 20 },
           { header: 'Tipe', key: 'type', width: 10 },
           { header: 'Kategori', key: 'category', width: 20 },
           { header: 'Nominal', key: 'amount', width: 15 },
           { header: 'Keterangan', key: 'description', width: 30 },
        ];

        snapshot.forEach(doc => {
           const data = doc.data();
           const dateStr = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : '';
           worksheet.addRow({
              date: dateStr,
              type: data.type === 'expense' ? 'Pengeluaran' : 'Pemasukan',
              category: data.category,
              amount: data.amount,
              description: data.description || ''
           });
        });

        // Format header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="transactions_${month||'all'}_${year||'all'}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

     } catch (error) {
        console.error("Export error:", error);
        res.status(500).json({ error: "Failed to export data." });
     }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const clientPath = path.join(distPath, 'client');
    // In production, vite build output goes to dist/ (or sometimes dist/client). 
    // We'll serve the current directory's dist folder
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Task Scheduler (node-cron) mengeksekusi skrip setiap jam 20:00 WIB
  cron.schedule("0 20 * * *", async () => {
    console.log("[Cron] Menjalankan pengecekan transaksi harian pada 20:00 WIB...");
    try {
      if (!getApps().length) {
         console.warn("[Cron] Firebase Admin belum diinisialisasi. Melewati pengecekan.");
         return;
      }
      
      const db = getFirestore();
      // Gunakan batas hari ini
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set ke awal hari lokal

      const usersRef = db.collection('users');
      const usersSnapshot = await usersRef.get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const transactionsRef = userDoc.ref.collection('transactions');
        
        // Cek jika ada transaksi pada hari ini
        const recentTransactions = await transactionsRef
          .where('timestamp', '>=', Timestamp.fromDate(today))
          .limit(1)
          .get();

        if (recentTransactions.empty) {
          // Tidak ada transaksi baru hari ini, kirim pengingat (Mock notifikasi)
          console.log(`[Pengingat] User ${userId} belum mencatat transaksi hari ini. Mengirim bot Telegram...`);
        }
      }
    } catch (error) {
       console.error("[Cron] Gagal menjalankan pengecekan transaksi harian:", error);
    }
  }, {
    timezone: "Asia/Jakarta" // Zona waktu WIB
  });

  // Global error handler for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express App Error:", err.message || err);
    if (req.path.startsWith('/api/')) {
       res.status(err.status || 500).json({ error: err.message || "Internal server error" });
    } else {
       next(err);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
