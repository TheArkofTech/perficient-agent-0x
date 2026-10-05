// PDF renderer for the Advisor Brief stakeholder slide.
// Emits HTML from scripts/slide-def.cjs and prints it with headless Chrome, so
// the PDF and the PPTX (make-slide.cjs) always share one source of copy.
// Run: npm run slide:pdf
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const D = require("./slide-def.cjs");

// Unit conversion: the def file speaks inches/points, the browser speaks px.
const IN = 96;          // 1in = 96px
const PT = IN / 72;     // 1pt = 1.333px

const px = (inches) => +(inches * IN).toFixed(2);
const fs_px = (points) => +(points * PT).toFixed(2);

const esc = (t) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const span = (text, o = {}) => {
  const css = [
    `font-size:${fs_px(o.size || 10)}px`,
    o.bold ? "font-weight:700" : null,
    o.italic ? "font-style:italic" : null,
    o.strike ? "text-decoration:line-through" : null,
    `color:#${o.color || D.C.ink}`,
  ].filter(Boolean).join(";");
  // Runs of 2+ spaces are used as visual separators; keep them intact while
  // letting single spaces wrap normally.
  return `<span style="${css}">${esc(text).replace(/ {2,}/g, (m) => "&nbsp;".repeat(m.length))}</span>`;
};

// Absolutely positioned text block; mirrors the pptx valign/align semantics.
const text = (b, runs, o = {}) => {
  const css = [
    `position:absolute`,
    `left:${px(b.x)}px`,
    `top:${px(b.y)}px`,
    `width:${px(b.w)}px`,
    b.h ? `height:${px(b.h)}px` : null,
    `display:flex`,
    `flex-direction:column`,
    `justify-content:${o.valign === "middle" ? "center" : "flex-start"}`,
    `text-align:${o.align || "left"}`,
    o.spacing ? `letter-spacing:${fs_px(o.spacing)}px` : null,
    `line-height:${o.lineHeight || 1.05}`,
    `white-space:normal`,
    `overflow:visible`,
  ].filter(Boolean).join(";");
  const body = Array.isArray(runs)
    ? runs.map((r) => `<div>${typeof r === "string" ? r : span(r.t, r)}</div>`).join("")
    : `<div>${runs}</div>`;
  return `<div style="${css}">${body}</div>`;
};

const rect = (b, { fill, line, radius = 0, lineWidth = 0.75 }) => {
  const css = [
    "position:absolute",
    `left:${px(b.x)}px`, `top:${px(b.y)}px`,
    `width:${px(b.w)}px`, `height:${px(b.h)}px`,
    `background:#${fill}`,
    line ? `border:${lineWidth * PT}px solid #${line}` : "border:0",
    `border-radius:${px(radius)}px`,
    "box-sizing:border-box",
  ].join(";");
  return `<div style="${css}"></div>`;
};

// PowerPoint's rightArrow: shaft plus head, drawn as an SVG polygon.
const rightArrow = (a) => {
  const w = px(a.w), h = px(a.h);
  const sh = h * 0.45;                 // shaft thickness
  const hl = Math.min(w * 0.55, 17.3); // head left edge
  const pts = [
    [0, (h - sh) / 2], [hl, (h - sh) / 2], [hl, 0],
    [w, h / 2], [hl, h], [hl, (h + sh) / 2], [0, (h + sh) / 2],
  ].map(([x, y]) => `${x},${y}`).join(" ");
  return `<svg width="${w}" height="${h}" style="position:absolute;left:${px(a.x)}px;top:${px(a.y)}px" viewBox="0 0 ${w} ${h}">
    <polygon points="${pts}" fill="#${D.C.arrow}"/></svg>`;
};

const parts = [];

// ── Title band (title + subtitle share one line, as in the PPTX) ──
parts.push(`<div style="position:absolute;left:${px(D.TITLE.x)}px;top:${px(D.TITLE.y)}px;width:${px(D.TITLE.w)}px;height:${px(D.TITLE.h)}px;display:flex;align-items:center">
  ${span(D.TITLE.main, { size: 28, bold: true, color: D.C.navy })}
  ${span(D.TITLE.sub, { size: 15, italic: true, color: D.C.muted })}
</div>`);
parts.push(text(D.BADGE, [
  { t: D.BADGE.lines[0], size: 10, bold: true, color: D.C.ink },
  { t: D.BADGE.lines[1], size: 10, color: D.C.muted },
], { align: "right", valign: "middle", lineHeight: 1.15 }));

// ── Problem bar ──
parts.push(rect(D.PROBLEM, { fill: D.C.alertBg, line: D.C.alertBorder, radius: 0 }));
parts.push(`<div style="position:absolute;left:${px(D.PROBLEM.x)}px;top:${px(D.PROBLEM.y)}px;width:${px(D.PROBLEM.w)}px;height:${px(D.PROBLEM.h)}px;display:flex;align-items:center;padding:0 ${px(0.12)}px;box-sizing:border-box">
  ${span(D.PROBLEM.label + "   ", { size: 10, bold: true, color: D.C.alertInk })}
  ${span(D.PROBLEM.body, { size: 11.5, color: D.C.ink })}
</div>`);

// ── How it works: 5-node flow ──
D.flowArrows(D.FLOW_BOXES).forEach((a) => parts.push(rightArrow(a)));
D.FLOW_BOXES.forEach((b) => {
  parts.push(rect(
    { x: b.x, y: D.FLOW_Y, w: b.w, h: D.FLOW_H },
    { fill: b.fill, line: b.keyline || D.C.border, radius: 0.05, lineWidth: b.keyline ? 1.5 : 0.75 }
  ));
  parts.push(text({ x: b.x, y: D.FLOW_Y, w: b.w, h: D.FLOW_H },
    b.label.split("\n").map((line) => ({ t: line, size: 10.5, bold: !!b.bold, color: b.color })),
    { align: "center", valign: "middle", lineHeight: 0.98 }));
});
parts.push(text({ ...D.FLOW_MODEL_NOTE, h: 0.24 },
  [{ t: D.FLOW_MODEL_NOTE.text, size: 8.5, italic: true, color: D.C.muted }],
  { align: "center" }));
parts.push(text({ ...D.FLOW_CAPTION, h: 0.24 },
  [{ t: D.FLOW_CAPTION.text, size: 9.5, color: D.C.muted }]));

// ── Bottom-left card: stakeholder questions ──
parts.push(rect(D.ASK, { fill: D.C.card, line: D.C.border, radius: 0.06 }));
parts.push(text({ ...D.ASK.headingBox, h: 0.28 },
  [{ t: D.ASK.heading, size: 11, bold: true, color: D.C.navy }], { spacing: 2 }));
const askRows = D.ASK.rows.map(([q, a]) => {
  const css = `font-size:${fs_px(9.5)}px;color:#${D.C.muted};margin-bottom:${fs_px(4)}px;line-height:1.18`;
  return `<div style="${css}">${span("Q  ", { size: 10, bold: true, color: D.C.accent })}`
    + `${span(q + "  —  ", { size: 10, bold: true, color: D.C.ink })}${span(a, { size: 9.5, color: D.C.muted })}</div>`;
}).join("");
parts.push(`<div style="position:absolute;left:${px(D.ASK.bodyBox.x)}px;top:${px(D.ASK.bodyBox.y)}px;width:${px(D.ASK.bodyBox.w)}px">
  ${askRows}</div>`);

// ── Bottom-right card: business value ──
parts.push(rect(D.VALUE, { fill: D.C.card, line: D.C.accent, radius: 0.06, lineWidth: 1.5 }));
parts.push(text({ ...D.VALUE.headingBox, h: 0.28 },
  [{ t: D.VALUE.heading, size: 11, bold: true, color: D.C.navy }], { spacing: 2 }));
parts.push(`<div style="position:absolute;left:${px(D.VALUE.headlineBox.x)}px;top:${px(D.VALUE.headlineBox.y)}px;width:${px(D.VALUE.headlineBox.w)}px;height:${px(D.VALUE.headlineBox.h)}px;display:flex;align-items:center">
  ${span(D.VALUE.headline.before, { size: 13, bold: true, color: D.C.muted, strike: true })}
  ${span("  " + D.VALUE.headline.arrow + "  ", { size: 13, color: D.C.ink })}
  ${span(D.VALUE.headline.after, { size: 24, bold: true, color: D.C.accent })}
</div>`);
const valueRows = D.VALUE.bullets.map(([k, v]) => {
  const css = `margin-bottom:${fs_px(3)}px;line-height:1.18`;
  return `<div style="${css}">${span("▪  ", { size: 9.5, bold: true, color: D.C.accent })}`
    + `${span(k, { size: 10, bold: true, color: D.C.ink })}`
    + `${span(" " + v, { size: 9, color: D.C.muted })}</div>`;
}).join("");
parts.push(`<div style="position:absolute;left:${px(D.VALUE.bodyBox.x)}px;top:${px(D.VALUE.bodyBox.y)}px;width:${px(D.VALUE.bodyBox.w)}px">
  ${valueRows}</div>`);
parts.push(`<div style="position:absolute;left:${px(D.VALUE.calloutBox.x)}px;top:${px(D.VALUE.calloutBox.y)}px;width:${px(D.VALUE.calloutBox.w)}px;height:${px(D.VALUE.calloutBox.h)}px;display:flex;align-items:center;padding:0 ${px(0.08)}px;box-sizing:border-box;background:#${D.C.accentTint};line-height:1.2">
  ${span(D.VALUE.callout, { size: 9.5, bold: true, italic: true, color: D.C.accentInk })}
</div>`);

// ── Footer strip ──
parts.push(`<div style="position:absolute;left:${px(D.FOOTER.x)}px;top:${px(D.FOOTER.y)}px;width:${px(D.FOOTER.w)}px;height:${px(D.FOOTER.h)}px;display:flex;align-items:center">
  ${span(D.FOOTER.stack, { size: 9, bold: true, color: D.C.muted })}
  ${span("        " + D.FOOTER.disclaimer, { size: 8.5, italic: true, color: D.C.faint })}
</div>`);

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Advisor Brief — Stakeholder Slide</title>
<style>
  @page { size: ${D.CANVAS.w}in ${D.CANVAS.h}in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${D.FONT}, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .stage { position: relative; width: ${px(D.CANVAS.w)}px; height: ${px(D.CANVAS.h)}px;
           background: #${D.C.bg}; overflow: hidden; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body><div class="stage">${parts.join("\n")}</div></body></html>`;

const OUT_DIR = path.join(__dirname, "..");
const tmpHtml = path.join(OUT_DIR, ".slide-pdf.html");
const outPdf = path.join(OUT_DIR, "Advisor-Brief-Stakeholder-Slide.pdf");
fs.writeFileSync(tmpHtml, html);

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].find((c) => fs.existsSync(c));
if (!CHROME) {
  console.error("No Chromium-family browser found; install Chrome or run `npm run slide` for the PPTX.");
  process.exit(1);
}

execFileSync(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  `--user-data-dir=${path.join(OUT_DIR, ".slide-chrome-profile")}`,
  "--no-pdf-header-footer",
  "--run-all-compositor-stages-before-draw",
  "--virtual-time-budget=3000",
  `--print-to-pdf=${outPdf}`,
  `file://${tmpHtml}`,
], { stdio: ["ignore", "ignore", "inherit"] });

fs.rmSync(tmpHtml, { force: true });
fs.rmSync(path.join(OUT_DIR, ".slide-chrome-profile"), { recursive: true, force: true });
console.log("wrote", outPdf);
