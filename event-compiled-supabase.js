// Depends on: https://unpkg.com/html5-qrcode (loaded via Webflow page embed, before this script)
(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const state = { event_id: null };

  function renderFields(scope, data) {
    Object.entries(data).forEach(([key, value]) => {
      const field = scope.querySelector(`[data-field="${key}"]`);
      if (!field || value === null || value === undefined) return;
      field.textContent = value;
    });
  }

  /*=========================================================
    SECTION 1 — CHECK ORIGIN & SET UI STATE
    src: event-check-origin.js
    Reads URL params and sets initial page state before fetch
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const isBooked = params.get("booked") === "true";
    const source = params.get("source");
    const isAdmin = params.get("admin") === "true";

    // Hide all event info sections by default
    $$(".event-info-wrapper").forEach((wrapper) =>
      wrapper.classList.add("hide"),
    );

    // Cancel mode
    if (isBooked) {
      const mainButton = $(".button");
      if (mainButton) {
        mainButton.textContent = "CANCEL ATTENDANCE";
        mainButton.classList.add("cancel");
      }
    }

    // Admin / event-manager mode: show info, hide booking buttons
    if (source === "event-manager" || isAdmin) {
      $$(".event-info-wrapper").forEach((wrapper) =>
        wrapper.classList.remove("hide"),
      );
      $("#rsvp")?.classList.add("hide");
      $(".button.event-card")?.classList.add("hide");
    }
  });

  /*=========================================================
    SECTION 2 — BACK BUTTON
    src: event-back-button.js
  =========================================================*/
  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("#close-event");
    if (!closeBtn) return;
    window.history.back();
  });

  /*=========================================================
    SECTION 3 — INITIAL FETCH (Supabase)
    src: event-initial-fetch-supabase.js
    Fetches event data + current capacity from Supabase via worker
  =========================================================*/
  document.addEventListener("DOMContentLoaded", async () => {
    const eventSlug = window.location.pathname.split("/").filter(Boolean).pop();
    if (!eventSlug) return;

    const memberIdEl = document.querySelector('[data-ms-member="id"]');
    const memberId = memberIdEl?.textContent?.trim() || "";

    const params = new URLSearchParams(window.location.search);
    const isCancelMode = params.get("booked") === "true";

    const rsvpBtn = document.getElementById("rsvp");
    const capacityEl = document.getElementById("capacity-tag");
    const spotsEl = document.getElementById("spots-available");

    let result;
    try {
      const response = await fetch(
        "https://houseofmore.nico-97c.workers.dev/event-data",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_slug: eventSlug, member_id: memberId }),
        },
      );
      result = await response.json();
      console.log("[EVENT] Supabase response:", result);
      console.log("[EVENT] current_capacity:", result.current_capacity);
    } catch (err) {
      console.error("[EVENT] Fetch error:", err);
      return;
    }

    state.event_id = result.event?.id || null;
    const capacity = result.current_capacity ?? 0;

    // Show event info only for admins and facilitators of this specific event
    const isPrivileged = result.isPrivileged === true;
    if (isPrivileged) {
      $$(".event-info-wrapper").forEach(el => el.classList.remove("hide"));
      rsvpBtn?.classList.add("hide");
    }

    // Capacity tag
    if (capacityEl) {
      if (capacity <= 0) {
        capacityEl.classList.remove("hide");
        capacityEl.classList.add("sold");
        capacityEl.textContent = "Sold Out";
      } else if (capacity <= 5) {
        capacityEl.classList.remove("hide");
        capacityEl.classList.remove("sold");
        capacityEl.textContent = `Only ${capacity} Left`;
      } else {
        capacityEl.classList.add("hide");
      }
    }
    if (spotsEl) spotsEl.textContent = capacity;

    // Render attendants list
    const template = document.querySelector(".attendants-row");
    if (template && result.rsvps?.length) {
      const container = template.parentElement;
      template.classList.add("hide");
      const STATUS_ORDER = ["checked", "booked", "canceled", "no-show"];
      const sortedRsvps = result.rsvps
        .filter(r => STATUS_ORDER.includes(r.booking_status))
        .sort((a, b) => STATUS_ORDER.indexOf(a.booking_status) - STATUS_ORDER.indexOf(b.booking_status));
      sortedRsvps.forEach(rsvp => {
        const row = template.cloneNode(true);
        row.classList.remove("hide");
        const profile = rsvp.member_profiles || {};
        const fields = {
          first_name:     [profile.first_name, profile.last_name].filter(Boolean).join(" "),
          email:          profile.email || "",
          id:             rsvp.id || "",
          booking_status: rsvp.booking_status || "",
          member:         rsvp.member === false ? "no" : "yes",
        };
        Object.entries(fields).forEach(([key, val]) => {
          const el = row.querySelector(`[data-field="${key}"]`);
          if (el) el.textContent = val;
        });
        if (rsvp.booking_status === "checked") {
          row.querySelector(".check")?.classList.remove("hide");
        }
        container.appendChild(row);
      });
    }

    // Render reviews list
    const reviewTemplate = document.querySelector(".review-container");
    if (reviewTemplate && result.rsvps?.length) {
      const reviewParent = reviewTemplate.parentElement;
      reviewTemplate.classList.add("hide");
      result.rsvps.filter(r => r.review).forEach(rsvp => {
        const row = reviewTemplate.cloneNode(true);
        row.classList.remove("hide");
        const profile = rsvp.member_profiles || {};
        const fields = {
          first_name:     [profile.first_name, profile.last_name].filter(Boolean).join(" "),
          email:          profile.email || "",
          member_id:      rsvp.member_id || "",
          rating:         "★".repeat(rsvp.rating ?? 0) + "☆".repeat(5 - (rsvp.rating ?? 0)),
          review:         rsvp.review || "",
          booking_status: rsvp.booking_status || "",
        };
        Object.entries(fields).forEach(([key, val]) => {
          const el = row.querySelector(`[data-field="${key}"]`);
          if (el) el.textContent = val;
        });
        reviewParent.appendChild(row);
      });
    }

    // RSVP button state
    const isAdmin = params.get("admin") === "true";
    const isEventManager = params.get("source") === "event-manager";
    if (rsvpBtn) {
      if (isAdmin || isEventManager || isPrivileged) {
        rsvpBtn.classList.add("hide");
      } else if (capacity <= -5 && !isCancelMode) {
        rsvpBtn.classList.add("hide");
      } else {
        rsvpBtn.classList.remove("hide");
        if (isCancelMode) {
          rsvpBtn.textContent = "Cancel My Spot";
          rsvpBtn.classList.remove("waiting-list");
          rsvpBtn.classList.add("cancel");
        } else if (capacity <= 0) {
          rsvpBtn.textContent = "Add to Waiting List";
          rsvpBtn.classList.remove("cancel");
          rsvpBtn.classList.add("waiting-list");
        } else {
          rsvpBtn.textContent = "RSVP";
          rsvpBtn.classList.remove("cancel", "waiting-list");
        }
      }
    }
  });

  /*=========================================================
    SECTION 4 — RSVP FLOW
    src: event-rsvp.js
    Handles modal open/close, confirm → /member-rsvp-supabase
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const eventSlug = window.location.pathname.split("/").filter(Boolean).pop();
    const memberIdEl = document.querySelector('[data-ms-member="id"]');
    const memberId = memberIdEl?.textContent?.trim() || "";
    const params = new URLSearchParams(window.location.search);
    const isCancelMode = params.get("booked") === "true";

    const rsvpBtn = document.getElementById("rsvp");
    const rsvpConfirmBtn = document.getElementById("rsvp-confirm");
    const closeRsvpModalBtn = document.getElementById("close-modal-rsvp");
    const closeAnswerModalBtn = document.getElementById("close-modal-answer");
    const rsvpAlertModal = $(".modal-rsvp-alert");
    const answerModal = $(".modal-answer");
    const modalTitle = document.getElementById("modal-title");
    const messageRsvpAlert = $(".message-rsvp-alert");
    const messageRespond = $(".message-respond");

    let answerShouldGoBack = false;

    function showAnswerModal(message, goBack = false, alertClass = null) {
      if (!answerModal || !messageRespond) return;
      messageRespond.textContent = message;
      // Reset alerts and modal-content state
      answerModal.querySelectorAll(".alert1, .alert2, .alert3").forEach(el => el.classList.add("hide"));
      answerModal.querySelectorAll(".modal-content").forEach(el => el.classList.remove("alert1", "alert2", "alert3"));
      if (alertClass) {
        answerModal.querySelectorAll(`.${alertClass}`).forEach(el => el.classList.remove("hide"));
        answerModal.querySelectorAll(".modal-content").forEach(el => el.classList.add(alertClass));
      }
      answerModal.classList.remove("hide");
      answerShouldGoBack = goBack;
    }

    function getRsvpMode() {
      if (!rsvpBtn) return "booking";
      if (isCancelMode || rsvpBtn.classList.contains("cancel")) return "cancel";
      if (rsvpBtn.classList.contains("waiting-list")) return "waiting-list";
      return "booking";
    }

    function setRsvpModalCopy() {
      if (!modalTitle || !messageRsvpAlert || !rsvpConfirmBtn) return;
      const mode = getRsvpMode();
      if (mode === "cancel") {
        modalTitle.textContent = "You're about to cancel your spot for";
        messageRsvpAlert.textContent =
          "Cancellations must be made at least 2 hours before the event. After that, a no-show may result in your membership being frozen.";
        rsvpConfirmBtn.textContent = "Confirm Cancel";
        return;
      }
      if (mode === "waiting-list") {
        modalTitle.textContent = "You're joining the waitlist for";
        messageRsvpAlert.textContent =
          "If a spot opens, you'll be notified in the order you joined the waitlist. Accepting means committing to attend. No-shows impact fellow members and may result in your membership being frozen.";
        rsvpConfirmBtn.textContent = "Confirm Waiting List";
        return;
      }
      modalTitle.textContent = "You're about to book";
      messageRsvpAlert.textContent =
        "By confirming, you're committing to attend. You may cancel up to 2 hours before the event through your member portal. Accepting means committing to attend. No-shows impact fellow members and may result in your membership being frozen.";
      rsvpConfirmBtn.textContent = "Confirm Booking";
    }

    if (rsvpBtn) {
      rsvpBtn.addEventListener("click", (e) => {
        e.preventDefault();

        const membersTag = document.querySelector(".members-tag");
        const isMembersOnly = membersTag && membersTag.offsetParent !== null;

        if (!memberId) {
          if (isMembersOnly) {
            window.location.replace("/log-in");
            return;
          }
          document.querySelector(".modal-form-non-members")?.classList.remove("hide");
          return;
        }

        if (!rsvpAlertModal) return;
        setRsvpModalCopy();
        rsvpAlertModal.classList.remove("hide");
      });
    }

    // Non-member booking
    const bookNonMemberBtn = document.getElementById("book-non-member");
    if (bookNonMemberBtn && !bookNonMemberBtn.dataset.listenerAttached) {
      bookNonMemberBtn.dataset.listenerAttached = "true";
      bookNonMemberBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const form = document.getElementById("wf-form-event-non-member-form");
        if (!form) return;

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        const formData = new FormData(form);
        const payload = {
          event_slug: eventSlug,
          member_email: formData.get("Email-Address") || "",
          name: document.querySelector("#name")?.value?.trim() || "",
          status: "booking",
          member: false,
        };

        bookNonMemberBtn.disabled = true;

        try {
          const response = await fetch(
            "https://houseofmore.nico-97c.workers.dev/member-rsvp-supabase",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const result = await response.json();
          console.log("[EVENT] Non-member RSVP response:", result);

          document.querySelector(".modal-form-non-members")?.classList.add("hide");

          if (answerModal && messageRespond) {
            messageRespond.textContent = result.message || "You have successfully booked this event.";
            answerModal.classList.remove("hide");
          }
        } catch (err) {
          console.error("[EVENT] Non-member RSVP error:", err);
          alert("The booking didn't go through.");
        } finally {
          bookNonMemberBtn.disabled = false;
        }
      });
    }

    if (closeRsvpModalBtn) {
      closeRsvpModalBtn.addEventListener("click", (e) => {
        e.preventDefault();
        rsvpAlertModal?.classList.add("hide");
      });
    }

    let isSubmittingRsvp = false;
    if (rsvpConfirmBtn && !rsvpConfirmBtn.dataset.listenerAttached) {
      rsvpConfirmBtn.dataset.listenerAttached = "true";

      const parentForm = rsvpConfirmBtn.closest("form");
      if (parentForm && !parentForm.dataset.rsvpSubmitBlocked) {
        parentForm.dataset.rsvpSubmitBlocked = "true";
        parentForm.addEventListener("submit", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }

      rsvpConfirmBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (isSubmittingRsvp || !eventSlug || !memberId) return;
        isSubmittingRsvp = true;
        rsvpConfirmBtn.disabled = true;
        rsvpConfirmBtn.style.pointerEvents = "none";

        const statusToSend = getRsvpMode();

        try {
          const response = await fetch(
            "https://houseofmore.nico-97c.workers.dev/member-rsvp-supabase",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_slug: eventSlug, member_id: memberId, status: statusToSend }),
            }
          );
          const result = await response.json();
          console.log("[RSVP] response:", result);

          rsvpAlertModal?.classList.add("hide");

          if (result.message) {
            const alertClass = result.success === true ? "alert3" : result.alreadyBooked ? "alert1" : "alert2";
            showAnswerModal(result.message, result.success === true, alertClass);
          } else {
            showAnswerModal("Something went wrong. Please try again.", false, "alert2");
          }
        } catch (err) {
          console.error("[RSVP] error:", err);
          showAnswerModal("Something went wrong. Please try again.", false, "alert2");
        } finally {
          isSubmittingRsvp = false;
          rsvpConfirmBtn.disabled = false;
          rsvpConfirmBtn.style.pointerEvents = "";
        }
      });
    }

    if (closeAnswerModalBtn) {
      closeAnswerModalBtn.addEventListener("click", (e) => {
        e.preventDefault();
        answerModal?.classList.add("hide");
        if (answerShouldGoBack) {
          sessionStorage.setItem("triggerMyEvents", "true");
          window.history.back();
        }
        answerShouldGoBack = false;
      });
    }
  });

  /*=========================================================
    SECTION 5 — QR CHECK-IN SCANNER
    src: event-checkin-scanner.js
    Camera-based QR scanner for facilitator check-in
  =========================================================*/
  const WEBHOOK_URL =
    "https://houseofmore.nico-97c.workers.dev/facilitator-checkin-supabase";

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusEl = document.getElementById("status");
  const answerEl = document.getElementById("answer");
  const eventIdEl = document.getElementById("event-id");

  let html5QrCode = null;
  let lastFiredAt = 0;
  const COOLDOWN_MS = 4000;

  if (eventIdEl) eventIdEl.classList.add("hide");
  if (stopBtn) stopBtn.classList.add("hide");
  if (answerEl) {
    answerEl.classList.add("hide");
    answerEl.classList.remove("rejected");
    answerEl.textContent = "";
  }
  document.querySelectorAll(".check").forEach((el) => el.classList.add("hide"));

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
  }

  function updateAttendantRow(data) {
    const rsvpId = data?.rsvp_record_id;
    const memberId = data?.id;
    const useEmail = !memberId && data?.member === false && data?.email;

    function applyChecked(row) {
      renderFields(row, data);
      const status = (data.booking_status || "").toLowerCase();
      const checkEl = row.querySelector(".check");
      const infoWrapper = row.querySelector(".attenda-info-wrapper");
      if (status === "checked") {
        if (checkEl) checkEl.classList.remove("hide");
        if (infoWrapper) infoWrapper.classList.add("checked");
      }
    }

    if (rsvpId) {
      document.querySelectorAll('[data-field="rsvp_record_id"]').forEach((el) => {
        if (el.textContent.trim() !== rsvpId) return;
        const row = el.closest(".attendants-row");
        if (row) applyChecked(row);
      });
    } else if (memberId) {
      document.querySelectorAll('[data-field="id"]').forEach((idEl) => {
        if (idEl.textContent.trim() !== memberId) return;
        const row = idEl.closest(".attendants-row");
        if (row) applyChecked(row);
      });
    } else if (useEmail) {
      document.querySelectorAll('[data-field="email"]').forEach((emailEl) => {
        if (emailEl.textContent.trim().toLowerCase() !== data.email.toLowerCase()) return;
        const row = emailEl.closest(".attendants-row");
        if (row) applyChecked(row);
      });
    }
  }

  async function fireWebhook(qrText) {
    setStatus("Sending...");
    const payload = {
      qr_text: qrText,
    };
    console.log("[CHECK-IN] Payload:", payload);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || "Webhook failed");
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function resetScanUI() {
    setTimeout(() => {
      const readerEl = document.querySelector(".reader");
      if (answerEl) {
        answerEl.classList.add("hide");
        answerEl.classList.remove("rejected");
        answerEl.textContent = "";
      }
      if (readerEl) {
        readerEl.classList.remove("accepted");
        readerEl.classList.remove("rejected");
      }
      lastFiredAt = 0;
      setStatus("Stopped");
    }, 3000);
  }

  async function stopScan() {
    if (!html5QrCode) return;
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (e) {}
    html5QrCode = null;
    if (startBtn) startBtn.classList.remove("hide");
    if (stopBtn) stopBtn.classList.add("hide");
    setStatus("Stopped");
  }

  async function startScan() {
    if (html5QrCode) return;
    if (startBtn) startBtn.classList.add("hide");
    if (stopBtn) stopBtn.classList.remove("hide");
    html5QrCode = new Html5Qrcode("reader");
    setStatus("Starting camera...");

    const onScanSuccess = async (decodedText) => {
      const now = Date.now();
      if (now - lastFiredAt < COOLDOWN_MS) return;
      lastFiredAt = now;

      try {
        const webhookResponse = await fireWebhook(decodedText);
        console.log("[CHECK-IN] Webhook response:", webhookResponse);
        const readerEl = document.querySelector(".reader");

        if (typeof webhookResponse === "string") {
          if (answerEl) {
            answerEl.textContent = webhookResponse;
            answerEl.classList.remove("hide");
            answerEl.classList.add("rejected");
          }
          if (readerEl) {
            readerEl.classList.add("rejected");
            readerEl.classList.remove("accepted");
          }
          setStatus("Rejected");
          await stopScan();
          resetScanUI();
          return;
        }

        if (answerEl) {
          answerEl.textContent = webhookResponse.member_name || "Member found";
          answerEl.classList.remove("hide");
          answerEl.classList.remove("rejected");
        }
        if (readerEl) {
          readerEl.classList.add("accepted");
          readerEl.classList.remove("rejected");
        }
        updateAttendantRow(webhookResponse);
        setStatus("Done");
        await stopScan();
        resetScanUI();
      } catch (e) {
        console.error("[CHECK-IN] Webhook error:", e);
        const readerEl = document.querySelector(".reader");
        if (readerEl) {
          readerEl.classList.add("rejected");
          readerEl.classList.remove("accepted");
        }
        if (answerEl) {
          answerEl.textContent = e.message || "Error";
          answerEl.classList.remove("hide");
          answerEl.classList.add("rejected");
        }
        setStatus("Error");
        await stopScan();
        resetScanUI();
      }
    };

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
      );
      setStatus("Scanning...");
    } catch (e) {
      html5QrCode = null;
      setStatus("Camera failed: " + (e.message || e));
    }
  }

  if (startBtn) startBtn.addEventListener("click", startScan);
  if (stopBtn) stopBtn.addEventListener("click", stopScan);
})();
