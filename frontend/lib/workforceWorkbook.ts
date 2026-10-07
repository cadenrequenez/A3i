import { zip } from "./scheduleWorkbook";
import {
  workforceDate,
  type WorkforceEntry,
  type WorkforceMonth,
} from "./workforce";
import type { Facility } from "./types";
export const workforceSiteName = (s: Facility) =>
  /driscoll/i.test(s.site_name)
    ? "Driscoll"
    : /utrgv/i.test(s.site_name)
      ? "UTRGV"
      : /asc|regional surgical/i.test(s.site_name)
        ? "ASC"
        : "Rio";
export function reliefLabel(e: WorkforceEntry, sites: Facility[]) {
  const site = sites.find((s) => s.id === e.site_id);
  return `${e.name}${site && workforceSiteName(site) !== "Rio" ? ` · ${workforceSiteName(site)}` : ""}${e.status === "admin" ? " · Admin" : ""}${e.note ? ` · ${e.note}` : ""}`;
}
const esc = (s: string) =>
  s
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function workforceWorkbook(
  month: WorkforceMonth,
  sites: Facility[],
  options: { section?: string; audience?: string; revision?: string } = {},
): Uint8Array {
  const count = new Date(month.year, month.month, 0).getDate(),
    label = new Date(month.year, month.month - 1, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    ),
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const sheets = sites.map((s) => ({
    name: workforceSiteName(s),
    headers: [
      "Date",
      "MD assignments",
      "CRNA assignments",
      "Off",
      "Daily needs / notes",
    ],
    values: (day: number) => {
      const p = month.days.find(
        (d) => d.date === workforceDate(month.year, month.month, day),
      )?.payload;
      const entries = p?.entries || [],
        override = p?.sites[s.id];
      return [
        entries
          .filter(
            (e) =>
              e.site_id === s.id &&
              e.kind === "md" &&
              e.status !== "off" &&
              (e.status !== "post_call" ||
                !entries.some(
                  (m) =>
                    m.kind === "md" &&
                    m.site_id === s.id &&
                    m.status === "working" &&
                    m.name === e.name,
                )),
          )
          .map(
            (e) =>
              `${e.kind === "md" && (e.status === "post_call" || entries.some((m) => m.site_id === s.id && m.status === "post_call" && m.name === e.name)) ? "*" : ""}${e.name}${e.status === "admin" ? " · Admin" : ""}${e.note ? ` · ${e.note}` : ""}`,
          )
          .join("\n"),
        entries
          .filter(
            (e) =>
              e.site_id === s.id && e.kind === "crna" && e.status !== "off",
          )
          .map(
            (e) =>
              `${e.kind === "md" && (e.status === "post_call" || entries.some((m) => m.site_id === s.id && m.status === "post_call" && m.name === e.name)) ? "*" : ""}${e.name}${e.status === "admin" ? " · Admin" : ""}${e.note ? ` · ${e.note}` : ""}`,
          )
          .join("\n"),
        entries
          .filter((e) => e.status === "off")
          .map(
            (e) =>
              `${e.name} (${e.kind.toUpperCase()})${e.note ? ` · ${e.note}` : ""}`,
          )
          .join("\n"),
        `${override?.closed ? "Closed" : `${override?.md ?? s.staffing_requirements?.md ?? 0} MD / ${override?.crna ?? s.staffing_requirements?.crna ?? 0} CRNA`}${override?.note ? `\n${override.note}` : ""}${p?.note ? `\n${p.note}` : ""}`,
      ];
    },
  }));
  sheets.push({
    name: "CRNA relief",
    headers: ["Date", "Relief order", "Locations", "Off", "Day notes"],
    values: (day: number) => {
      const p = month.days.find(
        (d) => d.date === workforceDate(month.year, month.month, day),
      )?.payload;
      const relief = (p?.entries || []).filter(
        (e) => e.kind === "crna" && e.status !== "off",
      );
      return [
        relief.map((e, i) => `${i + 1}. ${reliefLabel(e, sites)}`).join("\n"),
        relief
          .map(
            (e) =>
              `${e.name} · ${sites.find((s) => s.id === e.site_id)?.site_name || "—"}`,
          )
          .join("\n"),
        (p?.entries || [])
          .filter((e) => e.status === "off")
          .map((e) => e.name)
          .join("\n"),
        p?.note || "",
      ];
    },
  });
  const selectedSheets =
    options.section === "relief"
      ? sheets.filter((s) => s.name === "CRNA relief")
      : options.section
        ? sheets.filter((s) => s.name !== "CRNA relief")
        : sheets;
  for (const sheet of selectedSheets) {
    if (options.audience && options.audience !== "office") {
      const index = sheet.headers.indexOf("Off");
      const values = sheet.values;
      sheet.headers = sheet.headers.filter((_, i) => i !== index);
      sheet.values = (day) => values(day).filter((_, i) => i !== index - 1);
    }
  }
  const cell = (r: string, s: string, style = 0) =>
    `<c r="${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
  const dataSheets = selectedSheets.map((s, i) => {
    let rows = `<row r="1" ht="35" customHeight="1">${cell("A1", `A3i / ${label} / ${s.name}`, 1)}</row><row r="2" ht="27" customHeight="1">${cell("A2", `${month.status === "ready" ? "Ready to share" : "DRAFT · In progress"} · ${options.revision || "Saved copy"} · ${options.audience === "office" ? "Private office copy" : options.audience === "provider" ? "Provider copy" : "Hospital copy"} · * MD post-call`, 2)}</row><row r="3" ht="25" customHeight="1">${s.headers.map((h, n) => cell(`${String.fromCharCode(65 + n)}3`, h, 2)).join("")}</row>`;
    for (let day = 1; day <= count; day++) {
      const r = day + 3,
        values = s.values(day),
        height = Math.max(
          40,
          ...values.map((v) => v.split("\n").length * 16 + 12),
        );
      rows += `<row r="${r}" ht="${height}" customHeight="1"><c r="A${r}" s="3"><v>${Date.UTC(month.year, month.month - 1, day) / 86400000 + 25569}</v></c>${values.map((v, n) => cell(`${String.fromCharCode(66 + n)}${r}`, v, n === 2 ? 4 : 0)).join("")}</row>`;
    }
    return [
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="5" width="38" customWidth="1"/></cols><sheetData>${rows}</sheetData><autoFilter ref="A3:${String.fromCharCode(64 + s.headers.length)}${count + 3}"/><mergeCells count="2"><mergeCell ref="A1:E1"/><mergeCell ref="A2:E2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
    ];
  });
  const xf = (font: number, fill: number, num = 0) =>
    `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="1" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf>`;
  const styles = `<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="ddd, mmm d"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Aptos"/><color rgb="FF15283F"/></font><font><b/><sz val="23"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A1930"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFAF4E9"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFDEE5EE"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5">${xf(0, 0)}${xf(1, 2)}${xf(2, 2)}${xf(0, 0, 164)}${xf(0, 3)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip({
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${selectedSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${selectedSheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${selectedSheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${selectedSheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": styles,
    ...Object.fromEntries(dataSheets),
  });
}
