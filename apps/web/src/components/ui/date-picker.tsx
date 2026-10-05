"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDaysIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  addMonths,
  formatDateShort,
  formatMonthTitle,
  monthGrid,
  parseIsoDate,
  todayIso,
  weekdayShortLabels,
} from "@/lib/date-grid";

// sm/md/lg = 32/36/40px, como Select, Input y Button. El resto de la app
// todavía usa controles de 32px, así que el defecto es `sm`; cuando Input suba
// a 36 el defecto pasa a `md`.
const TRIGGER_SIZE = {
  sm: "h-8 text-[12.5px]",
  md: "h-9 text-[13px]",
  lg: "h-10 text-[13.5px]",
} as const;

export interface DatePickerProps {
  /** Controlado. ISO `YYYY-MM-DD` o "" (sin fecha). Para no controlado usa `defaultValue`. */
  value?: string;
  defaultValue?: string;
  /** Sale con el ISO elegido, "" al limpiar. La validación vive en el formulario. */
  onChange?: (value: string) => void;
  /** Identifica el campo al enviar el formulario (input oculto). */
  name?: string;
  id?: string;
  placeholder?: string;
  /** Texto de ayuda bajo el control. `error` lo reemplaza, no se apilan. */
  hint?: string;
  error?: string;
  size?: keyof typeof TRIGGER_SIZE;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  placeholder = "Seleccionar…",
  hint,
  error,
  size = "sm",
  disabled = false,
  required = false,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const current = isControlled ? (value ?? "") : internalValue;

  const [open, setOpen] = React.useState(false);
  // Mes mostrado en la grilla; se fija al abrir para que el calendario
  // siempre aparezca en el mes de la selección (o de hoy).
  const [view, setView] = React.useState<{ year: number; month: number } | null>(null);

  const selected = current ? parseIsoDate(current) : null;
  const today = todayIso();

  const commit = (iso: string) => {
    if (!isControlled) setInternalValue(iso);
    onChange?.(iso);
    setOpen(false);
  };

  const cells = React.useMemo(
    () => (view ? monthGrid(view.year, view.month) : []),
    [view],
  );

  const control = (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const anchor =
            (current ? parseIsoDate(current) : null) ?? parseIsoDate(todayIso());
          if (anchor) setView({ year: anchor.year, month: anchor.month });
        }
        setOpen(next);
      }}
    >
      {/* El input que viaja en el formulario está oculto: sin esto no hay forma
          de apuntar al control por nombre de campo desde los tests. */}
      {name ? <input type="hidden" name={name} value={current} readOnly /> : null}
      <Popover.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        data-testid={testId}
        data-name={name}
        disabled={disabled}
        // Popover.Trigger no emite `data-disabled` como Select: para que las
        // clases de estado disabled del sistema apliquen, el atributo va aquí.
        data-disabled={disabled ? "" : undefined}
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
        <CalendarDaysIcon aria-hidden="true" className="size-[13px] shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate tabular-nums",
            selected ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {selected ? formatDateShort(current) : placeholder}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-[15px] shrink-0 text-muted-foreground transition-transform group-data-[popup-open]/trigger:rotate-180"
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={5} className="z-50">
          <Popover.Popup
            aria-label="Elegir fecha"
            className="w-64 origin-(--transform-origin) rounded-[10px] border border-input bg-popover p-2 text-popover-foreground shadow-[0_12px_32px_rgba(12,44,68,.16)] outline-none"
          >
            <div className="flex items-center justify-between pb-1">
              <button
                type="button"
                aria-label="Mes anterior"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-[#f2f6fa] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-accent/15"
                onClick={() => view && setView(addMonths(view.year, view.month, -1))}
              >
                <ChevronLeftIcon className="size-[15px]" />
              </button>
              <div className="min-w-0 truncate text-[12.5px] font-bold text-foreground">
                {view ? formatMonthTitle(view.year, view.month) : ""}
              </div>
              <button
                type="button"
                aria-label="Mes siguiente"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-[#f2f6fa] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-accent/15"
                onClick={() => view && setView(addMonths(view.year, view.month, 1))}
              >
                <ChevronRightIcon className="size-[15px]" />
              </button>
            </div>

            <div className="grid grid-cols-7">
              {weekdayShortLabels().map((label) => (
                <span
                  key={label}
                  className="pb-1 text-center text-[9.5px] font-extrabold tracking-[.07em] text-muted-foreground uppercase"
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Grilla fija de 42 celdas (6 semanas): la altura no salta entre meses. */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((cell) =>
                cell.inMonth ? (
                  <button
                    key={cell.iso}
                    type="button"
                    aria-label={
                      cell.iso === today
                        ? `Hoy, ${formatDateShort(cell.iso)}${cell.iso === current ? ", seleccionada" : ""}`
                        : cell.iso === current
                          ? `${formatDateShort(cell.iso)}, seleccionada`
                          : formatDateShort(cell.iso)
                    }
                    aria-current={cell.iso === today ? "date" : undefined}
                    className={cn(
                      "flex h-7 cursor-pointer items-center justify-center rounded-md text-[12px] tabular-nums transition-colors outline-none select-none",
                      "hover:bg-[#f2f6fa] focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-accent/15",
                      cell.iso === current
                        ? "bg-primary font-bold text-primary-foreground"
                        : cn(
                            "text-foreground",
                            cell.iso === today && "font-bold text-primary",
                          ),
                    )}
                    onClick={() => commit(cell.iso)}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={cell.iso} aria-hidden="true" className="h-7" />
                ),
              )}
            </div>

            <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
              <button
                type="button"
                className="inline-flex items-center rounded-md px-1.5 py-1 text-[11.5px] font-bold text-primary transition-colors outline-none hover:bg-[#f2f6fa] focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-accent/15"
                onClick={() => commit(todayIso())}
              >
                Hoy
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-md px-1.5 py-1 text-[11.5px] font-bold text-primary transition-colors outline-none hover:bg-[#f2f6fa] focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-accent/15"
                onClick={() => commit("")}
              >
                Sin fecha
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
