/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FolderDown, ImageIcon } from "lucide-react";
import { useSchool } from "@/lib/useSchool";
import { supabase } from "@/lib/supabase";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminEmptyState, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

export default function CentreDocumentairePage() {
  const { school, loading: schoolLoading } = useSchool(); const [docCount, setDocCount] = useState<number | null>(null); const [imageCount, setImageCount] = useState<number | null>(null); const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => { if (!school) return; Promise.all([supabase.from("school_documents").select("id", { count: "exact", head: true }).eq("establishment_id", school.id), supabase.from("school_images").select("id", { count: "exact", head: true }).eq("establishment_id", school.id), supabase.from("establishments").select("logo_url").eq("id", school.id).single()]).then(([docs, images, establishment]) => { setDocCount(docs.count ?? 0); setImageCount(images.count ?? 0); setLogoUrl(establishment.data?.logo_url ?? null); }); }, [school]);
  if (schoolLoading || (school && (docCount === null || imageCount === null))) return <SchoolAdminLoadingState label="Chargement du centre documentaire" />; if (!school) return <SchoolAdminEmptyState title="Aucun établissement actif" description="Sélectionnez un établissement." />;
  const href = (path: string) => withEstablishmentQuery(path, school.id);
  return <div className="mx-auto max-w-5xl"><SchoolAdminPageHeader eyebrow="Documents et CMS" title="Centre documentaire" description="Synthèse des fichiers réels et accès aux gestionnaires existants." /><div className="mb-6 grid gap-4 sm:grid-cols-2"><SchoolAdminStatCard label="Documents" value={docCount ?? 0} icon={<FileText size={19} />} /><SchoolAdminStatCard label="Photos" value={imageCount ?? 0} icon={<ImageIcon size={19} />} tone="neutral" /></div><div className="grid gap-4 sm:grid-cols-2"><ManagerLink href={href("/dashboard/ecole/documents")} title="Documents administratifs" detail={`${docCount ?? 0} document(s)`} icon={<FileText size={20} />} /><ManagerLink href={href("/dashboard/ecole/galerie")} title="Photos" detail={`${imageCount ?? 0} photo(s)`} icon={<ImageIcon size={20} />} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><SchoolAdminSectionCard title="Logo" action={<SchoolAdminStatusBadge label={logoUrl ? "Disponible" : "Indisponible"} />}>{logoUrl ? <img src={logoUrl} alt="Logo de l’établissement" className="h-16 w-16 rounded-lg object-contain" /> : <p className="text-sm text-[var(--school-admin-text-muted)]">Aucun logo disponible. Aucun upload n’est créé ici.</p>}</SchoolAdminSectionCard><SchoolAdminSectionCard title="Autres catégories" action={<SchoolAdminStatusBadge tone="warning" label="Prochainement" />}><p className="flex items-center gap-2 text-sm text-[var(--school-admin-text-muted)]"><FolderDown size={18} aria-hidden="true" />Brochures et téléchargements restent indisponibles.</p></SchoolAdminSectionCard></div></div>;
}
function ManagerLink({ href, title, detail, icon }: { href: string; title: string; detail: string; icon: React.ReactNode }) { return <Link href={href} className="flex min-h-28 items-center gap-4 rounded-xl border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] motion-reduce:transition-none"><span aria-hidden="true">{icon}</span><span><strong className="block">{title}</strong><span className="mt-1 block text-sm text-[var(--school-admin-text-muted)]">{detail}</span></span></Link>; }
