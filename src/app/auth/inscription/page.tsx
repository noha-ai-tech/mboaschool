"use client";

import Link from "next/link";
import { useState } from "react";
import { Fraunces } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import {
  getSignUpErrorMessage,
  validatePasswordPair,
} from "@/lib/auth/passwordSecurity";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";

// Typographie de marque (skill ecoles237-design-system) — Fraunces pour le
// titre éditorial, Plus Jakarta Sans (police globale du site, voir
// src/app/layout.tsx) pour tout le reste.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal"],
  variable: "--font-fraunces",
  display: "swap",
});

export default function InscriptionPage() {
  const tickerItems = useSiteTickerItems();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const passwordError = validatePasswordPair(
      form.password,
      form.confirm_password
    );
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name, phone: form.phone },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (authError) {
      setError(getSignUpErrorMessage(authError));
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className={`min-h-screen bg-[#FBF6F2] flex flex-col ${fraunces.variable}`}>
        <SiteHeader />
        <SiteHeaderSpacer />
        <AnnouncementTicker items={tickerItems} />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-sm w-full text-center">
            <div className="w-16 h-16 rounded-full bg-[#E9F5EE] flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={32} className="text-[#0B3B2E]" />
            </div>
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-[#132019] mb-2">Compte créé !</h2>
            <p className="text-[#5A695F] text-sm mb-8 leading-relaxed">
              Votre compte est prêt. Vous pouvez maintenant accéder à votre espace.
            </p>
            <Link
              href="/auth/connexion"
              className="inline-flex items-center gap-2 bg-[#F2AE1F] text-[#0B3B2E] px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#D6941A] transition-colors duration-base"
            >
              Aller à la connexion
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#FBF6F2] flex flex-col ${fraunces.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <div className="flex-1 flex">
        <AuthBranding tagline="Inscrivez votre établissement et rejoignez l'annuaire de référence au Cameroun." />

        {/* Form panel — fond crème de marque */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[#FBF6F2]">
          <div className="w-full max-w-[400px]">
            <div className="mb-8">
              <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-[#132019] mb-1.5">
                Créer un compte.
              </h1>
              <p className="text-[#5A695F] text-sm">
                Inscrivez votre établissement sur Écoles237.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Nom complet">
                <input
                  name="full_name"
                  type="text"
                  required
                  value={form.full_name}
                  onChange={handle}
                  placeholder="Jean Dupont"
                />
              </Field>

              <Field label="Téléphone">
                <input
                  name="phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={handle}
                  placeholder="+237 6XX XXX XXX"
                />
              </Field>

              <Field label="Adresse email">
                <input
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handle}
                  placeholder="votre@email.com"
                />
              </Field>

              <Field label="Mot de passe">
                <div className="relative">
                  <input
                    name="password"
                    type={showPwd ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={handle}
                    placeholder="Minimum 8 caractères"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5A695F] hover:text-[#132019]"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirmer le mot de passe">
                <input
                  name="confirm_password"
                  type="password"
                  required
                  value={form.confirm_password}
                  onChange={handle}
                  placeholder="••••••••"
                />
              </Field>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-[52px] bg-[#F2AE1F] text-[#0B3B2E] rounded-xl font-bold text-sm hover:bg-[#D6941A] hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-[#0B3B2E]/30 border-t-[#0B3B2E] rounded-full animate-spin" />
                ) : (
                  <>Créer mon compte <ArrowRight size={15} /></>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#E7E0D7] text-center">
              <p className="text-sm text-[#5A695F]">
                Déjà un compte ?{" "}
                <Link href="/auth/connexion" className="font-semibold text-[#132019] hover:text-[#12543F] transition-colors duration-base">
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#5A695F] uppercase tracking-wider mb-2">
        {label}
      </label>
      <div className="[&_input]:w-full [&_input]:h-[52px] [&_input]:border [&_input]:border-[#E7E0D7] [&_input]:rounded-xl [&_input]:px-4 [&_input]:text-sm [&_input]:bg-white [&_input]:text-[#132019] [&_input]:placeholder:text-[#5A695F]/70 [&_input]:outline-none [&_input]:focus:border-[#1F8A5D] [&_input]:transition-colors [&_input]:duration-base">
        {children}
      </div>
    </div>
  );
}
