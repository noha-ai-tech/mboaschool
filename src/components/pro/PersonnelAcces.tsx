"use client";

import { useState } from "react";
import { Check, KeyRound, LockKeyhole } from "lucide-react";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminAlert } from "@/components/school-admin/ui/Feedback";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";

export function PersonnelAcces({ staffMemberId, establishmentId, hasAccount, hasEmail, existingCode }: { staffMemberId: string; establishmentId: string; hasAccount: boolean; hasEmail: boolean; existingCode: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState(existingCode);

  async function generateCode() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/personnel/${staffMemberId}/code-acces`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedEstablishmentId: establishmentId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error ?? "Échec"); return; }
      setCode(body.code); setMessage(body.message ?? "Code généré");
    } catch {
      setError("Impossible de générer le code pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  if (hasAccount) return <SchoolAdminStatusBadge tone="success" label="Compte actif" icon={<Check size={14} />} />;

  return <div className="space-y-4">
    <SchoolAdminAlert tone="info" title="Invitations temporairement indisponibles">L’envoi d’invitations de compte reste fermé. {hasEmail ? "L’adresse email enregistrée est conservée dans la fiche." : "Aucune adresse email n’est enregistrée sur cette fiche."}</SchoolAdminAlert>
    <div className="flex flex-wrap gap-2">
      <SchoolAdminButton variant="outline" disabled leadingIcon={<LockKeyhole size={15} aria-hidden="true" />}>Invitation indisponible</SchoolAdminButton>
      <SchoolAdminButton variant="secondary" loading={busy} onClick={generateCode} leadingIcon={<KeyRound size={15} aria-hidden="true" />}>Générer un code d’accès</SchoolAdminButton>
    </div>
    {code && <div className="rounded-[var(--school-admin-radius-control)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)] p-4"><p className="text-sm text-[var(--school-admin-text-muted)]">Code d’accès</p><code className="mt-1 block text-lg font-bold tracking-wider text-[var(--school-admin-text)]">{code}</code><p className="mt-2 text-xs leading-5 text-[var(--school-admin-text-muted)]">À communiquer directement à la personne selon les limites documentées de ce mode.</p></div>}
    {message && <SchoolAdminAlert tone="success">{message}</SchoolAdminAlert>}
    {error && <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert>}
  </div>;
}
