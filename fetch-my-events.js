document.addEventListener("DOMContentLoaded", () => {
  const WEBHOOK_URL = "https://houseofmore.nico-97c.workers.dev/member-list-events";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const myEventsBtn = document.getElementById("my-events");
  const pastBtn = document.getElementById("past-events");
  const upcomingBtn = document.getElementById("upcoming-events");
  if (!myEventsBtn) return;

  const state = { bookedEventIds: [] };

  function filterBookedEventsByDate(type) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allWrappers = $$(".event-item-wrapper.booked-event");
    allWrappers.forEach(wrapper => {
      const rawDate = wrapper.getAttribute("data-event-date") || wrapper.querySelector("[data-event-date]")?.getAttribute("data-event-date") || "";
      if (!rawDate) {
        console.warn("[MY-EVENTS] filterByDate: no date found, hiding wrapper", wrapper);
        wrapper.classList.add("hide");
        return;
      }
      const eventDate = new Date(rawDate);
      if (isNaN(eventDate)) {
        console.warn("[MY-EVENTS] filterByDate: invalid date:", rawDate);
        wrapper.classList.add("hide");
        return;
      }
      eventDate.setHours(0, 0, 0, 0);
      const isPast = eventDate < today;
      wrapper.classList.toggle("hide", type === "upcoming" ? isPast : !isPast);
    });
  }

  function setActiveFilter(activeBtn, inactiveBtn) {
    if (activeBtn) activeBtn.classList.add("active");
    if (inactiveBtn) inactiveBtn.classList.remove("active");
  }

  if (upcomingBtn) upcomingBtn.addEventListener("click", () => {
    setActiveFilter(upcomingBtn, pastBtn);
    filterBookedEventsByDate("upcoming");
  });

  if (pastBtn) pastBtn.addEventListener("click", () => {
    setActiveFilter(pastBtn, upcomingBtn);
    filterBookedEventsByDate("past");
  });

  myEventsBtn.addEventListener("click", async () => {
    const memberId = $('[data-ms-member="id"]')?.textContent?.trim() || "";
    const memberEmail = $('[data-ms-member="email"]')?.textContent?.trim() || "";
    const memberRecordId = $('[data-field="member_profile"]')?.textContent?.trim() || "";
    console.log("[MY-EVENTS] memberId:", memberId, "| memberEmail:", memberEmail, "| memberRecordId:", memberRecordId);
    if (!memberId || !memberEmail) {
      console.warn("[MY-EVENTS] Aborting — missing memberId or memberEmail");
      return;
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId, member_email: memberEmail, member_record_id: memberRecordId })
      });
      const parsed = JSON.parse(await response.text());
      console.log("[MY-EVENTS] Webhook response:", parsed);
      if (!Array.isArray(parsed)) {
        console.warn("[MY-EVENTS] Response is not an array:", typeof parsed, parsed);
        return;
      }

      state.bookedEventIds = parsed
        .map(r => r?.data?.event_record_id?.toString().trim())
        .filter(Boolean);

      console.log("[MY-EVENTS] bookedEventIds:", state.bookedEventIds);

      const allWrappers = $$("#my-collection-events .event-item-wrapper");
      console.log("[MY-EVENTS] event wrappers found:", allWrappers.length);

      allWrappers.forEach(wrapper => {
        wrapper.classList.add("hide");
        wrapper.classList.remove("booked-event");
      });

      allWrappers.forEach(wrapper => {
        const recordEl = wrapper.querySelector(".event_record");
        if (!recordEl) return;
        const cmsEventId = recordEl.textContent.trim();
        console.log("[MY-EVENTS] checking wrapper cmsEventId:", cmsEventId, "| match:", state.bookedEventIds.includes(cmsEventId));
        if (!cmsEventId) return;
        if (!state.bookedEventIds.includes(cmsEventId)) return;

        wrapper.classList.remove("hide");
        wrapper.classList.add("booked-event");

        const recordData = parsed.find(r => r?.data?.event_record_id?.toString().trim() === cmsEventId);
        const status = recordData?.data?.status;
        const btn = wrapper.querySelector(".button.event-card.manage");
        if (btn && btn.href) {
          const url = new URL(btn.href, window.location.origin);
          url.searchParams.set("booked", "true");
          btn.href = url.toString();
        }
        if (status === "canceled") {
          wrapper.classList.add("canceled");
          wrapper.querySelectorAll(".tag-booked").forEach(tag => {
            tag.classList.add("canceled");
            tag.textContent = "Canceled";
          });
          if (btn) btn.classList.add("hide");
        }
      });

      if (upcomingBtn) {
        setActiveFilter(upcomingBtn, pastBtn);
        filterBookedEventsByDate("upcoming");
      }
    } catch (error) {
      console.error("My Events webhook error:", error);
    }
  });
});
