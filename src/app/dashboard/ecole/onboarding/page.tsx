"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { School, Save, CheckCircle2 } from "lucide-react";

const CATEGORIES = ["garderie", "primaire", "secondaire", "superieur", "autres"];

export default function OnboardingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    city: "",
    neighborhood: "",
    phone: "",
    main_category: "",
    description: "",
  });

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expirée. Reconnectez-vous."); setSaving(false); return; }

    // Générer un slug unique
    const slug = `${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

    const { error: dbError } = await supabase.from("establishments").insert({
      owner_id: user.id,
      name: form.name,
      city: form.city,
      neighborhood: form.neighborhood || null,
      phone: form.phone || null,
      main_category: form.main_category || "autres",
      description: form.description || null,
      slug,
      subscription_plan: "free",
    });

    setSaving(false);
    if (dbError) { setError(dbError.message); return; }
    router.push("/dashboard/ecole");
  }

  return (
    <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">

        {/* Logo + intro */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0a0f0d] flex items-center justify-center mx-auto mb-5">
            <School size={22} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-[#0a0a0a] mb-2">Créer votre établissement</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Renseignez les informations de base. Vous pourrez tout modifier ensuite depuis les paramètres.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white border border-[#ebebeb] rounded-2xl p-6 space-y-4">

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Nom de l&apos;établissement <span className="text-red-400">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
              placeholder="École Primaire La Réussite"
              className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Catégorie <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={form.main_category}
                onChange={(e) => field("main_category", e.target.value)}
                className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors"
              >
                <option value="">— Choisir —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Ville <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={form.city}
                onChange={(e) => field("city", e.target.value)}
                placeholder="Yaoundé, Douala…"
                className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Quartier</label>
              <input
                value={form.neighborhood}
                onChange={(e) => field("neighborhood", e.target.value)}
                placeholder="Bastos, Bonamoussadi…"
                className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Téléphone</label>
              <input
                value={form.phone}
                onChange={(e) => field("phone", e.target.value)}
                placeholder="+237 6XX XXX XXX"
                className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              rows={3}
              placeholder="Présentation rapide de votre établissement…"
              className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-[#0a0a0a] text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Save size={15} />}
            {saving ? "Création en cours…" : "Créer l'établissement"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          Votre fiche sera visible publiquement après vérification par l&apos;équipe Écoles237.
        </p>
      </div>
    </div>
  );
}
