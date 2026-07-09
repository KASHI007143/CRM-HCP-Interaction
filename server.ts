import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { runAgentStateGraph } from "./server/agent";
import { initDb, getAllInteractions } from "./server/db";

// Load environment variables
dotenv.config();

async function startServer() {
  // Initialize MySQL database
  try {
    await initDb();
  } catch (err: any) {
    console.error("[MySQL Database] Failed to initialize database on server start:", err.message);
  }

  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // 1. API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "AI-First CRM HCP API" });
  });

  // 2. API: Process conversational command via LangGraph agent
  app.post("/api/agent/chat", async (req, res) => {
    const { formState, messages, text } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing required string parameter: text" });
      return;
    }

    try {
      const resultState = await runAgentStateGraph(formState || {}, messages || [], text);
      res.json({
        formState: resultState.formState,
        messages: resultState.messages,
        error: resultState.error || null
      });
    } catch (err: any) {
      console.error("Express Chat Route Error:", err);
      res.status(500).json({ error: "Agent run failed: " + err.message });
    }
  });

  // 3. API: Simulate Voice Note transcript generation
  app.post("/api/agent/voice-note", (req, res) => {
    const sampleVoiceNote = "Today I completed a consultation with Dr. Alice Sharma at the Oncology clinic. We thoroughly evaluated the OncoBoost Clinical Trial Phase III brochure. Dr. Sharma was highly receptive, demonstrating a positive sentiment. I distributed 2 starter kits of OncoBoost 50mg and scheduled a lunch presentation next Tuesday.";
    res.json({ transcript: sampleVoiceNote });
  });

  // 3b. API: Fetch all interactions from MySQL database
  app.get("/api/agent/interactions", async (req, res) => {
    try {
      const records = await getAllInteractions();
      res.json(records);
    } catch (err: any) {
      console.error("Express Fetch Interactions Error:", err);
      res.status(500).json({ error: "Failed to fetch interactions: " + err.message });
    }
  });

  // 4. Vite middleware for development vs static build files for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Express Server] Running at http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
