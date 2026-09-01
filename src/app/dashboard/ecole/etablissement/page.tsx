"use client";

// "Modifier ma page" — éditeur visuel de la fiche publique (CMS-B.0 + B.1 +
// B.2). Route reprise telle quelle depuis le hub existant (recommandation
// CMS-A : éviter de multiplier les routes). Sécurité : aucune donnée n'est
// dérivée de l'URL — l'école éditée est l'établissement ACTIF résolu par
// useSchool()/SchoolContext (session + préférence active_school revalidée
// côté serveur, PRO-00B/PRO-03 — mêmes garanties, un seul moteur de
// résolution), jamais un id passé en paramètre. Reconciliation
// multi-écoles : cette page faisait auparavant sa propre résolution
// mono-établissement (.maybeSingle() sur owner_id), qui échouait
// silencieusement pour un propriétaire possédant 2+ écoles.
//
// CMS-B.2 : Présentation, Contact et l'ordre/visibilité des sections sont
// désormais sauvegardés pour de vrai, via /api/school-page/* (whitelist
// stricte, autorisation recalculée côté serveur — voir
// src/lib/cms/authorizeSchoolMutation.ts). Publier reste désactivé tant que
// la vérification de sécurité (fuite applications, migrations 0007/0014)
// n'est pas confirmée par Eddy + l'architecte — voir le rapport CMS-B.2
// pour le détail de ce qui reste à débloquer.
//
// CMS-D : Tarifs et Infrastructures sont désormais sauvegardés pour de
// vrai (/api/school-page/pricing, /api/school-page/infrastructure), même
// table `fees`/`infrastructures` que les pages dashboard/ecole/frais et
// dashboard/ecole/infrastructure existantes (non dupliquées, non
// modifiées). Une valeur de tarif vide est enregistrée NULL, jamais 0 (0
// peut être un vrai prix).
//
// CMS-D.1 : Admissions branchée sur admissions_config (configuration
// PUBLIQUE, distincte du pipeline de candidatures privé de
// /dashboard/ecole/admissions — jamais lu ni exposé ici).
//
// CMS-E : Actualités et Documents branchés en écriture réelle
// (/api/school-page/news, /api/school-page/documents), même table que les
// pages dashboard/ecole/annonces et dashboard/ecole/documents existantes
// (non dupliquées). newsList est une liste de gestion propre à l'éditeur
// (création/édition/suppression) ; l'aperçu (renderSectionContent) continue
// d'utiliser AnnouncementsTab tel quel, jamais un second renderer.
//
// CMS-C : Galerie branchée en écriture réelle (/api/school-page/gallery,
// même autorisation que Présentation/Contact). Il n'existe aucun asset
// "cover" séparé à uploader dans le modèle actuel — cover_image_url est un
// champ hérité, jamais écrit par l'application, utilisé uniquement en
// repli quand school_images est vide (voir src/lib/school/heroMode.ts).
//
// CMS-C.1 : le mode d'affichage du hero (carrousel/image unique/aucun) —
// voir CMS-F.3 ci-dessous, ce mode est désormais un champ DRAFT.
//
// CMS-F.3 — CUTOVER BROUILLON. Presentation, Contact, Hero mode, Tarifs,
// Infrastructures, Admissions (champs descriptifs) et Sections
// (ordre/visibilité) ne sauvegardent PLUS directement dans les tables live
// — ils lisent et écrivent désormais school_page_drafts via
// /api/school-page/draft (CMS-F.2). Les anciennes routes /presentation,
// /contact, /hero, /pricing, /infrastructure, /sections restent en place
// (non supprimées, CMS-F.3 §24) mais ne sont plus appelées par cet
// éditeur. admissions_config.is_open, Actualités et Documents restent
// IMMEDIATE LIVE — voir toggleAdmissionsOpen(). CMS-F.6 : la Galerie a
// rejoint le modèle brouillon (voir uploadGalleryImage/deleteGalleryImage/
// undoRemoveGalleryImage plus bas) — seul le mode d'affichage du hero
// était déjà draft-aware avant F.6 ; les diapositives elles-mêmes suivent
// maintenant la Galerie effective (live moins remove_ids, plus
// draft_pending_add), plus un hybride figé sur le live. La fiche publique
// (src/app/ecole/[id]/page.tsx) continue de lire uniquement les tables
// live : aucun changement de comportement public tant qu'un futur Publish
// n'existe pas (CMS-F.4+).
//
// Garde de génération de requête (loadRequestIdRef) : protège contre une
// réponse réseau tardive (école déjà changée entre-temps) qui écraserait
// l'état local de la NOUVELLE école active avec les données de l'ANCIENNE
// (CMS-F.3 §5/§22).

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { ExternalLink, Phone, Mail, MapPin, Globe, ImageIcon, FileText, ClipboardList, Image as ImageIconAlt, Video, Upload, Trash2 } from "lucide-react";
import { SchoolHeroCarousel } from "@/components/school/SchoolHeroCarousel";
import { computeAllHeroSlides, resolveHeroSlides, type HeroMode } from "@/lib/school/heroMode";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { GeneralTab, FEE_COLS, INFRA_LABELS } from "@/components/school/GeneralTab";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { ParentTab, type AdmissionsConfig } from "@/components/school/ParentTab";
import { ContactRow } from "@/components/school/ContactRow";
import { EditableSection } from "@/components/cms/EditableSection";
import { EditorToolbar, type DraftStatus } from "@/components/cms/EditorToolbar";
import { Drawer } from "@/components/cms/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CANONICAL_SECTION_KEYS, type SchoolPageSectionKey } from "@/lib/schoolPage/sections";
import type { SchoolPageDraftPayload, SchoolPageDraftRow } from "@/lib/schoolPage/draftPayload";
import type { SchoolPagePricing } from "@/lib/schoolPage/pricing";
import { StructuredPricingEditor } from "@/components/school/StructuredPricingEditor";
import { SCHOOL_DOCUMENT_TYPE_LABELS } from "@/lib/schoolPage/documents";
import { getSchoolVisualPack } from "@/lib/schoolPage/visualPacks";
import { SchoolVisualPackPanel } from "@/components/school/SchoolVisualPackPanel";

type SectionKey =
  | "presentation" | "admissions" | "tarifs" | "infrastructures"
  | "galerie" | "actualites" | "documents" | "contact";

// PUBLIC-SITE-02 §5 — "cles" (Chiffres clés) et "classement" (Classement
// officiel) sont des tiroirs supplémentaires, hors de la liste réordonnable
// des 8 sections (comme "hero") : ils n'ont pas de ligne school_page_sections,
// juste des domaines de brouillon (key_numbers, ranking).
type DrawerKey = SectionKey | "hero" | "cles" | "classement";

// Clés attendues par school_page_sections / le payload draft (CMS-F.2) —
// différentes des clés internes de l'éditeur pour "tarifs"/
// "infrastructures"/"galerie"/"actualites" (alignées sur le vocabulaire du
// brief CMS-B.2 §4).
const SECTION_TO_DB_KEY: Record<SectionKey, SchoolPageSectionKey> = {
  presentation: "presentation",
  admissions: "admissions",
  tarifs: "pricing",
  infrastructures: "infrastructure",
  galerie: "gallery",
  actualites: "news",
  documents: "documents",
  contact: "contact",
};
const DB_KEY_TO_SECTION = Object.fromEntries(
  (Object.entries(SECTION_TO_DB_KEY) as [SectionKey, SchoolPageSectionKey][]).map(([ui, db]) => [db, ui])
) as Record<SchoolPageSectionKey, SectionKey>;

// CMS-F.3 — dérivé de la source unique (src/lib/schoolPage/sections.ts) au
// lieu d'un second tableau codé en dur ; produit exactement les mêmes 8
// valeurs, dans le même ordre, qu'avant (chaque clé DB canonique se
// traduit 1:1 vers la clé interne de l'éditeur ci-dessus).
const DEFAULT_ORDER: SectionKey[] = CANONICAL_SECTION_KEYS.map((k) => DB_KEY_TO_SECTION[k]);

const SECTION_LABELS: Record<SectionKey, string> = {
  presentation: "Présentation",
  admissions: "Admissions",
  tarifs: "Tarifs",
  infrastructures: "Infrastructures",
  galerie: "Galerie",
  actualites: "Actualités",
  documents: "Documents",
  contact: "Contact",
};

// Sections où "Modifier" ouvre un formulaire réellement sauvegardé
// (Annuler / Enregistrer, applyDrawer()) — CMS-B.2 (presentation, contact)
// + CMS-D (tarifs, infrastructures) + CMS-D.1 (admissions, config publique
// distincte du pipeline privé applications). Les autres ("galerie",
// "actualites", "documents") ouvrent un panneau lecture seule ou leur
// propre flux (galerie : upload/suppression immédiats, voir plus bas).
// Hero (CMS-C.1) n'en fait pas partie : sauvegarde immédiate hors
// applyDrawer(), voir updateHeroMode().
const EDITABLE_FORM_SECTIONS = new Set<SectionKey>(["presentation", "tarifs", "infrastructures", "contact", "admissions"]);

type SaveState = "idle" | "saving" | "saved" | "error";

type FormDraft = {
  description: string;
  motto: string;
  history: string;
  mission: string;
  vision: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  fees: Record<string, string>;
  pricing: SchoolPagePricing;
  infra: Record<string, boolean>;
  admissionsOpen: boolean;
  admissionsLevels: string;
  admissionsConditions: string;
  admissionsDocuments: string;
  admissionsPeriodStart: string;
  admissionsPeriodEnd: string;
  admissionsAdditionalInfo: string;
  foundingYear: string;
  studentCount: string;
  teacherCount: string;
  rankingYear: string;
  rankingRank: string;
  rankingScope: string;
  rankingSource: string;
  rankingSourceUrl: string;
};

// Résultat d'un appel saveDraft() — distingue explicitement un conflit de
// version (409, expected_updated_at périmé) d'une autre erreur, pour que
// chaque appelant puisse afficher le bon message (CMS-F.3 §16 : jamais de
// ré-écrasement silencieux).
type SaveDraftResult =
  | { ok: true; draft: SchoolPageDraftRow }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: string };

export default function ModifierMaPagePage() {
  const { school: activeSchool, user, loading: schoolLoading } = useSchool();
  const [school, setSchool] = useState<any>(null);
  const [fees, setFees] = useState<any | null>(null);
  const [infra, setInfra] = useState<any | null>(null);
  const [images, setImages] = useState<any[]>([]);
  const [docsList, setDocsList] = useState<any[]>([]);
  const [newsList, setNewsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // CMS-F.2/F.3 — état du brouillon (source de vérité pour les 8 domaines
  // GLOBAL DRAFT). draftUpdatedAt sert de jeton de concurrence optimiste
  // (expected_updated_at) sur chaque PATCH.
  const [draftPayload, setDraftPayload] = useState<SchoolPageDraftPayload | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [draftIsDirty, setDraftIsDirty] = useState(false);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("loading");
  const loadRequestIdRef = useRef(0);

  const [order, setOrder] = useState<SectionKey[]>(DEFAULT_ORDER);
  const [visibility, setVisibility] = useState<Record<SectionKey, boolean>>(
    () => Object.fromEntries(DEFAULT_ORDER.map((k) => [k, true])) as Record<SectionKey, boolean>
  );

  const [admissionsConfig, setAdmissionsConfig] = useState<AdmissionsConfig | null>(null);
  // Admissions ouvertes/fermées (is_open) — IMMEDIATE LIVE, jamais dans le
  // brouillon (CMS-F.3 §11). État de sauvegarde séparé de drawerSaveState
  // car ce toggle n'attend pas le bouton "Enregistrer" du tiroir.
  const [admissionsOpenSaving, setAdmissionsOpenSaving] = useState(false);
  const [admissionsOpenError, setAdmissionsOpenError] = useState<string | null>(null);

  // Hero — mutation réelle immédiate sur le BROUILLON (CMS-F.3 §8 : la
  // galerie elle-même reste live, seul le mode d'affichage devient draft —
  // hybride temporaire intentionnel, documenté ci-dessous).
  const [heroSaveState, setHeroSaveState] = useState<SaveState>("idle");
  const [heroError, setHeroError] = useState<string | null>(null);

  // Galerie CMS-C — mutation réelle immédiate (Mode A, pas de brouillon :
  // CMS-F.3 §13, la mise en scène de la galerie est différée à CMS-F.6).
  // galleryDeletingId distinct de galleryUploading pour ne jamais
  // désactiver tout le panneau pendant une suppression ciblée.
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryDeletingId, setGalleryDeletingId] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Actualités CMS-E — mutation réelle immédiate (Mode A), même famille que
  // Galerie/Documents. newsForm sert à la fois à créer (newsEditingId=null)
  // et à éditer (newsEditingId=id de l'annonce en cours d'édition).
  // PUBLIC-SITE-04 — event_date/event_start_time are optional: null for an
  // ordinary announcement, populated for a real calendar event. Empty
  // string in the form maps to null on submit, never an empty-string date.
  const [newsForm, setNewsForm] = useState({ title: "", content: "", is_important: false, event_date: "", event_start_time: "" });
  const [newsEditingId, setNewsEditingId] = useState<string | null>(null);
  const [newsSaving, setNewsSaving] = useState(false);
  const [newsDeletingId, setNewsDeletingId] = useState<string | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Documents CMS-E — même pattern que Galerie (upload/suppression immédiats).
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("fiche");
  const [docAcademicYear, setDocAcademicYear] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [docDeletingId, setDocDeletingId] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // PUBLIC-SITE-02 §5 — Résultats d'examens : même pattern que Galerie
  // (ajout immédiat draft_pending_add via POST, suppression conditionnée
  // au statut — draft_pending_add supprimé immédiatement, live marqué dans
  // results.remove_ids via saveDraft).
  const [examResults, setExamResults] = useState<any[]>([]);
  const [resultForm, setResultForm] = useState({ exam: "", academicYear: "", candidates: "", admitted: "", rate: "" });
  const [resultSaving, setResultSaving] = useState(false);
  const [resultDeletingId, setResultDeletingId] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const [activeDrawer, setActiveDrawer] = useState<DrawerKey | null>(null);
  const [formDraft, setFormDraft] = useState<FormDraft | null>(null);

  const [drawerSaveState, setDrawerSaveState] = useState<SaveState>("idle");
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [sectionsSaveState, setSectionsSaveState] = useState<SaveState>("idle");
  const sectionsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      const requestId = ++loadRequestIdRef.current;

      if (schoolLoading) return;
      if (!user || !activeSchool) {
        setLoading(false);
        setDraftLoading(false);
        return;
      }

      // CMS-F.3 §5 — changement d'école active : jamais montrer/éditer le
      // brouillon de l'école précédente pendant le chargement de la
      // nouvelle. Réinitialisation immédiate + squelette de page
      // (loading=true couvre déjà tout l'éditeur, y compris les sections
      // draft) avant tout appel réseau.
      setLoading(true);
      setDraftPayload(null);
      setDraftUpdatedAt(null);
      setDraftIsDirty(false);
      setDraftError(null);
      setDraftStatus("loading");
      setDraftLoading(true);

      // Champs CMS-only absents de SchoolData (partagé par tout /dashboard/ecole) —
      // complément scopé par l'établissement ACTIF déjà résolu, pas une
      // deuxième résolution d'établissement.
      const { data: extra } = await supabase
        .from("establishments")
        .select("cover_image_url, latitude, longitude, hero_mode")
        .eq("id", activeSchool.id)
        .maybeSingle();

      if (loadRequestIdRef.current !== requestId) return; // école déjà changée depuis

      const schoolData = { ...activeSchool, ...extra };

      const [
        { data: feesData },
        { data: infraData },
        { data: imagesData },
        { data: docsData },
        { data: admissionsData },
        { data: newsData },
        { data: resultsData },
        draftResult,
      ] = await Promise.all([
        supabase.from("fees").select("*").eq("establishment_id", schoolData.id).maybeSingle(),
        supabase.from("infrastructures").select("*").eq("establishment_id", schoolData.id).maybeSingle(),
        supabase.from("school_images").select("*").eq("establishment_id", schoolData.id).order("created_at", { ascending: false }),
        supabase.from("school_documents").select("*").eq("establishment_id", schoolData.id).order("created_at", { ascending: false }),
        // admissions_config (migration 0025) — 0 ligne = comportement par
        // défaut, pas d'erreur. is_open reste immediate-live (CMS-F.3 §11).
        supabase.from("admissions_config").select("is_open, levels, conditions, required_documents, period_start, period_end, additional_info").eq("establishment_id", schoolData.id).maybeSingle(),
        // CMS-E — liste de gestion (création/édition/suppression) distincte
        // de l'aperçu public (AnnouncementsTab, laissé inchangé, auto-fetch).
        supabase.from("school_announcements").select("*").eq("establishment_id", schoolData.id).order("created_at", { ascending: false }),
        // PUBLIC-SITE-02 — migration 0035, pas encore exécutée : la requête
        // renvoie {data: null, error} (relation inexistante) tant qu'elle
        // ne l'est pas — resultsData reste simplement null, aucun résultat
        // affiché, le reste de l'éditeur continue de fonctionner.
        supabase.from("school_exam_results").select("*").eq("establishment_id", schoolData.id).order("academic_year", { ascending: false }),
        // CMS-F.2/F.3 — GET du brouillon en parallèle des chargements live
        // existants. Enveloppé pour ne jamais faire échouer tout le
        // Promise.all (donc bloquer les domaines immediate-live) si le
        // brouillon échoue à charger.
        fetch("/api/school-page/draft")
          .then(async (res) => {
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
            return { ok: true as const, draft: json.draft as SchoolPageDraftRow };
          })
          .catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "Échec du chargement du brouillon" })),
      ]);

      if (loadRequestIdRef.current !== requestId) return; // école déjà changée depuis (réponse tardive ignorée)

      setSchool(schoolData);
      if (feesData) setFees(feesData);
      if (infraData) setInfra(infraData);
      if (imagesData) setImages(imagesData);
      if (docsData) setDocsList(docsData);
      if (admissionsData) setAdmissionsConfig(admissionsData as AdmissionsConfig);
      if (newsData) setNewsList(newsData);
      if (resultsData) setExamResults(resultsData);

      if ("error" in draftResult) {
        setDraftError(draftResult.error);
        setDraftStatus("error");
      } else {
        const draft = draftResult.draft;
        setDraftPayload(draft.payload);
        setDraftUpdatedAt(draft.updated_at);
        setDraftIsDirty(draft.is_dirty);
        setDraftStatus(draft.is_dirty ? "dirty" : "loaded");
        const nextOrder = [...draft.payload.sections].sort((a, b) => a.position - b.position).map((s) => DB_KEY_TO_SECTION[s.section_key]);
        const byKey = Object.fromEntries(draft.payload.sections.map((s) => [DB_KEY_TO_SECTION[s.section_key], s]));
        setOrder(nextOrder);
        setVisibility(Object.fromEntries(DEFAULT_ORDER.map((k) => [k, byKey[k]?.is_visible ?? true])) as Record<SectionKey, boolean>);
      }
      setDraftLoading(false);
      setLoading(false);
    }
    load();
  }, [activeSchool, user, schoolLoading]);

  // CMS-F.6 — Galerie effective de l'éditeur : mêmes formules que
  // /api/school-page/preview (mission §9) — live MOINS gallery.remove_ids,
  // PLUS draft_pending_add. `images` reste la requête brute (les DEUX
  // statuts, jamais un helper "public" qui filtrerait déjà) ; ces deux
  // listes dérivées sont ce que l'éditeur affiche réellement.
  const galleryRemoveIds = useMemo(() => new Set(draftPayload?.gallery.remove_ids ?? []), [draftPayload]);
  const effectiveImages = useMemo(
    () => images.filter((img: any) => (img.status === "live" ? !galleryRemoveIds.has(img.id) : img.status === "draft_pending_add")),
    [images, galleryRemoveIds]
  );
  const pendingRemoveImages = useMemo(
    () => images.filter((img: any) => img.status === "live" && galleryRemoveIds.has(img.id)),
    [images, galleryRemoveIds]
  );

  // PUBLIC-SITE-02 — même formule que la Galerie effective.
  const resultRemoveIds = useMemo(() => new Set(draftPayload?.results.remove_ids ?? []), [draftPayload]);
  const effectiveResults = useMemo(
    () => examResults.filter((r: any) => (r.status === "live" ? !resultRemoveIds.has(r.id) : r.status === "draft_pending_add")),
    [examResults, resultRemoveIds]
  );
  const pendingRemoveResults = useMemo(
    () => examResults.filter((r: any) => r.status === "live" && resultRemoveIds.has(r.id)),
    [examResults, resultRemoveIds]
  );

  // CMS-C.1 — résolution partagée avec le rendu public (src/lib/school/heroMode.ts).
  // CMS-F.3 §8 : le MODE vient du brouillon. CMS-F.6 : les diapositives
  // viennent désormais de la Galerie EFFECTIVE (plus un hybride live figé)
  // — l'éditeur montre ce qui sera réellement publié après Publish, tout
  // comme l'Aperçu.
  const heroMode: HeroMode = draftPayload?.hero_mode ?? (school?.hero_mode as HeroMode | undefined) ?? "carousel";
  const allHeroSlides = useMemo(
    () => computeAllHeroSlides(effectiveImages.map((img: any) => ({ id: img.id, url: img.url })), school?.cover_image_url),
    [effectiveImages, school?.cover_image_url]
  );
  const heroSlides = useMemo(() => resolveHeroSlides(allHeroSlides, heroMode), [allHeroSlides, heroMode]);

  // Fusionne le payload courant du brouillon avec les changements d'UN
  // domaine, puis PATCH le payload COMPLET (CMS-F.3 §15 : jamais de
  // payload partiel construit depuis zéro — préserve automatiquement tous
  // les autres domaines, y compris gallery.remove_ids, §13).
  async function saveDraft(domainOverride: Partial<SchoolPageDraftPayload>): Promise<SaveDraftResult> {
    if (!draftPayload) {
      return { ok: false, conflict: false, error: "Brouillon non chargé" };
    }
    const nextPayload: SchoolPageDraftPayload = { ...draftPayload, ...domainOverride };
    setDraftStatus("saving");
    try {
      const res = await fetch("/api/school-page/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...nextPayload, expected_updated_at: draftUpdatedAt }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setDraftStatus("conflict");
        return { ok: false, conflict: true };
      }
      if (!res.ok) {
        setDraftStatus(draftIsDirty ? "dirty" : "loaded");
        return { ok: false, conflict: false, error: json.error ?? `Erreur ${res.status}` };
      }

      const draft = json.draft as SchoolPageDraftRow;
      setDraftPayload(draft.payload);
      setDraftUpdatedAt(draft.updated_at);
      setDraftIsDirty(draft.is_dirty); // CMS-F.3 §18 : ne redevient jamais false ici
      setDraftStatus("saved");
      setTimeout(() => setDraftStatus((s) => (s === "saved" ? "dirty" : s)), 1500);
      return { ok: true, draft };
    } catch (e) {
      setDraftStatus(draftIsDirty ? "dirty" : "loaded");
      return { ok: false, conflict: false, error: e instanceof Error ? e.message : "Erreur réseau" };
    }
  }

  // Publier (CMS-F.5C) — POST /api/school-page/publish, qui n'accepte que
  // expected_updated_at (jamais establishment_id, jamais le payload : voir
  // la route). Le serveur appelle public.publish_school_page(), déjà testé
  // en conditions réelles (CMS-F.5B/F.5B.1) pour l'atomicité, le rollback
  // complet en cas d'échec, les gardes Gallery, la préservation de
  // is_open, et l'isolation multi-écoles.
  async function publishDraft() {
    if (!draftPayload || !draftUpdatedAt) return;
    if (!draftIsDirty) return; // le bouton est déjà désactivé dans ce cas — garde défensive
    if (draftStatus === "publishing") return; // anti double-clic

    setDraftStatus("publishing");
    setDraftError(null);
    try {
      const res = await fetch("/api/school-page/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_updated_at: draftUpdatedAt }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // CMS-F.5C §7 — jamais de ré-essai automatique ni d'écrasement :
        // seul le mécanisme "Recharger" existant (CMS-F.3 §16) doit resynchroniser.
        setDraftStatus("conflict");
        return;
      }

      if (!res.ok) {
        const code = json.error_code as string | undefined;
        if (code === "GALLERY_INVALID") {
          // CMS-F.6 — le brouillon référence une image de galerie
          // invalide (étrangère, déjà supprimée, ou plus en statut live).
          // Recharger corrige quasi toujours ce cas (état Galerie périmé).
          setDraftError(
            "La galerie de votre brouillon contient une référence invalide (photo déjà supprimée ou modifiée ailleurs) — rechargez le brouillon avant de réessayer."
          );
        } else if (code === "NO_CHANGES") {
          setDraftError("Aucune modification à publier — le brouillon est déjà identique à la version publiée.");
        } else if (code === "INVALID_DRAFT") {
          setDraftError(`Le brouillon contient une erreur qui empêche la publication : ${json.error ?? "brouillon invalide"}.`);
        } else {
          setDraftError(json.error ?? "La publication a échoué. Aucune modification n'a été appliquée.");
        }
        setDraftStatus(draftIsDirty ? "dirty" : "loaded");
        return;
      }

      // Succès — ne jamais faire semblant localement que le brouillon est
      // propre : recharger la version faisant autorité depuis le serveur
      // (CMS-F.5C §6), exactement comme reloadDraft().
      const draftRes = await fetch("/api/school-page/draft");
      const draftJson = await draftRes.json().catch(() => ({}));
      if (draftRes.ok && draftJson.draft) {
        const draft = draftJson.draft as SchoolPageDraftRow;
        setDraftPayload(draft.payload);
        setDraftUpdatedAt(draft.updated_at);
        setDraftIsDirty(draft.is_dirty);
        const nextOrder = [...draft.payload.sections].sort((a, b) => a.position - b.position).map((s) => DB_KEY_TO_SECTION[s.section_key]);
        const byKey = Object.fromEntries(draft.payload.sections.map((s) => [DB_KEY_TO_SECTION[s.section_key], s]));
        setOrder(nextOrder);
        setVisibility(Object.fromEntries(DEFAULT_ORDER.map((k) => [k, byKey[k]?.is_visible ?? true])) as Record<SectionKey, boolean>);
        setDraftStatus("published");
        setTimeout(() => setDraftStatus((s) => (s === "published" ? (draft.is_dirty ? "dirty" : "loaded") : s)), 2000);
      } else {
        // Publication réussie mais le rechargement a échoué : ne jamais
        // prétendre localement que le brouillon est propre sans preuve
        // serveur — afficher "Publié" transitoirement puis un état honnête.
        setDraftStatus("published");
        setTimeout(() => setDraftStatus("error"), 2000);
        setDraftError("Publication réussie, mais le rechargement du brouillon a échoué — rechargez la page.");
      }
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Erreur réseau lors de la publication");
      setDraftStatus(draftIsDirty ? "dirty" : "loaded");
    }
  }

  // Abandonner les modifications (CMS-F.7) — POST
  // /api/school-page/draft/discard, qui n'accepte que expected_updated_at
  // (jamais establishment_id, jamais un id d'image : voir la route).
  // Remet le brouillon à l'identique de LIVE et abandonne toute photo
  // draft_pending_add — jamais une image live touchée. Même discipline que
  // publishDraft() : succès confirmé uniquement par un rechargement
  // serveur, jamais une mise à jour locale optimiste.
  async function discardDraft() {
    if (!draftPayload || !draftUpdatedAt) return;
    // canDiscard inclut déjà draftStatus !== "discarding" — anti double-clic
    // garanti par cette seule garde, jamais une deuxième vérification
    // redondante du même état.
    if (!canDiscard) return; // le bouton est déjà désactivé dans ce cas — garde défensive

    setDraftStatus("discarding");
    setDraftError(null);
    try {
      const res = await fetch("/api/school-page/draft/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_updated_at: draftUpdatedAt }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // CMS-F.7 §14 — jamais de ré-essai automatique ni d'écrasement :
        // seul le mécanisme "Recharger" existant doit resynchroniser.
        setDraftStatus("conflict");
        return;
      }

      if (!res.ok) {
        const code = json.error_code as string | undefined;
        if (code === "NO_CHANGES") {
          setDraftError("Aucune modification à abandonner — le brouillon est déjà identique à la version publiée.");
        } else {
          setDraftError(json.error ?? "L'abandon des modifications a échoué. Aucune modification n'a été appliquée.");
        }
        setDraftStatus(draftIsDirty ? "dirty" : "loaded");
        return;
      }

      // Succès — recharge la version faisant autorité depuis le serveur
      // (jamais une mise à jour locale optimiste), ainsi que la Galerie :
      // le Discard supprime les lignes draft_pending_add côté serveur, le
      // tiroir Galerie de l'éditeur doit donc refléter la même vérité,
      // jamais un état local périmé.
      const [draftRes, imagesRes] = await Promise.all([
        fetch("/api/school-page/draft"),
        school ? supabase.from("school_images").select("*").eq("establishment_id", school.id).order("created_at", { ascending: false }) : Promise.resolve(null),
      ]);
      const draftJson = await draftRes.json().catch(() => ({}));
      if (imagesRes && "data" in imagesRes && imagesRes.data) setImages(imagesRes.data);

      if (draftRes.ok && draftJson.draft) {
        const draft = draftJson.draft as SchoolPageDraftRow;
        setDraftPayload(draft.payload);
        setDraftUpdatedAt(draft.updated_at);
        setDraftIsDirty(draft.is_dirty);
        const nextOrder = [...draft.payload.sections].sort((a, b) => a.position - b.position).map((s) => DB_KEY_TO_SECTION[s.section_key]);
        const byKey = Object.fromEntries(draft.payload.sections.map((s) => [DB_KEY_TO_SECTION[s.section_key], s]));
        setOrder(nextOrder);
        setVisibility(Object.fromEntries(DEFAULT_ORDER.map((k) => [k, byKey[k]?.is_visible ?? true])) as Record<SectionKey, boolean>);
        setDraftStatus("discarded");
        setTimeout(() => setDraftStatus((s) => (s === "discarded" ? (draft.is_dirty ? "dirty" : "loaded") : s)), 2000);
      } else {
        setDraftStatus("discarded");
        setTimeout(() => setDraftStatus("error"), 2000);
        setDraftError("Modifications abandonnées, mais le rechargement du brouillon a échoué — rechargez la page.");
      }
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Erreur réseau lors de l'abandon des modifications");
      setDraftStatus(draftIsDirty ? "dirty" : "loaded");
    }
  }

  // "Recharger" (bandeau de conflit, CMS-F.3 §16) — jamais de ré-essai
  // automatique qui écraserait la version distante, seulement un rechargement
  // explicite déclenché par l'utilisateur.
  async function reloadDraft() {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/school-page/draft");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      const draft = json.draft as SchoolPageDraftRow;
      setDraftPayload(draft.payload);
      setDraftUpdatedAt(draft.updated_at);
      setDraftIsDirty(draft.is_dirty);
      setDraftStatus(draft.is_dirty ? "dirty" : "loaded");
      const nextOrder = [...draft.payload.sections].sort((a, b) => a.position - b.position).map((s) => DB_KEY_TO_SECTION[s.section_key]);
      const byKey = Object.fromEntries(draft.payload.sections.map((s) => [DB_KEY_TO_SECTION[s.section_key], s]));
      setOrder(nextOrder);
      setVisibility(Object.fromEntries(DEFAULT_ORDER.map((k) => [k, byKey[k]?.is_visible ?? true])) as Record<SectionKey, boolean>);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Échec du rechargement");
    } finally {
      setDraftLoading(false);
    }
  }

  async function updateHeroMode(mode: HeroMode) {
    setHeroError(null);
    setHeroSaveState("saving");
    const result = await saveDraft({ hero_mode: mode });
    if ("draft" in result) {
      setHeroSaveState("saved");
      setTimeout(() => setHeroSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } else {
      setHeroSaveState("error");
      setHeroError("error" in result ? result.error : "Ce brouillon a été modifié ailleurs. Rechargez les dernières modifications.");
    }
  }

  // Admissions ouvertes/fermées — IMMEDIATE LIVE (CMS-F.3 §11). Envoie
  // UNIQUEMENT is_open à la route live existante ; celle-ci ne construit son
  // payload qu'à partir des clés présentes dans le corps de la requête
  // (audité, non modifié — voir rapport), donc les champs descriptifs live
  // (déjà obsolètes depuis le cutover, jamais relus) ne sont jamais
  // écrasés par ce toggle.
  async function toggleAdmissionsOpen(value: boolean) {
    setAdmissionsOpenError(null);
    setAdmissionsOpenSaving(true);
    try {
      const res = await fetch("/api/school-page/admissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_open: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setAdmissionsConfig((prev) => ({ ...(prev ?? ({} as AdmissionsConfig)), is_open: value }));
      setFormDraft((p) => (p ? { ...p, admissionsOpen: value } : p));
    } catch (e) {
      setAdmissionsOpenError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setAdmissionsOpenSaving(false);
    }
  }

  // Rendu toujours dérivé du BROUILLON pour les domaines GLOBAL DRAFT
  // (CMS-F.3 §4 : l'éditeur ne doit plus lire directement school/fees/infra
  // pour ces champs), avec repli sur la valeur live tant que le brouillon
  // n'est pas encore chargé. Les champs live-only (name, is_verified,
  // subscription_plan, neighborhood, main_category, latitude/longitude,
  // cover_image_url) viennent toujours de `school`, jamais du brouillon.
  const draftSchool = useMemo(() => school ? {
    ...school,
    description: draftPayload?.presentation.description ?? school.description,
    phone: draftPayload?.contact.phone ?? school.phone,
    email: draftPayload?.contact.email ?? school.email,
    website: draftPayload?.contact.website ?? school.website,
    address: draftPayload?.contact.address ?? school.address,
    city: draftPayload?.contact.city ?? school.city,
  } : null, [school, draftPayload]);

  const draftFeesView = useMemo(() => draftPayload ? { ...draftPayload.pricing, currency: fees?.currency ?? "FCFA" } : fees, [draftPayload, fees]);
  const draftInfraView = useMemo(() => draftPayload?.infrastructure ?? infra, [draftPayload, infra]);

  // Admissions — is_open reste live, les champs descriptifs viennent du
  // brouillon (aperçu de l'éditeur cohérent avec ce qui sera réellement
  // publié après un futur Publish).
  const mergedAdmissionsConfig: AdmissionsConfig | null = useMemo(() => {
    if (!draftPayload) return admissionsConfig;
    return {
      is_open: admissionsConfig?.is_open ?? true,
      levels: draftPayload.admissions.levels,
      conditions: draftPayload.admissions.conditions,
      required_documents: draftPayload.admissions.required_documents,
      period_start: draftPayload.admissions.period_start,
      period_end: draftPayload.admissions.period_end,
      additional_info: draftPayload.admissions.additional_info,
    };
  }, [draftPayload, admissionsConfig]);

  const hasUnsavedChanges =
    draftIsDirty ||
    order.some((k, i) => k !== DEFAULT_ORDER[i]) ||
    Object.values(visibility).some((v) => v === false);

  // CMS-F.5C §4 — l'éligibilité au Publish vient exclusivement du brouillon
  // chargé côté serveur (is_dirty), jamais d'un état d'édition local non
  // enregistré (un tiroir ouvert avec des modifications non sauvegardées
  // n'affecte pas ce calcul — ces modifications ne sont pas dans le
  // brouillon tant qu'"Enregistrer" n'a pas été cliqué).
  const canPublish =
    !!draftPayload &&
    !draftLoading &&
    draftIsDirty &&
    draftStatus !== "publishing" &&
    draftStatus !== "conflict" &&
    draftStatus !== "error";

  // CMS-F.7 §11 — même discipline que canPublish : jamais inféré d'un champ
  // local non enregistré. draftIsDirty seul ne suffit pas ici : un upload
  // Galerie écrit directement school_images en draft_pending_add sans
  // jamais toucher is_dirty (CMS-F.6) — il y a donc quelque chose à
  // abandonner dès qu'UNE des deux conditions est vraie.
  const hasPendingAddImages = images.some((img: any) => img.status === "draft_pending_add");
  const canDiscard =
    !!draftPayload &&
    !draftLoading &&
    (draftIsDirty || hasPendingAddImages) &&
    draftStatus !== "publishing" &&
    draftStatus !== "discarding" &&
    draftStatus !== "conflict" &&
    draftStatus !== "error";

  // Planifie une sauvegarde débouncée de l'ordre/visibilité vers le
  // brouillon (jamais vers /api/school-page/sections après le cutover,
  // CMS-F.3 §12). Appelé explicitement par les mutateurs ci-dessous —
  // jamais par un effet générique sur [order, visibility], pour ne jamais
  // déclencher une sauvegarde quand order/visibility sont simplement
  // synchronisés depuis un brouillon qui vient de charger.
  function scheduleSectionsSave(nextOrder: SectionKey[], nextVisibility: Record<SectionKey, boolean>) {
    if (!draftPayload) return; // brouillon pas encore chargé — rien à fusionner
    setSectionsSaveState("saving");
    if (sectionsSaveTimer.current) clearTimeout(sectionsSaveTimer.current);
    sectionsSaveTimer.current = setTimeout(async () => {
      const result = await saveDraft({
        sections: nextOrder.map((key, i) => ({
          section_key: SECTION_TO_DB_KEY[key],
          position: i,
          is_visible: nextVisibility[key],
        })),
      });
      setSectionsSaveState(result.ok ? "saved" : "error");
    }, 600);
  }

  function moveSection(key: SectionKey, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      scheduleSectionsSave(next, visibility);
      return next;
    });
  }

  function toggleVisibility(key: SectionKey) {
    setVisibility((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      scheduleSectionsSave(order, next);
      return next;
    });
  }

  function resetDraft() {
    setOrder(DEFAULT_ORDER);
    const resetVisibility = Object.fromEntries(DEFAULT_ORDER.map((k) => [k, true])) as Record<SectionKey, boolean>;
    setVisibility(resetVisibility);
    scheduleSectionsSave(DEFAULT_ORDER, resetVisibility);
  }

  function openDrawer(key: DrawerKey) {
    if (!draftSchool || !draftPayload) return; // brouillon pas encore chargé — rien à éditer
    setFormDraft({
      description: draftPayload.presentation.description,
      motto: draftPayload.presentation.motto ?? "",
      history: draftPayload.presentation.history ?? "",
      mission: draftPayload.presentation.mission ?? "",
      vision: draftPayload.presentation.vision ?? "",
      phone: draftPayload.contact.phone ?? "",
      email: draftPayload.contact.email ?? "",
      website: draftPayload.contact.website ?? "",
      address: draftPayload.contact.address ?? "",
      city: draftPayload.contact.city ?? "",
      fees: Object.fromEntries(FEE_COLS.map((f) => [f.key, draftPayload.pricing[f.key] != null ? String(draftPayload.pricing[f.key]) : ""])),
      pricing: structuredClone(draftPayload.pricing),
      infra: Object.fromEntries(Object.keys(INFRA_LABELS).map((k) => [k, !!draftPayload.infrastructure[k]])),
      admissionsOpen: admissionsConfig?.is_open ?? true, // reste live (immediate)
      admissionsLevels: (draftPayload.admissions.levels ?? []).join("\n"),
      admissionsConditions: draftPayload.admissions.conditions ?? "",
      admissionsDocuments: (draftPayload.admissions.required_documents ?? []).join("\n"),
      admissionsPeriodStart: draftPayload.admissions.period_start ?? "",
      admissionsPeriodEnd: draftPayload.admissions.period_end ?? "",
      admissionsAdditionalInfo: draftPayload.admissions.additional_info ?? "",
      foundingYear: draftPayload.key_numbers.founding_year != null ? String(draftPayload.key_numbers.founding_year) : "",
      studentCount: draftPayload.key_numbers.student_count != null ? String(draftPayload.key_numbers.student_count) : "",
      teacherCount: draftPayload.key_numbers.teacher_count != null ? String(draftPayload.key_numbers.teacher_count) : "",
      rankingYear: draftPayload.ranking?.year != null ? String(draftPayload.ranking.year) : "",
      rankingRank: draftPayload.ranking?.rank ?? "",
      rankingScope: draftPayload.ranking?.scope ?? "",
      rankingSource: draftPayload.ranking?.source ?? "",
      rankingSourceUrl: draftPayload.ranking?.source_url ?? "",
    });
    setActiveDrawer(key);
  }

  function closeDrawer() {
    setActiveDrawer(null);
    setFormDraft(null);
    setDrawerSaveState("idle");
    setDrawerError(null);
  }

  // CMS-F.3 — chaque branche sauvegarde désormais vers le BROUILLON via
  // saveDraft() (jamais vers les anciennes routes live /presentation,
  // /contact, /pricing, /infrastructure) sauf Hero (déjà géré séparément
  // par updateHeroMode(), hors applyDrawer()) et is_open dans Admissions
  // (toggleAdmissionsOpen(), immediate-live, hors applyDrawer() aussi).
  async function applyDrawer() {
    if (!formDraft || !activeDrawer || !draftPayload) return;

    setDrawerSaveState("saving");
    setDrawerError(null);
    try {
      let result: SaveDraftResult | null = null;

      if (activeDrawer === "presentation") {
        result = await saveDraft({
          presentation: {
            description: formDraft.description,
            motto: formDraft.motto.trim() || null,
            history: formDraft.history.trim() || null,
            mission: formDraft.mission.trim() || null,
            vision: formDraft.vision.trim() || null,
          },
        });
      } else if (activeDrawer === "contact") {
        result = await saveDraft({
          contact: {
            phone: formDraft.phone,
            email: formDraft.email,
            website: formDraft.website,
            address: formDraft.address,
            city: formDraft.city,
          },
        });
      } else if (activeDrawer === "tarifs") {
        // Champ vide → NULL (jamais 0 pour "non renseigné", CMS-D §9).
        const legacyPricing = Object.fromEntries(
          FEE_COLS.map((f) => [f.key, formDraft.fees[f.key]?.trim() ? Number(formDraft.fees[f.key]) : null])
        );
        result = await saveDraft({ pricing: { ...formDraft.pricing, ...legacyPricing } });
      } else if (activeDrawer === "infrastructures") {
        result = await saveDraft({ infrastructure: formDraft.infra });
      } else if (activeDrawer === "admissions") {
        // Configuration PUBLIQUE descriptive UNIQUEMENT — is_open n'est
        // JAMAIS envoyé ici (CMS-F.3 §11, déjà sauvegardé immédiatement par
        // toggleAdmissionsOpen()). Une ligne par item de texte, lignes
        // vides ignorées ; le serveur revalide/tronque de toute façon.
        result = await saveDraft({
          admissions: {
            levels: formDraft.admissionsLevels.split("\n").map((s) => s.trim()).filter(Boolean),
            conditions: formDraft.admissionsConditions.trim() || null,
            required_documents: formDraft.admissionsDocuments.split("\n").map((s) => s.trim()).filter(Boolean),
            period_start: formDraft.admissionsPeriodStart || null,
            period_end: formDraft.admissionsPeriodEnd || null,
            additional_info: formDraft.admissionsAdditionalInfo.trim() || null,
          },
        });
      } else if (activeDrawer === "cles") {
        result = await saveDraft({
          key_numbers: {
            founding_year: formDraft.foundingYear.trim() ? Number(formDraft.foundingYear) : null,
            student_count: formDraft.studentCount.trim() ? Number(formDraft.studentCount) : null,
            teacher_count: formDraft.teacherCount.trim() ? Number(formDraft.teacherCount) : null,
          },
        });
      } else if (activeDrawer === "classement") {
        // §6 — year/rank/scope/source requis ENSEMBLE ; si l'un des 4 est
        // vide, on efface le classement entier (null) plutôt que d'envoyer
        // un objet à moitié rempli que le serveur rejetterait de toute
        // façon (jamais un classement "officiel" sans provenance complète).
        const hasAllRequired = formDraft.rankingYear.trim() && formDraft.rankingRank.trim() && formDraft.rankingScope.trim() && formDraft.rankingSource.trim();
        result = await saveDraft({
          ranking: hasAllRequired
            ? {
                year: Number(formDraft.rankingYear),
                rank: formDraft.rankingRank.trim(),
                scope: formDraft.rankingScope.trim(),
                source: formDraft.rankingSource.trim(),
                source_url: formDraft.rankingSourceUrl.trim() || null,
              }
            : null,
        });
      }

      if (!result) {
        setDrawerSaveState("idle");
        return;
      }
      if ("draft" in result) {
        setDrawerSaveState("saved");
        setTimeout(() => closeDrawer(), 700);
      } else if ("error" in result) {
        setDrawerSaveState("error");
        setDrawerError(result.error);
      } else {
        setDrawerSaveState("error");
        setDrawerError("Ce brouillon a été modifié ailleurs. Rechargez les dernières modifications.");
      }
    } catch (e) {
      setDrawerSaveState("error");
      setDrawerError(e instanceof Error ? e.message : "Erreur d'enregistrement");
    }
  }

  // Galerie CMS-C §6 / CMS-F.6 Gallery Draft Lifecycle — upload via
  // /api/school-page/gallery (multipart, autorisation + validation
  // MIME/taille recalculées côté serveur — jamais de confiance dans le
  // navigateur, voir la route). CMS-F.6 : la photo est insérée
  // status='draft_pending_add' côté serveur — elle apparaît ici et dans
  // l'Aperçu, jamais sur la fiche publique tant que le brouillon n'est pas
  // publié.
  async function uploadGalleryImage(file: File) {
    setGalleryError(null);
    setGalleryUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/school-page/gallery", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setImages((prev: any[]) => [json.image, ...prev]);
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "Échec de l'envoi");
    } finally {
      setGalleryUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  // CMS-F.6 §6/§8 — la suppression se comporte différemment selon le
  // statut de la photo, jamais un chemin unique :
  //   - draft_pending_add : jamais publiée, suppression réelle immédiate
  //     via /api/school-page/gallery (Storage + DB, la route gère l'ordre).
  //   - live : reste publiée jusqu'au Publish — l'intention de suppression
  //     est enregistrée dans gallery.remove_ids via le chemin normal de
  //     sauvegarde du brouillon (saveDraft, payload complet), jamais une
  //     suppression Storage/DB immédiate.
  async function deleteGalleryImage(image: { id: string; status?: string }) {
    setGalleryError(null);
    setGalleryDeletingId(image.id);
    try {
      if (image.status === "draft_pending_add") {
        const res = await fetch("/api/school-page/gallery", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: image.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setImages((prev: any[]) => prev.filter((img) => img.id !== image.id));
        return;
      }

      // live — marquage brouillon uniquement, jamais de suppression immédiate.
      const currentRemoveIds = draftPayload?.gallery.remove_ids ?? [];
      if (currentRemoveIds.includes(image.id)) return; // déjà marquée
      const result = await saveDraft({ gallery: { remove_ids: [...currentRemoveIds, image.id] } });
      if ("error" in result) {
        setGalleryError(result.error);
      } else if (!("draft" in result)) {
        setGalleryError("Ce brouillon a été modifié ailleurs. Rechargez les dernières modifications.");
      }
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setGalleryDeletingId(null);
    }
  }

  // CMS-F.6 §7 — annule une suppression planifiée : retire uniquement cet
  // id de gallery.remove_ids, ne touche jamais la ligne school_images ni
  // Storage. La fiche publique reste inchangée tout du long.
  async function undoRemoveGalleryImage(imageId: string) {
    setGalleryError(null);
    setGalleryDeletingId(imageId);
    try {
      const currentRemoveIds = draftPayload?.gallery.remove_ids ?? [];
      const result = await saveDraft({ gallery: { remove_ids: currentRemoveIds.filter((id) => id !== imageId) } });
      if ("error" in result) {
        setGalleryError(result.error);
      } else if (!("draft" in result)) {
        setGalleryError("Ce brouillon a été modifié ailleurs. Rechargez les dernières modifications.");
      }
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "Échec de l'annulation");
    } finally {
      setGalleryDeletingId(null);
    }
  }

  // PUBLIC-SITE-02 §5/§7 — Résultats d'examens, exact même pattern que la
  // Galerie : ajout immédiat draft_pending_add via POST (jamais 'live'
  // directement), suppression conditionnée au statut.
  async function addExamResult() {
    setResultError(null);
    if (!resultForm.exam.trim() || !resultForm.academicYear.trim()) {
      setResultError("Examen et année requis");
      return;
    }
    setResultSaving(true);
    try {
      const res = await fetch("/api/school-page/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam: resultForm.exam.trim(),
          academic_year: Number(resultForm.academicYear),
          candidates_count: resultForm.candidates.trim() ? Number(resultForm.candidates) : null,
          admitted_count: resultForm.admitted.trim() ? Number(resultForm.admitted) : null,
          success_rate_percent: resultForm.rate.trim() ? Number(resultForm.rate) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setExamResults((prev: any[]) => [json.result, ...prev]);
      setResultForm({ exam: "", academicYear: "", candidates: "", admitted: "", rate: "" });
    } catch (e) {
      setResultError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setResultSaving(false);
    }
  }

  async function deleteExamResult(result: { id: string; status?: string }) {
    setResultError(null);
    setResultDeletingId(result.id);
    try {
      if (result.status === "draft_pending_add") {
        const res = await fetch("/api/school-page/results", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: result.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setExamResults((prev: any[]) => prev.filter((r) => r.id !== result.id));
        return;
      }
      // live — marquage brouillon uniquement, jamais de suppression immédiate.
      const currentRemoveIds = draftPayload?.results.remove_ids ?? [];
      if (currentRemoveIds.includes(result.id)) return;
      const saveResult = await saveDraft({ results: { remove_ids: [...currentRemoveIds, result.id] } });
      if ("error" in saveResult) {
        setResultError(saveResult.error);
      } else if (!("draft" in saveResult)) {
        setResultError("Ce brouillon a été modifié ailleurs. Rechargez les dernières modifications.");
      }
    } catch (e) {
      setResultError(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setResultDeletingId(null);
    }
  }

  async function undoRemoveExamResult(resultId: string) {
    setResultError(null);
    setResultDeletingId(resultId);
    try {
      const currentRemoveIds = draftPayload?.results.remove_ids ?? [];
      const saveResult = await saveDraft({ results: { remove_ids: currentRemoveIds.filter((id) => id !== resultId) } });
      if ("error" in saveResult) {
        setResultError(saveResult.error);
      } else if (!("draft" in saveResult)) {
        setResultError("Ce brouillon a été modifié ailleurs. Rechargez les dernières modifications.");
      }
    } catch (e) {
      setResultError(e instanceof Error ? e.message : "Échec de l'annulation");
    } finally {
      setResultDeletingId(null);
    }
  }

  // Actualités CMS-E — create (newsEditingId=null) ou update (id présent),
  // jamais establishment_id envoyé : résolu côté serveur.
  function startNewsEdit(item: any) {
    setNewsEditingId(item.id);
    setNewsForm({
      title: item.title ?? "",
      content: item.content ?? "",
      is_important: !!item.is_important,
      event_date: item.event_date ?? "",
      event_start_time: item.event_start_time ? item.event_start_time.slice(0, 5) : "",
    });
    setNewsError(null);
  }
  function cancelNewsEdit() {
    setNewsEditingId(null);
    setNewsForm({ title: "", content: "", is_important: false, event_date: "", event_start_time: "" });
    setNewsError(null);
  }

  async function submitNews() {
    setNewsError(null);
    setNewsSaving(true);
    try {
      const payload: any = {
        title: newsForm.title,
        content: newsForm.content,
        is_important: newsForm.is_important,
        event_date: newsForm.event_date || null,
        event_start_time: newsForm.event_date && newsForm.event_start_time ? newsForm.event_start_time : null,
      };
      if (newsEditingId) payload.id = newsEditingId;
      const res = await fetch("/api/school-page/news", {
        method: newsEditingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      if (newsEditingId) {
        setNewsList((prev: any[]) => prev.map((n) => (n.id === newsEditingId ? json.announcement : n)));
      } else {
        setNewsList((prev: any[]) => [json.announcement, ...prev]);
      }
      cancelNewsEdit();
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setNewsSaving(false);
    }
  }

  async function deleteNews(id: string) {
    setNewsError(null);
    setNewsDeletingId(id);
    try {
      const res = await fetch("/api/school-page/news", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setNewsList((prev: any[]) => prev.filter((n) => n.id !== id));
      if (newsEditingId === id) cancelNewsEdit();
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setNewsDeletingId(null);
    }
  }

  // Documents CMS-E — même pattern que Galerie.
  async function uploadDocument(file: File) {
    setDocError(null);
    setDocUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (docName.trim()) form.append("name", docName.trim());
      form.append("type", docType);
      if (docAcademicYear.trim()) form.append("academic_year", docAcademicYear.trim());
      if (docDescription.trim()) form.append("description", docDescription.trim());
      const res = await fetch("/api/school-page/documents", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setDocsList((prev: any[]) => [json.document, ...prev]);
      setDocName("");
      setDocAcademicYear("");
      setDocDescription("");
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "Échec de l'envoi");
    } finally {
      setDocUploading(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  }

  async function deleteDocument(id: string) {
    setDocError(null);
    setDocDeletingId(id);
    try {
      const res = await fetch("/api/school-page/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setDocsList((prev: any[]) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setDocDeletingId(null);
    }
  }

  // --- États non-nominal (chargement / non authentifié / pas de fiche) ---

  if (schoolLoading || loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-8 bg-white rounded-xl w-1/3" />
        <div className="h-64 bg-white border border-border rounded-card" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2">Connexion requise</p>
        <p className="text-sm text-text-secondary mb-4">Connectez-vous pour gérer la page publique de votre établissement.</p>
        <Link href="/auth/connexion" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          Se connecter
        </Link>
      </div>
    );
  }

  if (!school || !draftSchool) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2">Aucun établissement lié à votre compte</p>
        <p className="text-sm text-text-secondary mb-4">Revendiquez ou créez votre établissement pour accéder à l&apos;éditeur de page.</p>
        <Link href="/dashboard/ecole/onboarding" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          Lier mon établissement
        </Link>
      </div>
    );
  }

  // SPRINT RELEASE-INTEGRATION-A — même résolveur central que la fiche
  // publique (src/app/ecole/[id]/page.tsx) : le badge affiché dans l'aperçu
  // éditeur doit être calculé exactement de la même façon que ce que verra
  // réellement le public, jamais un booléen brut recalculé localement.
  const draftTrustState = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(draftSchool));
  const draftTrustBadge = getPrimaryPublicBadge(draftTrustState);
  const address = [draftSchool.address, draftSchool.neighborhood, draftSchool.city].filter(Boolean).join(", ");
  const mapsHref = school.latitude && school.longitude
    ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}`
    : null;

  function renderSectionContent(key: SectionKey) {
    switch (key) {
      case "presentation":
        return <GeneralTab school={draftSchool} fees={draftFeesView} infra={draftInfraView} sections={{ tarifs: false, infrastructures: false }} />;
      case "tarifs":
        return <GeneralTab school={draftSchool} fees={draftFeesView} infra={draftInfraView} pricingMode="admin" sections={{ presentation: false, infrastructures: false }} />;
      case "infrastructures":
        return <GeneralTab school={draftSchool} fees={draftFeesView} infra={draftInfraView} sections={{ presentation: false, tarifs: false }} />;
      case "admissions":
        return <ParentTab schoolId={draftSchool.id} admissionsConfig={mergedAdmissionsConfig} />;
      case "galerie":
        // CMS-F.6 — aperçu de section dérivé de la Galerie EFFECTIVE
        // (live moins remove_ids, plus draft_pending_add), cohérent avec
        // l'Aperçu et ce que Publish produira.
        return (
          <div className="bg-white border border-border rounded-card p-6">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2"><ImageIcon size={14} /> Galerie{effectiveImages.length > 0 ? ` (${effectiveImages.length})` : ""}</h2>
            <SchoolGallery images={effectiveImages.map((img: any) => ({ id: img.id, url: img.url, caption: img.caption }))} />
          </div>
        );
      case "actualites":
        return (
          <div className="bg-white border border-border rounded-card p-6">
            <h2 className="font-bold text-sm mb-4">Actualités</h2>
            <AnnouncementsTab schoolId={draftSchool.id} />
          </div>
        );
      case "documents":
        return (
          <div className="bg-white border border-border rounded-card p-6">
            <h2 className="font-bold text-sm mb-4">Documents{docsList.length > 0 ? ` (${docsList.length})` : ""}</h2>
            {docsList.length === 0 ? (
              <p className="text-sm text-text-secondary">Aucun document publié.</p>
            ) : (
              <DocumentsTab docs={docsList} />
            )}
          </div>
        );
      case "contact":
        return (
          <div className="bg-white border border-border rounded-card p-6">
            <h2 className="font-bold text-sm mb-4">Contact</h2>
            {!draftSchool.phone && !draftSchool.email && !address ? (
              <p className="text-sm text-text-secondary">Coordonnées non renseignées.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {draftSchool.phone && <ContactRow icon={Phone} label="Téléphone" value={draftSchool.phone} href={`tel:${draftSchool.phone}`} />}
                {draftSchool.email && <ContactRow icon={Mail} label="Email" value={draftSchool.email} href={`mailto:${draftSchool.email}`} />}
                {address && <ContactRow icon={MapPin} label="Adresse" value={address} href={mapsHref ?? undefined} />}
                {draftSchool.website && <ContactRow icon={Globe} label="Site web" value={draftSchool.website} href={draftSchool.website} />}
              </div>
            )}
          </div>
        );
    }
  }

  function drawerTitle(): string {
    if (activeDrawer === "hero") return "Modifier le Hero";
    if (activeDrawer === "cles") return "Modifier — Chiffres clés";
    if (activeDrawer === "classement") return "Modifier — Classement officiel";
    if (activeDrawer) return `Modifier — ${SECTION_LABELS[activeDrawer]}`;
    return "";
  }

  function renderDrawerBody() {
    if (!activeDrawer || !formDraft) return null;

    if (activeDrawer === "hero") {
      const options: { key: HeroMode; label: string; desc: string; icon: typeof ImageIconAlt }[] = [
        { key: "carousel", label: "Carrousel", desc: "Fait défiler toutes les photos de la galerie.", icon: Video },
        { key: "image", label: "Image unique", desc: "Utilise actuellement l'image principale de votre galerie.", icon: ImageIconAlt },
        { key: "none", label: "Aucun média principal", desc: "Fond dégradé, sans photo en haut de page.", icon: ImageIcon },
      ];
      return (
        <div className="space-y-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = heroMode === opt.key;
            const saving = heroSaveState === "saving";
            return (
              <button
                key={opt.key}
                type="button"
                disabled={saving}
                onClick={() => updateHeroMode(opt.key)}
                className={`w-full text-left flex items-start gap-3 p-3.5 rounded-card border transition-colors duration-fast disabled:opacity-60 ${active ? "border-primary bg-primary-light" : "border-border hover:border-text-secondary/40"}`}
              >
                {active && saving
                  ? <span className="w-4 h-4 mt-0.5 shrink-0 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  : <Icon size={16} className={active ? "text-primary mt-0.5" : "text-text-secondary mt-0.5"} />}
                <span>
                  <span className="block text-sm font-bold text-text-primary">{opt.label}</span>
                  <span className="block text-xs text-text-secondary mt-0.5">{opt.desc}</span>
                </span>
              </button>
            );
          })}
          {allHeroSlides.length === 0 && (
            <p className="text-xs text-text-secondary mt-3">Aucune photo disponible pour le moment — ajoutez des photos depuis la galerie pour activer l&apos;image ou le carrousel.</p>
          )}
          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3 mt-3">
            Ce mode d&apos;affichage est enregistré dans votre brouillon. La galerie de photos, elle, reste publiée immédiatement — voir le panneau Galerie.
          </p>
          {heroSaveState === "saved" && (
            <p className="text-xs text-primary mt-3">Enregistré dans le brouillon.</p>
          )}
          {heroSaveState === "error" && (
            <p className="text-xs text-red-600 mt-3">{heroError}</p>
          )}
        </div>
      );
    }

    if (activeDrawer === "presentation") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Devise</label>
            <Input
              value={formDraft.motto}
              onChange={(e) => setFormDraft((p) => p ? { ...p, motto: e.target.value } : p)}
              placeholder="Ex : Excellence, discipline, réussite"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Présentation</label>
            <textarea
              value={formDraft.description}
              onChange={(e) => setFormDraft((p) => p ? { ...p, description: e.target.value } : p)}
              rows={8}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
              placeholder="Décrivez votre établissement..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Historique</label>
            <textarea
              value={formDraft.history}
              onChange={(e) => setFormDraft((p) => p ? { ...p, history: e.target.value } : p)}
              rows={5}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
              placeholder="L'histoire de votre établissement (optionnel)..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Mission</label>
            <textarea
              value={formDraft.mission}
              onChange={(e) => setFormDraft((p) => p ? { ...p, mission: e.target.value } : p)}
              rows={4}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
              placeholder="La mission de votre établissement (optionnel)..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Vision</label>
            <textarea
              value={formDraft.vision}
              onChange={(e) => setFormDraft((p) => p ? { ...p, vision: e.target.value } : p)}
              rows={4}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
              placeholder="La vision de votre établissement (optionnel)..."
            />
          </div>
        </div>
      );
    }

    if (activeDrawer === "cles") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Année de création</label>
            <Input
              type="number"
              value={formDraft.foundingYear}
              onChange={(e) => setFormDraft((p) => p ? { ...p, foundingYear: e.target.value } : p)}
              placeholder="Ex : 1998"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Nombre d&apos;élèves</label>
            <Input
              type="number"
              value={formDraft.studentCount}
              onChange={(e) => setFormDraft((p) => p ? { ...p, studentCount: e.target.value } : p)}
              placeholder="Laisser vide si inconnu"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Nombre d&apos;enseignants</label>
            <Input
              type="number"
              value={formDraft.teacherCount}
              onChange={(e) => setFormDraft((p) => p ? { ...p, teacherCount: e.target.value } : p)}
              placeholder="Laisser vide si inconnu"
            />
          </div>
          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3">
            Un chiffre laissé vide n&apos;apparaît jamais sur la fiche publique — jamais une valeur inventée.
          </p>
        </div>
      );
    }

    if (activeDrawer === "classement") {
      return (
        <div className="space-y-4">
          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3">
            Un classement affiché comme « officiel » doit toujours indiquer sa source et son année — remplissez les 4 champs ensemble, ou laissez-les tous vides pour ne rien afficher.
          </p>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Année</label>
            <Input
              type="number"
              value={formDraft.rankingYear}
              onChange={(e) => setFormDraft((p) => p ? { ...p, rankingYear: e.target.value } : p)}
              placeholder="Ex : 2025"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Rang</label>
            <Input
              value={formDraft.rankingRank}
              onChange={(e) => setFormDraft((p) => p ? { ...p, rankingRank: e.target.value } : p)}
              placeholder="Ex : 12e établissement"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Périmètre</label>
            <Input
              value={formDraft.rankingScope}
              onChange={(e) => setFormDraft((p) => p ? { ...p, rankingScope: e.target.value } : p)}
              placeholder="Ex : Région du Littoral"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Source</label>
            <Input
              value={formDraft.rankingSource}
              onChange={(e) => setFormDraft((p) => p ? { ...p, rankingSource: e.target.value } : p)}
              placeholder="Ex : MINESEC"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Lien source (optionnel)</label>
            <Input
              value={formDraft.rankingSourceUrl}
              onChange={(e) => setFormDraft((p) => p ? { ...p, rankingSourceUrl: e.target.value } : p)}
              placeholder="https://..."
            />
          </div>
        </div>
      );
    }

    if (activeDrawer === "contact") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Téléphone</label>
            <Input value={formDraft.phone} onChange={(e) => setFormDraft((p) => p ? { ...p, phone: e.target.value } : p)} icon={<Phone size={14} />} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Email</label>
            <Input value={formDraft.email} onChange={(e) => setFormDraft((p) => p ? { ...p, email: e.target.value } : p)} icon={<Mail size={14} />} type="email" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Site web</label>
            <Input value={formDraft.website} onChange={(e) => setFormDraft((p) => p ? { ...p, website: e.target.value } : p)} icon={<Globe size={14} />} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Ville</label>
            <Input value={formDraft.city} onChange={(e) => setFormDraft((p) => p ? { ...p, city: e.target.value } : p)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Adresse</label>
            <Input value={formDraft.address} onChange={(e) => setFormDraft((p) => p ? { ...p, address: e.target.value } : p)} icon={<MapPin size={14} />} />
          </div>
          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3">
            Le statut de vérification et les informations officielles du registre national ne sont pas modifiables ici — ils restent gérés par l&apos;équipe Écoles237.
          </p>
        </div>
      );
    }

    if (activeDrawer === "tarifs") {
      return (
        <div className="space-y-4">
          {FEE_COLS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">{f.label}</label>
              <Input
                type="number"
                min={0}
                value={formDraft.fees[f.key] ?? ""}
                onChange={(e) => setFormDraft((p) => p ? { ...p, fees: { ...p.fees, [f.key]: e.target.value } } : p)}
                placeholder="Non renseigné"
              />
            </div>
          ))}
          <StructuredPricingEditor value={{ ...formDraft.pricing, ...Object.fromEntries(FEE_COLS.map((fee) => [fee.key, formDraft.fees[fee.key]?.trim() ? Number(formDraft.fees[fee.key]) : null])) } as SchoolPagePricing} onChange={(pricing) => setFormDraft((previous) => previous ? { ...previous, pricing } : previous)} />
          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3">
            Laissez un champ vide pour un tarif non applicable — il n&apos;apparaîtra pas sur votre fiche publique.
          </p>
        </div>
      );
    }

    if (activeDrawer === "infrastructures") {
      return (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(INFRA_LABELS).map(([key, item]) => {
            const Icon = item.icon;
            const checked = !!formDraft.infra[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFormDraft((p) => p ? { ...p, infra: { ...p.infra, [key]: !p.infra[key] } } : p)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors duration-fast ${checked ? "border-primary bg-primary-light" : "border-border hover:border-text-secondary/40"}`}
              >
                <Icon size={14} className={checked ? "text-primary shrink-0" : "text-text-secondary shrink-0"} />
                <span className="text-xs font-semibold text-text-primary">{item.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    // Galerie CMS-F.6 Gallery Draft Lifecycle — upload et suppression sont
    // désormais conscients du brouillon (plus le Mode A "toujours immédiat"
    // hérité de CMS-C) : une nouvelle photo n'apparaît publiquement qu'au
    // prochain Publish (status='draft_pending_add'), et supprimer une
    // photo déjà publiée ne fait que planifier sa suppression
    // (gallery.remove_ids) — elle reste visible publiquement jusqu'au
    // Publish, avec une action "Annuler la suppression" tant qu'il n'a pas
    // eu lieu.
    if (activeDrawer === "galerie") {
      const localVisualPack = getSchoolVisualPack(school?.id);
      return (
        <div>
          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3 mb-4">
            Les nouvelles photos et les suppressions ne seront visibles publiquement qu&apos;après la publication de votre brouillon.
          </p>
          {localVisualPack && <SchoolVisualPackPanel pack={localVisualPack} />}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) uploadGalleryImage(picked);
            }}
          />
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={galleryUploading}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-card p-4 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-50 mb-4"
          >
            {galleryUploading
              ? <span className="w-4 h-4 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
              : <Upload size={15} />}
            {galleryUploading ? "Envoi en cours…" : "Ajouter une photo"}
          </button>
          <p className="text-[11px] text-text-secondary mb-4">JPG, PNG, WEBP ou GIF — max 5 Mo. La première photo devient l&apos;image principale de la fiche.</p>

          {galleryError && <p className="text-sm text-red-600 mb-3">{galleryError}</p>}

          {effectiveImages.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucune photo dans le brouillon.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {effectiveImages.map((img: any) => (
                <div key={img.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.caption ?? ""} className="w-full aspect-square object-cover rounded-lg" />
                  {img.status === "draft_pending_add" && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold uppercase tracking-wide">
                      Nouveau
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteGalleryImage(img)}
                    disabled={galleryDeletingId === img.id}
                    aria-label="Supprimer la photo"
                    className="absolute top-1 right-1 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                  >
                    {galleryDeletingId === img.id
                      ? <span className="block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingRemoveImages.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
                En attente de suppression ({pendingRemoveImages.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {pendingRemoveImages.map((img: any) => (
                  <div key={img.id} className="relative group opacity-60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.caption ?? ""} className="w-full aspect-square object-cover rounded-lg grayscale" />
                    <button
                      type="button"
                      onClick={() => undoRemoveGalleryImage(img.id)}
                      disabled={galleryDeletingId === img.id}
                      className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-white/90 text-text-primary text-[10px] font-bold disabled:opacity-60"
                    >
                      {galleryDeletingId === img.id
                        ? <span className="block w-3 h-3 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
                        : "Annuler"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-text-secondary mt-2">Ces photos restent visibles publiquement jusqu&apos;à la prochaine publication.</p>
            </div>
          )}
        </div>
      );
    }
    if (activeDrawer === "documents") {
      const DOC_TYPE_OPTIONS = Object.entries(SCHOOL_DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
      return (
        <div>
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) uploadDocument(picked);
            }}
          />
          <div className="space-y-2 mb-3">
            <input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Nom affiché (optionnel)"
              className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {DOC_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={docAcademicYear} onChange={(e) => setDocAcademicYear(e.target.value)} placeholder="Année scolaire (ex. 2026-2027)" className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary" />
            <textarea value={docDescription} onChange={(e) => setDocDescription(e.target.value)} placeholder="Description (optionnelle)" rows={2} className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            disabled={docUploading}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-card p-4 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-50 mb-4"
          >
            {docUploading
              ? <span className="w-4 h-4 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
              : <Upload size={15} />}
            {docUploading ? "Envoi en cours…" : "Ajouter un document"}
          </button>
          <p className="text-[11px] text-text-secondary mb-4">PDF, Word, Excel ou PowerPoint — max 10 Mo.</p>

          {docError && <p className="text-sm text-red-600 mb-3">{docError}</p>}

          {docsList.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucun document publié.</p>
          ) : (
            <ul className="space-y-2">
              {docsList.map((d: any) => (
                <li key={d.id} className="flex items-center gap-2 text-sm text-text-primary bg-muted rounded-lg p-2.5">
                  <FileText size={14} className="text-text-secondary shrink-0" />
                  <span className="flex-1 truncate">{d.name}</span>
                  <button
                    type="button"
                    onClick={() => deleteDocument(d.id)}
                    disabled={docDeletingId === d.id}
                    aria-label="Supprimer le document"
                    className="shrink-0 text-text-secondary hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {docDeletingId === d.id
                      ? <span className="block w-3.5 h-3.5 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (activeDrawer === "actualites") {
      return (
        <div>
          <div className="space-y-2 mb-3">
            <input
              value={newsForm.title}
              onChange={(e) => setNewsForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Titre de l'annonce"
              className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <textarea
              value={newsForm.content}
              onChange={(e) => setNewsForm((p) => ({ ...p, content: e.target.value }))}
              rows={3}
              placeholder="Contenu de l'annonce… (requis)"
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
            />
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={newsForm.is_important}
                onChange={(e) => setNewsForm((p) => ({ ...p, is_important: e.target.checked }))}
              />
              Marquer comme important
            </label>

            {/* PUBLIC-SITE-04 — optionnel : laisser vide pour une simple
                annonce, renseigner pour un véritable événement daté. */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Date de l&apos;événement (optionnel)</label>
                <input
                  type="date"
                  value={newsForm.event_date}
                  onChange={(e) => setNewsForm((p) => ({ ...p, event_date: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Heure (optionnel)</label>
                <input
                  type="time"
                  value={newsForm.event_start_time}
                  onChange={(e) => setNewsForm((p) => ({ ...p, event_start_time: e.target.value }))}
                  disabled={!newsForm.event_date}
                  className="w-full bg-surface border border-border rounded-[10px] px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {newsError && <p className="text-sm text-red-600 mb-3">{newsError}</p>}

          <div className="flex gap-2 mb-4">
            <Button variant="primary" size="sm" onClick={submitNews} loading={newsSaving} disabled={!newsForm.title.trim() || !newsForm.content.trim()}>
              {newsEditingId ? "Enregistrer les modifications" : "Publier"}
            </Button>
            {newsEditingId && (
              <Button variant="secondary" size="sm" onClick={cancelNewsEdit} disabled={newsSaving}>Annuler l&apos;édition</Button>
            )}
          </div>

          {newsList.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucune actualité publiée.</p>
          ) : (
            <ul className="space-y-2">
              {newsList.map((n: any) => (
                <li key={n.id} className={`rounded-lg p-3 ${newsEditingId === n.id ? "bg-primary-light border border-primary/30" : "bg-muted"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{n.title}</p>
                      {n.content && <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">{n.content}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => startNewsEdit(n)} className="text-xs font-semibold text-primary hover:opacity-70">Éditer</button>
                      <button
                        type="button"
                        onClick={() => deleteNews(n.id)}
                        disabled={newsDeletingId === n.id}
                        aria-label="Supprimer l'annonce"
                        className="text-text-secondary hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {newsDeletingId === n.id
                          ? <span className="block w-3.5 h-3.5 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (activeDrawer === "admissions") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Admissions ouvertes</label>
            <div className="flex gap-2">
              {[{ v: true, l: "Oui" }, { v: false, l: "Non" }].map((opt) => (
                <button
                  key={String(opt.v)}
                  type="button"
                  disabled={admissionsOpenSaving}
                  onClick={() => toggleAdmissionsOpen(opt.v)}
                  className={`px-4 py-2 rounded-card text-sm font-bold border transition-colors duration-fast disabled:opacity-60 ${formDraft.admissionsOpen === opt.v ? "border-primary bg-primary-light text-primary" : "border-border text-text-secondary hover:border-text-secondary/40"}`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-2">Ce changement est appliqué immédiatement.</p>
            {admissionsOpenError && <p className="text-xs text-red-600 mt-2">{admissionsOpenError}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Niveaux proposés (un par ligne)</label>
            <textarea
              value={formDraft.admissionsLevels}
              onChange={(e) => setFormDraft((p) => p ? { ...p, admissionsLevels: e.target.value } : p)}
              rows={3}
              placeholder={"CP\nCE1\n6ème"}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Conditions d&apos;admission</label>
            <textarea
              value={formDraft.admissionsConditions}
              onChange={(e) => setFormDraft((p) => p ? { ...p, admissionsConditions: e.target.value } : p)}
              rows={3}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Documents requis (un par ligne)</label>
            <textarea
              value={formDraft.admissionsDocuments}
              onChange={(e) => setFormDraft((p) => p ? { ...p, admissionsDocuments: e.target.value } : p)}
              rows={3}
              placeholder={"Acte de naissance\nBulletins précédents\nPhotos d'identité"}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Période — début</label>
              <Input type="date" value={formDraft.admissionsPeriodStart} onChange={(e) => setFormDraft((p) => p ? { ...p, admissionsPeriodStart: e.target.value } : p)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Période — fin</label>
              <Input type="date" value={formDraft.admissionsPeriodEnd} onChange={(e) => setFormDraft((p) => p ? { ...p, admissionsPeriodEnd: e.target.value } : p)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Informations complémentaires</label>
            <textarea
              value={formDraft.admissionsAdditionalInfo}
              onChange={(e) => setFormDraft((p) => p ? { ...p, admissionsAdditionalInfo: e.target.value } : p)}
              rows={3}
              className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <p className="text-xs text-text-secondary bg-muted rounded-lg p-3">
            &laquo;&nbsp;Enregistrer&nbsp;&raquo; ci-dessous n&apos;enregistre que la configuration descriptive (niveaux, conditions, documents, période, informations) dans votre brouillon. Le bouton &laquo;&nbsp;Préinscrire mon enfant&nbsp;&raquo; reste actif si les admissions sont ouvertes ; un message &laquo;&nbsp;Admissions actuellement fermées&nbsp;&raquo; le remplace sinon. Les dossiers de candidature (noms, contacts, notes) restent gérés séparément dans Admissions du tableau de bord — jamais visibles ici.
          </p>
        </div>
      );
    }
    return null;
  }

  // EDITABLE_FORM_SECTIONS et SERVER_SAVED_SECTIONS coïncident désormais
  // (CMS-D a fermé le dernier écart : tarifs/infrastructures sont
  // maintenant sauvegardés comme présentation/contact) — toute section
  // formulaire passe par applyDrawer() avec des états honnêtes (§14).
  const isFormDrawer =
    activeDrawer !== null &&
    (EDITABLE_FORM_SECTIONS.has(activeDrawer as SectionKey) || activeDrawer === "cles" || activeDrawer === "classement");

  function drawerFooter() {
    if (!isFormDrawer) {
      return <Button variant="secondary" size="sm" onClick={closeDrawer}>Fermer</Button>;
    }
    return (
      <>
        <Button variant="secondary" size="sm" onClick={closeDrawer} disabled={drawerSaveState === "saving"}>Annuler</Button>
        <Button variant="primary" size="sm" onClick={applyDrawer} loading={drawerSaveState === "saving"}>
          {drawerSaveState === "saved" ? "Enregistré" : drawerSaveState === "error" ? "Réessayer" : "Enregistrer le brouillon"}
        </Button>
      </>
    );
  }

  return (
    <div className="-m-6 lg:-m-8 min-h-screen bg-[#ECECEA]">
      <EditorToolbar
        schoolName={draftSchool.name}
        hasUnsavedChanges={hasUnsavedChanges}
        onReset={resetDraft}
        draftStatus={draftStatus}
        onReloadDraft={reloadDraft}
        canPublish={canPublish}
        onPublish={publishDraft}
        canDiscard={canDiscard}
        onDiscard={discardDraft}
      />

      {/* Hero — zone spéciale, non réordonnable (§7) */}
      <div className="relative">
        <SchoolHeroCarousel
          slides={heroSlides}
          name={draftSchool.name}
          city={draftSchool.city}
          neighborhood={draftSchool.neighborhood}
          category={draftSchool.main_category}
          trustBadge={draftTrustBadge}
          premium={draftSchool.subscription_plan === "premium"}
          preinscriptionHref="#"
          backHref="/dashboard/ecole"
          backLabel="Tableau de bord"
        />
        <button
          type="button"
          onClick={() => openDrawer("hero")}
          className="absolute top-24 right-[18px] z-10 h-9 px-3.5 rounded-card text-xs font-semibold bg-white/10 text-white border border-white/20 backdrop-blur-sm hover:bg-white/20 transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Modifier le Hero
        </button>
      </div>

      <div className="max-w-[1520px] mx-auto px-[18px] py-8 flex justify-end">
        <Link
          href={`/ecole/${school.id}`}
          target="_blank"
          className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-2 rounded-card hover:border-text-secondary transition-colors duration-base"
        >
          <ExternalLink size={12} />
          Voir la fiche publique en ligne
        </Link>
      </div>

      {draftError && (
        <div className="max-w-[1520px] mx-auto px-[18px] -mt-4 mb-4">
          <p className="text-xs font-semibold text-danger">Brouillon : {draftError}</p>
        </div>
      )}

      {sectionsSaveState !== "idle" && (
        <div className="max-w-[1520px] mx-auto px-[18px] -mt-4 mb-4">
          <p className={`text-xs font-semibold ${sectionsSaveState === "error" ? "text-danger" : "text-text-secondary"}`}>
            {sectionsSaveState === "saving" && "Enregistrement de l'ordre et de la visibilité…"}
            {sectionsSaveState === "saved" && "Ordre et visibilité enregistrés dans le brouillon."}
            {sectionsSaveState === "error" && "Erreur d'enregistrement de l'ordre/visibilité — nouvelle tentative au prochain changement."}
          </p>
        </div>
      )}

      <div className="max-w-[1520px] mx-auto px-[18px] pb-16 space-y-5">
        {order.map((key, i) => (
          <EditableSection
            key={key}
            label={SECTION_LABELS[key]}
            visible={visibility[key]}
            isFirst={i === 0}
            isLast={i === order.length - 1}
            onEdit={() => openDrawer(key)}
            onToggleVisibility={() => toggleVisibility(key)}
            onMoveUp={() => moveSection(key, -1)}
            onMoveDown={() => moveSection(key, 1)}
          >
            {renderSectionContent(key)}
          </EditableSection>
        ))}

        {/* PUBLIC-SITE-02 §5 — Chiffres clés / Classement officiel : hors
            de la liste réordonnable (pas de ligne school_page_sections),
            même style de carte que les sections ci-dessus. */}
        <div className="bg-white border border-border rounded-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-sm">Chiffres clés</p>
            <Button variant="secondary" size="sm" onClick={() => openDrawer("cles")}>Modifier</Button>
          </div>
          {draftPayload && (draftPayload.key_numbers.founding_year != null || draftPayload.key_numbers.student_count != null || draftPayload.key_numbers.teacher_count != null) ? (
            <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
              {draftPayload.key_numbers.founding_year != null && <span>Fondé en <strong className="text-text-primary">{draftPayload.key_numbers.founding_year}</strong></span>}
              {draftPayload.key_numbers.student_count != null && <span><strong className="text-text-primary">{draftPayload.key_numbers.student_count}</strong> élèves</span>}
              {draftPayload.key_numbers.teacher_count != null && <span><strong className="text-text-primary">{draftPayload.key_numbers.teacher_count}</strong> enseignants</span>}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Aucun chiffre renseigné — rien n&apos;est affiché publiquement.</p>
          )}
        </div>

        <div className="bg-white border border-border rounded-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-sm">Classement officiel</p>
            <Button variant="secondary" size="sm" onClick={() => openDrawer("classement")}>Modifier</Button>
          </div>
          {draftPayload?.ranking ? (
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">{draftPayload.ranking.rank}</strong> — {draftPayload.ranking.scope}
              <br />
              Source : {draftPayload.ranking.source} · {draftPayload.ranking.year}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">Aucun classement configuré — rien n&apos;est affiché publiquement.</p>
          )}
        </div>

        {/* Résultats d'examens — gestion en liste (ajout/suppression), même
            famille que Galerie/Documents (pas un formulaire saveDraft simple). */}
        <div className="bg-white border border-border rounded-card p-5">
          <p className="font-bold text-sm mb-3">Résultats d&apos;examens</p>
          {resultError && <p className="text-xs text-danger bg-danger/10 rounded-lg p-3 mb-3">{resultError}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            <Input placeholder="Examen (ex: BEPC)" value={resultForm.exam} onChange={(e) => setResultForm((p) => ({ ...p, exam: e.target.value }))} />
            <Input type="number" placeholder="Année" value={resultForm.academicYear} onChange={(e) => setResultForm((p) => ({ ...p, academicYear: e.target.value }))} />
            <Input type="number" placeholder="Candidats" value={resultForm.candidates} onChange={(e) => setResultForm((p) => ({ ...p, candidates: e.target.value }))} />
            <Input type="number" placeholder="Admis" value={resultForm.admitted} onChange={(e) => setResultForm((p) => ({ ...p, admitted: e.target.value }))} />
            <Input type="number" placeholder="Taux %" value={resultForm.rate} onChange={(e) => setResultForm((p) => ({ ...p, rate: e.target.value }))} />
          </div>
          <Button variant="secondary" size="sm" onClick={addExamResult} loading={resultSaving}>+ Ajouter un résultat</Button>

          <div className="mt-4 space-y-2">
            {effectiveResults.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                <span className="text-sm text-text-primary">
                  <strong>{r.exam}</strong> {r.academic_year} — {r.success_rate_percent != null ? `${r.success_rate_percent}%` : "—"}
                  {r.candidates_count != null && r.admitted_count != null ? ` (${r.admitted_count}/${r.candidates_count})` : ""}
                  {r.status === "draft_pending_add" && <span className="ml-2 text-[10px] font-bold text-primary uppercase">Brouillon</span>}
                </span>
                <Button variant="secondary" size="sm" onClick={() => deleteExamResult(r)} loading={resultDeletingId === r.id}>Supprimer</Button>
              </div>
            ))}
            {pendingRemoveResults.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                <span className="text-sm text-text-secondary line-through">{r.exam} {r.academic_year}</span>
                <Button variant="secondary" size="sm" onClick={() => undoRemoveExamResult(r.id)} loading={resultDeletingId === r.id}>Annuler la suppression</Button>
              </div>
            ))}
            {effectiveResults.length === 0 && pendingRemoveResults.length === 0 && (
              <p className="text-sm text-text-secondary">Aucun résultat publié.</p>
            )}
          </div>
        </div>
      </div>

      <Drawer
        open={activeDrawer !== null}
        onClose={closeDrawer}
        title={drawerTitle()}
        footer={drawerFooter()}
      >
        {isFormDrawer && drawerSaveState === "error" && drawerError && (
          <p className="text-xs text-danger bg-danger/10 rounded-lg p-3 mb-4">{drawerError}</p>
        )}
        {renderDrawerBody()}
      </Drawer>
    </div>
  );
}
