/*
 * Webpage Data Extractor
 * ----------------------
 * HOW TO USE
 *  1. Open the page that has the article details (or a table of articles).
 *  2. Press F12 -> Console tab -> paste this whole script -> Enter.
 *  3. A table pops up on the page. Use "Copy (Excel)" to paste straight into
 *     Excel/Sheets, or "Download CSV".
 *
 * FIXED VALUES (edit here if they ever change)
 */
(() => {
  const FIXED = {
    "Upload Owner": "Manjari",
    "Upload Status": "Completed",
    "Molecules": "", // always left blank
    "Partner Name": "Admin Uploaded",
  };
  const UPLOAD_DATE = null; // null = today's date (mm/dd/yy), or set e.g. "10/14/26"

  // Columns with no matching field on the page: left blank instead of showing NOT FOUND
  const OPTIONAL = new Set(["Miscellaneous Sub-specialty"]);

  const COLUMNS = [
    "Upload Date", "Upload Owner", "Upload Status", "Partner Name", "Title",
    "TOP PICKS TOGGLE (ON/OFF)", "Author Name", "Society Name", "Journal Name",
    "Sub-Specialty", "Primary Interest Area", "Secondary Interest Area",
    "Miscellaneous Sub-specialty", "Molecules", "DOI",
  ];

  // Label text(s) on the page that correspond to each column.
  // Add more aliases here if your page words a label differently.
  const ALIASES = {
    "Upload Date": ["publish date", "published date", "date of publication"],
    "Title": ["title", "article title"],
    "TOP PICKS TOGGLE (ON/OFF)": ["top picks", "top picks toggle", "top pick", "top picks toggle (on/off)"],
    "Author Name": ["original author", "author name", "author", "authors", "author names"],
    "Society Name": ["society name", "society"],
    "Journal Name": ["journal source name", "journal name", "journal"],
    "Sub-Specialty": ["super specialties", "super specialty", "sub-specialty", "subspecialty", "sub specialty"],
    "Primary Interest Area": ["primary interest area", "primary interest"],
    "Secondary Interest Area": ["secondary interest area", "secondary interest"],
    "Miscellaneous Sub-specialty": ["miscellaneous sub-specialty", "miscellaneous subspecialty", "misc sub-specialty", "miscellaneous sub specialty"],
    "Molecules": ["molecules", "molecule"],
    "DOI": ["doi", "doi link", "doi number"],
  };

  const norm = (s) => (s || "").replace(/[*:]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  const today = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`; // mm/dd/yy
  };


  const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const toMDY = (raw) => {
    const t = clean(raw);
    if (!t) return "";
    let m = t.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})/); // 15 Oct 2026
    let d, mo, y;
    if (m) { d = +m[1]; mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = +m[3]; }
    else if ((m = t.match(/([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/))) { // Oct 15, 2026
      mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; d = +m[2]; y = +m[3];
    } else return t; // unknown format: leave as shown on the page
    if (!mo) return t;
    return String(mo).padStart(2, "0") + "/" + String(d).padStart(2, "0") + "/" + String(y).slice(-2);
  };

  // ---- read the value of a form control / widget -------------------------
  const readControl = (el) => {
    if (!el) return "";
    if (el.matches("select")) {
      return [...el.selectedOptions].map((o) => clean(o.textContent))
        .filter((t) => t && !/^(select|choose|--)/i.test(t)).join("; ");
    }
    if (el.matches('input[type="checkbox"], input[type="radio"]')) return el.checked ? "ON" : "OFF";
    if (el.matches("input, textarea")) return clean(el.value);
    const aria = el.getAttribute("aria-checked");
    if (aria !== null) return aria === "true" ? "ON" : "OFF";
    return clean(el.textContent);
  };

  const CONTROL_SEL = 'select, input:not([type="hidden"]), textarea, [role="switch"], [aria-checked]';

  const valueFromContainer = (c, labelEl) => {
    if (!c) return "";
    const ctl = [...c.querySelectorAll(CONTROL_SEL)].find((x) => !labelEl || !labelEl.contains(x));
    if (c.matches && c.matches(CONTROL_SEL)) return readControl(c);
    if (ctl) {
      const v = readControl(ctl);
      if (v) return v;
      if (ctl.matches('input[type="checkbox"], [role="switch"], [aria-checked]')) return v;
    }
    let t = c.textContent;
    if (labelEl && c.contains(labelEl)) t = t.replace(labelEl.textContent, ""); // don't return the label itself
    return clean(t);
  };

  // ---- find a field by its label ----------------------------------------
  // placeholder text such as "Select Primary Interest Area" is not a real value
  const ok = (v) => !!v && !/^\s*(please\s+)?(select|choose|--)/i.test(v);

  const findField = (aliases) => {
    const set = new Set(aliases.map(norm));
    const cands = [...document.querySelectorAll("label, th, dt, span, div, p, strong, b, td, h4, h5, h6, legend")]
      .filter((el) => el.children.length <= 2 && set.has(norm(el.textContent)))
      .sort((a, b) => (b.tagName === "LABEL") - (a.tagName === "LABEL"));

    for (const el of cands) {
      // 1) <label for="id">
      if (el.htmlFor) {
        const t = document.getElementById(el.htmlFor);
        const v = readControl(t);
        if (ok(v) || (t && t.type === "checkbox")) return v;
      }
      // 2) next sibling (covers th/td, dt/dd, label + div)
      let v = valueFromContainer(el.nextElementSibling, el);
      if (ok(v)) return v;
      // 3) controls inside the label's parent (label wrapping an input)
      const p = el.parentElement;
      if (p) {
        v = valueFromContainer(p, el);
        if (ok(v) && norm(v) !== norm(el.textContent)) return v;
        // 4) parent's next sibling (label in its own wrapper)
        const ps = p.nextElementSibling;
        if (ps && ps.querySelectorAll(CONTROL_SEL).length === 1) {
          v = valueFromContainer(ps, el);
          if (ok(v)) return v;
        }
      }
    }
    return "";
  };

  // ---- toggle (switch) finder: works with the label on either side ----------
  const TOGGLE_SEL = 'input[type="checkbox"], [role="switch"], [aria-checked]';
  const toggleState = (ctl) => {
    if (ctl.matches('input[type="checkbox"]')) return ctl.checked ? "ON" : "OFF";
    const a = ctl.getAttribute("aria-checked");
    if (a !== null) return a === "true" ? "ON" : "OFF";
    return /checked|active|toggle-on|\bon\b/i.test(ctl.className || "") ? "ON" : "OFF";
  };
  const findToggle = (aliases) => {
    const set = new Set(aliases.map(norm));
    const labels = [...document.querySelectorAll("label, span, div, p, legend, h5, h6, b, strong")]
      .filter((el) => el.children.length <= 2 && set.has(norm(el.textContent)))
      .sort((a, b) => (b.tagName === "LABEL") - (a.tagName === "LABEL"));
    for (const el of labels) {
      let node = el;
      for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
        const ctls = node.querySelectorAll(TOGGLE_SEL);
        if (ctls.length === 1) return toggleState(ctls[0]);
        if (ctls.length > 1) break; // ambiguous: several toggles here, don't guess
      }
    }
    return "";
  };

  // ---- Mode A: a table with matching column headers (many articles) ------
  const fromTables = () => {
    const wanted = {};
    COLUMNS.forEach((c) => {
      wanted[norm(c)] = c;
      (ALIASES[c] || []).forEach((a) => (wanted[norm(a)] = c));
    });
    for (const table of document.querySelectorAll("table")) {
      const heads = [...table.querySelectorAll("thead th, tr:first-child th")];
      if (!heads.length) continue;
      const map = heads.map((h) => wanted[norm(h.textContent)] || null);
      if (map.filter(Boolean).length < 3) continue;
      const rows = [...table.querySelectorAll("tbody tr")].filter((r) => r.children.length);
      return rows.map((r) => {
        const rec = {};
        [...r.children].forEach((cell, i) => {
          if (map[i]) rec[map[i]] = valueFromContainer(cell);
        });
        return rec;
      });
    }
    return null;
  };

  // ---- build final records ----------------------------------------------
  let records = fromTables();
  if (!records || !records.length) {
    const rec = {};
    Object.keys(ALIASES).forEach((col) => (rec[col] = col.startsWith("TOP PICKS") ? findToggle(ALIASES[col]) : findField(ALIASES[col])));
    records = [rec];
  }

  const rows = records.map((r) => {
    const out = {};
    COLUMNS.forEach((c) => {
      if (c === "Upload Date") out[c] = UPLOAD_DATE || toMDY(r[c]);
      else if (c in FIXED) out[c] = FIXED[c];
      else if (c === "Society Name") out[c] = r["Journal Name"] || r[c] || ""; // Society Name = Journal Name
      else out[c] = r[c] || "";
    });
    return out;
  });

  console.table(rows);

  // ---- output helpers -----------------------------------------------------
  const LEAD = [""]; // one blank column at the start (no heading, left empty)
  const FONT = "font-family:'Aptos Narrow';font-size:11pt;";
  const FONT_UI = "'Aptos Narrow',Aptos,Arial,sans-serif";
  const flat = (v) => String(v).replace(/[\t\r\n]+/g, " ");
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const dataCells = (r) => [...LEAD, ...COLUMNS.map((c) => r[c])];
  const tsvRow = (r) => dataCells(r).map(flat).join("\t");
  const tsvHead = [...LEAD, ...COLUMNS].map(flat).join("\t");

  const htmlTable = (list, withHeader) =>
    `<table style="${FONT}border-collapse:collapse;">` +
    (withHeader
      ? "<thead><tr>" +
        [...LEAD, ...COLUMNS].map((c) => `<th style="${FONT}border:1px solid #999;font-weight:bold;">${esc(c)}</th>`).join("") +
        "</tr></thead>"
      : "") +
    "<tbody>" +
    list.map((r) => "<tr>" + dataCells(r).map((v) => `<td style="${FONT}border:1px solid #999;">${esc(v)}</td>`).join("") + "</tr>").join("") +
    "</tbody></table>";

  const csv = [[...LEAD, ...COLUMNS], ...rows.map(dataCells)]
    .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");

  const copyOut = async (html, text) => {
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } else await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
  };

  const BTN_CSS = `margin-right:6px;padding:4px 10px;cursor:pointer;font-family:${FONT_UI};`;
  const btn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = BTN_CSS;
    b.onclick = async () => {
      await fn();
      const prev = b.textContent;
      b.textContent = "Copied \u2713";
      setTimeout(() => (b.textContent = prev), 1500);
    };
    return b;
  };

  // ---- on-page table panel -------------------------------------------------
  const old = document.getElementById("__data_extractor_panel");
  if (old) old.remove();

  const panel = document.createElement("div");
  panel.id = "__data_extractor_panel";
  panel.style.cssText =
    "position:fixed;top:10px;right:10px;z-index:2147483647;background:#fff;color:#111;" +
    "border:1px solid #888;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.3);" +
    `max-width:95vw;max-height:85vh;overflow:auto;padding:10px;font:12px/1.4 ${FONT_UI};`;

  const bar = document.createElement("div");
  bar.style.marginBottom = "8px";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.cssText = BTN_CSS;
  closeBtn.onclick = () => panel.remove();
  const dl = document.createElement("button");
  dl.textContent = "Download CSV";
  dl.style.cssText = BTN_CSS;
  dl.onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "extracted_data.csv";
    a.click();
  };
  bar.append(
    btn("Copy Row", () => copyOut(htmlTable(rows, false), rows.map(tsvRow).join("\n"))),
    btn("Copy with headings", () => copyOut(htmlTable(rows, true), [tsvHead, ...rows.map(tsvRow)].join("\n"))),
    dl,
    closeBtn
  );

  const table = document.createElement("table");
  table.style.cssText = `border-collapse:collapse;font-family:${FONT_UI};`;
  const cellCss = "border:1px solid #bbb;padding:4px 8px;vertical-align:top;text-align:left;";
  const thead = table.createTHead().insertRow();
  [...LEAD, ...COLUMNS, ""].forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    th.style.cssText = cellCss + "background:#eef;white-space:nowrap;min-width:20px;";
    thead.appendChild(th);
  });
  const tbody = table.createTBody();
  rows.forEach((r) => {
    const tr = tbody.insertRow();
    LEAD.forEach(() => { const td = tr.insertCell(); td.style.cssText = cellCss + "min-width:20px;"; });
    COLUMNS.forEach((c) => {
      const td = tr.insertCell();
      td.style.cssText = cellCss;
      if (r[c]) td.textContent = r[c];
      else if (c in FIXED || OPTIONAL.has(c)) td.textContent = "";
      else { td.textContent = "NOT FOUND"; td.style.color = "#c00"; td.style.background = "#fee"; }
    });
    // per-row button (not part of the copied data)
    const last = tr.insertCell();
    last.style.cssText = cellCss;
    last.appendChild(btn("Copy row", () => copyOut(htmlTable([r], false), tsvRow(r))));
  });

  panel.append(bar, table);
  document.body.appendChild(panel);
})();
