"use client";

// CMS-F.6 — cette page écrivait auparavant DIRECTEMENT dans school_images
// depuis le client (INSERT sans jamais fixer `status`, donc toujours
// status='live' par défaut de colonne), en contournant entièrement
// /api/school-page/gallery et le modèle brouillon/publication. Ce n'était
// pas un problème avant CMS-F.6 (aucune notion de brouillon Galerie
// n'existait) — c'en devient un maintenant : un upload ici publierait une
// photo immédiatement, sans jamais passer par l'étape brouillon, cassant
// silencieusement l'invariant central de ce sprint (§1 audit).
//
// Plutôt que maintenir deux gestionnaires de galerie concurrents (celui-ci
// et le tiroir Galerie de l'éditeur CMS, /dashboard/ecole/etablissement,
// qui lui est désormais conscient du brouillon), cette page redirige vers
// l'éditeur — un seul gestionnaire de galerie, jamais un second chemin
// d'écriture non gardé. Le lien de navigation "Galerie" (src/app/dashboard/
// ecole/layout.tsx) et la carte de raccourci (centre-documentaire/page.tsx)
// pointent tous deux ici ; aucun des deux n'a été modifié — cette
// redirection les garde fonctionnels sans dupliquer la logique.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GaleriePageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/ecole/etablissement");
  }, [router]);

  return (
    <div className="max-w-3xl space-y-4 animate-pulse">
      <div className="h-8 bg-white rounded-xl w-1/3" />
      <div className="h-64 bg-white border border-border rounded-card" />
    </div>
  );
}
