// src/utils/renderCustomerHeaderTex.js
// Put your existing JSON -> TeX builder here.
// If you used Mustache + a .tex template, read it here and render.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Mustache from "mustache";

// If you have a template file:
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "proposal.tex");

// If you don’t use Mustache and instead build the whole TeX with string funcs,
// you can import your existing functions and return the final TeX string.

export default function renderCustomerHeaderTex(viewJson) {
  // OPTION A: Mustache template rendering
  // return Mustache.render(await fs.readFile(TEMPLATE_PATH, "utf8"), prepareView(viewJson));

  // OPTION B: If you have custom builders, call them.
  // e.g., return buildFullTexFromJson(viewJson);

  // For now just assume Mustache and a `prepareView` that escapes safely:
  throw new Error("renderCustomerHeaderTex not implemented. Move your existing JSON→TeX code here and return a TeX string.");
}
