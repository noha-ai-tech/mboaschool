"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Copy, Check, ArrowLeft } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";

type Matiere = { id: string; nom: string; departement_disciplinaire: string; couleur: string };

type Step =
  | { kind: "form" }
  | { kind: "success"; enseignantId: string; nom: string; prenom: string; code: string };

export function FormulaireNouvelEnseignant({ matieres, establishmentId }: { matieres: Matiere[]; establishmentId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "form" });

  // Étape 1 — formulaire de base
  const [form, setForm] = useState({
    nom: "", prenom: "", email: "", taux_horaire: "", type_contrat: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape 2 — matières sélectionnées
  const [selectedMatieres, setSelectedMatieres] = useState<Set<string>>(new Set());
  const [savingMatieres, setSavingMatieres] = useState(false);
  const [matieresSaved, setMatieresSaved] = useState(false);

  // Copier le code
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/enseignants/creer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: form.nom,
          prenom: form.prenom,
          email: form.email || undefined,
          taux_horaire: form.taux_horaire ? Number(form.taux_horaire) : undefined,
          type_contrat: form.type_contrat || undefined,
          requestedEstablishmentId: establishmentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur inattendue"); return; }
      setStep({
        kind: "success",
        enseignantId: data.enseignant.id,
        nom: data.enseignant.nom,
        prenom: data.enseignant.prenom,
        code: data.enseignant.code_pointage,
      });
    } catch {
      setError("Erreur réseau — réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMatieres(enseignantId: string) {
    setError(null);
    setSavingMatieres(true);
    try {
      const response = await fetch(`/api/enseignants/${enseignantId}/matieres`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedEstablishmentId: establishmentId,
          matiereIds: Array.from(selectedMatieres),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Impossible d'enregistrer les matières.");
        return;
      }
      setMatieresSaved(true);
      setTimeout(() => router.push(withEstablishmentQuery("/pro/enseignants", establishmentId)), 1200);
    } catch {
      setError("Erreur réseau — réessaie.");
    } finally {
      setSavingMatieres(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function toggleMatiere(id: string) {
    setSelectedMatieres((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Grouper les matières par département
  const parDept = new Map<string, Matiere[]>();
  for (const m of matieres) {
    const list = parDept.get(m.departement_disciplinaire) ?? [];
    list.push(m);
    parDept.set(m.departement_disciplinaire, list);
  }

  if (step.kind === "success") {
    return (
      <div className="max-w-2xl space-y-5">
        {/* Code pointage */}
        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">
            Enseignant créé
          </p>
          <h2 className="text-xl font-black text-[#0a0a0a] mb-4">
            {step.prenom} {step.nom}
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            Communiquez ce code PIN à l&apos;enseignant pour qu&apos;il puisse s&apos;identifier au kiosque de pointage.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#f9f7f2] border border-[#e5e7eb] rounded-xl px-5 py-3 flex items-center justify-between">
              <span className="text-3xl font-black tracking-[0.3em] text-[#0a0a0a] font-mono">
                {step.code}
              </span>
              <button
                onClick={() => copyCode(step.code)}
                className="text-slate-400 hover:text-emerald-600 transition-colors"
                title="Copier"
              >
                {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Matières */}
        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
          <h3 className="text-sm font-bold text-[#0a0a0a] mb-1">
            Matières enseignées <span className="text-slate-400 font-normal">(optionnel)</span>
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Cochez les matières que cet enseignant peut enseigner.
          </p>

          {matieres.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              Aucune matière définie — ajoutez-en d&apos;abord depuis{" "}
              <a href={withEstablishmentQuery("/pro/matieres", establishmentId)} className="text-emerald-700 underline">
                /pro/matieres
              </a>
            </p>
          ) : (
            <div className="space-y-4">
              {Array.from(parDept.entries()).map(([dept, ms]) => (
                <div key={dept}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{dept}</p>
                  <div className="flex flex-wrap gap-2">
                    {ms.map((m) => {
                      const checked = selectedMatieres.has(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 border text-sm font-medium transition-colors ${
                            checked
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                              : "bg-white border-[#ddd] text-slate-600 hover:border-slate-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleMatiere(m.id)}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: m.couleur }}
                          />
                          {m.nom}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => saveMatieres(step.enseignantId)}
              disabled={savingMatieres || matieresSaved}
              className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {savingMatieres ? (
                <Loader2 size={14} className="animate-spin" />
              ) : matieresSaved ? (
                <Check size={14} />
              ) : (
                <Plus size={14} />
              )}
              {matieresSaved ? "Enregistré — redirection…" : "Enregistrer et terminer"}
            </button>
            <button
              onClick={() => router.push(withEstablishmentQuery("/pro/enseignants", establishmentId))}
              className="text-sm text-slate-400 hover:text-slate-700 transition-colors"
            >
              Passer cette étape →
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Étape 1 — Formulaire
  const INPUT = "w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors";
  const LABEL = "block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Prénom *</label>
            <input
              required
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              placeholder="ex. Jean-Pierre"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Nom *</label>
            <input
              required
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="ex. Nkolo"
              className={INPUT}
            />
          </div>
        </div>

        <div>
          <label className={LABEL}>Email <span className="normal-case font-normal text-slate-300">(pour invitation de compte)</span></label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="ex. j.nkolo@exemple.com"
            className={INPUT}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Taux horaire (FCFA)</label>
            <input
              type="number"
              min="0"
              value={form.taux_horaire}
              onChange={(e) => setForm({ ...form, taux_horaire: e.target.value })}
              placeholder="ex. 2500"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Type de contrat</label>
            <select
              value={form.type_contrat}
              onChange={(e) => setForm({ ...form, type_contrat: e.target.value })}
              className={INPUT}
            >
              <option value="">— Non spécifié —</option>
              <option value="permanent">Permanent</option>
              <option value="vacataire">Vacataire</option>
              <option value="stagiaire">Stagiaire</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Création…" : "Créer l'enseignant"}
          </button>
          <a
            href={withEstablishmentQuery("/pro/enseignants", establishmentId)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Retour
          </a>
        </div>
      </div>
    </form>
  );
}
