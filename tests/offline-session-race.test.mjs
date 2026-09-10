import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import 'fake-indexeddb/auto';
import { clearOfflineCache } from '../src/lib/offline/db.ts';
import { enqueueMutation, listMutations, updateMutation, removeMutation } from '../src/lib/offline/outbox.ts';
import { runSync, getSyncState, subscribeSyncState } from '../src/lib/offline/syncEngine.ts';
import { setActiveSyncUser, getActiveSyncIdentity } from '../src/lib/offline/syncIdentity.ts';

const seed = () => enqueueMutation({ userId: 'A', establishmentId: 'school', entityType: 'absence', operation: 'create', entityId: null, baseVersion: null, payload: { staff_member_id: 'staff', type: 'absence', date_debut: '2026-09-01', date_fin: '2026-09-02' } });
const response = (m) => new Response(JSON.stringify({ results: [{ mutationId: m.mutationId, status: 'applied' }] }));
test.beforeEach(async () => { await clearOfflineCache(); setActiveSyncUser('A'); });

test('OFFLINE-01.3: switch during IndexedDB read sends zero requests and preserves the row', async () => {
  const m = await seed(); let calls = 0;
  const work = runSync({ fetchImpl: async () => { calls++; return response(m); } });
  setActiveSyncUser('B'); await work;
  assert.equal(calls, 0); assert.deepEqual(await listMutations({ userId: 'A' }), [m]);
  assert.equal(getSyncState().syncing, false);
});

test('OFFLINE-01.3: switch after read, before marking, sends zero requests', async () => {
  const m = await seed(); let calls = 0;
  const unsubscribe = subscribeSyncState(s => { if (s.syncing) setActiveSyncUser('B'); });
  try { await runSync({ fetchImpl: async () => { calls++; return response(m); } }); }
  finally { unsubscribe(); }
  assert.equal(calls, 0); assert.deepEqual(await listMutations({ userId: 'A' }), [m]);
});

test('OFFLINE-01.3: actual in-flight response after account switch cannot delete A', async () => {
  const m = await seed(); let release; let entered;
  const started = new Promise(r => { entered = r; });
  const gate = new Promise(r => { release = r; });
  const work = runSync({ fetchImpl: async (_url, init) => {
    assert.equal(JSON.parse(init.body).expectedUserId, 'A'); entered(); await gate; return response(m);
  } });
  await started; setActiveSyncUser('B'); release(); await work;
  assert.equal((await listMutations({ userId: 'A' }))[0].status, 'pending');
  assert.equal(getSyncState().syncing, false);
});

test('OFFLINE-01.3: switch during error body parsing preserves pending and retry count', async () => {
  const m = await seed();
  await runSync({ fetchImpl: async () => ({ ok: false, status: 500, json: async () => { setActiveSyncUser('B'); return { error: 'old error' }; } }) });
  const [row] = await listMutations({ userId: 'A' });
  assert.equal(row.status, 'pending'); assert.equal(row.retryCount, 0);
});

test('OFFLINE-01.3: transaction checks generation before put and delete', async () => {
  const m = await seed(); const gen = getActiveSyncIdentity().generation;
  const scope = { userId: 'A', isCurrent: () => getActiveSyncIdentity().generation === gen };
  const put = updateMutation(m.mutationId, { status: 'rejected' }, scope);
  const del = removeMutation(m.mutationId, scope);
  setActiveSyncUser('B');
  assert.deepEqual(await put, { ok: false }); assert.deepEqual(await del, { ok: false });
  assert.deepEqual(await listMutations({ userId: 'A' }), [m]);
});

test('OFFLINE-01.3: concurrent triggers share a lock acquired before IndexedDB read', async () => {
  const m = await seed(); let calls = 0;
  const fetchImpl = async () => { calls++; return response(m); };
  await Promise.all([runSync({ fetchImpl }), runSync({ fetchImpl })]);
  assert.equal(calls, 1);
});

test('OFFLINE-01.3: explicit foreign user override cannot send', async () => {
  const m = await seed(); setActiveSyncUser('B'); let calls = 0;
  await runSync({ userId: 'A', fetchImpl: async () => { calls++; return response(m); } });
  assert.equal(calls, 0);
});

async function loadRoute(actor) {
  let writes = 0;
  const code = await readFile(new URL('../src/app/api/sync/push/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const client = { auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null } }) }, rpc: () => { writes++; return { single: async () => ({ data: { result_status: 'applied', result_entity_id: 'id', result_error: null } }) }; }, from: () => { writes++; throw new Error('Unexpected write'); } };
  const exports = {};
  new Function('require', 'exports', compiled)(name => {
    if (name === 'next/server') return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
    if (name === '@/lib/supabase/server') return { createClient: async () => client };
    throw new Error(`Unexpected import ${name}`);
  }, exports);
  return { post: exports.POST, writes: () => writes };
}
for (const expectedUserId of ['A', undefined]) {
  test(`OFFLINE-01.3: real route rejects foreign/missing actor (${expectedUserId}) before any write`, async () => {
    const route = await loadRoute('B'); const m = await seed();
    const result = await route.post({ json: async () => ({ expectedUserId, mutations: [m] }) });
    assert.equal(result.status, 409); assert.equal(route.writes(), 0);
  });
}
test('OFFLINE-01.3: real route accepts matching actor and preserves unauthenticated denial', async () => {
  const m = await seed(); const body = { expectedUserId: 'A', mutations: [m] };
  const route = await loadRoute('A');
  assert.equal((await route.post({ json: async () => body })).status, 200); assert.equal(route.writes(), 1);
  const anonymous = await loadRoute(null);
  assert.equal((await anonymous.post({ json: async () => body })).status, 401); assert.equal(anonymous.writes(), 0);
});

test('OFFLINE-01.3: switch while marking syncing cancels dispatch and restores pending', async () => {
  const m = await seed(); let calls = 0;
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, ...args) {
    const request = original.call(this, value, ...args);
    if (value.status === 'syncing') queueMicrotask(() => setActiveSyncUser('B'));
    return request;
  };
  try { await runSync({ fetchImpl: async () => { calls++; return response(m); } }); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal(calls, 0);
  assert.equal((await listMutations({ userId: 'A' }))[0].status, 'pending');
  assert.equal(getSyncState().syncing, false);
});

test('OFFLINE-01.3: A to B to A during read still invalidates the original generation', async () => {
  const m = await seed(); let calls = 0;
  const work = runSync({ fetchImpl: async () => { calls++; return response(m); } });
  setActiveSyncUser('B'); setActiveSyncUser('A'); await work;
  assert.equal(calls, 0); assert.deepEqual(await listMutations({ userId: 'A' }), [m]);
});

test('OFFLINE-01.3: late initial getUser cannot overwrite a newer auth event', async () => {
  let resolveUser; let authListener; let cleanup; let starts = 0;
  const userResult = new Promise(resolve => { resolveUser = resolve; });
  const code = await readFile(new URL('../src/components/offline/OfflineRuntime.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(name => {
    if (name === 'react') return { useEffect: fn => { cleanup = fn(); } };
    if (name === '@/lib/supabase') return { supabase: { auth: {
      getUser: () => userResult,
      onAuthStateChange: fn => { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; }
    } } };
    if (name.endsWith('/syncIdentity')) return { setActiveSyncUser };
    if (name.endsWith('/syncEngine')) return { initSyncEngine: () => { starts++; return () => {}; } };
    if (name.endsWith('/registerServiceWorker')) return { registerServiceWorker() {} };
    if (name.endsWith('/db')) return { clearOfflineCache };
    throw new Error(`Unexpected import ${name}`);
  }, exports);
  exports.OfflineRuntime(); authListener('SIGNED_IN', { user: { id: 'B' } });
  resolveUser({ data: { user: { id: 'A' } } });
  await userResult; await Promise.resolve(); cleanup();
  assert.equal(getActiveSyncIdentity().userId, 'B'); assert.equal(starts, 1);
});
