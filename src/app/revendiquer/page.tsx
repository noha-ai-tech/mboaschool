"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Search, CheckCircle2, ArrowRight, Building2, FilePlus2, AlertTriangle, Loader2 } from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";
import { ClaimBranding } from "@/components/claim/ClaimBranding";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";
import { categories } from "@/lib/categories";

// Recherche nationale limitée à nom/ville : `establishments` n'a pas encore
// de colonnes région/département/arrondissement normalisées (voir le GAP
// ANALYSIS du rapport Sprint F V3) — pas de hiérarchie géographique
// hardcodée ici en attendant cette donnée réelle.
type SearchResult = {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
  verified: boolean;
  ownerId: string | null;
  image: string | null;
};

type Mode = "choice" | "search" | "confirm" | "new";

// ONBOARDING-01 Phase 4 — sous-étapes du parcours "mon établissement
// n'existe pas" : vérification anti-doublon d'abord, formulaire ensuite,
// jamais l'inverse. `similarity` reste l'étape par défaut même si la
// recherche ne retourne rien — l'utilisateur doit explicitement confirmer
// "aucun de ces établissements ne correspond" avant de continuer.
type NewStep = "similarity" | "form" | "success";

const NEW_EMPTY_FORM = {
  proposed_name: "",
  proposed_main_category: "",
  proposed_city: "",
  proposed_neighborhood: "",
  proposed_address: "",
  proposed_phone: "",
  proposed_email: "",
  proposed_website: "",
  first_name: "",
  last_name: "",
  role_title: "",
  comments: "",
};

const ROLE_OPTIONS = ["Promoteur", "Directeur", "Proviseur", "Principal", "Censeur", "Responsable administratif", "Autre"];

export default function RevendiquerInscrirePage() {
  const tickerItems = useSiteTickerItems();
  const [mode, setMode] = useState<Mode>("choice");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  // D'où l'utilisateur arrive sur l'étape de confirmation partagée — le
  // parcours "revendiquer un établissement existant" et la vérification
  // anti-doublon du parcours "établissement absent" mènent tous les deux
  // ici, mais "Retour" doit ramener au bon endroit.
  const [confirmOrigin, setConfirmOrigin] = useState<"search" | "new">("search");

  // "Je ne trouve pas mon établissement" — état dédié, jamais mélangé avec
  // la recherche de revendication ci-dessus (deux intentions différentes :
  // l'une cherche un établissement déjà référencé, l'autre vérifie l'absence
  // d'un doublon avant de proposer une création).
  const [newStep, setNewStep] = useState<NewStep>("similarity");
  const [newQuery, setNewQuery] = useState("");
  const [newSearching, setNewSearching] = useState(false);
  const [newSearched, setNewSearched] = useState(false);
  const [newSimilar, setNewSimilar] = useState<SearchResult[]>([]);
  const [newDuplicateOf, setNewDuplicateOf] = useState<SearchResult | null>(null);
  const [newForm, setNewForm] = useState(NEW_EMPTY_FORM);
  const [newCustomRole, setNewCustomRole] = useState(false);
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newError, setNewError] = useState("");
  const [newRequestId, setNewRequestId] = useState<string | null>(null);

  function newField(key: keyof typeof NEW_EMPTY_FORM, value: string) {
    setNewForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSimilaritySearch(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuery.trim()) return;
    setNewSearching(true);
    setNewSearched(true);
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city, main_category, is_verified, owner_id, cover_image_url, school_images(url)")
      .eq("school_images.status", "live")
      .or(`name.ilike.%${newQuery}%,city.ilike.%${newQuery}%`)
      .limit(10);

    setNewSimilar(
      (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        category: s.main_category ?? null,
        verified: s.is_verified ?? false,
        ownerId: s.owner_id ?? null,
        image: s.school_images?.[0]?.url ?? s.cover_image_url ?? null,
      }))
    );
    setNewSearching(false);
  }

  function proceedToForm(duplicateOf: SearchResult | null) {
    setNewDuplicateOf(duplicateOf);
    setNewForm((f) => ({ ...f, proposed_name: duplicateOf ? f.proposed_name : newQuery.trim() || f.proposed_name }));
    setNewStep("form");
  }

  async function submitNewRequest() {
    setNewSubmitting(true);
    setNewError("");

    const res = await fetch("/api/establishment-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newForm, possible_duplicate_of: newDuplicateOf?.id ?? null }),
    });
    const responseBody = await res.json().catch(() => ({}));

    setNewSubmitting(false);
    if (!res.ok) {
      setNewError(responseBody.error ?? "Échec de l'envoi de la demande");
      return;
    }
    setNewRequestId(responseBody.requestId ?? null);
    setNewStep("success");
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city, main_category, is_verified, owner_id, cover_image_url, school_images(url)")
      // CMS-F.6 — défense en profondeur avec la policy RLS publique
      // (migration 0029, PRÉPARÉE NON EXÉCUTÉE).
      .eq("school_images.status", "live")
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20);

    setResults(
      (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        category: s.main_category ?? null,
        verified: s.is_verified ?? false,
        ownerId: s.owner_id ?? null,
        image: s.school_images?.[0]?.url ?? s.cover_image_url ?? null,
      }))
    );
    setSearching(false);
  }

  return (
    <div className="min-h-screen bg-[#ECECEA] flex flex-col">
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <div className="flex-1 flex flex-col lg:flex-row">
        <ClaimBranding />

        <div className="flex-1 flex flex-col items-center px-6 py-10 lg:py-14">
          <div className="w-full max-w-xl">

            {mode === "choice" && (
              <>
                <h1 className="text-2xl font-bold text-text-primary mb-1.5">Que souhaitez-vous faire ?</h1>
                <p className="text-sm text-text-secondary mb-8">Choisissez le parcours qui correspond à votre situation.</p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setMode("search")}
                    className="group text-left bg-white border border-border rounded-[20px] p-6 hover:border-primary hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
                  >
                    <Building2 size={22} className="text-primary mb-4" />
                    <p className="font-bold text-text-primary mb-1.5">Revendiquer un établissement existant</p>
                    <p className="text-sm text-text-secondary mb-4">Votre école est déjà référencée sur Écoles237.</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                      Rechercher mon établissement
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-base" />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("new")}
                    className="group text-left bg-white border border-border rounded-[20px] p-6 hover:border-primary hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
                  >
                    <FilePlus2 size={22} className="text-primary mb-4" />
                    <p className="font-bold text-text-primary mb-1.5">Inscrire un nouvel établissement</p>
                    <p className="text-sm text-text-secondary mb-4">Votre établissement n&apos;apparaît pas encore dans l&apos;annuaire.</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                      Créer une nouvelle fiche
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-base" />
                    </span>
                  </button>
                </div>
              </>
            )}

            {mode === "search" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour
                </button>

                <h1 className="text-2xl font-bold text-text-primary mb-1.5">Rechercher mon établissement</h1>
                <p className="text-sm text-text-secondary mb-6">Recherchez par nom ou par ville.</p>

                <form onSubmit={handleSearch} className="flex items-center gap-2 bg-white border border-border rounded-card px-4 h-[52px] mb-6 focus-within:border-primary transition-colors duration-base">
                  <Search size={16} className="text-text-secondary shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nom de l'établissement ou ville…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-text-secondary"
                  />
                  <button type="submit" disabled={searching} className="shrink-0 text-sm font-semibold text-primary disabled:opacity-50">
                    {searching ? "Recherche…" : "Rechercher"}
                  </button>
                </form>

                {searched && !searching && results.length === 0 && (
                  <p className="text-sm text-text-secondary text-center py-8">
                    Aucun établissement trouvé pour « {query} ».
                  </p>
                )}

                <div className="space-y-3">
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 bg-white border border-border rounded-[16px] p-3">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                        {r.image ? (
                          <Image src={r.image} alt="" fill sizes="56px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-primary/30 font-black text-xs">237</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-text-primary truncate">{r.name}</p>
                        <p className="text-xs text-text-secondary">{joinWithSeparator(r.city, r.category)}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {r.verified && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary-light text-primary px-2 py-0.5 rounded-full">
                              <CheckCircle2 size={9} /> {TRUST_BADGE_LABELS.PLATFORM_VERIFIED}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold bg-muted text-text-secondary px-2 py-0.5 rounded-full">
                            {r.ownerId ? "Géré par l'établissement" : "Non revendiqué"}
                          </span>
                        </div>
                      </div>
                      {r.ownerId ? (
                        <span className="shrink-0 text-xs text-text-secondary">Déjà géré</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setSelected(r); setConfirmOrigin("search"); setMode("confirm"); }}
                          className="shrink-0 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
                        >
                          C&apos;est mon établissement
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {mode === "confirm" && selected && (
              <>
                <button
                  type="button"
                  onClick={() => { if (confirmOrigin === "new") { setNewStep("similarity"); setMode("new"); } else { setMode("search"); } }}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour aux résultats
                </button>

                <div className="bg-white border border-border rounded-[20px] p-6">
                  <h2 className="font-bold text-lg text-text-primary mb-4">Confirmez votre établissement</h2>
                  <div className="bg-muted rounded-[14px] p-4 space-y-2 mb-6">
                    <Row label="Nom" value={selected.name} />
                    <Row label="Ville" value={selected.city} />
                    {selected.category && <Row label="Catégorie" value={selected.category} />}
                  </div>
                  <p className="text-sm font-medium text-text-primary mb-4">
                    Confirmez-vous qu&apos;il s&apos;agit bien de votre établissement ?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => { if (confirmOrigin === "new") { setNewStep("similarity"); setMode("new"); } else { setMode("search"); } }}
                      className="h-[48px] px-5 rounded-card border border-border text-text-secondary text-sm font-semibold hover:border-text-secondary transition-colors duration-base"
                    >
                      Ce n&apos;est pas mon établissement
                    </button>
                    <Link
                      href={`/revendiquer/${selected.id}`}
                      className="flex-1 h-[48px] flex items-center justify-center gap-2 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 transition-all duration-base"
                    >
                      Oui, revendiquer cet établissement
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </>
            )}

            {mode === "new" && newStep === "similarity" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour
                </button>

                <h1 className="text-2xl font-bold text-text-primary mb-1.5">Avant de continuer</h1>
                <p className="text-sm text-text-secondary mb-6">
                  Vérifions d&apos;abord que votre établissement n&apos;est pas déjà référencé, pour éviter une fiche en double.
                </p>

                <form onSubmit={handleSimilaritySearch} className="flex items-center gap-2 bg-white border border-border rounded-card px-4 h-[52px] mb-6 focus-within:border-primary transition-colors duration-base">
                  <Search size={16} className="text-text-secondary shrink-0" />
                  <input
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    placeholder="Nom de votre établissement…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-text-secondary"
                  />
                  <button type="submit" disabled={newSearching} className="shrink-0 text-sm font-semibold text-primary disabled:opacity-50">
                    {newSearching ? "Recherche…" : "Vérifier"}
                  </button>
                </form>

                {newSearched && !newSearching && newSimilar.length > 0 && (
                  <>
                    <p className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-3">
                      <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                      Des établissements similaires existent déjà
                    </p>
                    <div className="space-y-3 mb-5">
                      {newSimilar.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 bg-white border border-border rounded-[16px] p-3">
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
                            {r.image ? (
                              <Image src={r.image} alt="" fill sizes="48px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-primary/30 font-black text-xs">237</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-text-primary truncate">{r.name}</p>
                            <p className="text-xs text-text-secondary">{joinWithSeparator(r.city, r.category)}</p>
                          </div>
                          {r.ownerId ? (
                            <span className="shrink-0 text-xs text-text-secondary">Déjà géré</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setSelected(r); setConfirmOrigin("new"); setMode("confirm"); }}
                              className="shrink-0 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
                            >
                              Choisir cet établissement
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {newSearched && !newSearching && newSimilar.length === 0 && (
                  <p className="text-sm text-text-secondary mb-5">Aucun établissement similaire trouvé pour « {newQuery} ».</p>
                )}

                {newSearched && !newSearching && (
                  <button
                    type="button"
                    onClick={() => proceedToForm(null)}
                    className="w-full h-[48px] flex items-center justify-center rounded-card border border-border text-text-primary text-sm font-semibold hover:border-primary transition-colors duration-base"
                  >
                    Aucun de ces établissements ne correspond — continuer
                  </button>
                )}
              </>
            )}

            {mode === "new" && newStep === "form" && (
              <>
                <button
                  type="button"
                  onClick={() => setNewStep("similarity")}
                  className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors duration-base mb-6"
                >
                  ← Retour à la vérification
                </button>

                <h1 className="text-2xl font-bold text-text-primary mb-1.5">Décrivez votre établissement</h1>
                <p className="text-sm text-text-secondary mb-6">
                  Ces informations sont examinées par l&apos;équipe Écoles237 avant publication — votre établissement n&apos;apparaît pas publiquement tant que la demande n&apos;est pas approuvée.
                </p>

                {newError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-5">
                    {newError}
                  </div>
                )}

                <div className="space-y-4">
                  <NewField label="Nom officiel de l'établissement" value={newForm.proposed_name} onChange={(v) => newField("proposed_name", v)} required />

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Catégorie</label>
                    <select
                      value={newForm.proposed_main_category}
                      onChange={(e) => newField("proposed_main_category", e.target.value)}
                      className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
                    >
                      <option value="">Non précisé</option>
                      {categories.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <NewField label="Ville" value={newForm.proposed_city} onChange={(v) => newField("proposed_city", v)} />
                    <NewField label="Quartier" value={newForm.proposed_neighborhood} onChange={(v) => newField("proposed_neighborhood", v)} />
                  </div>
                  <NewField label="Adresse" value={newForm.proposed_address} onChange={(v) => newField("proposed_address", v)} />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <NewField label="Téléphone de l'établissement" value={newForm.proposed_phone} onChange={(v) => newField("proposed_phone", v)} required placeholder="+237 6XX XXX XXX" />
                    <NewField label="Email de l'établissement" value={newForm.proposed_email} onChange={(v) => newField("proposed_email", v)} required type="email" />
                  </div>
                  <NewField label="Site web (optionnel)" value={newForm.proposed_website} onChange={(v) => newField("proposed_website", v)} />

                  <div className="pt-2 border-t border-border" />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <NewField label="Votre prénom" value={newForm.first_name} onChange={(v) => newField("first_name", v)} required />
                    <NewField label="Votre nom" value={newForm.last_name} onChange={(v) => newField("last_name", v)} required />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Votre fonction</label>
                    <select
                      value={newCustomRole ? "Autre" : newForm.role_title}
                      onChange={(e) => {
                        if (e.target.value === "Autre") { setNewCustomRole(true); newField("role_title", ""); }
                        else { setNewCustomRole(false); newField("role_title", e.target.value); }
                      }}
                      className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
                    >
                      <option value="" disabled>Sélectionnez votre fonction</option>
                      {ROLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {newCustomRole && (
                      <input
                        type="text"
                        value={newForm.role_title}
                        onChange={(e) => newField("role_title", e.target.value)}
                        placeholder="Précisez votre fonction"
                        className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base mt-3"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Commentaire (optionnel)</label>
                    <textarea
                      value={newForm.comments}
                      onChange={(e) => newField("comments", e.target.value)}
                      rows={3}
                      placeholder="Toute précision utile pour l'équipe Écoles237…"
                      className="w-full border border-border rounded-card px-4 py-3 text-sm bg-white outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base resize-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    newSubmitting ||
                    !newForm.proposed_name.trim() ||
                    !newForm.proposed_phone.trim() ||
                    !newForm.proposed_email.trim() ||
                    !newForm.first_name.trim() ||
                    !newForm.last_name.trim() ||
                    !newForm.role_title.trim()
                  }
                  onClick={submitNewRequest}
                  className="w-full mt-6 flex items-center justify-center gap-2 h-[52px] rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {newSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {newSubmitting ? "Envoi…" : "Envoyer ma demande"}
                </button>
              </>
            )}

            {mode === "new" && newStep === "success" && (
              <div className="bg-white border border-border rounded-[20px] p-8 text-center">
                <div className="w-14 h-14 bg-primary-light rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={26} className="text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-text-primary mb-2">Demande envoyée</h1>
                <p className="text-text-secondary text-sm leading-relaxed mb-6">
                  Votre proposition pour {newForm.proposed_name} a bien été reçue. L&apos;équipe Écoles237 va la vérifier avant toute publication — vous serez recontacté par email.
                </p>
                {newRequestId && (
                  <div className="bg-muted rounded-[14px] p-4 text-left space-y-2 mb-6">
                    <Row label="N° de demande" value={newRequestId} mono />
                    <Row label="Statut" value="En attente de vérification" />
                  </div>
                )}
                <Link href="/" className="inline-flex items-center gap-2 h-11 px-6 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-1 transition-all duration-base">
                  Retour à l&apos;accueil
                </Link>
              </div>
            )}

          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
      <span className="text-text-secondary text-sm shrink-0">{label}</span>
      <span className={`font-semibold text-text-primary text-sm text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function NewField({
  label, value, onChange, type = "text", required = false, placeholder = "",
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full h-[52px] border border-border rounded-card px-4 text-sm bg-white placeholder:text-text-secondary outline-none focus:border-primary focus:shadow-elevation-1 transition-all duration-base"
      />
    </div>
  );
}
