import { Prisma } from '@prisma/client';
import type { CsvRecord } from './csv.js';
// Converts one CSV record into a clean sales row or a list of validation
// errors, following docs/data-contract.md "Import and sales semantics".
export type ValidationError = { field: string; code: string; message: string };
export type CleanSale = {
  invoiceNumber: string; productCode: string; description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal;
  invoiceDate: Date; customerId: string | null; country: string; isCancellation: boolean;
};
export type ParsingRules = { dateFormat: string; timezone: string };

// Canonical IANA names only. Intl also accepts offsets like "+01:00" and
// lowercase aliases, which PostgreSQL interprets differently (POSIX sign).
const IANA_ZONES = new Set(Intl.supportedValuesOf('timeZone'));
export const isValidTimezone = (timezone: string) => timezone === 'UTC' || IANA_ZONES.has(timezone);

// decimal(18,4): at most 14 integer digits and 4 significant fraction digits.
// Trailing fraction zeros carry no precision, so "2.50000" is accepted.
export function parseDecimal(raw: string): { value: Prisma.Decimal } | { code: string; message: string } {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return { code: 'INVALID_NUMBER', message: 'Must be a plain decimal number such as 12 or 3.25' };
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  if (fraction.length > 4) return { code: 'TOO_MANY_DECIMALS', message: 'At most 4 decimal places are allowed' };
  if (match[2].replace(/^0+/, '').length > 14) return { code: 'OUT_OF_RANGE', message: 'Number is too large' };
  return { value: new Prisma.Decimal(match[1] + match[2] + (fraction ? '.' + fraction : '')) };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (year: number, month: number) => month === 2 ? (isLeap(year) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number };
function wallToEpoch(w: Wall) {
  const d = new Date(Date.UTC(2000, w.month - 1, w.day, w.hour, w.minute, w.second, w.ms));
  d.setUTCFullYear(w.year);
  return d.getTime();
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function wallClockAt(epoch: number, timezone: string) {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' });
    formatters.set(timezone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(epoch)).map(x => [x.type, x.value]));
  const year = p.era === 'BC' || p.era === 'B' ? 1 - Number(p.year) : Number(p.year);
  return wallToEpoch({ year, month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second), ms: epoch - Math.floor(epoch / 1000) * 1000 });
}
// Resolve a local wall time in an IANA zone. Nonexistent (DST gap) and
// ambiguous (DST overlap) local times are rejected instead of guessed.
// Results are cached: sales files repeat timestamps, and each lookup costs
// several Intl calls. The cache is bounded and keyed by zone + wall time.
const resolved = new Map<string, number | { code: string; message: string }>();
export function localToUtc(w: Wall, timezone: string): { value: Date } | { code: string; message: string } {
  const target = wallToEpoch(w);
  if (timezone === 'UTC') return { value: new Date(target) };
  const key = timezone + ' ' + target;
  let result = resolved.get(key);
  if (result === undefined) {
    result = resolveLocal(target, timezone);
    if (resolved.size >= 100_000) resolved.clear();
    resolved.set(key, result);
  }
  return typeof result === 'number' ? { value: new Date(result) } : result;
}
function resolveLocal(target: number, timezone: string) {
  const day = 86_400_000, candidates = new Set<number>();
  for (const probe of [target - day, target, target + day]) {
    const offset = wallClockAt(probe, timezone) - probe;
    const utc = target - offset;
    if (wallClockAt(utc, timezone) === target) candidates.add(utc);
  }
  if (candidates.size === 0) return { code: 'NONEXISTENT_LOCAL_TIME', message: `This local time does not exist in ${timezone} (daylight-saving change)` };
  if (candidates.size > 1) return { code: 'AMBIGUOUS_LOCAL_TIME', message: `This local time occurs twice in ${timezone} (daylight-saving change); add an explicit UTC offset` };
  return [...candidates][0];
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i;
const DMY_HM = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
export function parseInvoiceDate(raw: string, rules: ParsingRules): { value: Date } | { code: string; message: string } {
  const iso = rules.dateFormat === 'ISO8601';
  const m = (iso ? ISO : DMY_HM).exec(raw);
  const expected = iso ? 'ISO 8601, e.g. 2026-03-02T09:15:00Z' : 'dd/MM/yyyy HH:mm, e.g. 02/03/2026 09:15';
  if (!m) return { code: 'INVALID_DATE', message: 'Expected ' + expected };
  const w: Wall = iso
    ? { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +(m[6] ?? 0), ms: +(m[7] ?? '0').padEnd(3, '0') }
    : { year: +m[3], month: +m[2], day: +m[1], hour: +m[4], minute: +m[5], second: 0, ms: 0 };
  if (w.year < 1 || w.month < 1 || w.month > 12 || w.day < 1 || w.day > daysInMonth(w.year, w.month) || w.hour > 23 || w.minute > 59 || w.second > 59) {
    return { code: 'INVALID_DATE', message: 'Not a real calendar date or time' };
  }
  const offset = iso ? m[8] : undefined;
  if (!offset) return localToUtc(w, rules.timezone);
  if (offset.toUpperCase() === 'Z') return { value: new Date(wallToEpoch(w)) };
  const [oh, om] = offset.slice(1).split(':').map(Number);
  if (oh > 14 || om > 59 || oh * 60 + om > 14 * 60) return { code: 'INVALID_DATE', message: 'UTC offset is out of range' };
  const sign = offset[0] === '-' ? -1 : 1;
  return { value: new Date(wallToEpoch(w) - sign * (oh * 60 + om) * 60_000) };
}

export function validateRecord(headers: string[], record: CsvRecord, rules: ParsingRules) {
  // Raw values keep original strings under their original column names.
  // Object.fromEntries defines own keys, so a column named "__proto__" is kept.
  const values: Record<string, string> = Object.fromEntries(record.cells.map((cell, index) => [index < headers.length ? headers[index] : `__column_${index + 1}`, cell]));
  const errors: ValidationError[] = [];
  if (record.cells.length === 1 && record.cells[0] === '' && headers.length > 1) {
    return { values, errors: [{ field: 'row', code: 'EMPTY_ROW', message: 'Row is empty' }], sale: null };
  }
  if (record.cells.length !== headers.length) {
    errors.push({ field: 'row', code: 'COLUMN_COUNT', message: `Expected ${headers.length} columns but found ${record.cells.length}` });
    return { values, errors, sale: null };
  }
  const text = (field: string) => {
    const value = values[field].trim();
    if (!value) errors.push({ field, code: 'REQUIRED', message: `${field} is required` });
    return value;
  };
  const invoiceNumber = text('InvoiceNo'), productCode = text('StockCode'), description = text('Description'), country = text('Country');
  const quantityRaw = text('Quantity'), priceRaw = text('UnitPrice'), dateRaw = text('InvoiceDate');
  let quantity: Prisma.Decimal | undefined, unitPrice: Prisma.Decimal | undefined, invoiceDate: Date | undefined;
  if (quantityRaw) {
    const parsed = parseDecimal(quantityRaw);
    if ('value' in parsed) quantity = parsed.value; else errors.push({ field: 'Quantity', ...parsed });
  }
  if (priceRaw) {
    const parsed = parseDecimal(priceRaw);
    if (!('value' in parsed)) errors.push({ field: 'UnitPrice', ...parsed });
    else if (parsed.value.isNegative() && !parsed.value.isZero()) errors.push({ field: 'UnitPrice', code: 'NEGATIVE_PRICE', message: 'Unit price cannot be negative' });
    else unitPrice = parsed.value.abs();
  }
  if (dateRaw) {
    const parsed = parseInvoiceDate(dateRaw, rules);
    if ('value' in parsed) invoiceDate = parsed.value; else errors.push({ field: 'InvoiceDate', ...parsed });
  }
  if (errors.length || !quantity || !unitPrice || !invoiceDate) return { values, errors, sale: null };
  // Cancellations (invoice starting with C) are stored as negative quantities.
  const isCancellation = /^c/i.test(invoiceNumber);
  const sale: CleanSale = {
    invoiceNumber, productCode, description, country, unitPrice, invoiceDate, isCancellation,
    quantity: isCancellation ? quantity.abs().neg() : quantity,
    customerId: values.CustomerID.trim() || null,
  };
  return { values, errors, sale };
}
