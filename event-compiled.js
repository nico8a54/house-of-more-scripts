(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

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
    SECTION 3 — INITIAL FETCH
    src: event-initial-fetch.js
    Fetches event data, renders capacity / attendees / reviews / RSVP state
  =========================================================*/
  document.addEventListener("DOMContentLoaded", async () => {
    const eventRecordEl = document.getElementById("event-record");
    const eventRecordId = eventRecordEl?.textContent?.trim();
    if (!eventRecordId) return;

    const params = new URLSearchParams(window.location.search);
    const isCancelMode = params.get("booked") === "true";

    const rsvpBtn = document.getElementById("rsvp");
    const capacityEl = document.getElementById("capacity-tag");
    const spotsEl = document.getElementById("spots-available");
    const attendantsTemplate = document.querySelector(".attendants-row");
    const attendantsList = document.querySelector(".attendants-list");
    const reviewTemplate = document.querySelector(".review-container");
    const reviewList = document.querySelector(".review-list");

    let result;
    try {
      const response = await fetch(
        "https://houseofmore.nico-97c.workers.dev/admin-list-event",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_record_id: eventRecordId }),
        },
      );
      result = await response.json();
      console.log("[EVENT] Fetch result:", result);
    } catch (err) {
      console.error("[EVENT] Fetch error:", err);
      return;
    }

    const attendees = result.attendees?.data || [];
    const rsvps = result.rsvps?.records || [];
    const capacity = Number(result.current_capacity || 0);

    // Member lookup by email
    const memberLookup = {};
    attendees.forEach((member) => {
      const email = member?.auth?.email?.toLowerCase()?.trim();
      if (!email) return;
      const first = member?.customFields?.["first-name"] || "";
      const last = member?.customFields?.["last-name"] || "";
      memberLookup[email] = {
        id: member?.id || "",
        name: (first + " " + last).trim() || email,
      };
    });

    // Normalize RSVP records
    const records = rsvps.map((r) => {
      const email = r.data?.member_email?.toLowerCase()?.trim();
      const member = memberLookup[email] || {};
      return {
        member_name: r.data?.member_name || member.name || email || "",
        member: r.data?.member || "",
        id: member.id || "",
        email: email || "",
        booking_status: r.data?.status || "",
        rsvp_record_id: r.data?.rsvp_record_id || "",
        rating: r.data?.rating || null,
        review: r.data?.review || "",
      };
    });

    // Sort by status priority
    const priority = {
      checked: 1,
      booked: 2,
      canceled: 3,
      cancelled: 3,
      noshow: 4,
    };
    records.sort((a, b) => {
      const A = priority[(a.booking_status || "").toLowerCase()] || 99;
      const B = priority[(b.booking_status || "").toLowerCase()] || 99;
      return A - B;
    });

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

    // Attendees list
    if (attendantsTemplate && attendantsList) {
      Array.from(attendantsList.children).forEach((child) => {
        if (child !== attendantsTemplate) child.remove();
      });
      attendantsTemplate.style.display = "none";
      records.forEach((record) => {
        const clone = attendantsTemplate.cloneNode(true);
        clone.style.display = "";
        renderFields(clone, record);
        const status = (record.booking_status || "").toLowerCase();
        if (status === "checked") {
          clone.querySelector(".check")?.classList.remove("hide");
          clone
            .querySelector(".attenda-info-wrapper")
            ?.classList.add("checked");
        }
        attendantsList.appendChild(clone);
      });
    }

    // Reviews
    const feedback = records.filter((r) => r.review || r.rating);
    if (reviewTemplate && reviewList) {
      Array.from(reviewList.children).forEach((child) => {
        if (child !== reviewTemplate) child.remove();
      });
      reviewTemplate.style.display = "none";
      feedback.forEach((record) => {
        const clone = reviewTemplate.cloneNode(true);
        clone.style.display = "";
        renderFields(clone, {
          member_name: record.member_name,
          member_id: record.email,
          review: record.review,
        });
        const ratingEl = clone.querySelector('[data-field="rating"]');
        if (ratingEl && record.rating) {
          ratingEl.textContent = "★★★★★☆☆☆☆☆".slice(
            5 - record.rating,
            10 - record.rating,
          );
        }
        reviewList.appendChild(clone);
      });
    }

    // RSVP button state
    const isAdmin = params.get("admin") === "true";
    const isEventManager = params.get("source") === "event-manager";
    function applyRsvpButtonState() {
      if (!rsvpBtn) return;
      if (isAdmin || isEventManager) {
        rsvpBtn.classList.add("hide");
        return;
      }
      if (capacity <= -5 && !isCancelMode) {
        rsvpBtn.classList.add("hide");
        return;
      }
      rsvpBtn.classList.remove("hide");
      if (isCancelMode) {
        rsvpBtn.textContent = "Cancel My Spot";
        rsvpBtn.classList.remove("waiting-list");
        rsvpBtn.classList.add("cancel");
        return;
      }
      if (capacity <= 0) {
        rsvpBtn.textContent = "Add to Waiting List";
        rsvpBtn.classList.remove("cancel");
        rsvpBtn.classList.add("waiting-list");
        return;
      }
      rsvpBtn.textContent = "RSVP";
      rsvpBtn.classList.remove("cancel", "waiting-list");
    }
    applyRsvpButtonState();
  });

  /*=========================================================
    SECTION 4 — RSVP FLOW
    src: event-rsvp.js
    Handles modal open/close, confirm → /member-rsvp webhook
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const eventRecord = document
      .getElementById("event-record")
      ?.textContent?.trim();
    const memberEmail =
      $('[data-ms-member="email"]')?.textContent?.trim() || "";
    const params = new URLSearchParams(window.location.search);
    const profileRecord = params.get("member_profile");
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

        if (!profileRecord) {
          // Members-only event: redirect to log-in
          if (isMembersOnly) {
            window.location.replace("/log-in");
            return;
          }
          // Open event: show non-member form modal
          document
            .querySelector(".modal-form-non-members")
            ?.classList.remove("hide");
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

        const formData = new FormData(form);
        const email = (formData.get("Email-Address") || "").trim();
        const name = document.querySelector("#name")?.value?.trim() || "";

        if (!name || !email) {
          form.querySelectorAll("input[required], input[type='email']").forEach((input) => {
            if (!input.value.trim()) input.reportValidity();
          });
          return;
        }

        const payload = {
          event_record: eventRecord,
          member_email: email,
          profile_record: "",
          name,
          status: "booking",
          member: false
        };

        bookNonMemberBtn.disabled = true;

        try {
          const response = await fetch(
            "https://houseofmore.nico-97c.workers.dev/member-rsvp",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const result = (await response.text()).trim();
          console.log("[EVENT] Non-member RSVP response:", result);

          document
            .querySelector(".modal-form-non-members")
            ?.classList.add("hide");

          if (answerModal && messageRespond) {
            messageRespond.textContent =
              result || "You have successfully booked this event.";
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
        if (isSubmittingRsvp || !eventRecord || !memberEmail) return;
        isSubmittingRsvp = true;
        rsvpConfirmBtn.disabled = true;
        rsvpConfirmBtn.style.pointerEvents = "none";

        const statusToSend = getRsvpMode();
        console.log("[EVENT] RSVP status:", statusToSend);

        try {
          const response = await fetch(
            "https://houseofmore.nico-97c.workers.dev/member-rsvp",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event_record: eventRecord,
                member_email: memberEmail,
                profile_record: profileRecord,
                name: (($('[data-ms-member="first-name"]')?.textContent?.trim() || "") + " " + ($('[data-ms-member="last-name"]')?.textContent?.trim() || "")).trim(),
                status: statusToSend,
                member: true,
              }),
            },
          );
          const result = (await response.text()).trim();
          console.log("[EVENT] RSVP response:", result);

          rsvpAlertModal?.classList.add("hide");

          const responseMap = {
            "You have successfully booked this event.":
              "You have successfully booked this event.",
            "You have canceled your attendance for this event.":
              "You have canceled your attendance for this event.",
            "You have already booked this event.":
              "You have already booked this event.",
            "Yoy have sign up to a waiting list.":
              "Yoy have sign up to a waiting list.",
            "You have sign up to a waiting list.":
              "You have sign up to a waiting list.",
          };

          if (answerModal && messageRespond && responseMap[result]) {
            messageRespond.textContent = responseMap[result];
            answerModal.classList.remove("hide");
          } else {
            alert("The booking didn't go through.");
          }
        } catch (error) {
          console.error("[EVENT] RSVP error:", error);
          alert("The booking didn't go through.");
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
        sessionStorage.setItem("triggerMyEvents", "true");
        window.history.back();
      });
    }
  });

  /*=========================================================
    SECTION 5 — QR CHECK-IN SCANNER
    src: event-checkin-scanner.js
    Camera-based QR scanner for facilitator check-in
  =========================================================*/
  const WEBHOOK_URL =
    "https://houseofmore.nico-97c.workers.dev/facilitator-checkin";

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusEl = document.getElementById("status");
  const answerEl = document.getElementById("answer");
  const eventIdEl = document.getElementById("event-id");

  let html5QrCode = null;
  let lastFiredAt = 0;
  const COOLDOWN_MS = 4000;

  // Init hidden elements
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
    const eventId = eventIdEl ? eventIdEl.textContent.trim() : null;
    const payload = {
      qr_text: qrText,
      event_id: eventId,
      scanned_at: new Date().toISOString(),
    };
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
