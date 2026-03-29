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
- `admin-compiled.js` — admin page JS (Make.com based, current live)
- `admin-compiled-supabase.js` — admin page JS (Supabase migration in progress)

---

## Cloudflare Worker
URL: `https://houseofmore.nico-97c.workers.dev`
Auto-deploys from GitHub → `cloudflare-worker/` folder via Cloudflare native Git integration.

Secrets set in Worker:
- `MAKE_API_KEY` (legacy — kept while Make.com routes still exist)
- `SUPABASE_KEY`
- `MEMBERSTACK_KEY`
- `SUPABASE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `ALLOWED_ORIGIN`
- `WEBFLOW_SECRET_CREATED`
- `WEBFLOW_SECRET_CHANGED`
- `WEBFLOW_SECRET_DELETED`
- `WEBFLOW_SECRET_PUBLISHED`
- `WEBFLOW_SECRET_UNPUBLISHED`
- `WEBFLOW_WEBHOOK_SECRET` (legacy — old single-secret approach, kept but unused)
- `MEMBERSTACK_WEBHOOK_SECRET` — signs `/memberstack-plan-sync` webhook (HMAC-SHA256)

CORS allowed origins: `https://www.thehouseofmore.com`, `https://thehouseofmore.com`, `http://localhost:5500`, `http://127.0.0.1:5500`

### Supabase routes (direct — no Make.com)
- `POST /questionnaire-supabase` — writes to `member_profiles` + `member_questionnaire`
- `POST /member-profile` — fetches profile, questionnaire, rsvps, donations, unread message count from Supabase + plan connections from Memberstack API in parallel. Returns one merged flat object. Always returns full questionnaire shape (null keys) and skeleton rsvp/donation objects when arrays are empty. `unread_messages_count` = total `admin_messages` count − `member_messages` rows where `read=true` for this member (handles members with no message interaction). If facilitator: also returns `facilitator_events` (id, event_slug, event_name, event_capacity, event_status, event_current_capacity) and `facilitator_rsvps` (full rsvp rows with embedded member_profiles).
- `POST /member-profile-update-supabase` — updates `member_profiles` (PATCH) + `member_questionnaire` (UPSERT) from profile form payload. Splits fields using `PROFILE_FIELDS` and `QUESTIONNAIRE_FIELDS` constants.
- `POST /memberstack-add-plan` — called by Supabase DB webhook on `member_profiles` INSERT → adds `pln_members-5kbh0gjx` to member in Memberstack
- `POST /event-data` — fetches event from `events_with_capacity` view by `event_slug` + member plan info from Memberstack in parallel. RSVPs (with embedded `member_profiles`: first_name, last_name, email, member_id) only fetched and returned if member has admin or facilitator plan. Returns `{ event, rsvps, current_capacity, member }`.
- `POST /member-rsvp-supabase` — handles RSVP booking, cancel, waiting-list for members. Writes `member` boolean to `event_rsvps`. Returns `{ message, success, alreadyBooked? }`. Guards: already booked (booked/waitlist) → `success: false, alreadyBooked: true`; prior cancellation → `success: false` (no re-booking allowed, must email info@thehouseofmore.com); event not found → `success: false`.
- `POST /memberstack-plan-sync` — Memberstack webhook receiver (`member.plan.added` / `member.plan.canceled` / `member.plan.updated`). Memberstack delivers via **Svix** — verifies `svix-id` + `svix-timestamp` + `svix-signature` headers using HMAC-SHA256 over `"${svixId}.${svixTimestamp}.${rawBody}"` with base64-decoded `MEMBERSTACK_WEBHOOK_SECRET`. Payload: `body.event`, `body.payload.member.id`. Fetches full member from Memberstack API (`/members/:id`) to get all `planConnections`. Finds active paid plan using `c.active === true` (not `payment.status` — that stays "PAID" even after cancellation). Sets `subscription_plan` to lowercased plan name, or `null` if no active paid plan. **Only writes `subscription_plan` — never touches `application_status`.** Skips unknown events with 200.
- `POST /admin-approve-member` — **Migrated from Make.com.** Receives `{ member_id, plan_id, action }`. Calls Memberstack `/add-plan`, then PATCHes `member_profiles.application_status` + `subscription_plan` in Supabase. Actions: `approve` → `approved`, `reject` → `rejected`, `freeze` → `frozen`, `unfreeze` → `approved`. Requires `MEMBERSTACK_KEY` + `SUPABASE_KEY`.
- `POST /admin-create-message` — Creates a new `admin_messages` record. Receives `{ member_id, subject, message, recipient }`. Verifies caller has admin plan via Memberstack. Inserts into `admin_messages`, returns `{ success: true, message: <inserted row> }`. Uses `Prefer: return=representation` to get the created record back.
- `POST /member-messages-supabase` — Fetches all `admin_messages` (ordered `date.desc`) + `member_messages` for this member in parallel. Merges per-message `read`/`erased` state (defaults false if no row exists). Returns `[{ id, subject, message, recipient, date, read, erased }]`.
- `POST /member-message-action-supabase` — Receives `{ member_id, message_id, action }` where action is `"read"` or `"erase"`. GETs existing `member_messages` row; PATCHes if found, POSTs new row if not. Sets `read: true` or `erased: true`.
- `POST /facilitator-checkin-supabase` — QR check-in for facilitators. Payload: `{ qr_text, event_slug }`. `qr_text` is the `event_rsvps.id` UUID encoded in the member's confirmation email QR. Looks up RSVP by UUID, validates `events.event_slug` matches payload (rejects cross-event QRs), guards already-checked and canceled states, patches `booking_status` → `"checked"`, fetches `member_profiles` for display name/email. Returns object `{ member_name, id, email, rsvp_record_id, booking_status: "checked" }` on success, or a plain string message on rejection.
- `POST /send-rsvp-email` — called by Supabase DB webhook on `event_rsvps` INSERT (booking confirmation) and UPDATE (cancellation). Fetches event + member from Supabase, sends HTML email via Resend. Skips non-members and non-booking statuses. `booking_status` values: `"booked"` (confirmed), `"waitlist"`, `"canceled"` — worker writes these, NOT `"booking"`/`"waiting-list"` (those are frontend-only terms).
- `POST /donation-checkout` — **Migrated from Make.com.** Creates Stripe Checkout Session (`mode: payment`, `submit_type: donate`). Payload: `{ amount (cents), memberId, email }`. Sets `customer_email`, `metadata[member_id]`. Returns `{ url }` → member is redirected to Stripe hosted checkout. Success redirects to `?donation=confirm`, cancel to `?donation=not-confirm`.
- `POST /stripe-webhook` — receives `checkout.session.completed` from Stripe. Verifies `Stripe-Signature` header (HMAC-SHA256 via Web Crypto, 5-min replay window). Fetches payment intent with `?expand[]=latest_charge` to get `receipt_url`. Inserts into `donations`: `{ member_id, amount, type: "one-time", receipt_url, transaction_id }`. Returns 500 on Supabase failure so Stripe retries.
- `POST /send-donation-receipt` — called by Supabase DB webhook on `donations` INSERT. Verifies `x-webhook-secret` header. Looks up `email` + `first_name` from `member_profiles` via `member_id`. Sends branded HTML receipt email via Resend. `from: onboarding@resend.dev` (pending domain verification).
- ~~`POST /webflow-event-sync`~~ — removed from Worker, replaced by Supabase Edge Function below

### Make.com routes (legacy — being phased out)
- `/member-profile-update`, `/member-list-events`, `/member-rsvp`, `/member-messages-load`, `/member-message-action`
- `/facilitator-list-events`, `/facilitator-close-event` (~~`/facilitator-checkin`~~ migrated to Supabase)
- `/admin-list-members`, `/admin-get-member`, `/admin-approve-member`, `/admin-list-rsvp`, `/admin-list-event`, `/admin-messages`, `/admin-message-center`
- ~~`/donation-checkout`~~ migrated to Worker (Stripe direct)
- ~~`/donation-confirm`~~ migrated to Worker (`/stripe-webhook`)
- `/donation-list-all`, `/donation-list-mine`
- `/list-events`, `/closed-event`, `/questionnaire-create-member`, `/home-review`

---

## Supabase
URL: `https://wioktwzioxzgmntgxsme.supabase.co`

### Tables & key columns
- `member_profiles` — id (uuid), member_id, email, first_name, last_name, phone, birthday, gender, marital_status, application_status, subscription_plan (text, nullable — paid plan name e.g. "sustainer"; null for free members), date_of_request, approved_date, location, created_at, updated_at
- `member_questionnaire` — id, member_id, where_are_you_on_your_path, how_can_we_support_you, how_did_you_hear_about_the_house_of_more, have_you_been_with_the_house_of_more, how_many_events_have_you_attended_at_the_hom, how_many_events_per_month_can_you_participate, what_draws_you_to_the_house_of_more, community_and_contribution, is_there_anything_else, do_you_feel_aligned_with_the_house_of_more, i_commit_to_respecting_the_house_of_more (bool), skills_to_share
- `event_rsvps` — id (uuid), member_id, event_id (text FK → events.id), booking_status, member (bool, default true — false for non-member bookings), rating, review, booked_at, cancel_at, created_at, updated_at
- `donations` — id (uuid), member_id (text, FK → member_profiles.member_id), amount (int, cents), type (text — "one-time" | "subscription"), receipt_url (text), transaction_id (text, unique — Stripe payment intent ID), recurrent_status (text, nullable), created_at (timestamptz). Note: no `email` or `status` columns — email is looked up from `member_profiles` when needed.
- `messages` — id, message_record_id, member_id, subject, body, read (bool), erased (bool), sent_by, sent_at
- `admin_messages` — id (uuid PK), subject (text), message (text), recipient (text — "members" | "facilitators" | "community"), date (timestamptz, default now()), created_at (timestamptz, default now())
- `member_messages` — id (uuid PK), admin_message_id (uuid FK → admin_messages.id, cascade delete), member_id (text — Memberstack ID), read (bool, default false), erased (bool, default false), created_at (timestamptz, default now())
- `events` — id (text PK = Webflow item ID), event_name, event_date, event_status, event_capacity (int), facilitator_name, facilitator_email, event_link, event_slug, event_location, event_category (text), event_gender (text), event_duration (numeric — decimal hours e.g. 0.5, 1, 2), event_video_link, created_at, updated_at
- `events_with_capacity` (view) — all events columns + event_current_capacity, booked_count, canceled_count, checked_count, waitlist_count (joins event_rsvps on event_rsvps.event_id = events.id). Formula: `event_current_capacity = event_capacity - booked_count - checked_count`

### Field constants (in worker)
- `PROFILE_FIELDS` — first_name, last_name, phone, birthday, gender, marital_status, location
- `QUESTIONNAIRE_FIELDS` — all 12 questionnaire columns including skills_to_share
- `PLAN_IDS` — plan ID constants: active, admin, facilitator, frozen, pending, rejected (see below)
- `parsePlanConnections(connections)` — shared helper, returns `[{ planId, planName, status, type }]`. Note: `status` is derived from `c.payment?.status || c.status` — unreliable for detecting cancellation (payment.status stays "PAID" after cancel). Use `c.active` boolean directly on raw planConnections when accuracy matters.

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

### Database Webhooks
- Table: `member_profiles` — Event: INSERT → `https://houseofmore.nico-97c.workers.dev/memberstack-add-plan` — Header: `x-webhook-secret: vxAc8CnaJnUA--JVA`
- Table: `donations` — Event: INSERT → `https://houseofmore.nico-97c.workers.dev/send-donation-receipt` — Header: `x-webhook-secret: vxAc8CnaJnUA--JVA` (`SUPABASE_WEBHOOK_SECRET`)

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

Note: Memberstack GET member returns `planConnections[].planId`, `type` (FREE/paid), and `active` (boolean — use this to detect truly active plans; `payment.status` stays "PAID" even after cancellation). `planName` may be empty — always check by `planId`.

### application_status values
`pending` → `active` → `rejected` / `frozen` / `admin` / `facilitator`
- Free plan lifecycle is stored in `application_status`
- Paid plan tier is stored in `subscription_plan` (separate field, null for free members)
- ⚠️ Naming mismatch: Memberstack plan is called "Active" but `STATUS_TO_PLAN_ID` maps `"approved"` → `pln_approved-member-bd2jv0hp1`. Both `"approved"` and `"active"` may appear in `application_status` — needs reconciliation.

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
  "rsvps": [{ "event_id": "69b9a60b...", "booking_status": "booked", "event_slug": "my-event-slug", ... }],
  "donations": [{ "amount": 5000, "type": "one-time", ... }]
}
```
Note: `rsvps` and `donations` return a skeleton object with null values when empty so field shape is always visible. Each RSVP includes `event_slug` (joined from `events` table) for My Events filtering.

---

## member-compiled-supabase.js — Current State

### Sections 1–5 (navigation, UI)
1. Tab navigation — `.app-button` / `.workspace-tab` shared class switching, sessionStorage force-clicks: `forceClickProfile`, `forceClickDonations`, `forceClickMyEvents`
2. Trigger my events after RSVP/cancel — `pageshow`: if `triggerMyEvents` set + `e.persisted` (bfcache), converts to `forceClickMyEvents` + reloads for fresh profile fetch; otherwise polls for `#my-events` button directly
3. Donation landing param — reads `?donation=` / `?forceRefetch=`, clears URL, switches tab
4. Count days — shows "Today / Tomorrow / In N days" on event cards
5. Calendar view — month grid, popover on hover, list/calendar toggle

### Section 6 — Member profile fetch + render + edit UI (Supabase)
- Reads `[data-ms-member="id"]` directly for member_id — Memberstack populates it synchronously at DOM load, no polling needed. Element must be present in the DOM (can be hidden).
- `POST /member-profile` → full merged object
- Module-level `let memberIsFacilitator = false` — set after profile fetch, shared with Section 8 (messages)
- `renderFields(data)` — flattens `questionnaire` into top-level, then:
  - Checkboxes: `input[type="checkbox"][name="key"]` → checks via `data-option` + `normalizeOption`
  - Radios: `input[type="radio"][name="key"]` → matched by value
  - Select: `.select-field[data-field="key"]` → case-insensitive match
  - Text/inputs: `[data-field="key"]` → `.value` or `.textContent`, adds `.filled`
  - Birthday: converted via `toDateInputValue` before setting
- View mode: all inputs/textareas/selects/wrappers get `.filled`; `.field-text` already has `.filled` by default in HTML (not touched on load)
- Edit mode (`#edit-form` click): strips `.filled` from all form elements and `.field-text`; email field kept `.filled` + `.locked` — members cannot change it
- Cancel: re-renders from cached `state.data`, restores view mode
- `updateFacilitatorMenu` — shows `.menu-wrapper.facilitator` if plan `planId === "pln_facilitator-9o1kw0j5o"`
- `updateCancelPlan` — shows `.cancel-plan` if `data.subscription_plan` is set (wired to Supabase, not Memberstack `plan_name` — Memberstack keeps canceled plans with `payment.status: "PAID"` which is unreliable)
- **Unread alert**: removes `.hide` from `.app-button.messages .alert` if `data.unread_messages_count > 0` — set on page load from profile response
- **Membership tier select** (`#membership-tier`): if `data.subscription_plan` exists, finds matching option by `value.startsWith(plan)` and selects it; otherwise selects first option (`value=""`)
- **Paid plan UI**: if `subscription_plan` exists → `#recurrent-donation` text set to "upgrade your plan", removes `.hide` from `#cancel-subscription` and `.current-plan` elements
- **Facilitator event cards**: clones `.event-template` once per event in `data.facilitator_events`, hides original, sets href to `/events-2026/{event_slug}`, populates `[data-field]` fields (event_name, event_slug, event_capacity, event_status, booked, checked, canceled, no-show, event_current_capacity) — RSVPs grouped from `data.facilitator_rsvps` by `event_id`
- `filterMyEvents(data)` — filters `.event-card-wrapper.my-event` cards by RSVP data:
  - Shows only booked and canceled RSVPs; hides non-RSVP cards
  - Matches cards by slug extracted from `.button.event-card` href vs `rsvp.event_slug`
  - Past events (date < today from `[data-event-time]`) hidden by default; toggled by `#past-events` / `#upcoming-events` buttons
  - Booked: appends `?booked=true` to card link href
  - Canceled: adds `.canceled` to wrapper, updates `.tag-booked` text, hides card link button
- `applyEventDateFilter(type)` — shows/hides cards with `.past-event` / `.upcoming-event` classes

### Section 7 — Profile form submit
- Collects all inputs/selects/textareas by `name`, radios (checked), checkboxes (grouped + joined with ` / `)
- `POST /member-profile-update-supabase`
- On 200: sets `forceClickProfile` sessionStorage, reloads page

### Section 9 — One-time donation checkout
- `#on-time-donation` click → reads `#donation-amount`, gets `memberId` + `email` from Memberstack
- `POST /donation-checkout` with `{ amount (cents), memberId, email }` → redirects to Stripe Checkout URL

### Section 10 — Donation history render
- Called as `renderDonations(data.donations || [])` from the Section 6 profile fetch
- Clones `.donation-template` (marks original `.hide`) for each donation record
- Populates via `[data-field]` selectors: `amount` (formatted USD), `created_at` (formatted date), `receipt_url` (sets `href` on `<a>` element; hides element if no URL)
- Updates `.impact-value` with total of all donations (cents → USD)

### Section 8 — Messages (Supabase)
- **Lazy load**: fetches on first `.app-button.messages` tab click, caches result — subsequent clicks use cache
- `POST /member-messages-supabase` → `[{ id, subject, message, recipient, date, read, erased }]`
- Clones `.message-template.admin` per message, hides original
  - Read messages: adds `.read`, removes `.new`; unread: `.new` stays (default on template)
  - Filters out erased messages; filters `recipient === "facilitators"` if `memberIsFacilitator` is false
  - Empty state: shows `.message-empty` if no visible messages
  - Auto-selects first clone, renders to reading panel, marks read
- Click row → `renderMessage(row)` (copies `[data-field]` innerHTML to matching `#id` in `.message-view`) + `POST /member-message-action-supabase` with `action: "read"`
- Erase → removes row from DOM + `POST /member-message-action-supabase` with `action: "erase"` + advances to next row or shows list
- `updateAlert()` — syncs `.app-button.messages .alert` visibility after each read/erase action
- Mobile: `showMessageView()` / `showMessageList()` toggle `.hide-mobile-landscape` on `.message-view` / `#messages-list`

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
- Stores `state.event_id = result.event?.id` for use in RSVP confirm
- Logs: `[EVENT] Supabase response:` + `[EVENT] current_capacity:`
- **Capacity tag** (`#capacity-tag`): "Sold Out" if ≤ 0, "Only N Left" if ≤ 5, hidden otherwise
- **Spots** (`#spots-available`): sets textContent to capacity
- **Privileged plan check** (`isPrivileged`): admin (`pln_admin-1823l09h8`) or facilitator (`pln_facilitator-9o1kw0j5o`) → removes `.hide` from all `.event-info-wrapper`, hides `#rsvp`
- **Attendants list**: only rendered for privileged members (worker gates the data). Clones `.attendants-row` template (appends to its `parentElement`) for each RSVP where status is booked/canceled/checked/no-show
  - Sorted: checked → booked → canceled → no-show
  - Renders: `first_name` (full name — first + last), `email`, `id` (RSVP uuid), `booking_status`, `member` (yes/no)
  - Shows `.check` element for `booking_status === "checked"`
- **Reviews list**: only rendered for privileged members. Clones `.review-container` template, appends to its `parentElement`, for each RSVP where `review` is not null
  - Renders: `first_name` (full name), `email`, `member_id`, `rating` (★ filled + ☆ empty = always 5 stars), `review`, `booking_status`
- **RSVP button state**: hides if admin/event-manager/privileged or capacity ≤ -5; sets text to Cancel/Waiting List/RSVP

### Section 4 — RSVP flow
- Modal open/close, confirm → `POST /member-rsvp-supabase` with `{ event_slug, member_id, status }`
- Non-member booking form → `POST /member-rsvp-supabase` with `member: false`
- `showAnswerModal(message, goBack, alertClass)` — shows `.modal-answer`, sets `.message-respond` text, resets then shows `.alert1/.alert2/.alert3` inside modal, adds `alertClass` to `.modal-content`
  - `alert1` — already booked (`success: false, alreadyBooked: true`)
  - `alert2` — error / prior cancellation / event not found (`success: false`)
  - `alert3` — booking/waitlist/cancel success (`success: true`)
- `answerShouldGoBack` flag — `true` only on `success: true`; close button calls `history.back()` + sets `triggerMyEvents` only when flag is true, otherwise just closes modal

### Section 5 — QR check-in scanner
- Camera-based QR scanner for facilitator check-in
- Depends on `https://unpkg.com/html5-qrcode` loaded via Webflow page embed before this script
- Fires `POST /facilitator-checkin-supabase` with `{ qr_text, event_slug }` — `event_slug` from `window.location.pathname`
- String response → rejected UI (`.reader` gets `.rejected`, `#answer` shows message)
- Object response → accepted UI (`.reader` gets `.accepted`, `#answer` shows `member_name`)
- On success: `updateAttendantRow(data)` finds the row via `data-rsvp-id` attribute (set at render time from `rsvp.id`), adds `.checked` to `.attenda-info-wrapper`, shows `.check` element, updates `[data-field="booking_status"]` text
- Each attendant row gets `data-rsvp-id` set to the RSVP UUID at render time (Section 3)

---

## admin-compiled-supabase.js — Current State

Base copy of `admin-compiled.js` — migration in progress. Deploy URL pattern:
`https://cdn.jsdelivr.net/gh/nico8a54/house-of-more-scripts@{commit}/admin-compiled-supabase.js`

### Migration status
| Section | Description | Status |
|---------|-------------|--------|
| 1 | Tab navigation + sessionStorage force-clicks | ✅ no external calls |
| 2 | Filter by status (Approved/Rejected/Frozen) | ✅ no external calls |
| 3 | Add `?admin=true` to event links | ✅ no external calls |
| 4 | Admin donation history (logged-in admin) | ⏳ Make.com `/donation-list-mine` |
| 5 | Message Center | ✅ Supabase via `/admin-data` + `/admin-create-message` |
| 6 | Event Manager — template clone render | ✅ Supabase via `/admin-data` |
| 7 | Main render: member list + donations | ⏳ Make.com `/admin-list-members`, `/admin-get-member`, `/admin-approve-member`, `/donation-list-all` |
| 8 | Admin onboarding walkthrough | ✅ no external calls |

### Section 5 — Message Center (Supabase)
- Messages fetched from `admin_messages` via `/admin-data` on page load, returned as `adminMessages` array ordered `date.desc`
- On load: clones `.message-template.admin` for each message, hides original, auto-selects first clone
- Empty state: shows `.message-empty` element if `adminMessages.length === 0`
- Click handler on `.message-template.admin` calls `renderMessage(row)` — copies each `[data-field]` innerHTML into matching `#id` element in `.message-view` panel
- `renderMessage` hoisted to module scope (shared with auto-select after clone render)
- **Send new message**: reads fields from `#message-form` via `FormData` (field names: `subject`, `recipient`, `message`), falls back to `#new-subject` / `#new-recipient` / `#new-message-text`; POSTs to `/admin-create-message`; on success clones + prepends new message, marks it active, calls `renderMessage`, resets form, returns to reading view — no page reload

### Section 6 — Event Manager (Supabase)
- Data comes from `/admin-data` POST (same call as Section 7, fired on page load)
- `/admin-data` returns `{ members, donations, rsvps, events }` — `events` and `rsvps` stored in shared `adminRsvps` / `adminEvents` module-level vars
- **Render approach**: clones `.event-template` (a link block) once per Supabase event, hides the original
- Each clone href set to `/events-2026/[event_slug]`
- RSVPs counted per `event_id` by status: `booked`, `checked`, `canceled`, `no-show`
- Fields populated via `[data-field="..."]` selectors on the clone:
  - `event_name` — `ev.event_name`
  - `event_slug` — `ev.event_slug`
  - `event_capacity` — `ev.event_capacity`
  - `event_status` — `ev.event_status`
  - `booked`, `checked`, `canceled`, `no-show` — counts from `rsvps`
- Falls back to `"--"` for any null/missing value
- Event manager button click (Section 6 legacy) still exists but is no longer auto-triggered on load

### Planned architecture (Supabase migration)
**Single `/admin-dashboard` worker route** — called once on page load, parallel fetches:
1. Memberstack API paginated member list → Members, Applicants, Facilitators tabs + Dashboard counters
2. Supabase `donations` → per-member totals + grand total
3. Supabase `events_with_capacity` → event list with capacity, checked, booked, canceled, waitlist, spots available, status

**`/admin-member-supabase` worker route** — called on modal open (view icon click):
- Supabase `member_profiles` + `member_questionnaire` by `member_id`
- Returns merged flat object for modal population

**Admin Event Manager columns** — Event Name, Slug, Capacity, Checked, Booked, Canceled, No-show, Status, View (link)

**Actions (approve/reject/freeze/restore)** — stay as-is via existing `/admin-approve-member` Make.com route

---

## Frontend Notes

- `data-lenis-prevent` — add this attribute to any scrollable container to allow native scrolling inside it when Lenis smooth scroll is active (e.g. modals, dropdowns, overflow lists)

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

---

## Resend Setup — Pending

Transactional email via Resend is built and tested. Remaining steps before going live:

- [ ] Verify domain `thehouseofmore.com` in Resend (resend.com/domains)
- [ ] Update Worker `from` address from `onboarding@resend.dev` to `bookings@thehouseofmore.com` (or preferred sender)
- [ ] Add DNS records Resend provides to the domain registrar
- [ ] Update Supabase webhook `rsvp-email-confirmation` to also trigger on `UPDATE` (currently INSERT only)
- [ ] Test confirmation email end-to-end with a real RSVP on live site (webhook fires, Resend delivers)
- [ ] Test cancellation email end-to-end
- Note: Supabase webhook `rsvp-email-confirmation` is configured — INSERT + UPDATE on `event_rsvps`, header `x-webhook-secret`
- [ ] Handle non-member booking email (currently skipped — Make.com flow still active)
- [ ] Update `from` address in `handleSendDonationReceipt` from `onboarding@resend.dev` to verified sender once domain is set up
- [x] Test donation receipt email end-to-end (Stripe checkout → Supabase INSERT → Resend delivers) — **confirmed working March 28 2026**
