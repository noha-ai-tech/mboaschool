import { cookies } from "next/headers";
import { Suspense } from "react";
import { ProSchoolAdminShell } from "@/components/school-admin/ProSchoolAdminShell";
import { isValidEstablishmentId } from "@/lib/school/establishmentContext";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/supabase/activeEstablishment";
import { createClient } from "@/lib/supabase/server";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let schools: { id: string; name: string; forfait: string | null }[] = [];
  let activeSchoolId: string | null = null;

  if (user) {
    const { data } = await supabase
      .from("establishments")
      .select("id, name, forfait")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });
    schools = data ?? [];

    const cookieStore = await cookies();
    const requestedId = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
    const match = isValidEstablishmentId(requestedId)
      ? schools.find((school) => school.id === requestedId)
      : undefined;
    activeSchoolId = match?.id ?? (schools.length === 1 ? schools[0].id : null);
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ProSchoolAdminShell
        schools={schools}
        fallbackSchoolId={activeSchoolId}
        userEmail={user?.email ?? null}
      >
        {children}
      </ProSchoolAdminShell>
    </Suspense>
  );
}
