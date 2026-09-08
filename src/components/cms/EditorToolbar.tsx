"use client";

import Link from "next/link";
import { Eye, RotateCcw, UploadCloud } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminStatusBadge, type SchoolAdminStatusTone } from "@/components/school-admin/ui/Badge";

export type DraftStatus = "loading" | "loaded" | "dirty" | "saving" | "saved" | "publishing" | "published" | "discarding" | "discarded" | "conflict" | "error";

const STATUS: Record<DraftStatus, { label: string; tone: SchoolAdminStatusTone }> = {
  loading: { label: "Chargement du brouillon…", tone: "neutral" }, loaded: { label: "Brouillon à jour", tone: "neutral" },
  dirty: { label: "Brouillon enregistré — non publié", tone: "warning" }, saving: { label: "Enregistrement…", tone: "info" },
  saved: { label: "Brouillon enregistré", tone: "success" }, publishing: { label: "Publication…", tone: "info" },
  published: { label: "Version publiée", tone: "success" }, discarding: { label: "Abandon des modifications…", tone: "info" },
  discarded: { label: "Modifications abandonnées", tone: "neutral" }, conflict: { label: "Conflit de version — rechargement requis", tone: "danger" },
  error: { label: "Erreur d’enregistrement", tone: "danger" },
};

export function EditorToolbar({ schoolName, hasUnsavedChanges = false, onReset, draftStatus, onReloadDraft, canPublish = false, onPublish, canDiscard = false, onDiscard, previewHref = "/dashboard/ecole/etablissement/preview" }: {
  schoolName: string; hasUnsavedChanges?: boolean; onReset?: () => void; draftStatus?: DraftStatus; onReloadDraft?: () => void;
  canPublish?: boolean; onPublish?: () => void; canDiscard?: boolean; onDiscard?: () => void; previewHref?: string;
}) {
  const busy = draftStatus === "saving" || draftStatus === "publishing" || draftStatus === "discarding";
  const status = draftStatus ? STATUS[draftStatus] : { label: hasUnsavedChanges ? "Modifications locales" : "Brouillon local", tone: hasUnsavedChanges ? "warning" as const : "neutral" as const };
  function discard() { if (onDiscard && window.confirm("Abandonner toutes les modifications non publiées ?\nLa page publique restera inchangée.")) onDiscard(); }

  return (
    <div className="sticky top-0 z-40 border-b border-[var(--school-admin-border)] bg-[var(--school-admin-surface)]/95 shadow-[var(--school-admin-shadow-sm)] backdrop-blur">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-3 px-[18px] py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-extrabold text-[var(--school-admin-text)]">Éditeur de la fiche</p><SchoolAdminStatusBadge label={status.label} tone={status.tone} /></div>
          <p className="mt-1 truncate text-xs text-[var(--school-admin-text-muted)]">{schoolName} · les changements du brouillon restent privés jusqu’à publication.</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {draftStatus === "conflict" && onReloadDraft ? <button type="button" onClick={onReloadDraft} className="text-xs font-bold text-[var(--school-admin-danger)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Recharger la version distante</button> : null}
            {hasUnsavedChanges && onReset ? <button type="button" onClick={onReset} className="text-xs font-semibold text-[var(--school-admin-text-muted)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">Réinitialiser l’ordre des sections</button> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {onDiscard ? <SchoolAdminButton variant="ghost" size="sm" leadingIcon={<RotateCcw size={15} aria-hidden="true" />} disabled={!canDiscard || busy} onClick={discard}>Abandonner</SchoolAdminButton> : null}
          <Link href={previewHref} className="contents"><SchoolAdminButton variant="outline" size="sm" leadingIcon={<Eye size={15} aria-hidden="true" />} disabled={busy}>Aperçu privé</SchoolAdminButton></Link>
          <SchoolAdminButton className="col-span-2" size="sm" leadingIcon={<UploadCloud size={15} aria-hidden="true" />} loading={draftStatus === "publishing"} disabled={!canPublish || busy} onClick={onPublish}>Publier</SchoolAdminButton>
        </div>
      </div>
    </div>
  );
}
