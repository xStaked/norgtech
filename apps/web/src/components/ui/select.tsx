"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  /** Segunda línea de la opción: "46 ítems · Guatemala". */
  meta?: string;
  /** Adorno a la derecha (moneda, contador). Siempre antes del chevron. */
  badge?: React.ReactNode;
  /** Cuadrito de color a la izquierda. */
  dot?: string;
  /** Avatar de iniciales a la izquierda. Excluyente con `dot`. */
  avatar?: { initials: string; color: string };
  /** Encabezado bajo el que se agrupa la opción. */
  group?: string;
  disabled?: boolean;
}

/** Por debajo de esto la búsqueda estorba; por encima es obligatoria. */
const SEARCH_THRESHOLD = 8;

// sm/md/lg = 32/36/40px, como Input y Button. El resto de la app todavía usa
// controles de 32px, así que el defecto es `sm`; cuando Input suba a 36 el
// defecto pasa a `md`.
const TRIGGER_SIZE = {
  sm: "h-8 text-[12.5px]",
  md: "h-9 text-[13px]",
  lg: "h-10 text-[13.5px]",
} as const;

export interface SelectProps {
  options: readonly SelectOption[];
  /** Controlado. Para no controlado usa `defaultValue`. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Identifica el campo al enviar el formulario (input oculto). */
  name?: string;
  id?: string;
  placeholder?: string;
  /** Texto de ayuda bajo el control. `error` lo reemplaza, no se apilan. */
  hint?: string;
  error?: string;
  size?: keyof typeof TRIGGER_SIZE;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  /** Por defecto se activa sola a partir de 8 opciones. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Acciones ("+ Crear lista"): van en el pie fijo, nunca entre las opciones. */
  footer?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

interface OptionGroup {
  value: string;
  items: SelectOption[];
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  placeholder = "Seleccionar…",
  hint,
  error,
  size = "sm",
  disabled = false,
  loading = false,
  required = false,
  searchable,
  searchPlaceholder = "Buscar…",
  emptyMessage = "Sin coincidencias",
  footer,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: SelectProps) {
  const byValue = React.useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );

  // Solo se agrupa si alguna opción lo pide; si no, lista plana.
  const groups = React.useMemo<OptionGroup[] | null>(() => {
    if (!options.some((option) => option.group)) return null;
    const byGroup = new Map<string, SelectOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(option);
      else byGroup.set(key, [option]);
    }
    return Array.from(byGroup, ([label, items]) => ({ value: label, items }));
  }, [options]);

  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  const control = (
    <Combobox.Root<SelectOption | null>
      items={groups ?? options}
      name={name}
      required={required}
      disabled={disabled || loading}
      value={value === undefined ? undefined : (byValue.get(value) ?? null)}
      defaultValue={defaultValue === undefined ? undefined : (byValue.get(defaultValue) ?? null)}
      onValueChange={(option) => onValueChange?.(option?.value ?? "")}
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      itemToStringLabel={(option) => option?.label ?? ""}
      itemToStringValue={(option) => option?.value ?? ""}
    >
      <Combobox.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        data-testid={testId}
        // El input que viaja en el formulario está oculto: sin esto no hay forma
        // de apuntar al control por nombre de campo desde los tests.
        data-name={name}
        className={cn(
          "group/trigger flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-input bg-transparent px-2.5 text-left transition-colors outline-none dark:bg-input/30",
          "hover:not-data-disabled:border-[#c7d3df] hover:not-data-disabled:bg-muted/60",
          "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/10",
          "data-[popup-open]:border-primary data-[popup-open]:ring-3 data-[popup-open]:ring-primary/10",
          "data-disabled:cursor-not-allowed data-disabled:bg-muted data-disabled:text-muted-foreground data-disabled:opacity-70",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/10",
          TRIGGER_SIZE[size],
          className,
        )}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="size-[13px] shrink-0 animate-spin rounded-full border-2 border-input border-t-primary"
          />
        ) : null}
        <Combobox.Value>
          {(selected: SelectOption | null) =>
            selected ? (
              <>
                <OptionAdornment option={selected} />
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                  {selected.label}
                </span>
                {selected.badge}
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {loading ? "Cargando…" : placeholder}
              </span>
            )
          }
        </Combobox.Value>
        <Combobox.Icon className="flex shrink-0 items-center">
          {/* El chevron gira, no cambia: es la única señal de apertura. */}
          <ChevronDownIcon className="size-[15px] text-muted-foreground transition-transform group-data-[popup-open]/trigger:rotate-180" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={5} className="z-50">
          <Combobox.Popup className="w-(--anchor-width) min-w-44 origin-(--transform-origin) overflow-hidden rounded-[10px] border border-input bg-popover text-popover-foreground shadow-[0_12px_32px_rgba(12,44,68,.16)]">
            {showSearch ? (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <Combobox.Input
                  placeholder={searchPlaceholder}
                  className="w-full min-w-0 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            ) : null}

            {/* Debe seguir montado siempre (lo anuncia el lector de pantalla):
                el padding va dentro, para que en vacío no ocupe alto. */}
            <Combobox.Empty className="text-center">
              <div className="px-4 py-6">
                <div className="text-[12.5px] font-bold text-foreground">{emptyMessage}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Prueba con otro término.
                </div>
              </div>
            </Combobox.Empty>

            <Combobox.List className="max-h-60 overflow-y-auto">
              {groups
                ? (group: OptionGroup) => (
                    <Combobox.Group key={group.value} items={group.items}>
                      {/* Las opciones sin `group` (el placeholder, "Todos…")
                          van sueltas arriba, sin encabezado en blanco. */}
                      {group.value ? (
                        <Combobox.GroupLabel className="bg-muted px-3 pt-2 pb-1 text-[9.5px] font-extrabold tracking-[.07em] text-muted-foreground uppercase">
                          {group.value}
                        </Combobox.GroupLabel>
                      ) : null}
                      <Combobox.Collection>
                        {(option: SelectOption) => <Item key={option.value} option={option} />}
                      </Combobox.Collection>
                    </Combobox.Group>
                  )
                : (option: SelectOption) => <Item key={option.value} option={option} />}
            </Combobox.List>

            {footer ? (
              <div className="border-t border-border bg-muted px-3 py-2 text-[11.5px] font-bold text-primary">
                {footer}
              </div>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );

  // El error reemplaza a la ayuda: nunca los dos apilados bajo el control.
  const caption = error ?? hint;
  if (!caption) return control;
  return (
    <div className="grid gap-1">
      {control}
      <span className={cn("text-[10.5px]", error ? "text-destructive" : "text-muted-foreground")}>
        {caption}
      </span>
    </div>
  );
}

function OptionAdornment({ option }: { option: SelectOption }) {
  if (option.avatar) {
    return (
      <span
        aria-hidden="true"
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold text-white"
        style={{ backgroundColor: option.avatar.color }}
      >
        {option.avatar.initials}
      </span>
    );
  }
  if (option.dot) {
    return (
      <span
        aria-hidden="true"
        className="size-[9px] shrink-0 rounded-[2px]"
        style={{ backgroundColor: option.dot }}
      />
    );
  }
  return null;
}

function Item({ option }: { option: SelectOption }) {
  return (
    <Combobox.Item
      value={option}
      disabled={option.disabled}
      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-foreground outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-[#f2f6fa] data-selected:bg-[#eff4fb] dark:data-highlighted:bg-accent/15 dark:data-selected:bg-accent/25"
    >
      <OptionAdornment option={option} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium in-data-selected:font-bold">
          {option.label}
        </div>
        {option.meta ? (
          <div className="truncate text-[10.5px] text-muted-foreground">{option.meta}</div>
        ) : null}
      </div>
      {option.badge}
      <Combobox.ItemIndicator className="flex shrink-0 items-center">
        <CheckIcon className="size-[15px] text-primary" />
      </Combobox.ItemIndicator>
    </Combobox.Item>
  );
}
