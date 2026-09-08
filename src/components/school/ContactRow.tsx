import type { ElementType } from "react";

export function ContactRow({ icon: Icon, label, value, href, dark = false }: {
  icon: ElementType;
  label: string;
  value: string;
  href?: string;
  /** GUYSKULL-06C §22 — light text on a dark surface (the Établissement page's navy "Contact" closing panel); every other caller keeps the original light-surface styling. */
  dark?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-3">
      <Icon size={15} className={`mt-0.5 shrink-0 ${dark ? "text-white/50" : "text-text-secondary"}`} />
      <div className="min-w-0">
        <p className={`text-xs ${dark ? "text-white/50" : "text-text-secondary"}`}>{label}</p>
        <p className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-text-primary"}`}>{value}</p>
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="hover:opacity-80 transition-opacity duration-base">
      {content}
    </a>
  );
}
