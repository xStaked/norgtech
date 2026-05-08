import { config } from "../config/index.js";

class NestJSError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`NestJS API error (${status}): ${message}`);
    this.name = "NestJSError";
  }
}

async function nestjsRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.nestjsBaseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (config.nestjsServiceToken) {
    headers["Authorization"] = `Bearer ${config.nestjsServiceToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new NestJSError(response.status, body || response.statusText);
  }

  return response.json() as Promise<T>;
}

export async function searchCustomers(query: string): Promise<Array<{ id: string; label: string }>> {
  return nestjsRequest(`/laura/agents/customers?search=${encodeURIComponent(query)}`);
}

export async function searchOpportunities(query: string): Promise<Array<{ id: string; label: string }>> {
  return nestjsRequest(`/laura/agents/opportunities?search=${encodeURIComponent(query)}`);
}

export async function getCustomerDetails(customerId: string): Promise<Record<string, unknown>> {
  return nestjsRequest(`/laura/agents/customers/${customerId}`);
}

export async function getOpportunityDetails(opportunityId: string): Promise<Record<string, unknown>> {
  return nestjsRequest(`/laura/agents/opportunities/${opportunityId}`);
}

export async function getPendingTasks(userId: string): Promise<Array<{
  id: string;
  title: string;
  dueAt: string;
  type: string;
  customer: {
    id: string;
    displayName: string;
    contacts: Array<{
      id: string;
      fullName: string;
      roleTitle: string | null;
      isPrimary: boolean;
    }>;
  } | null;
  opportunity: { id: string; title: string } | null;
}>> {
  return nestjsRequest(`/laura/agents/users/${userId}/tasks?status=pendiente`);
}

export async function getScheduledVisits(userId: string): Promise<Array<{
  id: string;
  summary: string;
  scheduledAt: string;
  customer: {
    id: string;
    displayName: string;
    contacts: Array<{
      id: string;
      fullName: string;
      roleTitle: string | null;
      isPrimary: boolean;
    }>;
  } | null;
  opportunity: { id: string; title: string } | null;
}>> {
  return nestjsRequest(`/laura/agents/users/${userId}/visits?status=programada`);
}

export async function createInteraction(data: {
  customerId: string;
  summary: string;
  rawMessage: string;
  opportunityId?: string;
  occurredAt?: string;
  nextStep?: string;
  signals?: Record<string, unknown>;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/interactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function upsertOpportunity(data: {
  customerId: string;
  title: string;
  stage: string;
  opportunityId?: string;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/opportunities", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createFollowUp(data: {
  customerId: string;
  title: string;
  dueAt: string;
  type: string;
  opportunityId?: string;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/followups", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createTask(data: {
  customerId: string;
  title: string;
  dueAt?: string;
  type?: string;
  opportunityId?: string;
  notes?: string;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Read operations
export async function searchProducts(params: { search?: string; active?: boolean }) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.active !== undefined) query.set("active", String(params.active));
  return nestjsRequest<any[]>(`/laura/agents/products?${query.toString()}`);
}

export async function getProductDetails(id: string) {
  return nestjsRequest<any>(`/laura/agents/products/${id}`);
}

export async function searchQuotes(params: { customerId?: string; status?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return nestjsRequest<any[]>(`/laura/agents/quotes?${query.toString()}`);
}

export async function getQuoteDetails(id: string) {
  return nestjsRequest<any>(`/laura/agents/quotes/${id}`);
}

export async function searchOrders(params: { customerId?: string; status?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return nestjsRequest<any[]>(`/laura/agents/orders?${query.toString()}`);
}

export async function getOrderDetails(id: string) {
  return nestjsRequest<any>(`/laura/agents/orders/${id}`);
}

export async function searchSegments() {
  return nestjsRequest<any[]>("/laura/agents/segments");
}

export async function searchContacts(params: { search?: string; customerId?: string }) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.customerId) query.set("customerId", params.customerId);
  return nestjsRequest<any[]>(`/laura/agents/contacts?${query.toString()}`);
}

export async function searchVisits(params: { customerId?: string; status?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  return nestjsRequest<any[]>(`/laura/agents/visits?${query.toString()}`);
}

export async function searchFollowups(params: { customerId?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  return nestjsRequest<any[]>(`/laura/agents/followups?${query.toString()}`);
}

export async function getDashboardSummary(userId?: string) {
  const query = new URLSearchParams();
  if (userId) query.set("userId", userId);
  return nestjsRequest<any>(`/laura/agents/dashboard?${query.toString()}`);
}

// Write operations
export async function createCustomer(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/customers", { method: "POST", body: JSON.stringify(data) });
}

export async function updateCustomer(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createContact(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/contacts", { method: "POST", body: JSON.stringify(data) });
}

export async function updateContact(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createQuote(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/quotes", { method: "POST", body: JSON.stringify(data) });
}

export async function updateQuoteStatus(id: string, data: { status: string }) {
  return nestjsRequest<any>(`/laura/agents/quotes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createOrder(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/orders", { method: "POST", body: JSON.stringify(data) });
}

export async function updateOrderStatus(id: string, data: { status: string; notes?: string }) {
  return nestjsRequest<any>(`/laura/agents/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createProduct(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/products", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProduct(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/products/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createSegment(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/segments", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSegment(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/segments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createVisit(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/visits", { method: "POST", body: JSON.stringify(data) });
}

export async function updateVisit(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/visits/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function updateFollowup(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/followups/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function updateOpportunity(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}
