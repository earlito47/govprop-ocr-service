// Minimal OCR service using pdf-parse
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Restrict CORS to your app domain(s)
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://your-frontend.example.com"
    ],
    methods: ["POST", "GET", "OPTIONS"],
  })
);

// Optional: simple health check
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// Optional: basic API key guard (set OCR_API_KEY in Render env)
function verifyKey(req, res, next) {
  const cfgKey = process.env.OCR_API_KEY;
  if (!cfgKey) return next(); // key not enabled
  const key = req.headers["x-api-key"];
  if (key !== cfgKey) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.post("/parse", verifyKey, async (req, res) => {
  try {
    const { file_url } = req.body;
    if (!file_url) return res.status(400).json({ error: "Missing file_url" });

    // Download PDF from signed URL
    const r = await fetch(file_url);
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: `Failed to fetch PDF (${r.status})` });
    }
    const buf = Buffer.from(await r.arrayBuffer());

    // Extract text
    const data = await pdfParse(buf);
    const text = (data?.text || "").trim();

    res.json({ extracted_text: text });
  } catch (e) {
    console.error("OCR parse error:", e);
    res.status(500).json({ error: "Failed to parse document" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`OCR service listening on http://0.0.0.0:${port}`);
});
