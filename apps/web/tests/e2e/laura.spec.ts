import { expect, test } from "@playwright/test";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

async function waitForBackend(request: ReturnType<typeof test.fixtures>["request"]) {
  let backendReady = false;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await request.get("http://localhost:3001/health");
      if (response.ok()) {
        backendReady = true;
        break;
      }
    } catch {
      // Ignore boot-time failures while the API starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  expect(backendReady, "Backend health check failed").toBe(true);
}

async function getAdminToken(request: ReturnType<typeof test.fixtures>["request"]) {
  const response = await request.post("http://localhost:3001/auth/login", {
    data: {
      email: "admin@norgtech.com",
      password: "Admin123!",
    },
  });

  expect(response.ok()).toBe(true);

  const data = (await response.json()) as { accessToken?: string };
  expect(typeof data.accessToken).toBe("string");

  return data.accessToken as string;
}

test("laura page redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/laura");
  await expect(page).toHaveURL(/\/login$/);
});

test("allowed users can use Laura to confirm an edited proposal", async ({
  page,
  request,
  context,
}) => {
  await waitForBackend(request);
  const token = await getAdminToken(request);

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const sentMessages: Array<{ sessionId?: string; content: string }> = [];
  const confirmedProposals: Array<unknown> = [];

  await page.route("http://localhost:3001/laura/messages", async (route) => {
    const body = route.request().postDataJSON() as { sessionId?: string; content: string };
    sentMessages.push(body);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "proposal",
        sessionId: "session-laura-e2e",
        message: "Listo. Organicé una propuesta editable con los bloques detectados.",
        proposalId: "proposal-laura-e2e",
        proposal: {
          blocks: {
            interaction: {
              enabled: true,
              summary: "Acme confirmó interés y pidió una visita comercial.",
              rawMessage: body.content,
            },
            opportunity: {
              enabled: true,
              createNew: true,
              title: "Acme - Seguimiento visita comercial",
              stage: "contacto",
            },
            followUp: {
              enabled: true,
              title: "Programar visita comercial a Acme",
              dueAt: "2026-05-02T15:00:00.000Z",
              type: "reunion",
            },
            task: {
              enabled: true,
              title: "Enviar resumen comercial interno",
              notes: "Confirmar disponibilidad del equipo técnico.",
            },
            signals: {
              enabled: true,
              objections: ["precio"],
              risk: "medio",
              buyingIntent: "alto",
            },
          },
        },
      }),
    });
  });

  await page.route("http://localhost:3001/laura/sessions/session-laura-e2e*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "session-laura-e2e",
        ownerUserId: "admin-user-id",
        contextType: null,
        contextEntityId: null,
        messages: [
          {
            id: "message-user-1",
            role: "user",
            kind: "report",
            content: "Visité a Acme y quiere una visita comercial el viernes.",
            createdAt: "2026-05-01T10:00:00.000Z",
          },
          {
            id: "message-assistant-1",
            role: "assistant",
            kind: "proposal",
            content: "Listo. Organicé una propuesta editable con los bloques detectados.",
            payload: {
              proposalId: "proposal-laura-e2e",
              proposal: {
                blocks: {
                  interaction: {
                    enabled: true,
                    summary: "Acme confirmó interés y pidió una visita comercial.",
                    rawMessage: "Visité a Acme y quiere una visita comercial el viernes.",
                  },
                },
              },
            },
            createdAt: "2026-05-01T10:00:05.000Z",
          },
        ],
        proposals: [
          {
            id: "proposal-laura-e2e",
            status: "draft",
            payload: {
              blocks: {
                interaction: {
                  enabled: true,
                  summary: "Acme confirmó interés y pidió una visita comercial.",
                  rawMessage: "Visité a Acme y quiere una visita comercial el viernes.",
                },
                opportunity: {
                  enabled: true,
                  createNew: true,
                  title: "Acme - Seguimiento visita comercial",
                  stage: "contacto",
                },
                followUp: {
                  enabled: true,
                  title: "Programar visita comercial a Acme",
                  dueAt: "2026-05-02T15:00:00.000Z",
                  type: "reunion",
                },
                task: {
                  enabled: true,
                  title: "Enviar resumen comercial interno",
                  notes: "Confirmar disponibilidad del equipo técnico.",
                },
                signals: {
                  enabled: true,
                  objections: ["precio"],
                  risk: "medio",
                  buyingIntent: "alto",
                },
              },
            },
            createdAt: "2026-05-01T10:00:05.000Z",
            updatedAt: "2026-05-01T10:00:05.000Z",
          },
        ],
        createdAt: "2026-05-01T10:00:00.000Z",
        updatedAt: "2026-05-01T10:00:05.000Z",
      }),
    });
  });

  await page.route(
    "http://localhost:3001/laura/proposals/proposal-laura-e2e/confirm",
    async (route) => {
      const body = route.request().postDataJSON();
      confirmedProposals.push(body);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          proposalId: "proposal-laura-e2e",
          status: "confirmed",
          proposal: body.proposal,
          saved: ["interaction", "opportunity", "followUp", "signals"],
          discarded: ["task"],
          createdIds: {
            interaction: "visit-laura-1",
            opportunity: "opportunity-laura-1",
            followUp: "follow-up-laura-1",
          },
        }),
      });
    },
  );

  await page.goto("/laura");

  await expect(page.getByRole("link", { name: /Laura/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Laura" })).toBeVisible();

  await page.getByLabel("Mensaje para Laura").fill(
    "Visité a Acme y quiere una visita comercial el viernes.",
  );
  await page.getByRole("button", { name: "Enviar a Laura" }).click();

  await expect(
    page.getByText("Listo. Organicé una propuesta editable con los bloques detectados."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Propuesta de Laura" })).toBeVisible();
  await expect(page.getByLabel("Resumen de la interacción")).toHaveValue(
    "Acme confirmó interés y pidió una visita comercial.",
  );

  await page.getByLabel("Guardar bloque de tarea interna").uncheck();
  await page.getByLabel("Título de la oportunidad").fill("Acme - Visita prioritaria");
  await page.getByRole("button", { name: "Confirmar propuesta" }).click();

  await expect(page.getByText("Laura guardó 4 bloques y descartó 1.").first()).toBeVisible();

  expect(sentMessages).toEqual([
    {
      content: "Visité a Acme y quiere una visita comercial el viernes.",
    },
  ]);
  expect(confirmedProposals).toHaveLength(1);
  expect(confirmedProposals[0]).toMatchObject({
    proposal: {
      blocks: {
        task: {
          enabled: false,
        },
        opportunity: {
          title: "Acme - Visita prioritaria",
        },
      },
    },
  });
});
