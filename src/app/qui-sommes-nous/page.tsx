"use client";

// Page "Qui sommes-nous" (nav publique, Landing V8). Contenu factuel sur ce
// que la plateforme fait réellement aujourd'hui — aucune date de création,
// aucun nom d'équipe/fondateur, aucun chiffre non vérifiable : rien de tout
// cela n'existe de façon fiable dans le produit, donc rien n'est inventé ici.
import { ShieldCheck, Search, ClipboardList, Building2 } from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

const POINTS = [
  {
    icon: Search,
    title: "Un annuaire centralisé",
    description: "Écoles237 référence des établissements scolaires camerounais — garderies, écoles primaires, secondaires, établissements supérieurs et centres de formation — dans un seul répertoire consultable en ligne.",
  },
  {
    icon: ShieldCheck,
    title: "Des établissements vérifiés par Écoles237",
    description: "Certaines fiches portent un badge « Vérifié par Écoles237 » lorsque notre équipe a confirmé certaines informations directement auprès de l'établissement — une vérification interne à la plateforme, distincte d'un agrément ministériel.",
  },
  {
    icon: ClipboardList,
    title: "La préinscription en ligne",
    description: "Les parents peuvent envoyer une demande de préinscription directement depuis la fiche d'un établissement, et suivre son statut avec un code de suivi.",
  },
  {
    icon: Building2,
    title: "Des outils pour les établissements",
    description: "Les directeurs peuvent revendiquer la fiche de leur établissement, la tenir à jour, et gérer les demandes d'admission depuis un espace dédié.",
  },
];

export default function QuiSommesNousPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <SiteHeaderSpacer />

      <div className="max-w-[900px] mx-auto px-[18px] py-14 lg:py-20">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-3">Qui sommes-nous</p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-text-primary mb-5">
          La plateforme numérique des établissements scolaires du Cameroun.
        </h1>
        <p className="text-text-secondary leading-relaxed max-w-[640px]">
          Écoles237 aide les parents à trouver un établissement scolaire au Cameroun, et aide les
          établissements à se faire connaître et à gérer leurs admissions en ligne.
        </p>

        <div className="grid sm:grid-cols-2 gap-5 mt-12">
          {POINTS.map((p) => (
            <div key={p.title} className="bg-surface border border-border rounded-card p-6">
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mb-4">
                <p.icon size={18} className="text-primary" />
              </div>
              <h2 className="font-bold text-text-primary mb-2">{p.title}</h2>
              <p className="text-sm text-text-secondary leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
