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
      ".list-block-template.member, .list-block-template.applicant"
    );
    const allFilters = document.querySelectorAll(".status-tag-filter");
    const closeIcon = filterBtn.querySelector(".close-filter");
    const isActive = filterBtn.classList.contains("active");

    allFilters.forEach(btn => {
      btn.classList.remove("active");
      btn.querySelector(".close-filter")?.classList.add("hide");
    });

    if (isActive) {
      items.forEach(item => { item.style.display = "grid"; });
      return;
    }

    filterBtn.classList.add("active");
    closeIcon?.classList.remove("hide");
    items.forEach(item => {
      const statusTag = item.querySelector(".status-tag");
      item.style.display = statusTag?.classList.contains(status) ? "grid" : "none";
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
      const updateActionButtons = (status) => {
        hideAllButtons();
        const normalized = String(status).trim().toLowerCase();
        if (normalized === "pending") {
          document.querySelector("#approve-applicant")?.classList.remove("hide");
          document.querySelector("#reject-applicant")?.classList.remove("hide");
        } else if (normalized === "active" || normalized === "approved") {
          document.querySelector("#freeze")?.classList.remove("hide");
        } else if (normalized === "frozen") {
          document.querySelector("#unfreeze")?.classList.remove("hide");
        } else if (normalized === "rejected") {
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
          if (res.ok) window.location.reload();
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

      // --- FETCH ALL MEMBERS ---
      const response = await fetch("https://houseofmore.nico-97c.workers.dev/admin-list-members");
      const { data: members = [] } = await response.json();
      console.log("[ADMIN] Members loaded:", members.length);

      const alertEl = document.getElementById("alert");
      const applicantModal = document.querySelector(".applicant-modal");
      document.getElementById("close-modal")?.addEventListener("click", () => applicantModal?.classList.add("hide"));

      const memberTemplate = document.querySelector(".list-block-template.member");
      const applicantTemplate = document.querySelector(".list-block-template.applicant");
      const facilitatorTemplate = document.querySelector(".list-block-template.facilitators");

      let pendingCount = 0, approvedCount = 0, frozenCount = 0, rejectedCount = 0, facilitatorCount = 0;

      const attachOpenModal = (clone, memberId) => {
        clone.querySelector(".icon-wrapper.view-record")?.addEventListener("click", async () => {
          activeMemberId = memberId;
          applicantModal?.classList.remove("hide");
          const details = await fetchMemberDetails(memberId);
          if (!details) return;
          Object.entries(details).forEach(([key, value]) => {
            setField(applicantModal, key, value);
            if (key === "application_status") {
              const modalStatusTag = applicantModal.querySelector('[data-field="application_status"]');
              applyStatusClass(modalStatusTag, value);
              updateActionButtons(value);
            }
          });
        });
      };

      // --- RENDER MEMBERS + APPLICANTS ---
      members.forEach(member => {
        const planName = member.planConnections?.[0]?.planName;
        if (!planName) return;
        const normalizedPlan = planName.trim().toLowerCase();
        const isPending = normalizedPlan === "pending";
        if (normalizedPlan === "pending") pendingCount++;
        if (normalizedPlan === "active") approvedCount++;
        if (normalizedPlan === "frozen") frozenCount++;
        if (normalizedPlan === "rejected") rejectedCount++;
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
        attachOpenModal(clone, member.id);
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

})();
