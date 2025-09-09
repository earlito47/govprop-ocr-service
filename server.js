// server.js — GovProp OCR microservice (CommonJS)
// Endpoints:
//  • POST /parse       { file_url } JSON — for Supabase Edge Function
//  • POST /api/ocr     multipart file  — for browser/manual testing
//
// Security: optional x-api-key via OCR_API_KEY
// PDF text: pdf-parse internal entry (avoids package root quirks)
// Image OCR: tesseract.js (keep images small for MVP)

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch");           // v2 CommonJS
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse/lib/pdf-parse.js"); // internal entry

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 8080;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ---------- Middleware ----------
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      // TODO: replace with your real domain(s)
      "https://your-frontend.example.com"
    ],
    methods: ["POST", "GET", "OPTIONS"],
  })
);

// Multer (declare ONCE)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Optional API key guard
function verifyKey(req, res, next) {
  const cfgKey = process.env.OCR_API_KEY;
  if (!cfgKey) return next(); // not enabled
  const key = req.headers["x-api-key"];
  if (key !== cfgKey) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ---------- Health ----------
app.get(["/", "/healthz"], (_req, res) => {
  res.json({
    ok: true,
    service: "GovProp OCR",
    endpoints: {
      parseUrl: "POST /parse",
      ocrUpload: "POST /api/ocr",
      health: "GET /healthz",
    },
  });
});

// ---------- Endpoint: parse by URL (for Edge Function) ----------
app.post("/parse", verifyKey, async (req, res) => {
  try {
    const { file_url } = req.body || {};
    if (!file_url) return res.status(400).json({ error: "Missing file_url" });

    const r = await fetch(file_url);
    if (!r.ok) {
      return res.status(502).json({ error: `Failed to fetch PDF (${r.status})` });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buf);
    const text = (data?.text || "").trim();

    return res.json({ extracted_text: text });
  } catch (e) {
    console.error("parse-url error:", e);
    return res.status(500).json({ error: "Failed to parse document" });
  }
});

// ---------- Endpoint: multipart upload (manual/browser testing) ----------
app.post("/api/ocr", verifyKey, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { mimetype, buffer } = req.file;
    let text = "";

    if (mimetype === "application/pdf") {
      const data = await pdfParse(buffer);
      text = (data?.text || "").trim();
    } else if (mimetype.startsWith("image/")) {
      const result = await Tesseract.recognize(buffer, "eng");
      text = (result?.data?.text || "").trim();
    } else {
      return res.status(400).json({
        error: "Unsupported file type. Upload a PDF or image.",
      });
    }

    return res.json({ success: true, text, fileType: mimetype });
  } catch (error) {
    console.error("OCR upload error:", error);
    return res.status(500).json({ error: "Failed to process file", message: error.message });
  }
});

// Multer error handler
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File too large (max 10MB)" });
  }
  return res.status(500).json({ error: "Unexpected error" });
});

app.listen(PORT, () => {
  console.log(`OCR Service listening on http://0.0.0.0:${PORT}`);
});
