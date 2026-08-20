"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

// Barre "Modifier ma page" — Publier reste désactivé tant que la sécurité
// des mutations n'a pas été validée (voir docs/03_DATA_REGISTRY, CMS-A/A.1).
export function EditorToolbar({
  schoolName,
  previewMode,
  onTogglePreview,
  hasUnsavedChanges = false,
  onReset,
}: {
  schoolName: string;
  previewMode: boolean;
  onTogglePreview: () => void;
  hasUnsavedChanges?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-border">
      <div className="max-w-[1520px] mx-auto px-[18px] h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <p className="font-bold text-sm truncate">Modifier ma page</p>
          <span className="text-text-secondary text-xs hidden sm:inline truncate">· {schoolName}</span>
          {hasUnsavedChanges ? (
            <Badge variant="warning">Modifications non enregistrées</Badge>
          ) : (
            <Badge variant="neutral">Brouillon local</Badge>
          )}
          {hasUnsavedChanges && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-text-secondary hover:text-text-primary underline decoration-dotted underline-offset-2 hidden md:inline"
            >
              Annuler mes modifications
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            icon={previewMode ? <EyeOff size={14} /> : <Eye size={14} />}
            onClick={onTogglePreview}
          >
            {previewMode ? "Quitter l'aperçu" : "Aperçu"}
          </Button>
          <span className="relative group/publish">
            <Button variant="primary" size="sm" icon={<Lock size={13} />} disabled>
              Publier
            </Button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full mt-2 w-60 rounded-lg bg-[#0A0A0A] text-white text-[11px] leading-relaxed px-3 py-2 opacity-0 group-hover/publish:opacity-100 transition-opacity duration-fast z-50"
            >
              Publication disponible après activation de la sauvegarde sécurisée
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
