(function () {
  "use strict";

  /*=========================================================
    SECTION 1 — CONDITIONAL FIELDS
    Elaborate checkbox toggle + attended events radio toggle
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const elaborateCheckbox = document.querySelector("#elaborate");
    const elaborateField = document.querySelector("#elaborate-field");
    const elaborateInput = elaborateField?.querySelector("input, textarea");

    const yesOption = document.querySelector("#yes");
    const noOption = document.querySelector("#no");
    const attendedEvents = document.querySelector("#attended-events");
    const eventsRadios = document.querySelectorAll(
      'input[name="how_many_events_have_you_attended_at_the_hom"]'
    );

    if (elaborateCheckbox && elaborateField && elaborateInput) {
      elaborateCheckbox.addEventListener("change", () => {
        if (elaborateCheckbox.checked) {
          elaborateField.classList.remove("hide");
          elaborateInput.setAttribute("required", "");
        } else {
          elaborateField.classList.add("hide");
          elaborateInput.removeAttribute("required");
        }
      });
    }

    if (yesOption && noOption && attendedEvents && eventsRadios.length) {
      yesOption.addEventListener("change", () => {
        if (yesOption.checked) {
          attendedEvents.classList.remove("hide");
          eventsRadios.forEach(radio => radio.setAttribute("required", ""));
        }
      });

      noOption.addEventListener("change", () => {
        if (noOption.checked) {
          attendedEvents.classList.add("hide");
          eventsRadios.forEach(radio => radio.removeAttribute("required"));
        }
      });
    }
  });

  /*=========================================================
    SECTION 2 — FORM SUBMIT → MAKE WEBHOOK
    Collects form data, sends to Make, redirects on success
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector('[data-ms-code="questionnaire-form"]');
    const button = document.querySelector("#submit");

    if (!form) { console.error("[WEBHOOK] Form not found"); return; }
    if (!button) { console.error("[WEBHOOK] Submit button not found"); return; }

    console.log("[WEBHOOK] Script ready");

    button.addEventListener("click", async () => {
      const payload = {};

      try {
        // 1. Checkbox groups (joined with " / ")
        const checkboxes = form.querySelectorAll('input[type="checkbox"][name]');
        const checkboxGroups = {};
        checkboxes.forEach(cb => {
          if (!checkboxGroups[cb.name]) checkboxGroups[cb.name] = [];
          if (cb.checked) {
            const option = cb.getAttribute("data-option");
            if (option) checkboxGroups[cb.name].push(option);
          }
        });
        Object.entries(checkboxGroups).forEach(([key, values]) => {
          if (values.length) payload[key] = values.join(" / ");
        });

        // 2. All other fields
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
          const field = form.querySelector(`[name="${key}"]`);
          if (field && field.type === "checkbox") continue;
          if (payload[key]) continue;
          payload[key] = value;
        }

        // 3. Force application status
        payload.application_status = "pending";

        console.log("[WEBHOOK] Payload:", payload);

        // 4. Send to Make
        const response = await fetch(
          "https://hook.us2.make.com/0k76yae1yt3jmujqap8d7xaaxmph27g6",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) throw new Error(`Webhook failed: ${response.status}`);
        console.log("[WEBHOOK] Successfully sent");

        // 5. Redirect
        window.location.href = "/application-submitted";

      } catch (error) {
        console.error("[WEBHOOK] Error:", error);
        alert("Something went wrong. Please try again.");
      }
    });
  });

})();
