/**
 * HOM API — Cloudflare Worker
 *
 * Proxies requests from the Webflow site to Make.com webhooks,
 * injecting the API key server-side so it's never exposed to the browser.
 *
 * Base URL (workers.dev):  https://hom-api.YOUR-ACCOUNT.workers.dev
 * Future custom domain:    https://api.thehouseofmore.com
 *
 * Secrets required:
 *   npx wrangler secret put MAKE_API_KEY          → t-RpA75H-nhYK-k
 *   npx wrangler secret put SUPABASE_KEY          → Supabase service role key
 *   npx wrangler secret put MEMBERSTACK_KEY       → sk_1d061c2082b0544fcb80
 *   npx wrangler secret put SUPABASE_WEBHOOK_SECRET → vxAc8CnaJnUA--JVA
 */

const SUPABASE_URL = "https://wioktwzioxzgmntgxsme.supabase.co";

const QUESTIONNAIRE_FIELDS = [
  "where_are_you_on_your_path",
  "how_can_we_support_you",
  "how_did_you_hear_about_the_house_of_more",
  "have_you_been_with_the_house_of_more",
  "how_many_events_have_you_attended_at_the_hom",
  "how_many_events_per_month_can_you_participate",
  "what_draws_you_to_the_house_of_more",
  "community_and_contribution",
  "is_there_anything_else",
  "do_you_feel_aligned_with_the_house_of_more",
  "i_commit_to_respecting_the_house_of_more",
  "skills_to_share",
];

const PROFILE_FIELDS = [
  "first_name", "last_name", "phone",
  "birthday", "gender", "marital_status",
];

async function supabaseUpsert(table, data, onConflict, key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: {
        "apikey":        key,
        "Authorization": `Bearer ${key}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${table} error (${res.status}): ${err}`);
  }
}

const MEMBERSTACK_PLAN_ID = "pln_members-5kbh0gjx";

async function addMemberstackPlan(memberId, env) {
  const res = await fetch(
    `https://admin.memberstack.com/members/${memberId}/add-plan`,
    {
      method: "POST",
      headers: {
        "x-api-key":     env.MEMBERSTACK_KEY,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ planId: MEMBERSTACK_PLAN_ID }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Memberstack add plan error (${res.status}): ${err}`);
  }
  return res.json();
}

async function handleMemberstackAddPlan(request, env) {
  // Verify the request is from Supabase
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== env.SUPABASE_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Supabase sends the row under payload.record
  const member_id = payload?.record?.member_id;
  if (!member_id) {
    return new Response(JSON.stringify({ error: "member_id missing from record" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const msRes = await addMemberstackPlan(member_id, env);
  console.log(`[MEMBERSTACK] Plan ${MEMBERSTACK_PLAN_ID} added to member ${member_id}:`, JSON.stringify(msRes));

  return new Response(JSON.stringify({ ok: true, member_id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleQuestionnaireSupabase(payload, env) {
  const { member_id, email } = payload;
  if (!member_id) throw new Error("member_id is required");

  // Field name mappings: Webflow name → Supabase column
  if (payload["skill-you-can-share"] !== undefined) {
    payload.skills_to_share = payload["skill-you-can-share"];
  }

  const profileData = { member_id, email, application_status: "pending" };
  const questionnaireData = { member_id };

  for (const key of PROFILE_FIELDS) {
    if (payload[key] !== undefined) profileData[key] = payload[key];
  }

  for (const key of QUESTIONNAIRE_FIELDS) {
    if (payload[key] !== undefined) {
      questionnaireData[key] = key === "i_commit_to_respecting_the_house_of_more"
        ? payload[key] === "true" || payload[key] === true
        : payload[key];
    }
  }

  await supabaseUpsert("member_profiles",      profileData,       "member_id", env.SUPABASE_KEY);
  await supabaseUpsert("member_questionnaire", questionnaireData, "member_id", env.SUPABASE_KEY);
}

// ─── Route map: path → Make webhook URL ──────────────────────────────────────
const ROUTES = {
  // Member
  "/member-profile":          "https://hook.us2.make.com/61m00px6799vvuyps3sgdpmdw764bol8",
  "/member-profile-update":   "https://hook.us2.make.com/ka8clte187yfbfdmajbnnl9xoi9uglw8",
  "/member-list-events":      "https://hook.us2.make.com/cjnt68kf5macv3f31n36p9ota9g2v5c8",
  "/member-rsvp":             "https://hook.us2.make.com/qwqc5knm9vyb7ecb27eotq7ed2fs219h",
  "/member-messages-load":    "https://hook.us2.make.com/vd2ufusmxt7142xkf2pnlm9gsugbu97b",
  "/member-message-action":   "https://hook.us2.make.com/n8kyg49tkp89eee0zctbfltdpy3s1411",
  "/facilitator-list-events": "https://hook.us2.make.com/2pt0n2bx40eeefzjo2c1jqr6fklhe8an",
  "/facilitator-checkin":     "https://hook.us2.make.com/093qtr3gtya8kzc7lvecci525sxit7tj",
  "/facilitator-close-event": "https://hook.us2.make.com/93qpumgmoqg7utvs7lct2c1j298m2oa8",

  // Admin
  "/admin-list-members":      "https://hook.us2.make.com/bljtvfbfs1otu3mmxj3cn4042cmwrnux",
  "/admin-get-member":        "https://hook.us2.make.com/uaabv0g63cd26gcmrk8d2konymutrkc5",
  "/admin-approve-member":    "https://hook.us2.make.com/u2lzpknloicl3wbo1ftkixyrg9t7msia",
  "/admin-list-rsvp":         "https://hook.us2.make.com/4ccux957qcdn2n1ocwsxw7uwca6558f9",
  "/admin-list-event":        "https://hook.us2.make.com/cflbrl1lyeynad737qt9574hc55botq2",
  "/admin-messages":          "https://hook.us2.make.com/6wea8zdfq4qprfrexknmyu8a5myiyh12",
  "/admin-message-center":    "https://hook.us2.make.com/ax5qvxznklrbrechyt1gdy7r1jner5zp",

  // Donations
  "/donation-checkout":       "https://hook.us2.make.com/qj572hnoeb4ajefrseq1jssu0yc36267",
  "/donation-list-all":       "https://hook.us2.make.com/3kb2m1jg7k23klrycyhl1qq75f3i5ht8",
  "/donation-list-mine":      "https://hook.us2.make.com/zpr4ws33ani1pcb0hq69kfrdhyi3aovx",
  "/donation-confirm":        "https://hook.us2.make.com/z4lgoli1whwc9pjsahrs1j1evq1bgpl4",

  // Events
  "/list-events":             "https://hook.us2.make.com/rwcg9vj3dfjpm8hhf89h4xhc35rhdw51",
  "/closed-event":            "https://hook.us2.make.com/5wfgpu9ih2yjdfsy8ckbfuhrnly5xmat",

  // Questionnaire
  "/questionnaire-create-member": "https://hook.us2.make.com/0k76yae1yt3jmujqap8d7xaaxmph27g6",

  // Home
  "/home-review":             "https://hook.us2.make.com/qd67puk6apqmdmgvsgl8u9yudf725muv",
};

// ─── CORS helper ─────────────────────────────────────────────────────────────
function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || "https://www.thehouseofmore.com";
  const allowedOrigins = [allowed, "https://thehouseofmore.com", "http://localhost:5500"];

  const responseOrigin = allowedOrigins.includes(origin) ? origin : allowed;

  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("Origin") || "";

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env),
      });
    }

    // Only POST allowed
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Memberstack — called by Supabase webhook on member_profiles INSERT
    if (path === "/memberstack-add-plan") {
      if (!env.MEMBERSTACK_KEY || !env.SUPABASE_WEBHOOK_SECRET) {
        console.error("MEMBERSTACK_KEY or SUPABASE_WEBHOOK_SECRET secret is not set");
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleMemberstackAddPlan(request, env);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Supabase routes
    if (path === "/questionnaire-supabase") {
      if (!env.SUPABASE_KEY) {
        console.error("SUPABASE_KEY secret is not set");
        return new Response("Server misconfiguration", { status: 500 });
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      try {
        await handleQuestionnaireSupabase(payload, env);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    // Route lookup (Make.com)
    const webhookUrl = ROUTES[path];
    if (!webhookUrl) {
      return new Response("Not found", { status: 404 });
    }

    // API key must be set as a Worker secret
    if (!env.MAKE_API_KEY) {
      console.error("MAKE_API_KEY secret is not set");
      return new Response("Server misconfiguration", { status: 500 });
    }

    // Forward to Make
    let body;
    try {
      body = await request.text();
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const makeRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-make-apikey": env.MAKE_API_KEY,
      },
      body,
    });

    const responseBody = await makeRes.text();

    return new Response(responseBody, {
      status: makeRes.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin, env),
      },
    });
  },
};
