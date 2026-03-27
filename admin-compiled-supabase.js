// Supabase-direct version of admin-compiled.js
// Migration status:
//   Section 1 — Tab Navigation       ✅ no external calls
//   Section 2 — Filter by Status     ✅ no external calls
//   Section 3 — Add ?admin=true      ✅ no external calls
//   Section 4 — Donation History     ⏳ Make.com /donation-list-mine
//   Section 5 — Message Center       ⏳ Make.com /admin-message-center
//   Section 6 — Event Manager        ⏳ Make.com /admin-list-rsvp + /admin-messages
//   Section 7 — Main Render          ⏳ Make.com /admin-list-members, /admin-get-member, /admin-approve-member, /donation-list-all
//   Section 8 — Onboarding           ✅ no external calls
(function () {
  "use strict";

  /*=========================================================
    SECTION 1 — TAB NAVIGATION
    src: admin-navigate-tabs.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".workspace-tab").forEach(tab => {
      tab.classList.add("hide");
    });

    const activeButton = document.querySelector(".app-button.active");
    if (activeButton) {
      const sharedClass = [...activeButton.classList].find(
        cls => cls !== "app-button" && cls !== "active"
      );
      if (sharedClass) {
        const activeTab = document.querySelector(`.workspace-tab.${sharedClass}`);
        if (activeTab) activeTab.classList.remove("hide");
      }
    }

    document.querySelectorAll(".app-button").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".app-button").forEach(btn => btn.classList.remove("active"));
        document.querySelectorAll(".workspace-tab").forEach(tab => tab.classList.add("hide"));
        button.classList.add("active");
        const cls = [...button.classList].find(c => c !== "app-button" && c !== "active");
        const tab = document.querySelector(`.workspace-tab.${cls}`);
        if (tab) tab.classList.remove("hide");
      });
    });

    const forceProfile = sessionStorage.getItem("forceClickProfile");
    if (forceProfile === "true") {
      const profileBtn = document.querySelector(".app-button.profile");
      if (profileBtn) setTimeout(() => profileBtn.click(), 0);
      sessionStorage.removeItem("forceClickProfile");
    }

    const forceMembers = sessionStorage.getItem("forceClickMembers");
    if (forceMembers === "true") {
      const membersBtn = document.querySelector(".app-button.members");
      if (membersBtn) setTimeout(() => membersBtn.click(), 0);
      sessionStorage.removeItem("forceClickMembers");
    }
  });

  /*=========================================================
    SECTION 2 — FILTER BY STATUS
    src: admin-filter-status.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".status-tag-filter .close-filter")
      .forEach(el => el.classList.add("hide"));
  });

  document.addEventListener("click", (e) => {
    const filterBtn = e.target.closest(".status-tag-filter");
    if (!filterBtn) return;
    const status = filterBtn.dataset.status;
    if (!status) return;
    const items = document.querySelectorAll(
      ".list-block-template.member[data-clone='true'], .list-block-template.applicant[data-clone='true']"
    );
    const allFilters = document.querySelectorAll(".status-tag-filter");
    const closeIcon = filterBtn.querySelector(".close-filter");
    const isActive = filterBtn.classList.contains("active");

    allFilters.forEach(btn => {
      btn.classList.remove("active");
      btn.querySelector(".close-filter")?.classList.add("hide");
      btn.querySelector(".check")?.classList.remove("hide");
    });

    if (isActive) {
      items.forEach(item => { item.style.display = "grid"; });
      return;
    }

    filterBtn.classList.add("active");
    closeIcon?.classList.remove("hide");
    filterBtn.querySelector(".check")?.classList.add("hide");
    items.forEach(item => {
      const statusTag = item.querySelector(".status-tag");
      const EXCLUDED = ["frozen", "admin", "rejected", "pending"];
      const matches = status === "approved"
        ? !EXCLUDED.some(cls => statusTag?.classList.contains(cls))
        : statusTag?.classList.contains(status);
      item.style.display = matches ? "grid" : "none";
    });
  });

  /*=========================================================
    SECTION 3 — ADD ?admin=true TO EVENT LINKS
    src: admin-parameter.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const eventLinks = document.querySelectorAll("[data-event-link]");
    if (!eventLinks.length) return;
    eventLinks.forEach(link => {
      const href = link.getAttribute("href");
      if (!href) return;
      try {
        const url = new URL(href, window.location.origin);
        url.searchParams.set("admin", "true");
        link.setAttribute("href", url.toString());
      } catch (err) {
        console.error("[ADMIN] Invalid URL in data-event-link:", href);
      }
    });
  });

  /*=========================================================
    SECTION 4 — MEMBER DONATION HISTORY (LOGGED-IN ADMIN)
    src: admin-fetch-donations.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const template = document.querySelector(".donation-template:not([data-donation-clone='true'])");
      if (!template) return;
      const container = template.parentElement;
      const memberIdEl = document.querySelector('[data-ms-member="id"]');
      if (!memberIdEl) return;
      const memberId = memberIdEl.textContent.trim();

      const response = await fetch("https://houseofmore.nico-97c.workers.dev/donation-list-mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId })
      });
      const records = await response.json();
      if (!Array.isArray(records) || records.length === 0) return;

      records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      template.style.display = "none";

      let totalImpact = 0;
      records.forEach(record => {
        if (!record?.data) return;
        const clone = template.cloneNode(true);
        clone.setAttribute("data-donation-clone", "true");
        clone.style.removeProperty("display");
        const amountEl = clone.querySelector(".donation-amount");
        const typeEl = clone.querySelector(".donation-type");
        const dateEl = clone.querySelector(".donated-at");
        const amount = (Number(record.data.amount) || 0) / 100;
        totalImpact += amount;
        if (amountEl) {
          amountEl.textContent = "$" + amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        }
        const type = record.data.type || "payment";
        if (typeEl) typeEl.textContent = type === "subscription" ? "Monthly" : "One-Time";
        if (dateEl) dateEl.textContent = new Date(record.createdAt).toLocaleDateString();
        container.appendChild(clone);
      });

      const impactEl = document.querySelector(".impact-value");
      if (impactEl) {
        impactEl.textContent = "$" + totalImpact.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    } catch (error) {
      console.error("[ADMIN] Donation history error:", error);
    }
  });

  /*=========================================================
    SECTION 5 — MESSAGE CENTER
    src: admin-create-message.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    if (sessionStorage.getItem("loadMessagesAfterReload") === "true") {
      sessionStorage.removeItem("loadMessagesAfterReload");
      setTimeout(() => {
        const btn = document.getElementById("load-messages");
        if (btn) btn.click();
      }, 200);
    }

    const MESSAGES_WEBHOOK = "https://houseofmore.nico-97c.workers.dev/admin-message-center";
    const newMessageBtn = document.getElementById("new-message");
    const sendMessageWrapper = document.getElementById("send-message-wrapper");
    const deleteMessageBtn = document.getElementById("delete-message");
    const sendBtn = document.getElementById("send-message");
    const readingBlock = document.getElementById("reading-message");
    const messageForm = document.getElementById("message-form");
    const newSubject = document.getElementById("new-subject");
    const newRecipient = document.getElementById("new-recipient");
    const newMessageText = document.getElementById("new-message-text");
    const messageView = document.querySelector(".message-view");
    const messageList = document.getElementById("messages-list");
    const backToListBtn = document.getElementById("back-to-list");

    if (readingBlock) readingBlock.classList.remove("hide");
    if (messageForm) messageForm.classList.add("hide");
    if (sendMessageWrapper) sendMessageWrapper.classList.add("hide");

    function renderMessage(row) {
      if (!row) return;
      row.querySelectorAll("[data-field]").forEach(field => {
        const key = field.getAttribute("data-field");
        if (!key) return;
        const target = document.getElementById(key);
        if (target) target.innerHTML = field.innerHTML;
      });
    }

    document.addEventListener("click", (e) => {
      const row = e.target.closest(".message-row");
      if (!row) return;
      document.querySelectorAll(".message-row").forEach(r => r.classList.remove("active"));
      row.classList.add("active");
      renderMessage(row);
      if (messageView) messageView.classList.remove("hide-mobile-landscape");
      if (messageList) messageList.classList.add("hide-mobile-landscape");
      if (newMessageBtn) newMessageBtn.classList.add("hide-mobile-landscape");
    });

    if (backToListBtn) {
      backToListBtn.addEventListener("click", () => {
        if (messageView) messageView.classList.add("hide-mobile-landscape");
        if (messageList) messageList.classList.remove("hide-mobile-landscape");
        if (newMessageBtn) newMessageBtn.classList.remove("hide-mobile-landscape");
      });
    }

    if (newMessageBtn) {
      newMessageBtn.addEventListener("click", () => {
        newMessageBtn.classList.add("disable");
        if (readingBlock) readingBlock.classList.add("hide");
        if (messageForm) messageForm.classList.remove("hide");
        if (sendMessageWrapper) sendMessageWrapper.classList.remove("hide");
        if (messageForm) messageForm.reset();
        if (messageView) messageView.classList.remove("hide-mobile-landscape");
        if (messageList) messageList.classList.add("hide-mobile-landscape");
        if (newMessageBtn) newMessageBtn.classList.add("hide-mobile-landscape");
      });
    }

    if (deleteMessageBtn) {
      deleteMessageBtn.addEventListener("click", () => {
        if (newMessageBtn) newMessageBtn.classList.remove("disable");
        if (readingBlock) readingBlock.classList.remove("hide");
        if (messageForm) messageForm.classList.add("hide");
        if (sendMessageWrapper) sendMessageWrapper.classList.add("hide");
        if (messageView) messageView.classList.add("hide-mobile-landscape");
        if (messageList) messageList.classList.remove("hide-mobile-landscape");
        if (newMessageBtn) newMessageBtn.classList.remove("hide-mobile-landscape");
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", async () => {
        const subject = newSubject?.value.trim() || "";
        const recipient = newRecipient?.value.trim() || "";
        const rawMessage = newMessageText?.value || "";
        const message = rawMessage.replace(/"/g, '\\"').replace(/\n/g, "<br>");
        if (!subject || !message || !recipient) {
          alert("Please fill subject, recipient, and message");
          return;
        }
        const payload = {
          data: {
            subject,
            message,
            date: new Date().toISOString(),
            to: recipient,
            message_id: ""
          }
        };
        console.log("[ADMIN] Sending message payload:", payload);
        try {
          const response = await fetch(MESSAGES_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          console.log("[ADMIN] Send message response:", await response.text());
          sessionStorage.setItem("loadMessagesAfterReload", "true");
          setTimeout(() => location.reload(), 2000);
        } catch (error) {
          console.error("[ADMIN] Send message error:", error);
        }
      });
    }

    const eraseBtn = document.getElementById("erase-message");
    if (eraseBtn) {
      eraseBtn.addEventListener("click", async () => {
        const message_id = document.getElementById("message-id")?.textContent.trim() || "";
        const payload = {
          data: { subject: "", message: "", date: "", to: "", message_id }
        };
        console.log("[ADMIN] Erase message payload:", payload);
        try {
          const response = await fetch(MESSAGES_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          console.log("[ADMIN] Erase response:", await response.text());
          sessionStorage.setItem("loadMessagesAfterReload", "true");
          setTimeout(() => location.reload(), 2000);
        } catch (error) {
          console.error("[ADMIN] Erase message error:", error);
        }
      });
    }

    const firstMessage = document.querySelector(".message-row");
    if (firstMessage) {
      firstMessage.classList.add("active");
      renderMessage(firstMessage);
    }
  });

  // Shared state: populated by load handler, consumed by event manager button
  let adminRsvps = [];
  let adminEvents = [];

  /*=========================================================
    SECTION 6 — EVENT MANAGER BUTTON
    src: admin-rsvps.js + admin-fetch-events-rsvps.js (merged)
    MIGRATED: now uses Supabase event_rsvps pre-fetched in /admin-data
  =========================================================*/
  document.addEventListener("click", (e) => {
    const button = e.target.closest(".app-button.event-manager");
    if (!button) return;
    if (button.dataset.loading === "true") return;
    button.dataset.loading = "true";
    console.log("[ADMIN] Event manager button clicked");

    try {
      // Group RSVPs by event_id from pre-fetched Supabase data
      const rsvpsByEvent = {};
      adminRsvps.forEach(rsvp => {
        const eid = rsvp.event_id;
        if (!eid) return;
        if (!rsvpsByEvent[eid]) rsvpsByEvent[eid] = { booked: 0, canceled: 0, checked: 0, "no-show": 0, attendees: [] };
        const s = rsvp.booking_status;
        if (s in rsvpsByEvent[eid]) rsvpsByEvent[eid][s]++;
        if (s === "booked") {
          const m = rsvp.member_profiles;
          if (m) rsvpsByEvent[eid].attendees.push(`${m.first_name || ""} ${m.last_name || ""}`.trim());
        }
      });

      // Populate each Webflow CMS event row
      document.querySelectorAll(".event-manager-item").forEach(item => {
        const eventId = item.querySelector(".event_record_id")?.textContent?.trim();
        if (!eventId) return;
        const counts = rsvpsByEvent[eventId] || { booked: 0, canceled: 0, attendees: [] };
        const bookedEl = item.querySelector('[data-field="booked"]');
        const canceledEl = item.querySelector('[data-field="canceled"]');
        if (bookedEl) bookedEl.textContent = counts.booked;
        if (canceledEl) canceledEl.textContent = counts.canceled;

        const viewLink = item.querySelector(".icon-wrapper.view-event");
        if (viewLink?.href) {
          const url = new URL(viewLink.href, window.location.origin);
          url.searchParams.set("source", "event-manager");
          url.searchParams.set("event_id", eventId);
          viewLink.href = url.toString();
        }

        const attendeesContainer = item.querySelector(".list-attendees");
        if (attendeesContainer) {
          attendeesContainer.innerHTML = "";
          counts.attendees.forEach(name => {
            const div = document.createElement("div");
            div.textContent = name;
            attendeesContainer.appendChild(div);
          });
        }
      });

      // Build event lookup for capacity + status
      const eventsById = {};
      adminEvents.forEach(ev => { if (ev.id) eventsById[ev.id] = ev; });

      // Populate facilitator event cards
      document.querySelectorAll(".facilitator-event").forEach(item => {
        const eventId = item.querySelector(".event-record-id")?.textContent?.trim();
        if (!eventId) return;
        const counts = rsvpsByEvent[eventId] || { booked: 0, canceled: 0, checked: 0, "no-show": 0 };
        const ev = eventsById[eventId] || {};
        ["booked", "canceled", "checked", "no-show"].forEach(status => {
          const el = item.querySelector(`[data-field="${status}"]`);
          if (el) el.textContent = counts[status] ?? 0;
        });
        const capacityEl = item.querySelector('[data-field="event_current_capacity"]');
        if (capacityEl) capacityEl.textContent = ev.event_capacity ?? "";
        const statusEl = item.querySelector('[data-field="event_status"]');
        if (statusEl) statusEl.textContent = ev.event_status ?? "";
      });

      console.log("[ADMIN] Event manager rendered from Supabase data", rsvpsByEvent);
    } catch (error) {
      console.error("[ADMIN] Event manager error:", error);
    } finally {
      button.dataset.loading = "false";
    }
  });

  /*=========================================================
    SECTION 7 — MAIN ADMIN RENDER + DONATIONS
    src: admin-initial-render.js + admin-donations.js
    FIX: sequenced so donations run after members are rendered
    FIX: removed pointless /donation-list-all ping
    FIX: sumDonationsAndUpdateMemberText runs after donations are populated
  =========================================================*/
  window.addEventListener("load", async () => {
    try {
      // --- CONFIG ---
      const ACTION_PLAN_MAP = {
        approve: "pln_approved-member-bd2jv0hp1",
        reject: "pln_rejected-fo1l60nm3",
        freeze: "pln_freeze-yy2kn0ejb",
        unfreeze: "pln_approved-member-bd2jv0hp1",
      };
      const STATUS_CLASS_MAP = {
        pending: "pending",
        active: "approved",
        frozen: "frozen",
        rejected: "rejected",
        approved: "approved",
        admin: "admin",
        facilitator: "facilitator",
      };
      const ALL_STATUS_CLASSES = Object.values(STATUS_CLASS_MAP);
      let activeMemberId = null;

      // --- HELPERS ---
      const setField = (root, field, value) => {
        const el = root.querySelector(`[data-field="${field}"]`);
        if (el) el.textContent = value ?? "";
      };
      const setInitials = (root, firstName, lastName) => {
        const el = root.querySelector(".initials");
        if (!el) return;
        el.textContent = `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase();
      };
      const applyStatusClass = (el, status) => {
        if (!el || !status) return;
        const normalized = String(status).trim().toLowerCase();
        el.classList.remove(...ALL_STATUS_CLASSES);
        if (STATUS_CLASS_MAP[normalized]) el.classList.add(STATUS_CLASS_MAP[normalized]);
      };
      const formatCurrency = (n) => {
        try {
          return new Intl.NumberFormat(undefined, {
            style: "currency", currency: "USD", maximumFractionDigits: 2
          }).format(n);
        } catch (e) {
          return `$${Number(n || 0).toFixed(2)}`;
        }
      };
      const parseDonationNumber = (raw) => {
        if (raw == null) return 0;
        const cleaned = String(raw).trim().replace(/[^\d.-]/g, "");
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : 0;
      };

      // --- BUTTON VISIBILITY ---
      const hideAllButtons = () => {
        ["#freeze", "#unfreeze", "#approve-applicant", "#reject-applicant"]
          .forEach(id => document.querySelector(id)?.classList.add("hide"));
      };
      const ACTIVE_PLAN_RE = /^(active|approved|neighbor|supporter|advocate|builder|sustainer|patron|partner|champion|visionary|facilitator)/i;
      const updateActionButtons = (status) => {
        hideAllButtons();
        const s = String(status).trim();
        if (/^pending$/i.test(s)) {
          document.querySelector("#approve-applicant")?.classList.remove("hide");
          document.querySelector("#reject-applicant")?.classList.remove("hide");
        } else if (ACTIVE_PLAN_RE.test(s)) {
          document.querySelector("#freeze")?.classList.remove("hide");
        } else if (/^frozen$/i.test(s)) {
          document.querySelector("#unfreeze")?.classList.remove("hide");
        } else if (/^rejected$/i.test(s)) {
          document.querySelector("#approve-applicant")?.classList.remove("hide");
        }
      };

      // --- ACTION WEBHOOK ---
      const sendAction = async (action) => {
        const planId = ACTION_PLAN_MAP[action];
        if (!activeMemberId || !planId) return;
        const email = document.querySelector('.applicant-modal [data-field="email"]')?.textContent?.trim() || null;
        try {
          const res = await fetch("https://houseofmore.nico-97c.workers.dev/admin-approve-member", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ member_id: activeMemberId, email, plan_id: planId, action })
          });
          if (res.ok) { sessionStorage.setItem("forceClickMembers", "true"); window.location.reload(); }
        } catch (err) {
          console.error("[ADMIN] Action webhook error:", err);
        }
      };
      ["approve", "reject", "freeze", "unfreeze"].forEach(action => {
        const id = action === "approve" ? "approve-applicant" : action === "reject" ? "reject-applicant" : action;
        document.querySelector(`#${id}`)?.addEventListener("click", () => sendAction(action));
      });

      // --- FETCH ALL DATA (members + donations) ---
      const memberId = document.querySelector('[data-ms-member="id"]')?.textContent?.trim();
      if (!memberId) { console.warn("[ADMIN] member_id not available yet"); return; }
      const adminDataRes = await fetch("https://houseofmore.nico-97c.workers.dev/admin-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId })
      });
      const adminData = await adminDataRes.json();
      console.log("[ADMIN] admin-data response:", adminData);
      if (adminData.error) { console.error("[ADMIN] admin-data error:", adminData.error); return; }

      const { members = [], donations = [], rsvps = [], events = [] } = adminData;
      adminRsvps = rsvps;
      adminEvents = events;
      console.log("[ADMIN] All events:", events);
      console.log("[ADMIN] All RSVPs:", rsvps);

      let activeCount = 0, facilitatorCount = 0, frozenCount = 0, pendingCount = 0, rejectedCount = 0, adminCount = 0;

      members.forEach(member => {
        const status = (member.application_status || "").toLowerCase();
        if (status === "admin")       { adminCount++;    return; }
        if (status === "pending")     { pendingCount++;  return; }
        if (status === "rejected")    { rejectedCount++; return; }
        if (status === "frozen")      { frozenCount++;   return; }
        if (status === "facilitator") { facilitatorCount++; activeCount++; return; }
        activeCount++; // approved + paid tiers
      });

      const grandTotalCents = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      // Per-member donation totals (keyed by member_id)
      const donationsByMember = {};
      donations.forEach(d => {
        if (!d.member_id) return;
        donationsByMember[d.member_id] = (donationsByMember[d.member_id] || 0) + (Number(d.amount) || 0);
      });
      const formatUSD = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

      const setCounter = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const setLastRowRadius = (parent) => {
        if (!parent) return;
        const rows = parent.querySelectorAll("[data-clone='true']");
        rows.forEach(r => r.style.borderRadius = "");
        if (rows.length) rows[rows.length - 1].style.borderRadius = "0 0 16px 16px";
      };
      setCounter("active-members",       activeCount);
      setCounter("facilitators",         facilitatorCount);
      setCounter("frozen-members",       frozenCount);
      setCounter("apllication-pendings", pendingCount);
      setCounter("rejected-applicants",  rejectedCount);
      setCounter("admin-members",        adminCount);
      setCounter("total-donations",      formatUSD(grandTotalCents / 100));

      if (pendingCount > 0) {
        document.querySelector(".app-button.applications .alert")?.classList.remove("hide");
      }

      console.log("[ADMIN] Counters:", { activeCount, facilitatorCount, frozenCount, pendingCount, rejectedCount, adminCount, grandTotal: formatUSD(grandTotalCents / 100) });

      const alertEl = document.getElementById("alert");
      const applicantModal = document.querySelector(".applicant-modal");
      document.getElementById("close-modal")?.addEventListener("click", () => applicantModal?.classList.add("hide"));

      const memberTemplate = document.querySelector(".list-block-template.member");
      const applicantTemplate = document.querySelector(".list-block-template.applicant");
      const facilitatorTemplate = document.querySelector(".list-block-template.facilitators");

      const populateModal = (member) => {
        activeMemberId = member.member_id;
        const q      = (member.member_questionnaire || [])[0] || {};
        const status = (member.application_status || "").toLowerCase();

        // --- Profile fields ---
        setField(applicantModal, "name",           member.first_name);
        setField(applicantModal, "last_name",      member.last_name);
        setField(applicantModal, "email",          member.email);
        setField(applicantModal, "phone",          member.phone);
        setField(applicantModal, "location",       member.location);
        setField(applicantModal, "marital_status", member.marital_status);
        setField(applicantModal, "birthday",       member.birthday);
        setField(applicantModal, "submitted_at",   member.date_of_request ? new Date(member.date_of_request).toLocaleDateString() : "");

        // gender uses data-ms-member, not data-field
        const genderEl = applicantModal.querySelector('[data-ms-member="gender"]');
        if (genderEl) genderEl.textContent = member.gender ?? "";

        // --- Questionnaire fields ---
        setField(applicantModal, "where_are_you_on_your_path",                   q.where_are_you_on_your_path);
        setField(applicantModal, "how_can_we_support_you",                       q.how_can_we_support_you);
        setField(applicantModal, "how_did_you_hear_about_the_house_of_more",     q.how_did_you_hear_about_the_house_of_more);
        setField(applicantModal, "have_you_been_with_the_house_of_more",         q.have_you_been_with_the_house_of_more);
        setField(applicantModal, "how_many_events_have_you_attended",            q.how_many_events_have_you_attended_at_the_hom);
        setField(applicantModal, "how_many_events_per_month_can_you_participate", q.how_many_events_per_month_can_you_participate);
        setField(applicantModal, "what_draws_you_to_the_house_of_more",          q.what_draws_you_to_the_house_of_more);
        setField(applicantModal, "community_and_contribution",                   q.community_and_contribution);
        setField(applicantModal, "skills_to_share",                              q.skills_to_share);
        setField(applicantModal, "is_there_anything_else",                       q.is_there_anything_else);
        setField(applicantModal, "do_you_feel_aligned_with_the_house_of_more",   q.do_you_feel_aligned_with_the_house_of_more);
        setField(applicantModal, "i_commit_to_respecting_the_house_of_more",     q.i_commit_to_respecting_the_house_of_more != null ? String(q.i_commit_to_respecting_the_house_of_more) : "");

        // --- Status tag ---
        applicantModal.querySelectorAll('.status-tag[data-extra-plan]').forEach(el => el.remove());
        const modalStatusTag = applicantModal.querySelector('[data-field="application_status"]');
        applyStatusClass(modalStatusTag, status);
        if (modalStatusTag) modalStatusTag.textContent = status;
        updateActionButtons(status);
      };

      const attachOpenModal = (clone, member) => {
        clone.querySelector(".icon-wrapper.view-record")?.addEventListener("click", () => {
          applicantModal?.classList.remove("hide");
          populateModal(member);
        });
      };

      // --- RENDER APPLICANTS (pending) ---
      if (applicantTemplate) applicantTemplate.style.display = "none";
      const applicantParent = applicantTemplate?.parentElement;

      members.forEach(member => {
        const status = (member.application_status || "").toLowerCase();
        if (status !== "pending") return;
        if (!applicantTemplate || !applicantParent) return;

        const clone = applicantTemplate.cloneNode(true);
        clone.setAttribute("data-clone", "true");
        clone.style.display = "grid";
        setField(clone, "first_name",         member.first_name);
        setField(clone, "last_name",          member.last_name);
        setField(clone, "email",              member.email);
        setField(clone, "phone",              member.phone);
        setField(clone, "createdAt",          member.date_of_request ? new Date(member.date_of_request).toLocaleDateString() : "");
        setField(clone, "member-id",          member.member_id);
        setField(clone, "application_status", "pending");
        setInitials(clone, member.first_name, member.last_name);
        applyStatusClass(clone.querySelector(".status-tag"), "pending");
        attachOpenModal(clone, member);
        applicantParent.appendChild(clone);
      });
      setLastRowRadius(applicantParent);

      // --- RENDER MEMBERS (approved, rejected, frozen) ---
      if (memberTemplate) memberTemplate.style.display = "none";
      const memberParent = memberTemplate?.parentElement;

      const MEMBER_STATUSES = new Set(["approved", "rejected", "frozen"]);

      members.forEach(member => {
        const status = (member.application_status || "").toLowerCase();
        if (!MEMBER_STATUSES.has(status)) return;
        if (!memberTemplate || !memberParent) return;

        const clone = memberTemplate.cloneNode(true);
        clone.setAttribute("data-clone", "true");
        clone.style.display = "grid";
        setField(clone, "first_name",         member.first_name);
        setField(clone, "last_name",          member.last_name);
        setField(clone, "email",              member.email);
        setField(clone, "phone",              member.phone);
        setField(clone, "createdAt",          member.date_of_request ? new Date(member.date_of_request).toLocaleDateString() : "");
        setField(clone, "member-id",          member.member_id);
        setField(clone, "application_status", status);
        const memberTotal = donationsByMember[member.member_id] || 0;
        setField(clone, "member-donations",   memberTotal > 0 ? formatUSD(memberTotal / 100) : "--");
        applyStatusClass(clone.querySelector(".status-tag"), status);
        attachOpenModal(clone, member);
        memberParent.appendChild(clone);
      });
      setLastRowRadius(memberParent);

      // --- RENDER FACILITATORS ---
      if (facilitatorTemplate) facilitatorTemplate.style.display = "none";
      const facilitatorParent = facilitatorTemplate?.parentElement;

      members.forEach(member => {
        const status = (member.application_status || "").toLowerCase();
        if (status !== "facilitator") return;
        if (!facilitatorTemplate || !facilitatorParent) return;

        const clone = facilitatorTemplate.cloneNode(true);
        clone.setAttribute("data-clone", "true");
        clone.style.display = "grid";
        setField(clone, "first_name",         member.first_name);
        setField(clone, "last_name",          member.last_name);
        setField(clone, "email",              member.email);
        setField(clone, "phone",              member.phone);
        setField(clone, "createdAt",          member.date_of_request ? new Date(member.date_of_request).toLocaleDateString() : "");
        setField(clone, "member-id",          member.member_id);
        setField(clone, "application_status", "facilitator");
        applyStatusClass(clone.querySelector(".status-tag"), "facilitator");
        attachOpenModal(clone, member);
        facilitatorParent.appendChild(clone);
      });
      setLastRowRadius(facilitatorParent);


    } catch (error) {
      console.error("[ADMIN] Main render error:", error);
    }
  });

  /*=========================================================
    SECTION 8 — ADMIN ONBOARDING WALKTHROUGH
    src: admin-onboarding.js
    (previously in Webflow Page Settings head/body custom code)
  =========================================================*/
  (function () {
    // Inject styles
    const style = document.createElement("style");
    style.textContent = `
      #hom-admin-onboarding { position: fixed; inset: 0; z-index: 9999; pointer-events: none; display: none; }
      #hom-admin-onboarding.active { pointer-events: all; }
      .hom-aob-backdrop { position: absolute; inset: 0; background: rgba(70,65,56,0.55); backdrop-filter: blur(2px); }
      .hom-aob-ring { position: fixed; border-radius: 16px; border: 2px solid #946a49; box-shadow: 0 0 0 4px rgba(148,106,73,0.25); pointer-events: none; transition: all 0.35s cubic-bezier(0.4,0,0.2,1); animation: hom-aob-pulse 2s ease-in-out infinite; display: none; z-index: 10000; }
      @keyframes hom-aob-pulse { 0%,100% { box-shadow: 0 0 0 4px rgba(148,106,73,0.25); } 50% { box-shadow: 0 0 0 8px rgba(148,106,73,0.1); } }
      .hom-aob-card { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); width: min(420px, calc(100vw - 48px)); background: #f3efe9; border-radius: 20px; padding: 28px 28px 24px; z-index: 10001; box-shadow: 0 24px 64px rgba(70,65,56,0.18), 0 4px 16px rgba(70,65,56,0.1); animation: hom-aob-slide-up 0.4s cubic-bezier(0.4,0,0.2,1); }
      @keyframes hom-aob-slide-up { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      .hom-aob-dots { display: flex; gap: 6px; margin-bottom: 20px; }
      .hom-aob-dot { width: 6px; height: 6px; border-radius: 50%; background: #d9dfd1; transition: all 0.3s ease; }
      .hom-aob-dot.active { width: 20px; border-radius: 3px; background: #946a49; }
      .hom-aob-emoji { font-size: 32px; margin-bottom: 12px; line-height: 1; }
      .hom-aob-title { font-family: var(--font--primary-family, serif); font-size: 20px; font-weight: 600; color: #464138; margin-bottom: 8px; line-height: 1.3; }
      .hom-aob-body { font-family: var(--font--secondary-family, sans-serif); font-size: 14px; color: #747f65; line-height: 1.6; margin-bottom: 24px; }
      .hom-aob-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .hom-aob-btn-skip { background: none; border: none; font-family: var(--font--secondary-family, sans-serif); font-size: 13px; color: #8f9a81; cursor: pointer; padding: 8px 0; text-transform: uppercase; letter-spacing: 0.05em; }
      .hom-aob-btn-skip:hover { color: #464138; }
      .hom-aob-btn-next { background: #946a49; border: 1px solid #946a49; color: white; font-family: var(--font--secondary-family, sans-serif); font-size: 13px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 28px; border-radius: 50vh; cursor: pointer; transition: background 0.2s ease; }
      .hom-aob-btn-next:hover { background: #7a5538; border-color: #7a5538; }
      @media (max-width: 480px) { .hom-aob-card { bottom: 24px; padding: 24px 20px 20px; } }
    `;
    document.head.appendChild(style);

    // Inject HTML
    const html = `
      <div id="hom-admin-onboarding">
        <div class="hom-aob-backdrop"></div>
        <div class="hom-aob-ring" id="hom-aob-ring"></div>
        <div class="hom-aob-card" id="hom-aob-card">
          <div class="hom-aob-dots" id="hom-aob-dots"></div>
          <div class="hom-aob-emoji" id="hom-aob-emoji"></div>
          <div class="hom-aob-title" id="hom-aob-title"></div>
          <div class="hom-aob-body" id="hom-aob-body"></div>
          <div class="hom-aob-actions">
            <button class="hom-aob-btn-skip" id="hom-aob-skip">Skip</button>
            <button class="hom-aob-btn-next" id="hom-aob-next">Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", html);

    const STEPS = [
      { emoji: "👋", title: "Welcome to the Admin Panel", body: "This is your command center. From here you manage members, events, messages, and everything that keeps House of More running.", target: null },
      { emoji: "📊", title: "Dashboard", body: "Your overview at a glance. See member counts, event activity, and donation totals in one place.", target: ".app-button.admin-dashboard" },
      { emoji: "📋", title: "Applicants", body: "Review incoming applications. Approve, reject, or flag members from their questionnaire submissions.", target: ".app-button.applications" },
      { emoji: "👥", title: "Members", body: "Your full member roster. Search, filter by status, and manage each member's profile and standing.", target: ".app-button.members" },
      { emoji: "🎭", title: "Facilitators", body: "See who is running your events. Facilitators get check-in access and event close permissions.", target: ".app-button.facilitators" },
      { emoji: "📅", title: "Event Manager", body: "View all events and their RSVP lists. Track attendance and close events after they happen.", target: ".app-button.event-manager" },
      { emoji: "📬", title: "Message Center", body: "Send announcements, personal notes, and updates directly to members. Messages appear in their portal inbox.", target: ".app-button.admin-messages" },
      { emoji: "✅", title: "You are ready!", body: "That covers the essentials. The House of More admin panel is yours to run.", target: null },
    ];

    const STORAGE_KEY_PREFIX = "hom_admin_onboarding_v1_";
    let currentStep = 0;
    let adminId = "";

    const overlay = document.getElementById("hom-admin-onboarding");
    const ring    = document.getElementById("hom-aob-ring");
    const dotsEl  = document.getElementById("hom-aob-dots");
    const emojiEl = document.getElementById("hom-aob-emoji");
    const titleEl = document.getElementById("hom-aob-title");
    const bodyEl  = document.getElementById("hom-aob-body");
    const nextBtn = document.getElementById("hom-aob-next");
    const skipBtn = document.getElementById("hom-aob-skip");

    function getStorageKey() {
      return STORAGE_KEY_PREFIX + (adminId || "admin");
    }

    function buildDots() {
      dotsEl.innerHTML = "";
      STEPS.forEach(function (_, i) {
        const dot = document.createElement("div");
        dot.className = "hom-aob-dot" + (i === currentStep ? " active" : "");
        dotsEl.appendChild(dot);
      });
    }

    function positionRing(selector) {
      if (!selector) { ring.style.display = "none"; return; }
      const el = document.querySelector(selector);
      if (!el) { ring.style.display = "none"; return; }
      const r = el.getBoundingClientRect();
      ring.style.display = "block";
      ring.style.top    = (r.top    - 6) + "px";
      ring.style.left   = (r.left   - 6) + "px";
      ring.style.width  = (r.width  + 12) + "px";
      ring.style.height = (r.height + 12) + "px";
    }

    function renderStep() {
      const step   = STEPS[currentStep];
      const isLast = currentStep === STEPS.length - 1;
      buildDots();
      emojiEl.textContent = step.emoji;
      titleEl.textContent = step.title;
      bodyEl.textContent  = step.body;
      nextBtn.textContent = isLast ? "Get Started" : "Next";
      skipBtn.style.visibility = isLast ? "hidden" : "visible";
      positionRing(step.target);
      if (step.target) {
        const tabBtn = document.querySelector(step.target);
        if (tabBtn) tabBtn.click();
      }
    }

    function markComplete() {
      localStorage.setItem(getStorageKey(), "true");
    }

    function closeOverlay() {
      overlay.classList.remove("active");
      overlay.style.display = "none";
      ring.style.display = "none";
      markComplete();
    }

    nextBtn.addEventListener("click", function () {
      if (currentStep < STEPS.length - 1) {
        currentStep++;
        renderStep();
      } else {
        closeOverlay();
      }
    });

    skipBtn.addEventListener("click", function () {
      closeOverlay();
    });

    window.addEventListener("resize", function () {
      if (overlay.style.display !== "none") {
        positionRing(STEPS[currentStep].target);
      }
    });

    function init() {
      adminId = (document.querySelector('[data-ms-member="id"]') || { textContent: "" }).textContent.trim();
      if (localStorage.getItem(getStorageKey())) return;
      currentStep = 0;
      renderStep();
      overlay.style.display = "block";
      overlay.classList.add("active");
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 2000); });
    } else {
      setTimeout(init, 2000);
    }
  })();

})();
