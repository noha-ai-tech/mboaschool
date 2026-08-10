"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §Input
type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-9 text-[13px] px-3",
  md: "h-10 text-sm px-4",
  lg: "h-12 text-[15px] px-4",
};

export function Input({
  size = "md",
  icon,
  error,
  className = "",
  ...props
}: {
  size?: Size;
  icon?: ReactNode;
  error?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "size">) {
  return (
    <div className="relative flex items-center">
      {icon && <span className="absolute left-3.5 text-text-secondary pointer-events-none">{icon}</span>}
      <input
        className={`w-full bg-surface border rounded-[10px] outline-none transition-colors duration-fast placeholder:text-text-secondary disabled:bg-muted disabled:cursor-not-allowed ${
          error ? "border-danger focus:border-danger" : "border-border focus:border-primary"
        } ${icon ? "pl-10" : ""} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    </div>
  );
}
