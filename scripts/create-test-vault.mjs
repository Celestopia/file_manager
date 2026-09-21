import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pdf } from "./fixture-pdf.mjs";
const root = resolve(process.argv[2] || "others/test-vault");
if (existsSync(root))
  throw Error(`Fixture already exists; refusing to overwrite: ${root}`);
mkdirSync(root, { recursive: true });
writeFileSync(
  resolve(root, "Welcome.pdf"),
  pdf([
    [
      "A place for your understanding",
      "File Manager - sample source",
      "Read this PDF and create a note in the right panel.",
      "Your original files stay untouched.",
    ],
  ]),
);
console.log(root);
