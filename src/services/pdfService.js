import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { v4 as uuid } from "uuid";
import {
  LATEXMK_EXE,
  PDFLATEX_EXE,
  PDF_TEMPLATE_PATH,
  PDF_TMP_DIR,
  PDF_EXEC_MAX_BUFFER,
} from "../config/pdfConfig.js";

/* ---------- utils ---------- */
export async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function execBinary(binPath, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      binPath,
      args,
      { ...opts, maxBuffer: PDF_EXEC_MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          const code = err.code || err.errno || "UNKNOWN";
          reject(new Error(
            `SPAWN_ERR:${code}\nBIN:${binPath}\nARGS:${args.join(" ")}\nPATH:${process.env.PATH}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
          ));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}

async function compileWithLatexmk(workdir) {
  return execBinary(LATEXMK_EXE, ["-pdf", "-halt-on-error", "doc.tex"], { cwd: workdir });
}
async function compileWithPdfLaTeX(workdir) {
  await execBinary(PDFLATEX_EXE, ["-interaction=nonstopmode", "-halt-on-error", "doc.tex"], { cwd: workdir });
  await execBinary(PDFLATEX_EXE, ["-interaction=nonstopmode", "-halt-on-error", "doc.tex"], { cwd: workdir });
}

/* ---------- health ---------- */
export async function getPdfHealth() {
  const hasLatexmk = await fileExists(LATEXMK_EXE);
  const hasPdfLaTeX = await fileExists(PDFLATEX_EXE);

  let latexmkV = "n/a", pdflatexV = "n/a", perlV = "n/a";
  try { latexmkV = (await execBinary(LATEXMK_EXE, ["-v"])).stdout.trim(); } catch {}
  try { pdflatexV = (await execBinary(PDFLATEX_EXE, ["-version"])).stdout.split("\n")[0]; } catch {}
  try { perlV = (await execBinary("perl", ["-v"])).stdout.split("\n")[0]; } catch {}

  return {
    PDF_TEMPLATE_PATH,
    PATH: process.env.PATH,
    LATEXMK_EXE, hasLatexmk, latexmkV,
    PDFLATEX_EXE, hasPdfLaTeX, pdflatexV,
    perlV
  };
}

/* ---------- main compilers ---------- */
// 1) Compile EXACTLY the TeX string provided
export async function compileRawTex(texString, filename = "document.pdf") {
  if (!texString || typeof texString !== "string") {
    const err = new Error("Body must include a 'template' string.");
    err.status = 400;
    throw err;
  }

  const id = uuid();
  const workdir = path.join(PDF_TMP_DIR, id);
  await fs.mkdir(workdir, { recursive: true });

  const texPath = path.join(workdir, "doc.tex");
  await fs.writeFile(texPath, texString, "utf8");

  try {
    if (await fileExists(LATEXMK_EXE)) await compileWithLatexmk(workdir);
    else await compileWithPdfLaTeX(workdir);

    const pdf = await fs.readFile(path.join(workdir, "doc.pdf"));
    return { buffer: pdf, filename };
  } catch (e) {
    let logTail = "";
    try {
      const log = await fs.readFile(path.join(workdir, "doc.log"), "utf8");
      logTail = "\n\n--- doc.log (tail) ---\n" + log.slice(-4000);
    } catch {}
    let dirList = "";
    try {
      const files = await fs.readdir(workdir);
      dirList = "\n\n--- workdir files ---\n" + files.join("\n");
    } catch {}
    const error = new Error("LaTeX compilation failed");
    error.detail = String(e.message) + logTail + dirList;
    throw error;
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

// 2) Read templates/proposal.tex and compile AS-IS (no rendering)
export async function compileProposalTemplate() {
  const tex = await fs.readFile(PDF_TEMPLATE_PATH, "utf8");
  return compileRawTex(tex, "proposal.pdf");
}
