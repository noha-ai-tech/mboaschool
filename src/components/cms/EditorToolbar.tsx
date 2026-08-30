"use client";

import Link from "next/link";
import { Eye, UploadCloud, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

// CMS-F.3 §17 / CMS-F.4 §19 / CMS-F.5C §10 / CMS-F.7 §11 — un seul
// indicateur d'état de brouillon cohérent, étendu (pas remplacé) à chaque
// sprint. "Publié" n'apparaît que dans l'état `published`, lui-même atteint
// uniquement après une confirmation serveur ok=true de POST
// /api/school-page/publish (jamais de façon optimiste) — c'est le seul
// endroit du CMS où ce mot peut légitimement apparaître. "Modifications
// abandonnées" (`discarded`) suit la même discipline pour
// /api/school-page/draft/discard : jamais confondu avec `published`, jamais
// affiché de façon optimiste.
export type DraftStatus =
  | "loading"
  | "loaded"
  | "dirty"
  | "saving"
  | "saved"
  | "publishing"
  | "published"
  | "discarding"
  | "discarded"
  | "conflict"
  | "error";

const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  loading: "Chargement du brouillon…",
  loaded: "Brouillon chargé",
  dirty: "Brouillon enregistré — non publié",
  saving: "Enregistrement…",
  saved: "Brouillon enregistré",
  publishing: "Publication…",
  published: "Publié",
  discarding: "Abandon des modifications…",
  discarded: "Modifications abandonnées",
  conflict: "Conflit — recharger",
  error: "Erreur d'enregistrement",
};

// Barre "Modifier ma page". CMS-F.4 — "Aperçu" navigue vers
// /dashboard/ecole/etablissement/preview (rendu partagé avec la fiche
// publique, voir SchoolPageSections) au lieu de basculer un mode d'aperçu
// local qui dupliquait sa propre logique de rendu (règle architecturale
// CMS-F.4 §1/§16 : un seul renderer). CMS-F.5C — "Publier" est désormais
// actif : le bouton lui-même reste celui-là (jamais un second bouton
// concurrent), seules ses règles d'activation changent.
export function EditorToolbar({
  schoolName,
  hasUnsavedChanges = false,
  onReset,
  draftStatus,
  onReloadDraft,
  canPublish = false,
  onPublish,
  canDiscard = false,
  onDiscard,
}: {
  schoolName: string;
  hasUnsavedChanges?: boolean;
  onReset?: () => void;
  draftStatus?: DraftStatus;
  onReloadDraft?: () => void;
  canPublish?: boolean;
  onPublish?: () => void;
  canDiscard?: boolean;
  onDiscard?: () => void;
}) {
  const publishing = draftStatus === "publishing";
  const published = draftStatus === "published";
  const discarding = draftStatus === "discarding";

  // CMS-F.7 §12 — une seule confirmation explicite, style natif déjà
  // utilisé pour toute action destructive ailleurs dans le projet (aucun
  // framework de modale n'existe ici, jamais inventé pour ce seul bouton).
  function handleDiscardClick() {
    if (!onDiscard) return;
    if (window.confirm("Abandonner toutes les modifications non publiées ?\nLa page publique restera inchangée.")) {
      onDiscard();
    }
  }

  let publishDisabledReason: string | null = null;
  if (!canPublish && !publishing && !published) {
    if (draftStatus === "loading") publishDisabledReason = "Chargement du brouillon en cours.";
    else if (draftStatus === "conflict") publishDisabledReason = "Rechargez le brouillon avant de publier.";
    else if (draftStatus === "error") publishDisabledReason = "Résolvez l'erreur d'enregistrement avant de publier.";
    else publishDisabledReason = "Aucune modification à publier — le brouillon est déjà identique à la version publiée.";
  }
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-border">
      <div className="max-w-[1520px] mx-auto px-[18px] h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <p className="font-bold text-sm truncate">Modifier ma page</p>
          <span className="text-text-secondary text-xs hidden sm:inline truncate">· {schoolName}</span>
          {draftStatus ? (
            <Badge
              variant={
                draftStatus === "error" || draftStatus === "conflict"
                  ? "warning"
                  : draftStatus === "published"
                  ? "success"
                  : "neutral"
              }
            >
              {DRAFT_STATUS_LABEL[draftStatus]}
            </Badge>
          ) : hasUnsavedChanges ? (
            <Badge variant="warning">Modifications non enregistrées</Badge>
          ) : (
            <Badge variant="neutral">Brouillon local</Badge>
          )}
          {draftStatus === "conflict" && onReloadDraft && (
            <button
              type="button"
              onClick={onReloadDraft}
              className="text-xs font-semibold text-primary hover:opacity-70 underline decoration-dotted underline-offset-2"
            >
              Recharger
            </button>
          )}
          {hasUnsavedChanges && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-text-secondary hover:text-text-primary underline decoration-dotted underline-offset-2 hidden md:inline"
            >
              Réinitialiser l&apos;ordre des sections
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onDiscard && (
            <Button
              variant="ghost"
              size="sm"
              icon={discarding ? undefined : <RotateCcw size={13} />}
              loading={discarding}
              disabled={!canDiscard || discarding || publishing}
              onClick={handleDiscardClick}
            >
              Abandonner
            </Button>
          )}
          <Link href="/dashboard/ecole/etablissement/preview">
            <Button variant="secondary" size="sm" icon={<Eye size={14} />}>
              Aperçu
            </Button>
          </Link>
          <span className="relative group/publish">
            <Button
              variant="primary"
              size="sm"
              icon={publishing ? undefined : <UploadCloud size={13} />}
              loading={publishing}
              disabled={!canPublish || publishing || discarding}
              onClick={onPublish}
            >
              {published ? "Publié" : "Publier"}
            </Button>
            {publishDisabledReason && (
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full mt-2 w-60 rounded-lg bg-[#0A0A0A] text-white text-[11px] leading-relaxed px-3 py-2 opacity-0 group-hover/publish:opacity-100 transition-opacity duration-fast z-50"
              >
                {publishDisabledReason}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
