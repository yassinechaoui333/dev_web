// RFC 4180 parser for the agreed sales CSV: UTF-8 (optional BOM), comma
// delimiter, double-quoted fields. Structural problems throw CsvFileError so
// the whole job fails; row-level problems are reported by the validator.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDS = 100_000;
export const MAX_FIELD_BYTES = 64 * 1024;
export const MAX_FIELDS = 1000;
export const REQUIRED_HEADERS = ['InvoiceNo', 'StockCode', 'Description', 'Quantity', 'InvoiceDate', 'UnitPrice', 'CustomerID', 'Country'] as const;

export class CsvFileError extends Error {}

export type CsvRecord = { sourceRow: number; cells: string[] };

export function decodeCsv(bytes: Buffer) {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); }
  catch { throw new CsvFileError('File is not valid UTF-8 text'); }
  // PostgreSQL text/JSONB cannot store NUL; it also signals a binary file.
  if (text.includes('\u0000')) throw new CsvFileError('File contains NUL characters; upload a plain-text CSV file');
  return text;
}

function checkField(value: string, line: number) {
  // A UTF-16 code unit encodes to at most 3 UTF-8 bytes; only measure long fields.
  if (value.length * 3 > MAX_FIELD_BYTES && Buffer.byteLength(value) > MAX_FIELD_BYTES) {
    throw new CsvFileError(`Field on line ${line} exceeds 64 KiB`);
  }
}

// Returns the header plus data records. sourceRow numbers logical records with
// the header as row 1, so a quoted multiline value still occupies one row.
export function parseCsv(text: string): { headers: string[]; records: CsvRecord[] } {
  // Trailing line breaks do not create empty records. (A loop, not /[\r\n]+$/,
  // which backtracks quadratically on long runs of line breaks.)
  let end = text.length;
  while (end > 0 && (text[end - 1] === '\n' || text[end - 1] === '\r')) end--;
  const input = text.slice(0, end);
  const rows: string[][] = [];
  let cells: string[] = [], field = '', quoted = false, line = 1, recordLine = 1, i = 0;
  const endField = () => {
    checkField(field, recordLine); cells.push(field); field = ''; quoted = false;
    if (cells.length > MAX_FIELDS) throw new CsvFileError(`Line ${recordLine} has more than ${MAX_FIELDS} columns`);
  };
  const endRecord = () => {
    endField(); rows.push(cells); cells = [];
    if (rows.length - 1 > MAX_RECORDS) throw new CsvFileError(`File exceeds ${MAX_RECORDS.toLocaleString('en')} data records`);
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === '"') {
      // A quote may only open a field; anything else is malformed quoting.
      if (quoted) throw new CsvFileError(`Unexpected quote after a closed quoted field on line ${line}`);
      if (field !== '') throw new CsvFileError(`Unexpected quote inside an unquoted field on line ${line}`);
      const start = line; i++;
      for (;;) {
        if (i >= input.length) throw new CsvFileError(`Unterminated quoted field starting on line ${start}`);
        if (input[i] === '"') {
          if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++; break;
        }
        if (input[i] === '\n') line++;
        field += input[i++];
      }
      quoted = true;
    } else if (ch === ',') { endField(); i++; }
    else if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && input[i + 1] === '\n' ? 2 : 1;
      recordLine = ++line;
    } else {
      if (quoted) throw new CsvFileError(`Unexpected character after closing quote on line ${line}`);
      field += ch; i++;
    }
  }
  if (input.length) endRecord();
  if (!rows.length) throw new CsvFileError('File is empty; a header row is required');
  const headers = rows[0];
  if (headers[0]?.startsWith('\uFEFF')) headers[0] = headers[0].slice(1);
  checkHeaders(headers);
  return { headers, records: rows.slice(1).map((cells, index) => ({ sourceRow: index + 2, cells })) };
}

function checkHeaders(headers: string[]) {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const h of headers) (seen.has(h) ? duplicates : seen).add(h);
  if (duplicates.size) throw new CsvFileError('Duplicate column headers: ' + [...duplicates].map(h => h || '(blank)').join(', '));
  const missing = REQUIRED_HEADERS.filter(h => !seen.has(h));
  if (missing.length) throw new CsvFileError('Missing required column headers: ' + missing.join(', ') + '. Headers are case-sensitive.');
}
