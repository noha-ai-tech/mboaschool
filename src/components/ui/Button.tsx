"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §Button
type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90",
  secondary: "bg-surface text-text-primary border border-border hover:bg-muted",
  ghost: "bg-transparent text-text-primary hover:bg-muted",
  danger: "bg-danger text-white hover:bg-danger/90",
  link: "bg-transparent text-primary hover:underline p-0 h-auto",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-[10px] transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${variant !== "link" ? SIZE_CLASSES[size] : ""} ${className}`}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
