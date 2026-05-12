import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { analyzeSection } from "./analyzeSection.js";

dotenv.config();

const app = express();
const upload = multer({ dest: "tmp/" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const demoPdfPath =
  process.env.DEMO_PDF_PATH ||
  "/Users/jakezam/Library/Application Support/Cursor/User/workspaceStorage/8c16ed27d11b4990be21b6923ecd2dfc/pdfs/97da1841-fd8b-40b4-af7a-fe90c2cf4ebd/NEJMoa1409077.pdf";

app.use(cors());
app.use(express.json());

app.post("/api/analyze", upload.single("pdf"), async (req, res) => {
  const userApiKey = req.header("x-user-api-key");
  const sectionName = req.body.sectionName || "Unknown";
  const sectionText = req.body.sectionText || "";
  const model = req.body.model || "claude-sonnet-4-20250514";

  try {
    const result = await analyzeSection({
      sectionName,
      sectionText,
      userApiKey,
      internalApiKey: process.env.ANTHROPIC_API_KEY,
      model
    });
    res.json(result);
  } catch (error) {
    if (error.message === "MISSING_USER_API_KEY") {
      return res.status(400).json({
        error: "Add your Anthropic API key in Settings to analyze your own papers."
      });
    }
    if (error.message === "INVALID_USER_API_KEY") {
      return res.status(401).json({
        error: "Your API key appears to be invalid. Please check it in Settings."
      });
    }
    return res.status(500).json({ error: "Analysis failed. Please retry." });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

app.get("/api/demo-pdf", (req, res) => {
  if (!fs.existsSync(demoPdfPath)) {
    return res.status(404).json({ error: "Demo PDF not found on server." });
  }
  res.sendFile(demoPdfPath);
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(rootDir, "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).end();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`RxEvidence server listening on ${port}`);
});
