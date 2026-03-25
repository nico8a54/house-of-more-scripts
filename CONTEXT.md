# House of More — Session Context

## Project
Custom member platform for **The House of More** (`thehouseofmore.com`).
Stack: Webflow + Memberstack + Make.com + Cloudflare Workers + Supabase + custom JS.

---

## Repo
GitHub: `nico8a54/house-of-more-scripts` (branch: `main`)
Local: `c:/GIT/House of More`

Key files:
- `cloudflare-worker/src/index.js` — Cloudflare Worker (auto-deploys to Cloudflare on push via native Git integration)
- `member-compiled.js` — current live member page JS (Make.com based)
- `member-compiled-supabase.js` — new version being built (Supabase-based)
- `questionnaire-compiled.js` — questionnaire (Make.com flow)
- `questionnaire-compiled-supabase.js` — questionnaire (Supabase flow, working)

---

## Cloudflare Worker
URL: `https://houseofmore.nico-97c.workers.dev`
Auto-deploys from GitHub → `cloudflare-worker/` folder via Cloudflare native Git integration.

Secrets set in Worker:
- `MAKE_API_KEY`
- `SUPABASE_KEY`
- `MEMBERSTACK_KEY`
- `SUPABASE_WEBHOOK_SECRET`
- `ALLOWED_ORIGIN`

### Supabase routes (direct — no Make.com)
- `POST /questionnaire-supabase` — writes to `member_profiles` + `member_questionnaire`
- `POST /member-profile` — fetches profile, questionnaire, rsvps, donations from Supabase + plan connections from Memberstack API in parallel. Returns one merged flat object.
- `POST /memberstack-add-plan` — called by Supabase DB webhook on `member_profiles` INSERT → adds `pln_members-5kbh0gjx` to member in Memberstack

### Make.com routes (still active)
- `/member-profile-update`, `/member-list-events`, `/member-rsvp`, `/member-messages-load`, `/member-message-action`
- `/facilitator-list-events`, `/facilitator-checkin`, `/facilitator-close-event`
- `/admin-list-members`, `/admin-get-member`, `/admin-approve-member`, `/admin-list-rsvp`, `/admin-list-event`, `/admin-messages`, `/admin-message-center`
- `/donation-checkout`, `/donation-list-all`, `/donation-list-mine`, `/donation-confirm`
- `/list-events`, `/closed-event`, `/questionnaire-create-member`, `/home-review`

---

## Supabase
URL: `https://wioktwzioxzgmntgxsme.supabase.co`

### Tables & key columns
- `member_profiles` — id (uuid), member_id, email, first_name, last_name, phone, birthday, gender, marital_status, application_status, date_of_request, approved_date
- `member_questionnaire` — id, member_id, all questionnaire fields, skills_to_share, i_commit_to_respecting_the_house_of_more (bool)
- `event_rsvps` — id, event_record_id, member_id, rsvp_record_id, member_email, member_name, status, rating, review, booked_at, cancel_at
- `donations` — id, member_id, email, amount (int, cents), type, status, receipt_url, transaction_id, recurrent_status
- `messages` — id, message_record_id, member_id, subject, body, read (bool), erased (bool), sent_by, sent_at
- `events` — id, event_id, event_record_id, event_name, event_date, event_status, event_capacity, facilitator_name, facilitator_email, event_link, event_slug

### Database Webhook
- Table: `member_profiles` — Event: INSERT
- URL: `https://houseofmore.nico-97c.workers.dev/memberstack-add-plan`
- Header: `x-webhook-secret: vxAc8CnaJnUA--JVA`

### Questionnaire flow (working)
Webflow form → `POST /questionnaire-supabase` → Worker writes to `member_profiles` + `member_questionnaire` → Supabase webhook fires → Worker adds pending plan in Memberstack

---

## Memberstack
App ID: `app_cmiyx2vit00ld0ruubtoi3ih7`
Pending plan ID: `pln_members-5kbh0gjx`
Member ID format: `mem_...`

---

## /member-profile response shape
```json
{
  "id": "uuid",
  "member_profile": "uuid",
  "member_id": "mem_...",
  "email": "...",
  "first_name": "...", "last_name": "...", "phone": "...",
  "birthday": "...", "gender": "...", "marital_status": "...",
  "application_status": "...", "date_of_request": "...", "approved_date": "...",
  "plan_name": [{ "planName": "Members", "status": "active" }],
  "questionnaire": { "where_are_you_on_your_path": "...", ... },
  "rsvps": [{ "event_record_id": "...", "status": "booked", ... }],
  "donations": [{ "amount": 5000, "type": "one-time", ... }]
}
```

---

## member-compiled-supabase.js — Current State

### Done (sections 1–5, navigation only)
1. Tab navigation — `.app-button` / `.workspace-tab` shared class switching, sessionStorage force-clicks
2. Trigger my events after cancel — pageshow → polls for `#my-events` button
3. Donation landing param — reads `?donation=` / `?forceRefetch=`, clears URL, switches tab
4. Count days — shows "Today / Tomorrow / In N days" on event cards
5. Calendar view — month grid, popover on hover, list/calendar toggle

### Next — Section 6: Member data fetch + render
On `DOMContentLoaded`:
1. Grab `member_id` from `[data-ms-member="id"]`
2. `POST /member-profile` → get full member object
3. Flatten `questionnaire` into top-level data
4. Generic `renderFields(data)` → iterate `Object.entries`, set `[data-field="key"]` on matching elements
5. Skip arrays except `plan_name` (handled separately for facilitator menu + cancel plan logic)
6. Keep profile edit/cancel UI behavior from `member-compiled.js`
