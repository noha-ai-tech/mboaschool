"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Pause, Play } from "lucide-react";

export type TickerItem = { id: string; label: string; href: string };

// Bande d'annonces — défilement continu, chaque annonce est un vrai lien.
// Composant autonome : masqué si aucune annonce réelle n'est fournie.
export function AnnouncementTicker({ items }: { items: TickerItem[] }) {
  const [paused, setPaused] = useState(false);
  // L'animation ne démarre qu'une fois montée côté client : si la classe
  // d'animation était déjà présente dans le HTML rendu par le serveur, le
  // navigateur commence à décompter le cycle de 48s dès le parsing du DOM,
  // souvent plusieurs secondes avant que l'utilisateur ne voie réellement la
  // page (chargement du hero, polices, images). Résultat : au premier
  // affichage perçu, le texte est déjà "coupé" en plein milieu de son
  // défilement. Démarrer l'animation seulement après le montage garantit
  // qu'elle reparte toujours de zéro au moment où le bandeau devient visible.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-[#0A0A0A] min-h-[64px] px-5 py-3 overflow-hidden">
      <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white pr-4 border-r border-white/20">
        <Megaphone size={14} aria-hidden="true" />
        À la une
      </span>
      <div className="flex-1 min-w-0 overflow-hidden whitespace-nowrap">
        <div className={`flex w-max ${mounted && !paused ? "animate-marquee-soft motion-reduce:animate-none" : ""}`}>
          {[0, 1].map((rep) => (
            <span key={rep} className="flex items-center gap-6 pr-6 shrink-0" aria-hidden={rep === 1}>
              {items.map((item) => (
                <span key={item.id} className="flex items-center gap-6">
                  <Link
                    href={item.href}
                    className="text-[13px] font-medium text-white/90 hover:text-white transition-colors duration-base"
                  >
                    {item.label}
                  </Link>
                  {/* Séparateur affiché après CHAQUE item, y compris le
                      dernier de chaque répétition : à la jonction entre les
                      deux blocs dupliqués (le point de bouclage -50%), le
                      texte ne doit jamais sembler s'enchaîner sans espace. */}
                  <span className="text-white/30">·</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => setPaused((v) => !v)}
        aria-label={paused ? "Reprendre le défilement" : "Mettre en pause le défilement"}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors duration-base"
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </div>
  );
}
