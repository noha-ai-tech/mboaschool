"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ShowcasePhoto = { id: string; url: string; name: string; city: string | null };

// Photos réelles d'établissements vérifiés/mis en avant, pour les panneaux
// de branding des pages d'authentification/inscription/revendication.
// Lecture seule (aucun schéma ni policy modifiés) — jamais de photo
// stock/IA. Partagé pour éviter de dupliquer cette requête sur chaque page.
export function useShowcasePhotos(limit: number): ShowcasePhoto[] {
  const [photos, setPhotos] = useState<ShowcasePhoto[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("establishments")
        .select("id, name, city, cover_image_url, is_verified, is_featured, school_images(url)")
        // CMS-F.6 — ne remonter que les photos publiées (défense en
        // profondeur avec la policy RLS, migration 0029 PRÉPARÉE NON
        // EXÉCUTÉE).
        .eq("school_images.status", "live")
        .or("is_verified.eq.true,is_featured.eq.true")
        .limit(10);
      if (cancelled || !data) return;
      const withPhotos: ShowcasePhoto[] = data
        .map((s: any) => ({
          id: s.id,
          name: s.name as string,
          city: (s.city ?? null) as string | null,
          url: (s.school_images?.[0]?.url ?? s.cover_image_url ?? null) as string | null,
        }))
        .filter((s): s is ShowcasePhoto => !!s.url)
        .slice(0, limit);
      setPhotos(withPhotos);
    }
    load();
    return () => { cancelled = true; };
  }, [limit]);

  return photos;
}
