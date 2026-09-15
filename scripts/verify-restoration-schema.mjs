import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';

// Disposable local database only. Never accepts a production URL.
const root = new pg.Client({ connectionString: 'postgres://postgres:testpass@127.0.0.1:55432/postgres' });
await root.connect();
for (const role of ['anon','authenticated','service_role','invitation_issuer']) {
  if (!(await root.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
    await root.query(`create role ${role} nologin`);
  }
}
const dbName = `restoration_schema_${Date.now()}`;
await root.query(`create database ${dbName}`);
await root.end();
const db = new pg.Client({ connectionString: `postgres://postgres:testpass@127.0.0.1:55432/${dbName}` });
await db.connect();
console.log(`Local verification database: ${dbName}`);
try {
  await db.query(`
    create schema extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'')
    $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
    $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
  `);
  await db.query(await fs.readFile('../production-schema-before.sql', 'utf8'));
  console.log('PASS: actual production public schema restored (no production data).');
  await db.query('set search_path=public,extensions; set check_function_bodies=true; set row_security=on');
  const files = (await fs.readdir('supabase/migrations')).filter(name => name >= '20260907222604_' && name < '20260918090000_').sort();
  for (const file of files) {
    await db.query(await fs.readFile(`supabase/migrations/${file}`, 'utf8'));
    console.log(`PASS: ${file}`);
  }
  console.log('PASS: all missing migrations replayed on the production public schema.');
  const admin = '00000000-0000-4000-8000-000000000001';
  const requester = '00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users(id) values ($1),($2)', [admin, requester]);
  await db.query("insert into public.profiles(id,role) values ($1,'platform_admin'),($2,'parent')", [admin, requester]);
  const request = (await db.query(`insert into public.establishment_creation_requests
    (requester_user_id,proposed_name,proposed_main_category,proposed_phone,proposed_email,first_name,last_name,role_title)
    values ($1,'Local migration test','primaire','000000000','local@example.invalid','Test','Local','Directeur') returning id`, [requester])).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.query('set role authenticated');
  const school = (await db.query('select public.approve_establishment_creation_request($1,null) as id', [request])).rows[0].id;
  await db.query('reset role');
  const approved = (await db.query('select slug, main_category, owner_id from public.establishments where id=$1',[school])).rows[0];
  assert.equal(approved.main_category,'primaire');
  assert.equal(approved.owner_id,requester);
  assert.equal(approved.slug,`ecole-${school}`);
  console.log('PASS: creation request approval works on actual production schema.');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[requester]);
  await db.query('set role authenticated');
  await assert.rejects(db.query(`insert into public.establishment_creation_requests
    (requester_user_id,proposed_name,proposed_phone,proposed_email,first_name,last_name,role_title,status)
    values ($1,'Forged','0','local@example.invalid','A','B','Owner','approved')`,[requester]), {code:'42501'});
  await assert.rejects(db.query('select public.approve_establishment_creation_request($1,null)',[request]), /Accès refusé/);
  await assert.rejects(db.query(`insert into public.sync_mutations
    (mutation_id,entity_type,operation,establishment_id,actor_user_id,status)
    values(gen_random_uuid(),'absence','create',$1,$2,'applied')`,[school,requester]), {code:'42501'});
  await db.query(`insert into public.sync_mutations
    (mutation_id,entity_type,operation,establishment_id,actor_user_id,status)
    values(gen_random_uuid(),'unsupported','create',$1,$2,'rejected')`,[school,requester]);
  await db.query('reset role');
  console.log('PASS: forged approval and successful sync receipts denied; scoped rejection allowed.');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.query('set role anon');
  await assert.rejects(db.query('select * from public.establishment_creation_requests'), {code:'42501'});
  await assert.rejects(db.query('insert into public.applications default values'), {code:'42501'});
  const application = (await db.query(`select * from public.submit_public_application($1,'Test','Local','Parent test','699000001')`,[school])).rows[0];
  assert.ok(application.id && application.tracking_code);
  await db.query('reset role');
  assert.equal((await db.query('select count(*)::int as n from public.school_events where source_id=$1',[application.id])).rows[0].n,1);
  console.log('PASS: anonymous application RPC and event trigger work; direct INSERT remains forbidden.');
} finally {
  await db.end();
}
