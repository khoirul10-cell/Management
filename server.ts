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

  app.use(express.json());

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per `window`
    message: { error: "Terlalu banyak request, silahkan coba lagi nanti." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/", apiLimiter);

  app.post("/api/parse-transaction", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const prompt = `You are a financial assistant. Extract the transaction details from the following text: "${text}".
Return exactly a JSON object having these fields:
- type: either "expense" or "income"
- amount: a positive number representing the monetary amount.
- category: a short category string strictly in lowercase (e.g., "food", "transport", "salary", "utilities", "entertainment", "other").
- description: a short description of the transaction based on the text.
If no valid transaction is found, return { "error": "Could not understand the transaction." }.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (response.text) {
          const result = JSON.parse(response.text);
          res.json(result);
      } else {
          res.status(500).json({ error: "Failed to parse text" });
      }

    } catch (error) {
      console.error("AI parse error:", error);
      res.status(500).json({ error: "Internal server error." });
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
    app.get('*all', (req, res) => {
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
          
          // Contoh jika sudah ada token dan Chat ID:
          /*
          const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = userDoc.data().telegramChatId; 
          if (telegramBotToken && chatId) {
             const message = "Halo! Anda belum mencatat pengeluaran hari ini. Yuk catat sekarang!";
             await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`);
          }
          */
        }
      }
    } catch (error) {
       console.error("[Cron] Gagal menjalankan pengecekan transaksi harian:", error);
    }
  }, {
    timezone: "Asia/Jakarta" // Zona waktu WIB
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
