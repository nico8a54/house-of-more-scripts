(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

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
    $$(".event-info-wrapper").forEach(wrapper => wrapper.classList.add("hide"));

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
      $$(".event-info-wrapper").forEach(wrapper => wrapper.classList.remove("hide"));
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
      const response = await fetch("https://houseofmore.nico-97c.workers.dev/admin-list-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_record_id: eventRecordId })
      });
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
    attendees.forEach(member => {
      const email = member?.auth?.email?.toLowerCase()?.trim();
      if (!email) return;
      const first = member?.customFields?.["first-name"] || "";
      const last = member?.customFields?.["last-name"] || "";
      memberLookup[email] = { id: member?.id || "", name: (first + " " + last).trim() || email };
    });

    // Normalize RSVP records
    const records = rsvps.map(r => {
      const email = r.data?.member_email?.toLowerCase()?.trim();
      const member = memberLookup[email] || {};
      return {
        member_name: member.name || email || "",
        id: member.id || "",
        email: email || "",
        booking_status: r.data?.status || "",
        rating: r.data?.rating || null,
        review: r.data?.review || ""
      };
    });

    // Sort by status priority
    const priority = { checked: 1, booked: 2, canceled: 3, cancelled: 3, noshow: 4 };
    records.sort((a, b) => {
      const A = priority[(a.booking_status || "").toLowerCase()] || 99;
      const B = priority[(b.booking_status || "").toLowerCase()] || 99;
      return A - B;
    });

    function renderFields(scope, data) {
      Object.entries(data).forEach(([key, value]) => {
        const field = scope.querySelector(`[data-field="${key}"]`);
        if (!field || value === null || value === undefined) return;
        field.textContent = value;
      });
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

    // Attendees list
    if (attendantsTemplate && attendantsList) {
      Array.from(attendantsList.children).forEach(child => {
        if (child !== attendantsTemplate) child.remove();
      });
      attendantsTemplate.style.display = "none";
      records.forEach(record => {
        const clone = attendantsTemplate.cloneNode(true);
        clone.style.display = "";
        renderFields(clone, record);
        const status = (record.booking_status || "").toLowerCase();
        if (status === "checked") {
          clone.querySelector(".check")?.classList.remove("hide");
          clone.querySelector(".attenda-info-wrapper")?.classList.add("checked");
        }
        attendantsList.appendChild(clone);
      });
    }

    // Reviews
    const feedback = records.filter(r => r.review || r.rating);
    if (reviewTemplate && reviewList) {
      Array.from(reviewList.children).forEach(child => {
        if (child !== reviewTemplate) child.remove();
      });
      reviewTemplate.style.display = "none";
      feedback.forEach(record => {
        const clone = reviewTemplate.cloneNode(true);
        clone.style.display = "";
        renderFields(clone, { member_name: record.member_name, member_id: record.email, review: record.review });
        const ratingEl = clone.querySelector('[data-field="rating"]');
        if (ratingEl && record.rating) {
          ratingEl.textContent = "★★★★★☆☆☆☆☆".slice(5 - record.rating, 10 - record.rating);
        }
        reviewList.appendChild(clone);
      });
    }

    // RSVP button state
    const isAdmin = params.get("admin") === "true";
    const isEventManager = params.get("source") === "event-manager";
    function applyRsvpButtonState() {
      if (!rsvpBtn) return;
      if (isAdmin || isEventManager) { rsvpBtn.classList.add("hide"); return; }
      if (capacity <= -5 && !isCancelMode) { rsvpBtn.classList.add("hide"); return; }
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
    const eventRecord = document.getElementById("event-record")?.textContent?.trim();
    const memberEmail = $('[data-ms-member="email"]')?.textContent?.trim() || "";
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
        messageRsvpAlert.textContent = "Cancellations must be made at least 2 hours before the event. After that, a no-show may result in your membership being frozen.";
        rsvpConfirmBtn.textContent = "Confirm Cancel";
        return;
      }
      if (mode === "waiting-list") {
        modalTitle.textContent = "You're joining the waitlist for";
        messageRsvpAlert.textContent = "If a spot opens, you'll be notified in the order you joined the waitlist. Accepting means committing to attend. No-shows impact fellow members and may result in your membership being frozen.";
        rsvpConfirmBtn.textContent = "Confirm Waiting List";
        return;
      }
      modalTitle.textContent = "You're about to book";
      messageRsvpAlert.textContent = "By confirming, you're committing to attend. You may cancel up to 2 hours before the event through your member portal. Accepting means committing to attend. No-shows impact fellow members and may result in your membership being frozen.";
      rsvpConfirmBtn.textContent = "Confirm Booking";
    }

    if (rsvpBtn) {
      rsvpBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!rsvpAlertModal) return;
        setRsvpModalCopy();
        rsvpAlertModal.classList.remove("hide");
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
        parentForm.addEventListener("submit", (e) => { e.preventDefault(); e.stopPropagation(); });
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
          const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-rsvp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event_record: eventRecord,
              member_email: memberEmail,
              profile_record: profileRecord,
              status: statusToSend
            })
          });
          const result = (await response.text()).trim();
          console.log("[EVENT] RSVP response:", result);

          rsvpAlertModal?.classList.add("hide");

          const responseMap = {
            "You have successfully booked this event.": "You have successfully booked this event.",
            "You have canceled your attendance for this event.": "You have canceled your attendance for this event.",
            "You have already booked this event.": "You have already booked this event.",
            "Yoy have sign up to a waiting list.": "Yoy have sign up to a waiting list.",
            "You have sign up to a waiting list.": "You have sign up to a waiting list."
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

})();
