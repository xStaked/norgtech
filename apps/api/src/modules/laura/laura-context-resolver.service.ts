import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

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
      const exactDisplayMatches = customers.filter((customer) =>
        candidateText.includes(this.normalizeText(customer.displayName)),
      );

      if (exactDisplayMatches.length === 1) {
        return this.toResolvedCustomer(exactDisplayMatches[0], "high");
      }

      if (exactDisplayMatches.length > 1) {
        return this.toAmbiguousCustomer(exactDisplayMatches, this.bestQuery(candidateText, exactDisplayMatches));
      }

      const exactAliasMatches = customers.filter((customer) => {
        const aliases = [
          customer.legalName,
          ...customer.contacts.map((contact) => contact.fullName),
        ];

        return aliases.some((alias) => candidateText.includes(this.normalizeText(alias)));
      });

      if (exactAliasMatches.length === 1) {
        return this.toResolvedCustomer(exactAliasMatches[0], "medium");
      }

      if (exactAliasMatches.length > 1) {
        return this.toAmbiguousCustomer(exactAliasMatches, this.bestQuery(candidateText, exactAliasMatches));
      }

      const partialMatches = customers.filter((customer) =>
        this.customerTokens(customer).some((token) =>
          token.length >= 4 && candidateText.includes(token),
        ),
      );

      if (partialMatches.length === 1) {
        return this.toResolvedCustomer(partialMatches[0], "medium");
      }

      if (partialMatches.length > 1) {
        return this.toAmbiguousCustomer(partialMatches, this.bestQuery(candidateText, partialMatches));
      }
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

  private bestQuery(normalizedText: string, customers: CustomerRecord[]) {
    const matchingTokens = customers.flatMap((customer) =>
      this.customerTokens(customer).filter((token) =>
        token.length >= 4 && normalizedText.includes(token),
      ),
    );

    const preferredToken = matchingTokens.sort((a, b) => b.length - a.length)[0] ?? "cliente";
    return preferredToken.charAt(0).toUpperCase() + preferredToken.slice(1);
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
