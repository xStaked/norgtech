import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { crmTheme, type ButtonLinkVariant } from "@/components/ui/theme";

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonLinkVariant;
  size?: "sm" | "md";
  leading?: ReactNode;
  trailing?: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
}

const variantStyles: Record<ButtonLinkVariant, CSSProperties> = {
  primary: {
    background: crmTheme.colors.primary,
    color: "#ffffff",
    border: `1px solid ${crmTheme.colors.primary}`,
    boxShadow: crmTheme.shadow.card,
  },
  secondary: {
    background: crmTheme.colors.surface,
    color: crmTheme.colors.text,
    border: `1px solid ${crmTheme.colors.borderStrong}`,
  },
  ghost: {
    background: "transparent",
    color: crmTheme.colors.primary,
    border: `1px solid ${crmTheme.colors.primarySoft}`,
  },
  danger: {
    background: "#fff4f2",
    color: crmTheme.colors.danger,
    border: "1px solid rgba(186, 58, 47, 0.2)",
  },
};

const sizeStyles = {
  sm: {
    minHeight: 38,
    padding: "9px 12px",
    fontSize: 13,
  },
  md: {
    minHeight: 44,
    padding: "11px 16px",
    fontSize: 14,
  },
} as const;

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  leading,
  trailing,
  fullWidth = false,
  style,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: crmTheme.radius.md,
        fontWeight: 700,
        lineHeight: 1,
        transition: crmTheme.motion.fast,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </Link>
  );
}
