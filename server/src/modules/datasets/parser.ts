import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
export const columns = [
  "InvoiceNo",
  "StockCode",
  "Description",
  "Quantity",
  "InvoiceDate",
  "UnitPrice",
  "CustomerID",
  "Country",
] as const;
export type Issue = { field: string; code: string; message: string };
export function parseSalesCsv(
  content: Uint8Array,
  dataset: { dateFormat: string; timezone: string },
) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  const lines: string[][] = parse(text, {
    bom: true,
    skip_empty_lines: true,
    max_record_size: 1024 * 1024,
  });
  const headers = lines.shift();
  if (
    !headers ||
    new Set(headers).size !== headers.length ||
    columns.some((c) => !headers.includes(c))
  )
    throw new Error(
      "En-têtes CSV manquants ou dupliqués. Colonnes attendues : " +
        columns.join(", "),
    );
  if (lines.length > 100000)
    throw new Error("Maximum 100 000 lignes par import");
  return lines.map((cells, index) => {
    const values = Object.fromEntries(
      headers.map((h, i) => [h, cells[i] ?? ""]),
    );
    const errors: Issue[] = [];
    const add = (field: string, message: string) =>
      errors.push({ field, code: "INVALID_VALUE", message });
    for (const [field, value] of Object.entries(values))
      if (Buffer.byteLength(value, "utf8") > 65536)
        add(field, "Champ limité à 64 Kio");
    const get = (field: string) => values[field].trim();
    for (const field of columns.filter((c) => c !== "CustomerID"))
      if (!get(field)) add(field, "Valeur obligatoire");
    function decimal(field: string, signed: boolean) {
      const value = get(field);
      if (!/^-?\d+(\.\d{1,4})?$/.test(value)) {
        add(field, "Nombre décimal attendu, maximum 4 décimales");
        return new Prisma.Decimal(0);
      }
      const d = new Prisma.Decimal(value);
      if (d.abs().gte("100000000000000") || (!signed && d.isNegative()))
        add(field, "Nombre hors limites ou prix négatif");
      return d;
    }
    let quantity = decimal("Quantity", true);
    const unitPrice = decimal("UnitPrice", false);
    const cancellation = /^c/i.test(get("InvoiceNo"));
    if (cancellation) quantity = quantity.abs().negated();
    const inputDate = get("InvoiceDate");
    const parsed =
      dataset.dateFormat === "DMY_HM"
        ? DateTime.fromFormat(inputDate, "dd/MM/yyyy HH:mm", {
            zone: dataset.timezone,
          })
        : DateTime.fromISO(inputDate, {
            zone: dataset.timezone,
            setZone: true,
          });
    if (
      !parsed.isValid ||
      !inputDate.includes(dataset.dateFormat === "DMY_HM" ? "/" : "T") ||
      parsed.getPossibleOffsets().length > 1
    )
      add("InvoiceDate", "Date invalide ou heure locale ambiguë");
    // Luxon shifts nonexistent local times; round-trip rejects those shifts.
    if (
      parsed.isValid &&
      dataset.dateFormat === "DMY_HM" &&
      parsed.toFormat("dd/MM/yyyy HH:mm") !== inputDate
    )
      add("InvoiceDate", "Heure locale inexistante");
    if (
      parsed.isValid &&
      dataset.dateFormat === "ISO8601" &&
      !/(Z|[+-]\d\d:\d\d)$/i.test(inputDate) &&
      parsed.toFormat("yyyy-MM-dd'T'HH:mm") !== inputDate.slice(0, 16)
    )
      add("InvoiceDate", "Heure locale inexistante");
    return {
      sourceRow: index + 2,
      values,
      errors,
      clean: {
        invoiceNumber: get("InvoiceNo"),
        productCode: get("StockCode"),
        description: get("Description"),
        quantity,
        invoiceDate: parsed.isValid ? parsed.toUTC().toJSDate() : new Date(0),
        unitPrice,
        customerId: get("CustomerID") || null,
        country: get("Country"),
        isCancellation: cancellation,
      },
    };
  });
}
