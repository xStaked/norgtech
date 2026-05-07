import type { DataResult } from "../types.js";
import {
  getCustomerDetails,
  getDashboardSummary,
  getOpportunityDetails,
  getOrderDetails,
  getProductDetails,
  getQuoteDetails,
  searchContacts,
  searchCustomers,
  searchFollowups,
  searchOpportunities,
  searchOrders,
  searchProducts,
  searchQuotes,
  searchSegments,
  searchVisits,
} from "../tools/nestjs-client.js";
import type { PlannedAction } from "./types.js";

type Args = Record<string, unknown>;
type CombinedReadEntry = {
  action: string;
  data: unknown;
};

function stringArg(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function booleanArg(args: Args, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function listResult(entityType: string, data: unknown): DataResult {
  const count = Array.isArray(data) ? data.length : 0;
  return {
    entityType,
    action: "list",
    data,
    summary: `${count} ${count === 1 ? "resultado" : "resultados"} para ${entityType}.`,
  };
}

function detailResult(entityType: string, data: unknown): DataResult {
  return {
    entityType,
    action: "detail",
    data,
    summary: `Detalle de ${entityType}.`,
  };
}

function unsupportedResult(action: PlannedAction): DataResult {
  return {
    entityType: action.domain,
    action: "detail",
    data: {
      error: true,
      code: "UNSUPPORTED_READ_ACTION",
      domain: action.domain,
      action: action.action,
      toolName: action.toolName,
    },
    summary: `No hay ejecutor de lectura para ${action.domain}.${action.action}.`,
  };
}

async function executeReadAction(userId: string, action: PlannedAction): Promise<DataResult> {
  const args = action.arguments;

  if (action.domain === "customers" && action.action === "search") {
    return listResult("customers", await searchCustomers(stringArg(args, "query") ?? ""));
  }
  if (action.domain === "customers" && action.action === "detail") {
    return detailResult("customers", await getCustomerDetails(stringArg(args, "customerId") ?? stringArg(args, "id") ?? ""));
  }
  if (action.domain === "opportunities" && action.action === "search") {
    return listResult("opportunities", await searchOpportunities(stringArg(args, "query") ?? ""));
  }
  if (action.domain === "opportunities" && action.action === "detail") {
    return detailResult("opportunities", await getOpportunityDetails(stringArg(args, "opportunityId") ?? stringArg(args, "id") ?? ""));
  }
  if (action.domain === "products" && action.action === "search") {
    return listResult("products", await searchProducts({
      search: stringArg(args, "query") ?? stringArg(args, "search"),
      active: booleanArg(args, "active"),
    }));
  }
  if (action.domain === "products" && action.action === "detail") {
    return detailResult("products", await getProductDetails(stringArg(args, "productId") ?? stringArg(args, "id") ?? ""));
  }
  if (action.domain === "quotes" && action.action === "search") {
    return listResult("quotes", await searchQuotes({
      customerId: stringArg(args, "customerId"),
      status: stringArg(args, "status"),
      search: stringArg(args, "query") ?? stringArg(args, "search"),
    }));
  }
  if (action.domain === "quotes" && action.action === "detail") {
    return detailResult("quotes", await getQuoteDetails(stringArg(args, "quoteId") ?? stringArg(args, "id") ?? ""));
  }
  if (action.domain === "orders" && action.action === "search") {
    return listResult("orders", await searchOrders({
      customerId: stringArg(args, "customerId"),
      status: stringArg(args, "status"),
      search: stringArg(args, "query") ?? stringArg(args, "search"),
    }));
  }
  if (action.domain === "orders" && action.action === "detail") {
    return detailResult("orders", await getOrderDetails(stringArg(args, "orderId") ?? stringArg(args, "id") ?? ""));
  }
  if (action.domain === "segments" && action.action === "search") {
    return listResult("segments", await searchSegments());
  }
  if (action.domain === "contacts" && action.action === "search") {
    return listResult("contacts", await searchContacts({
      search: stringArg(args, "query") ?? stringArg(args, "search"),
      customerId: stringArg(args, "customerId"),
    }));
  }
  if (action.domain === "visits" && action.action === "search") {
    return listResult("visits", await searchVisits({
      customerId: stringArg(args, "customerId"),
      status: stringArg(args, "status"),
      dateFrom: stringArg(args, "dateFrom") ?? stringArg(args, "from"),
      dateTo: stringArg(args, "dateTo") ?? stringArg(args, "to"),
    }));
  }
  if (action.domain === "followups" && action.action === "search") {
    return listResult("followups", await searchFollowups({
      customerId: stringArg(args, "customerId"),
      status: stringArg(args, "status"),
    }));
  }
  if (action.domain === "dashboard" && action.action === "detail") {
    return detailResult("dashboard", await getDashboardSummary(userId));
  }

  return unsupportedResult(action);
}

export async function executeReadActions(userId: string, actions: PlannedAction[]): Promise<DataResult> {
  if (actions.length === 0) {
    return {
      entityType: "none",
      action: "list",
      data: [],
      summary: "0 resultados.",
    };
  }

  const results: DataResult[] = [];

  for (const action of actions) {
    results.push(await executeReadAction(userId, action));
  }

  if (results.length === 1) {
    return results[0];
  }

  const combinedData: CombinedReadEntry[] = actions.map((action, index) => ({
    action: `${action.domain}.${action.action}`,
    data: results[index].data,
  }));
  const resultCount = results.reduce((count, result) => count + (Array.isArray(result.data) ? result.data.length : 1), 0);

  return {
    entityType: "multiple",
    action: "list",
    data: combinedData,
    summary: `${actions.length} acciones de lectura, ${resultCount} ${resultCount === 1 ? "resultado" : "resultados"} agregados.`,
  };
}
