import type { ElementType } from "react";

export function ContactRow({ icon: Icon, label, value, href }: {
  icon: ElementType;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-text-secondary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-sm font-semibold text-text-primary truncate">{value}</p>
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
