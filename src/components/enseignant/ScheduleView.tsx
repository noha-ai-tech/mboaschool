"use client";

import { useState } from "react";
import Link from "next/link";

// MOBILE-01 Phase 5 — bascule Aujourd'hui/Semaine, purement côté client :
// une seule requête serveur (la page parente), jamais un aller-retour
// réseau supplémentaire juste pour changer d'onglet (Phase 15 — économie
// de requêtes).

export type ScheduleEntry = {
  emploiDuTempsId: string;
  jourSemaine: number; // 1=lundi..6=samedi
  heureDebut: string;
  heureFin: string;
  matiereNom: string;
  classeNom: string;
  etablissementNom: string | null;
};

const JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function ScheduleView({ entries, todayJourSemaine }: { entries: ScheduleEntry[]; todayJourSemaine: number }) {
  const [tab, setTab] = useState<"jour" | "semaine">("jour");

  const todayEntries = entries.filter((e) => e.jourSemaine === todayJourSemaine).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const byDay = new Map<number, ScheduleEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.jourSemaine) ?? [];
    list.push(e);
    byDay.set(e.jourSemaine, list);
  }
  for (const list of Array.from(byDay.values())) list.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

  return (
    <div>
      <div className="flex gap-1 mb-5 bg-muted rounded-full p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("jour")}
          className={`h-9 px-4 rounded-full text-sm font-semibold transition-colors duration-base ${tab === "jour" ? "bg-white text-text-primary shadow-elevation-1" : "text-text-secondary"}`}
        >
          Aujourd&apos;hui
        </button>
        <button
          type="button"
          onClick={() => setTab("semaine")}
          className={`h-9 px-4 rounded-full text-sm font-semibold transition-colors duration-base ${tab === "semaine" ? "bg-white text-text-primary shadow-elevation-1" : "text-text-secondary"}`}
        >
          Semaine
        </button>
      </div>

      {tab === "jour" ? (
        todayEntries.length === 0 ? (
          <p className="text-sm text-text-secondary py-6 text-center">Aucun cours prévu aujourd&apos;hui.</p>
        ) : (
          <ScheduleList entries={todayEntries} />
        )
      ) : (
        <div className="space-y-5">
          {[1, 2, 3, 4, 5, 6].map(
            (jour) =>
              byDay.has(jour) && (
                <div key={jour}>
                  <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary mb-2">{JOURS[jour]}</p>
                  <ScheduleList entries={byDay.get(jour)!} />
                </div>
              )
          )}
          {byDay.size === 0 && <p className="text-sm text-text-secondary py-6 text-center">Aucun créneau assigné pour l&apos;instant.</p>}
        </div>
      )}
    </div>
  );
}

function ScheduleList({ entries }: { entries: ScheduleEntry[] }) {
  return (
    <div className="bg-white border border-border rounded-card divide-y divide-border overflow-hidden">
      {entries.map((e) => (
        <Link key={e.emploiDuTempsId} href={`/enseignant/cours/${e.emploiDuTempsId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors duration-base">
          <span className="font-mono text-sm font-semibold text-text-primary w-12 shrink-0">{e.heureDebut.slice(0, 5)}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary truncate">{e.matiereNom}</span>
            <span className="block text-xs text-text-secondary truncate">
              {e.classeNom}
              {e.etablissementNom ? ` · ${e.etablissementNom}` : ""}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
