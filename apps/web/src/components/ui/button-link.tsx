import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonLinkVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonLinkVariant;
  size?: "sm" | "md";
  leading?: ReactNode;
  trailing?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  style?: CSSProperties;
}

const variantClasses: Record<ButtonLinkVariant, string> = {
  primary: "bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80",
  ghost: "bg-transparent text-primary border-primary/20 hover:bg-primary/5",
  danger: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20",
};

const sizeClasses = {
  sm: "min-h-[38px] px-3 py-2 text-[13px]",
  md: "min-h-11 px-4 py-2.5 text-sm",
} as const;

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  leading,
  trailing,
  fullWidth = false,
  className,
  style,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-bold leading-none transition-colors",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && "w-full",
        className
      )}
      style={style}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </Link>
  );
}
