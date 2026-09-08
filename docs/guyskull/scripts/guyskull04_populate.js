// GUYSKULL-04 — scoped, authorized service_role content population for the
// single real establishment "guyskull" (id below). Builds the showcase
// content (editorial text, demo admissions, demo structured pricing, demo
// events) authorized by the GUYSKULL-04 mission, using service_role writes
// because no owner/admin session is available for this establishment and
// publish_school_page_v2 has zero bypass for either role — see
// docs/guyskull/GUYSKULL-04A_POPULATION_HARDENING_REPORT.md for the full
// review of why this mechanism was chosen and what it does and does not
// touch.
//
// GUYSKULL-04A hardening: hard pre-write invariant guards (abort before any
// write if the live establishment doesn't match the exact expected
// baseline), deterministic client-generated insert ids, incremental
// local-only rollback evidence (written before the first write and updated
// after every successful step), an idempotence guard against a second run,
// and no-blind-continuation on partial failure (see guyskull04_rollback.js).
//
// This script performs REAL PRODUCTION WRITES when run. It must only be
// invoked after an explicit, reviewed approval for this exact run.
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { serviceRole } = require("./guyskull04_client");

const GUYSKULL = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const EXPECTED_NAME = "guyskull";
const EXPECTED_CATEGORY = "garderie";
const EXPECTED_TUITION_FEE = 29000;
const EXPECTED_KNOWN_OWNER_ID = "84884e49-3596-451a-b0b6-b8eeda4a9e50"; // known from prior baseline captures (GUYSKULL-01/03) — belt-and-suspenders on top of "non-null".
const RUN_MARKER = "GUYSKULL_04_DEMO_V1";
const EVIDENCE_PATH = path.join(__dirname, "guyskull04-runtime-baseline.local.json");

const MOTTO = "Grandir, apprendre, s'épanouir.";
const DESCRIPTION = "Guyskull accueille les tout-petits dans un cadre chaleureux et sécurisé, au cœur du quartier Pk10 à Douala. L'équipe éducative accompagne chaque enfant dans ses premiers apprentissages, entre éveil, jeu et découverte, en étroite collaboration avec les familles.";
const HISTORY = "Implantée à Pk10, dans la ville de Douala, Guyskull fait partie des établissements de proximité qui accompagnent les familles du quartier dans l'accueil et l'éveil des tout-petits. Née de la volonté de proposer un cadre rassurant et attentif aux plus jeunes enfants, la structure a progressivement construit son fonctionnement autour de l'écoute, de la sécurité affective et du respect du rythme de chaque enfant.\n\nContenu de démonstration — informations à confirmer par l'établissement.";
const MISSION = "Offrir à chaque enfant un environnement bienveillant où il se sent en sécurité pour explorer, apprendre et grandir à son rythme, en partenariat avec les familles.";
const VISION = "Devenir, pour les familles de Pk10 et de Douala, une référence de confiance pour l'accueil et l'éveil des tout-petits — un lieu où bienveillance et exigence éducative avancent ensemble.\n\nNos valeurs :\n— Bienveillance : chaque enfant est accueilli avec attention et douceur.\n— Apprentissage : des activités pensées pour éveiller la curiosité.\n— Curiosité : encourager l'envie de découvrir et de comprendre le monde.\n— Respect : de l'enfant, de son rythme et de sa famille.\n— Autonomie : accompagner les premiers pas vers l'indépendance.\n— Collaboration : construire une relation de confiance avec les parents.";

const ADMISSIONS_LEVELS = ["Éveil et découverte", "Développement du langage", "Activités créatives", "Motricité", "Socialisation", "Initiation aux apprentissages"];
const REQUIRED_DOCS = ["Fiche d'inscription complétée", "Copie de l'acte de naissance", "Photos d'identité", "Ancien bulletin ou carnet scolaire (le cas échéant)", "Certificat de transfert (le cas échéant)"];
const ADMISSIONS_ADDITIONAL_INFO = "Les modalités présentées dans cette section sont un exemple de la manière dont Guyskull peut présenter ses admissions sur Écoles237. Elles doivent être confirmées par l'établissement.\n\nTransport et cantine : disponibilité et tarifs à confirmer directement auprès de l'établissement.";

const SCHEDULE_ACADEMIC_YEAR = "2026-2027";
const SCHEDULE_LEVEL_LABEL = "Programme découverte";
const PRICING_DISCLAIMER = "Tarifs de démonstration — à remplacer par les tarifs officiels de l'établissement.";
const EVENT_DISCLAIMER = "Événement de démonstration — à confirmer par l'établissement.";
const EVENTS = [
  { title: "Journée portes ouvertes", content: `Venez découvrir les espaces d'éveil de Guyskull et rencontrer l'équipe éducative autour d'un moment convivial en famille.\n\n${EVENT_DISCLAIMER}`, event_date: "2026-10-10", event_start_time: "09:00:00" },
  { title: "Atelier parents-enfants", content: `Un temps d'activités partagées entre parents et enfants autour du jeu et de la créativité, animé par l'équipe pédagogique.\n\n${EVENT_DISCLAIMER}`, event_date: "2026-11-14", event_start_time: "10:00:00" },
  { title: "Journée créative et sportive", content: `Ateliers créatifs, jeux collectifs et activités motrices en plein air pour clôturer le trimestre dans la bonne humeur.\n\n${EVENT_DISCLAIMER}`, event_date: "2027-03-13", event_start_time: "09:00:00" },
];

function fail(code, message, extra) {
  console.error(`\nABORT [${code}]: ${message}`);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

function assertInvariant(label, cond, expected, actual) {
  if (!cond) fail("GUYSKULL_04_INVARIANT_MISMATCH", `Pre-write invariant failed: ${label}`, { expected, actual });
  console.log(`GUARD OK — ${label}`);
}

async function run(client, { evidencePath = EVIDENCE_PATH } = {}) {
  function saveEvidence(evidence) {
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
  }

  // ==================== PHASE 0 — IDEMPOTENCE GUARD ====================
  const existingSchedule = await client.serviceRole(`school_fee_schedules?select=id&establishment_id=eq.${GUYSKULL}&academic_year=eq.${SCHEDULE_ACADEMIC_YEAR}&level_label=eq.${encodeURIComponent(SCHEDULE_LEVEL_LABEL)}`);
  const existingEvent = await client.serviceRole(`school_announcements?select=id&establishment_id=eq.${GUYSKULL}&title=eq.${encodeURIComponent(EVENTS[0].title)}&event_date=eq.${EVENTS[0].event_date}`);
  if (existingSchedule.body.length > 0 || existingEvent.body.length > 0) {
    fail("GUYSKULL_04_ALREADY_POPULATED", "Demo pricing schedule and/or demo event already exist for Guyskull — refusing to duplicate.", {
      existing_schedule_rows: existingSchedule.body.length,
      existing_event_rows: existingEvent.body.length,
    });
  }
  console.log("IDEMPOTENCE GUARD OK — no prior GUYSKULL-04 demo rows found.\n");

  // ==================== PHASE 1 — LIVE BASELINE FETCH ====================
  const estRes = await client.serviceRole(`establishments?select=*&id=eq.${GUYSKULL}`);
  if (estRes.body.length !== 1) fail("GUYSKULL_04_TARGET_MISSING", "Establishment row not found for the exact target id.", { id: GUYSKULL, rows: estRes.body.length });
  const est = estRes.body[0];

  const feesRes = await client.serviceRole(`fees?select=*&establishment_id=eq.${GUYSKULL}`);
  if (feesRes.body.length !== 1) fail("GUYSKULL_04_FEES_MISSING", "fees row not found for the exact target id.", { id: GUYSKULL, rows: feesRes.body.length });
  const fees = feesRes.body[0];

  const admRes = await client.serviceRole(`admissions_config?select=*&establishment_id=eq.${GUYSKULL}`);
  if (admRes.body.length !== 1) fail("GUYSKULL_04_ADMISSIONS_CONFIG_MISSING", "admissions_config row not found for the exact target id.", { id: GUYSKULL, rows: admRes.body.length });
  const adm = admRes.body[0];

  // ==================== PHASE 2 — HARD PRE-WRITE INVARIANT GATES ====================
  assertInvariant("establishment id matches exact target", est.id === GUYSKULL, GUYSKULL, est.id);
  assertInvariant("name === guyskull", est.name === EXPECTED_NAME, EXPECTED_NAME, est.name);
  assertInvariant("main_category === garderie", est.main_category === EXPECTED_CATEGORY, EXPECTED_CATEGORY, est.main_category);
  assertInvariant("owner_id is non-null", !!est.owner_id, "non-null", est.owner_id);
  assertInvariant("owner_id matches known baseline owner", est.owner_id === EXPECTED_KNOWN_OWNER_ID, EXPECTED_KNOWN_OWNER_ID, est.owner_id);
  assertInvariant("fees.tuition_fee === 29000", fees.tuition_fee === EXPECTED_TUITION_FEE, EXPECTED_TUITION_FEE, fees.tuition_fee);
  assertInvariant("fees.is_qualified === false", fees.is_qualified === false, false, fees.is_qualified);

  assertInvariant("establishments.description === 'hhhhhh' (known placeholder baseline)", est.description === "hhhhhh", "hhhhhh", est.description);
  assertInvariant("establishments.motto is null", est.motto === null, null, est.motto);
  assertInvariant("establishments.history is null", est.history === null, null, est.history);
  assertInvariant("establishments.mission is null", est.mission === null, null, est.mission);
  assertInvariant("establishments.vision is null", est.vision === null, null, est.vision);
  assertInvariant("admissions_config.levels is empty", Array.isArray(adm.levels) && adm.levels.length === 0, "[]", adm.levels);
  assertInvariant("admissions_config.required_documents is empty", Array.isArray(adm.required_documents) && adm.required_documents.length === 0, "[]", adm.required_documents);
  assertInvariant("admissions_config.additional_info is null", adm.additional_info === null, null, adm.additional_info);
  assertInvariant("admissions_config.conditions is null", adm.conditions === null, null, adm.conditions);
  assertInvariant("admissions_config.period_start is null", adm.period_start === null, null, adm.period_start);
  assertInvariant("admissions_config.period_end is null", adm.period_end === null, null, adm.period_end);

  console.log("\nALL PRE-WRITE GUARDS PASSED.\n");

  // ==================== PHASE 3 — FREEZE BASELINE + PLAN DETERMINISTIC IDS ====================
  const plannedIds = {
    schedule_id: randomUUID(),
    installment_ids: [randomUUID(), randomUUID(), randomUUID()],
    additional_fee_ids: [randomUUID(), randomUUID()],
    announcement_ids: [randomUUID(), randomUUID(), randomUUID()],
  };

  const evidence = {
    run_marker: RUN_MARKER,
    target_establishment_id: GUYSKULL,
    captured_at: new Date().toISOString(),
    baseline: {
      establishments: {
        name: est.name, main_category: est.main_category, owner_id: est.owner_id,
        description: est.description, motto: est.motto, history: est.history, mission: est.mission, vision: est.vision,
        phone: est.phone, email: est.email, website: est.website, address: est.address, city: est.city, neighborhood: est.neighborhood,
        hero_mode: est.hero_mode, founding_year: est.founding_year, student_count: est.student_count, teacher_count: est.teacher_count,
        is_verified: est.is_verified, is_claimed: est.is_claimed, verification_status: est.verification_status,
        official_id: est.official_id, source_ministry: est.source_ministry,
      },
      fees: { tuition_fee: fees.tuition_fee, is_qualified: fees.is_qualified, currency: fees.currency, registration_fee: fees.registration_fee },
      admissions_config: { is_open: adm.is_open, levels: adm.levels, conditions: adm.conditions, required_documents: adm.required_documents, period_start: adm.period_start, period_end: adm.period_end, additional_info: adm.additional_info },
    },
    planned_ids: plannedIds,
    writes_applied: { establishments_identity: false, admissions_config_demo: false, fees_is_qualified: false },
    insert_progress: { schedule: false, installments: [false, false, false], additional_fees: [false, false], announcements: [false, false, false] },
  };
  saveEvidence(evidence);
  console.log(`Evidence file written (pre-write) at ${evidencePath}\n`);

  function reportPartialFailureAndExit(stepLabel, res) {
    saveEvidence(evidence);
    console.error(`\nPARTIAL FAILURE at step: ${stepLabel}`);
    console.error(`HTTP status: ${res.status}, body: ${JSON.stringify(res.body)}`);
    console.error(`Evidence of everything that succeeded so far is saved at: ${evidencePath}`);
    console.error(`To roll back exactly what succeeded, run:`);
    console.error(`  node guyskull04_rollback.js`);
    process.exit(1);
  }

  // ==================== PHASE 4 — WRITES (each verified + evidence persisted immediately) ====================
  const estPatch = await client.serviceRole(`establishments?id=eq.${GUYSKULL}`, {
    method: "PATCH",
    body: { description: DESCRIPTION, motto: MOTTO, history: HISTORY, mission: MISSION, vision: VISION },
  });
  if (!(estPatch.status === 200 || estPatch.status === 204)) return reportPartialFailureAndExit("establishments identity PATCH", estPatch);
  evidence.writes_applied.establishments_identity = true;
  saveEvidence(evidence);
  console.log("APPLIED — establishments identity fields.");

  const admPatch = await client.serviceRole(`admissions_config?establishment_id=eq.${GUYSKULL}`, {
    method: "PATCH",
    body: { levels: ADMISSIONS_LEVELS, required_documents: REQUIRED_DOCS, additional_info: ADMISSIONS_ADDITIONAL_INFO },
  });
  if (!(admPatch.status === 200 || admPatch.status === 204)) return reportPartialFailureAndExit("admissions_config PATCH", admPatch);
  evidence.writes_applied.admissions_config_demo = true;
  saveEvidence(evidence);
  console.log("APPLIED — admissions_config demo fields.");

  const feesPatch = await client.serviceRole(`fees?establishment_id=eq.${GUYSKULL}`, { method: "PATCH", body: { is_qualified: false } });
  if (!(feesPatch.status === 200 || feesPatch.status === 204)) return reportPartialFailureAndExit("fees.is_qualified PATCH", feesPatch);
  evidence.writes_applied.fees_is_qualified = true;
  saveEvidence(evidence);
  console.log("APPLIED — fees.is_qualified (explicit false, no-op vs. baseline).");

  const scheduleIns = await client.serviceRole("school_fee_schedules", {
    method: "POST",
    body: { id: plannedIds.schedule_id, establishment_id: GUYSKULL, academic_year: SCHEDULE_ACADEMIC_YEAR, level_label: SCHEDULE_LEVEL_LABEL, registration_fee: 25000, tuition_fee: 300000, currency: "FCFA", notes: PRICING_DISCLAIMER, position: 0 },
  });
  if (scheduleIns.status !== 201) return reportPartialFailureAndExit("school_fee_schedules INSERT", scheduleIns);
  if (scheduleIns.body[0].id !== plannedIds.schedule_id) return reportPartialFailureAndExit("school_fee_schedules INSERT returned unexpected id", scheduleIns);
  evidence.insert_progress.schedule = true;
  saveEvidence(evidence);
  console.log(`APPLIED — school_fee_schedules (id=${plannedIds.schedule_id}).`);

  const installments = [
    { label: "Tranche 1", position: 0, amount: 100000 },
    { label: "Tranche 2", position: 1, amount: 100000 },
    { label: "Tranche 3", position: 2, amount: 100000 },
  ];
  for (let i = 0; i < installments.length; i += 1) {
    const inst = installments[i];
    const r = await client.serviceRole("school_fee_installments", { method: "POST", body: { id: plannedIds.installment_ids[i], fee_schedule_id: plannedIds.schedule_id, label: inst.label, position: inst.position, amount: inst.amount, due_date: null, notes: null } });
    if (r.status !== 201) return reportPartialFailureAndExit(`school_fee_installments INSERT (${inst.label})`, r);
    if (r.body[0].id !== plannedIds.installment_ids[i]) return reportPartialFailureAndExit(`school_fee_installments INSERT returned unexpected id (${inst.label})`, r);
    evidence.insert_progress.installments[i] = true;
    saveEvidence(evidence);
    console.log(`APPLIED — installment ${inst.label} (id=${plannedIds.installment_ids[i]}).`);
  }

  const addFees = [
    { category: "badge", label: "Badge / carte de l'établissement", amount: 5000, mandatory: true, frequency: "à l'inscription", notes: null, position: 0 },
    { category: "uniform", label: "Tenue / activités", amount: 15000, mandatory: false, frequency: "annuelle", notes: null, position: 1 },
  ];
  for (let i = 0; i < addFees.length; i += 1) {
    const fee = addFees[i];
    const r = await client.serviceRole("school_additional_fees", { method: "POST", body: { id: plannedIds.additional_fee_ids[i], establishment_id: GUYSKULL, academic_year: SCHEDULE_ACADEMIC_YEAR, ...fee } });
    if (r.status !== 201) return reportPartialFailureAndExit(`school_additional_fees INSERT (${fee.label})`, r);
    if (r.body[0].id !== plannedIds.additional_fee_ids[i]) return reportPartialFailureAndExit(`school_additional_fees INSERT returned unexpected id (${fee.label})`, r);
    evidence.insert_progress.additional_fees[i] = true;
    saveEvidence(evidence);
    console.log(`APPLIED — additional fee ${fee.label} (id=${plannedIds.additional_fee_ids[i]}).`);
  }

  for (let i = 0; i < EVENTS.length; i += 1) {
    const ev = EVENTS[i];
    const r = await client.serviceRole("school_announcements", { method: "POST", body: { id: plannedIds.announcement_ids[i], establishment_id: GUYSKULL, title: ev.title, content: ev.content, type: "event", is_important: false, event_date: ev.event_date, event_start_time: ev.event_start_time } });
    if (r.status !== 201) return reportPartialFailureAndExit(`school_announcements INSERT (${ev.title})`, r);
    if (r.body[0].id !== plannedIds.announcement_ids[i]) return reportPartialFailureAndExit(`school_announcements INSERT returned unexpected id (${ev.title})`, r);
    evidence.insert_progress.announcements[i] = true;
    saveEvidence(evidence);
    console.log(`APPLIED — event "${ev.title}" (id=${plannedIds.announcement_ids[i]}).`);
  }

  // ==================== PHASE 5 — POST-WRITE VERIFICATION ====================
  const finalEst = (await client.serviceRole(`establishments?select=*&id=eq.${GUYSKULL}`)).body[0];
  assertInvariant("POST-WRITE name UNCHANGED", finalEst.name === EXPECTED_NAME, EXPECTED_NAME, finalEst.name);
  assertInvariant("POST-WRITE main_category UNCHANGED", finalEst.main_category === EXPECTED_CATEGORY, EXPECTED_CATEGORY, finalEst.main_category);
  assertInvariant("POST-WRITE owner_id UNCHANGED", finalEst.owner_id === est.owner_id, est.owner_id, finalEst.owner_id);
  assertInvariant("POST-WRITE phone UNCHANGED", finalEst.phone === est.phone, est.phone, finalEst.phone);
  assertInvariant("POST-WRITE email UNCHANGED", finalEst.email === est.email, est.email, finalEst.email);
  assertInvariant("POST-WRITE website UNCHANGED", finalEst.website === est.website, est.website, finalEst.website);
  assertInvariant("POST-WRITE address UNCHANGED", finalEst.address === est.address, est.address, finalEst.address);
  assertInvariant("POST-WRITE city UNCHANGED", finalEst.city === est.city, est.city, finalEst.city);
  assertInvariant("POST-WRITE official_id UNCHANGED", finalEst.official_id === est.official_id, est.official_id, finalEst.official_id);
  assertInvariant("POST-WRITE source_ministry UNCHANGED", finalEst.source_ministry === est.source_ministry, est.source_ministry, finalEst.source_ministry);
  assertInvariant("POST-WRITE description SET", finalEst.description === DESCRIPTION, DESCRIPTION, finalEst.description);
  assertInvariant("POST-WRITE motto SET", finalEst.motto === MOTTO, MOTTO, finalEst.motto);

  const finalFees = (await client.serviceRole(`fees?select=*&establishment_id=eq.${GUYSKULL}`)).body[0];
  assertInvariant("POST-WRITE fees.tuition_fee STILL 29000", finalFees.tuition_fee === EXPECTED_TUITION_FEE, EXPECTED_TUITION_FEE, finalFees.tuition_fee);
  assertInvariant("POST-WRITE fees.is_qualified STILL false", finalFees.is_qualified === false, false, finalFees.is_qualified);

  const finalSchedules = await client.serviceRole(`school_fee_schedules?select=id&establishment_id=eq.${GUYSKULL}`);
  assertInvariant("POST-WRITE exactly 1 schedule for Guyskull", finalSchedules.body.length === 1, 1, finalSchedules.body.length);
  const finalEvents = await client.serviceRole(`school_announcements?select=id&establishment_id=eq.${GUYSKULL}`);
  assertInvariant("POST-WRITE exactly 3 events for Guyskull", finalEvents.body.length === 3, 3, finalEvents.body.length);

  console.log(`\nALL WRITES COMPLETE AND VERIFIED. Evidence + rollback data at: ${evidencePath}`);
}

module.exports = { run, GUYSKULL, EXPECTED_NAME, EXPECTED_CATEGORY, EXPECTED_TUITION_FEE, EXPECTED_KNOWN_OWNER_ID, RUN_MARKER, EVIDENCE_PATH };

if (require.main === module) {
  run({ serviceRole }).catch((e) => { console.error("FATAL:", e.stack || e.message); process.exit(1); });
}
