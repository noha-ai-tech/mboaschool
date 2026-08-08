"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";

const CATEGORIES = [
  { value: "direction", label: "Direction" },
  { value: "teacher", label: "Enseignant" },
  { value: "admin", label: "Personnel administratif" },
  { value: "support", label: "Personnel de soutien" },
];

const ROLES_BY_CATEGORY: Record<string, { value: string; label: string }[]> = {
  direction: [
    { value: "admin_principal", label: "Administrateur principal" },
    { value: "directeur", label: "Directeur" },
    { value: "proviseur", label: "Proviseur" },
    { value: "principal", label: "Principal" },
    { value: "censeur", label: "Censeur" },
  ],
  teacher: [{ value: "enseignant", label: "Enseignant" }],
  admin: [
    { value: "secretaire", label: "Secrétariat" },
    { value: "comptable", label: "Comptable" },
  ],
  support: [{ value: "assistant", label: "Assistant" }],
};

const EMPLOYMENT_TYPES = [
  { value: "temps_plein", label: "Temps plein" },
  { value: "temps_partiel", label: "Temps partiel" },
  { value: "vacataire", label: "Vacataire" },
];

export function FormulaireNouveauPersonnel() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    category: "teacher", role: "enseignant", employment_type: "temps_plein", date_entree: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function field(key: keyof typeof form, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "category") {
        next.role = ROLES_BY_CATEGORY[value]?.[0]?.value ?? "";
      }
      return next;
    });
  }

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/personnel/creer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Échec de la création");
      return;
    }
    router.push(`/pro/personnel/${body.staffMemberId}`);
  }

  return (
    <form onSubmit={submit} className="bg-white border border-[#ebebeb] rounded-2xl p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Prénom" required>
          <input required value={form.first_name} onChange={(e) => field("first_name", e.target.value)} />
        </Field>
        <Field label="Nom" required>
          <input required value={form.last_name} onChange={(e) => field("last_name", e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} placeholder="contact@monecole.cm" />
        </Field>
        <Field label="Téléphone">
          <input value={form.phone} onChange={(e) => field("phone", e.target.value)} placeholder="+237 6XX XXX XXX" />
        </Field>
        <Field label="Catégorie" required>
          <select value={form.category} onChange={(e) => field("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Fonction" required>
          <select value={form.role} onChange={(e) => field("role", e.target.value)}>
            {(ROLES_BY_CATEGORY[form.category] ?? []).map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Type de contrat">
          <select value={form.employment_type} onChange={(e) => field("employment_type", e.target.value)}>
            {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Date d'entrée">
          <input type="date" value={form.date_entree} onChange={(e) => field("date_entree", e.target.value)} />
        </Field>
      </div>

      {form.category === "teacher" && (
        <p className="text-xs text-slate-400">
          Un code de pointage à 4 chiffres sera généré automatiquement pour le kiosque de présence.
        </p>
      )}

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 bg-[#0a0a0a] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Créer la fiche
      </button>
    </form>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="[&_input]:w-full [&_input]:border [&_input]:border-[#ddd] [&_input]:rounded-xl [&_input]:px-4 [&_input]:py-2.5 [&_input]:text-sm [&_input]:bg-white [&_input]:focus:outline-none [&_input]:focus:border-[#0a0a0a] [&_input]:transition-colors [&_select]:w-full [&_select]:border [&_select]:border-[#ddd] [&_select]:rounded-xl [&_select]:px-4 [&_select]:py-2.5 [&_select]:text-sm [&_select]:bg-white [&_select]:focus:outline-none [&_select]:focus:border-[#0a0a0a] [&_select]:transition-colors">
        {children}
      </div>
    </div>
  );
}
