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

CORS allowed origins: `https://www.thehouseofmore.com`, `https://thehouseofmore.com`, `http://localhost:5500`, `http://127.0.0.1:5500`

### Supabase routes (direct — no Make.com)
- `POST /questionnaire-supabase` — writes to `member_profiles` + `member_questionnaire`
- `POST /member-profile` — fetches profile, questionnaire, rsvps, donations from Supabase + plan connections from Memberstack API in parallel. Returns one merged flat object. Always returns full questionnaire shape (null keys) and skeleton rsvp/donation objects when arrays are empty.
- `POST /member-profile-update-supabase` — updates `member_profiles` (PATCH) + `member_questionnaire` (UPSERT) from profile form payload. Splits fields using `PROFILE_FIELDS` and `QUESTIONNAIRE_FIELDS` constants.
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
- `member_profiles` — id (uuid), member_id, email, first_name, last_name, phone, birthday, gender, marital_status, application_status, date_of_request, approved_date, location
- `member_questionnaire` — id, member_id, where_are_you_on_your_path, how_can_we_support_you, how_did_you_hear_about_the_house_of_more, have_you_been_with_the_house_of_more, how_many_events_have_you_attended_at_the_hom, how_many_events_per_month_can_you_participate, what_draws_you_to_the_house_of_more, community_and_contribution, is_there_anything_else, do_you_feel_aligned_with_the_house_of_more, i_commit_to_respecting_the_house_of_more (bool), skills_to_share
- `event_rsvps` — id, event_record_id, member_id, rsvp_record_id, member_email, member_name, status, rating, review, booked_at, cancel_at
- `donations` — id, member_id, email, amount (int, cents), type, status, receipt_url, transaction_id, recurrent_status
- `messages` — id, message_record_id, member_id, subject, body, read (bool), erased (bool), sent_by, sent_at
- `events` — id, event_id, event_record_id, event_name, event_date, event_status, event_capacity, facilitator_name, facilitator_email, event_link, event_slug

### Field constants (in worker)
- `PROFILE_FIELDS` — first_name, last_name, phone, birthday, gender, marital_status, location
- `QUESTIONNAIRE_FIELDS` — all 12 questionnaire columns including skills_to_share

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
  "location": "...",
  "plan_name": [{ "planName": "Members", "status": "active" }],
  "questionnaire": { "where_are_you_on_your_path": "...", ... all 12 keys always present },
  "rsvps": [{ "event_record_id": "...", "status": "booked", ... }],
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
- Polls `[data-ms-member="id"]` for member_id (Memberstack async)
- `POST /member-profile` → full merged object
- `renderFields(data)` — flattens `questionnaire` into top-level, then:
  - Checkboxes: `input[type="checkbox"][name="key"]` → checks via `data-option` + `normalizeOption`
  - Radios: `input[type="radio"][name="key"]` → matched by value
  - Select: `.select-field[data-field="key"]` → case-insensitive match
  - Text/inputs: `[data-field="key"]` → `.value` or `.textContent`, adds `.filled`
  - Birthday: converted via `toDateInputValue` before setting
- View mode: all inputs/textareas/selects/wrappers get `.filled`; `.field-text` already has `.filled` by default in HTML (not touched on load)
- Edit mode (`#edit-form` click): strips `.filled` from all form elements and `.field-text`
- Cancel: re-renders from cached `state.data`, restores view mode
- `updateFacilitatorMenu` — shows `.menu-wrapper.facilitator` if plan includes "facilitator"
- `updateCancelPlan` — shows `.cancel-plan` if active pay plan exists
- `addMemberProfileToEventLinks` — appends `?member_profile=uuid` to `.button.event-card` hrefs

### Section 7 — Profile form submit
- Collects all inputs/selects/textareas by `name`, radios (checked), checkboxes (grouped + joined with ` / `)
- `POST /member-profile-update-supabase`
- On 200: sets `forceClickProfile` sessionStorage, reloads page

### Next
- Confirm profile field names in Webflow form match `PROFILE_FIELDS` keys (first_name, last_name, phone, birthday, gender, marital_status, location) — use Preserve Log in DevTools to inspect payload on submit
