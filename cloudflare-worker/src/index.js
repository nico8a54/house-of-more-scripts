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
  "birthday", "gender", "marital_status", "location",
];

const RSVP_FIELDS = [
  "event_record_id", "rsvp_record_id", "member_email", "member_name",
  "status", "rating", "review", "booked_at", "cancel_at",
];

const DONATION_FIELDS = [
  "member_id", "email", "amount", "type", "status",
  "receipt_url", "transaction_id", "recurrent_status",
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
  const MAX_RETRIES = 3;
  let delay = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

    if (res.ok) {
      await res.text(); // Memberstack returns plain "OK", not JSON
      return;
    }

    const err = await res.text();

    // Member already has this plan — treat as success
    if (res.status === 400 && err.includes("already-have-plan")) return;

    if (res.status === 429 && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    throw new Error(`Memberstack add plan error (${res.status}): ${err}`);
  }
}

const WEBFLOW_TRIGGER_SECRETS = {
  "collection_item_created":     "WEBFLOW_SECRET_CREATED",
  "collection_item_changed":     "WEBFLOW_SECRET_CHANGED",
  "collection_item_deleted":     "WEBFLOW_SECRET_DELETED",
  "collection_item_published":   "WEBFLOW_SECRET_PUBLISHED",
  "collection_item_unpublished": "WEBFLOW_SECRET_UNPUBLISHED",
};

async function verifyWebflowSignature(rawBody, signature, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return computed === signature;
}

async function handleWebflowEventSync(request, env) {
  const signature = request.headers.get("x-webflow-signature");
  if (!signature) return new Response("Unauthorized", { status: 401 });

  const rawBody = await request.text();

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const triggerType = body.triggerType || "";
  const secretKey = WEBFLOW_TRIGGER_SECRETS[triggerType];
  const secret = secretKey ? env[secretKey] : null;

  if (!secret || !(await verifyWebflowSignature(rawBody, signature, secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const item = body.payload || {};
  const fields = item.fieldData || item; // v2 uses fieldData, v1 puts fields directly
  const itemId = item.id || item._id;   // native Webflow item ID

  if (!itemId) {
    return new Response(JSON.stringify({ error: "item id missing" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
  };

  // Hard delete from Supabase
  if (triggerType === "collection_item_deleted") {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/events?event_id=eq.${encodeURIComponent(itemId)}`,
      { method: "DELETE", headers: sbHeaders }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase delete error (${res.status}): ${err}`);
    }
    console.log(`[WEBFLOW] Event deleted: ${itemId}`);
    return new Response(JSON.stringify({ ok: true, action: "deleted" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Unpublish → mark closed
  if (triggerType === "collection_item_unpublished") {
    await supabaseUpsert("events", { event_id: itemId, event_status: "closed" }, "event_id", env.SUPABASE_KEY);
    console.log(`[WEBFLOW] Event unpublished → closed: ${itemId}`);
    return new Response(JSON.stringify({ ok: true, action: "closed" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Create or update — upsert
  const data = {
    event_id:          itemId,
    event_name:        fields["name"]              || null,
    event_slug:        fields["slug"]              || null,
    event_date:        fields["date"]              || null,
    event_capacity:    fields["capacity"]          ?? null,
    facilitator_name:  fields["facilitator-name"]  || null,
    facilitator_email: fields["facilitator-id"]    || null,
    event_link:        fields["online-event-link"] || null,
    event_status:      fields["status"]            || null,
    event_record_id:   fields["evente-record"]     || null,
  };

  await supabaseUpsert("events", data, "event_id", env.SUPABASE_KEY);
  console.log(`[WEBFLOW] Event synced: ${data.event_name} (${itemId})`);

  return new Response(JSON.stringify({ ok: true, event_id: itemId }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
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

  try {
    await addMemberstackPlan(member_id, env);
  } catch (err) {
    console.error(`[MEMBERSTACK] Failed to add plan to ${member_id}:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[MEMBERSTACK] Plan ${MEMBERSTACK_PLAN_ID} added to member ${member_id}`);

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

async function handleMemberProfileSupabase(payload, env) {
  const { member_id } = payload;
  if (!member_id) throw new Error("member_id is required");

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
  };
  const mid = encodeURIComponent(member_id);

  const [profileRes, questionnaireRes, rsvpsRes, donationsRes, msRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${mid}&select=*`,                         { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/member_questionnaire?member_id=eq.${mid}&select=*`,                    { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?member_id=eq.${mid}&select=*&order=booked_at.desc`,        { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/donations?member_id=eq.${mid}&select=*&order=created_at.desc`,         { headers: sbHeaders }),
    fetch(`https://admin.memberstack.com/members/${member_id}`, { headers: { "x-api-key": env.MEMBERSTACK_KEY } }),
  ]);

  if (!profileRes.ok) {
    const err = await profileRes.text();
    throw new Error(`Supabase member_profiles error (${profileRes.status}): ${err}`);
  }

  const [profiles, questionnaires, rsvps, donations] = await Promise.all([
    profileRes.json(),
    questionnaireRes.ok ? questionnaireRes.json() : Promise.resolve([]),
    rsvpsRes.ok        ? rsvpsRes.json()          : Promise.resolve([]),
    donationsRes.ok    ? donationsRes.json()       : Promise.resolve([]),
  ]);

  const profile      = profiles[0]        || {};
  const emptyQuestionnaire = Object.fromEntries(QUESTIONNAIRE_FIELDS.map(k => [k, null]));
  const questionnaire = questionnaires[0] ? { ...emptyQuestionnaire, ...questionnaires[0] } : emptyQuestionnaire;

  let plan_name = [];
  if (msRes.ok) {
    const msData = await msRes.json();
    const connections = msData?.data?.planConnections || [];
    plan_name = connections.map(c => ({
      planName: c.plan?.name || "",
      status:   (c.payment?.status || c.status || "").toLowerCase(),
    }));
  } else {
    console.warn(`[MEMBER] Memberstack GET member failed: ${msRes.status}`);
  }

  const emptyRsvp     = Object.fromEntries(RSVP_FIELDS.map(k => [k, null]));
  const emptyDonation = Object.fromEntries(DONATION_FIELDS.map(k => [k, null]));

  return {
    ...profile,
    member_profile: profile.id || "",
    plan_name,
    questionnaire,
    rsvps:     rsvps.length     ? rsvps     : [emptyRsvp],
    donations: donations.length ? donations : [emptyDonation],
  };
}

// ─── Route map: path → Make webhook URL ──────────────────────────────────────
const ROUTES = {
  // Member
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
  const allowedOrigins = [allowed, "https://thehouseofmore.com", "http://localhost:5500", "http://127.0.0.1:5500"];

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

    // Webflow CMS → Supabase event sync
    if (path === "/webflow-event-sync") {
      if (!env.SUPABASE_KEY) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleWebflowEventSync(request, env);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
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

    // Member profile update (Supabase direct)
    if (path === "/member-profile-update-supabase") {
      if (!env.SUPABASE_KEY) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      const { member_id, ...fields } = payload;
      if (!member_id) return new Response("member_id required", { status: 400, headers: corsHeaders(origin, env) });

      const sbHeaders = {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      };
      const mid = encodeURIComponent(member_id);

      try {
        const profileData = {};
        for (const key of PROFILE_FIELDS) { if (key in fields) profileData[key] = fields[key]; }

        const questionnaireData = {};
        for (const key of QUESTIONNAIRE_FIELDS) { if (key in fields) questionnaireData[key] = fields[key]; }

        const tasks = [];

        if (Object.keys(profileData).length) {
          tasks.push(fetch(`${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${mid}`, {
            method: "PATCH",
            headers: sbHeaders,
            body: JSON.stringify(profileData),
          }));
        }

        if (Object.keys(questionnaireData).length) {
          tasks.push(fetch(`${SUPABASE_URL}/rest/v1/member_questionnaire?on_conflict=member_id`, {
            method: "POST",
            headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ member_id, ...questionnaireData }),
          }));
        }

        const results = await Promise.all(tasks);
        for (const res of results) {
          if (!res.ok) {
            const err = await res.text();
            throw new Error(`Supabase update error (${res.status}): ${err}`);
          }
        }

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

    // Member profile (Supabase direct)
    if (path === "/member-profile") {
      if (!env.SUPABASE_KEY || !env.MEMBERSTACK_KEY) {
        console.error("SUPABASE_KEY or MEMBERSTACK_KEY secret is not set");
        return new Response("Server misconfiguration", { status: 500 });
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      try {
        const data = await handleMemberProfileSupabase(payload, env);
        return new Response(JSON.stringify(data), {
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
