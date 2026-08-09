"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PlatformAdminRole } from "./permissions";

export type PlatformAdminData = {
  id: string;
  fullName: string | null;
  adminRole: PlatformAdminRole | null;
};

// Équivalent de useSchool() (src/lib/useSchool.ts) pour le POC. Le
// middleware garantit déjà que seul un role='platform_admin' atteint cette
// page — ce hook charge en plus admin_role pour les vérifications de
// permission fines (src/lib/platform/permissions.ts).
export function usePlatformAdmin() {
  const [admin, setAdmin] = useState<PlatformAdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, admin_role")
        .eq("id", user.id)
        .single();
      if (data) {
        setAdmin({ id: data.id, fullName: data.full_name, adminRole: data.admin_role });
      }
      setLoading(false);
    }
    load();
  }, []);

  return { admin, loading };
}
