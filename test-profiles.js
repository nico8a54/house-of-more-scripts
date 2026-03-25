/**
 * test-profiles.js — House of More
 *
 * Runs key member flows for 3 test profiles simultaneously.
 * Extends the test-webhooks.js pattern with multi-member and stress testing.
 *
 * Usage:
 *   node test-profiles.js                    # all profiles, safe flows only
 *   node test-profiles.js --dangerous        # includes write operations
 *   node test-profiles.js --profile member-b # single profile only
 *   node test-profiles.js --stress-rsvp      # 3 members hit the same event at once
 *
 * Load credentials:
 *   node --env-file=.env.test test-profiles.js
 */

const BASE = "https://houseofmore.nico-97c.workers.dev";

// ── Profiles ───────────────────────────────────────────────────────────────────
const PROFILES = [
  {
    label:        "member-a",
    member_id:    process.env.TEST_MEMBER_ID    || "mem_sb_cmla331hr05l50sps7d2rhy5q",
    member_email: process.env.TEST_MEMBER_EMAIL || "test@example.com",
    name:         process.env.TEST_MEMBER_NAME  || "Test Member A",
    record_id:    process.env.TEST_RECORD_ID    || "rec_test_member",
  },
  {
    label:        "member-b",
    member_id:    process.env.TEST_MEMBER_ID_2    || "mem_sb_REPLACE_B",
    member_email: process.env.TEST_MEMBER_EMAIL_2 || "testb@example.com",
    name:         process.env.TEST_MEMBER_NAME_2  || "Test Member B",
    record_id:    process.env.TEST_RECORD_ID_2    || "rec_test_member_b",
  },
  {
    label:        "member-c",
    member_id:    process.env.TEST_MEMBER_ID_3    || "mem_sb_REPLACE_C",
    member_email: process.env.TEST_MEMBER_EMAIL_3 || "testc@example.com",
    name:         process.env.TEST_MEMBER_NAME_3  || "Test Member C",
    record_id:    process.env.TEST_RECORD_ID_3    || "rec_test_member_c",
  },
];

const EVENT_ID = process.env.TEST_EVENT_ID || "rec_test_event";

// ── Flags ──────────────────────────────────────────────────────────────────────
const DANGEROUS   = process.argv.includes("--dangerous");
const STRESS_RSVP = process.argv.includes("--stress-rsvp");
const FILTER_LABEL = (() => {
  const i = process.argv.indexOf("--profile");
  return i !== -1 ? process.argv[i + 1] : null;
})();

// ── Colors (matches test-webhooks.js) ─────────────────────────────────────────
const C = {
  pass:  "\x1b[32m✓\x1b[0m",
  fail:  "\x1b[31m✗\x1b[0m",
  skip:  "\x1b[33m⊘\x1b[0m",
  dim:   "\x1b[2m",
  red:   "\x1b[31m",
  cyan:  "\x1b[36m",
  bold:  "\x1b[1m",
  reset: "\x1b[0m",
};

// ── Single request ─────────────────────────────────────────────────────────────
async function hit(name, path, body, { dangerous = false } = {}) {
  if (dangerous && !DANGEROUS) {
    return { name, skipped: true };
  }
  let res, text;
  try {
    res  = await fetch(`${BASE}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    text = await res.text();
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
  const snippet = text.length > 120 ? text.slice(0, 120) + "…" : text;
  return { name, ok: res.ok, status: res.status, snippet };
}

// ── Run all flows for one profile ──────────────────────────────────────────────
async function runProfile(p) {
  const flows = [
    hit("profile-fetch",    "/member-profile",      { member_id: p.member_id }),
    hit("messages-load",    "/member-messages-load", { member_id: p.member_id }),
    hit("list-events",      "/member-list-events",   { member_id: p.member_id, member_email: p.member_email, member_record_id: p.record_id }),
    hit("profile-update",   "/member-profile-update", { member_id: p.member_id, full_name: p.name + " (profile test)" }, { dangerous: true }),
    hit("rsvp-booking",     "/member-rsvp",          { event_record: EVENT_ID, member_email: p.member_email, profile_record: p.record_id, name: p.name, status: "booking", member: true }, { dangerous: true }),
  ];

  const results = await Promise.all(flows);
  return { profile: p.label, results };
}

// ── Print results for one profile ──────────────────────────────────────────────
function printProfile({ profile, results }) {
  console.log(`\n${C.cyan}${C.bold}── ${profile} ──${C.reset}`);
  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.skipped) {
      console.log(`  ${C.skip} ${r.name} ${C.dim}(skipped — use --dangerous to run)${C.reset}`);
      skipped++;
    } else if (r.ok) {
      console.log(`  ${C.pass} ${r.name} ${C.dim}[${r.status}]${C.reset}  ${r.snippet}`);
      passed++;
    } else {
      console.log(`  ${C.fail} ${r.name} — ${r.error || `[${r.status}] ${r.snippet}`}`);
      failed++;
    }
  }
  return { passed, failed, skipped };
}

// ── Stress RSVP: 3 members hit the same event at the exact same time ───────────
async function stressRsvp() {
  console.log(`\n${C.red}${C.bold}── STRESS: Concurrent RSVP (${PROFILES.length} members → same event) ──${C.reset}`);
  console.log(`${C.dim}Event: ${EVENT_ID}${C.reset}`);
  console.log(`${C.dim}Firing all 3 requests simultaneously...${C.reset}\n`);

  const requests = PROFILES.map(p =>
    hit(
      `rsvp:${p.label}`,
      "/member-rsvp",
      { event_record: EVENT_ID, member_email: p.member_email, profile_record: p.record_id, name: p.name, status: "booking", member: true }
    )
  );

  // All fire at exactly the same time
  const results = await Promise.all(requests);

  let passed = 0, failed = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ${C.pass} ${r.name} ${C.dim}[${r.status}]${C.reset}  ${r.snippet}`);
      passed++;
    } else {
      console.log(`  ${C.fail} ${r.name} — ${r.error || `[${r.status}] ${r.snippet}`}`);
      failed++;
    }
  }

  console.log(`\n${C.bold}After running this, verify in Make.com:${C.reset}`);
  console.log(`  1. Capacity count is correct (not negative, not overcounted)`);
  console.log(`  2. No duplicate RSVP records for any member`);
  console.log(`  3. Each member has the correct status (booked or waitlisted)`);

  return { passed, failed, skipped: 0 };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const profilesToRun = FILTER_LABEL
    ? PROFILES.filter(p => p.label === FILTER_LABEL)
    : PROFILES;

  console.log(`\n${C.bold}House of More — Multi-Profile Tests${C.reset}`);
  console.log(`Worker:   ${BASE}`);
  console.log(`Profiles: ${profilesToRun.map(p => p.label).join(", ")}`);
  console.log(`Event:    ${EVENT_ID}`);
  if (DANGEROUS)   console.log(`${C.red}Dangerous mode ON — write/mutate tests will run${C.reset}`);
  if (STRESS_RSVP) console.log(`${C.red}Stress RSVP mode ON${C.reset}`);
  console.log("─".repeat(64));

  let totalPassed = 0, totalFailed = 0, totalSkipped = 0;

  if (STRESS_RSVP) {
    // Stress mode: skip normal flows, just run the concurrent RSVP
    const { passed, failed, skipped } = await stressRsvp();
    totalPassed  += passed;
    totalFailed  += failed;
    totalSkipped += skipped;
  } else {
    // Normal mode: run all profiles in parallel
    const allResults = await Promise.all(profilesToRun.map(runProfile));
    for (const profileResult of allResults) {
      const { passed, failed, skipped } = printProfile(profileResult);
      totalPassed  += passed;
      totalFailed  += failed;
      totalSkipped += skipped;
    }
  }

  console.log("\n" + "─".repeat(64));
  console.log(`Passed: ${totalPassed}  Failed: ${totalFailed}  Skipped: ${totalSkipped}\n`);

  if (totalFailed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
