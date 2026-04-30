import { expect, test } from "@playwright/test";

test("agenda page redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/login$/);
});

test("agenda tabs redirect unauthenticated users to login", async ({ page }) => {
  for (const view of ["hoy", "semana", "vencidos"]) {
    await page.goto(`/agenda?view=${view}`);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("follow-ups filters redirect unauthenticated users to login", async ({ page }) => {
  const filters = ["pendiente", "vencida", "completada", "dueToday", "mine"];
  for (const filter of filters) {
    await page.goto(`/follow-ups?filter=${filter}`);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("visits filters redirect unauthenticated users to login", async ({ page }) => {
  const filters = ["today", "thisWeek", "programada", "completada", "mine"];
  for (const filter of filters) {
    await page.goto(`/visits?filter=${filter}`);
    await expect(page).toHaveURL(/\/login$/);
  }
});
