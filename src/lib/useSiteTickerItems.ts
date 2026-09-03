"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TickerItem } from "@/components/hero/AnnouncementTicker";

// Bande d'annonces partagée par les pages publiques qui n'ont pas déjà leur
// propre liste d'établissements sous la main (accueil et page catégorie
// font leur propre calcul à partir de données qu'ils chargent de toute
// façon). Requêtes volontairement légères — comptage + une seule école mise
// en avant — chaque entrée reste un vrai lien vers une donnée réelle,
// jamais un message inventé (voir AnnouncementTicker, masqué si vide).
export function useSiteTickerItems(): TickerItem[] {
  const [schoolCount, setSchoolCount] = useState<number | null>(null);
  const [featured, setFeatured] = useState<{ id: string; name: string; isClaimed: boolean } | null>(null);

  useEffect(() => {
    supabase
      .from("establishments")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (count != null) setSchoolCount(count);
      });
    supabase
      .from("establishments")
      .select("id, name, is_claimed")
      .eq("is_featured", true)
      .limit(1)
      .then(({ data }) => {
        if (data && data[0]) {
          setFeatured({ id: data[0].id, name: data[0].name, isClaimed: data[0].is_claimed ?? true });
        }
      });
  }, []);

  const items: TickerItem[] = [];
  if (featured) {
    items.push({
      id: "featured",
      label: `École à la une : ${featured.name}`,
      href: featured.isClaimed ? `/ecole/${featured.id}` : `/auth/inscription?ecole=${featured.id}`,
    });
  }
  if (schoolCount != null && schoolCount > 0) {
    items.push({
      id: "count",
      label: `${schoolCount} établissement${schoolCount !== 1 ? "s" : ""} déjà référencé${schoolCount !== 1 ? "s" : ""}`,
      href: "/recherche",
    });
  }
  items.push({ id: "preinscription", label: "Préinscription en ligne", href: "/preinscription" });
  items.push({ id: "inscription", label: "Inscrire mon établissement", href: "/auth/inscription" });
  return items;
}
