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

export async function getPendingTasks(userId: string): Promise<Array<{ id: string; title: string; dueAt: string; type: string }>> {
  return nestjsRequest(`/laura/agents/users/${userId}/tasks?status=pendiente`);
}

export async function getScheduledVisits(userId: string): Promise<Array<{ id: string; summary: string; scheduledAt: string }>> {
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