import { pdf } from "./fixture-pdf.mjs";
import { createServer } from "node:net";
// Native WebView2 integration test. Runs only against the generated test vault.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(`others/native-${Date.now()}`),
  executable = resolve(process.argv[2] || "target/release/file-manager.exe");
const fixture = spawnSync(
  process.execPath,
  ["scripts/create-test-vault.mjs", root],
  { encoding: "utf8" },
);
if (fixture.status !== 0) throw Error(fixture.stderr);
const previewSources = {
  "Z Markdown.md": "# Read-only Markdown\n\n**Source formatting**\n",
  "Z Text.txt": "Plain text <b>stays literal</b>\n你好\n",
  "Z Empty.txt": "",
};
for (const [name, body] of Object.entries(previewSources))
  writeFileSync(resolve(root, name), body);
writeFileSync(
  resolve(root, "Welcome.pdf"),
  pdf(
    Array.from({ length: 8 }, (_, i) => [
      `Selectable page ${i + 1}`,
      "Continuous PDF reading and copying.",
    ]),
    Array.from({ length: 8 }, (_, i) => (i % 2 ? [792, 900] : [612, 792])),
  ),
);
const before = createHash("sha256")
  .update(readFileSync(resolve(root, "Welcome.pdf")))
  .digest("hex");
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close((error) => (error ? reject(error) : resolve(port)));
  });
});
const app = spawn(executable, ["--vault", root, "--smoke", "--inspect-smoke"], {
  windowsHide: true,
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const closeMode = process.argv[3] || "clean";
if (!["clean", "save", "discard"].includes(closeMode))
  throw Error("Unknown close mode");
let socket;
try {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      target = (
        await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      ).find((t) => t.type === "page" && t.url.includes("tauri"));
      if (target) break;
    } catch {}
    await sleep(250);
  }
  if (!target) throw Error("Native webview debugger did not become available");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.onopen = res;
    socket.onerror = rej;
  });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
      }
    }
  };
  socket.onclose = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Native debugger closed"));
    }
    pending.clear();
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`CDP request timed out: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw Error(`Timed out: ${expression}`);
  };
  const click = async (label) => {
    await wait(
      `Array.from(document.querySelectorAll('button, [role=button]')).some(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)})&&!e.disabled)`,
    );
    await evaluate(
      `Array.from(document.querySelectorAll('button, [role=button]')).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)}).click()`,
    );
  };
  const fill = async (selector, value) => {
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  };
  await wait(
    "document.querySelector('canvas')?.width > 100 && document.querySelector('.pdf-toolbar')?.textContent.includes('1 / 8')",
  );
  if (
    !(await evaluate(
      "window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized',{label:'main'})",
    ))
  )
    throw Error("App did not start maximized");
  await click("Restore window");
  await wait(
    "document.querySelector('.textLayer span')?.textContent.includes('Selectable page 1')",
  );
  const textRect = await evaluate(
    `(() => { const r = document.querySelector('.textLayer span').getBoundingClientRect(); return {x:r.x, y:r.y, width:r.width, height:r.height}; })()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: textRect.x + 1,
    y: textRect.y + textRect.height / 2,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: textRect.x + textRect.width - 1,
    y: textRect.y + textRect.height / 2,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: textRect.x + textRect.width - 1,
    y: textRect.y + textRect.height / 2,
    button: "left",
    clickCount: 1,
  });
  if (
    !(await evaluate("getSelection().toString().includes('Selectable page')"))
  )
    throw Error("Mouse cannot select PDF text");
  if (
    await evaluate(
      "!!document.querySelector('[aria-label=\"Next page\"]') || !!document.querySelector('.source-header .eyebrow')",
    )
  )
    throw Error("Old PDF navigation/type label remains");
  mkdirSync("others/ui-review", { recursive: true });
  const selectionShot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(
    "others/ui-review/pdf-text-selection.png",
    Buffer.from(selectionShot.data, "base64"),
  );
  await wait(
    "document.querySelector('.pdf-page[data-page=\"2\"] .textLayer span')",
  );
  await evaluate(`(() => {
    const start = document.querySelector('.pdf-page[data-page="1"] .textLayer span').firstChild;
    const end = document.querySelector('.pdf-page[data-page="2"] .textLayer span').firstChild;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    if (!selection.toString().includes('Selectable page 2')) throw Error('Cross-page text selection failed');
    document.querySelector('.pdf-pages').scrollTop = 4000;
  })()`);
  await wait("!document.querySelector('.pdf-page[data-page=\"1\"] canvas')");
  if (
    !(await evaluate("getSelection().toString().includes('Selectable page 1')"))
  )
    throw Error("Scrolling discarded selected text");
  const readingPage = await evaluate(
    "document.querySelector('[aria-label=\"Current PDF page\"]').textContent",
  );
  await evaluate(
    "getSelection().removeAllRanges(); var z = document.querySelector('.zoom select'); z.value = '1.25'; z.dispatchEvent(new Event('change', {bubbles:true}));",
  );
  await sleep(300);
  if (
    (await evaluate(
      "document.querySelector('[aria-label=\"Current PDF page\"]').textContent",
    )) !== readingPage
  )
    throw Error("Zoom lost reading page");
  await evaluate(
    "var z = document.querySelector('.zoom select'); z.value = '0'; z.dispatchEvent(new Event('change', {bubbles:true}));",
  );
  await sleep(300);
  await evaluate("document.querySelector('.pdf-pages').scrollTop = 0");
  await wait(
    "document.querySelector('.pdf-page[data-page=\"1\"] canvas')?.width > 100",
  );
  const pdfWheelPoint = await evaluate(
    `(() => {const r = document.querySelector('.pdf-pages').getBoundingClientRect(); return {x:r.x+150,y:r.y+200};})()`,
  );
  const pdfWidthBefore = await evaluate(
    "document.querySelector('.pdf-page').offsetWidth",
  );
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    ...pdfWheelPoint,
    deltaX: 0,
    deltaY: -100,
    modifiers: 2,
  });
  await wait(
    `document.querySelector('.pdf-page').offsetWidth > ${pdfWidthBefore}`,
  );
  if (
    !(await evaluate(
      "Number(document.querySelector('.zoom select').value) > 0",
    ))
  )
    throw Error("Wheel zoom did not leave Fit width");
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    ...pdfWheelPoint,
    deltaX: 0,
    deltaY: 100,
    modifiers: 2,
  });
  await wait(
    `Math.abs(document.querySelector('.pdf-page').offsetWidth - ${pdfWidthBefore}) < 3`,
  );
  await evaluate(
    "var z=document.querySelector('.zoom select'); z.value='0'; z.dispatchEvent(new Event('change',{bubbles:true}));",
  );
  await wait("document.querySelector('.zoom select').value === '0'");
  await evaluate("document.querySelector('.pdf-pages').scrollTop=0");
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    ...pdfWheelPoint,
    deltaX: 0,
    deltaY: 150,
  });
  await wait("document.querySelector('.pdf-pages').scrollTop > 0");
  if ((await evaluate("document.querySelector('.zoom select').value")) !== "0")
    throw Error("Ordinary scrolling changed zoom");
  await evaluate("document.querySelector('.pdf-pages').scrollTop=0");
  const openedRoot = await evaluate(
    "window.__TAURI_INTERNALS__.invoke('snapshot').then(s=>s.root)",
  );
  if (resolve(openedRoot).toLowerCase() !== root.toLowerCase())
    throw Error("Debugger belongs to a different vault");
  const failedHandoff = await evaluate(
    `window.__TAURI_INTERNALS__.invoke('switch_folder', {path:${JSON.stringify(root)}}).then(()=>false,()=>true)`,
  );
  if (!failedHandoff)
    throw Error("Switching to a locked vault unexpectedly succeeded");
  await wait("document.querySelector('canvas')?.width > 100");
  mkdirSync("others/ui-review", { recursive: true });
  const capture = async (name) => {
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    const result = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(
      `others/ui-review/${name}.png`,
      Buffer.from(result.data, "base64"),
    );
  };
  if (
    await evaluate(
      "window.__TAURI_INTERNALS__.invoke('plugin:window|is_decorated',{label:'main'})",
    )
  )
    throw Error("Native title bar is still enabled");
  await click("Maximize window");
  await wait(
    "document.querySelector('[aria-label=\"Restore window\"]') !== null",
  );
  await click("Restore window");
  await wait(
    "document.querySelector('[aria-label=\"Maximize window\"]') !== null",
  );
  await capture("reading");
  if (await evaluate("!!document.querySelector('.appbar small')"))
    throw Error("Vault subtitle remains");
  if (
    !(await evaluate(
      "(()=>{const r=document.querySelector('.app-brand').getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<2})()",
    ))
  )
    throw Error("App title is not centered");
  const sourceDivider = await evaluate(
    "(()=>{const r=document.querySelector('[aria-label=\"Resize source files\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+150}})()",
  );
  const originalSourceWidth = await evaluate(
    "document.querySelector('.source-list').getBoundingClientRect().width",
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...sourceDivider,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: sourceDivider.x + 30,
    y: sourceDivider.y,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: sourceDivider.x + 30,
    y: sourceDivider.y,
    button: "left",
    clickCount: 1,
  });
  if (
    (await evaluate(
      "document.querySelector('.source-list').getBoundingClientRect().width",
    )) <= originalSourceWidth
  )
    throw Error("Source divider did not resize");
  if (
    await evaluate(
      "document.querySelector('.vault-caption')!==null || document.querySelector('.local-badge')!==null || !!document.querySelector('.appbar button[aria-label=Settings]')",
    )
  )
    throw Error("Main page still exposes vault operations/path badge");
  const widePoint = await evaluate(
    `(() => {const r=document.querySelector('[aria-label="Resize source files"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+150};})()`,
  );
  const wideX = await evaluate("innerWidth * 0.7");
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...widePoint,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: wideX,
    y: widePoint.y,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: wideX,
    y: widePoint.y,
    button: "left",
    clickCount: 1,
  });
  await wait(
    "Math.abs(document.querySelector('.source-list').getBoundingClientRect().width - innerWidth * 0.5) < 2",
  );
  const collapsePoint = await evaluate(
    "(()=>{const r=document.querySelector('[aria-label=\"Resize source files\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+150}})()",
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...collapsePoint,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 60,
    y: collapsePoint.y,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 60,
    y: collapsePoint.y,
    button: "left",
    clickCount: 1,
  });
  await wait(
    "document.querySelector('.expand-sources')!==null && getComputedStyle(document.querySelector('.source-list')).display==='none'",
  );
  await capture("source-collapsed");
  await click("Expand source files");
  await wait("document.querySelector('.expand-sources')===null");
  await click("Settings");
  await wait("document.querySelector('[role=menu]')!==null");
  await capture("settings-menu");
  await click("Refresh");
  await wait(
    "document.querySelector('.notifications').textContent.includes('Refresh complete')",
  );
  await capture("refresh-notification");
  await wait("!document.querySelector('.notification')");
  if (await evaluate("!!document.querySelector('.statusbar')"))
    throw Error("Bottom status bar remains");
  await click("Details");
  if (
    await evaluate(
      "!!document.querySelector('.metadata-panel input, .metadata-panel textarea') || !!document.querySelector('main .metadata-panel')",
    )
  )
    throw Error("Metadata should be read-only in the right panel");
  await evaluate(
    "document.querySelector('[aria-label=\"Resize metadata\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))",
  );
  await wait(
    "document.querySelector('[aria-label=\"Resize metadata\"]').getAttribute('aria-valuenow')==='400'",
  );
  await capture("metadata-readonly");
  if (await evaluate("document.querySelector('.file-information').open"))
    throw Error("File information should start collapsed");
  if (await evaluate("!!document.querySelector('.source-label small')"))
    throw Error("Source row still shows path");
  if (
    !(await evaluate(
      "document.querySelector('.metadata-panel').textContent.includes('Relative path') && document.querySelector('.metadata-panel').textContent.includes('File size')",
    ))
  )
    throw Error("Source file facts missing");
  const divider = await evaluate(
    "(()=>{const r=document.querySelector('[aria-label=\"Resize metadata\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+150}})()",
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...divider,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: divider.x - 30,
    y: divider.y,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: divider.x - 30,
    y: divider.y,
    button: "left",
    clickCount: 1,
  });
  await wait(
    "Number(document.querySelector('[aria-label=\"Resize metadata\"]').getAttribute('aria-valuenow')) > 400",
  );
  await click("Edit Title");
  await click("Edit Description");
  await click("Edit Source URL");
  await fill('input[placeholder="Welcome"]', "A place for your understanding");
  await fill(
    'textarea[aria-label="Description"]',
    "A sample source for trying the minimal reading workflow.",
  );
  await fill('input[aria-label="Source URL"]', "https://example.org/paper");
  const rightDivider = await evaluate(
    `(() => {const r=document.querySelector('[aria-label="Resize metadata"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+150};})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...rightDivider,
    button: "left",
    clickCount: 1,
  });
  const closeX = await evaluate("innerWidth - 60");
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: closeX,
    y: rightDivider.y,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: closeX,
    y: rightDivider.y,
    button: "left",
    clickCount: 1,
  });
  await wait("!document.querySelector('.metadata-panel')");
  await click("Details");
  if (
    (await evaluate(
      "document.querySelector('textarea[aria-label=\"Description\"]').value",
    )) !== "A sample source for trying the minimal reading workflow."
  )
    throw Error("Drag-to-close discarded draft");
  await click("Edit Description");
  if (
    await evaluate(
      "!!document.querySelector('textarea[aria-label=\"Description\"]')",
    )
  )
    throw Error("Pencil did not exit edit mode");
  await click("Close window");
  await wait("document.querySelector('[role=alertdialog]')!==null");
  await click("Stay");
  await click("Apply");
  await wait(
    "document.querySelector('h1')?.textContent==='A place for your understanding'",
  );
  await click("Edit tags");
  await click("+ Create tag");
  if (await evaluate("!!document.querySelector('.tag-choice')"))
    throw Error("Create tag dialog shows existing tags");
  await capture("create-tag");
  await fill(".tag-form input", "Research");
  await fill(".tag-form textarea", "Papers to think about.");
  await click("Apply tag");
  await wait("document.querySelector('.tag-choice input') !== null");
  await evaluate("document.querySelector('.tag-choice input').click()");
  await click("Done");
  await click("Apply");
  await wait(
    "document.querySelector('.notifications').textContent.includes('Source metadata saved')",
  );
  if (
    await evaluate(
      "getComputedStyle(document.querySelector('.metadata-value a')).textDecorationLine !== 'none'",
    )
  )
    throw Error("Link underline remains");
  await click("Select tags");
  await fill('[aria-label="Search tags"]', "rese");
  await wait(
    "document.querySelector('.tag-options button')?.textContent.includes('Research')",
  );
  await evaluate("document.querySelector('.tag-options button').click()");
  await evaluate("document.querySelector('.tag-options button').click()");
  await wait("document.querySelector('[aria-label=\"Recent tags\"]')!==null");
  await capture("tag-dropdown");
  await evaluate(
    "document.querySelector('[aria-label=\"Search tags\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  await capture("metadata-saved");
  await click("Remove tag Research");
  await wait("document.querySelector('.tag-selection .tag')===null");
  await click("Reset");
  await wait("document.querySelector('.tag-selection .tag')!==null");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 850,
    height: 650,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await capture("metadata-compact");
  await send("Emulation.clearDeviceMetricsOverride");
  // Individual key events allow React to render each updated width.
  for (let i = 0; i < 50; i++)
    await evaluate(
      "document.querySelector('[aria-label=\"Resize metadata\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))",
    );
  if (
    !(await evaluate(
      "Math.abs(document.querySelector('.metadata-panel').getBoundingClientRect().width - Math.max(280, Math.min(innerWidth * 0.6, innerWidth - document.querySelector('.source-list').getBoundingClientRect().width - 286))) < 2",
    ))
  )
    throw Error("Metadata width does not match its layout limit");
  await capture("metadata-wide");
  await click("Details");
  await click("Notes");
  await click("New note");
  await wait(
    "document.querySelector('[aria-label=\"Markdown note body\"]') !== null",
  );
  await fill(
    '[aria-label="Markdown note body"]',
    "# First reading\n\nThe source stays unchanged. My understanding lives in a note.\n\n- Keep the useful idea.\n- Write the next question.",
  );
  await click("Save note");
  await click("Information");
  if (
    !(await evaluate(
      "getComputedStyle(document.querySelector('.information-shade')).backdropFilter.includes('blur')",
    ))
  )
    throw Error("Information backdrop is not blurred");
  await wait(
    "document.querySelector('.note-file-size')?.textContent.includes(' B')",
  );
  const focusContained = await evaluate(
    "(()=>{document.querySelector('[aria-label=\"Close window\"]').focus();return document.querySelector('.information-modal').contains(document.activeElement)})()",
  );
  if (!focusContained)
    throw Error("Modal allowed focus to escape to background window controls");
  await capture("note-information");
  await click("Close information");
  await evaluate(
    "document.querySelector('.notes-bar select').dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await wait("document.querySelector('.markdown')!==null");
  if (
    await evaluate(
      "document.querySelector('.note-editor .note-file-size')!==null",
    )
  )
    throw Error("Size remains in note body panel");
  await wait(
    "Array.from(document.querySelectorAll('button, [role=button]')).some(e=>e.getAttribute('aria-label')==='Delete note')",
  );
  await click("Preview");
  await wait("document.querySelector('.markdown')!==null");
  const columns = () =>
    evaluate(
      "(()=>{const l=document.querySelector('.source-list').getBoundingClientRect(),c=document.querySelector('.content').getBoundingClientRect(),n=document.querySelector('.notes-section').getBoundingClientRect();return {aligned:Math.abs(l.top-n.top)<2&&l.right<=c.left+1&&c.right<=n.left+1&&n.right<=innerWidth+1,contentWidth:c.width,noteWidth:n.width};})()",
    );
  if (!(await columns()).aligned)
    throw Error("Notes are not in a separate right column");
  await capture("reading-with-note");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 850,
    height: 650,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait("innerWidth===850");
  if (!(await columns()).aligned)
    throw Error("Columns overflow at the minimum supported window width");
  await capture("three-column-compact");
  await send("Emulation.clearDeviceMetricsOverride");
  await click("Close notes");
  await wait("document.querySelector('.notes-section')===null");
  await click("Notes");
  await wait("document.querySelector('.markdown')!==null");
  // Prove deletion through the real UI with a second disposable note.
  await click("New note");
  await wait(
    "document.querySelector('[aria-label=\"Note title\"]')?.value==='Reading note 2'",
  );
  await fill('[aria-label="Markdown note body"]', "Temporary deletion test");
  await click("Save note");
  await wait(
    "Array.from(document.querySelectorAll('button, [role=button]')).some(e=>e.getAttribute('aria-label')==='Delete note'&&!e.disabled)",
  );
  await click("Delete note");
  await click("Delete permanently");
  await wait("document.querySelector('.notes-empty') !== null");
  for (const [name, body] of Object.entries(previewSources)) {
    const label = name.replace(/\.[^.]+$/, "");
    await evaluate(
      'Array.from(document.querySelectorAll(".source-row")).find(e=>e.querySelector("strong").textContent===' +
        JSON.stringify(label) +
        ").click()",
    );
    await wait(
      'document.querySelector(".source-header p")?.textContent===' +
        JSON.stringify(name),
    );
    if (name.endsWith(".md")) {
      await wait(
        'document.querySelector(".source-markdown h1")?.textContent==="Read-only Markdown"',
      );
      await capture("markdown-source");
    } else if (body) {
      await wait(
        'document.querySelector(".source-plain-text")?.textContent===' +
          JSON.stringify(body),
      );
      await capture("txt-source");
    } else
      await wait(
        'document.querySelector("main").textContent.includes("This file is empty.")',
      );
    if (
      await evaluate(
        '!!document.querySelector("main textarea, main input, main [contenteditable]")',
      )
    )
      throw Error("Editable source preview");
    if (body) {
      const point = await evaluate(
        `(() => {const r=document.querySelector('.text-source-view').getBoundingClientRect();return {x:r.x+100,y:r.y+100};})()`,
      );
      await send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        ...point,
        deltaX: 0,
        deltaY: -100,
        modifiers: 2,
      });
      await wait(
        "parseInt(document.querySelector('[aria-label=\"Text zoom\"]').textContent) > 100",
      );
      if (
        !(await evaluate(
          "parseFloat(getComputedStyle(document.querySelector('.source-markdown, .source-plain-text')).fontSize) > 14",
        ))
      )
        throw Error("Text font size did not increase");
      await click("Reset zoom");
      await wait(
        "document.querySelector('[aria-label=\"Text zoom\"]').textContent === '100%'",
      );
    }
    if (readFileSync(resolve(root, name), "utf8") !== body)
      throw Error("Text source modified");
  }
  await evaluate(
    'Array.from(document.querySelectorAll(".source-row")).find(e=>e.querySelector("strong").textContent==="A place for your understanding").click()',
  );
  await wait(
    'document.querySelector(".source-header p")?.textContent==="Welcome.pdf"',
  );
  const files = readFileSync(
    resolve(root, ".file_manager/sources.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  const notes = readFileSync(resolve(root, ".file_manager/notes.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  if (
    files.find((s) => s.path === "Welcome.pdf").title !==
      "A place for your understanding" ||
    files.find((s) => s.path === "Welcome.pdf").tag_ids.length !== 1 ||
    notes.length !== 1
  )
    throw Error("Native persisted metadata does not match UI operations");
  if (
    createHash("sha256")
      .update(readFileSync(resolve(root, "Welcome.pdf")))
      .digest("hex") !== before
  )
    throw Error("Source changed");
  // Check actual process exit, not merely appearance of the draft confirmation.
  if (closeMode !== "clean") {
    await click("Details");
    await click("Edit Title");
    await fill('input[aria-label="Title"]', "Close verification draft");
    await click("Close window");
    await wait("document.querySelector('[role=alertdialog]')!==null");
  } else {
    await click("Minimize window");
    await wait(
      "window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized',{label:'main'})",
    );
  }
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Window failed to exit after close: " + closeMode)),
      10000,
    );
    app.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Unexpected exit code: " + code));
    });
  });
  // A closing webview can disappear before CDP acknowledges the click.
  void click(
    closeMode === "clean"
      ? "Close window"
      : closeMode === "save"
        ? "Save changes"
        : "Discard",
  ).catch(() => {});
  await exited;
  const saved = readFileSync(
    resolve(root, ".file_manager/sources.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")
    .map(JSON.parse)
    .find((s) => s.path === "Welcome.pdf");
  if (
    saved.title !==
    (closeMode === "save"
      ? "Close verification draft"
      : "A place for your understanding")
  )
    throw Error("Close draft decision was not respected");
  rmSync(resolve(root, ".file_manager/smoke-result.json"), { force: true });
  const reopened = spawnSync(executable, ["--vault", root, "--smoke"], {
    windowsHide: true,
    timeout: 45000,
  });
  if (reopened.status !== 0 || reopened.error)
    throw Error("Reopen after close failed: " + reopened.error);
  const result = JSON.parse(
    readFileSync(resolve(root, ".file_manager/smoke-result.json"), "utf8"),
  );
  if (!result.success) throw Error("Reopened vault failed to render");
  writeFileSync(
    "others/ui-review/close-" + closeMode + ".json",
    JSON.stringify(
      {
        passed: true,
        closeMode,
        processExited: true,
        reopened: true,
        sourceUnchanged: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: native UI, source preservation, " +
      closeMode +
      " close, process exit, and reopening.",
  );
} finally {
  socket?.close();
  if (app.exitCode === null) app.kill();
}
