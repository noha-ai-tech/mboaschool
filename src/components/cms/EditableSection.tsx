"use client";

import type { ReactNode } from "react";
import { Pencil, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";

// Wrapper d'édition réutilisable — n'affecte jamais le rendu public : la
// fiche publique (src/app/ecole/[id]/page.tsx) ne l'importe jamais, seul
// l'éditeur CMS l'utilise autour des mêmes composants de rendu.
export function EditableSection({
  label,
  visible,
  canHide = true,
  canMove = true,
  isFirst = false,
  isLast = false,
  onEdit,
  onToggleVisibility,
  onMoveUp,
  onMoveDown,
  children,
}: {
  label: string;
  visible: boolean;
  canHide?: boolean;
  canMove?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onEdit?: () => void;
  onToggleVisibility?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="relative rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-3 shadow-[var(--school-admin-shadow-sm)] sm:p-4" aria-label={`Section ${label}`}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">{label}</span>
          {!visible && <SchoolAdminStatusBadge label="Masquée dans la fiche publique" tone="neutral" />}
        </div>
        <div className="flex items-center gap-1">
          <SchoolAdminButton
            variant="ghost"
            size="sm"
            leadingIcon={<Pencil size={13} aria-hidden="true" />}
            onClick={onEdit}
            disabled={!onEdit}
            aria-label={`Modifier ${label}`}
          >
            Modifier
          </SchoolAdminButton>
          {canHide && (
            <SchoolAdminButton
              variant="ghost"
              size="sm"
              leadingIcon={visible ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
              onClick={onToggleVisibility}
              aria-label={visible ? `Masquer ${label}` : `Afficher ${label}`}
            >
              {visible ? "Masquer" : "Afficher"}
            </SchoolAdminButton>
          )}
          {canMove && (
            <div className="flex items-center gap-0.5 ml-1 border-l border-border pl-1">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                aria-label={`Monter la section ${label}`}
                className="w-10 h-10 flex items-center justify-center rounded-md text-text-secondary hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                aria-label={`Descendre la section ${label}`}
                className="w-10 h-10 flex items-center justify-center rounded-md text-text-secondary hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={visible ? "" : "opacity-40 grayscale-[40%] pointer-events-none select-none"} aria-hidden={!visible}>
        {children}
      </div>
    </section>
  );
}
