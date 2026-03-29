(function () {
  "use strict";

  const WORKER = "https://houseofmore.nico-97c.workers.dev";

  function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const profileId   = getQueryParam("profile_record_id") || "";
    const rsvpId      = getQueryParam("event_record_id")   || "";
    const memberEmail = getQueryParam("member_email")      || "";

    const modal    = document.querySelector(".review-event-modal");
    const closeBtn = document.getElementById("close-review-modal");
    const sendBtn  = document.getElementById("send-review");

    const memberNameEl = document.querySelector('[data-field="member_name"]');
    const eventNameEl  = document.querySelector('[data-field="event_name"]');

    const reviewKey  = `review_session_${profileId}_${rsvpId}`;
    const paramCount = [profileId, rsvpId, memberEmail].filter(Boolean).length;

    // 1) Fetch member + event names on load
    if (paramCount >= 2) {
      try {
        const res  = await fetch(`${WORKER}/review-data`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ profile_record_id: profileId, event_record_id: rsvpId }),
        });
        const data = await res.json();
        if (data.member_name && memberNameEl) memberNameEl.textContent = data.member_name;
        else if (memberNameEl) memberNameEl.style.display = "none";
        if (data.event_name && eventNameEl) eventNameEl.textContent = data.event_name;
      } catch (err) {
        console.error("[REVIEW] Load error:", err);
        if (memberNameEl) memberNameEl.style.display = "none";
      }
    }

    // 2) Show modal once per session
    if (paramCount >= 2 && modal) {
      if (!sessionStorage.getItem(reviewKey)) {
        modal.classList.remove("hide");
        sessionStorage.setItem(reviewKey, "true");
      }
    }

    // 3) Close modal
    closeBtn?.addEventListener("click", () => modal?.classList.add("hide"));

    // 4) Submit review
    if (sendBtn) {
      sendBtn.addEventListener("click", async function () {
        const textarea    = document.getElementById("review_message");
        const ratingInput = document.querySelector('input[name="rating"]:checked');

        sendBtn.disabled  = true;
        const originalText = sendBtn.innerText;
        sendBtn.innerText  = "Sending...";

        try {
          const res = await fetch(`${WORKER}/submit-review`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              event_record_id: rsvpId,
              member_email:    memberEmail,
              rating:          ratingInput ? ratingInput.value : "",
              message:         textarea    ? textarea.value    : "",
            }),
          });

          if (res.ok) {
            sendBtn.innerText = "Thank you!";
            setTimeout(() => modal?.classList.add("hide"), 800);
          } else {
            alert("Something went wrong. Please try again.");
            sendBtn.disabled  = false;
            sendBtn.innerText = originalText || "Send Review";
          }
        } catch (err) {
          console.error("[REVIEW] Submit error:", err);
          alert("Connection error. Please try again.");
          sendBtn.disabled  = false;
          sendBtn.innerText = originalText || "Send Review";
        }
      });
    }
  });

})();
