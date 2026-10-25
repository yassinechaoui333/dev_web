import test from 'node:test';
import assert from 'node:assert/strict';
import { CsvFileError, decodeCsv, parseCsv, MAX_RECORDS } from '../src/modules/datasets/csv.js';
import { isValidTimezone, parseDecimal, parseInvoiceDate, validateRecord } from '../src/modules/datasets/normalize.js';
import { readCsvUpload } from '../src/modules/datasets/multipart.js';
const header = 'InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country';
const iso = { dateFormat: 'ISO8601', timezone: 'UTC' };

test('CSV parser handles BOM, quotes, multiline records, CRLF and trailing newlines', () => {
  const { headers, records } = parseCsv('﻿' + header + ',Extra\r\nA,"x,1","say ""hi""\nthere",1,2026-01-01T00:00:00Z,1,,UK,""\r\nB,2,d,1,2026-01-01T00:00:00Z,1,,UK,e\n\n');
  assert.equal(headers[0], 'InvoiceNo');
  assert.deepEqual(records.map(r => r.sourceRow), [2, 3]);
  assert.deepEqual(records[0].cells.slice(1, 3), ['x,1', 'say "hi"\nthere']);
  assert.equal(records[0].cells[8], '');
});

test('CSV parser fails the file for malformed structure', () => {
  const bad = (text: string, pattern: RegExp) => assert.throws(() => parseCsv(text), (e: unknown) => e instanceof CsvFileError && pattern.test(e.message));
  bad(header + '\nA,"open,1', /Unterminated/);
  bad(header + '\nA,ab"c,1', /inside an unquoted/);
  bad(header + '\nA,"ab"c,1', /after closing quote/);
  bad('InvoiceNo,StockCode\nA,B', /Missing required column headers: Description/);
  bad(header.replace('Country', 'country'), /Country/);
  bad(header + ',InvoiceNo', /Duplicate column headers: InvoiceNo/);
  bad('', /empty/);
  bad(header + '\nA,' + 'x'.repeat(64 * 1024 + 1) + ',1', /64 KiB/);
  bad(header + '\n' + 'a\n'.repeat(MAX_RECORDS) + 'a', /data records/);
  assert.throws(() => decodeCsv(Buffer.from([0x41, 0xff, 0xfe])), /UTF-8/);
  assert.throws(() => decodeCsv(Buffer.from('a,b\u0000c')), /NUL/);
  bad(header + '\n' + ','.repeat(1000), /more than 1000 columns/);
});

test('long runs of line breaks are parsed in linear time', () => {
  const started = Date.now();
  assert.throws(() => parseCsv(header + '\n' + '\n'.repeat(200_000) + 'x'), /data records/);
  assert.ok(Date.now() - started < 2000, 'took ' + (Date.now() - started) + ' ms');
});

test('only canonical IANA timezones are accepted', () => {
  for (const zone of ['UTC', 'Europe/London', 'Africa/Casablanca', 'America/New_York']) assert.equal(isValidTimezone(zone), true, zone);
  for (const zone of ['+01:00', '-05:00', 'utc', 'europe/london', 'Mars/Base', '']) assert.equal(isValidTimezone(zone), false, zone);
});

test('decimals keep up to four places, reject excess precision and non-numbers', () => {
  assert.equal(String((parseDecimal('3.5000') as { value: unknown }).value), '3.5');
  assert.equal(String((parseDecimal('-12') as { value: unknown }).value), '-12');
  assert.equal(String((parseDecimal('2.50000') as { value: unknown }).value), '2.5');
  assert.equal((parseDecimal('1.12345') as { code: string }).code, 'TOO_MANY_DECIMALS');
  for (const value of ['abc', '1,5', '.5', '5.', '1e3', '']) assert.equal((parseDecimal(value) as { code: string }).code, 'INVALID_NUMBER');
  assert.equal((parseDecimal('1' + '0'.repeat(14)) as { code: string }).code, 'OUT_OF_RANGE');
});

test('dates respect offsets, dataset timezone and reject invalid or DST-ambiguous times', () => {
  const at = (raw: string, rules = iso) => { const r = parseInvoiceDate(raw, rules); return 'value' in r ? r.value.toISOString() : r.code; };
  assert.equal(at('2026-03-03T14:00:00+01:00'), '2026-03-03T13:00:00.000Z');
  assert.equal(at('2026-03-03T14:00'), '2026-03-03T14:00:00.000Z');
  assert.equal(at('2026-03-03T14:00:00.5Z'), '2026-03-03T14:00:00.500Z');
  assert.equal(at('2026-02-30T00:00:00Z'), 'INVALID_DATE');
  assert.equal(at('2024-02-29T00:00:00Z'), '2024-02-29T00:00:00.000Z');
  assert.equal(at('2026-03-03'), 'INVALID_DATE');
  assert.equal(at('03/03/2026 14:00'), 'INVALID_DATE');
  const london = { dateFormat: 'DMY_HM', timezone: 'Europe/London' };
  assert.equal(at('15/01/2026 09:05', london), '2026-01-15T09:05:00.000Z');
  assert.equal(at('05/07/2026 09:05', london), '2026-07-05T08:05:00.000Z');
  assert.equal(at('5/7/2026 9:05', london), 'INVALID_DATE', 'contract format is zero-padded dd/MM/yyyy HH:mm');
  assert.equal(at('29/03/2026 01:30', london), 'NONEXISTENT_LOCAL_TIME');
  assert.equal(at('25/10/2026 01:30', london), 'AMBIGUOUS_LOCAL_TIME');
  assert.equal(at('31/04/2026 10:00', london), 'INVALID_DATE');
  assert.equal(at('2026-03-03T14:00:00Z', london), 'INVALID_DATE');
});

test('record validation normalizes cancellations, blank customers and reports every error', () => {
  const headers = header.split(',');
  const row = (cells: string) => validateRecord(headers, { sourceRow: 2, cells: cells.split(',') }, iso);
  const cancel = row('c500, 007 ,Mug,3,2026-01-01T00:00:00Z,1.5,  ,United Kingdom ');
  assert.equal(cancel.sale?.isCancellation, true);
  assert.equal(cancel.sale?.quantity.toString(), '-3');
  assert.equal(cancel.sale?.productCode, '007');
  assert.equal(cancel.sale?.customerId, null);
  assert.equal(cancel.sale?.country, 'United Kingdom');
  assert.equal(cancel.values.StockCode, ' 007 ', 'raw values keep the original string');
  const ret = row('INV-1,1,Mug,-2,2026-01-01T00:00:00Z,1.5,42,UK');
  assert.equal(ret.sale?.isCancellation, false);
  assert.equal(ret.sale?.quantity.toString(), '-2');
  const bad = row(',1,,x,nope,-1,42,');
  assert.equal(bad.sale, null);
  assert.deepEqual(bad.errors.map(e => e.field + ':' + e.code), ['InvoiceNo:REQUIRED', 'Description:REQUIRED', 'Country:REQUIRED', 'Quantity:INVALID_NUMBER', 'UnitPrice:NEGATIVE_PRICE', 'InvoiceDate:INVALID_DATE']);
  const short = validateRecord(headers, { sourceRow: 3, cells: ['A', 'B'] }, iso);
  assert.deepEqual(short.errors.map(e => e.code), ['COLUMN_COUNT']);
  const extra = validateRecord(headers, { sourceRow: 4, cells: [...'A,1,M,1,2026-01-01T00:00:00Z,1,,UK'.split(','), 'surplus'] }, iso);
  assert.equal(extra.values.__column_9, 'surplus');
  const proto = validateRecord([...headers, '__proto__'], { sourceRow: 6, cells: [...'A,1,M,1,2026-01-01T00:00:00Z,1,,UK'.split(','), 'kept'] }, iso);
  assert.equal(JSON.parse(JSON.stringify(proto.values)).__proto__, 'kept');
  assert.deepEqual(validateRecord(headers, { sourceRow: 5, cells: [''] }, iso).errors.map(e => e.code), ['EMPTY_ROW']);
});

test('multipart reader accepts exactly one CSV file field', () => {
  const body = (name: string, filename: string, content: string) => Buffer.from(`--b\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--b--\r\n`);
  const upload = readCsvUpload(body('file', '../../etc/sales.csv', 'a,b\r\n'), 'multipart/form-data; boundary=b');
  assert.equal(upload.filename, 'sales.csv');
  assert.equal(upload.content.toString(), 'a,b\r\n');
  assert.throws(() => readCsvUpload(body('other', 'x.csv', 'a'), 'multipart/form-data; boundary=b'), /exactly one field/);
  assert.throws(() => readCsvUpload(body('file', 'x.xlsx', 'a'), 'multipart/form-data; boundary=b'), /Only \.csv/);
  assert.throws(() => readCsvUpload(Buffer.from('a'), 'text/csv'), /multipart/);
});
