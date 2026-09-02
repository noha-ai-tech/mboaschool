"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";

type Recreation = { debut: string; fin: string };

type ContraintesState = {
  jours_semaine: number[];
  heure_debut_amplitude: string;
  heure_fin_amplitude: string;
  duree_creneau_minutes: number;
  pause_active: boolean;
  pause_dejeuner_debut: string;
  pause_dejeuner_fin: string;
  recreations: Recreation[];
  max_heures_consecutives_matiere: number;
  max_heures_jour_enseignant: number;
};

const JOURS = [
  { val: 1, label: "Lun" }, { val: 2, label: "Mar" }, { val: 3, label: "Mer" },
  { val: 4, label: "Jeu" }, { val: 5, label: "Ven" }, { val: 6, label: "Sam" },
];

const INPUT = "border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors bg-white w-full";
const LABEL = "block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5";

export function FormulaireContraintes({
  contraintes,
  etablissementId,
  hasExistingCreneaux,
}: {
  contraintes: ContraintesState | null;
  etablissementId: string;
  hasExistingCreneaux: boolean;
}) {
  const defaults: ContraintesState = {
    jours_semaine: [1, 2, 3, 4, 5],
    heure_debut_amplitude: "07:30",
    heure_fin_amplitude: "17:30",
    duree_creneau_minutes: 60,
    pause_active: true,
    pause_dejeuner_debut: "12:00",
    pause_dejeuner_fin: "14:00",
    recreations: [
      { debut: "09:30", fin: "10:00" },
      { debut: "15:30", fin: "16:00" },
    ],
    max_heures_consecutives_matiere: 2,
    max_heures_jour_enseignant: 6,
  };

  const [form, setForm] = useState<ContraintesState>(contraintes ?? defaults);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleJour(val: number) {
    setForm((prev) => ({
      ...prev,
      jours_semaine: prev.jours_semaine.includes(val)
        ? prev.jours_semaine.filter((j) => j !== val)
        : [...prev.jours_semaine, val].sort(),
    }));
  }

  function addRecreation() {
    setForm((prev) => ({
      ...prev,
      recreations: [...prev.recreations, { debut: "10:00", fin: "10:30" }],
    }));
  }

  function removeRecreation(i: number) {
    setForm((prev) => ({
      ...prev,
      recreations: prev.recreations.filter((_, idx) => idx !== i),
    }));
  }

  function setRecreation(i: number, field: "debut" | "fin", value: string) {
    setForm((prev) => ({
      ...prev,
      recreations: prev.recreations.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.jours_semaine.length === 0) {
      setError("Sélectionnez au moins un jour de cours.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: dbError } = await supabase.from("contraintes_etablissement").upsert(
      {
        etablissement_id: etablissementId,
        jours_semaine: form.jours_semaine,
        heure_debut_amplitude: form.heure_debut_amplitude,
        heure_fin_amplitude: form.heure_fin_amplitude,
        duree_creneau_minutes: form.duree_creneau_minutes,
        pause_dejeuner_debut: form.pause_active ? form.pause_dejeuner_debut : null,
        pause_dejeuner_fin: form.pause_active ? form.pause_dejeuner_fin : null,
        recreations: form.recreations,
        max_heures_consecutives_matiere: form.max_heures_consecutives_matiere,
        max_heures_jour_enseignant: form.max_heures_jour_enseignant,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "etablissement_id" }
    );

    setSaving(false);
    if (dbError) { setError(dbError.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-5">
      {/* Avertissement créneaux existants */}
      {hasExistingCreneaux && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <span className="font-semibold">Des créneaux ont déjà été générés pour cet établissement.</span>{" "}
            Modifier ces réglages n&apos;affecte pas les créneaux existants.
            Contacte le support si tu dois régénérer la grille complète.
          </div>
        </div>
      )}

      {/* Jours de cours */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <h2 className="font-bold text-sm text-[#0a0a0a] mb-4">Jours de cours</h2>
        <div className="flex gap-2 flex-wrap">
          {JOURS.map((j) => {
            const active = form.jours_semaine.includes(j.val);
            return (
              <button
                key={j.val}
                type="button"
                onClick={() => toggleJour(j.val)}
                aria-pressed={active}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  active
                    ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                    : "bg-white text-slate-400 border-[#ddd] hover:border-slate-400"
                }`}
              >
                {j.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amplitude horaire */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <h2 className="font-bold text-sm text-[#0a0a0a] mb-4">Amplitude horaire</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={LABEL}>Début</label>
            <input
              type="time"
              value={form.heure_debut_amplitude}
              onChange={(e) => setForm({ ...form, heure_debut_amplitude: e.target.value })}
              required
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Fin</label>
            <input
              type="time"
              value={form.heure_fin_amplitude}
              onChange={(e) => setForm({ ...form, heure_fin_amplitude: e.target.value })}
              required
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Durée créneau (min)</label>
            <select
              value={form.duree_creneau_minutes}
              onChange={(e) => setForm({ ...form, duree_creneau_minutes: Number(e.target.value) })}
              className={INPUT}
            >
              {[30, 45, 50, 55, 60, 90, 120].map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pause déjeuner */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm text-[#0a0a0a]">Pause déjeuner</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{form.pause_active ? "Activée" : "Désactivée"}</span>
            <button
              type="button"
              onClick={() => setForm({ ...form, pause_active: !form.pause_active })}
              aria-pressed={form.pause_active}
              aria-label="Activer ou désactiver la pause déjeuner"
              className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${
                form.pause_active ? "bg-emerald-500" : "bg-slate-200"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] motion-reduce:transition-none`}
              style={{ width: 40, height: 22 }}
            >
              <div
                className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
                  form.pause_active ? "translate-x-5" : "translate-x-0.5"
                }`}
                style={{ width: 18, height: 18, top: 2 }}
              />
            </button>
          </div>
        </div>
        {form.pause_active && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Début</label>
              <input
                type="time"
                value={form.pause_dejeuner_debut}
                onChange={(e) => setForm({ ...form, pause_dejeuner_debut: e.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Fin</label>
              <input
                type="time"
                value={form.pause_dejeuner_fin}
                onChange={(e) => setForm({ ...form, pause_dejeuner_fin: e.target.value })}
                className={INPUT}
              />
            </div>
          </div>
        )}
      </div>

      {/* Récréations */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm text-[#0a0a0a]">Récréations</h2>
          <button
            type="button"
            onClick={addRecreation}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-600 transition-colors"
          >
            <Plus size={13} />
            Ajouter
          </button>
        </div>
        {form.recreations.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Aucune récréation configurée.</p>
        ) : (
          <div className="space-y-3">
            {form.recreations.map((r, i) => (
              <div key={i} className="flex items-end gap-3">
                <div className="flex-1">
                  {i === 0 && <label className={LABEL}>Début</label>}
                  <input
                    type="time"
                    value={r.debut}
                    onChange={(e) => setRecreation(i, "debut", e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div className="flex-1">
                  {i === 0 && <label className={LABEL}>Fin</label>}
                  <input
                    type="time"
                    value={r.fin}
                    onChange={(e) => setRecreation(i, "fin", e.target.value)}
                    className={INPUT}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRecreation(i)}
                  aria-label={`Supprimer la récréation ${i + 1}`}
                  className="text-slate-300 hover:text-red-500 transition-colors pb-2.5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Limites */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <h2 className="font-bold text-sm text-[#0a0a0a] mb-4">Limites horaires</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Max. heures consécutives d&apos;une même matière</label>
            <input
              type="number"
              min="1"
              max="8"
              value={form.max_heures_consecutives_matiere}
              onChange={(e) => setForm({ ...form, max_heures_consecutives_matiere: Number(e.target.value) })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Max. heures par jour par enseignant</label>
            <input
              type="number"
              min="1"
              max="12"
              value={form.max_heures_jour_enseignant}
              onChange={(e) => setForm({ ...form, max_heures_jour_enseignant: Number(e.target.value) })}
              className={INPUT}
            />
          </div>
        </div>
      </div>

      {/* Erreur + bouton */}
      {error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}
      {saved && <SchoolAdminAlert tone="success">Modifications sauvegardées.</SchoolAdminAlert>}

      <SchoolAdminButton type="submit" loading={saving} leadingIcon={saved ? <Check size={14} aria-hidden="true" /> : undefined}>Enregistrer les contraintes</SchoolAdminButton>
    </form>
  );
}
