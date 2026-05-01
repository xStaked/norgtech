import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  similarity,
  classifyMatch,
  isAmbiguous,
  bestMatch,
  type SimilarityMatch,
} from "./laura-similarity";

type CustomerRecord = {
  id: string;
  displayName: string;
  legalName: string;
  contacts: Array<{
    fullName: string;
  }>;
};

export type ResolvedCustomer =
  | { status: "resolved"; customerId: string; confidence: "high" | "medium"; label: string }
  | { status: "ambiguous"; query: string; options: Array<{ customerId: string; label: string }> }
  | { status: "unresolved" };

type LauraContextClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LauraContextResolverService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeText(text: string) {
    return text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async resolveCustomerFromText(text: string, client?: LauraContextClient): Promise<ResolvedCustomer> {
    const normalizedText = this.normalizeText(text);

    if (!normalizedText) {
      return { status: "unresolved" };
    }

    const customers = await this.listCustomers(client);
    const candidateTexts = this.candidateTexts(normalizedText);

    for (const candidateText of candidateTexts) {
      const matches: SimilarityMatch[] = customers.map((customer) => {
        const displayNameNorm = this.normalizeText(customer.displayName);
        const legalNameNorm = this.normalizeText(customer.legalName);
        const contactNames = customer.contacts.map((c) => this.normalizeText(c.fullName));

        const fieldScores = [similarity(candidateText, displayNameNorm), similarity(candidateText, legalNameNorm)];
        for (const contactName of contactNames) {
          fieldScores.push(similarity(candidateText, contactName));
        }

        const inputTokens = candidateText.split(/\s+/).filter((t) => t.length >= 4);
        const customerTokens = this.customerTokens(customer).filter((t) => t.length >= 4);
        const tokenScores = inputTokens.flatMap((inputToken) =>
          customerTokens.map((customerToken) => similarity(inputToken, customerToken)),
        );

        const allScores = [...fieldScores, ...tokenScores];
        const bestScore = Math.max(...allScores);

        return { id: customer.id, label: customer.displayName, score: bestScore };
      });

      const significantMatches = matches.filter((m) => m.score >= THRESHOLD_AMBIGUOUS);

      if (significantMatches.length === 0) {
        continue;
      }

      if (isAmbiguous(significantMatches)) {
        const top = bestMatch(significantMatches)!;
        return {
          status: "ambiguous",
          query: top.label,
          options: significantMatches.map((m) => ({ customerId: m.id, label: m.label })),
        };
      }

      const top = bestMatch(significantMatches)!;
      const classification = classifyMatch(top.score);

      if (classification === "high" || classification === "medium") {
        return {
          status: "resolved",
          customerId: top.id,
          confidence: classification,
          label: top.label,
        };
      }

      // single low-confidence match falls through to next candidate
    }

    return { status: "unresolved" };
  }

  async getCustomerOptionById(customerId: string, client?: LauraContextClient) {
    const customers = await this.listCustomers(client);
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      return null;
    }

    return {
      id: customer.id,
      label: customer.displayName,
    };
  }

  async getCustomerOptionFromOpportunity(opportunityId: string, client?: LauraContextClient) {
    const db = client ?? this.prisma;
    const opportunity = await db.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      return null;
    }

    return this.getCustomerOptionById(opportunity.customerId, db);
  }

  private async listCustomers(client?: LauraContextClient): Promise<CustomerRecord[]> {
    const db = client ?? this.prisma;

    return db.customer.findMany({
      include: {
        contacts: true,
      },
    }) as Promise<CustomerRecord[]>;
  }

  private toResolvedCustomer(customer: CustomerRecord, confidence: "high" | "medium"): ResolvedCustomer {
    return {
      status: "resolved",
      customerId: customer.id,
      confidence,
      label: customer.displayName,
    };
  }

  private toAmbiguousCustomer(customers: CustomerRecord[], query: string): ResolvedCustomer {
    return {
      status: "ambiguous",
      query,
      options: customers.map((customer) => ({
        customerId: customer.id,
        label: customer.displayName,
      })),
    };
  }

  private customerTokens(customer: CustomerRecord) {
    return Array.from(
      new Set(
        [
          ...this.normalizeText(customer.displayName).split(" "),
          ...this.normalizeText(customer.legalName).split(" "),
          ...customer.contacts.flatMap((contact) =>
            this.normalizeText(contact.fullName).split(" "),
          ),
        ].filter(Boolean),
      ),
    );
  }

  private bestQueryFromMatches(matches: SimilarityMatch[]): string {
    const top = bestMatch(matches);
    if (!top) return "cliente";
    return top.label;
  }

  private candidateTexts(normalizedText: string) {
    const focusedSegments = [" sobre ", " para ", " con "]
      .map((delimiter) => {
        const parts = normalizedText.split(delimiter);
        return parts.length > 1 ? parts[parts.length - 1]?.trim() : "";
      })
      .filter((segment) => segment.length > 0);

    return [...focusedSegments, normalizedText];
  }
}

const THRESHOLD_AMBIGUOUS = 0.70;