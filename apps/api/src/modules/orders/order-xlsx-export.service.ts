import { Injectable, NotFoundException } from "@nestjs/common";
import { Order, OrderItem } from "@prisma/client";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

type OrderForExport = Order & { items: OrderItem[] };

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedData: Buffer;
  uncompressedData: Buffer;
}

const TEMPLATE_FILE = "FORMATO PEDIDO CLIENTES2111 (1).xlsx";
const SHEET_PATH = "xl/worksheets/sheet1.xml";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

@Injectable()
export class OrderXlsxExportService {
  readonly contentType = XLSX_CONTENT_TYPE;

  async generate(order: OrderForExport) {
    const template = await this.loadTemplate();
    const entries = this.readZipEntries(template);
    const sheet = entries.get(SHEET_PATH);
    if (!sheet) {
      throw new NotFoundException("Order XLSX template sheet not found");
    }

    const updatedSheetXml = this.applyOrderToSheet(
      sheet.uncompressedData.toString("utf8"),
      order,
    );
    sheet.uncompressedData = Buffer.from(updatedSheetXml, "utf8");
    sheet.compressedData = deflateRawSync(sheet.uncompressedData);
    sheet.compressionMethod = 8;

    return this.writeZip([...entries.values()]);
  }

  private async loadTemplate() {
    const candidates = [
      join(process.cwd(), TEMPLATE_FILE),
      join(process.cwd(), "..", "..", TEMPLATE_FILE),
      join(process.cwd(), "..", TEMPLATE_FILE),
    ];

    for (const candidate of candidates) {
      try {
        return await fs.readFile(candidate);
      } catch {
        // Try the next runtime cwd candidate.
      }
    }

    throw new NotFoundException("Order XLSX template not found");
  }

  private applyOrderToSheet(sheetXml: string, order: OrderForExport) {
    let xml = sheetXml;
    const firstSevenItems = order.items.slice(0, 7);

    const values: Record<string, string | number | null | undefined> = {
      C5: order.purchaseOrderNumber,
      E5: order.customerNameSnapshot,
      J5: order.customerNitSnapshot,
      L5: this.formatDate(order.orderDate),
      E6: order.dispatchAddressSnapshot,
      C7: order.requesterName,
      I7: order.requesterEmail,
      C8: order.requesterRole,
      J8: order.requesterPhone,
      H17: order.approvedQuoteConsecutive,
      L17: this.formatCurrencyNumber(order.total),
      B20: order.deliveryInstructions,
      J19: order.receiverName,
      J20: order.receiverEmail,
      J21: order.receiverPhone,
      J22: order.receiverRole,
      J23: order.invoiceFilingPlace,
      J25: order.approvalStatus,
      J26: order.approvalReason,
      J27: order.approvalName,
      L26: this.formatDate(order.reviewDate),
      B28: order.preparedByName,
      F28: order.zone,
      J28: order.preparedByRole,
    };

    for (const [cell, value] of Object.entries(values)) {
      xml = this.setInlineStringCell(xml, cell, this.stringify(value));
    }

    firstSevenItems.forEach((item, index) => {
      const row = 10 + index;
      xml = this.setInlineStringCell(xml, `B${row}`, item.productSnapshotName);
      xml = this.setInlineStringCell(xml, `F${row}`, item.presentationSnapshot ?? "");
      xml = this.setNumberCell(xml, `I${row}`, this.formatCurrencyNumber(item.quantity));
      xml = this.setNumberCell(xml, `J${row}`, this.formatCurrencyNumber(item.unitPrice));
      xml = this.setNumberCell(xml, `K${row}`, this.formatCurrencyNumber(item.taxAmount));
      xml = this.setNumberCell(xml, `L${row}`, this.formatCurrencyNumber(item.totalWithTax));
    });

    return xml;
  }

  private setInlineStringCell(xml: string, cellRef: string, value: string) {
    return this.replaceCell(xml, cellRef, ` t="inlineStr"`, `<is><t>${this.escapeXml(value)}</t></is>`);
  }

  private setNumberCell(xml: string, cellRef: string, value: number) {
    return this.replaceCell(xml, cellRef, "", `<v>${value}</v>`);
  }

  private replaceCell(xml: string, cellRef: string, typeAttribute: string, content: string) {
    const cellPattern = new RegExp(`<c r="${cellRef}"([^>]*)>.*?</c>`);
    const match = xml.match(cellPattern);
    const style = match?.[1]?.match(/\ss="[^"]+"/)?.[0] ?? "";
    const replacement = `<c r="${cellRef}"${style}${typeAttribute}>${content}</c>`;

    if (match) {
      return xml.replace(cellPattern, replacement);
    }

    const rowNumber = Number(cellRef.match(/\d+/)?.[0]);
    const rowPattern = new RegExp(`(<row[^>]* r="${rowNumber}"[^>]*>)`);
    return xml.replace(rowPattern, `$1${replacement}`);
  }

  private stringify(value: string | number | Date | null | undefined) {
    if (value == null) return "";
    if (value instanceof Date) return this.formatDate(value);
    return String(value);
  }

  private formatDate(value: Date | string | null) {
    if (!value) return "";
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return value.slice(0, 10);
  }

  private formatCurrencyNumber(value: unknown) {
    if (value == null) return 0;
    return Number(value);
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private readZipEntries(buffer: Buffer) {
    const entries = new Map<string, ZipEntry>();
    const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (endOffset === -1) {
      throw new NotFoundException("Invalid XLSX template");
    }

    const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
    const totalEntries = buffer.readUInt16LE(endOffset + 10);
    let offset = centralDirectoryOffset;

    for (let index = 0; index < totalEntries; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) {
        throw new NotFoundException("Invalid XLSX central directory");
      }

      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const name = buffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString("utf8");

      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
      const uncompressedData =
        compressionMethod === 0 ? Buffer.from(compressedData) : inflateRawSync(compressedData);

      entries.set(name, {
        name,
        compressionMethod,
        compressedData: Buffer.from(compressedData),
        uncompressedData,
      });

      offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
  }

  private writeZip(entries: ZipEntry[]) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
      const name = Buffer.from(entry.name, "utf8");
      const compressedData =
        entry.compressionMethod === 0 ? entry.uncompressedData : deflateRawSync(entry.uncompressedData);
      const crc = crc32(entry.uncompressedData);
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(entry.compressionMethod, 8);
      localHeader.writeUInt32LE(0, 10);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressedData.length, 18);
      localHeader.writeUInt32LE(entry.uncompressedData.length, 22);
      localHeader.writeUInt16LE(name.length, 26);
      localHeader.writeUInt16LE(0, 28);

      localParts.push(localHeader, name, compressedData);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(entry.compressionMethod, 10);
      centralHeader.writeUInt32LE(0, 12);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(compressedData.length, 20);
      centralHeader.writeUInt32LE(entry.uncompressedData.length, 24);
      centralHeader.writeUInt16LE(name.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);

      centralParts.push(centralHeader, name);
      offset += localHeader.length + name.length + compressedData.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const localFiles = Buffer.concat(localParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(localFiles.length, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([localFiles, centralDirectory, end]);
  }
}

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});
