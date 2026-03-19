/* ============================================================
   admin-compiled.js
   House of More — Admin page, all 9 embeds in one file
   Source: app/admin.html
   ============================================================ */


/* ============================================================
   EMBED 1 — Custom CSS injection
   ============================================================ */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    .input-text-field::placeholder { color: var(--brand-color--bc-2); }
    .filter-tag:has(input[type="checkbox"]:checked) {
      color: white;
      background-color: var(--brand-color--bc-5);
      border-radius: 200px;
    }
    .day-indicator { opacity: 0; transform: scale(0.8); }
    .day-cell.has-event .day-indicator { opacity: 1; transform: scale(1); }
    .select-field { border: 0px; }
    .select-field:focus { outline: none; }
    .field-text.filled.w-input { color: var(--brand-color--bc-2); }
    .radio-field:checked { color: red; }
    ::-webkit-scrollbar-track { background: transparent; }
    * { scrollbar-color: #888 transparent; }
    .select-field.filled {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-image: none;
    }
    .select-field-donate {
      background: transparent !important;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
})();


/* ============================================================
   EMBED 9 — Tab Navigation
   ============================================================ */
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


/* ============================================================
   EMBED 3 — Member Filter
   ============================================================ */
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
    const matches = statusTag?.classList.contains(status);
    item.style.display = matches ? "grid" : "none";
  });
});


/* ============================================================
   EMBED 7 — Event Links Admin Param
   ============================================================ */
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
      console.error("Invalid URL in data-event-link:", href);
    }
  });
});


/* ============================================================
   EMBED 6 — Member Donation History
   ============================================================ */
document.addEventListener("DOMContentLoaded", async function () {
  try {
    const template = document.querySelector(".donation-template:not([data-donation-clone='true'])");
    if (!template) return;
    const container = template.parentElement;
    const memberIdEl = document.querySelector("[data-ms-member='id']");
    if (!memberIdEl) return;
    const memberId = memberIdEl.textContent.trim();
    const response = await fetch("https://hook.us2.make.com/zpr4ws33ani1pcb0hq69kfrdhyi3aovx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId })
    });
    const records = await response.json();
    if (!Array.isArray(records) || records.length === 0) return;
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    template.style.display = "none";
    let totalImpact = 0;
    records.forEach((record) => {
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
    console.error("Error loading donations:", error);
  }
});


/* ============================================================
   EMBED 4 — Event Manager — Fetch RSVP on button click
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  const button = document.querySelector(".app-button.event-manager");
  if (!button) return;
  button.addEventListener("click", async function () {
    try {
      const response = await fetch("https://hook.us2.make.com/4ccux957qcdn2n1ocwsxw7uwca6558f9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-all-records" })
      });
      const text = await response.text();
      const json = JSON.parse(text);
      const records = json.records;
      if (!records || !Array.isArray(records)) return;
      const grouped = {};
      records.forEach(record => {
        const data = record.data;
        if (!data) return;
        const { event_id, event_name, status, member_name } = data;
        if (!grouped[event_id]) {
          grouped[event_id] = { name: event_name, bookedCount: 0, canceledCount: 0, attendees: [] };
        }
        if (status === "booked") {
          grouped[event_id].bookedCount += 1;
          grouped[event_id].attendees.push(member_name);
        }
        if (status === "canceled") grouped[event_id].canceledCount += 1;
      });
      Object.entries(grouped).forEach(([eventId, info]) => {
        const eventElement = document.querySelector(`[data-field="${eventId}"]`);
        if (!eventElement) return;
        const bookedElement = eventElement.querySelector(`[data-field="booked"]`);
        if (bookedElement) bookedElement.textContent = info.bookedCount;
        const canceledElement = eventElement.querySelector(`[data-field="canceled"]`);
        if (canceledElement) canceledElement.textContent = info.canceledCount;
        const viewLink = eventElement.querySelector(".icon-wrapper.view-event");
        if (viewLink && viewLink.href) {
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
    } catch (error) {
      console.error("Fetch error:", error);
    }
  });
});


/* ============================================================
   EMBED 8 — Message Center
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const WEBHOOK_URL = "https://hook.us2.make.com/ax5qvxznklrbrechyt1gdy7r1jner5zp";

  if (sessionStorage.getItem("loadMessagesAfterReload") === "true") {
    sessionStorage.removeItem("loadMessagesAfterReload");
    setTimeout(() => {
      const btn = document.getElementById("load-messages");
      if (btn) btn.click();
    }, 200);
  }

  const newMessageBtn     = document.getElementById("new-message");
  const sendMessageWrapper = document.getElementById("send-message-wrapper");
  const deleteMessageBtn  = document.getElementById("delete-message");
  const sendBtn           = document.getElementById("send-message");
  const readingBlock      = document.getElementById("reading-message");
  const messageForm       = document.getElementById("message-form");
  const newSubject        = document.getElementById("new-subject");
  const newRecipient      = document.getElementById("new-recipient");
  const newMessageText    = document.getElementById("new-message-text");
  const messageView       = document.querySelector(".message-view");
  const messageList       = document.getElementById("messages-list");
  const backToListBtn     = document.getElementById("back-to-list");

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
      const subject   = newSubject ? newSubject.value.trim() : "";
      const recipient = newRecipient ? newRecipient.value.trim() : "";
      const rawMessage = newMessageText ? newMessageText.value : "";
      const messageIdEl = document.getElementById("message-id");
      const message_id  = messageIdEl ? messageIdEl.textContent.trim() : "";
      const message = rawMessage.replace(/"/g, '\\"').replace(/\n/g, "<br>");
      if (!subject || !message || !recipient) {
        alert("Please fill subject, recipient, and message");
        return;
      }
      const payload = { data: { subject, message, date: new Date().toISOString(), to: recipient, message_id: "" } };
      console.log("SENDING PAYLOAD:", payload);
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.text();
        console.log("Webhook response:", result);
        sessionStorage.setItem("loadMessagesAfterReload", "true");
        setTimeout(() => location.reload(), 2000);
      } catch (error) {
        console.error("Webhook error:", error);
      }
    });
  }

  const eraseBtn = document.getElementById("erase-message");
  if (eraseBtn) {
    eraseBtn.addEventListener("click", async () => {
      const messageIdEl = document.getElementById("message-id");
      const message_id  = messageIdEl ? messageIdEl.textContent.trim() : "";
      const payload = { data: { subject: "", message: "", date: "", to: "", message_id } };
      console.log("ERASE PAYLOAD:", payload);
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.text();
        console.log("Erase response:", result);
        sessionStorage.setItem("loadMessagesAfterReload", "true");
        sessionStorage.setItem("reopenMessageId", message_id);
        setTimeout(() => location.reload(), 2000);
      } catch (error) {
        console.error("Erase webhook error:", error);
      }
    });
  }

  const firstMessage = document.querySelector(".message-row");
  if (firstMessage) {
    firstMessage.classList.add("active");
    renderMessage(firstMessage);
  }
});


/* ============================================================
   EMBED 2 — Main Dashboard (members, applicants, facilitators)
   ============================================================ */
window.addEventListener("load", async () => {
  try {
    const ACTION_PLAN_MAP = {
      approve:  "pln_approved-member-bd2jv0hp1",
      reject:   "pln_rejected-fo1l60nm3",
      freeze:   "pln_freeze-yy2kn0ejb",
      unfreeze: "pln_approved-member-bd2jv0hp1",
    };
    const STATUS_CLASS_MAP = {
      pending:     "pending",
      active:      "approved",
      frozen:      "frozen",
      rejected:    "rejected",
      approved:    "approved",
      admin:       "admin",
      facilitator: "facilitator",
    };
    const ALL_STATUS_CLASSES = Object.values(STATUS_CLASS_MAP);
    let activeMemberId = null;

    fetch("https://hook.us2.make.com/3kb2m1jg7k23klrycyhl1qq75f3i5ht8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_load", page: window.location.href, ts: new Date().toISOString() }),
    })
      .then(async (res) => {
        const ct = res.headers.get("content-type") || "";
        let body;
        try { body = ct.includes("application/json") ? await res.json() : await res.text(); }
        catch (e) { body = "(failed to read body)"; }
        console.log("Page load webhook:", { ok: res.ok, status: res.status, statusText: res.statusText, body });
      })
      .catch((err) => console.error("Page load webhook error:", err));

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
    const parseDonationNumber = (raw) => {
      if (raw == null) return 0;
      const str = String(raw).trim();
      if (!str) return 0;
      const cleaned = str.replace(/[^\d.-]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    };
    const formatCurrency = (n) => {
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
      } catch (e) {
        return `$${Number(n || 0).toFixed(2)}`;
      }
    };
    const sumDonationsAndUpdateMemberText = () => {
      const renderedMemberBlocks = Array.from(
        document.querySelectorAll('.list-block-template.member[data-clone="true"]')
      );
      const totalsByMemberId = {};
      renderedMemberBlocks.forEach((block) => {
        const memberId = block.querySelector('[data-field="member-id"]')?.textContent?.trim() || "";
        if (!memberId) return;
        const donation = parseDonationNumber(block.querySelector('[data-field="member-donations"]')?.textContent);
        totalsByMemberId[memberId] = (totalsByMemberId[memberId] || 0) + donation;
      });
      renderedMemberBlocks.forEach((block) => {
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
    };

    const ACTIVE_EQUIVALENT_PLANS = new Set([
      "active", "approved",
      "neighbor", "neighbor_18",
      "supporter", "supporter_36",
      "advocate", "advocate_54",
      "builder", "builder_100",
      "sustainer", "sustainer_180",
      "patron", "patron_360",
      "partner", "partner_540",
      "champion", "champion_1000",
      "visionary", "visionary_1800",
      "facilitator",
    ]);
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
      } else if (ACTIVE_EQUIVALENT_PLANS.has(normalized)) {
        document.querySelector("#freeze")?.classList.remove("hide");
      } else if (normalized === "frozen") {
        document.querySelector("#unfreeze")?.classList.remove("hide");
      } else if (normalized === "rejected") {
        document.querySelector("#approve-applicant")?.classList.remove("hide");
      }
    };

    const sendAction = async (action) => {
      const planId = ACTION_PLAN_MAP[action];
      if (!activeMemberId || !planId) return;
      const email = document.querySelector('.applicant-modal [data-field="email"]')?.textContent?.trim() || null;
      try {
        const res = await fetch("https://hook.us2.make.com/u2lzpknloicl3wbo1ftkixyrg9t7msia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: activeMemberId, email, plan_id: planId, action }),
        });
        if (res.ok) window.location.reload();
      } catch (err) {
        console.error("Action webhook error:", err);
      }
    };
    ["approve", "reject", "freeze", "unfreeze"].forEach(action => {
      document.querySelector(
        `#${action === "approve" ? "approve-applicant" : action === "reject" ? "reject-applicant" : action}`
      )?.addEventListener("click", () => sendAction(action));
    });

    const fetchMemberDetails = async (memberId) => {
      try {
        const res = await fetch("https://hook.us2.make.com/uaabv0g63cd26gcmrk8d2konymutrkc5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId }),
        });
        return JSON.parse(await res.text());
      } catch (error) {
        console.error("Member details webhook error:", error);
        return null;
      }
    };

    const response = await fetch("https://hook.us2.make.com/bljtvfbfs1otu3mmxj3cn4042cmwrnux");
    const { data: members = [] } = await response.json();

    const alertEl           = document.getElementById("alert");
    const applicantModal    = document.querySelector(".applicant-modal");
    document.getElementById("close-modal")
      ?.addEventListener("click", () => applicantModal?.classList.add("hide"));

    const memberTemplate      = document.querySelector(".list-block-template.member");
    const applicantTemplate   = document.querySelector(".list-block-template.applicant");
    const facilitatorTemplate = document.querySelector(".list-block-template.facilitators");

    let pendingCount = 0, approvedCount = 0, frozenCount = 0, rejectedCount = 0, facilitatorCount = 0;

    const attachOpenModal = (clone, memberId) => {
      clone.querySelector(".icon-wrapper.view-record")
        ?.addEventListener("click", async () => {
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

    members.forEach(member => {
      const planName = member.planConnections?.[0]?.planName;
      if (!planName) return;
      const normalizedPlan = planName.trim().toLowerCase();
      const isPending = normalizedPlan === "pending";
      if (normalizedPlan === "pending")   pendingCount++;
      if (normalizedPlan === "active")    approvedCount++;
      if (normalizedPlan === "frozen")    frozenCount++;
      if (normalizedPlan === "rejected")  rejectedCount++;
      const template = isPending ? applicantTemplate : memberTemplate;
      const parent   = template?.parentElement;
      if (!template || !parent) return;
      const clone = template.cloneNode(true);
      clone.setAttribute("data-clone", "true");
      setField(clone, "first-name", member.customFields?.["first-name"]);
      setField(clone, "last-name",  member.customFields?.["last-name"]);
      setField(clone, "email",      member.auth?.email);
      setField(clone, "phone",      member.customFields?.phone);
      setField(clone, "createdAt",  new Date(member.createdAt).toLocaleDateString());
      setField(clone, "member-id",  member.id);
      setField(clone, "application_status", planName);
      setInitials(clone, member.customFields?.["first-name"], member.customFields?.["last-name"]);
      applyStatusClass(clone.querySelector(".status-tag"), planName);
      attachOpenModal(clone, member.id);
      clone.style.display = "grid";
      parent.appendChild(clone);
    });

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
      setField(clone, "last-name",  member.customFields?.["last-name"]);
      setField(clone, "email",      member.auth?.email);
      setField(clone, "phone",      member.customFields?.phone);
      setField(clone, "createdAt",  new Date(member.createdAt).toLocaleDateString());
      setField(clone, "member-id",  member.id);
      setField(clone, "application_status", facilitatorPlan.planName);
      setInitials(clone, member.customFields?.["first-name"], member.customFields?.["last-name"]);
      applyStatusClass(clone.querySelector(".status-tag"), facilitatorPlan.planName);
      attachOpenModal(clone, member.id);
      clone.style.display = "grid";
      parent.appendChild(clone);
    });

    sumDonationsAndUpdateMemberText();

    if (alertEl) alertEl.style.display = pendingCount > 0 ? "block" : "none";
    document.getElementById("active-members").textContent        = approvedCount;
    document.getElementById("apllication-pendings").textContent  = pendingCount;
    document.getElementById("frozen-members").textContent        = frozenCount;
    document.getElementById("rejected-applicants").textContent   = rejectedCount;
    document.getElementById("facilitators").textContent          = facilitatorCount;

    if (memberTemplate)      memberTemplate.style.display      = "none";
    if (applicantTemplate)   applicantTemplate.style.display   = "none";
    if (facilitatorTemplate) facilitatorTemplate.style.display = "none";

  } catch (error) {
    console.error("Fetch error:", error);
  }
});


/* ============================================================
   EMBED 5 — Donations Counter
   ============================================================ */
window.addEventListener("load", async () => {
  try {
    const res = await fetch("https://hook.us2.make.com/3kb2m1jg7k23klrycyhl1qq75f3i5ht8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_load_console_only", page: window.location.href, ts: new Date().toISOString() }),
    });
    const body = await res.json();
    if (!Array.isArray(body)) return;
    const totalsByMember = {};
    let grandTotalCents = 0;
    body.forEach(item => {
      const memberId    = item?.data?.member_id;
      const amountCents = Number(item?.data?.amount) || 0;
      if (!memberId) return;
      totalsByMember[memberId] = (totalsByMember[memberId] || 0) + amountCents;
      grandTotalCents += amountCents;
    });
    const formatUSD = (n) => new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 0
    }).format(n);
    document.querySelectorAll(".list-block-template.member").forEach(block => {
      const memberIdEl = block.querySelector('[data-field="member-id"]');
      if (!memberIdEl) return;
      const memberId   = memberIdEl.textContent.trim();
      const totalCents = totalsByMember[memberId] || 0;
      const donationEl = block.querySelector('[data-field="member-donations"]');
      if (donationEl) donationEl.textContent = formatUSD(totalCents / 100);
    });
    const grandTotalFormatted = formatUSD(grandTotalCents / 100);
    const totalEl = document.querySelector('[data-field="total-donations"]');
    if (totalEl) totalEl.textContent = grandTotalFormatted;
    console.log("Donations by member:");
    Object.entries(totalsByMember).forEach(([memberId, cents]) => {
      console.log(`${memberId}: ${formatUSD(cents / 100)}`);
    });
    console.log("Grand total:", grandTotalFormatted);
  } catch (error) {
    console.error("Donation script error:", error);
  }
});


/* ============================================================
   EMBED 4b — Event Manager click handler (latest version)
   ============================================================ */
document.addEventListener("click", async (e) => {
  const button = e.target.closest(".app-button.event-manager");
  if (!button) return;
  if (button.dataset.loading === "true") return;
  button.dataset.loading = "true";
  console.log("Event manager button clicked");
  try {
    const response = await fetch("https://hook.us2.make.com/6wea8zdfq4qprfrexknmyu8a5myiyh12", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "list events for admin"
    });
    if (!response.ok) throw new Error(`Webhook request failed: ${response.status}`);
    const json = await response.json();
    console.log("Webhook parsed JSON:", json);
    if (!Array.isArray(json)) throw new Error("Webhook response is not an array");
    const groupedEvents = {};
    json.forEach((record) => {
      const eventId = String(record?.data?.event_record_id || "").trim().toLowerCase();
      const status  = String(record?.data?.status || "").trim().toLowerCase();
      if (!eventId) return;
      if (!groupedEvents[eventId]) groupedEvents[eventId] = { booked: 0, canceled: 0, total: 0 };
      if (status === "booked")                              groupedEvents[eventId].booked++;
      if (status === "canceled" || status === "cancelled")  groupedEvents[eventId].canceled++;
      groupedEvents[eventId].total++;
    });
    console.log("Grouped events:", groupedEvents);
    document.querySelectorAll(".event-manager-item").forEach((item) => {
      const eventIdEl = item.querySelector(".event_record_id");
      if (!eventIdEl) return;
      const eventId = String(eventIdEl.textContent || "").trim().toLowerCase();
      if (!eventId) return;
      console.log("CMS event id:", eventId);
      const counts    = groupedEvents[eventId] || { booked: 0, canceled: 0, total: 0 };
      const bookedEl  = item.querySelector(".booked-record");
      const canceledEl = item.querySelector(".canceled-record");
      const totalEl   = item.querySelector(".total-record");
      if (bookedEl)   bookedEl.textContent   = counts.booked;
      if (canceledEl) canceledEl.textContent = counts.canceled;
      if (totalEl)    totalEl.textContent    = counts.total;
    });
  } catch (error) {
    console.error("Webhook error:", error);
  } finally {
    button.dataset.loading = "false";
  }
});
