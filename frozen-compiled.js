(function () {
  "use strict";

  /*=========================================================
    SECTION 1 — DEFAULT DONATION AMOUNT
  =========================================================*/
  document.addEventListener("DOMContentLoaded", function () {
    const amountInput = document.getElementById("donation-amount");
    if (amountInput) amountInput.value = 100;
  });

  /*=========================================================
    SECTION 2 — ONE-TIME DONATION → STRIPE CHECKOUT
    Fetches Memberstack member, sends to /donation-checkout
  =========================================================*/
  document.addEventListener("DOMContentLoaded", function () {
    const donateBtn = document.getElementById("on-time-donation");
    if (!donateBtn) return;
    donateBtn.addEventListener("click", async function () {
      try {
        const member = await window.$memberstackDom.getCurrentMember();
        if (!member) { alert("You must be logged in to donate."); return; }

        const memberId = member.data.id;
        const email    = member.data.email
          || document.querySelector('[data-ms-member="email"]')?.textContent?.trim();

        const amountInput = document.getElementById("donation-amount");
        if (!amountInput) { alert("Donation amount input not found."); return; }

        const amount = Number(amountInput.value);
        if (!amount || amount <= 0) { alert("Please enter a valid amount."); return; }

        const amountInCents = Math.round(amount * 100);
        console.log("[FROZEN] memberId:", memberId, "| email:", email, "| cents:", amountInCents);

        const response = await fetch("https://houseofmore.nico-97c.workers.dev/donation-checkout", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount:             amountInCents,
            memberId:           memberId,
            email:              email,
            "type-of-donation": "one-time"
          })
        });

        let data;
        try {
          data = JSON.parse(await response.text());
        } catch (err) {
          console.error("[FROZEN] Invalid JSON:", err);
          alert("Invalid response from server.");
          return;
        }

        console.log("[FROZEN] Checkout response:", data);
        if (!data.url) { alert("Checkout URL not returned."); return; }
        window.location.href = data.url;

      } catch (error) {
        console.error("[FROZEN] Donation error:", error);
        alert("Something went wrong.");
      }
    });
  });

})();
