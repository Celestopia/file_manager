// Minimal ASCII-only PDF fixture writer; not a general document renderer.
export function pdf(pages, pageSizes = []) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids = [];
  for (const [index, lines] of pages.entries()) {
    const [width, height] = pageSizes[index] || [612, 792];
    const page = objects.length + 1;
    kids.push(`${page} 0 R`);
    const escaped = lines.map((line) => line.replace(/[\\()]/g, "\\$&"));
    const stream =
      `BT /F1 20 Tf 50 ${height - 52} Td (` +
      escaped[0] +
      ") Tj /F1 12 Tf " +
      escaped
        .slice(1)
        .map((line) => "0 -30 Td (" + line + ") Tj")
        .join(" ") +
      " ET";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let result = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return result;
}
