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
- `member-compiled.js` — current live member page JS
- `member-compiled-supabase.js` — new version being built (scratch, Supabase-based)
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

New route added this session:
- `POST /memberstack-add-plan` — called by Supabase Database Webhook on `member_profiles` INSERT → adds plan `pln_members-5kbh0gjx` to member in Memberstack

---

## Supabase
URL: `https://wioktwzioxzgmntgxsme.supabase.co`
Tables: `member_profiles`, `member_questionnaire`, `event_rsvps`, `donations`, `messages`, `events`

Database Webhook configured:
- Table: `member_profiles`
- Event: INSERT
- URL: `https://houseofmore.nico-97c.workers.dev/memberstack-add-plan`
- Header: `x-webhook-secret: vxAc8CnaJnUA--JVA`

Questionnaire flow (working):
- Webflow form → `POST /questionnaire-supabase` → Worker writes to `member_profiles` + `member_questionnaire` → Supabase webhook fires → Worker adds pending plan in Memberstack

---

## Memberstack
App ID: `app_cmiyx2vit00ld0ruubtoi3ih7`
Pending plan ID: `pln_members-5kbh0gjx`
Member ID format: `mem_...`

---

## member-compiled-supabase.js — Build Plan

### Section 1 — Tab navigation (done, keep as-is from member-compiled.js)
`.app-button.xxx` / `.workspace-tab.xxx` shared class system drives all tab switching.
- On load: hide all `.workspace-tab`, show the one matching `.app-button.active`
- Each `.app-button` click: switches active tab
- `.app-button.messages` click → lazy-loads messages
- `.app-button.facilitator-events` click → lazy-loads events
- Session storage `forceClickProfile` / `forceClickDonations` → auto-clicks tab on load
- URL param → programmatic click on `.app-button.donations`

### Section 2 — On load member data fetch (next)
On `DOMContentLoaded`, grab `member_id` from `[data-ms-member="id"]`, fire in parallel:
1. `window.$memberstackDom.getCurrentMember()` → log as `[MS]`
2. `POST /member-profile` with `{ member_id }` → log as `[PROFILE]`
Goal: console.log both to inspect full data shape before building render logic.

### Section 3+ — TBD based on what data returns
