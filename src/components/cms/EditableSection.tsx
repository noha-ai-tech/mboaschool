"use client";

import type { ReactNode } from "react";
import { Pencil, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

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
    <div className="relative">
      <div className="flex items-center justify-between gap-2 mb-2 px-1 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">{label}</span>
          {!visible && <Badge variant="neutral">Masquée</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil size={13} />}
            onClick={onEdit}
            disabled={!onEdit}
            aria-label={`Modifier ${label}`}
          >
            Modifier
          </Button>
          {canHide && (
            <Button
              variant="ghost"
              size="sm"
              icon={visible ? <EyeOff size={13} /> : <Eye size={13} />}
              onClick={onToggleVisibility}
              aria-label={visible ? `Masquer ${label}` : `Afficher ${label}`}
            >
              {visible ? "Masquer" : "Afficher"}
            </Button>
          )}
          {canMove && (
            <div className="flex items-center gap-0.5 ml-1 border-l border-border pl-1">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                aria-label={`Monter la section ${label}`}
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                aria-label={`Descendre la section ${label}`}
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
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
    </div>
  );
}
