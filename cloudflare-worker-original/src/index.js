/**
 * HOM API — Cloudflare Worker (ORIGINAL — pre-Supabase snapshot)
 *
 * Proxies requests from the Webflow site to Make.com webhooks,
 * injecting the API key server-side so it's never exposed to the browser.
 *
 * Base URL (workers.dev):  https://houseofmore-original.YOUR-ACCOUNT.workers.dev
 */

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
  const allowedOrigins = [allowed, "https://thehouseofmore.com"];

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

    // Route lookup
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
