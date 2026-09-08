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
  Copy,
  Download,
  Loader2,
} from "lucide-react";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";
import { categories } from "@/lib/categories";

type RequestDetail = {
  id: string;
  status: "pending" | "under_review" | "approved" | "rejected" | "duplicate";
  proposed_name: string;
  proposed_main_category: string | null;
  proposed_city: string | null;
  proposed_neighborhood: string | null;
  proposed_address: string | null;
  proposed_phone: string;
  proposed_email: string;
  proposed_website: string | null;
  first_name: string;
  last_name: string;
  role_title: string;
  comments: string | null;
  admin_comment: string | null;
  created_at: string;
  possible_duplicate_of: string | null;
  created_establishment_id: string | null;
};

type DocRow = { id: string; file_name: string; storage_path: string };

const STATUS_LABELS: Record<RequestDetail["status"], string> = {
  pending: "Nouvelle",
  under_review: "En cours d'analyse",
  approved: "Acceptée",
  rejected: "Refusée",
  duplicate: "Doublon",
};

export default function EstablishmentCreationRequestDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [docs, setDocs] = useState<(DocRow & { url: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "duplicate" | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("establishment_creation_requests")
      .select("*")
      .eq("id", params.id)
      .single();

    setRequest((data as unknown as RequestDetail) ?? null);

    const { data: docRows } = await supabase
      .from("establishment_creation_request_documents")
      .select("id, file_name, storage_path")
      .eq("request_id", params.id);

    const withUrls = await Promise.all(
      (docRows ?? []).map(async (d) => {
        const { data: signed } = await supabase.storage.from("creation-request-documents").createSignedUrl(d.storage_path, 3600);
        return { ...d, url: signed?.signedUrl ?? null };
      })
    );
    setDocs(withUrls);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function approve() {
    setError("");
    setBusy("approve");
    const res = await fetch(`/api/admin/establishment-requests/${params.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);

    if (!res.ok) {
      setError(body.error ?? "Échec de l'approbation");
      return;
    }
    router.push("/dashboard/admin/etablissements-proposes");
  }

  async function reject(asDuplicate: boolean) {
    setError("");
    if (!comment.trim()) {
      setError("Un commentaire expliquant la décision est requis.");
      return;
    }
    setBusy(asDuplicate ? "duplicate" : "reject");
    const res = await fetch(`/api/admin/establishment-requests/${params.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: comment.trim(), duplicate: asDuplicate }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);

    if (!res.ok) {
      setError(body.error ?? "Échec du refus");
      return;
    }
    await load();
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f9f7f2] p-8 animate-pulse" />;
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center">
        <p className="text-slate-400 font-semibold">Demande introuvable.</p>
      </div>
    );
  }

  const canDecide = request.status === "pending" || request.status === "under_review";
  const categoryLabel = categories.find((c) => c.key === request.proposed_main_category)?.label ?? request.proposed_main_category;

  return (
    <div className="min-h-screen bg-[#f9f7f2] p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/dashboard/admin/etablissements-proposes" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors mb-6">
          <ArrowLeft size={15} />
          Toutes les demandes
        </Link>

        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {joinWithSeparator(request.proposed_city, categoryLabel)}
              </p>
              <h1 className="text-xl font-black text-[#0a0a0a]">{request.proposed_name}</h1>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
              {STATUS_LABELS[request.status]}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Row label="Téléphone" value={request.proposed_phone} />
            <Row label="Email" value={request.proposed_email} />
            {request.proposed_address && <Row label="Adresse" value={joinWithSeparator(request.proposed_address, request.proposed_neighborhood) ?? request.proposed_address} />}
            {request.proposed_website && <Row label="Site web" value={request.proposed_website} />}
          </div>
          {request.created_establishment_id && (
            <Link href={`/ecole/${request.created_establishment_id}`} className="inline-block mt-4 text-xs text-emerald-700 font-semibold" target="_blank">
              Voir la fiche publique créée →
            </Link>
          )}
        </div>

        {request.possible_duplicate_of && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-5">
            <p className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-amber-700 mb-2">
              <Copy size={13} /> Doublon potentiel signalé par le demandeur
            </p>
            <Link href={`/ecole/${request.possible_duplicate_of}`} className="text-sm text-amber-800 font-semibold underline" target="_blank">
              Voir l&apos;établissement potentiellement identique →
            </Link>
          </div>
        )}

        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Demandeur</p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Row label="Nom" value={`${request.first_name} ${request.last_name}`} />
            <Row label="Fonction" value={request.role_title} />
          </div>
          {request.comments && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Commentaire du demandeur</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{request.comments}</p>
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

        {request.admin_comment && (
          <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-5">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Commentaire de l&apos;équipe</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{request.admin_comment}</p>
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
              <button
                onClick={approve}
                disabled={busy !== null}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {busy === "approve" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Approuver et créer la fiche
              </button>
              <button
                onClick={() => reject(true)}
                disabled={busy !== null}
                className="flex items-center gap-2 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                {busy === "duplicate" ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
                Refuser — doublon
              </button>
              <button
                onClick={() => reject(false)}
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
