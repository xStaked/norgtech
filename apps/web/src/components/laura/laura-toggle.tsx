"use client";

import { crmTheme } from "@/components/ui/theme";

interface LauraToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

export function LauraToggle({ checked, onChange, disabled, label }: LauraToggleProps) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 700,
        color: checked ? crmTheme.colors.text : crmTheme.colors.textMuted,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? crmTheme.laura.primary : "#d4d2e8",
          position: "relative",
          transition: "background 0.2s ease",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#ffffff",
            position: "absolute",
            top: 2,
            left: checked ? 20 : 2,
            transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </div>
      {label}
    </label>
  );
}
