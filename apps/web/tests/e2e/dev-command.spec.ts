import { expect, test } from "@playwright/test";

test("el command palette abre y filtra sin romperse", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/dev-command");
  await page.getByRole("button", { name: "Abrir buscador" }).click();

  await expect(page.getByPlaceholder("Buscar…")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.getByPlaceholder("Buscar…").fill("Pedi");
  await expect(page.getByRole("option")).toHaveCount(1);

  expect(errors).toEqual([]);
});
