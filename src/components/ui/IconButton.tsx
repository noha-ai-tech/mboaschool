"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §IconButton
// aria-label est obligatoire (voir docs/03_DESIGN_SYSTEM/08_ACCESSIBILITY.md).
type Variant = "default" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "text-text-secondary hover:bg-muted hover:text-text-primary",
  subtle: "bg-muted text-text-secondary hover:text-text-primary",
  danger: "text-text-secondary hover:bg-danger/10 hover:text-danger",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-11 h-11",
};

export function IconButton({
  variant = "default",
  size = "md",
  className = "",
  children,
  "aria-label": ariaLabel,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  "aria-label": string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">) {
  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-lg transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
