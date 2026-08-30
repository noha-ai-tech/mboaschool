import { Building2, FolderPlus, Link2, Unlink } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  attachEstablishment,
  createOrganization,
  detachEstablishment,
  renameOrganization,
} from "./actions";

type Organization = {
  id: string;
  name: string;
};

type Establishment = {
  id: string;
  name: string;
  city: string | null;
  organization_id: string | null;
};

export default async function OrganisationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/connexion");

  const [{ data: organizationRows, error: organizationError }, { data: establishmentRows }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("establishments")
        .select("id, name, city, organization_id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

  if (organizationError) {
    throw new Error("La fondation Organizations doit être migrée avant d’ouvrir cette page.");
  }

  const organizations = (organizationRows ?? []) as Organization[];
  const establishments = (establishmentRows ?? []) as Establishment[];
  const independent = establishments.filter((school) => !school.organization_id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Organisation
        </p>
        <h1 className="text-2xl font-black text-[#0a0a0a] sm:text-3xl">
          Mes groupes scolaires
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Regroupez certains de vos établissements sans modifier leur fonctionnement ni leurs
          sections. Un établissement peut aussi rester indépendant.
        </p>
      </div>

      {organizations.length === 0 ? (
        <section className="rounded-2xl border border-[#e7e3da] bg-white p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <Building2 className="text-emerald-700" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-[#0a0a0a]">Vos établissements sont indépendants</h2>
              <p className="mt-1 text-sm text-slate-500">
                Vous n’êtes pas obligé de créer une organisation. Créez un groupe seulement si
                vous souhaitez réunir plusieurs établissements sous une même structure.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {organizations.map((organization) => {
            const attached = establishments.filter(
              (school) => school.organization_id === organization.id
            );

            return (
              <section
                key={organization.id}
                className="rounded-2xl border border-[#e7e3da] bg-white p-5 sm:p-7"
              >
                <div className="flex flex-col gap-4 border-b border-[#eeeae2] pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black text-[#0a0a0a]">{organization.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {attached.length} établissement{attached.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <form action={renameOrganization} className="flex w-full gap-2 sm:w-auto">
                    <input type="hidden" name="organization_id" value={organization.id} />
                    <label className="sr-only" htmlFor={`name-${organization.id}`}>
                      Nouveau nom
                    </label>
                    <input
                      id={`name-${organization.id}`}
                      name="name"
                      defaultValue={organization.name}
                      maxLength={160}
                      required
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none sm:w-64"
                    />
                    <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-700">
                      Renommer
                    </button>
                  </form>
                </div>

                <div className="py-5">
                  {attached.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun établissement rattaché.</p>
                  ) : (
                    <ul className="space-y-2">
                      {attached.map((school) => (
                        <li
                          key={school.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-[#f9f7f2] px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0a0a0a]">
                              {school.name}
                            </p>
                            {school.city && <p className="text-xs text-slate-500">{school.city}</p>}
                          </div>
                          <form action={detachEstablishment}>
                            <input type="hidden" name="organization_id" value={organization.id} />
                            <input type="hidden" name="establishment_id" value={school.id} />
                            <button
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-white hover:text-red-700"
                              aria-label={`Retirer ${school.name} du groupe`}
                            >
                              <Unlink size={14} />
                              <span className="hidden sm:inline">Retirer</span>
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {independent.length > 0 && (
                  <form
                    action={attachEstablishment}
                    className="flex flex-col gap-2 border-t border-[#eeeae2] pt-5 sm:flex-row"
                  >
                    <input type="hidden" name="organization_id" value={organization.id} />
                    <label className="sr-only" htmlFor={`school-${organization.id}`}>
                      Établissement à rattacher
                    </label>
                    <select
                      id={`school-${organization.id}`}
                      name="establishment_id"
                      required
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                    >
                      {independent.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                    <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                      <Link2 size={15} />
                      Rattacher
                    </button>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-5 sm:p-7">
        <div className="mb-4 flex items-center gap-3">
          <FolderPlus className="text-emerald-700" size={20} />
          <div>
            <h2 className="font-bold text-[#0a0a0a]">Créer une organisation</h2>
            <p className="text-xs text-slate-500">Vous pourrez ensuite y rattacher vos établissements indépendants.</p>
          </div>
        </div>
        <form action={createOrganization} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="organization-name">
            Nom de l’organisation
          </label>
          <input
            id="organization-name"
            name="name"
            placeholder="Ex. Groupe Scolaire Exemple"
            maxLength={160}
            required
            className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
          />
          <button className="rounded-lg bg-[#0a0a0a] px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            Créer le groupe
          </button>
        </form>
      </section>

      {independent.length > 0 && organizations.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-[#0a0a0a]">Établissements indépendants</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {independent.map((school) => (
              <li key={school.id} className="rounded-xl border border-[#e7e3da] bg-white px-4 py-3">
                <p className="text-sm font-semibold text-[#0a0a0a]">{school.name}</p>
                {school.city && <p className="text-xs text-slate-500">{school.city}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
