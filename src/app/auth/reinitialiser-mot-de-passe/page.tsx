"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { Logo } from "@/components/branding/Logo";
import {
  canUsePasswordRecovery,
  getPasswordUpdateErrorMessage,
  PASSWORD_RECOVERY_STORAGE_KEY,
  validatePasswordPair,
} from "@/lib/auth/passwordSecurity";
import { supabase } from "@/lib/supabase";

type RecoveryStatus = "checking" | "ready" | "invalid" | "success";

function clearRecoveryParameters() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = "";
  cleanUrl.hash = "";
  window.history.replaceState({}, document.title, cleanUrl.pathname);
}

export default function ReinitialiserMotDePassePage() {
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let recoveryEstablished = false;

    const url = new URL(window.location.href);
    const hasAuthError =
      url.searchParams.has("error") ||
      new URLSearchParams(url.hash.slice(1)).has("error");

    if (hasAuthError) {
      sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
      clearRecoveryParameters();
      setStatus("invalid");
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const hasRecoveryMarker =
        sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === "active";

      if (
        canUsePasswordRecovery(event, Boolean(session), hasRecoveryMarker) &&
        event === "PASSWORD_RECOVERY"
      ) {
        recoveryEstablished = true;
        sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "active");
        clearRecoveryParameters();
        setStatus("ready");
        return;
      }

      if (canUsePasswordRecovery(event, Boolean(session), hasRecoveryMarker)) {
        recoveryEstablished = true;
        clearRecoveryParameters();
        setStatus("ready");
      }
    });

    const timeout = window.setTimeout(() => {
      if (!recoveryEstablished) {
        sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
        clearRecoveryParameters();
        setStatus("invalid");
      }
    }, 10_000);

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const passwordError = validatePasswordPair(password, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(getPasswordUpdateErrorMessage(updateError));
      return;
    }

    sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
    setPassword("");
    setConfirmation("");
    setStatus("success");
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AuthBranding />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-10 flex justify-center">
            <Link href="/" className="inline-flex items-center">
              <Logo size="md" priority />
            </Link>
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-elevation-2">
            <Link
              href="/auth/connexion"
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors duration-base hover:text-text-primary"
            >
              <ArrowLeft size={13} />
              Retour à la connexion
            </Link>

            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Nouveau mot de passe
            </h1>

            {status === "checking" ? (
              <p role="status" className="mt-4 text-sm text-text-secondary">
                Vérification sécurisée du lien en cours…
              </p>
            ) : null}

            {status === "invalid" ? (
              <div className="mt-5">
                <p role="alert" className="rounded-[10px] bg-red-50 p-4 text-sm text-red-800">
                  Ce lien est invalide ou a expiré. Demandez un nouveau lien de réinitialisation.
                </p>
                <Link
                  href="/auth/mot-de-passe-oublie"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  Demander un nouveau lien <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}

            {status === "success" ? (
              <div className="mt-5">
                <div role="status" className="rounded-[10px] border border-primary/20 bg-primary-light p-4 text-sm text-primary">
                  <p className="flex items-center gap-2 font-bold">
                    <CheckCircle2 size={17} />
                    Mot de passe mis à jour
                  </p>
                  <p className="mt-2 leading-relaxed">
                    Votre nouveau mot de passe est maintenant actif.
                  </p>
                </div>
                <Link
                  href="/auth/connexion"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  Continuer vers mon espace <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}

            {status === "ready" ? (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <p className="text-sm leading-relaxed text-text-secondary">
                  Choisissez un mot de passe unique d’au moins 8 caractères.
                </p>

                {error ? (
                  <div role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                  </div>
                ) : null}

                <div>
                  <label htmlFor="new-password" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-[52px] w-full rounded-card border border-border bg-white px-4 pr-11 text-sm outline-none transition-all duration-base focus:border-primary focus:shadow-elevation-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Confirmer le mot de passe
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="h-[52px] w-full rounded-card border border-border bg-white px-4 text-sm outline-none transition-all duration-base focus:border-primary focus:shadow-elevation-1"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-[52px] w-full items-center justify-center gap-2 rounded-card bg-primary text-sm font-bold text-white transition-all duration-base hover:-translate-y-0.5 hover:shadow-elevation-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>Enregistrer le mot de passe <ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
