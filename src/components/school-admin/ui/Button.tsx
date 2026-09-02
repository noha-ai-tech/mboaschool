"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SchoolAdminButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type SchoolAdminButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<SchoolAdminButtonVariant, string> = {
  primary:
    "border border-transparent bg-[var(--school-admin-primary)] text-white shadow-[var(--school-admin-shadow-sm)] hover:bg-[var(--school-admin-primary-strong)]",
  secondary:
    "border border-transparent bg-[var(--school-admin-primary-soft)] text-[var(--school-admin-primary-strong)] hover:bg-[var(--school-admin-primary-soft-hover)]",
  outline:
    "border border-[var(--school-admin-border-strong)] bg-[var(--school-admin-surface)] text-[var(--school-admin-text)] hover:bg-[var(--school-admin-surface-muted)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--school-admin-text-muted)] hover:bg-[var(--school-admin-surface-muted)] hover:text-[var(--school-admin-text)]",
  danger:
    "border border-transparent bg-[var(--school-admin-danger)] text-white hover:bg-[var(--school-admin-danger-strong)]",
};

const SIZE_CLASSES: Record<SchoolAdminButtonSize, string> = {
  sm: "min-h-9 gap-1.5 px-3 text-xs",
  md: "min-h-10 gap-2 px-4 text-sm",
  lg: "min-h-12 gap-2.5 px-5 text-[15px]",
};

type SchoolAdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: SchoolAdminButtonVariant;
  size?: SchoolAdminButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function SchoolAdminButton({
  variant = "primary",
  size = "md",
  loading = false,
  leadingIcon,
  trailingIcon,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: SchoolAdminButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-[var(--school-admin-radius-control)] font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2
          size={16}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        leadingIcon
      )}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}
