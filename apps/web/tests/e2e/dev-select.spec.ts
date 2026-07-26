import { expect, test } from "@playwright/test";
import { chooseOption, selectByName } from "./select";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev-select");
});

test("busqueda: aparece pasadas 8 opciones y no antes", async ({ page }) => {
  await selectByName(page, "pocas").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByPlaceholder("Buscar…")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await selectByName(page, "muchas").click();
  await expect(page.getByPlaceholder("Buscar…")).toBeVisible();
});

test("filtra, elige y publica el valor en el input del formulario", async ({ page }) => {
  const trigger = selectByName(page, "muchas");
  await trigger.click();
  await page.getByPlaceholder("Buscar…").fill("Cliente C");

  const list = page.getByRole("listbox");
  await expect(list.getByRole("option")).toHaveCount(1);
  await list.getByRole("option").click();

  await expect(trigger).toContainText("Cliente C");
  await expect(page.locator('input[name="muchas"]')).toHaveValue("c2");
});

test("sin coincidencias muestra el estado vacio", async ({ page }) => {
  await selectByName(page, "muchas").click();
  await page.getByPlaceholder("Buscar…").fill("zzz");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
  await expect(page.getByText("Sin coincidencias")).toBeVisible();
});

test("agrupa por encabezado y deja sueltas las opciones sin grupo", async ({ page }) => {
  await selectByName(page, "agrupadas").click();
  const list = page.getByRole("listbox");
  await expect(list.getByText("Países", { exact: true })).toBeVisible();
  await expect(list.getByText("Segmentos", { exact: true })).toBeVisible();
  await expect(list.getByRole("option", { name: /DIRECTOS/ })).toBeVisible();
});

test("el error reemplaza a la ayuda, no se apilan", async ({ page }) => {
  await expect(page.getByText("La unidad es obligatoria")).toBeVisible();
  await expect(page.getByText("no debe verse")).toHaveCount(0);
});

test("deshabilitado y cargando no abren", async ({ page }) => {
  await expect(selectByName(page, "apagado")).toBeDisabled();
  await expect(selectByName(page, "cargando")).toBeDisabled();
  await expect(selectByName(page, "cargando")).toContainText("Cargando…");
});

test("el helper de los specs abre y elige", async ({ page }) => {
  await chooseOption(page, selectByName(page, "muchas"), { label: "Cliente D" });
  await expect(page.locator('input[name="muchas"]')).toHaveValue("c3");
});
