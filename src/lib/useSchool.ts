"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type SchoolData = {
  id: string;
  name: string;
  city: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  description?: string | null;
  address?: string | null;
  main_category: string;
  is_verified: boolean;
  subscription_plan: string;
  forfait: "gratuit" | "gere" | "pro";
};

export type AuthUser = {
  id: string;
  email: string;
};

export function useSchool() {
  const [school, setSchool] = useState<SchoolData | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setLoading(false);
        return;
      }

      setUser({ id: authUser.id, email: authUser.email! });

      const { data } = await supabase
        .from("establishments")
        .select("id, name, city, neighborhood, phone, email, whatsapp, website, description, address, main_category, is_verified, subscription_plan, forfait")
        .eq("owner_id", authUser.id)
        .single();

      setSchool(data ?? null);
      setLoading(false);
    }

    load();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return { school, user, loading, signOut };
}
