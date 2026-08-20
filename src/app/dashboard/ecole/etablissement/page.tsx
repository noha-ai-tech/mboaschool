"use client";

// "Modifier ma page" — éditeur visuel de la fiche publique (CMS-B.0 + B.1 +
// B.2). Route reprise telle quelle depuis le hub existant (recommandation
// CMS-A : éviter de multiplier les routes). Sécurité : aucune donnée n'est
// dérivée de l'URL — l'école éditée est déterminée uniquement par la
// session authentifiée (owner_id = auth.uid()), jamais par un id passé en
// paramètre.
//
// CMS-B.2 : Présentation, Contact et l'ordre/visibilité des sections sont
// désormais sauvegardés pour de vrai, via /api/school-page/* (whitelist
// stricte, autorisation recalculée côté serveur — voir
// src/lib/cms/authorizeSchoolMutation.ts). Tarifs / Infrastructures / Hero
// restent un brouillon 100% local (hors périmètre de ce sprint) — perdu au
// rechargement, ce n'est pas un modèle de données. Publier reste désactivé
// tant que la vérification de sécurité (fuite applications, migrations
// 0007/0014) n'est pas confirmée par Eddy + l'architecte — voir le rapport
// CMS-B.2 pour le détail de ce qui reste à débloquer.

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ExternalLink, Phone, Mail, MapPin, Globe, ImageIcon, FileText, ClipboardList, Image as ImageIconAlt, Video } from "lucide-react";
import { SchoolHeroCarousel, type SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { GeneralTab, FEE_COLS, INFRA_LABELS } from "@/components/school/GeneralTab";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { ParentTab } from "@/components/school/ParentTab";
import { ContactRow } from "@/components/school/ContactRow";
import { EditableSection } from "@/components/cms/EditableSection";
import { EditorToolbar } from "@/components/cms/EditorToolbar";
import { Drawer } from "@/components/cms/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type SectionKey =
  | "presentation" | "admissions" | "tarifs" | "infrastructures"
  | "galerie" | "actualites" | "documents" | "contact";

type DrawerKey = SectionKey | "hero";

type HeroMode = "carousel" | "image" | "none";

const DEFAULT_ORDER: SectionKey[] = [
  "presentation", "admissions", "tarifs", "infrastructures", "galerie", "actualites", "documents", "contact",
];

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

// Sections où "Modifier" ouvre un formulaire local (Annuler / Appliquer).
// Les autres ("admissions", "galerie", "actualites", "documents") ouvrent
// un panneau lecture seule — aucun modèle d'ajout/suppression en CMS-B.1/B.2.
const EDITABLE_FORM_SECTIONS = new Set<SectionKey>(["presentation", "tarifs", "infrastructures", "contact"]);

// Sections dont la sauvegarde est réellement branchée en CMS-B.2 — les
// autres (hero, tarifs, infrastructures) restent un brouillon local géré
// par applyDrawer() sans appel réseau.
const SERVER_SAVED_SECTIONS = new Set<SectionKey>(["presentation", "contact"]);

// Clés attendues par school_page_sections (migration 0021) — différentes
// des clés internes de l'éditeur pour "tarifs"/"infrastructures"/
// "galerie"/"actualites" (alignées sur le vocabulaire du brief CMS-B.2 §4).
const SECTION_TO_DB_KEY: Record<SectionKey, string> = {
  presentation: "presentation",
  admissions: "admissions",
  tarifs: "pricing",
  infrastructures: "infrastructure",
  galerie: "gallery",
  actualites: "news",
  documents: "documents",
  contact: "contact",
};

type SaveState = "idle" | "saving" | "saved" | "error";

type FieldEdits = {
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  fees?: Record<string, number>;
  infra?: Record<string, boolean>;
};

type FormDraft = {
  description: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  fees: Record<string, string>;
  infra: Record<string, boolean>;
  heroMode: HeroMode;
};

export default function ModifierMaPagePage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [school, setSchool] = useState<any>(null);
  const [fees, setFees] = useState<any | null>(null);
  const [infra, setInfra] = useState<any | null>(null);
  const [images, setImages] = useState<any[]>([]);
  const [docsList, setDocsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [order, setOrder] = useState<SectionKey[]>(DEFAULT_ORDER);
  const [visibility, setVisibility] = useState<Record<SectionKey, boolean>>(
    () => Object.fromEntries(DEFAULT_ORDER.map((k) => [k, true])) as Record<SectionKey, boolean>
  );
  const [previewMode, setPreviewMode] = useState(false);

  const [fieldEdits, setFieldEdits] = useState<FieldEdits>({});
  const [heroMode, setHeroMode] = useState<HeroMode | null>(null); // null = pas de préférence locale, utilise le défaut calculé
  const [activeDrawer, setActiveDrawer] = useState<DrawerKey | null>(null);
  const [formDraft, setFormDraft] = useState<FormDraft | null>(null);

  const [drawerSaveState, setDrawerSaveState] = useState<SaveState>("idle");
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [sectionsSaveState, setSectionsSaveState] = useState<SaveState>("idle");
  const sectionsTouched = useRef(false); // ne sauvegarde jamais l'ordre par défaut au premier rendu

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setAuthChecked(true);
        setLoading(false);
        return;
      }
      setAuthed(true);

      // Le serveur (RLS) recalcule l'établissement autorisé à partir de la
      // session — aucun id d'établissement n'est jamais lu depuis l'URL.
      const { data: schoolData } = await supabase
        .from("establishments")
        .select("*")
        .eq("owner_id", authUser.id)
        .maybeSingle();

      setAuthChecked(true);
      if (!schoolData) { setLoading(false); return; }
      setSchool(schoolData);

      const [
        { data: feesData },
        { data: infraData },
        { data: imagesData },
        { data: docsData },
      ] = await Promise.all([
        supabase.from("fees").select("*").eq("establishment_id", schoolData.id).maybeSingle(),
        supabase.from("infrastructures").select("*").eq("establishment_id", schoolData.id).maybeSingle(),
        supabase.from("school_images").select("*").eq("establishment_id", schoolData.id).order("created_at", { ascending: false }),
        supabase.from("school_documents").select("*").eq("establishment_id", schoolData.id).order("created_at", { ascending: false }),
      ]);

      if (feesData) setFees(feesData);
      if (infraData) setInfra(infraData);
      if (imagesData) setImages(imagesData);
      if (docsData) setDocsList(docsData);
      setLoading(false);
    }
    load();
  }, []);

  const allHeroSlides = useMemo<SchoolHeroSlide[]>(() => {
    if (images.length > 0) return images.map((img: any) => ({ id: img.id, image: img.url as string }));
    if (school?.cover_image_url) return [{ id: "cover", image: school.cover_image_url as string }];
    return [];
  }, [images, school?.cover_image_url]);

  const defaultHeroMode: HeroMode = allHeroSlides.length > 1 ? "carousel" : allHeroSlides.length === 1 ? "image" : "none";
  const effectiveHeroMode = heroMode ?? defaultHeroMode;

  const heroSlides = useMemo<SchoolHeroSlide[]>(() => {
    if (effectiveHeroMode === "none") return [];
    if (effectiveHeroMode === "image") return allHeroSlides.slice(0, 1);
    return allHeroSlides;
  }, [allHeroSlides, effectiveHeroMode]);

  // Rendu toujours dérivé de "brouillon" (données réelles + éventuelles
  // surcharges locales) — Editor et Aperçu utilisent exactement les mêmes
  // valeurs, seule la présence des contrôles d'édition change.
  const draftSchool = useMemo(() => school ? {
    ...school,
    description: fieldEdits.description ?? school.description,
    phone: fieldEdits.phone ?? school.phone,
    email: fieldEdits.email ?? school.email,
    website: fieldEdits.website ?? school.website,
    address: fieldEdits.address ?? school.address,
    city: fieldEdits.city ?? school.city,
  } : null, [school, fieldEdits]);

  const draftFees = useMemo(() => {
    if (!fees && !fieldEdits.fees) return fees;
    return { ...fees, ...fieldEdits.fees };
  }, [fees, fieldEdits.fees]);

  const draftInfra = useMemo(() => {
    if (!infra && !fieldEdits.infra) return infra;
    return { ...infra, ...fieldEdits.infra };
  }, [infra, fieldEdits.infra]);

  const hasUnsavedChanges =
    Object.keys(fieldEdits).length > 0 ||
    heroMode !== null ||
    order.some((k, i) => k !== DEFAULT_ORDER[i]) ||
    Object.values(visibility).some((v) => v === false);

  function moveSection(key: SectionKey, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function toggleVisibility(key: SectionKey) {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetDraft() {
    setFieldEdits({});
    setHeroMode(null);
    setOrder(DEFAULT_ORDER);
    setVisibility(Object.fromEntries(DEFAULT_ORDER.map((k) => [k, true])) as Record<SectionKey, boolean>);
  }

  function openDrawer(key: DrawerKey) {
    if (!draftSchool) return;
    setFormDraft({
      description: draftSchool.description ?? "",
      phone: draftSchool.phone ?? "",
      email: draftSchool.email ?? "",
      website: draftSchool.website ?? "",
      address: draftSchool.address ?? "",
      city: draftSchool.city ?? "",
      fees: Object.fromEntries(FEE_COLS.map((f) => [f.key, draftFees?.[f.key] != null && draftFees[f.key] !== 0 ? String(draftFees[f.key]) : ""])),
      infra: Object.fromEntries(Object.keys(INFRA_LABELS).map((k) => [k, !!draftInfra?.[k]])),
      heroMode: effectiveHeroMode,
    });
    setActiveDrawer(key);
  }

  function closeDrawer() {
    setActiveDrawer(null);
    setFormDraft(null);
    setDrawerSaveState("idle");
    setDrawerError(null);
  }

  async function applyDrawer() {
    if (!formDraft || !activeDrawer) return;

    // Hero / Tarifs / Infrastructures — hors périmètre CMS-B.2, brouillon local uniquement.
    if (activeDrawer === "hero") {
      setHeroMode(formDraft.heroMode);
      closeDrawer();
      return;
    }
    if (activeDrawer === "tarifs") {
      const parsed = Object.fromEntries(
        Object.entries(formDraft.fees).map(([k, v]) => [k, v.trim() === "" ? 0 : Number(v)])
      );
      setFieldEdits((prev) => ({ ...prev, fees: parsed }));
      closeDrawer();
      return;
    }
    if (activeDrawer === "infrastructures") {
      setFieldEdits((prev) => ({ ...prev, infra: formDraft.infra }));
      closeDrawer();
      return;
    }

    // Présentation / Contact — sauvegarde réelle (CMS-B.2 §7/§8).
    setDrawerSaveState("saving");
    setDrawerError(null);
    try {
      if (activeDrawer === "presentation") {
        const res = await fetch("/api/school-page/presentation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: formDraft.description }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setSchool((prev: any) => (prev ? { ...prev, description: formDraft.description } : prev));
        setFieldEdits((prev) => { const { description: _omit, ...rest } = prev; return rest; });
      } else if (activeDrawer === "contact") {
        const payload = {
          phone: formDraft.phone,
          email: formDraft.email,
          website: formDraft.website,
          address: formDraft.address,
          city: formDraft.city,
        };
        const res = await fetch("/api/school-page/contact", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setSchool((prev: any) => (prev ? { ...prev, ...payload } : prev));
        setFieldEdits((prev) => { const { phone: _p, email: _e, website: _w, address: _a, city: _c, ...rest } = prev; return rest; });
      }
      setDrawerSaveState("saved");
      setTimeout(() => closeDrawer(), 700);
    } catch (e) {
      setDrawerSaveState("error");
      setDrawerError(e instanceof Error ? e.message : "Erreur d'enregistrement");
    }
  }

  // Sections (ordre + visibilité) — sauvegarde groupée débouncée (CMS-B.2
  // §11/§12/§20) : un seul PUT avec les 8 clés, jamais une requête par clic.
  useEffect(() => {
    if (!sectionsTouched.current) { sectionsTouched.current = true; return; }
    if (!draftSchool) return;

    setSectionsSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const payload = {
          sections: order.map((key, i) => ({
            section_key: SECTION_TO_DB_KEY[key],
            position: i,
            is_visible: visibility[key],
          })),
        };
        const res = await fetch("/api/school-page/sections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setSectionsSaveState("saved");
      } catch {
        setSectionsSaveState("error");
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, visibility]);

  // --- États non-nominal (chargement / non authentifié / pas de fiche) ---

  if (!authChecked || loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-8 bg-white rounded-xl w-1/3" />
        <div className="h-64 bg-white border border-border rounded-card" />
      </div>
    );
  }

  if (!authed) {
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

  const address = [draftSchool.address, draftSchool.neighborhood, draftSchool.city].filter(Boolean).join(", ");
  const mapsHref = school.latitude && school.longitude
    ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}`
    : null;

  const visibleOrder = order.filter((k) => visibility[k]);
  const renderedOrder = previewMode ? visibleOrder : order;

  function renderSectionContent(key: SectionKey) {
    switch (key) {
      case "presentation":
        return <GeneralTab school={draftSchool} fees={draftFees} infra={draftInfra} sections={{ tarifs: false, infrastructures: false }} />;
      case "tarifs":
        return <GeneralTab school={draftSchool} fees={draftFees} infra={draftInfra} sections={{ presentation: false, infrastructures: false }} />;
      case "infrastructures":
        return <GeneralTab school={draftSchool} fees={draftFees} infra={draftInfra} sections={{ presentation: false, tarifs: false }} />;
      case "admissions":
        return <ParentTab schoolId={draftSchool.id} />;
      case "galerie":
        return (
          <div className="bg-white border border-border rounded-card p-6">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2"><ImageIcon size={14} /> Galerie{images.length > 0 ? ` (${images.length})` : ""}</h2>
            <SchoolGallery images={images.map((img: any) => ({ id: img.id, url: img.url, caption: img.caption }))} />
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
    if (activeDrawer) return `Modifier — ${SECTION_LABELS[activeDrawer]}`;
    return "";
  }

  function renderDrawerBody() {
    if (!activeDrawer || !formDraft) return null;

    if (activeDrawer === "hero") {
      const options: { key: HeroMode; label: string; desc: string; icon: typeof ImageIconAlt }[] = [
        { key: "carousel", label: "Carrousel", desc: "Fait défiler toutes les photos de la galerie.", icon: Video },
        { key: "image", label: "Image unique", desc: "Affiche uniquement la première photo.", icon: ImageIconAlt },
        { key: "none", label: "Aucun média principal", desc: "Fond dégradé, sans photo en haut de page.", icon: ImageIcon },
      ];
      return (
        <div className="space-y-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = formDraft.heroMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFormDraft((p) => p ? { ...p, heroMode: opt.key } : p)}
                className={`w-full text-left flex items-start gap-3 p-3.5 rounded-card border transition-colors duration-fast ${active ? "border-primary bg-primary-light" : "border-border hover:border-text-secondary/40"}`}
              >
                <Icon size={16} className={active ? "text-primary mt-0.5" : "text-text-secondary mt-0.5"} />
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
        </div>
      );
    }

    if (activeDrawer === "presentation") {
      return (
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Description</label>
          <textarea
            value={formDraft.description}
            onChange={(e) => setFormDraft((p) => p ? { ...p, description: e.target.value } : p)}
            rows={10}
            className="w-full bg-surface border border-border rounded-[10px] p-3 text-sm outline-none focus:border-primary resize-none"
            placeholder="Décrivez votre établissement..."
          />
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
                placeholder="0"
              />
            </div>
          ))}
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

    // Sections en lecture seule (aucun upload/delete/create en CMS-B.1)
    if (activeDrawer === "galerie") {
      return (
        <div>
          <p className="text-xs text-text-secondary mb-4">Gestion complète (ajout, suppression, réorganisation) disponible dans une prochaine version.</p>
          {images.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucune photo publiée.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img: any) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt="" className="w-full aspect-square object-cover rounded-lg" />
              ))}
            </div>
          )}
        </div>
      );
    }
    if (activeDrawer === "documents") {
      return (
        <div>
          <p className="text-xs text-text-secondary mb-4">Ajout et suppression de documents disponibles dans une prochaine version.</p>
          {docsList.length === 0 ? (
            <p className="text-sm text-text-secondary">Aucun document publié.</p>
          ) : (
            <ul className="space-y-2">
              {docsList.map((d: any) => (
                <li key={d.id} className="flex items-center gap-2 text-sm text-text-primary bg-muted rounded-lg p-2.5">
                  <FileText size={14} className="text-text-secondary shrink-0" /> {d.name}
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
          <p className="text-xs text-text-secondary mb-4">Publication de nouvelles actualités disponible dans une prochaine version.</p>
          <AnnouncementsTab schoolId={draftSchool.id} />
        </div>
      );
    }
    if (activeDrawer === "admissions") {
      return (
        <div className="flex items-start gap-2 bg-muted rounded-lg p-3">
          <ClipboardList size={14} className="text-text-secondary shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">Cette section présente un contenu fixe (aucun champ éditable enregistré pour le moment). Vous pouvez seulement l&apos;afficher, la masquer ou la déplacer.</p>
        </div>
      );
    }
    return null;
  }

  const isFormDrawer = activeDrawer !== null && (activeDrawer === "hero" || EDITABLE_FORM_SECTIONS.has(activeDrawer));
  const isServerSavedDrawer = activeDrawer !== null && SERVER_SAVED_SECTIONS.has(activeDrawer as SectionKey);

  function drawerFooter() {
    if (!isFormDrawer) {
      return <Button variant="secondary" size="sm" onClick={closeDrawer}>Fermer</Button>;
    }
    if (!isServerSavedDrawer) {
      // Hero / Tarifs / Infrastructures — brouillon local, hors périmètre CMS-B.2.
      return (
        <>
          <Button variant="secondary" size="sm" onClick={closeDrawer}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={applyDrawer}>Appliquer à l&apos;aperçu</Button>
        </>
      );
    }
    // Présentation / Contact — sauvegarde réelle, états honnêtes (§14).
    return (
      <>
        <Button variant="secondary" size="sm" onClick={closeDrawer} disabled={drawerSaveState === "saving"}>Annuler</Button>
        <Button variant="primary" size="sm" onClick={applyDrawer} loading={drawerSaveState === "saving"}>
          {drawerSaveState === "saved" ? "Enregistré" : drawerSaveState === "error" ? "Réessayer" : "Enregistrer"}
        </Button>
      </>
    );
  }

  return (
    <div className="-m-6 lg:-m-8 min-h-screen bg-[#ECECEA]">
      <EditorToolbar
        schoolName={draftSchool.name}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode((v) => !v)}
        hasUnsavedChanges={hasUnsavedChanges}
        onReset={resetDraft}
      />

      {/* Hero — zone spéciale, non réordonnable (§7) */}
      <div className="relative">
        <SchoolHeroCarousel
          slides={heroSlides}
          name={draftSchool.name}
          city={draftSchool.city}
          neighborhood={draftSchool.neighborhood}
          category={draftSchool.main_category}
          verified={!!draftSchool.is_verified}
          premium={draftSchool.subscription_plan === "premium"}
          preinscriptionHref="#"
          backHref="/dashboard/ecole"
          backLabel="Tableau de bord"
        />
        {!previewMode && (
          <button
            type="button"
            onClick={() => openDrawer("hero")}
            className="absolute top-24 right-[18px] z-10 h-9 px-3.5 rounded-card text-xs font-semibold bg-white/10 text-white border border-white/20 backdrop-blur-sm hover:bg-white/20 transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            Modifier le Hero
          </button>
        )}
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

      {!previewMode && sectionsSaveState !== "idle" && (
        <div className="max-w-[1520px] mx-auto px-[18px] -mt-4 mb-4">
          <p className={`text-xs font-semibold ${sectionsSaveState === "error" ? "text-danger" : "text-text-secondary"}`}>
            {sectionsSaveState === "saving" && "Enregistrement de l'ordre et de la visibilité…"}
            {sectionsSaveState === "saved" && "Ordre et visibilité enregistrés."}
            {sectionsSaveState === "error" && "Erreur d'enregistrement de l'ordre/visibilité — nouvelle tentative au prochain changement."}
          </p>
        </div>
      )}

      <div className="max-w-[1520px] mx-auto px-[18px] pb-16 space-y-5">
        {renderedOrder.map((key, i) => (
          previewMode ? (
            <div key={key}>{renderSectionContent(key)}</div>
          ) : (
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
          )
        ))}
        {previewMode && visibleOrder.length === 0 && (
          <p className="text-center text-sm text-text-secondary py-16">Toutes les sections sont masquées.</p>
        )}
      </div>

      <Drawer
        open={activeDrawer !== null}
        onClose={closeDrawer}
        title={drawerTitle()}
        footer={drawerFooter()}
      >
        {isServerSavedDrawer && drawerSaveState === "error" && drawerError && (
          <p className="text-xs text-danger bg-danger/10 rounded-lg p-3 mb-4">{drawerError}</p>
        )}
        {renderDrawerBody()}
      </Drawer>
    </div>
  );
}
