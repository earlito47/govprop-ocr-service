// server.js — GovProp OCR microservice (CommonJS)
// Endpoints:
//  • POST /parse       { file_url } JSON — for Supabase Edge Function
//  • POST /api/ocr     multipart file  — for browser/manual testing
//
// Notes:
//  • We import pdf-parse's internal function directly to avoid its root init quirk.
//  • Optional API key via x-api-key (set OCR_API_KEY env).
//  • Tesseract for image OCR (optional; keep images small).

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch"); // v2 (CommonJS)
const Tesseract = require("tesseract.js");

// Import the *internal* entry to avoid top-level file access in package root
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

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

// Multer for multipart file uploads
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

// ---------- pdf-parse lazy loader with shim ----------
let pdfParse;
function getPdfParse() {
  if (!pdfParse) {
    try {
      // Create dummy test file to satisfy pdf-parse's init path (prevents ENOENT)
      const testDir = path.join(__dirname, "test", "data");
      const testFile = path.join(testDir, "05-versions-space.pdf");
      try {
        fs.accessSync(testFile);
      } catch (_) {
        fs.mkdirSync(testDir, { recursive: true });
        const minimalPDF = Buffer.from([
          0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, // %PDF-1.4
          0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, 0x0A,
          0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A,
          0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F,
          0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F,
          0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20,
          0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x65, 0x6E,
          0x64, 0x6F, 0x62, 0x6A, 0x0A, 0x32, 0x20, 0x30,
          0x20, 0x6F, 0x62, 0x6A, 0x0A, 0x3C, 0x3C, 0x2F,
          0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67,
          0x65, 0x73, 0x2F, 0x43, 0x6F, 0x75, 0x6E, 0x74,
          0x20, 0x30, 0x2F, 0x4B, 0x69, 0x64, 0x73, 0x5B,
          0x5D, 0x3E, 0x3E, 0x0A, 0x65, 0x6E, 0x64, 0x6F,
          0x62, 0x6A, 0x0A, 0x78, 0x72, 0x65, 0x66, 0x0A,
          0x30, 0x20, 0x33, 0x0A, 0x30, 0x30, 0x30, 0x30,
          0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36,
          0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x20, 0x0A,
          0x74, 0x72, 0x61, 0x69, 0x6C, 0x65, 0x72, 0x0A,
          0x3C, 0x3C, 0x2F, 0x53, 0x69, 0x7A, 0x65, 0x20,
          0x33, 0x2F, 0x52, 0x6F, 0x6F, 0x74, 0x20, 0x31,
          0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x73,
          0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66,
          0x0A, 0x31, 0x31, 0x36, 0x0A, 0x25, 0x25, 0x45,
          0x4F, 0x46
        ]);
        fs.writeFileSync(testFile, minimalPDF);
      }
      // Now require pdf-parse safely
      pdfParse = require("pdf-parse"); // using version pinned in package.json
    } catch (e) {
      console.error("Failed to init pdf-parse:", e);
      throw e;
    }
  }
  return pdfParse;
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

// ---------- Endpoint: parse by URL (for Edge) ----------
app.post("/parse", verifyKey, async (req, res) => {
  try {
    const { file_url } = req.body || {};
    if (!file_url) return res.status(400).json({ error: "Missing file_url" });

    const r = await fetch(file_url);
    if (!r.ok) {
      return res.status(502).json({ error: `Failed to fetch PDF (${r.status})` });
    }
    const buf = Buffer.from(await r.arrayBuffer());

    const parser = getPdfParse();
    const data = await parser(buf);
    const text = (data?.text || "").trim();

    return res.json({ extracted_text: text });
  } catch (e) {
    console.error("parse-url error:", e);
    return res.status(500).json({ error: "Failed to parse document" });
  }
});

// ---------- Endpoint: multipart upload (for manual testing / browser) ----------
app.post("/api/ocr", verifyKey, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { mimetype, buffer } = req.file;
    let text = "";

    if (mimetype === "application/pdf") {
      const parser = getPdfParse();
      const data = await parser(buffer);
      text = (data?.text || "").trim();
    } else if (mimetype.startsWith("image/")) {
      // OCR for images — can be CPU heavy; keep small images for MVP
      const result = await Tesseract.recognize(buffer, "eng", {
        // logger: (m) => console.log(m) // uncomment to debug progress
      });
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

  console.log(`OCR service listening on http://0.0.0.0:${port}`);
});
