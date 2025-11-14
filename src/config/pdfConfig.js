import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- binaries (only used in local mode) ----
export const MIKTEX_BIN =
  process.env.MIKTEX_BIN ||
  "C:\\Users\\DELL\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64";
export const STRAWBERRY_PERL_BIN =
  process.env.STRAWBERRY_PERL_BIN || "C:\\Strawberry\\perl\\bin";

export const LATEXMK_EXE =
  process.env.LATEXMK_EXE || path.join(MIKTEX_BIN, "latexmk.exe");
export const PDFLATEX_EXE =
  process.env.PDFLATEX_EXE || path.join(MIKTEX_BIN, "pdflatex.exe");

// ---- template & temp (only used in local mode) ----
export const PDF_TEMPLATE_PATH =
  process.env.PDF_TEMPLATE_PATH || path.join(ROOT, "templates", "proposal.tex");
export const PDF_TMP_DIR =
  process.env.PDF_TMP_DIR || path.join(ROOT, "tmp");

// ---- request/response sizing ----
export const PDF_MAX_BODY_MB = Number(process.env.PDF_MAX_BODY_MB || 5);
export const PDF_EXEC_MAX_BUFFER = 20 * 1024 * 1024;

// ---- remote mode (DigitalOcean) ----
// Example: PDF_REMOTE_BASE=http://142.93.213.187:3000/pdf
export const PDF_REMOTE_BASE = process.env.PDF_REMOTE_BASE || "";
export const PDF_REMOTE_ENABLED =
  String(process.env.PDF_REMOTE_ENABLED || (PDF_REMOTE_BASE ? "true" : "false"))
    .toLowerCase() === "true";

// Extend PATH only if you may use local binaries
if (!PDF_REMOTE_ENABLED && process.env.PATH && (MIKTEX_BIN || STRAWBERRY_PERL_BIN)) {
  process.env.PATH += `;${MIKTEX_BIN};${STRAWBERRY_PERL_BIN}`;
}
