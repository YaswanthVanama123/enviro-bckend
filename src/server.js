// // server.js (ESM)

// import express from "express";
// import fs from "fs/promises";
// import { execFile } from "child_process";
// import { v4 as uuid } from "uuid";
// import Mustache from "mustache";
// import path from "path";
// import { fileURLToPath } from "url";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

// /* ===== 1) PATHS (adjust only if different on your machine) =====
//    Use the EXACT output from `where latexmk` and `where pdflatex` */
// const MIKTEX_BIN = "C:\\Users\\DELL\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64";
// const STRAWBERRY_PERL_BIN = "C:\\Strawberry\\perl\\bin"; // ok if missing; `perl` may already be in PATH

// const LATEXMK_EXE  = path.join(MIKTEX_BIN, "latexmk.exe");
// const PDFLATEX_EXE = path.join(MIKTEX_BIN, "pdflatex.exe");

// // Make sure Node can find them
// process.env.PATH += `;${MIKTEX_BIN};${STRAWBERRY_PERL_BIN}`;

// const app = express();
// app.use(express.json({ limit: "5mb" }));

// /* ===== 2) UTILS ===== */
// async function fileExists(p) {
//   try { await fs.access(p); return true; } catch { return false; }
// }

// function execBinary(binPath, args, opts = {}) {
//   return new Promise((resolve, reject) => {
//     execFile(
//       binPath,
//       args,
//       { ...opts, maxBuffer: 20 * 1024 * 1024 },
//       (err, stdout, stderr) => {
//         if (err) {
//           const code = err.code || err.errno || "UNKNOWN";
//           reject(new Error(
//             `SPAWN_ERR:${code}\nBIN:${binPath}\nARGS:${args.join(" ")}\nPATH:${process.env.PATH}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
//           ));
//         } else {
//           resolve({ stdout, stderr });
//         }
//       }
//     );
//   });
// }

// async function compileWithLatexmk(workdir) {
//   // -pdf selects pdflatex; -halt-on-error stops on first error
//   return execBinary(LATEXMK_EXE, ["-pdf", "-halt-on-error", "doc.tex"], { cwd: workdir });
// }
// async function compileWithPdfLaTeX(workdir) {
//   // 2 runs for references/ToC if any
//   await execBinary(PDFLATEX_EXE, ["-interaction=nonstopmode", "-halt-on-error", "doc.tex"], { cwd: workdir });
//   await execBinary(PDFLATEX_EXE, ["-interaction=nonstopmode", "-halt-on-error", "doc.tex"], { cwd: workdir });
// }

// /* ===== 3) SAFE STRING ESCAPING ===== */
// function latexEscape(s) {
//   if (s == null) return "";
//   return String(s)
//     .replace(/\\/g, "\\textbackslash{}")
//     .replace(/&/g, "\\&")
//     .replace(/%/g, "\\%")
//     .replace(/\$/g, "\\$")
//     .replace(/#/g, "\\#")
//     .replace(/_/g, "\\_")
//     .replace(/{/g, "\\{")
//     .replace(/}/g, "\\}")
//     .replace(/\^/g, "\\^{}")
//     .replace(/~/g, "\\~{}");
// }
// function escapeAllStrings(value) {
//   if (Array.isArray(value)) return value.map(escapeAllStrings);
//   if (value && typeof value === "object") {
//     const out = {};
//     for (const k of Object.keys(value)) out[k] = escapeAllStrings(value[k]);
//     return out;
//   }
//   return typeof value === "string" ? latexEscape(value) : value;
// }

// /* ===== 4) LOAD TEMPLATE ===== */
// const TEMPLATE_PATH = path.join(__dirname, "templates", "proposal.tex");
// const TEMPLATE = await fs.readFile(TEMPLATE_PATH, "utf8");

// /* ===== 5) HEALTH/DEBUG ===== */
// app.get("/pdf/health", async (_req, res) => {
//   const hasLatexmk = await fileExists(LATEXMK_EXE);
//   const hasPdfLaTeX = await fileExists(PDFLATEX_EXE);
//   let latexmkV = "n/a", pdflatexV = "n/a", perlV = "n/a";
//   try { latexmkV = (await execBinary(LATEXMK_EXE, ["-v"])).stdout.trim(); } catch {}
//   try { pdflatexV = (await execBinary(PDFLATEX_EXE, ["-version"])).stdout.split("\n")[0]; } catch {}
//   try { perlV = (await execBinary("perl", ["-v"])).stdout.split("\n")[0]; } catch {}
//   res.json({
//     TEMPLATE_PATH,
//     PATH: process.env.PATH,
//     LATEXMK_EXE, hasLatexmk, latexmkV,
//     PDFLATEX_EXE, hasPdfLaTeX, pdflatexV,
//     perlV
//   });
// });

// /* ===== 6) MAIN ROUTE ===== */
// app.post("/pdf/proposal", async (req, res) => {
//   const data = escapeAllStrings(req.body);

//   const id = uuid();
//   const workdir = path.join(__dirname, "tmp", id);
//   await fs.mkdir(workdir, { recursive: true });

//   // Minimal inline test if client passes {_minimal:true}
//   const tex = data._minimal
//     ? "\\documentclass{article}\\usepackage[utf8]{inputenc}\\begin{document}Hello PDF!\\end{document}"
//     : Mustache.render(TEMPLATE, data);

//   const texPath = path.join(workdir, "doc.tex");
//   await fs.writeFile(texPath, tex, "utf8");

//   try {
//     if (await fileExists(LATEXMK_EXE)) {
//       await compileWithLatexmk(workdir);
//     } else {
//       await compileWithPdfLaTeX(workdir);
//     }

//     const pdf = await fs.readFile(path.join(workdir, "doc.pdf"));
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Disposition", 'attachment; filename="proposal.pdf"');
//     res.send(pdf);
//   } catch (e) {
//     let logTail = "";
//     try {
//       const log = await fs.readFile(path.join(workdir, "doc.log"), "utf8");
//       logTail = "\n\n--- doc.log (tail) ---\n" + log.slice(-4000);
//     } catch {}
//     let dirList = "";
//     try {
//       const files = await fs.readdir(workdir);
//       dirList = "\n\n--- workdir files ---\n" + files.join("\n");
//     } catch {}
//     res.status(500).json({
//       error: "LaTeX compilation failed",
//       detail: String(e.message) + logTail + dirList
//     });
//   } finally {
//     // Clean up
//     await fs.rm(workdir, { recursive: true, force: true });
//   }
// });

// /* ===== 7) START ===== */
// const PORT = 3000;
// app.listen(PORT, () => {
//   console.log(`🚀 PDF service running at http://localhost:${PORT}`);
// });


// server.js (ESM style)

// server.js (ESM style, header + dynamic PRODUCTS table)
// server.js (ESM style) - header + PRODUCTS section dynamic
// server.js (ESM) - dynamic header + dynamic colored PRODUCTS


// // src/server.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
// import { ensureDefaultAdmin } from "./src/models/AdminUser.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () =>
      console.log(`🚀 API listening on http://localhost:${PORT}`)
    );
    // await ensureDefaultAdmin();
  } catch (err) {
    console.error('❌ Server start error:', err);
    process.exit(1);
  }
})();


