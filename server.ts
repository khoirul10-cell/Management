import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (Requires GOOGLE_APPLICATION_CREDENTIALS)
try {
  if (!admin.apps.length) {
    admin.initializeApp();
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
      if (!admin.apps.length) {
         console.warn("[Cron] Firebase Admin belum diinisialisasi. Melewati pengecekan.");
         return;
      }
      
      const db = admin.firestore();
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
          .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(today))
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
    scheduled: true,
    timezone: "Asia/Jakarta" // Zona waktu WIB
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
