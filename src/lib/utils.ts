import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Pure implementation of RFC-4180 CSV formatting logic with formula injection defense */
export function formatCsv(headers: string[], rows: unknown[][]): string {
  if (!headers.length && !rows.length) return "";
  const escapeCell = (v: unknown): string => {
    let s = String(v ?? "");
    // Prevent spreadsheet formula injection (=, +, -, @) for non-numeric strings
    if (/^[=+@-]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) {
      s = "'" + s;
    }
    // Escape internal quotes per RFC-4180
    return '"' + s.replace(/"/g, '""') + '"';
  };

  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n");
}
