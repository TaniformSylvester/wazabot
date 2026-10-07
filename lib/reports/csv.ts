/**
 * CSV for spreadsheets (Excel, Google Sheets, LibreOffice). A UTF-8 byte
 * order mark keeps accents readable in Excel; cells that a spreadsheet
 * would run as a formula (=, +, -, @) are prefixed with an apostrophe.
 */
export type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  let s = v.replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
