"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check, ArrowLeft } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminSelect } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminAlert, SchoolAdminEmptyState } from "@/components/school-admin/ui/Feedback";

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
    if (saving) return;
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
    if (savingMatieres || matieresSaved) return;
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
        <SchoolAdminSectionCard title={`${step.prenom} ${step.nom}`} description="Profil enseignant créé. Le code ci-dessous sert uniquement au kiosque de pointage.">
          <p className="text-sm text-slate-500 mb-3">
            Communiquez ce code PIN à l&apos;enseignant pour qu&apos;il puisse s&apos;identifier au kiosque de pointage.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#f9f7f2] border border-[#e5e7eb] rounded-xl px-5 py-3 flex items-center justify-between">
              <span className="text-3xl font-black tracking-[0.3em] text-[#0a0a0a] font-mono">
                {step.code}
              </span>
              <button type="button"
                onClick={() => copyCode(step.code)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"
                aria-label={copied ? "Code copié" : "Copier le code de pointage"}
              >
                {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </SchoolAdminSectionCard>

        {/* Matières */}
        <SchoolAdminSectionCard title="Matières enseignées" description="Sélection facultative parmi les matières déjà configurées dans l’établissement.">

          {matieres.length === 0 ? (
            <SchoolAdminEmptyState title="Aucune matière disponible" description="Ajoutez d’abord les matières de l’établissement avant de créer une affectation." action={<a href={withEstablishmentQuery("/pro/matieres", establishmentId)} className="font-semibold text-[var(--school-admin-primary)] underline-offset-4 hover:underline">Gérer les matières</a>} />
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
                          className={`flex min-h-10 items-center gap-2 cursor-pointer rounded-xl px-3 py-2 border text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-[var(--school-admin-focus)] ${
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
            <SchoolAdminButton
              onClick={() => saveMatieres(step.enseignantId)}
              disabled={savingMatieres || matieresSaved}
              loading={savingMatieres}
              leadingIcon={matieresSaved ? <Check size={14} /> : <Plus size={14} />}
            >
              {matieresSaved ? "Enregistré — redirection…" : "Enregistrer et terminer"}
            </SchoolAdminButton>
            <SchoolAdminButton variant="ghost"
              onClick={() => router.push(withEstablishmentQuery("/pro/enseignants", establishmentId))}
            >
              Passer cette étape
            </SchoolAdminButton>
          </div>
          {error && (
            <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>
          )}
        </SchoolAdminSectionCard>
      </div>
    );
  }

  // Étape 1 — Formulaire
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SchoolAdminSectionCard title="Identité" description="Informations principales du profil pédagogique.">
        <div className="grid gap-5 sm:grid-cols-2">
          <SchoolAdminFormField id="teacher-first-name" label="Prénom" required><SchoolAdminInput value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} placeholder="ex. Jean-Pierre" autoComplete="given-name" /></SchoolAdminFormField>
          <SchoolAdminFormField id="teacher-last-name" label="Nom" required><SchoolAdminInput value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex. Nkolo" autoComplete="family-name" /></SchoolAdminFormField>
        </div>
        <div className="mt-5"><SchoolAdminFormField id="teacher-email" label="Email" description="L’adresse est enregistrée dans la fiche. L’envoi d’invitation de compte reste indisponible."><SchoolAdminInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ex. j.nkolo@exemple.com" autoComplete="email" /></SchoolAdminFormField></div>
      </SchoolAdminSectionCard>
      <SchoolAdminSectionCard title="Conditions d’exercice" description="Renseignez uniquement les informations contractuelles connues.">
        <div className="grid gap-5 sm:grid-cols-2">
          <SchoolAdminFormField id="teacher-hourly-rate" label="Taux horaire (FCFA)"><SchoolAdminInput type="number" min="0" value={form.taux_horaire} onChange={(e) => setForm({ ...form, taux_horaire: e.target.value })} placeholder="ex. 2500" inputMode="numeric" /></SchoolAdminFormField>
          <SchoolAdminFormField id="teacher-contract-type" label="Type de contrat"><SchoolAdminSelect value={form.type_contrat} onChange={(e) => setForm({ ...form, type_contrat: e.target.value })}>
              <option value="">— Non spécifié —</option>
              <option value="permanent">Permanent</option>
              <option value="vacataire">Vacataire</option>
              <option value="stagiaire">Stagiaire</option>
            </SchoolAdminSelect></SchoolAdminFormField>
        </div>
      </SchoolAdminSectionCard>
      {error && <SchoolAdminAlert tone="danger" title="Création impossible">{error}</SchoolAdminAlert>}
      <div className="flex flex-wrap justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => router.push(withEstablishmentQuery("/pro/enseignants", establishmentId))} leadingIcon={<ArrowLeft size={14} aria-hidden="true" />}>Retour</SchoolAdminButton><SchoolAdminButton type="submit" loading={saving} size="lg" leadingIcon={<Plus size={15} aria-hidden="true" />}>Créer l’enseignant</SchoolAdminButton></div>
    </form>
  );
}
