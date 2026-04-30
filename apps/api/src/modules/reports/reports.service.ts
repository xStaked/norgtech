import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CalculatorsService } from "../calculators/calculators.service";

export interface ReportFilters {
  customerId?: string;
  visitId?: string;
  createdBy?: string;
}

export interface ReportPayload {
  diagnostico: {
    customerName: string;
    visitDate: string;
    summary: string;
    notes: string | null;
  };
  problemas: {
    identified: string[];
  };
  solucion: {
    description: string;
    nextSteps: string | null;
  };
  costos: ReturnType<CalculatorsService["calculateCosts"]> | null;
  roi: ReturnType<CalculatorsService["calculateROI"]> | null;
  cotizacion: {
    quoteId: string | null;
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    subtotal: number;
    total: number;
  } | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculatorsService: CalculatorsService,
  ) {}

  async generateFromVisit(visitId: string, user: AuthUser) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { customer: true, opportunity: { include: { quotes: { include: { items: true } } } } },
    });

    if (!visit) {
      throw new NotFoundException("Visit not found");
    }

    if (visit.status !== "completada") {
      throw new BadRequestException("Report can only be generated from completed visits");
    }

    if (!visit.summary) {
      throw new BadRequestException("Visit must have a summary to generate a report");
    }

    const quote = visit.opportunity?.quotes?.[0] ?? null;

    const payload: ReportPayload = {
      diagnostico: {
        customerName: visit.customer.displayName,
        visitDate: visit.completedAt?.toISOString() ?? visit.scheduledAt.toISOString(),
        summary: visit.summary,
        notes: visit.notes,
      },
      problemas: {
        identified: visit.summary ? [visit.summary] : [],
      },
      solucion: {
        description: visit.summary,
        nextSteps: visit.nextStep,
      },
      costos: quote
        ? this.calculatorsService.calculateCosts({
            unitCost: Number(quote.total) / (quote.items.length || 1),
            quantity: quote.items.length || 1,
            installationCost: 0,
            maintenanceAnnual: 0,
          })
        : null,
      roi: quote
        ? this.calculatorsService.calculateROI({
            investment: Number(quote.total),
            annualSavings: Number(quote.total) * 0.2,
          })
        : null,
      cotizacion: quote
        ? {
            quoteId: quote.id,
            items: quote.items.map((item) => ({
              name: item.productSnapshotName,
              sku: item.productSnapshotSku,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              subtotal: Number(item.subtotal),
            })),
            subtotal: Number(quote.subtotal),
            total: Number(quote.total),
          }
        : null,
    };

    const report = await this.prisma.executiveReport.create({
      data: {
        title: `Reporte Ejecutivo - ${visit.customer.displayName}`,
        customerId: visit.customerId,
        visitId: visit.id,
        payload: JSON.parse(JSON.stringify(payload)),
        createdBy: user.id,
      },
      include: { customer: true, visit: true, creator: { select: { id: true, name: true, email: true } } },
    });

    return report;
  }

  findAll(filters?: ReportFilters) {
    const where: Record<string, unknown> = {};

    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters?.visitId) {
      where.visitId = filters.visitId;
    }

    if (filters?.createdBy) {
      where.createdBy = filters.createdBy;
    }

    return this.prisma.executiveReport.findMany({
      where,
      include: {
        customer: { select: { id: true, displayName: true } },
        visit: { select: { id: true, scheduledAt: true, status: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const report = await this.prisma.executiveReport.findUnique({
      where: { id },
      include: {
        customer: true,
        visit: true,
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    return report;
  }

  async generatePdf(reportId: string): Promise<Buffer> {
    const report = await this.findOne(reportId);
    const payload = report.payload as unknown as ReportPayload;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    let y = height - 50;

    const drawText = (text: string, opts: { x?: number; y?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
      const size = opts.size ?? 12;
      const f = opts.bold ? fontBold : font;
      const color = opts.color ?? rgb(0.1, 0.1, 0.1);
      const x = opts.x ?? 50;
      page.drawText(text, { x, y: opts.y ?? y, size, font: f, color });
    };

    drawText(report.title, { size: 20, bold: true });
    y -= 28;
    drawText(`Cliente: ${report.customer.displayName}`, { size: 12 });
    y -= 18;
    drawText(`Fecha: ${new Date(report.createdAt).toLocaleDateString("es-CO")}`, { size: 12 });
    y -= 30;

    const sections: Array<{ title: string; lines: string[] }> = [];

    sections.push({
      title: "1. Diagnóstico",
      lines: [
        `Cliente: ${payload.diagnostico.customerName}`,
        `Fecha de visita: ${new Date(payload.diagnostico.visitDate).toLocaleDateString("es-CO")}`,
        `Resumen: ${payload.diagnostico.summary}`,
        payload.diagnostico.notes ? `Notas: ${payload.diagnostico.notes}` : "",
      ].filter(Boolean),
    });

    sections.push({
      title: "2. Problemas identificados",
      lines: payload.problemas.identified.length ? payload.problemas.identified : ["No se identificaron problemas específicos."],
    });

    sections.push({
      title: "3. Solución propuesta",
      lines: [
        payload.solucion.description,
        payload.solucion.nextSteps ? `Siguientes pasos: ${payload.solucion.nextSteps}` : "",
      ].filter(Boolean),
    });

    if (payload.costos) {
      sections.push({
        title: "4. Costos",
        lines: [
          `Producto: $${payload.costos.productCost.toLocaleString("es-CO")}`,
          `Instalación: $${payload.costos.installationCost.toLocaleString("es-CO")}`,
          `Mantenimiento anual: $${payload.costos.maintenanceAnnual.toLocaleString("es-CO")}`,
          `Total primer año: $${payload.costos.firstYearTotal.toLocaleString("es-CO")}`,
        ],
      });
    }

    if (payload.roi) {
      sections.push({
        title: "5. ROI",
        lines: [
          `Inversión: $${payload.roi.investment.toLocaleString("es-CO")}`,
          `Ahorro anual: $${payload.roi.annualSavings.toLocaleString("es-CO")}`,
          `Beneficio total anual: $${payload.roi.totalAnnualBenefit.toLocaleString("es-CO")}`,
          `ROI: ${payload.roi.roiPercentage}%`,
          `Periodo de recuperación: ${payload.roi.paybackPeriod} años`,
        ],
      });
    }

    if (payload.cotizacion) {
      sections.push({
        title: "6. Cotización",
        lines: [
          `Subtotal: $${payload.cotizacion.subtotal.toLocaleString("es-CO")}`,
          `Total: $${payload.cotizacion.total.toLocaleString("es-CO")}`,
          `Items: ${payload.cotizacion.items.length}`,
        ],
      });
    }

    for (const section of sections) {
      if (y < 80) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 50;
      }
      drawText(section.title, { size: 14, bold: true, color: rgb(0.06, 0.14, 0.25) });
      y -= 20;
      for (const line of section.lines) {
        if (y < 60) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 50;
        }
        drawText(line, { size: 11 });
        y -= 16;
      }
      y -= 12;
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
