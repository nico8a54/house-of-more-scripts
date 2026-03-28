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

const PLAN_IDS = {
  active:      "pln_approved-member-bd2jv0hp1",
  admin:       "pln_admin-1823l09h8",
  facilitator: "pln_facilitator-9o1kw0j5o",
  frozen:      "pln_freeze-yy2kn0ejb",
  pending:     "pln_members-5kbh0gjx",
  rejected:    "pln_rejected-fo1l60nm3",
};

const PAID_PLAN_NAMES = new Set([
  "neighbor", "supporter", "advocate", "builder",
  "sustainer", "patron", "partner", "champion", "visionary",
]);

// Maps application_status → Memberstack plan ID (free plans only)
// Paid plan changes flow through Stripe checkout → Memberstack → webhook → Supabase
const STATUS_TO_PLAN_ID = {
  "pending":     "pln_members-5kbh0gjx",
  "approved":    "pln_approved-member-bd2jv0hp1",
  "rejected":    "pln_rejected-fo1l60nm3",
  "frozen":      "pln_freeze-yy2kn0ejb",
  "admin":       "pln_admin-1823l09h8",
  "facilitator": "pln_facilitator-9o1kw0j5o",
};

// Price IDs for paid plans (prc_xxx) — used for manual paid plan grants
const PAID_PLAN_PRICE_IDS = {
  "neighbor":  "prc_neighbor-9d2107s4",
  "supporter": "prc_supporter-l2200758",
  "advocate":  "prc_advocate-cs1r05km",
  "builder":   "", // TODO: add price ID
  "sustainer": "prc_sustainer-7o1t05pv",
  "patron":    "prc_patron-qo24071q",
  "partner":   "prc_partner-1n1x05r5",
  "champion":  "prc_champion-fy28079v",
  "visionary": "prc_visionary-iw2005dl",
};

function parsePlanConnections(connections) {
  return connections.map(c => ({
    planId:   c.planId || "",
    planName: c.plan?.name || "",
    status:   (c.payment?.status || c.status || "").toLowerCase(),
    type:     (c.type || "").toLowerCase(),
  }));
}

// Derives application_status + subscription_plan from a member's full planConnections.
// Priority: frozen → admin → paid tier → approved (active) → facilitator-only → rejected → pending
function resolveStatusFromConnections(connections) {
  const hasFrozen      = connections.some(c => c.planId === PLAN_IDS.frozen);
  const hasAdmin       = connections.some(c => c.planId === PLAN_IDS.admin);
  const hasFacilitator = connections.some(c => c.planId === PLAN_IDS.facilitator);
  const hasActive      = connections.some(c => c.planId === PLAN_IDS.active);
  const hasRejected    = connections.some(c => c.planId === PLAN_IDS.rejected);
  const hasPending     = connections.some(c => c.planId === PLAN_IDS.pending);
  const paidPlan       = connections.find(c =>
    c.type === "paid" || PAID_PLAN_NAMES.has((c.planName || "").toLowerCase())
  );

  if (hasFrozen)      return { application_status: "frozen",                    subscription_plan: null };
  if (hasAdmin)       return { application_status: "admin",                     subscription_plan: null };
  if (paidPlan) {
    const name = (paidPlan.planName || "").toLowerCase();
    return           { application_status: name,                                subscription_plan: name };
  }
  if (hasActive)      return { application_status: "approved",                  subscription_plan: null };
  if (hasFacilitator) return { application_status: "facilitator",               subscription_plan: null };
  if (hasRejected)    return { application_status: "rejected",                  subscription_plan: null };
  if (hasPending)     return { application_status: "pending",                   subscription_plan: null };
  return                     { application_status: null,                        subscription_plan: null };
}

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
  "id", "member_id", "event_id", "booking_status",
  "rating", "review", "booked_at", "cancel_at", "created_at", "updated_at",
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
  console.log(`[WEBFLOW] triggerType="${triggerType}" itemId="${(body.payload?.id || body.payload?._id || "?")}" siteId="${body.site?.id || "?"}"`);
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
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(itemId)}`,
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
    await supabaseUpsert("events", { id: itemId, event_status: "closed" }, "id", env.SUPABASE_KEY);
    console.log(`[WEBFLOW] Event unpublished → closed: ${itemId}`);
    return new Response(JSON.stringify({ ok: true, action: "closed" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Only sync on publish
  if (triggerType !== "collection_item_published") {
    return new Response(JSON.stringify({ ok: true, action: "ignored" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Upsert on publish
  const data = {
    id:                itemId,
    event_name:        fields["name"]              || null,
    event_slug:        fields["slug"]              || null,
    event_date:        fields["date"]              || null,
    event_capacity:    fields["capacity"]          ?? null,
    facilitator_name:  fields["facilitator-name"]  || null,
    facilitator_email: fields["facilitator-id"]    || null,
    event_link:        fields["online-event-link"] || null,
    event_status:      fields["status"]            || null,
  };

  await supabaseUpsert("events", data, "id", env.SUPABASE_KEY);
  console.log(`[WEBFLOW] Event synced: ${data.event_name} (${itemId})`);

  return new Response(JSON.stringify({ ok: true, event_id: itemId }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

async function handleSendRsvpEmail(request, env) {
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

  const record = payload?.record;
  const oldRecord = payload?.old_record;
  const eventType = payload?.type; // "INSERT" or "UPDATE"

  if (!record) return new Response(JSON.stringify({ ok: true, skipped: "no record" }), { status: 200, headers: { "Content-Type": "application/json" } });

  // Determine which email to send
  // INSERT + booking_status = "booked" → confirmation
  // UPDATE + old "booked" → "canceled" → cancellation
  let emailType = null;
  if (eventType === "INSERT" && record.booking_status === "booked") {
    emailType = "confirmation";
  } else if (eventType === "UPDATE" && oldRecord?.booking_status === "booked" && record.booking_status === "canceled") {
    emailType = "cancellation";
  }

  if (!emailType) {
    return new Response(JSON.stringify({ ok: true, skipped: `type=${eventType} status=${record.booking_status}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Skip non-members (no member_id)
  if (!record.member_id) {
    return new Response(JSON.stringify({ ok: true, skipped: "non-member" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const SUPABASE_URL = "https://wioktwzioxzgmntgxsme.supabase.co";
  const headers = { "apikey": env.SUPABASE_KEY, "Authorization": `Bearer ${env.SUPABASE_KEY}` };

  // Fetch event and member in parallel
  const [eventRes, memberRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(record.event_id)}&select=event_name,event_date,event_location,event_link,facilitator_name,event_slug&limit=1`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${encodeURIComponent(record.member_id)}&select=first_name,email&limit=1`, { headers }),
  ]);

  const events = await eventRes.json();
  const members = await memberRes.json();

  const event = events?.[0];
  const member = members?.[0];

  if (!event || !member?.email) {
    console.error("[RSVP EMAIL] Missing event or member data", { event, member });
    return new Response(JSON.stringify({ error: "Missing event or member data" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // Format date: "March 27, 2026 at 7:00 PM"
  const eventDate = event.event_date
    ? new Date(event.event_date).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })
    : "TBD";

  let subject, html;

  if (emailType === "confirmation") {
    const qrUrl = `https://quickchart.io/qr?size=300&text=${encodeURIComponent(record.id)}`;
    const eventUrl = `https://thehouseofmore.com/events-2026/${event.event_slug}`;
    const locationOrLink = event.event_link || event.event_location || "TBD";

    subject = `You're registered — ${event.event_name}`;
    html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f2f2; padding:40px 0;">
  <tr>
    <td align="center">
      <table width="500" cellpadding="0" cellspacing="0" border="0" align="center"
        style="background-color:#ffffff; border-radius:10px; overflow:hidden;">
        <tr>
          <td align="center" style="background-color:#2b1f14; padding:24px 40px;">
            <div style="font-family:Georgia, serif; font-size:22px; color:#ffffff; letter-spacing:1px;">THE HOUSE OF MORE</div>
            <a href="https://thehouseofmore.com" style="color:#946a49 !important; text-decoration:none;">thehouseofmore.com</a>
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:12px; letter-spacing:2px; color:#8c7a64;">BOOKING CONFIRMATION</div>
          </td>
        </tr>
        <tr><td style="height:14px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Georgia, serif; font-size:28px; color:#2b2b2b; line-height:34px;">You're in. See you there.</div>
          </td>
        </tr>
        <tr><td style="height:20px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:15px; color:#5c5c5c; line-height:24px;">
              Dear ${member.first_name},<br><br>
              Your spot is confirmed for <strong>${event.event_name}</strong>. We're looking forward to having you with us.
            </div>
          </td>
        </tr>
        <tr><td style="height:32px;"></td></tr>
        <tr><td style="padding:0 50px;"><hr style="border:none; border-top:1px solid #e5ded4;"></td></tr>
        <tr><td style="height:22px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Georgia, serif; font-size:20px; color:#7a5636; font-weight:bold;">Event details</div>
          </td>
        </tr>
        <tr><td style="height:16px;"></td></tr>
        <tr>
          <td style="padding:0 50px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3eee6; border-radius:8px;">
              <tr>
                <td style="padding:22px 26px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial, sans-serif; font-size:15px; color:#2b2b2b;">
                    <tr>
                      <td width="28" valign="middle" style="padding:8px 0;">📌</td>
                      <td width="95" valign="middle" style="padding:8px 0; font-weight:bold;">Event:</td>
                      <td valign="middle" style="padding:8px 0;">${event.event_name}</td>
                    </tr>
                    <tr>
                      <td valign="middle" style="padding:8px 0;">📅</td>
                      <td valign="middle" style="padding:8px 0; font-weight:bold;">Date:</td>
                      <td valign="middle" style="padding:8px 0;">${eventDate}</td>
                    </tr>
                    <tr>
                      <td valign="middle" style="padding:8px 0;">📍</td>
                      <td valign="middle" style="padding:8px 0; font-weight:bold;">Location:</td>
                      <td valign="middle" style="padding:8px 0;">${locationOrLink}</td>
                    </tr>
                    <tr>
                      <td valign="middle" style="padding:8px 0;">👤</td>
                      <td valign="middle" style="padding:8px 0; font-weight:bold;">Facilitator:</td>
                      <td valign="middle" style="padding:8px 0;">${event.facilitator_name || "TBD"}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr>
          <td align="center" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:14px; color:#666666; line-height:22px; text-align:center;">
              Please show the QR code below at the entrance when you arrive.
            </div>
          </td>
        </tr>
        <tr><td style="height:18px;"></td></tr>
        <tr>
          <td align="center">
            <img src="${qrUrl}" width="200" style="display:block; border:6px solid #f3eee6; border-radius:8px;" />
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr>
          <td align="center" style="padding:0 50px;">
            <a href="${eventUrl}" style="display:inline-block; background-color:#946a49; color:#ffffff; text-decoration:none; font-family:Arial, sans-serif; font-size:14px; padding:14px 28px; border-radius:4px;">View Event Details →</a>
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr><td style="padding:0 50px;"><hr style="border:none; border-top:1px solid #e5ded4;"></td></tr>
        <tr><td style="height:20px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Georgia, serif; font-size:18px; color:#7a5636; font-weight:bold;">A note on cancellations</div>
          </td>
        </tr>
        <tr><td style="height:12px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:14px; color:#5c5c5c; line-height:22px;">
              If your plans change, you can cancel your spot up to 2 hours before the event begins through your member portal. After that window, cancellations are no longer possible.
            </div>
          </td>
        </tr>
        <tr><td style="height:30px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:14px; color:#2b2b2b; line-height:22px;">
              <em>With warmth,</em><br>
              <strong>The House of More Team</strong>
            </div>
          </td>
        </tr>
        <tr><td style="height:48px;"></td></tr>
        <tr>
          <td align="center" style="background-color:#f7f3ed; padding:18px;">
            <div style="font-family:Arial, sans-serif; font-size:12px; color:#8c7a64;">© House of More 2026</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  } else {
    subject = `Your cancellation is confirmed — ${event.event_name}`;
    html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f2f2; padding:40px 0;">
  <tr>
    <td align="center">
      <table width="500" cellpadding="0" cellspacing="0" border="0" align="center"
        style="background-color:#ffffff; border-radius:10px; overflow:hidden;">
        <tr>
          <td align="center" style="background-color:#2b1f14; padding:24px 40px;">
            <div style="font-family:Georgia, serif; font-size:22px; color:#ffffff; letter-spacing:1px;">THE HOUSE OF MORE</div>
            <a href="https://thehouseofmore.com" style="color:#946a49 !important; text-decoration:none;">thehouseofmore.com</a>
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:12px; letter-spacing:2px; color:#8c7a64;">CANCELLATION CONFIRMATION</div>
          </td>
        </tr>
        <tr><td style="height:14px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Georgia, serif; font-size:28px; color:#2b2b2b; line-height:34px;">Your cancellation is confirmed.</div>
          </td>
        </tr>
        <tr><td style="height:20px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:15px; color:#5c5c5c; line-height:24px;">
              Dear ${member.first_name},<br><br>
              We've received your request to cancel your spot for <strong>${event.event_name}</strong>.<br><br>
              Your registration has been removed, and the space is now available for another member.
            </div>
          </td>
        </tr>
        <tr><td style="height:32px;"></td></tr>
        <tr><td style="padding:0 50px;"><hr style="border:none; border-top:1px solid #e5ded4;"></td></tr>
        <tr><td style="height:22px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Georgia, serif; font-size:20px; color:#7a5636; font-weight:bold;">Cancelled booking</div>
          </td>
        </tr>
        <tr><td style="height:16px;"></td></tr>
        <tr>
          <td style="padding:0 50px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3eee6; border-radius:8px;">
              <tr>
                <td style="padding:22px 26px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial, sans-serif; font-size:15px; color:#2b2b2b;">
                    <tr>
                      <td width="28" valign="middle" style="padding:8px 0;">📌</td>
                      <td width="95" valign="middle" style="padding:8px 0; font-weight:bold;">Event:</td>
                      <td valign="middle" style="padding:8px 0;">${event.event_name}</td>
                    </tr>
                    <tr>
                      <td valign="middle" style="padding:8px 0;">📅</td>
                      <td valign="middle" style="padding:8px 0; font-weight:bold;">Date:</td>
                      <td valign="middle" style="padding:8px 0;">${eventDate}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr><td style="padding:0 50px;"><hr style="border:none; border-top:1px solid #e5ded4;"></td></tr>
        <tr><td style="height:20px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:15px; color:#5c5c5c; line-height:24px;">
              We hope to see you at a future gathering. You're always welcome here.<br><br>
              Browse upcoming experiences at <a href="https://thehouseofmore.com/experiences" style="color:#946a49 !important; text-decoration:none;">thehouseofmore.com</a>. New events are added regularly.
            </div>
          </td>
        </tr>
        <tr><td style="height:30px;"></td></tr>
        <tr>
          <td align="center" style="padding:0 50px;">
            <a href="https://thehouseofmore.com/experiences" style="display:inline-block; background-color:#946a49; color:#ffffff !important; text-decoration:none; font-family:Arial, sans-serif; font-size:14px; padding:14px 28px; border-radius:4px;">Explore Upcoming Events →</a>
          </td>
        </tr>
        <tr><td style="height:30px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:14px; color:#2b2b2b; line-height:22px;">
              <em>With warmth,</em><br>
              <strong>The House of More Team</strong>
            </div>
          </td>
        </tr>
        <tr><td style="height:48px;"></td></tr>
        <tr>
          <td align="center" style="background-color:#f7f3ed; padding:18px;">
            <div style="font-family:Arial, sans-serif; font-size:12px; color:#8c7a64;">© House of More 2026</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  }

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to: member.email,
      subject,
      html,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("[RSVP EMAIL] Resend error:", errText);
    return new Response(JSON.stringify({ error: errText }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  console.log(`[RSVP EMAIL] ${emailType} sent to ${member.email} for event ${event.event_name}`);
  return new Response(JSON.stringify({ ok: true, emailType, email: member.email }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  const [profileRes, questionnaireRes, rsvpsRes, donationsRes, msRes, allMsgRes, readMsgRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${mid}&select=*`,                         { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/member_questionnaire?member_id=eq.${mid}&select=*`,                    { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?member_id=eq.${mid}&select=*,events(event_slug)&order=booked_at.desc`, { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/donations?member_id=eq.${mid}&select=*&order=created_at.desc`,         { headers: sbHeaders }),
    fetch(`https://admin.memberstack.com/members/${member_id}`, { headers: { "x-api-key": env.MEMBERSTACK_KEY } }),
    fetch(`${SUPABASE_URL}/rest/v1/admin_messages?select=id`,                                                    { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/member_messages?member_id=eq.${mid}&read=eq.true&select=id`,                  { headers: sbHeaders }),
  ]);

  if (!profileRes.ok) {
    const err = await profileRes.text();
    throw new Error(`Supabase member_profiles error (${profileRes.status}): ${err}`);
  }

  const [profiles, questionnaires, rsvps, donations, allMsgs, readMsgs] = await Promise.all([
    profileRes.json(),
    questionnaireRes.ok ? questionnaireRes.json() : Promise.resolve([]),
    rsvpsRes.ok        ? rsvpsRes.json()          : Promise.resolve([]),
    donationsRes.ok    ? donationsRes.json()       : Promise.resolve([]),
    allMsgRes.ok       ? allMsgRes.json()           : Promise.resolve([]),
    readMsgRes.ok      ? readMsgRes.json()          : Promise.resolve([]),
  ]);

  const profile      = profiles[0]        || {};
  const emptyQuestionnaire = Object.fromEntries(QUESTIONNAIRE_FIELDS.map(k => [k, null]));
  const questionnaire = questionnaires[0] ? { ...emptyQuestionnaire, ...questionnaires[0] } : emptyQuestionnaire;

  let plan_name = [];
  if (msRes.ok) {
    const msData = await msRes.json();
    const connections = msData?.data?.planConnections || [];
    plan_name = parsePlanConnections(connections);
  } else {
    console.warn(`[MEMBER] Memberstack GET member failed: ${msRes.status}`);
  }

  const emptyRsvp     = Object.fromEntries(RSVP_FIELDS.map(k => [k, null]));
  const emptyDonation = Object.fromEntries(DONATION_FIELDS.map(k => [k, null]));

  // Facilitator: fetch all RSVPs for their events
  let facilitator_rsvps = null;
  let facilitator_events = null;
  const isFacilitator = plan_name.some(p => p.planId === PLAN_IDS.facilitator);
  if (isFacilitator && profile.email) {
    const email = encodeURIComponent(profile.email);
    const facilitatorEventsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/events_with_capacity?facilitator_email=eq.${email}&select=id,event_slug,event_name,event_capacity,event_status,event_current_capacity`,
      { headers: sbHeaders }
    );
    if (facilitatorEventsRes.ok) {
      const facilitatorEvents = await facilitatorEventsRes.json();
      if (facilitatorEvents.length) {
        const eventIds = facilitatorEvents.map(e => e.id).join(",");
        const facilitatorRsvpsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/event_rsvps?event_id=in.(${eventIds})&select=*,member_profiles(member_id,first_name,last_name,email)&order=booked_at.asc`,
          { headers: sbHeaders }
        );
        if (facilitatorRsvpsRes.ok) {
          facilitator_rsvps = await facilitatorRsvpsRes.json();
          console.log(`[FACILITATOR] RSVPs for ${profile.email}:`, JSON.stringify(facilitator_rsvps));
        }
      }
      facilitator_events = facilitatorEvents.map(e => ({ id: e.id, event_slug: e.event_slug, event_name: e.event_name, event_capacity: e.event_capacity, event_status: e.event_status, event_current_capacity: e.event_current_capacity ?? 0 }));
    }
  }

  return {
    ...profile,
    plan_name,
    questionnaire,
    rsvps:                 rsvps.length     ? rsvps.map(r => ({ ...r, event_slug: r.events?.event_slug || null })) : [emptyRsvp],
    donations:             donations.length ? donations : [emptyDonation],
    unread_messages_count: Math.max(0, allMsgs.length - readMsgs.length),
    ...(isFacilitator && { facilitator_rsvps, facilitator_events }),
  };
}

async function handleMemberMessages(payload, env) {
  const { member_id } = payload;
  if (!member_id) throw new Error("member_id is required");

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
  };
  const mid = encodeURIComponent(member_id);

  const [adminMsgRes, memberMsgRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/admin_messages?select=*&order=date.desc`, { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/member_messages?member_id=eq.${mid}&select=*`, { headers: sbHeaders }),
  ]);

  const adminMessages  = adminMsgRes.ok  ? await adminMsgRes.json()  : [];
  const memberMessages = memberMsgRes.ok ? await memberMsgRes.json() : [];

  const stateByMsgId = {};
  memberMessages.forEach(m => { stateByMsgId[m.admin_message_id] = m; });

  return adminMessages.map(msg => {
    const state = stateByMsgId[msg.id] || {};
    return {
      id:        msg.id,
      subject:   msg.subject,
      message:   msg.message,
      recipient: msg.recipient,
      date:      msg.date,
      read:      state.read    ?? false,
      erased:    state.erased  ?? false,
    };
  });
}

async function handleMemberMessageAction(payload, env) {
  const { member_id, message_id, action } = payload;
  if (!member_id || !message_id || !action) throw new Error("member_id, message_id, action required");

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
  };
  const mid   = encodeURIComponent(member_id);
  const msgId = encodeURIComponent(message_id);

  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/member_messages?admin_message_id=eq.${msgId}&member_id=eq.${mid}&select=id`,
    { headers: sbHeaders }
  );
  const existing = existingRes.ok ? await existingRes.json() : [];
  const update   = action === "read" ? { read: true } : { erased: true };

  if (existing.length) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/member_messages?id=eq.${existing[0].id}`,
      { method: "PATCH", headers: sbHeaders, body: JSON.stringify(update) }
    );
    if (!res.ok) throw new Error(`Supabase PATCH error (${res.status}): ${await res.text()}`);
  } else {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/member_messages`,
      { method: "POST", headers: sbHeaders, body: JSON.stringify({ admin_message_id: message_id, member_id, ...update }) }
    );
    if (!res.ok) throw new Error(`Supabase POST error (${res.status}): ${await res.text()}`);
  }

  return { success: true };
}

async function handleEventData(payload, env) {
  const { event_slug, member_id } = payload;
  if (!event_slug) throw new Error("event_slug is required");

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
  };

  const slug = encodeURIComponent(event_slug);

  // Fetch event + member plan in parallel
  const [eventRes, msRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/events_with_capacity?event_slug=eq.${slug}&select=*`, { headers: sbHeaders }),
    member_id
      ? fetch(`https://admin.memberstack.com/members/${member_id}`, { headers: { "x-api-key": env.MEMBERSTACK_KEY } })
      : Promise.resolve(null),
  ]);

  if (!eventRes.ok) {
    const err = await eventRes.text();
    throw new Error(`Supabase events error (${eventRes.status}): ${err}`);
  }

  const events = await eventRes.json();
  const event = events[0];
  if (!event) throw new Error("Event not found");

  let member = null;
  if (msRes?.ok) {
    const msData = await msRes.json();
    const connections = msData?.data?.planConnections || [];
    const memberEmail = msData?.data?.auth?.email || null;
    member = { plan_name: parsePlanConnections(connections), email: memberEmail };
  }

  // Only fetch RSVPs with member profiles for admin, or facilitator of this specific event
  const isAdmin = member?.plan_name?.some(p => p.planId === PLAN_IDS.admin);
  const isFacilitatorForThisEvent = member?.plan_name?.some(p => p.planId === PLAN_IDS.facilitator)
    && member?.email
    && event.facilitator_email === member.email;
  const isPrivileged = isAdmin || isFacilitatorForThisEvent;

  let rsvps = [];
  if (isPrivileged) {
    const eventId = encodeURIComponent(event.id);
    const rsvpsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/event_rsvps?event_id=eq.${eventId}&select=*,member_profiles(member_id,first_name,last_name,email)&order=booked_at.asc`,
      { headers: sbHeaders }
    );
    rsvps = rsvpsRes.ok ? await rsvpsRes.json() : [];
  }

  return { event, rsvps, current_capacity: event.event_current_capacity ?? 0, member, isPrivileged: !!isPrivileged };
}

async function handleMemberRsvpSupabase(payload, env) {
  const { event_slug, member_id, status, member = true } = payload;
  if (!event_slug || !member_id) throw new Error("event_slug and member_id are required");

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
  };

  const slug = encodeURIComponent(event_slug);

  const eventRes = await fetch(
    `${SUPABASE_URL}/rest/v1/events_with_capacity?event_slug=eq.${slug}&select=*`,
    { headers: sbHeaders }
  );
  if (!eventRes.ok) throw new Error("Event lookup failed");
  const events = await eventRes.json();
  const event = events[0];
  if (!event) return { message: "Event not found.", success: false };

  const eventId = event.id;
  const mid = encodeURIComponent(member_id);
  const eid = encodeURIComponent(eventId);

  // Cancel flow
  if (status === "cancel") {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/event_rsvps?event_id=eq.${eid}&member_id=eq.${mid}`,
      {
        method: "PATCH",
        headers: { ...sbHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify({ booking_status: "canceled", cancel_at: new Date().toISOString() }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cancel failed (${res.status}): ${err}`);
    }
    return { message: "You have canceled your attendance for this event.", success: true };
  }

  // Check for existing active RSVP
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_rsvps?event_id=eq.${eid}&member_id=eq.${mid}&booking_status=in.(booked,waitlist)&select=id`,
    { headers: sbHeaders }
  );
  if (existingRes.ok) {
    const existing = await existingRes.json();
    if (existing.length > 0) return { message: "You have booked this event already! Check My Events, and your Email inbox.", success: false, alreadyBooked: true };
  }

  // Check for prior cancellation
  const canceledRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_rsvps?event_id=eq.${eid}&member_id=eq.${mid}&booking_status=eq.canceled&select=id`,
    { headers: sbHeaders }
  );
  if (canceledRes.ok) {
    const canceled = await canceledRes.json();
    if (canceled.length > 0) return { message: "You've canceled this event before. If you want to book this event, please send a request to info@thehouseofmore.com", success: false };
  }

  // Determine booking status based on real capacity
  const currentCapacity = event.event_current_capacity ?? 0;
  const rsvpStatus = currentCapacity > 0 ? "booked" : "waitlist";

  const insertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_rsvps`,
    {
      method: "POST",
      headers: { ...sbHeaders, "Prefer": "return=minimal" },
      body: JSON.stringify({
        event_id:       eventId,
        member_id,
        booking_status: rsvpStatus,
        booked_at:      new Date().toISOString(),
        member,
      }),
    }
  );
  if (!insertRes.ok) {
    const err = await insertRes.text();
    throw new Error(`RSVP insert failed (${insertRes.status}): ${err}`);
  }

  return rsvpStatus === "waitlist"
    ? { message: "You've been added to the waiting list.", success: true }
    : { message: "You're booked! See you there. Check your Inbox for the invitation link.", success: true };
}

// ─── Facilitator QR check-in (Supabase direct) ───────────────────────────────
async function handleFacilitatorCheckin(payload, env) {
  const { qr_text, event_slug } = payload;
  if (!qr_text || !event_slug) throw new Error("qr_text and event_slug are required");

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
  };

  const rsvpId = encodeURIComponent(qr_text);

  // 1. Look up the RSVP record by UUID, joining the event slug for validation
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_rsvps?id=eq.${rsvpId}&select=id,member_id,booking_status,events(event_slug)`,
    { headers: sbHeaders }
  );
  if (!lookupRes.ok) throw new Error(`Supabase lookup failed (${lookupRes.status})`);
  const rows = await lookupRes.json();

  if (!rows.length) return "QR code not valid for this event.";

  const rsvp = rows[0];

  if (rsvp.events?.event_slug !== event_slug) return "QR code not valid for this event.";
  if (rsvp.booking_status === "checked") return "Already checked in.";
  if (rsvp.booking_status === "canceled") return "This RSVP was canceled.";
  if (rsvp.booking_status !== "booked" && rsvp.booking_status !== "waitlist") {
    return `Unexpected status: ${rsvp.booking_status}`;
  }

  // 2. Mark as checked
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_rsvps?id=eq.${rsvpId}`,
    {
      method: "PATCH",
      headers: { ...sbHeaders, "Prefer": "return=minimal" },
      body: JSON.stringify({ booking_status: "checked" }),
    }
  );
  if (!patchRes.ok) throw new Error(`Supabase patch failed (${patchRes.status})`);

  // 3. Fetch member profile for display
  const mid = encodeURIComponent(rsvp.member_id);
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${mid}&select=first_name,last_name,email`,
    { headers: sbHeaders }
  );
  let first_name = "", last_name = "", email = "";
  if (profileRes.ok) {
    const profiles = await profileRes.json();
    if (profiles.length) ({ first_name, last_name, email } = profiles[0]);
  }

  return {
    member_name:    `${first_name} ${last_name}`.trim(),
    id:             rsvp.member_id,
    email,
    rsvp_record_id: rsvp.id,
    booking_status: "checked",
  };
}

// ─── Memberstack plan sync (webhook from Memberstack on plan add/remove) ─────
async function handleMemberstackPlanSync(request, env) {
  // Verify signature — Memberstack signs with HMAC-SHA256 of raw body
  const signature = request.headers.get("x-memberstack-signature");
  if (!signature) return new Response("Unauthorized", { status: 401 });

  const rawBody = await request.text();
  if (!(await verifyWebflowSignature(rawBody, signature, env.MEMBERSTACK_WEBHOOK_SECRET))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try { body = JSON.parse(rawBody); } catch { return new Response("Bad request", { status: 400 }); }

  const event = body.event || "";
  if (!["memberstack.member.plan.added", "memberstack.member.plan.removed", "memberstack.member.plan.updated", "memberstack.member.plan.canceled"].includes(event)) {
    return new Response(JSON.stringify({ ok: true, skipped: event }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const member     = body.data || {};
  const memberId   = member.id;
  if (!memberId) return new Response("member id missing", { status: 400 });

  const connections = parsePlanConnections(member.planConnections || []);
  const { application_status, subscription_plan } = resolveStatusFromConnections(connections);

  if (!application_status) {
    console.log(`[PLAN SYNC] No resolvable status for ${memberId} — skipping`);
    return new Response(JSON.stringify({ ok: true, skipped: "no status" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const sbRes = await fetch(
    `${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${encodeURIComponent(memberId)}`,
    {
      method:  "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify({ application_status, subscription_plan }),
    }
  );
  if (!sbRes.ok) {
    const err = await sbRes.text();
    throw new Error(`Supabase PATCH error (${sbRes.status}): ${err}`);
  }

  console.log(`[PLAN SYNC] ${memberId} → ${application_status} / ${subscription_plan ?? "null"}`);
  return new Response(JSON.stringify({ ok: true, application_status, subscription_plan }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// ─── Supabase → Memberstack sync (DB webhook on member_profiles UPDATE) ──────
async function handleSupabaseMemberSync(request, env) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== env.SUPABASE_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const record    = body.record     || {};
  const oldRecord = body.old_record || {};
  const { member_id, application_status } = record;

  if (!member_id) {
    return new Response(JSON.stringify({ ok: true, skipped: "no member_id" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // No actual status change — skip to prevent loops
  if (application_status === oldRecord.application_status) {
    return new Response(JSON.stringify({ ok: true, skipped: "no change" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (!application_status) {
    return new Response(JSON.stringify({ ok: true, skipped: "no status" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const planId = STATUS_TO_PLAN_ID[application_status.toLowerCase()];
  if (!planId) {
    console.log(`[SUPABASE SYNC] No plan mapping for "${application_status}" — skipping`);
    return new Response(JSON.stringify({ ok: true, skipped: `no plan for ${application_status}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const msRes = await fetch(
    `https://admin.memberstack.com/members/${encodeURIComponent(member_id)}/add-plan`,
    { method: "POST", headers: { "x-api-key": env.MEMBERSTACK_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ planId }) }
  );
  if (!msRes.ok) {
    const err = await msRes.text();
    if (!err.includes("already-have-plan")) throw new Error(`Memberstack add-plan error (${msRes.status}): ${err}`);
  }

  console.log(`[SUPABASE SYNC] ${member_id} → ${application_status} (plan: ${planId})`);
  return new Response(JSON.stringify({ ok: true, member_id, application_status, planId }), { status: 200, headers: { "Content-Type": "application/json" } });
}

// ─── Admin approve/reject/freeze/unfreeze — writes Supabase, DB webhook syncs Memberstack ───
const ACTION_STATUS_MAP = {
  approve:  { application_status: "approved",    subscription_plan: null },
  reject:   { application_status: "rejected",    subscription_plan: null },
  freeze:   { application_status: "frozen",      subscription_plan: null },
  unfreeze: { application_status: "approved",    subscription_plan: null },
};

async function handleAdminCreateMessage(request, env, origin) {
  const cors = corsHeaders(origin, env);
  let payload;
  try { payload = await request.json(); } catch {
    return new Response("Bad request", { status: 400, headers: cors });
  }

  const { member_id, subject, message, recipient } = payload;
  if (!member_id || !subject || !message || !recipient) {
    return new Response("member_id, subject, message, and recipient required", { status: 400, headers: cors });
  }

  // Verify caller has admin plan
  const msRes = await fetch(
    `https://admin.memberstack.com/members/${encodeURIComponent(member_id)}`,
    { headers: { "x-api-key": env.MEMBERSTACK_KEY } }
  );
  if (!msRes.ok) return new Response("Member not found", { status: 404, headers: cors });
  const msJson = await msRes.json();
  const connections = parsePlanConnections(msJson.data?.planConnections || []);
  if (!connections.some(c => c.planId === PLAN_IDS.admin)) {
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_messages`, {
    method: "POST",
    headers: sbHeaders,
    body: JSON.stringify({ subject, message, recipient }),
  });
  if (!insertRes.ok) throw new Error(`Supabase insert error (${insertRes.status})`);

  const [created] = await insertRes.json();
  return new Response(JSON.stringify({ success: true, message: created }), {
    status: 200, headers: { "Content-Type": "application/json", ...cors },
  });
}

async function handleAdminApproveMember(request, env) {
  let payload;
  try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const { member_id, action } = payload;
  if (!member_id || !action) return new Response("member_id and action required", { status: 400 });

  const statusUpdate = ACTION_STATUS_MAP[action];
  if (!statusUpdate) return new Response(`Unknown action: ${action}`, { status: 400 });

  // Write to Supabase — DB webhook cascades to Memberstack automatically
  const sbRes = await fetch(
    `${SUPABASE_URL}/rest/v1/member_profiles?member_id=eq.${encodeURIComponent(member_id)}`,
    {
      method:  "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify(statusUpdate),
    }
  );
  if (!sbRes.ok) {
    const err = await sbRes.text();
    throw new Error(`Supabase PATCH error (${sbRes.status}): ${err}`);
  }

  console.log(`[ADMIN ACTION] ${action} → ${member_id} → ${statusUpdate.application_status}`);
  return { ok: true, ...statusUpdate };
}

// ─── Admin data (verify admin, fetch all members + donations) ────────────────
async function handleAdminData(request, env, origin) {
  const cors = corsHeaders(origin, env);

  let payload;
  try { payload = await request.json(); } catch {
    return new Response("Bad request", { status: 400, headers: cors });
  }

  const { member_id } = payload;
  if (!member_id) return new Response("member_id required", { status: 400, headers: cors });

  // Verify caller has admin plan
  const msVerifyRes = await fetch(
    `https://admin.memberstack.com/members/${encodeURIComponent(member_id)}`,
    { headers: { "x-api-key": env.MEMBERSTACK_KEY } }
  );
  if (!msVerifyRes.ok) return new Response("Member not found", { status: 404, headers: cors });
  const msVerifyJson = await msVerifyRes.json();
  const callerConnections = parsePlanConnections(msVerifyJson.data?.planConnections || []);
  if (!callerConnections.some(c => c.planId === PLAN_IDS.admin)) {
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  const sbHeaders = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
  };

  // Fetch members, donations, events, RSVPs, and admin messages from Supabase in parallel
  const [membersRes, donationsRes, eventsRes, rsvpsRes, adminMessagesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/member_profiles?select=*,member_questionnaire(*)&order=created_at.asc`, { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/donations?select=*&order=created_at.desc`,      { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/events?select=*&order=event_date.asc`,          { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?select=*,member_profiles(member_id,first_name,last_name)&order=booked_at.asc`, { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/admin_messages?select=*&order=date.desc`,       { headers: sbHeaders }),
  ]);

  if (!membersRes.ok)       throw new Error(`Supabase member_profiles error (${membersRes.status})`);
  if (!donationsRes.ok)     throw new Error(`Supabase donations error (${donationsRes.status})`);
  if (!eventsRes.ok)        throw new Error(`Supabase events error (${eventsRes.status})`);
  if (!rsvpsRes.ok)         throw new Error(`Supabase event_rsvps error (${rsvpsRes.status})`);
  if (!adminMessagesRes.ok) throw new Error(`Supabase admin_messages error (${adminMessagesRes.status})`);

  const [members, donations, events, rsvps, adminMessages] = await Promise.all([
    membersRes.json(), donationsRes.json(), eventsRes.json(), rsvpsRes.json(), adminMessagesRes.json(),
  ]);

  console.log(`[ADMIN DATA] ${members.length} members, ${donations.length} donations, ${events.length} events, ${rsvps.length} rsvps, ${adminMessages.length} admin messages`);
  return new Response(JSON.stringify({ members, donations, events, rsvps, adminMessages }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors },
  });
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
  // "/admin-approve-member" — migrated to Supabase direct (see handleAdminApproveMember)
  "/admin-list-rsvp":         "https://hook.us2.make.com/4ccux957qcdn2n1ocwsxw7uwca6558f9",
  "/admin-list-event":        "https://hook.us2.make.com/cflbrl1lyeynad737qt9574hc55botq2",
  "/admin-messages":          "https://hook.us2.make.com/6wea8zdfq4qprfrexknmyu8a5myiyh12",
  "/admin-message-center":    "https://hook.us2.make.com/ax5qvxznklrbrechyt1gdy7r1jner5zp",

  // Donations
  // "/donation-checkout" — migrated to Worker (handleDonationCheckout, Stripe direct)
  // "/donation-confirm"  — migrated to Worker (/stripe-webhook, Stripe direct)
  "/donation-list-all":       "https://hook.us2.make.com/3kb2m1jg7k23klrycyhl1qq75f3i5ht8",
  "/donation-list-mine":      "https://hook.us2.make.com/zpr4ws33ani1pcb0hq69kfrdhyi3aovx",

  // Events
  "/list-events":             "https://hook.us2.make.com/rwcg9vj3dfjpm8hhf89h4xhc35rhdw51",
  "/closed-event":            "https://hook.us2.make.com/5wfgpu9ih2yjdfsy8ckbfuhrnly5xmat",

  // Questionnaire
  "/questionnaire-create-member": "https://hook.us2.make.com/0k76yae1yt3jmujqap8d7xaaxmph27g6",

  // Home
  "/home-review":             "https://hook.us2.make.com/qd67puk6apqmdmgvsgl8u9yudf725muv",
};

// ─── Donation receipt email — called by Supabase webhook on donations INSERT ──
async function handleSendDonationReceipt(request, env) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== env.SUPABASE_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try { payload = await request.json(); }
  catch { return new Response("Bad request", { status: 400 }); }

  const record = payload?.record;
  if (!record) {
    return new Response(JSON.stringify({ ok: true, skipped: "no record" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const { member_id, email, amount, receipt_url } = record;

  if (!email) {
    console.error("[DONATION EMAIL] No email on record", record);
    return new Response(JSON.stringify({ ok: true, skipped: "no email" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const amountFormatted = "$" + ((Number(amount) || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const receiptButton = receipt_url
    ? `<tr>
          <td align="center" style="padding:0 50px;">
            <a href="${receipt_url}"
               style="display:inline-block; background-color:#946a49; color:#ffffff; text-decoration:none; font-family:Arial, sans-serif; font-size:14px; padding:14px 28px; border-radius:4px;">
               Download Receipt →
            </a>
          </td>
        </tr>`
    : "";

  const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f2f2; padding:40px 0;">
  <tr>
    <td align="center">
      <table width="500" cellpadding="0" cellspacing="0" border="0" align="center"
        style="background-color:#ffffff; border-radius:10px; overflow:hidden;">
        <tr>
          <td align="center" style="background-color:#2b1f14; padding:24px 40px;">
            <div style="font-family:Georgia, serif; font-size:22px; color:#ffffff; letter-spacing:1px;">
              THE HOUSE OF MORE
            </div>
            <a href="https://thehouseofmore.com"
               style="color:#946a49 !important; text-decoration:none; font-family:Arial, sans-serif; font-size:12px;">
               thehouseofmore.com
            </a>
          </td>
        </tr>
        <tr><td style="height:36px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:12px; letter-spacing:2px; color:#8c7a64;">
              DONATION RECEIVED
            </div>
          </td>
        </tr>
        <tr><td style="height:14px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Georgia, serif; font-size:26px; color:#2b2b2b; line-height:34px;">
              Thank you for your donation
            </div>
          </td>
        </tr>
        <tr><td style="height:20px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:14px; color:#5c5c5c; line-height:22px;">
              We are deeply grateful for your contribution of <strong>${amountFormatted}</strong>. Your support helps us continue creating meaningful experiences and nurturing this community.
              <br><br>
              You can download your receipt using the button below.
            </div>
          </td>
        </tr>
        <tr><td style="height:30px;"></td></tr>
        ${receiptButton}
        <tr><td style="height:36px;"></td></tr>
        <tr>
          <td style="padding:0 50px;">
            <hr style="border:none; border-top:1px solid #e5ded4;">
          </td>
        </tr>
        <tr><td style="height:20px;"></td></tr>
        <tr>
          <td align="left" style="padding:0 50px;">
            <div style="font-family:Arial, sans-serif; font-size:14px; color:#2b2b2b; line-height:22px;">
              If you have any questions about your donation, simply reply to this email and our team will be happy to assist you.
              <br><br>
              <em>With gratitude,</em><br>
              <strong>The House of More Team</strong>
            </div>
          </td>
        </tr>
        <tr><td style="height:48px;"></td></tr>
        <tr>
          <td align="center" style="background-color:#f7f3ed; padding:18px;">
            <div style="font-family:Arial, sans-serif; font-size:12px; color:#8c7a64;">
              © House of More 2026
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    "onboarding@resend.dev",
      to:      email,
      subject: `Your donation receipt — ${amountFormatted}`,
      html,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("[DONATION EMAIL] Resend error:", errText);
    return new Response(JSON.stringify({ error: errText }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[DONATION EMAIL] Receipt sent to:", email, "amount:", amountFormatted, "member:", member_id);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// ─── Stripe: verify webhook signature (Web Crypto — no Node.js required) ─────
async function verifyStripeSignature(body, sigHeader, secret) {
  const v1Sigs = [];
  let timestamp = null;

  sigHeader.split(",").forEach(part => {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key === "t") timestamp = val;
    if (key === "v1") v1Sigs.push(val);
  });

  if (!timestamp || v1Sigs.length === 0) return false;

  // Reject if older than 5 minutes (replay attack prevention)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return v1Sigs.some(sig => sig === expected);
}

// ─── Stripe: create Checkout Session (one-time donation) ─────────────────────
async function handleDonationCheckout(payload, env, origin) {
  const cors = corsHeaders(origin, env);
  const { amount, memberId, email } = payload;

  if (!amount || !memberId || !email) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const params = new URLSearchParams();
  params.set("mode",                                               "payment");
  params.set("submit_type",                                        "donate");
  params.set("line_items[0][price_data][currency]",               "usd");
  params.set("line_items[0][price_data][unit_amount]",            String(amount));
  params.set("line_items[0][price_data][product_data][name]",     "Donation — The House of More");
  params.set("line_items[0][quantity]",                           "1");
  params.set("success_url",  "https://www.thehouseofmore.com/app/member?donation=confirm");
  params.set("cancel_url",   "https://www.thehouseofmore.com/app/member?donation=not-confirm");
  params.set("customer_email",        email);
  params.set("receipt_email",         email);
  params.set("metadata[member_id]",   memberId);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization":  `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type":   "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!stripeRes.ok) {
    const errText = await stripeRes.text();
    console.error("[DONATION] Stripe Checkout error:", errText);
    return new Response(JSON.stringify({ error: "Stripe error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const session = await stripeRes.json();
  console.log("[DONATION] Checkout session created:", session.id, "member:", memberId);
  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// ─── Stripe: webhook receiver (checkout.session.completed → Supabase) ────────
async function handleStripeWebhook(request, env) {
  const body = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature");

  if (!sigHeader) return new Response("Missing signature", { status: 400 });

  const isValid = await verifyStripeSignature(body, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    console.error("[STRIPE WEBHOOK] Invalid signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try { event = JSON.parse(body); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  // Only handle checkout completion — acknowledge everything else
  if (event.type !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session        = event.data.object;
  const memberId       = session.metadata?.member_id;
  const email          = session.customer_details?.email || session.customer_email;
  const amountTotal    = session.amount_total; // cents
  const paymentIntentId = session.payment_intent;

  if (!memberId || !paymentIntentId) {
    console.error("[STRIPE WEBHOOK] Missing member_id or payment_intent in session:", session.id);
    return new Response("OK", { status: 200 }); // 200 so Stripe doesn't retry
  }

  // Fetch payment intent to get receipt URL from the underlying charge
  let receiptUrl = null;
  const piRes = await fetch(
    `https://api.stripe.com/v1/payment_intents/${paymentIntentId}?expand[]=latest_charge`,
    { headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` } }
  );
  if (piRes.ok) {
    const pi = await piRes.json();
    receiptUrl = pi.latest_charge?.receipt_url || null;
  } else {
    console.warn("[STRIPE WEBHOOK] Could not fetch payment intent:", await piRes.text());
  }

  // Write donation to Supabase
  const sbHeaders = {
    "Content-Type":  "application/json",
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Prefer":        "return=minimal",
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/donations`, {
    method:  "POST",
    headers: sbHeaders,
    body: JSON.stringify({
      member_id:      memberId,
      email,
      amount:         amountTotal,
      type:           "one-time",
      status:         "paid",
      receipt_url:    receiptUrl,
      transaction_id: paymentIntentId,
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("[STRIPE WEBHOOK] Supabase insert error:", insertRes.status, errText);
    return new Response("Supabase error", { status: 500 }); // 500 = Stripe will retry
  }

  console.log("[STRIPE WEBHOOK] Donation saved — member:", memberId, "amount:", amountTotal, "receipt:", receiptUrl);
  return new Response("OK", { status: 200 });
}

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

    // Email confirmation — called by Supabase webhook on event_rsvps INSERT
    if (path === "/send-rsvp-email") {
      if (!env.RESEND_API_KEY || !env.SUPABASE_KEY || !env.SUPABASE_WEBHOOK_SECRET) {
        console.error("RESEND_API_KEY, SUPABASE_KEY or SUPABASE_WEBHOOK_SECRET is not set");
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleSendRsvpEmail(request, env);
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

    // Event data (Supabase direct)
    if (path === "/event-data") {
      if (!env.SUPABASE_KEY) return new Response("Server misconfiguration", { status: 500 });
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      try {
        const data = await handleEventData(payload, env);
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

    // Member RSVP (Supabase direct)
    if (path === "/member-rsvp-supabase") {
      if (!env.SUPABASE_KEY) return new Response("Server misconfiguration", { status: 500 });
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      try {
        const result = await handleMemberRsvpSupabase(payload, env);
        return new Response(JSON.stringify(result), {
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

    // Facilitator check-in (Supabase direct)
    if (path === "/facilitator-checkin-supabase") {
      if (!env.SUPABASE_KEY) return new Response("Server misconfiguration", { status: 500 });
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      try {
        const result = await handleFacilitatorCheckin(payload, env);
        return new Response(JSON.stringify(result), {
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

    // Supabase → Memberstack sync (DB webhook on member_profiles UPDATE)
    if (path === "/supabase-member-sync") {
      if (!env.MEMBERSTACK_KEY || !env.SUPABASE_WEBHOOK_SECRET) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleSupabaseMemberSync(request, env);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Memberstack plan sync (webhook from Memberstack on plan add/remove)
    if (path === "/memberstack-plan-sync") {
      if (!env.SUPABASE_KEY || !env.MEMBERSTACK_WEBHOOK_SECRET) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleMemberstackPlanSync(request, env);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Admin data (all members + donations)
    if (path === "/admin-data") {
      if (!env.SUPABASE_KEY || !env.MEMBERSTACK_KEY) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleAdminData(request, env, origin);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    // Admin approve/reject/freeze/unfreeze (Supabase direct)
    if (path === "/admin-create-message") {
      if (!env.SUPABASE_KEY || !env.MEMBERSTACK_KEY) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleAdminCreateMessage(request, env, origin);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    // Member messages (Supabase direct)
    if (path === "/member-messages-supabase") {
      if (!env.SUPABASE_KEY) return new Response("Server misconfiguration", { status: 500 });
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      try {
        const data = await handleMemberMessages(payload, env);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    // Member message action — mark read or erase (Supabase direct)
    if (path === "/member-message-action-supabase") {
      if (!env.SUPABASE_KEY) return new Response("Server misconfiguration", { status: 500 });
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      try {
        const data = await handleMemberMessageAction(payload, env);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    if (path === "/admin-approve-member") {
      if (!env.SUPABASE_KEY || !env.MEMBERSTACK_KEY) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        const data = await handleAdminApproveMember(request, env);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    // Donation receipt email — called by Supabase webhook on donations INSERT
    if (path === "/send-donation-receipt") {
      if (!env.RESEND_API_KEY || !env.SUPABASE_WEBHOOK_SECRET) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleSendDonationReceipt(request, env);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: create Checkout Session (one-time donation)
    if (path === "/donation-checkout") {
      if (!env.STRIPE_SECRET_KEY) return new Response("Server misconfiguration", { status: 500 });
      let payload;
      try { payload = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      try {
        return await handleDonationCheckout(payload, env, origin);
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
        });
      }
    }

    // Stripe: webhook receiver (checkout.session.completed → Supabase)
    if (path === "/stripe-webhook") {
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
        return new Response("Server misconfiguration", { status: 500 });
      }
      try {
        return await handleStripeWebhook(request, env);
      } catch (err) {
        console.error(err);
        return new Response("Internal error", { status: 500 });
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
