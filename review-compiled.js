(function () {
  "use strict";

  /*=========================================================
    SECTION 1 — EVENT REVIEW MODAL
    Fetches member/event names, shows modal once per session,
    handles close and submit → Make webhook
  =========================================================*/
  function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const memberId    = getQueryParam("profile_record_id") || "";
    const eventId     = getQueryParam("event_record_id")   || "";
    const memberEmail = getQueryParam("member_email")      || "";

    const modal    = document.querySelector(".review-event-modal");
    const closeBtn = document.getElementById("close-review-modal");
    const sendBtn  = document.getElementById("send-review");

    const memberNameEl = document.querySelector('[data-field="member_name"]');
    const eventNameEl  = document.querySelector('[data-field="event_name"]');

    const reviewKey = `review_session_${memberId}_${eventId}`;

    function buildPayload() {
      const textarea    = document.getElementById("review_message");
      const ratingInput = document.querySelector('input[name="rating"]:checked');
      return {
        profile_record_id: memberId,
        event_record_id:   eventId,
        member_email:      memberEmail,
        rating:  ratingInput ? ratingInput.value : "",
        message: textarea    ? textarea.value    : ""
      };
    }

    async function postToWebhook() {
      const res  = await fetch("https://houseofmore.nico-97c.workers.dev/home-review", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildPayload())
      });
      const data = await res.json();
      return { res, data };
    }

    const paramCount = [memberId, eventId, memberEmail].filter(Boolean).length;

    // 1) Fetch on load — render member & event names
    if (paramCount >= 2) {
      try {
        const { data } = await postToWebhook();
        console.log("[REVIEW] Load response:", data);
        if (Array.isArray(data) && data[0]?.data) {
          if (memberNameEl) memberNameEl.textContent = data[0].data.member_name || "";
          if (eventNameEl)  eventNameEl.textContent  = data[0].data.event_name  || "";
        }
      } catch (err) {
        console.error("[REVIEW] Load error:", err);
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

    // 4) Send review
    if (sendBtn) {
      sendBtn.addEventListener("click", async function () {
        sendBtn.disabled = true;
        const originalText = sendBtn.innerText;
        sendBtn.innerText = "Sending...";
        try {
          const { res, data } = await postToWebhook();
          console.log("[REVIEW] Submit response:", data);
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
