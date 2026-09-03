"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { AuthHeader } from "@/components/layout/AuthHeader";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { getWeakPasswordSignInMessage } from "@/lib/auth/passwordSecurity";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [weakPasswordNotice, setWeakPasswordNotice] = useState<string | null>(
    null
  );
  const [authenticatedDestination, setAuthenticatedDestination] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const destination =
      profile?.role === "platform_admin"
        ? "/dashboard/admin"
        : "/dashboard/ecole";
    const passwordNotice = getWeakPasswordSignInMessage(data.weakPassword);

    if (passwordNotice) {
      setWeakPasswordNotice(passwordNotice);
      setAuthenticatedDestination(destination);
      setLoading(false);
      return;
    }

    router.push(destination);
  }

  return (
    <div className="min-h-screen bg-[#ECECEA] flex flex-col">
      <AuthHeader />

      <div className="flex-1 flex flex-col lg:flex-row">
        <AuthBranding />

        {/* Panel connexion — fond blanc, large surface épurée */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 lg:py-12">
          <div className="w-full max-w-[400px]">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1.5">
                Connexion
              </h1>
              <p className="text-text-secondary text-sm">
                Accédez à votre espace Écoles237.
              </p>
            </div>

            {weakPasswordNotice ? (
              <div
                role="status"
                className="mb-6 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900"
              >
                <p className="font-semibold">Mot de passe à renforcer</p>
                <p className="mt-1 leading-relaxed">{weakPasswordNotice}</p>
                <button
                  type="button"
                  onClick={() => router.push(authenticatedDestination)}
                  className="mt-4 inline-flex items-center gap-2 font-bold text-amber-950 underline underline-offset-4"
                >
                  Continuer vers mon espace <ArrowRight size={14} />
                </button>
              </div>
            ) : null}

            {error && !weakPasswordNotice && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-6">
                {error}
              </div>
            )}

            {!weakPasswordNotice ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Adresse e-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPwd ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-[52px] border border-border rounded-card px-4 pr-11 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link href="/auth/mot-de-passe-oublie" className="text-xs font-semibold text-primary hover:opacity-80 transition-opacity duration-base">
                    Mot de passe oublié ?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[52px] rounded-card bg-primary text-white font-bold text-sm hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connexion…
                    </>
                  ) : (
                    <>Se connecter <ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            ) : null}

            <div className="mt-5">
              <Link
                href="/auth/inscription"
                className="w-full h-[48px] flex items-center justify-center rounded-card border border-border text-text-primary text-sm font-semibold hover:border-text-secondary transition-colors duration-base"
              >
                Créer un compte
              </Link>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
              <ShieldCheck size={13} className="text-primary" aria-hidden="true" />
              Accès sécurisé à votre espace Écoles237.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
