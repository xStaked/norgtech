"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchClient } from "@/lib/api.client";
import { AlertTriangle } from "lucide-react";

interface CreditAlert {
  customerId: string;
  displayName: string;
  creditLimit: number;
  currentBalance: number;
  utilizationPercent: number;
}

function fmt(value: number): string {
  return `$${value.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function barColor(pct: number): string {
  if (pct >= 100) return "#d92d20";
  return "#dc6803";
}

interface CreditAlertsWidgetProps {
  companyId?: string;
}

export function CreditAlertsWidget({ companyId }: CreditAlertsWidgetProps) {
  const [alerts, setAlerts] = useState<CreditAlert[] | null>(null);

  useEffect(() => {
    const query = companyId
      ? `/credit/dashboard/alerts?companyId=${companyId}`
      : "/credit/dashboard/alerts";

    apiFetchClient(query)
      .then((r) => r.json())
      .then((data) => setAlerts(Array.isArray(data) ? data : null))
      .catch(() => setAlerts(null));
  }, [companyId]);

  if (alerts === null || alerts.length === 0) return null;

  const top5 = alerts.slice(0, 5);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Alertas de credito</CardTitle>
          </div>
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {top5.map((alert) => (
            <Link
              key={alert.customerId}
              href={`/customers/${alert.customerId}`}
              className="block rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/50"
              style={{ textDecoration: "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#0c2c44" }}>
                  {alert.displayName}
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: barColor(alert.utilizationPercent),
                  }}
                >
                  {alert.utilizationPercent.toFixed(0)}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "#eef3f8",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(alert.utilizationPercent, 100)}%`,
                    borderRadius: 3,
                    background: barColor(alert.utilizationPercent),
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontSize: "0.75rem",
                  color: "#6b7787",
                }}
              >
                <span>Usado: {fmt(alert.currentBalance)}</span>
                <span>Limite: {fmt(alert.creditLimit)}</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
