"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  Clock3,
  Download,
  Loader2,
} from "lucide-react";

type ClaimDetail = {
  id: string;
  status: "new" | "in_review" | "accepted" | "rejected";
  first_name: string;
  last_name: string;
  role_title: string;
  phone: string;
  email: string;
  comments: string | null;
  admin_comment: string | null;
  created_at: string;
  establishment_id: string;
  establishments: { name: string; city: string; main_category: string } | null;
};

type DocRow = { id: string; file_name: string; storage_path: string };

const STATUS_LABELS: Record<ClaimDetail["status"], string> = {
  new: "Nouvelle",
  in_review: "En cours d'analyse",
  accepted: "Acceptée",
  rejected: "Refusée",
};

export default function VerificationDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [docs, setDocs] = useState<(DocRow & { url: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"review" | "approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data: claimData } = await supabase
      .from("establishment_claims")
      .select("*, establishments(name, city, main_category)")
      .eq("id", params.id)
      .single();

    setClaim((claimData as unknown as ClaimDetail) ?? null);

    const { data: docRows } = await supabase
      .from("establishment_claim_documents")
      .select("id, file_name, storage_path")
      .eq("claim_id", params.id);

    const withUrls = await Promise.all(
      (docRows ?? []).map(async (d) => {
        const { data } = await supabase.storage.from("claim-documents").createSignedUrl(d.storage_path, 3600);
        return { ...d, url: data?.signedUrl ?? null };
      })
    );
    setDocs(withUrls);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function callAction(action: "review" | "approve" | "reject") {
    setError("");
    if (action === "reject" && !comment.trim()) {
      setError("Un commentaire expliquant le refus est requis.");
      return;
    }
    setBusy(action);
    const res = await fetch(`/api/admin/claims/${params.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);

    if (!res.ok) {
      setError(body.error ?? "Échec de l'action");
      return;
    }

    if (action === "approve") {
      router.push("/dashboard/admin/verifications");
    } else {
      await load();
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f9f7f2] p-8 animate-pulse" />;
  }

  if (!claim) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center">
        <p className="text-slate-400 font-semibold">Demande introuvable.</p>
      </div>
    );
  }

  const canReview = claim.status === "new";
  const canDecide = claim.status === "new" || claim.status === "in_review";

  return (
    <div className="min-h-screen bg-[#f9f7f2] p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/dashboard/admin/verifications" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors mb-6">
          <ArrowLeft size={15} />
          Toutes les demandes
        </Link>

        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {claim.establishments?.city} · {claim.establishments?.main_category}
              </p>
              <h1 className="text-xl font-black text-[#0a0a0a]">{claim.establishments?.name ?? "Établissement"}</h1>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
              {STATUS_LABELS[claim.status]}
            </span>
          </div>
          <Link href={`/ecole/${claim.establishment_id}`} className="text-xs text-emerald-700 font-semibold" target="_blank">
            Voir la fiche publique →
          </Link>
        </div>

        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Demandeur</p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Row label="Nom" value={`${claim.first_name} ${claim.last_name}`} />
            <Row label="Fonction" value={claim.role_title} />
            <Row label="Téléphone" value={claim.phone} />
            <Row label="Email" value={claim.email} />
          </div>
          {claim.comments && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Commentaire du demandeur</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{claim.comments}</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Documents justificatifs</p>
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun document fourni.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    {d.file_name}
                  </span>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-semibold flex items-center gap-1 shrink-0 ml-2">
                      <Download size={13} /> Voir
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {claim.admin_comment && (
          <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Commentaire de l&apos;équipe</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{claim.admin_comment}</p>
          </div>
        )}

        {canDecide && (
          <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Décision</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium mb-4">
                {error}
              </div>
            )}

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Commentaire (obligatoire en cas de refus)…"
              className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#0a0a0a] transition-colors resize-none mb-4"
            />

            <div className="flex flex-wrap gap-3">
              {canReview && (
                <button
                  onClick={() => callAction("review")}
                  disabled={busy !== null}
                  className="flex items-center gap-2 border border-[#ddd] text-slate-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:border-[#aaa] transition-colors disabled:opacity-50"
                >
                  {busy === "review" ? <Loader2 size={15} className="animate-spin" /> : <Clock3 size={15} />}
                  Passer en cours d&apos;analyse
                </button>
              )}
              <button
                onClick={() => callAction("approve")}
                disabled={busy !== null}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {busy === "approve" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Valider
              </button>
              <button
                onClick={() => callAction("reject")}
                disabled={busy !== null}
                className="flex items-center gap-2 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {busy === "reject" ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                Refuser
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-[#0a0a0a]">{value}</p>
    </div>
  );
}
