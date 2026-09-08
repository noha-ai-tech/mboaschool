"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ORGANISATION_PATH = "/pro/organisation";

function requiredText(formData: FormData, key: string, maxLength = 160) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Une valeur obligatoire est manquante.");
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error("La valeur fournie est trop longue.");
  }
  return normalized;
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/connexion");
  return { supabase, user };
}

export async function createOrganization(formData: FormData) {
  const name = requiredText(formData, "name");
  const { supabase, user } = await getAuthenticatedClient();
  const { error } = await supabase.from("organizations").insert({
    name,
    owner_id: user.id,
  });

  if (error) throw new Error("Impossible de créer l’organisation.");
  revalidatePath(ORGANISATION_PATH);
}

export async function renameOrganization(formData: FormData) {
  const organizationId = requiredText(formData, "organization_id", 64);
  const name = requiredText(formData, "name");
  const { supabase, user } = await getAuthenticatedClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", organizationId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) throw new Error("Impossible de renommer cette organisation.");
  revalidatePath(ORGANISATION_PATH);
}

export async function attachEstablishment(formData: FormData) {
  const organizationId = requiredText(formData, "organization_id", 64);
  const establishmentId = requiredText(formData, "establishment_id", 64);
  const { supabase, user } = await getAuthenticatedClient();

  // Validation serveur explicite. La policy RLS restrictive répète ce contrôle
  // à la frontière de la base et reste l'autorité en cas de requête forgée.
  const [{ data: organization }, { data: establishment }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("establishments")
      .select("id")
      .eq("id", establishmentId)
      .eq("owner_id", user.id)
      .is("organization_id", null)
      .maybeSingle(),
  ]);

  if (!organization || !establishment) {
    throw new Error("Rattachement refusé.");
  }

  const { data, error } = await supabase
    .from("establishments")
    .update({ organization_id: organizationId })
    .eq("id", establishmentId)
    .eq("owner_id", user.id)
    .is("organization_id", null)
    .select("id")
    .maybeSingle();

  if (error || !data) throw new Error("Rattachement refusé.");
  revalidatePath(ORGANISATION_PATH);
}

export async function detachEstablishment(formData: FormData) {
  const organizationId = requiredText(formData, "organization_id", 64);
  const establishmentId = requiredText(formData, "establishment_id", 64);
  const { supabase, user } = await getAuthenticatedClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!organization) throw new Error("Retrait refusé.");

  const { data, error } = await supabase
    .from("establishments")
    .update({ organization_id: null })
    .eq("id", establishmentId)
    .eq("owner_id", user.id)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) throw new Error("Retrait refusé.");
  revalidatePath(ORGANISATION_PATH);
}
