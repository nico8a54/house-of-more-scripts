# House of More — Platform Architecture
*Supabase version — as of March 2026*

---

## Overview

The House of More is a fully custom member management platform built on Webflow. It handles member applications, event booking, facilitator check-in, messaging, donations, and automated email communications. The backend is a Cloudflare Worker acting as the API layer between the Webflow frontend and Supabase (database), Memberstack (auth/plans), Stripe (payments), and Resend (email).

---

## Stack

| Layer | Service | Role |
|-------|---------|------|
| Frontend | Webflow | Pages, CMS, embed code |
| Auth | Memberstack | Login, plan gating, member ID |
| Database | Supabase (Postgres) | All persistent data |
| API | Cloudflare Worker | Proxy, logic, webhooks, cron |
| Email | Resend | Transactional emails |
| Payments | Stripe | Checkout, subscriptions |
| Automation | Make.com | Legacy — being phased out |

Worker URL: `https://houseofmore.nico-97c.workers.dev`
Supabase URL: `https://wioktwzioxzgmntgxsme.supabase.co`

---

## Architecture

```
Webflow (browser)
  │
  ├── Memberstack (auth — runs client-side, populates [data-ms-member])
  │
  └── Custom JS embeds → POST → Cloudflare Worker
                                      │
                          ┌───────────┼───────────────┐
                          │           │               │
                       Supabase   Memberstack       Resend
                      (Postgres)   (plans API)    (email)
                          │
                       Stripe
                    (via webhook)
```

**Webflow CMS → Supabase** (events sync):
```
Webflow CMS publish/unpublish/delete
  → Supabase Edge Function (webflow-event-sync)
  → events table
```

**Supabase → Worker** (DB webhooks):
```
member_profiles INSERT → /memberstack-add-plan → Memberstack (add pending plan)
member_profiles UPDATE → /supabase-member-sync → Memberstack (sync application_status)
donations INSERT        → /send-donation-receipt → Resend (receipt email)
event_rsvps INSERT/UPDATE → /send-rsvp-email → Resend (booking/cancellation email)
```

---

## Database Schema

### `member_profiles`
Core member record. One row per member.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| member_id | text | Memberstack ID (`mem_...`) |
| email | text | |
| first_name, last_name | text | |
| phone, birthday, gender, marital_status, location | text | |
| application_status | text | `pending` / `approved` / `rejected` / `frozen` / `admin` / `facilitator` |
| subscription_plan | text, nullable | Paid plan name e.g. `sustainer`, null for free members |
| date_of_request, approved_date | timestamptz | |
| created_at, updated_at | timestamptz | |

### `member_questionnaire`
One row per member. All 12 application questionnaire fields.

| Column | Type |
|--------|------|
| member_id | text (FK) |
| where_are_you_on_your_path | text |
| how_can_we_support_you | text |
| how_did_you_hear_about_the_house_of_more | text |
| have_you_been_with_the_house_of_more | text |
| how_many_events_have_you_attended_at_the_hom | text |
| how_many_events_per_month_can_you_participate | text |
| what_draws_you_to_the_house_of_more | text |
| community_and_contribution | text |
| is_there_anything_else | text |
| do_you_feel_aligned_with_the_house_of_more | text |
| i_commit_to_respecting_the_house_of_more | bool |
| skills_to_share | text |

### `events`
One row per event. Synced from Webflow CMS via Edge Function.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Webflow item ID |
| event_name, event_slug | text | |
| event_date | timestamptz | |
| event_status | text | `open` / `closed` |
| event_capacity | int | |
| event_location, event_link | text | |
| facilitator_name, facilitator_email | text | |
| event_category | text | Gathering / Workshop / Ceremonies & Retreats |
| event_gender | text | Male Only / Female Only / Male and Female / Couples |
| event_duration | numeric | Decimal hours e.g. 1.5 |
| event_video_link | text | |
| reminder_sent_at | timestamptz, null | Set when 24h reminder emails sent |
| reminder_2h_sent_at | timestamptz, null | Set when 2h reminder emails sent |
| no_show_processed_at | timestamptz, null | Set when post-event no-show job runs |
| review_request_sent_at | timestamptz, null | Set when 7-day review request emails sent |
| created_at, updated_at | timestamptz | |

### `events_with_capacity` (view)
All `events` columns plus:
- `event_current_capacity` = `event_capacity − booked_count − checked_count`
- `booked_count`, `canceled_count`, `checked_count`, `waitlist_count`

### `event_rsvps`
One row per member per event booking action.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Also used as QR code payload |
| member_id | text | Memberstack ID |
| event_id | text FK | → events.id |
| booking_status | text | `booked` / `waitlist` / `canceled` / `checked` / `no-show` |
| member | bool | false for non-member bookings |
| rating | text, null | Review star rating |
| review | text, null | Review message |
| booked_at, cancel_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### `donations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| member_id | text FK | → member_profiles.member_id |
| amount | int | Cents |
| type | text | `one-time` / `subscription` |
| receipt_url | text | Stripe receipt URL |
| transaction_id | text, unique | Stripe payment intent ID |
| recurrent_status | text, null | e.g. `paid` |
| created_at | timestamptz | |

### `admin_messages`
Broadcast messages sent by admin to member groups.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| subject | text | |
| message | text | |
| recipient | text | `members` / `facilitators` / `community` |
| date | timestamptz | |

### `member_messages`
Per-member read/erase state for each admin message.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| admin_message_id | uuid FK | → admin_messages.id (cascade delete) |
| member_id | text | Memberstack ID |
| read | bool | default false |
| erased | bool | default false |

---

## Memberstack Plans

Authentication and access gating is handled by Memberstack. Plans determine what a member can see and do.

### Free plans (application status)
| Plan name | Plan ID | application_status value |
|-----------|---------|--------------------------|
| Members (pending) | `pln_members-5kbh0gjx` | `pending` |
| Active | `pln_approved-member-bd2jv0hp1` | `approved` |
| Rejected | `pln_rejected-fo1l60nm3` | `rejected` |
| Freeze | `pln_freeze-yy2kn0ejb` | `frozen` |
| Admin | `pln_admin-1823l09h8` | `admin` |
| Facilitator | `pln_facilitator-9o1kw0j5o` | `facilitator` |

### Paid plans (subscription tiers)
Neighbor, Supporter, Advocate, Builder, Sustainer, Patron, Partner, Champion, Visionary.
Stored in `member_profiles.subscription_plan` (lowercase plan name). Managed via Stripe checkout.

**Important:** `planConnections[].payment.status` stays `"PAID"` even after cancellation. Always use `planConnections[].active === true` to detect a truly active paid plan.

---

## Worker API Routes

All routes are `POST`. CORS allowed for `thehouseofmore.com`, `www.thehouseofmore.com`, `localhost:5500`.

### Member

| Route | Payload | Action |
|-------|---------|--------|
| `/questionnaire-supabase` | form fields | Writes `member_profiles` + `member_questionnaire` on signup |
| `/member-profile` | `{ member_id }` | Returns full merged profile: profile + questionnaire + RSVPs + donations + plan connections + unread message count. Facilitators also get `facilitator_events` + `facilitator_rsvps`. |
| `/member-profile-update-supabase` | form fields | PATCHes `member_profiles` + UPSERTs `member_questionnaire` |

### Events & RSVP

| Route | Payload | Action |
|-------|---------|--------|
| `/event-data` | `{ event_slug, member_id }` | Returns event from `events_with_capacity` + member plan info. RSVPs only returned for admin/facilitator. |
| `/member-rsvp-supabase` | `{ event_slug, member_id, status }` | Handles booking / cancel / waitlist. Guards: already booked, prior cancellation. |
| `/facilitator-checkin-supabase` | `{ qr_text, event_slug }` | Validates QR (RSVP UUID), patches `booking_status → "checked"`, returns member info. |

### Admin

| Route | Payload | Action |
|-------|---------|--------|
| `/admin-data` | `{ member_id }` | Verifies admin plan, returns all members + donations |
| `/admin-approve-member` | `{ member_id, action }` | Actions: `approve` / `reject` / `freeze` / `unfreeze`. Writes `member_profiles` → DB webhook cascades to Memberstack. |
| `/admin-create-message` | `{ member_id, subject, message, recipient }` | Verifies admin plan, inserts `admin_messages` |

### Messages

| Route | Payload | Action |
|-------|---------|--------|
| `/member-messages-supabase` | `{ member_id }` | Returns all `admin_messages` merged with per-member read/erase state |
| `/member-message-action-supabase` | `{ member_id, message_id, action }` | action: `"read"` or `"erase"`. UPSERTs `member_messages`. |

### Reviews

| Route | Payload | Action |
|-------|---------|--------|
| `/review-data` | `{ profile_record_id, event_record_id }` | Fetches `first_name` from `member_profiles` by UUID + `event_name` from `event_rsvps` joined to `events`. Returns `{ member_name, event_name }`. |
| `/submit-review` | `{ event_record_id, member_email, rating, message }` | Verifies email matches RSVP owner. PATCHes `event_rsvps.rating` + `event_rsvps.review`. |

### Donations

| Route | Payload | Action |
|-------|---------|--------|
| `/donation-checkout` | `{ amount, memberId, email }` | Creates Stripe Checkout Session, returns `{ url }` |
| `/stripe-webhook` | Stripe event | Verifies signature, inserts `donations` on `checkout.session.completed` and `invoice.paid` |

### Webhooks (called by Supabase DB webhooks, not browser)

| Route | Trigger | Action |
|-------|---------|--------|
| `/memberstack-add-plan` | `member_profiles` INSERT | Adds pending plan to Memberstack |
| `/supabase-member-sync` | `member_profiles` UPDATE | Syncs `application_status` → Memberstack plan |
| `/memberstack-plan-sync` | Memberstack webhook | Syncs active paid plan → `subscription_plan` in Supabase |
| `/send-rsvp-email` | `event_rsvps` INSERT/UPDATE | Sends booking confirmation or cancellation email |
| `/send-donation-receipt` | `donations` INSERT | Sends receipt email via Resend |

---

## Automated Cron Jobs

Cloudflare Worker cron runs every hour (`0 * * * *`). Four jobs run in sequence. Each uses a flag column on `events` to ensure it runs exactly once per event — the flag is set immediately, even if there are zero RSVPs.

### 1. 24-hour reminder
- **Window:** `event_date` between `now+23h` and `now+25h`, `reminder_sent_at IS NULL`
- **Who:** all `booked` RSVPs
- **Email:** "See you tomorrow" — event name, date, time, location

### 2. 2-hour reminder
- **Window:** `event_date` between `now+1h` and `now+3h`, `reminder_2h_sent_at IS NULL`
- **Who:** all `booked` RSVPs
- **Email:** "It's almost time" — event name, time, location

### 3. No-show processing (24h after event)
- **Window:** `event_date` between `now−25h` and `now−23h`, `no_show_processed_at IS NULL`
- **Steps:**
  1. Set `events.event_status = "closed"`
  2. Patch all still-`booked` RSVPs → `booking_status = "no-show"`
  3. Patch those members → `application_status = "frozen"`, `subscription_plan = null`
  4. DB webhook on `member_profiles` UPDATE cascades freeze to Memberstack automatically

### 4. Review request (7 days after event)
- **Window:** `event_date` between `now−169h` and `now−167h`, `review_request_sent_at IS NULL`
- **Who:** all `booked` + `checked` RSVPs
- **Email:** "How was [event]?" with a CTA button linking to the member portal with pre-filled query params:
  `?profile_record_id={member_profiles.id}&event_record_id={event_rsvps.id}&member_email={email}`
- The review modal reads those params, loads names via `/review-data`, submits via `/submit-review`

---

## Key User Flows

### New member signup
1. Member fills Webflow questionnaire form
2. JS posts to `/questionnaire-supabase`
3. Worker writes `member_profiles` (status: `pending`) + `member_questionnaire`
4. Supabase DB webhook fires → Worker calls `/memberstack-add-plan` → adds pending plan in Memberstack
5. Admin sees member in dashboard, approves/rejects via `/admin-approve-member`
6. Worker patches `member_profiles` → DB webhook cascades to Memberstack

### Event booking
1. Member visits event page, JS calls `/event-data`
2. Member clicks RSVP → JS calls `/member-rsvp-supabase`
3. Worker checks capacity → inserts `event_rsvps` with `booking_status: "booked"` or `"waitlist"`
4. Supabase DB webhook fires → Worker sends confirmation email via Resend (QR code included)
5. Facilitator scans QR at door → `/facilitator-checkin-supabase` → `booking_status → "checked"`

### Post-event lifecycle (automated)
```
Event ends
  → +2h:  No-show processing — close event, freeze no-shows
  → +24h: (window passes — no-show processing already ran at +24h ±1h)
  → +7d:  Review request email sent to attended members
```
*Note: 24h reminder and 2h reminder fire before the event.*

### Cancellation
1. Member cancels in portal → `/member-rsvp-supabase` with `status: "cancel"`
2. Worker patches `booking_status → "canceled"`
3. Supabase DB webhook fires → cancellation email sent
4. Re-booking after cancel is blocked — member must email info@thehouseofmore.com

---

## Email Communications

All emails sent via Resend from `events@thehouseofmore.com`. Branded HTML templates, Eastern Time.

| Trigger | Subject | Recipients |
|---------|---------|-----------|
| RSVP confirmed | "You're registered — [event]" | Booked member |
| RSVP canceled | "Your cancellation is confirmed — [event]" | Member who canceled |
| 24h before event | "Reminder — [event] is tomorrow" | All booked |
| 2h before event | "Starting in 2 hours — [event]" | All booked |
| Donation received | "Your donation receipt — $X" | Donor |
| 7 days after event | "How was [event]? Share your experience" | Booked + checked |

---

## Frontend JS Files

| File | Status | Page |
|------|--------|------|
| `member-compiled-supabase.js` | Active (Supabase) | `/app/member` |
| `event-compiled-supabase.js` | Active (Supabase) | `/events-2026/*` |
| `questionnaire-compiled-supabase.js` | Active (Supabase) | Questionnaire page |
| `review-compiled-supabase.js` | Active (Supabase) | `/app/member` (review modal) |
| `admin-compiled-supabase.js` | In progress | `/app/admin` |
| `member-compiled.js` | Legacy (Make.com) | Replaced |
| `event-compiled.js` | Legacy (Make.com) | Replaced |
| `review-compiled.js` | Legacy (Make.com) | Replaced |
| `admin-compiled.js` | Legacy (Make.com) | Current live admin |

CDN pattern: `https://cdn.jsdelivr.net/gh/nico8a54/house-of-more-scripts@{commit}/{filename}`

---

## Repo & Deploy

- GitHub: `nico8a54/house-of-more-scripts` (branch: `main`)
- Local: `c:/GIT/House of More`
- Cloudflare Worker auto-deploys from GitHub on push to `main` (root: `/cloudflare-worker`)
- Supabase Edge Function (`webflow-event-sync`) deployed separately via Supabase CLI
