"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDialog } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

export function BoutonPublier({ anneeScolaire, hasBrouillon, establishmentId }: { anneeScolaire: string; hasBrouillon: boolean; establishmentId: string }) {
  const router = useRouter(); const [enCours, setEnCours] = useState(false); const [erreur, setErreur] = useState<string | null>(null); const [open, setOpen] = useState(false);
  async function publier() { if (enCours) return; setEnCours(true); setErreur(null); try { const res = await fetch("/api/timetable/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anneeScolaire, requestedEstablishmentId: establishmentId }) }); const data = await res.json(); if (!res.ok) { setErreur(data.error ?? "Échec de la publication"); return; } setOpen(false); router.refresh(); } catch { setErreur("Erreur réseau — vérifiez votre connexion"); } finally { setEnCours(false); } }
  if (!hasBrouillon) return null;
  return <><SchoolAdminButton variant="outline" onClick={() => setOpen(true)} leadingIcon={<Send size={16} aria-hidden="true" />}>Publier le brouillon</SchoolAdminButton><SchoolAdminDialog open={open} onClose={() => !enCours && setOpen(false)} closeOnBackdrop={!enCours} title="Publier ce brouillon ?" description="La publication utilisera le flux actuel et remplacera la version active selon ses règles existantes.">{erreur && <div className="mb-4"><SchoolAdminAlert tone="danger">{erreur}</SchoolAdminAlert></div>}<p className="text-sm text-[var(--school-admin-text-muted)]">Vérifiez la grille avant de confirmer cette action.</p><div className="mt-5 flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setOpen(false)} disabled={enCours}>Annuler</SchoolAdminButton><SchoolAdminButton onClick={publier} loading={enCours}>Confirmer la publication</SchoolAdminButton></div></SchoolAdminDialog></>;
}
