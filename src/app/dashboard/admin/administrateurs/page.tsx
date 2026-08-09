"use client";

// Gestion des administrateurs plateforme (Mission 08, Phase 2). Réservée à
// manage_admins (super_admin uniquement, src/lib/platform/permissions.ts).
// "Aucun email codé en dur" : la promotion se fait par recherche d'un email
// saisi à l'exécution parmi les comptes déjà inscrits — jamais une valeur
// fixe. Le Super Admin ne peut pas être supprimé par un autre administrateur
// (protection appliquée ici via can() + par le trigger
// protect_last_super_admin en base, migration 0013).

import { useEffect, useState } from "react";
import { usePlatformAdmin } from "@/lib/platform/usePlatformAdmin";
import { can, ADMIN_ROLE_LABELS, type PlatformAdminRole } from "@/lib/platform/permissions";
import { ShieldCheck, Plus, Loader2, ShieldOff, Lock } from "lucide-react";

type AdminRow = { id: string; full_name: string | null; email: string | null; admin_role: PlatformAdminRole | null; created_at: string };

const ROLES: PlatformAdminRole[] = ["super_admin", "platform_admin", "operations_admin"];

export default function AdminAdministrateursPage() {
  const { admin: currentAdmin, loading: currentLoading } = usePlatformAdmin();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<PlatformAdminRole>("operations_admin");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authorized = can(currentAdmin?.adminRole, "manage_admins");

  useEffect(() => {
    if (!currentLoading && authorized) load();
    else if (!currentLoading) setLoading(false);
  }, [currentLoading, authorized]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/administrateurs");
    const body = await res.json().catch(() => ({}));
    if (res.ok) setAdmins(body.admins ?? []);
    setLoading(false);
  }

  async function addAdmin(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const res = await fetch("/api/admin/administrateurs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), adminRole: newRole }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(body.error ?? "Échec"); return; }
    setEmail("");
    load();
  }

  async function changeRole(id: string, adminRole: PlatformAdminRole) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/administrateurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminRole }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(body.error ?? "Échec"); return; }
    load();
  }

  async function removeAdmin(id: string, name: string | null) {
    if (!confirm(`Retirer les droits d'administrateur de ${name ?? "cet utilisateur"} ?`)) return;
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/administrateurs/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(body.error ?? "Échec"); return; }
    load();
  }

  if (currentLoading || loading) {
    return <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-16 bg-white border border-[#ebebeb] rounded-2xl animate-pulse" />)}</div>;
  }

  if (!authorized) {
    return (
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-10 text-center max-w-md mx-auto mt-12">
        <Lock size={24} className="mx-auto text-slate-300 mb-3" />
        <p className="font-bold text-sm text-[#0a0a0a]">Accès réservé au Super Admin</p>
        <p className="text-xs text-slate-400 mt-1">Votre rôle ({currentAdmin?.adminRole ? ADMIN_ROLE_LABELS[currentAdmin.adminRole] : "—"}) ne permet pas de gérer les administrateurs.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <ShieldCheck size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Administrateurs</h1>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}

      <form onSubmit={addAdmin} className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-6 flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Email d'un compte Écoles237 existant"
          className="flex-1 border border-[#ddd] rounded-xl px-4 py-2.5 text-sm"
        />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value as PlatformAdminRole)} className="border border-[#ddd] rounded-xl px-3 py-2.5 text-sm bg-white">
          {ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
        </select>
        <button type="submit" disabled={busy === "create"} className="flex items-center justify-center gap-2 bg-[#0a0a0a] text-white px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
          {busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Ajouter
        </button>
      </form>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        {admins.length === 0 ? (
          <div className="py-16 text-center"><p className="text-sm text-slate-400">Aucun administrateur</p></div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#0a0a0a] truncate">{a.full_name ?? "—"}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{a.email ?? "—"}</p>
                </div>
                <select
                  value={a.admin_role ?? "operations_admin"}
                  onChange={(e) => changeRole(a.id, e.target.value as PlatformAdminRole)}
                  disabled={busy === a.id}
                  className="border border-[#ddd] rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
                </select>
                <button
                  onClick={() => removeAdmin(a.id, a.full_name)}
                  disabled={busy === a.id}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Retirer les droits d'administrateur"
                >
                  {busy === a.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Le dernier Super Admin ne peut pas être rétrogradé ni retiré — la plateforme doit toujours en conserver au moins un.
      </p>
    </div>
  );
}
