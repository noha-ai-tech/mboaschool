"use client";

// Page Contact (nav publique, Landing V8). Aucune coordonnée réelle
// (email/téléphone/adresse) n'existe aujourd'hui dans le produit ni dans les
// variables d'environnement — même constat que le footer ("Coordonnées à
// venir"). Plutôt qu'un formulaire ou des coordonnées inventées, la page le
// dit clairement et redirige vers les vrais parcours déjà existants.
import Link from "next/link";
import { Clock, Search, Building2 } from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <SiteHeaderSpacer />

      <div className="max-w-[640px] mx-auto px-[18px] py-14 lg:py-20">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-3">Contact</p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-text-primary mb-5">
          Nous contacter
        </h1>

        <div className="bg-surface border border-border rounded-card p-6 flex items-start gap-4 mb-8">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Clock size={18} className="text-text-secondary" />
          </div>
          <div>
            <p className="font-bold text-text-primary mb-1">Coordonnées à venir</p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Un canal de contact direct (email, téléphone) n&apos;est pas encore disponible sur
              Écoles237. En attendant, voici les parcours déjà en place selon votre besoin.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/recherche" className="group bg-surface border border-border rounded-card p-5 hover:border-primary transition-colors duration-base">
            <Search size={18} className="text-primary mb-3" />
            <p className="font-bold text-text-primary text-sm mb-1">Vous cherchez une école</p>
            <p className="text-xs text-text-secondary">Parcourez l&apos;annuaire ou préinscrivez votre enfant directement.</p>
          </Link>
          <Link href="/revendiquer" className="group bg-surface border border-border rounded-card p-5 hover:border-primary transition-colors duration-base">
            <Building2 size={18} className="text-primary mb-3" />
            <p className="font-bold text-text-primary text-sm mb-1">Vous gérez un établissement</p>
            <p className="text-xs text-text-secondary">Revendiquez votre fiche ou inscrivez votre établissement.</p>
          </Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
