/**
 * stress-test.js — House of More
 *
 * Full-lifecycle stress test for 50 dummy members.
 * Simulates: questionnaire → admin review → member activity burst.
 *
 * Prerequisites:
 *   1. Import dummy-members.csv via Memberstack Dashboard → Members → Import
 *   2. Run this script
 *
 * Usage:
 *   node stress-test.js                  # all phases
 *   node stress-test.js --phase 1        # questionnaire only
 *   node stress-test.js --phase 2        # admin review only
 *   node stress-test.js --phase 3        # member activity only
 *   node stress-test.js --dry-run        # print payloads, no requests
 */

const BASE      = "https://houseofmore.nico-97c.workers.dev";
const EMAIL_PAT = "hom.dummy";
const EMAIL_DOMAIN = "@email.com";

// ── Flags ──────────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes("--dry-run");
const PHASE_ARG = (() => {
  const i = process.argv.indexOf("--phase");
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : null;
})();

// ── Colors ─────────────────────────────────────────────────────────────────────
const C = {
  pass:  "\x1b[32m✓\x1b[0m",
  fail:  "\x1b[31m✗\x1b[0m",
  warn:  "\x1b[33m⚠\x1b[0m",
  dim:   "\x1b[2m",
  red:   "\x1b[31m",
  green: "\x1b[32m",
  cyan:  "\x1b[36m",
  bold:  "\x1b[1m",
  reset: "\x1b[0m",
};

// ── Data pools for randomized questionnaires ───────────────────────────────────
const FIRST_NAMES = [
  "Marcus","Zoe","Jordan","Priya","Elijah","Camille","Dante","Amara","Theo","Simone",
  "Rafael","Keisha","Miles","Leila","Omar","Nadia","Javier","Serena","Kofi","Ingrid",
];
const LAST_NAMES = [
  "Rivers","Chen","Okafor","Vasquez","Thompson","Dubois","Kimura","Santos","Osei","Laurent",
  "Walker","Petrov","Nwosu","Reyes","Hoffman","Adeyemi","Burke","Takahashi","Grant","Moreau",
];
const CITIES     = ["Miami","New York","Los Angeles","Chicago","Atlanta","Houston","Brooklyn","Austin","Seattle","Philadelphia"];
const PATHS      = ["exploring","building","established"];
const SUPPORT_OPTIONS = [
  "Individual Guidance and Mentorship",
  "Community with Like-Minded People",
  "Access to Resources and Opportunities",
  "Accountability and Structure",
  "Creative Collaboration",
  "Spiritual and Personal Growth",
];
const HEAR_FROM  = ["Instagram","A friend","An event","LinkedIn","Google","Word of mouth","A podcast","A referral"];
const DRAWS_YOU  = [
  "I want to be surrounded by people who are building something meaningful.",
  "The community aspect drew me in — I've been looking for a space like this.",
  "I resonate with the values and want to grow alongside others on a similar path.",
  "I heard great things from people I trust and felt called to apply.",
  "I'm at a transition point and looking for the right environment to level up.",
];
const CONTRIBUTIONS = [
  "Volunteering at the House",
  "Sharing skills and expertise",
  "Helping grow the community",
  "Hosting or co-hosting events",
];
const EXTRA_NOTES = [
  "Excited to connect with the community.",
  "Looking forward to contributing my experience in design and strategy.",
  "I've been searching for a space like this for a while.",
  "",
  "",
  "Happy to volunteer when needed.",
  "I travel often but am committed to being present when in town.",
  "",
];
const MARITAL = ["Single","Married","In a relationship","Divorced","Prefer not to say"];
const SEX     = ["Male","Female","Other"];
const MONTHLY = ["1-3","4-6","7+"];

// ── Random helpers ─────────────────────────────────────────────────────────────
function pick(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(startYear, endYear) {
  const year  = randInt(startYear, endYear);
  const month = String(randInt(1, 12)).padStart(2, "0");
  const day   = String(randInt(1, 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function randPhone() {
  return `+1${randInt(200,999)}${randInt(200,999)}${String(randInt(0,9999)).padStart(4,"0")}`;
}
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function sleep(ms)    { return new Promise(r => setTimeout(r, ms)); }

// ── Build questionnaire payload for one member ─────────────────────────────────
function buildQuestionnaire(member) {
  const firstName  = pick(FIRST_NAMES);
  const lastName   = pick(LAST_NAMES);
  const beenBefore = Math.random() < 0.5 ? "yes" : "no";
  const supportCount = randInt(1, 3);
  const contribCount = randInt(1, 2);

  return {
    id:           member.id,
    name:         firstName,
    last_name:    lastName,
    email:        member.email,
    phone:        randPhone(),
    location:     pick(CITIES),
    sex:          pick(SEX),
    marital_status: pick(MARITAL),
    birthday:     randDate(1975, 2000),
    where_are_you_on_your_path: pick(PATHS),
    how_can_we_support_you:     pickN(SUPPORT_OPTIONS, supportCount).join(" / "),
    how_did_you_hear_about_the_house_of_more: pick(HEAR_FROM),
    what_draws_you_to_the_house_of_more:      pick(DRAWS_YOU),
    have_you_been_with_the_house_of_more:     beenBefore,
    how_many_events_have_you_attended_at_the_hom: beenBefore === "yes" ? String(randInt(1, 10)) : "",
    how_many_events_per_month_can_you_participate: pick(MONTHLY),
    community_and_contribution: pickN(CONTRIBUTIONS, contribCount).join(" / "),
    is_there_anything_else:     pick(EXTRA_NOTES),
    do_you_feel_aligned_with_the_house_of_more: Math.random() < 0.9 ? "yes" : "no",
    i_commit_to_respecting_the_house_of_more:   "YES",
    application_status: "pending",
    // Store name on member object for later phases
    _firstName: firstName,
    _lastName:  lastName,
  };
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
async function post(path, body) {
  if (DRY_RUN) {
    console.log(`  ${C.dim}[dry-run] POST ${path}${C.reset}`, JSON.stringify(body).slice(0, 80) + "…");
    return { ok: true, status: 200, data: {} };
  }
  try {
    const res  = await fetch(`${BASE}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* response may not be JSON */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, error: err.message };
  }
}

// ── Batch helper: run in chunks of `size` with delay between chunks ────────────
async function batchAll(items, fn, { size = 10, delay = 300 } = {}) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    if (i + size < items.length) await sleep(delay);
  }
  return results;
}

// ── PHASE 0 — Fetch dummy members from admin ───────────────────────────────────
async function phase0() {
  console.log(`\n${C.cyan}${C.bold}── Phase 0: Fetching dummy members ──${C.reset}`);

  const { ok, data, error } = await post("/admin-list-members", {});
  if (!ok) {
    console.error(`${C.fail} admin-list-members failed — ${error || JSON.stringify(data).slice(0,120)}`);
    process.exit(1);
  }

  // Response may be { members: [...] } or directly an array
  const all = Array.isArray(data) ? data : (data.members || data.data || []);
  const dummies = all.filter(m => {
    const email = m?.auth?.email || m?.email || "";
    return email.includes(EMAIL_PAT);
  });

  if (dummies.length === 0) {
    console.error(`${C.fail} No dummy members found. Import dummy-members.csv first.`);
    process.exit(1);
  }

  const members = dummies.map(m => ({
    id:    m.id || m.member_id,
    email: m?.auth?.email || m?.email || m?.customFields?.email,
  })).filter(m => m.id && m.email);

  console.log(`  ${C.pass} Found ${members.length} dummy members`);
  return members;
}

// ── PHASE 1 — Questionnaire wave ───────────────────────────────────────────────
async function phase1(members) {
  console.log(`\n${C.cyan}${C.bold}── Phase 1: Questionnaire Wave (${members.length} members, batches of 10) ──${C.reset}`);

  let passed = 0, failed = 0;
  const enriched = []; // members with name data added

  const results = await batchAll(members, async (member) => {
    const payload = buildQuestionnaire(member);
    const { _firstName, _lastName, ...body } = payload;
    const { ok, status, data, error } = await post("/questionnaire-create-member", body);

    const label = member.email.replace(EMAIL_DOMAIN, "");
    if (ok) {
      console.log(`  ${C.pass} ${label} ${C.dim}[${status}]${C.reset}`);
      return { ...member, firstName: _firstName, lastName: _lastName, ok: true };
    } else {
      console.log(`  ${C.fail} ${label} — ${error || `[${status}] ${JSON.stringify(data).slice(0,80)}`}`);
      return { ...member, firstName: _firstName, lastName: _lastName, ok: false };
    }
  }, { size: 10, delay: 300 });

  results.forEach(r => r.ok ? passed++ : failed++);
  console.log(`\n  ${C.bold}Questionnaires: ${passed} sent, ${failed} failed${C.reset}`);
  if (failed > 0) console.log(`  ${C.warn} ${failed} failed — check Make.com logs`);

  return results; // enriched member list with names
}

// ── PHASE 2 — Admin review (approve 70%, reject 30%) ──────────────────────────
async function phase2(members) {
  console.log(`\n${C.cyan}${C.bold}── Phase 2: Admin Review (5s delay for Make.com to process...) ──${C.reset}`);
  await sleep(5000);

  const APPROVE_PLAN = "pln_approved-member-bd2jv0hp1";
  const REJECT_PLAN  = "pln_rejected-fo1l60nm3";

  const shuffled = shuffle(members);
  const approveCount = Math.round(members.length * 0.7);
  const toApprove = shuffled.slice(0, approveCount);
  const toReject  = shuffled.slice(approveCount);

  console.log(`  Approving ${toApprove.length} members, rejecting ${toReject.length}...`);

  let passed = 0, failed = 0;
  const approved = [];

  // Sequential with delay — admin actions trigger emails/automations
  for (const member of toApprove) {
    const { ok, status, data, error } = await post("/admin-approve-member", {
      member_id: member.id,
      email:     member.email,
      plan_id:   APPROVE_PLAN,
      action:    "approve",
    });
    const label = member.email.replace(EMAIL_DOMAIN, "");
    if (ok) {
      console.log(`  ${C.pass} approve ${label} ${C.dim}[${status}]${C.reset}`);
      approved.push(member);
      passed++;
    } else {
      console.log(`  ${C.fail} approve ${label} — ${error || `[${status}] ${JSON.stringify(data).slice(0,80)}`}`);
      failed++;
    }
    await sleep(500);
  }

  for (const member of toReject) {
    const { ok, status, data, error } = await post("/admin-approve-member", {
      member_id: member.id,
      email:     member.email,
      plan_id:   REJECT_PLAN,
      action:    "reject",
    });
    const label = member.email.replace(EMAIL_DOMAIN, "");
    if (ok) {
      console.log(`  ${C.pass} reject  ${label} ${C.dim}[${status}]${C.reset}`);
      passed++;
    } else {
      console.log(`  ${C.fail} reject  ${label} — ${error || `[${status}] ${JSON.stringify(data).slice(0,80)}`}`);
      failed++;
    }
    await sleep(500);
  }

  console.log(`\n  ${C.bold}Admin actions: ${passed} succeeded, ${failed} failed${C.reset}`);
  return approved;
}

// ── PHASE 3 — Member activity burst ───────────────────────────────────────────
async function phase3(approvedMembers) {
  console.log(`\n${C.cyan}${C.bold}── Phase 3: Member Activity Burst (${approvedMembers.length} members, all concurrent) ──${C.reset}`);

  // Pick one event ID that 10 members will all hit simultaneously
  let collisionEventId = null;

  async function runMemberFlow(member) {
    const results = [];

    // Step 1: Always fetch profile first (get record_id for RSVP)
    const profileRes = await post("/member-profile", { member_id: member.id });
    results.push({ action: "profile-fetch", ok: profileRes.ok });
    const recordId = profileRes.data?.record_id || profileRes.data?.id || null;

    // Step 2: Randomly pick 3–5 additional tasks
    const taskPool = ["update-profile","list-events","messages-load"];
    const pickedTasks = shuffle(taskPool).slice(0, randInt(1, 3));

    for (const task of pickedTasks) {
      if (task === "update-profile") {
        const r = await post("/member-profile-update", {
          member_id: member.id,
          phone:     randPhone(),
          location:  pick(CITIES),
        });
        results.push({ action: "profile-update", ok: r.ok });
      }

      if (task === "list-events") {
        const r = await post("/member-list-events", {
          member_id:        member.id,
          member_email:     member.email,
          member_record_id: recordId || "",
        });
        results.push({ action: "list-events", ok: r.ok });

        // If we got events back, try to RSVP
        const events = Array.isArray(r.data) ? r.data : (r.data?.events || r.data?.data || []);
        if (events.length > 0 && recordId) {
          // Set the collision event from the first member that gets here
          if (!collisionEventId) collisionEventId = events[0]?.record_id || events[0]?.id;

          const eventRecord = collisionEventId || events[0]?.record_id || events[0]?.id;
          if (eventRecord) {
            const rsvpRes = await post("/member-rsvp", {
              event_record:   eventRecord,
              member_email:   member.email,
              profile_record: recordId,
              name:           `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.email,
              status:         "booking",
              member:         true,
            });
            results.push({ action: "rsvp", ok: rsvpRes.ok });
          }
        }
      }

      if (task === "messages-load") {
        const r = await post("/member-messages-load", { member_id: member.id });
        results.push({ action: "messages-load", ok: r.ok });

        // If any unread messages, mark one as read
        const rawMsgs  = Array.isArray(r.data) ? r.data : (r.data?.messages || r.data?.data || r.data?.records || []);
        const messages = Array.isArray(rawMsgs) ? rawMsgs : [];
        const unread   = messages.find(m => m.read === false && !m.erased);
        if (unread) {
          const msgRes = await post("/member-message-action", {
            message_id: unread.record_id || unread.id,
            erased:     false,
          });
          results.push({ action: "message-read", ok: msgRes.ok });
        }
      }
    }

    return { email: member.email, results };
  }

  // All 35 members run simultaneously
  const allResults = await Promise.all(approvedMembers.map(runMemberFlow));

  // Tally
  let passed = 0, failed = 0;
  for (const { email, results: memberResults } of allResults) {
    const memberFailed = memberResults.filter(r => !r.ok).length;
    const memberPassed = memberResults.filter(r => r.ok).length;
    const label = email.replace(EMAIL_DOMAIN, "");
    if (memberFailed === 0) {
      console.log(`  ${C.pass} ${label} ${C.dim}(${memberPassed} tasks)${C.reset}`);
    } else {
      const failedActions = memberResults.filter(r => !r.ok).map(r => r.action).join(", ");
      console.log(`  ${C.warn} ${label} — ${memberFailed} failed: ${failedActions}`);
    }
    passed  += memberPassed;
    failed  += memberFailed;
  }

  console.log(`\n  ${C.bold}Member tasks: ${passed} passed, ${failed} failed${C.reset}`);
  if (collisionEventId) {
    console.log(`\n  ${C.bold}Collision event tested:${C.reset} ${collisionEventId}`);
    console.log(`  ${C.dim}→ Verify in Make.com: no duplicate RSVPs, capacity correctly enforced${C.reset}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}House of More — Stress Test${C.reset}`);
  console.log(`Worker:  ${BASE}`);
  console.log(`Pattern: *${EMAIL_PAT}*${EMAIL_DOMAIN}`);
  if (DRY_RUN)   console.log(`${C.warn} DRY RUN — no real requests`);
  if (PHASE_ARG) console.log(`${C.warn} Running phase ${PHASE_ARG} only`);
  console.log("─".repeat(64));

  const runAll = !PHASE_ARG;

  // Phase 0 always runs (needed to get member list)
  const members = await phase0();

  if (runAll || PHASE_ARG === 1) {
    const enriched = await phase1(members);
    // Save enriched for phase 2+3
    members.length = 0;
    members.push(...enriched);
  }

  if (runAll || PHASE_ARG === 2) {
    const approved = await phase2(members);
    // If running all phases, carry approved list into phase 3
    if (runAll || PHASE_ARG === 3) {
      await phase3(approved);
    }
    return;
  }

  if (PHASE_ARG === 3) {
    // Phase 3 standalone: treat all fetched members as approved
    await phase3(members);
  }

  console.log("\n" + "─".repeat(64));
  console.log(`${C.bold}Done.${C.reset} Check Make.com execution logs for errors/timeouts.\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
