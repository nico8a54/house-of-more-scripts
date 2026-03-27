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

  /*=========================================================
    SECTION 6 — EVENT MANAGER BUTTON
    src: admin-rsvps.js + admin-fetch-events-rsvps.js (merged)
    FIX: was two separate listeners on the same button — merged into one
  =========================================================*/
  document.addEventListener("click", async (e) => {
    const button = e.target.closest(".app-button.event-manager");
    if (!button) return;
    if (button.dataset.loading === "true") return;
    button.dataset.loading = "true";
    console.log("[ADMIN] Event manager button clicked");

    try {
      // --- 6A: fetch RSVP counts per event (/admin-list-rsvp) ---
      // src: admin-rsvps.js
      const rsvpRes = await fetch("https://houseofmore.nico-97c.workers.dev/admin-list-rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-all-records" })
      });
      if (rsvpRes.ok) {
        const rsvpJson = await rsvpRes.json();
        const records = rsvpJson.records;
        if (Array.isArray(records)) {
          console.log("[ADMIN] RSVP raw record sample:", records[0]);
          const grouped = {};
          records.forEach(record => {
            const data = record.data;
            if (!data) return;
            const event_id = data.event_record_id || data.event_id;
            const { event_name, status, member_name } = data;
            if (!event_id) return;
            if (!grouped[event_id]) {
              grouped[event_id] = { name: event_name, bookedCount: 0, canceledCount: 0, attendees: [] };
            }
            if (status === "booked") {
              grouped[event_id].bookedCount++;
              grouped[event_id].attendees.push(member_name);
            }
            if (status === "canceled") grouped[event_id].canceledCount++;
          });
          Object.entries(grouped).forEach(([eventId, info]) => {
            const eventElement = document.querySelector(`[data-field="${eventId}"]`);
            if (!eventElement) return;
            const bookedEl = eventElement.querySelector('[data-field="booked"]');
            const canceledEl = eventElement.querySelector('[data-field="canceled"]');
            if (bookedEl) bookedEl.textContent = info.bookedCount;
            if (canceledEl) canceledEl.textContent = info.canceledCount;
            const viewLink = eventElement.querySelector(".icon-wrapper.view-event");
            if (viewLink?.href) {
              const url = new URL(viewLink.href, window.location.origin);
              url.searchParams.set("source", "event-manager");
              url.searchParams.set("event_id", eventId);
              viewLink.href = url.toString();
            }
            const attendeesContainer = eventElement.querySelector(".list-attendees");
            if (attendeesContainer) {
              attendeesContainer.innerHTML = "";
              info.attendees.forEach(memberName => {
                const div = document.createElement("div");
                div.textContent = memberName;
                attendeesContainer.appendChild(div);
              });
            }
          });
          console.log("[ADMIN] RSVP grouped data:", grouped);
        }
      }

      // --- 6B: fetch event booking totals (/admin-messages) ---
      // src: admin-fetch-events-rsvps.js
      const eventsRes = await fetch("https://houseofmore.nico-97c.workers.dev/admin-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list-events" })
      });
      if (!eventsRes.ok) throw new Error(`Events fetch failed: ${eventsRes.status}`);
      const eventsJson = await eventsRes.json();
      if (!Array.isArray(eventsJson)) throw new Error("Events response is not an array");

      const groupedEvents = {};
      eventsJson.forEach(record => {
        const eventId = String(record?.data?.event_record_id || "").trim().toLowerCase();
        const status = String(record?.data?.status || "").trim().toLowerCase();
        if (!eventId) return;
        if (!groupedEvents[eventId]) groupedEvents[eventId] = { booked: 0, canceled: 0, total: 0 };
        if (status === "booked") groupedEvents[eventId].booked++;
        if (status === "canceled" || status === "cancelled") groupedEvents[eventId].canceled++;
        groupedEvents[eventId].total++;
      });

      document.querySelectorAll(".event-manager-item").forEach(item => {
        const eventId = String(item.querySelector(".event_record_id")?.textContent || "").trim().toLowerCase();
        if (!eventId) return;
        const counts = groupedEvents[eventId] || { booked: 0, canceled: 0, total: 0 };
        const bookedEl = item.querySelector(".booked-record");
        const canceledEl = item.querySelector(".canceled-record");
        const totalEl = item.querySelector(".total-record");
        if (bookedEl) bookedEl.textContent = counts.booked;
        if (canceledEl) canceledEl.textContent = counts.canceled;
        if (totalEl) totalEl.textContent = counts.total;
      });
      console.log("[ADMIN] Event RSVP totals:", groupedEvents);

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

      // --- FETCH MEMBER DETAILS ---
      const fetchMemberDetails = async (memberId) => {
        try {
          const res = await fetch("https://houseofmore.nico-97c.workers.dev/admin-get-member", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ member_id: memberId })
          });
          return await res.json();
        } catch (error) {
          console.error("[ADMIN] Member details error:", error);
          return null;
        }
      };

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

      const { members = [], donations = [] } = adminData;

      // Plan IDs — must match worker PLAN_IDS
      const PLAN = {
        active:      "pln_approved-member-bd2jv0hp1",
        admin:       "pln_admin-1823l09h8",
        facilitator: "pln_facilitator-9o1kw0j5o",
        frozen:      "pln_freeze-yy2kn0ejb",
        pending:     "pln_members-5kbh0gjx",
        rejected:    "pln_rejected-fo1l60nm3",
      };

      let activeCount = 0, facilitatorCount = 0, frozenCount = 0, pendingCount = 0, rejectedCount = 0;

      members.forEach(member => {
        const ids = (member.planConnections || []).map(c => c.planId || "");
        if (ids.includes(PLAN.admin))    return;
        if (ids.includes(PLAN.pending))  { pendingCount++;  return; }
        if (ids.includes(PLAN.rejected)) { rejectedCount++; return; }
        activeCount++;
        if (ids.includes(PLAN.frozen))      frozenCount++;
        if (ids.includes(PLAN.facilitator)) facilitatorCount++;
      });

      const grandTotalCents = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const formatUSD = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

      const setCounter = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setCounter("active-members",       activeCount);
      setCounter("facilitators",         facilitatorCount);
      setCounter("frozen-members",       frozenCount);
      setCounter("apllication-pendings", pendingCount);
      setCounter("rejected-applicants",  rejectedCount);
      setCounter("total-donations",      formatUSD(grandTotalCents / 100));

      console.log("[ADMIN] Counters:", { activeCount, facilitatorCount, frozenCount, pendingCount, rejectedCount, grandTotal: formatUSD(grandTotalCents / 100) });

      const alertEl = document.getElementById("alert");
      const applicantModal = document.querySelector(".applicant-modal");
      document.getElementById("close-modal")?.addEventListener("click", () => applicantModal?.classList.add("hide"));

      const memberTemplate = document.querySelector(".list-block-template.member");
      const applicantTemplate = document.querySelector(".list-block-template.applicant");
      const facilitatorTemplate = document.querySelector(".list-block-template.facilitators");

      let pendingCount = 0, approvedCount = 0, frozenCount = 0, rejectedCount = 0, facilitatorCount = 0;

      const attachOpenModal = (clone, memberId, effectivePlan, connections) => {
        clone.querySelector(".icon-wrapper.view-record")?.addEventListener("click", async () => {
          activeMemberId = memberId;
          applicantModal?.classList.remove("hide");
          const details = await fetchMemberDetails(memberId);
          if (!details) return;
          Object.entries(details).forEach(([key, value]) => {
            setField(applicantModal, key, value);
            if (key === "application_status") {
              const isFrozen = /^frozen$/i.test(String(effectivePlan).trim());
              const status = isFrozen ? effectivePlan : value;
              const modalStatusTag = applicantModal.querySelector('[data-field="application_status"]');

              // Remove any previously cloned status tags
              applicantModal.querySelectorAll('.status-tag[data-extra-plan]').forEach(el => el.remove());

              // If member has multiple distinct plans, clone the status tag for each
              const uniquePlans = [...new Set((connections || []).map(p => String(p.planName).trim()).filter(Boolean))];
              if (uniquePlans.length > 1 && modalStatusTag) {
                applyStatusClass(modalStatusTag, uniquePlans[0]);
                modalStatusTag.textContent = uniquePlans[0];
                uniquePlans.slice(1).forEach(plan => {
                  const extra = modalStatusTag.cloneNode(true);
                  extra.setAttribute("data-extra-plan", "true");
                  extra.removeAttribute("data-field");
                  applyStatusClass(extra, plan);
                  extra.textContent = plan;
                  modalStatusTag.parentElement.insertBefore(extra, modalStatusTag.nextSibling);
                });
              } else {
                applyStatusClass(modalStatusTag, status);
                if (modalStatusTag) modalStatusTag.textContent = status;
              }

              updateActionButtons(status);
            }
          });
        });
      };

      // --- RENDER MEMBERS + APPLICANTS ---
      members.forEach(member => {
        const connections = member.planConnections || [];
        const frozenConn = connections.find(p => /^frozen$/i.test(String(p.planName).trim()));
        const planName = (frozenConn || connections[0])?.planName;
        if (!planName) return;
        const normalizedPlan = planName.trim().toLowerCase();
        const isPending = normalizedPlan === "pending";
        if (normalizedPlan === "pending") pendingCount++;
        if (normalizedPlan === "frozen") frozenCount++;
        if (normalizedPlan === "rejected") rejectedCount++;
        const isExcluded = /^(frozen|admin|rejected|pending)$/i.test(normalizedPlan);
        if (!isExcluded) approvedCount++;
        const template = isPending ? applicantTemplate : memberTemplate;
        const parent = template?.parentElement;
        if (!template || !parent) return;
        const clone = template.cloneNode(true);
        clone.setAttribute("data-clone", "true");
        setField(clone, "first-name", member.customFields?.["first-name"]);
        setField(clone, "last-name", member.customFields?.["last-name"]);
        setField(clone, "email", member.auth?.email);
        setField(clone, "phone", member.customFields?.phone);
        setField(clone, "createdAt", new Date(member.createdAt).toLocaleDateString());
        setField(clone, "member-id", member.id);
        setField(clone, "application_status", planName);
        setInitials(clone, member.customFields?.["first-name"], member.customFields?.["last-name"]);
        applyStatusClass(clone.querySelector(".status-tag"), planName);
        attachOpenModal(clone, member.id, planName, connections);
        clone.style.display = "grid";
        parent.appendChild(clone);
      });

      // --- RENDER FACILITATORS ---
      members.forEach(member => {
        const facilitatorPlan = (member.planConnections || []).find(p =>
          String(p.planName).trim().toLowerCase() === "facilitator"
        );
        if (!facilitatorPlan) return;
        facilitatorCount++;
        const parent = facilitatorTemplate?.parentElement;
        if (!facilitatorTemplate || !parent) return;
        const clone = facilitatorTemplate.cloneNode(true);
        clone.setAttribute("data-clone", "true");
        setField(clone, "first-name", member.customFields?.["first-name"]);
        setField(clone, "last-name", member.customFields?.["last-name"]);
        setField(clone, "email", member.auth?.email);
        setField(clone, "phone", member.customFields?.phone);
        setField(clone, "createdAt", new Date(member.createdAt).toLocaleDateString());
        setField(clone, "member-id", member.id);
        setField(clone, "application_status", facilitatorPlan.planName);
        setInitials(clone, member.customFields?.["first-name"], member.customFields?.["last-name"]);
        applyStatusClass(clone.querySelector(".status-tag"), facilitatorPlan.planName);
        attachOpenModal(clone, member.id);
        clone.style.display = "grid";
        parent.appendChild(clone);
      });

      // --- COUNTERS + ALERT ---
      if (alertEl) alertEl.style.display = pendingCount > 0 ? "block" : "none";
      const el = (id) => document.getElementById(id);
      if (el("active-members")) el("active-members").textContent = approvedCount;
      if (el("apllication-pendings")) el("apllication-pendings").textContent = pendingCount;
      if (el("frozen-members")) el("frozen-members").textContent = frozenCount;
      if (el("rejected-applicants")) el("rejected-applicants").textContent = rejectedCount;
      if (el("facilitators")) el("facilitators").textContent = facilitatorCount;
      if (memberTemplate) memberTemplate.style.display = "none";
      if (applicantTemplate) applicantTemplate.style.display = "none";
      if (facilitatorTemplate) facilitatorTemplate.style.display = "none";

      // --- FETCH ALL DONATIONS (runs after members are rendered) ---
      // src: admin-donations.js
      const donRes = await fetch("https://houseofmore.nico-97c.workers.dev/donation-list-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" })
      });
      const donBody = await donRes.json();
      if (Array.isArray(donBody)) {
        const totalsByMember = {};
        let grandTotalCents = 0;
        donBody.forEach(item => {
          const memberId = item?.data?.member_id;
          const amountCents = Number(item?.data?.amount) || 0;
          if (!memberId) return;
          totalsByMember[memberId] = (totalsByMember[memberId] || 0) + amountCents;
          grandTotalCents += amountCents;
        });

        const formatUSD = (n) => new Intl.NumberFormat("en-US", {
          style: "currency", currency: "USD", maximumFractionDigits: 0
        }).format(n);

        document.querySelectorAll(".list-block-template.member").forEach(block => {
          const memberId = block.querySelector('[data-field="member-id"]')?.textContent.trim();
          if (!memberId) return;
          const totalCents = totalsByMember[memberId] || 0;
          const donationEl = block.querySelector('[data-field="member-donations"]');
          if (donationEl) donationEl.textContent = formatUSD(totalCents / 100);
        });

        const grandTotalEl = document.querySelector('[data-field="total-donations"]');
        if (grandTotalEl) grandTotalEl.textContent = formatUSD(grandTotalCents / 100);
        console.log("[ADMIN] Grand total donations:", formatUSD(grandTotalCents / 100));
      }

      // --- SUM DONATIONS PER MEMBER (runs after donations are populated) ---
      // FIX: moved here so it reads values already set by the donations fetch above
      const renderedMemberBlocks = Array.from(
        document.querySelectorAll('.list-block-template.member[data-clone="true"]')
      );
      const totalsByMemberId = {};
      renderedMemberBlocks.forEach(block => {
        const memberId = block.querySelector('[data-field="member-id"]')?.textContent?.trim() || "";
        if (!memberId) return;
        const donationRaw = block.querySelector('[data-field="member-donations"]')?.textContent;
        totalsByMemberId[memberId] = (totalsByMemberId[memberId] || 0) + parseDonationNumber(donationRaw);
      });
      renderedMemberBlocks.forEach(block => {
        const memberId = block.querySelector('[data-field="member-id"]')?.textContent?.trim() || "";
        if (!memberId) return;
        const total = totalsByMemberId[memberId] || 0;
        const donationsEl = block.querySelector('[data-field="member-donations"]');
        if (donationsEl) donationsEl.textContent = formatCurrency(total);
        const memberEl = block.querySelector('[data-field="member"]');
        if (memberEl) {
          const base = (memberEl.getAttribute("data-base-text") || memberEl.textContent || "").trim();
          if (!memberEl.getAttribute("data-base-text")) memberEl.setAttribute("data-base-text", base);
          memberEl.textContent = `${base} ${formatCurrency(total)}`;
        }
      });

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
