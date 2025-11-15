// src/config/storagePaths.js
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// write compiled PDFs to /tmp/pdfs (alongside your backend)
export const PDF_OUTPUT_DIR = path.join(__dirname, "..", "tmp", "pdfs");

// future: Zoho Bigin placeholders (env-driven when you wire real calls)
export const BIGIN_BASE_URL = process.env.BIGIN_BASE_URL || "";
export const BIGIN_ACCESS_TOKEN = process.env.BIGIN_ACCESS_TOKEN || "";
