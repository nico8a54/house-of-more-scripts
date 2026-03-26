# House of More — Session Context

## Project
Custom member platform for **The House of More** (`thehouseofmore.com`).
Stack: Webflow + Memberstack + Cloudflare Workers + Supabase + custom JS.
Note: Make.com is being phased out — all routes moving to direct Supabase via Cloudflare Worker.

---

## Repo
GitHub: `nico8a54/house-of-more-scripts` (branch: `main`)
Local: `c:/GIT/House of More`

Key files:
- `cloudflare-worker/src/index.js` — Cloudflare Worker (auto-deploys to Cloudflare on push via native Git integration)
- `member-compiled.js` — current live member page JS (Make.com based)
- `member-compiled-supabase.js` — new version being built (Supabase-based)
- `event-compiled-supabase.js` — event template page JS (Supabase-based, active)
- `event-compiled.js` — old event page JS (Make.com based, replaced)
- `questionnaire-compiled.js` — questionnaire (Make.com flow)
- `questionnaire-compiled-supabase.js` — questionnaire (Supabase flow, working)

---

## Cloudflare Worker
URL: `https://houseofmore.nico-97c.workers.dev`
Auto-deploys from GitHub → `cloudflare-worker/` folder via Cloudflare native Git integration.

Secrets set in Worker:
- `MAKE_API_KEY` (legacy — kept while Make.com routes still exist)
- `SUPABASE_KEY`
- `MEMBERSTACK_KEY`
- `SUPABASE_WEBHOOK_SECRET`
- `ALLOWED_ORIGIN`
- `WEBFLOW_SECRET_CREATED`
- `WEBFLOW_SECRET_CHANGED`
- `WEBFLOW_SECRET_DELETED`
- `WEBFLOW_SECRET_PUBLISHED`
- `WEBFLOW_SECRET_UNPUBLISHED`
- `WEBFLOW_WEBHOOK_SECRET` (legacy — old single-secret approach, kept but unused)

CORS allowed origins: `https://www.thehouseofmore.com`, `https://thehouseofmore.com`, `http://localhost:5500`, `http://127.0.0.1:5500`

### Supabase routes (direct — no Make.com)
- `POST /questionnaire-supabase` — writes to `member_profiles` + `member_questionnaire`
- `POST /member-profile` — fetches profile, questionnaire, rsvps, donations from Supabase + plan connections from Memberstack API in parallel. Returns one merged flat object. Always returns full questionnaire shape (null keys) and skeleton rsvp/donation objects when arrays are empty.
- `POST /member-profile-update-supabase` — updates `member_profiles` (PATCH) + `member_questionnaire` (UPSERT) from profile form payload. Splits fields using `PROFILE_FIELDS` and `QUESTIONNAIRE_FIELDS` constants.
- `POST /memberstack-add-plan` — called by Supabase DB webhook on `member_profiles` INSERT → adds `pln_members-5kbh0gjx` to member in Memberstack
- `POST /event-data` — fetches event from `events_with_capacity` view by `event_slug` + RSVPs (with embedded `member_profiles`: first_name, last_name, email, member_id) + member plan info from Memberstack (if `member_id` passed). Returns `{ event, rsvps, current_capacity, member }`.
- `POST /member-rsvp-supabase` — handles RSVP booking, cancel, waiting-list for members. Writes `member` boolean to `event_rsvps`.
- ~~`POST /webflow-event-sync`~~ — removed from Worker, replaced by Supabase Edge Function below

### Make.com routes (legacy — being phased out)
- `/member-profile-update`, `/member-list-events`, `/member-rsvp`, `/member-messages-load`, `/member-message-action`
- `/facilitator-list-events`, `/facilitator-checkin`, `/facilitator-close-event`
- `/admin-list-members`, `/admin-get-member`, `/admin-approve-member`, `/admin-list-rsvp`, `/admin-list-event`, `/admin-messages`, `/admin-message-center`
- `/donation-checkout`, `/donation-list-all`, `/donation-list-mine`, `/donation-confirm`
- `/list-events`, `/closed-event`, `/questionnaire-create-member`, `/home-review`

---

## Supabase
URL: `https://wioktwzioxzgmntgxsme.supabase.co`

### Tables & key columns
- `member_profiles` — id (uuid), member_id, email, first_name, last_name, phone, birthday, gender, marital_status, application_status, date_of_request, approved_date, location, created_at, updated_at
- `member_questionnaire` — id, member_id, where_are_you_on_your_path, how_can_we_support_you, how_did_you_hear_about_the_house_of_more, have_you_been_with_the_house_of_more, how_many_events_have_you_attended_at_the_hom, how_many_events_per_month_can_you_participate, what_draws_you_to_the_house_of_more, community_and_contribution, is_there_anything_else, do_you_feel_aligned_with_the_house_of_more, i_commit_to_respecting_the_house_of_more (bool), skills_to_share
- `event_rsvps` — id (uuid), member_id, event_id (text FK → events.id), booking_status, member (bool, default true — false for non-member bookings), rating, review, booked_at, cancel_at, created_at, updated_at
- `donations` — id, member_id, email, amount (int, cents), type, status, receipt_url, transaction_id, recurrent_status
- `messages` — id, message_record_id, member_id, subject, body, read (bool), erased (bool), sent_by, sent_at
- `events` — id (text PK = Webflow item ID), event_name, event_date, event_status, event_capacity (int), facilitator_name, facilitator_email, event_link, event_slug, event_location, event_category (text), event_gender (text), event_duration (numeric — decimal hours e.g. 0.5, 1, 2), event_video_link, created_at, updated_at
- `events_with_capacity` (view) — all events columns + event_current_capacity, booked_count, canceled_count, waitlist_count (joins event_rsvps on event_rsvps.event_id = events.id)

### Field constants (in worker)
- `PROFILE_FIELDS` — first_name, last_name, phone, birthday, gender, marital_status, location
- `QUESTIONNAIRE_FIELDS` — all 12 questionnaire columns including skills_to_share
- `PLAN_IDS` — plan ID constants: active, admin, facilitator, frozen, pending, rejected (see below)
- `parsePlanConnections(connections)` — shared helper, returns `[{ planId, planName, status, type }]`

### Edge Functions
- `webflow-event-sync` — `https://wioktwzioxzgmntgxsme.supabase.co/functions/v1/webflow-event-sync`
  - Receives Webflow CMS webhooks → syncs `events` table
  - `collection_item_published` → iterates `payload.items[]`, upserts each into `events` on conflict `id`
  - `collection_item_unpublished` → sets `event_status = "closed"` via upsert
  - `collection_item_deleted` → hard DELETE by `id`
  - `collection_item_created` / `collection_item_changed` → ignored (200)
  - ⚠️ Signature verification disabled — secrets stored in Edge Function don't match Webflow webhook registration. All 5 triggers return 401 when verification is enabled. Low priority — endpoint is not publicly discoverable and only handles low-stakes event data.
  - Field mapping (Webflow slug → Supabase column):
    - `name` → `event_name`, `slug` → `event_slug`, `date` → `event_date`
    - `capacity` → `event_capacity`, `status` → `event_status`, `location` → `event_location`
    - `facilitator-name` → `facilitator_name`, `facilitator-id` → `facilitator_email` (slug ≠ display name)
    - `online-event-link` → `event_link`
    - `duration-in-hours` → `event_duration` (numeric; Webflow slug ≠ display name "duration")
    - `category` → `event_category` (Option field — IDs resolved to labels via hardcoded map)
    - `gender` → `event_gender` (Option field — IDs resolved to labels via hardcoded map)
  - Option label maps hardcoded in edge function:
    - Category: Gathering, Workshop, Ceremonies & Retreats
    - Gender: Male Only, Female Only, Male and Female, Couples
  - ⚠️ When adding new Webflow fields: if the item was already published before the field was added, Webflow won't include the new field in the webhook payload. Must open item, edit, save, then publish to force full fieldData in payload.
  - Webflow webhooks (5 triggers) point to this URL — secrets `WEBFLOW_SECRET_*` stored in Edge Function secrets (unused until sig verification is fixed)
  - Webflow collection: Events 2026s (`69768dc21072a12ac28003ee`)
  - **Verified working end-to-end March 26 2026**

### Database Webhook
- Table: `member_profiles` — Event: INSERT
- URL: `https://houseofmore.nico-97c.workers.dev/memberstack-add-plan`
- Header: `x-webhook-secret: vxAc8CnaJnUA--JVA`

### Questionnaire flow (working)
Webflow form → `POST /questionnaire-supabase` → Worker writes to `member_profiles` + `member_questionnaire` → Supabase webhook fires → Worker adds pending plan in Memberstack

---

## Memberstack
App ID: `app_cmiyx2vit00ld0ruubtoi3ih7`
Member ID format: `mem_...`

### Plan IDs (FREE plans)
- Active: `pln_approved-member-bd2jv0hp1`
- Admin: `pln_admin-1823l09h8`
- Facilitator: `pln_facilitator-9o1kw0j5o`
- Frozen: `pln_freeze-yy2kn0ejb`
- Pending: `pln_members-5kbh0gjx`
- Rejected: `pln_rejected-fo1l60nm3`

Note: Memberstack GET member returns `planConnections[].planId` and `type` (FREE/paid). `planName` may be empty — always check by `planId`.

---

## /event-data response shape
```json
{
  "event": { "id": "...", "event_name": "...", "event_capacity": 20, "event_current_capacity": 14, ... },
  "rsvps": [{
    "id": "uuid", "member_id": "mem_...", "booking_status": "booked", "member": true,
    "member_profiles": { "member_id": "mem_...", "first_name": "...", "last_name": "...", "email": "..." }
  }],
  "current_capacity": 14,
  "member": {
    "plan_name": [{ "planId": "pln_admin-1823l09h8", "planName": "", "status": "active", "type": "free" }]
  }
}
```
Note: `member` is `null` if no `member_id` passed (non-logged-in visitors).

---

## /member-profile response shape
```json
{
  "id": "uuid",
  "member_id": "mem_...",
  "email": "...",
  "first_name": "...", "last_name": "...", "phone": "...",
  "birthday": "...", "gender": "...", "marital_status": "...",
  "application_status": "...", "date_of_request": "...", "approved_date": "...",
  "location": "...",
  "plan_name": [{ "planId": "pln_approved-member-bd2jv0hp1", "planName": "", "status": "active", "type": "free" }],
  "questionnaire": { "where_are_you_on_your_path": "...", ... all 12 keys always present },
  "rsvps": [{ "event_id": "69b9a60b...", "booking_status": "booked", ... }],
  "donations": [{ "amount": 5000, "type": "one-time", ... }]
}
```
Note: `rsvps` and `donations` return a skeleton object with null values when empty so field shape is always visible.

---

## member-compiled-supabase.js — Current State

### Sections 1–5 (navigation, UI)
1. Tab navigation — `.app-button` / `.workspace-tab` shared class switching, sessionStorage force-clicks
2. Trigger my events after cancel — pageshow → polls for `#my-events` button
3. Donation landing param — reads `?donation=` / `?forceRefetch=`, clears URL, switches tab
4. Count days — shows "Today / Tomorrow / In N days" on event cards
5. Calendar view — month grid, popover on hover, list/calendar toggle

### Section 6 — Member profile fetch + render + edit UI (Supabase)
- Reads `[data-ms-member="id"]` directly for member_id — Memberstack populates it synchronously at DOM load, no polling needed. Element must be present in the DOM (can be hidden).
- `POST /member-profile` → full merged object
- `renderFields(data)` — flattens `questionnaire` into top-level, then:
  - Checkboxes: `input[type="checkbox"][name="key"]` → checks via `data-option` + `normalizeOption`
  - Radios: `input[type="radio"][name="key"]` → matched by value
  - Select: `.select-field[data-field="key"]` → case-insensitive match
  - Text/inputs: `[data-field="key"]` → `.value` or `.textContent`, adds `.filled`
  - Birthday: converted via `toDateInputValue` before setting
- View mode: all inputs/textareas/selects/wrappers get `.filled`; `.field-text` already has `.filled` by default in HTML (not touched on load)
- Edit mode (`#edit-form` click): strips `.filled` from all form elements and `.field-text`; email field kept `.filled` + `.locked` — members cannot change it
- Cancel: re-renders from cached `state.data`, restores view mode
- `updateFacilitatorMenu` — shows `.menu-wrapper.facilitator` if plan includes "facilitator"
- `updateCancelPlan` — shows `.cancel-plan` if active pay plan exists
- `addMemberProfileToEventLinks` — appends `?member_profile=uuid` to `.button.event-card` hrefs (uses `data.id` from member_profiles)

### Section 7 — Profile form submit
- Collects all inputs/selects/textareas by `name`, radios (checked), checkboxes (grouped + joined with ` / `)
- `POST /member-profile-update-supabase`
- On 200: sets `forceClickProfile` sessionStorage, reloads page

---

## event-compiled-supabase.js — Current State

### Section 1 — Check origin & set UI state
- Reads `?booked`, `?source`, `?admin` URL params on `DOMContentLoaded`
- Hides all `.event-info-wrapper` by default
- Admin/event-manager mode: shows `.event-info-wrapper`, hides RSVP + event-card buttons

### Section 2 — Back button
- `#close-event` click → `window.history.back()`

### Section 3 — Initial fetch (Supabase)
- `POST /event-data` with `{ event_slug, member_id }` on `DOMContentLoaded`
- Logs: `[EVENT] Supabase response:` + `[EVENT] current_capacity:`
- **Capacity tag** (`#capacity-tag`): "Sold Out" if ≤ 0, "Only N Left" if ≤ 5, hidden otherwise
- **Spots** (`#spots-available`): sets textContent to capacity
- **Admin plan check**: if member has `pln_admin-1823l09h8` → removes `.hide` from all `.event-info-wrapper`
- **Attendants list**: clones `.attendants-row` template (appends to its `parentElement`) for each RSVP where status is booked/canceled/checked/no-show
  - Sorted: checked → booked → canceled → no-show
  - Renders: `first_name`, `email`, `id` (RSVP uuid), `booking_status`, `member` (yes/no)
  - Shows `.check` element for `booking_status === "checked"`
- **Reviews list**: clones `.review-container` template, appends to its `parentElement`, for each RSVP where `review` is not null
  - Renders: `first_name`, `last_name`, `email`, `member_id`, `rating`, `review`, `booking_status`
- **RSVP button state**: hides if admin/event-manager or capacity ≤ -5; sets text to Cancel/Waiting List/RSVP

### Section 4 — RSVP flow
- Modal open/close, confirm → `POST /member-rsvp-supabase`
- Non-member booking form → `POST /member-rsvp-supabase` with `member: false`
- Cancel answer modal → `sessionStorage.triggerMyEvents = true` + `history.back()`

### Section 5 — QR check-in scanner
- Camera-based QR scanner for facilitator check-in
- Fires `POST /facilitator-checkin` (Make.com route — not yet migrated)
- On success: calls `updateAttendantRow(data)` to mark row as checked in the DOM

---

## Stress Test — stress-test.js

### Files
- `stress-test.js` — main script (gitignored)
- `dummy-members.csv` — 500 dummy Memberstack accounts, `hom.dummy001–500@email.com` / `Dummy1234!` (gitignored)
- `memberstack-export.csv` — Memberstack member export with IDs, used by Phase 0 (gitignored)

### Usage
```bash
node stress-test.js --phase 1   # questionnaire wave
node stress-test.js --phase 2   # profile update wave
node stress-test.js --phase 3   # admin review (approve 70%, reject 30%)
node stress-test.js --phase 4   # member activity burst
node stress-test.js             # all phases
node stress-test.js --dry-run   # no real requests
node stress-test.js --fix-plans # add Memberstack plan to all 500, 25/sec throttle
```

### Phases
- **Phase 0** (always runs): reads `memberstack-export.csv`, filters `hom.dummy` members → returns `{ id, email }` list
- **Phase 1**: `POST /questionnaire-supabase` for all 500 — writes `member_profiles` + `member_questionnaire` in Supabase. Fields: `member_id`, `first_name`, `last_name`, `email`, `phone`, `location`, `gender`, `marital_status`, `birthday` + all 12 questionnaire fields. Batches of 20.
- **Phase 2**: `POST /member-profile-update-supabase` for all 500 — updates profile fields. Batches of 20.
- **Phase 3**: `POST /admin-approve-member` — approves 70%, rejects 30%. Sequential with 500ms delay.
- **Phase 4**: Member activity burst — profile fetch, update, RSVP, messages. All concurrent.
- **--fix-plans**: Calls `/memberstack-add-plan` directly for all 500 members at 25/sec (Memberstack API rate limit). Uses `x-webhook-secret` header. Handles `already-have-plan` as success. Run after Phase 1 to guarantee all members have `pln_members-5kbh0gjx`.

### Supabase webhook + plan assignment — known behavior
- DB webhook fires on `member_profiles` INSERT only — UPSERT on existing rows = UPDATE = no webhook
- pg_net `batch_size`: 200 — fires up to 200 outbound HTTP calls per worker cycle
- Memberstack API rate limit: **25 req/sec** — 500 simultaneous webhook calls always hits this
- Worker fix (deployed): `addMemberstackPlan()` now retries up to 3x on 429 with 1s/2s/4s backoff; uses `res.text()` instead of `res.json()` (Memberstack returns plain "OK" on success)
- **Standard flow for stress test**: run Phase 1 → run `--fix-plans` to guarantee 500/500

### Stress test run order (clean slate)
1. Wipe Supabase tables: `member_profiles`, `member_questionnaire` (and related)
2. Wipe Memberstack dummy members
3. Re-import `dummy-members.csv` into Memberstack
4. Export fresh CSV → save as `memberstack-export.csv`
5. `node stress-test.js --phase 1`
6. `node stress-test.js --fix-plans`
7. Continue with phases 2, 3, 4
