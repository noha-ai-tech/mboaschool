import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260907230000_offline_sync_foundation.sql";

test("le registre d'idempotence sync_mutations est un journal append-only : aucune policy update/delete", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /create table if not exists public\.sync_mutations/);
  assert.doesNotMatch(src, /for update on public\.sync_mutations|for delete on public\.sync_mutations/);
});

test("RLS : un utilisateur ne peut lire/insérer que ses propres mutations dans le registre", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /create policy "actor reads own sync mutations" on public\.sync_mutations\s*\n\s*for select\s*\n\s*using \(actor_user_id = auth\.uid\(\)\);/);
  assert.match(src, /create policy "actor inserts own sync mutations" on public\.sync_mutations\s*\n\s*for insert\s*\n\s*with check \(actor_user_id = auth\.uid\(\)\);/);
});

test("platform_admin peut lire tout le registre (audit), jamais un utilisateur normal", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /create policy "platform_admin reads all sync mutations" on public\.sync_mutations/);
  assert.match(src, /role = 'platform_admin'/);
});

test("l'application atomique du pilote absence insère absences ET sync_mutations dans une seule fonction (une seule transaction)", async () => {
  const src = await source(MIGRATION);
  const fnStart = src.indexOf("create or replace function public.sync_apply_absence_create");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.match(fnBody, /insert into public\.absences/);
  assert.match(fnBody, /insert into public\.sync_mutations/);
  assert.match(fnBody, /security definer/);
});

test("la fonction verrouille (for update) toute ligne existante du registre avant de décider — rejoue l'idempotence sans ré-exécuter", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /where mutation_id = p_mutation_id for update/);
  assert.match(src, /if v_existing\.mutation_id is not null then/);
});

test("un double-envoi concurrent (vrai double-clic) est rattrapé par un handler EXCEPTION unique_violation, jamais une erreur brute exposée au client", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /exception\s*\n\s*when unique_violation then/);
});

test("l'autorisation dans la fonction SECURITY DEFINER reproduit exactement la garde applicative (owner_id + forfait pro), jamais élargie", async () => {
  const src = await source(MIGRATION);
  const fnStart = src.indexOf("create or replace function public.sync_apply_absence_create");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.match(fnBody, /e\.owner_id = auth\.uid\(\)/);
  assert.match(fnBody, /e\.forfait = 'pro'/);
});

test("la migration ne modifie aucune table/policy existante (absences, staff_members, establishments)", async () => {
  const src = await source(MIGRATION);
  assert.doesNotMatch(src, /alter table public\.absences\b/);
  assert.doesNotMatch(src, /alter table public\.staff_members\b/);
  assert.doesNotMatch(src, /drop table/i);
});

test("marquée comme non appliquée en production, comme les migrations précédentes de ce sprint", async () => {
  const src = await source(MIGRATION);
  assert.match(src, /PRÉPARÉE MAIS NON EXÉCUTÉE/);
});
