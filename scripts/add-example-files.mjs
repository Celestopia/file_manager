import { pdf } from "./fixture-pdf.mjs";
// Add sample sources without replacing existing sources or vault metadata.
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
const root = resolve(process.argv[2] || "others/test-vault");
if (!existsSync(root)) throw Error("Create the test vault first.");
function put(name, body) {
  const path = resolve(root, "Examples", name);
  if (existsSync(path)) {
    console.log("Kept existing: " + name);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log("Added: " + name);
}

put(
  "Research workflow.pdf",
  pdf([
    [
      "Research workflow - overview",
      "A fictional example document for trying the file manager.",
      "1. Read the source and add a short description.",
      "2. Add Research and To read tags.",
      "3. Create a note in the right panel.",
    ],
    [
      "Research workflow - review",
      "Compare the source with your reading note.",
      "Write down the main claim and a question to investigate.",
      "Try page navigation and zoom before opening another file.",
    ],
  ]),
);
put(
  "Reading experiment.pdf",
  pdf([
    [
      "Reading experiment - question",
      "How does a short summary help recall?",
      "This example describes a fictional study, not research evidence.",
    ],
    [
      "Reading experiment - method",
      "Read one page, then write a three-sentence summary.",
      "Record an observation and an unanswered question.",
    ],
    [
      "Reading experiment - reflection",
      "Which details were useful?",
      "Which claims need independent verification?",
      "Create multiple notes to compare reading sessions.",
    ],
  ]),
);
put(
  "资料/Example with a Unicode path.pdf",
  pdf([
    [
      "A nested source",
      "This PDF lives in a folder with a Unicode name.",
      "The relative path distinguishes it from other sources.",
    ],
  ]),
);
put(
  "Project brief.txt",
  "EXAMPLE PROJECT BRIEF\n\nGoal: build a focused reading library.\nAudience: a single researcher.\nMilestone: review the PDFs and write one note per source.\n",
);
put(
  "Reading checklist.md",
  "# Example reading checklist\n\nThis is a source Markdown file, not an application-owned note.\n\n- Identify the main question.\n- Summarize the argument.\n- Record supporting evidence.\n- List questions for later reading.\n",
);
put(
  "Sample observations.csv",
  "session,minutes,notes\nFirst reading,20,2\nReview,15,1\nSynthesis,25,3\n",
);
put(
  "Workflow.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="160" viewBox="0 0 720 160"><rect width="720" height="160" fill="#edf4fc"/><g fill="#fff" stroke="#91b7e5"><rect x="20" y="45" width="180" height="70" rx="12"/><rect x="270" y="45" width="180" height="70" rx="12"/><rect x="520" y="45" width="180" height="70" rx="12"/></g><g font-family="sans-serif" font-size="22" fill="#253f58" text-anchor="middle"><text x="110" y="87">Read</text><text x="360" y="87">Take notes</text><text x="610" y="87">Review</text><text x="235" y="87">→</text><text x="485" y="87">→</text></g></svg>',
);

put("Empty file.txt", "");
put(
  "UTF-8 example.txt",
  "你好，世界！\nFile size counts UTF-8 bytes, not characters.\n",
);
