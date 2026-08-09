"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/branding/Logo";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    router.push(profile?.role === "platform_admin" ? "/dashboard/admin" : "/dashboard/ecole");
  }

  return (
    <div className="min-h-screen bg-[#f9f7f2] flex">

      {/* Left panel — image */}
      <div className="hidden lg:flex flex-col lg:w-[52%] bg-[#0a0f0d] relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1497486751825-1233686d5d80?auto=format&fit=crop&w=1200&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f0d] via-transparent" />

        <div className="relative z-10 p-10 flex flex-col justify-between h-full">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo variant="dark" />
          </Link>

          <div className="mb-4">
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-emerald-400 mb-4">
              Plateforme éducative · Cameroun
            </p>
            <h2 className="text-white text-4xl font-black leading-tight tracking-tight">
              L'avenir éducatif<br />de vos enfants<br />
              <span className="text-emerald-400">commence ici.</span>
            </h2>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">

          {/* Logo mobile */}
          <div className="lg:hidden mb-10">
            <Link href="/" className="flex items-center gap-2.5">
            <Logo />
          </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a] mb-1.5">
              Bon retour.
            </h1>
            <p className="text-slate-500 text-sm">
              Connectez-vous à votre espace Écoles237.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Adresse email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full border border-[#ddd] rounded-xl px-4 py-3 text-sm bg-white placeholder-slate-400 focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-[#ddd] rounded-xl px-4 py-3 text-sm bg-white placeholder-slate-400 focus:outline-none focus:border-[#0a0a0a] transition-colors pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0a0a0a] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Se connecter <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#ebebeb] text-center">
            <p className="text-sm text-slate-500">
              Pas encore de compte ?{" "}
              <Link href="/auth/inscription" className="font-semibold text-[#0a0a0a] hover:text-emerald-700 transition-colors">
                Créer un compte
              </Link>
            </p>
            <Link href="/" className="block mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors">
              ← Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
