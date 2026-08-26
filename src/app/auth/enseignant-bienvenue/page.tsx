import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/branding/Logo";
import { isValidEstablishmentId } from "@/lib/school/establishmentContext";
import { createClient } from "@/lib/supabase/server";

export default async function EnseignantBienvenuePage({
  searchParams,
}: {
  searchParams: Promise<{
    invitation_status?: string;
    resource_type?: string;
    resource_id?: string;
    school?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");

  const params = await searchParams;
  let success = false;
  let target: "teacher" | "staff" = "staff";

  if (
    params.invitation_status === "success" &&
    (params.resource_type === "teacher" || params.resource_type === "staff_member") &&
    isValidEstablishmentId(params.resource_id) &&
    isValidEstablishmentId(params.school)
  ) {
    if (params.resource_type === "teacher") {
      const { data: teacher } = await supabase
        .from("enseignants")
        .select("id")
        .eq("id", params.resource_id)
        .eq("etablissement_id", params.school)
        .eq("user_id", user.id)
        .maybeSingle();
      success = Boolean(teacher);
      target = "teacher";
    } else {
      const { data: staff } = await supabase
        .from("staff_members")
        .select("id, enseignant_id")
        .eq("id", params.resource_id)
        .eq("etablissement_id", params.school)
        .eq("user_id", user.id)
        .maybeSingle();
      success = Boolean(staff);
      target = staff?.enseignant_id ? "teacher" : "staff";
    }
  }

  return (
    <InvitationState
      error={success ? undefined : "Invitation invalide, expirée, déjà utilisée ou non encore activée."}
      target={target}
    />
  );
}

function InvitationState({ error, target }: { error?: string; target: "teacher" | "staff" }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f3ef] px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="md" />
        </div>
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${error ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
          <span className="text-2xl font-black">{error ? "!" : "✓"}</span>
        </div>
        <h1 className="mb-3 text-2xl font-bold text-gray-900">
          {error ? "Invitation non finalisée" : "Compte activé"}
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          {error ?? "Votre compte est maintenant lié à la ressource et à l’établissement prévus par l’invitation."}
        </p>
        <Link
          href={error || target === "staff" ? "/dashboard/ecole" : "/enseignant/mon-espace"}
          className="block w-full rounded-xl bg-[#007A3D] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#006030]"
        >
          {error ? "Retour au tableau de bord" : "Accéder à mon espace"}
        </Link>
      </div>
    </div>
  );
}
