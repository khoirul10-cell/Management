import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
- category: a short category string (e.g., "Food", "Transport", "Salary", "Utilities", "Entertainment", "Other").
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
