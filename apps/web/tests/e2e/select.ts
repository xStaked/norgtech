import { expect, type Locator, type Page } from "@playwright/test";

/**
 * El <select> nativo se reemplazo por el Select de `components/ui/select`, que
 * es un botón + popup: `selectOption()` de Playwright ya no aplica. Esto abre
 * el menú y elige la opción como lo haría una persona.
 *
 * El campo se ubica por `data-name` (el input que viaja en el formulario está
 * oculto) o por `data-testid` para los selects sin nombre.
 */
export function selectByName(scope: Page | Locator, name: string): Locator {
  return scope.locator(`[data-name="${name}"]`);
}

export async function chooseOption(
  page: Page,
  trigger: Locator,
  option: { label?: string; index?: number },
): Promise<void> {
  await trigger.click();
  const list = page.getByRole("listbox");
  const item =
    option.label !== undefined
      ? list.getByRole("option", { name: option.label, exact: true })
      : list.getByRole("option").nth(option.index ?? 0);
  await expect(item).toBeVisible();
  await item.click();
  await expect(list).toBeHidden();
}
