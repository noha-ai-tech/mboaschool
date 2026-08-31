"use client";

import { useState } from "react";
import { Mail, KeyRound, Loader2, Check } from "lucide-react";

export function PersonnelAcces({
  staffMemberId, establishmentId, hasAccount, hasEmail, existingCode,
}: {
  staffMemberId: string; establishmentId: string; hasAccount: boolean; hasEmail: boolean; existingCode: string | null;
}) {
  const [busy, setBusy] = useState<"email" | "code" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState(existingCode);

  async function inviteByEmail() {
    setBusy("email"); setError(""); setMessage("");
    const res = await fetch(`/api/personnel/${staffMemberId}/inviter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedEstablishmentId: establishmentId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(body.error ?? "Échec"); else setMessage(body.message ?? "Invitation envoyée");
  }

  async function generateCode() {
    setBusy("code"); setError(""); setMessage("");
    const res = await fetch(`/api/personnel/${staffMemberId}/code-acces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedEstablishmentId: establishmentId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(body.error ?? "Échec"); return; }
    setCode(body.code);
    setMessage(body.message ?? "Code généré");
  }

  if (hasAccount) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
        <Check size={14} /> Compte actif
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={inviteByEmail}
          disabled={!hasEmail || busy !== null}
          className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          {busy === "email" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Inviter par email
        </button>
        <button
          onClick={generateCode}
          disabled={busy !== null}
          className="flex items-center gap-2 border border-[#ddd] text-slate-600 px-4 py-2 rounded-xl text-sm font-semibold hover:border-[#aaa] transition-colors disabled:opacity-40"
        >
          {busy === "code" ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          Générer un code d&apos;accès
        </button>
      </div>
      {!hasEmail && <p className="text-xs text-slate-400">Ajoutez un email pour pouvoir inviter par email.</p>}
      {code && (
        <p className="text-sm">
          Code d&apos;accès : <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">{code}</span>
          <span className="block text-xs text-slate-400 mt-1">
            À communiquer directement à la personne — voir docs/pro/03_ROLES.md sur les limites de ce mode.
          </span>
        </p>
      )}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
