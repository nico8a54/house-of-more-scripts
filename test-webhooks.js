/**
 * test-webhooks.js — House of More
 *
 * Tests every Cloudflare Worker route by POSTing minimal payloads.
 * Read-only/list endpoints run by default.
 * Write/mutate endpoints require --dangerous flag.
 *
 * Usage:
 *   node test-webhooks.js                         # safe tests only
 *   node test-webhooks.js --dangerous             # also runs destructive tests
 *   node test-webhooks.js --filter admin          # run only tests whose name includes "admin"
 *
 * Override test IDs via env vars:
 *   TEST_MEMBER_ID=mem_xxx TEST_EVENT_ID=rec_xxx node test-webhooks.js
 */

const BASE = "https://houseofmore.nico-97c.workers.dev";

// ── Test fixtures ──────────────────────────────────────────────────────────────
// Replace with real sandbox IDs for end-to-end meaningful results.
const M = {
  member_id:        process.env.TEST_MEMBER_ID    || "mem_sb_cmla331hr05l50sps7d2rhy5q",
  member_email:     process.env.TEST_MEMBER_EMAIL || "test@example.com",
  record_id:        process.env.TEST_RECORD_ID    || "rec_test_member",
  event_id:         process.env.TEST_EVENT_ID     || "rec_test_event",
  message_id:       process.env.TEST_MESSAGE_ID   || "rec_test_message",
};

const DANGEROUS = process.argv.includes("--dangerous");
const FILTER    = (() => {
  const i = process.argv.indexOf("--filter");
  return i !== -1 ? process.argv[i + 1] : null;
})();

// ── Test definitions ───────────────────────────────────────────────────────────
// dangerous: true  → skipped unless --dangerous is passed
// rawBody: true    → body is sent as-is (string), not JSON.stringify'd
const tests = [

  // ─── Member ────────────────────────────────────────────────────────────────
  {
    name: "member-profile",
    path: "/member-profile",
    body: { member_id: M.member_id },
  },
  {
    name: "member-list-events",
    path: "/member-list-events",
    body: { member_id: M.member_id, member_email: M.member_email, member_record_id: M.record_id },
  },
  {
    name: "member-messages-load",
    path: "/member-messages-load",
    body: { member_id: M.member_id },
  },
  {
    name: "member-profile-update",
    path: "/member-profile-update",
    body: { member_id: M.member_id, full_name: "Test User (webhook test)" },
    dangerous: true,
  },
  {
    name: "member-rsvp (booking)",
    path: "/member-rsvp",
    body: {
      event_record:   M.event_id,
      member_email:   M.member_email,
      profile_record: M.record_id,
      status:         "booking",
    },
    dangerous: true,
  },
  {
    name: "member-message-action (read)",
    path: "/member-message-action",
    body: { member_id: M.member_id, message_id: M.message_id, action: "read" },
    dangerous: true,
  },

  // ─── Facilitator ───────────────────────────────────────────────────────────
  {
    name: "facilitator-list-events",
    path: "/facilitator-list-events",
    body: { event_record_id: M.event_id },
  },
  {
    name: "facilitator-checkin",
    path: "/facilitator-checkin",
    body: { qr_text: M.member_id, event_id: M.event_id, scanned_at: new Date().toISOString() },
    dangerous: true,
  },
  {
    name: "facilitator-close-event",
    path: "/facilitator-close-event",
    body: { event_record_id: M.event_id },
    dangerous: true,
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────
  {
    name: "admin-list-members",
    path: "/admin-list-members",
    body: {},
  },
  {
    name: "admin-get-member",
    path: "/admin-get-member",
    body: { member_id: M.member_id },
  },
  {
    name: "admin-list-rsvp",
    path: "/admin-list-rsvp",
    body: {},
  },
  {
    name: "admin-list-event",
    path: "/admin-list-event",
    body: { event_record_id: M.event_id },
  },
  {
    name: "admin-messages",
    path: "/admin-messages",
    body: {},
  },
  {
    name: "admin-approve-member",
    path: "/admin-approve-member",
    body: { member_id: M.member_id, status: "approved" },
    dangerous: true,
  },
  {
    name: "admin-message-center (send)",
    path: "/admin-message-center",
    body: { action: "send", text: "[TEST] Please ignore — automated webhook test.", recipient: M.member_id },
    dangerous: true,
  },

  // ─── Donations ─────────────────────────────────────────────────────────────
  {
    name: "donation-list-all",
    path: "/donation-list-all",
    body: {},
  },
  {
    name: "donation-list-mine",
    path: "/donation-list-mine",
    body: { memberId: M.member_id },
  },
  {
    name: "donation-checkout",
    path: "/donation-checkout",
    body: { amount: 100, memberId: M.member_id, email: M.member_email },
    dangerous: true,
  },
  {
    name: "donation-confirm",
    path: "/donation-confirm",
    body: { member_id: M.member_id },
    dangerous: true,
  },

  // ─── Events ────────────────────────────────────────────────────────────────
  {
    name: "list-events",
    path: "/list-events",
    body: {},
  },
  {
    name: "closed-event",
    path: "/closed-event",
    body: { event_record_id: M.event_id },
    dangerous: true,
  },

  // ─── Questionnaire ─────────────────────────────────────────────────────────
  {
    name: "questionnaire-create-member",
    path: "/questionnaire-create-member",
    body: {
      // Personal info
      name:                                        "Webhook",
      last_name:                                   "Test",
      email:                                       "fernando@email.com",
      id:                                          "mem_sb_cmmryigv40dc40so9750aahya",
      phone:                                       "3051234567",
      location:                                    "Miami, FL",
      sex:                                         "Male",
      marital_status:                              "single",
      birthday:                                    "1990-01-15",
      // Path
      where_are_you_on_your_path:                  "exploring",
      // Support (checkboxes joined with " / ")
      how_can_we_support_you:                      "Individual Guidance and Mentorship / Community with Like-Minded People",
      // Relationship with HOM
      how_did_you_hear_about_the_house_of_more:    "Webhook test — please delete",
      what_draws_you_to_the_house_of_more:         "Webhook test — please delete",
      have_you_been_with_the_house_of_more:        "no",
      how_many_events_per_month_can_you_participate: "1-3",
      // Contribution (checkbox)
      community_and_contribution:                  "Volunteering at the House (event setup, event support, or on-site help)",
      // About
      is_there_anything_else:                      "Webhook test — please delete",
      do_you_feel_aligned_with_the_house_of_more:  "yes",
      // Agreement
      i_commit_to_respecting_the_house_of_more:    "YES",
      // Forced by JS
      application_status:                          "pending",
    },
    dangerous: true,
  },

  // ─── Home ──────────────────────────────────────────────────────────────────
  {
    name: "home-review",
    path: "/home-review",
    body: { rating: 5, message: "[TEST] Please ignore — automated webhook test.", guest_name: "Test User" },
    dangerous: true,
  },
];

// ── Runner ─────────────────────────────────────────────────────────────────────
const C = {
  pass:  "\x1b[32m✓\x1b[0m",
  fail:  "\x1b[31m✗\x1b[0m",
  skip:  "\x1b[33m⊘\x1b[0m",
  dim:   "\x1b[2m",
  red:   "\x1b[31m",
  reset: "\x1b[0m",
};

async function runTest(t) {
  if (t.dangerous && !DANGEROUS) {
    console.log(`  ${C.skip} ${t.name} ${C.dim}(skipped — use --dangerous to run)${C.reset}`);
    return { skipped: true };
  }

  const bodyStr = t.rawBody ? t.body : JSON.stringify(t.body);

  let res, text;
  try {
    res  = await fetch(`${BASE}${t.path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    bodyStr,
    });
    text = await res.text();
  } catch (err) {
    console.log(`  ${C.fail} ${t.name} — network error: ${err.message}`);
    return { ok: false };
  }

  // Trim long responses for display
  const snippet = text.length > 140 ? text.slice(0, 140) + "…" : text;
  const icon    = res.ok ? C.pass : C.fail;
  console.log(`  ${icon} ${t.name} ${C.dim}[${res.status}]${C.reset}  ${snippet}`);

  return { ok: res.ok, status: res.status };
}

async function main() {
  const toRun = FILTER
    ? tests.filter(t => t.name.includes(FILTER))
    : tests;

  console.log(`\nHouse of More — Webhook Tests`);
  console.log(`Worker:  ${BASE}`);
  console.log(`Running: ${toRun.length} of ${tests.length} tests`);
  if (DANGEROUS) console.log(`${C.red}Dangerous mode ON — write/mutate tests will run${C.reset}`);
  if (FILTER)    console.log(`Filter:  "${FILTER}"`);
  console.log("─".repeat(64) + "\n");

  let passed = 0, failed = 0, skipped = 0;

  for (const t of toRun) {
    const result = await runTest(t);
    if      (result.skipped) skipped++;
    else if (result.ok)      passed++;
    else                     failed++;
  }

  console.log("\n" + "─".repeat(64));
  console.log(`Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
