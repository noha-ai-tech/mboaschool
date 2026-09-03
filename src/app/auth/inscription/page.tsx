"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import {
  getSignUpErrorMessage,
  validatePasswordPair,
} from "@/lib/auth/passwordSecurity";

export default function InscriptionPage() {
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
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-black mb-2">Compte créé !</h2>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Votre compte est prêt. Vous pouvez maintenant accéder à votre espace.
          </p>
          <Link
            href="/auth/connexion"
            className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
          >
            Aller à la connexion
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f7f2] flex">

      {/* Right image panel */}
      <div className="hidden lg:flex flex-col lg:w-[48%] bg-[#0a0f0d] relative overflow-hidden order-last">
        <Image
          src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80"
          alt=""
          fill
          priority
          sizes="48vw"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f0d] via-transparent" />

        <div className="relative z-10 p-10 flex flex-col justify-between h-full">
          <div className="flex justify-end">
            <Link href="/" className="text-slate-400 text-sm hover:text-white transition-colors">← Accueil</Link>
          </div>

          <div className="mb-4">
            {[
              "Page dédiée pour votre établissement",
              "Recevez des demandes de préinscription",
              "Galerie photos et documents PDF",
              "Tableau de bord de gestion",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 mb-3">
                <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-slate-300 text-sm">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">

          <div className="lg:hidden mb-10">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
            </Link>
          </div>

          <div className="mb-8">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
            </Link>
            <div className="mt-8">
              <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a] mb-1.5">
                Créer un compte.
              </h1>
              <p className="text-slate-500 text-sm">
                Inscrivez votre établissement sur Écoles237.
              </p>
            </div>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
              className="w-full bg-[#0a0a0a] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Créer mon compte <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#ebebeb] text-center">
            <p className="text-sm text-slate-500">
              Déjà un compte ?{" "}
              <Link href="/auth/connexion" className="font-semibold text-[#0a0a0a] hover:text-emerald-700 transition-colors">
                Se connecter
              </Link>
            </p>
            <Link href="/" className="block mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors">
              ← Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {label}
      </label>
      <div className="[&_input]:w-full [&_input]:border [&_input]:border-[#ddd] [&_input]:rounded-xl [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:bg-white [&_input]:placeholder-slate-400 [&_input]:focus:outline-none [&_input]:focus:border-[#0a0a0a] [&_input]:transition-colors">
        {children}
      </div>
    </div>
  );
}
