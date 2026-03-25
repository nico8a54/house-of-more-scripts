(function () {
  "use strict";

  /*=========================================================
    SECTION 1 — TAB NAVIGATION
    src: navigate-tabs.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".workspace-tab").forEach(tab => tab.classList.add("hide"));

    const activeButton = document.querySelector(".app-button.active");
    if (activeButton) {
      const sharedClass = [...activeButton.classList].find(cls => cls !== "app-button" && cls !== "active");
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

    const forceDonations = sessionStorage.getItem("forceClickDonations");
    if (forceDonations === "true") {
      const donationsBtn = document.querySelector(".app-button.donations");
      if (donationsBtn) setTimeout(() => donationsBtn.click(), 0);
      sessionStorage.removeItem("forceClickDonations");
    }
  });

  /*=========================================================
    SECTION 2 — TRIGGER MY EVENTS AFTER CANCEL
    src: trigger-my-events.js
    Fires on pageshow to auto-click #my-events via sessionStorage flag
  =========================================================*/
  window.addEventListener("pageshow", () => {
    console.log("[MEMBER] pageshow fired. triggerMyEvents flag:", sessionStorage.getItem("triggerMyEvents"));
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (sessionStorage.getItem("triggerMyEvents") !== "true") { clearInterval(timer); return; }
      const btn = document.getElementById("my-events");
      if (btn) {
        btn.click();
        sessionStorage.removeItem("triggerMyEvents");
        clearInterval(timer);
        return;
      }
      if (tries >= 30) clearInterval(timer);
    }, 200);
  });

  /*=========================================================
    SECTION 3 — DONATION LANDING PARAM
    src: donation-landing.js
    Reads ?donation= URL param and clears it after alerting
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const donationStatus = params.get("donation");
    if (donationStatus === "confirm") alert("Your donation was confirmed.");
    if (donationStatus === "not-confirm") alert("Your donation failed.");
    const forceRefetch = params.get("forceRefetch") === "true";

    if (forceRefetch) {
      params.delete("forceRefetch");
      const newQuery = params.toString();
      sessionStorage.setItem("forceClickDonations", "true");
      window.location.replace(window.location.pathname + (newQuery ? "?" + newQuery : ""));
      return;
    }

    if (donationStatus === "confirm" || donationStatus === "not-confirm") {
      params.delete("donation");
      const newQuery = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (newQuery ? "?" + newQuery : ""));
      const donationsTab = document.querySelector(".app-button.donations");
      if (donationsTab) donationsTab.click();
    }
  });

  /*=========================================================
    SECTION 4 — COUNT DAYS
    src: count-days.js
    Shows "Today / Tomorrow / In N days" label on event cards
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    document.querySelectorAll(".date-wrapper").forEach(wrapper => {
      const daysLeftEl = wrapper.querySelector(".days-left");
      const dateEl = wrapper.querySelector("[data-event-time]");
      if (!daysLeftEl || !dateEl) return;
      const eventDate = new Date(dateEl.textContent.trim());
      if (isNaN(eventDate)) { daysLeftEl.style.display = "none"; return; }
      eventDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays > 3) { daysLeftEl.style.display = "none"; return; }
      daysLeftEl.style.display = "";
      if (diffDays === 0) daysLeftEl.textContent = "Today";
      else if (diffDays === 1) daysLeftEl.textContent = "Tomorrow";
      else if (diffDays === 2) daysLeftEl.textContent = "In 2 days";
      else if (diffDays === 3) daysLeftEl.textContent = "In 3 days";
    });
  });

  /*=========================================================
    SECTION 5 — CALENDAR VIEW
    src: calendar-view.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const monthLabel = document.getElementById("calendar-month");
    const prevBtn = document.getElementById("calendar-prev");
    const nextBtn = document.getElementById("calendar-next");
    const dayCells = Array.from(document.querySelectorAll("[data-day-cell]"));
    const eventItems = Array.from(document.querySelectorAll("[data-event-date]"));
    const popover = document.querySelector(".calendar-popover");
    if (!monthLabel || !prevBtn || !nextBtn || !popover) return;

    const popoverTitle = popover.querySelector(".popover-title");
    const popoverList = popover.querySelector(".popover-list");
    const popoverTemplate = popover.querySelector(".popover-event");
    let currentDate = new Date();
    let selectedDate = null;
    let eventsByDate = {};
    let hideTimeout = null;

    function normalizeDate(dateString) {
      if (!dateString) return null;
      const parsed = new Date(dateString);
      if (isNaN(parsed)) return null;
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    function formatDate(year, month, day) {
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    function collectEvents() {
      eventsByDate = {};
      eventItems.forEach(item => {
        const date = normalizeDate(item.getAttribute("data-event-date"));
        if (!date) return;
        if (!eventsByDate[date]) eventsByDate[date] = [];
        eventsByDate[date].push(item);
      });
    }
    function renderCalendar(date) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      monthLabel.textContent = date.toLocaleString("default", { month: "long", year: "numeric" });
      dayCells.forEach(cell => {
        cell.classList.remove("is-today", "is-selected", "has-event");
        cell.style.visibility = "hidden";
        cell.removeAttribute("data-date");
        const numberEl = cell.querySelector(".day-number");
        if (numberEl) numberEl.textContent = "";
      });
      for (let day = 1; day <= daysInMonth; day++) {
        const cell = dayCells[firstDayOfMonth + (day - 1)];
        if (!cell) continue;
        const fullDate = formatDate(year, month, day);
        cell.setAttribute("data-date", fullDate);
        cell.style.visibility = "visible";
        const numberEl = cell.querySelector(".day-number");
        if (numberEl) numberEl.textContent = day;
        if (eventsByDate[fullDate]) cell.classList.add("has-event");
        if (fullDate === selectedDate) cell.classList.add("is-selected");
        const now = new Date();
        if (day === now.getDate() && month === now.getMonth() && year === now.getFullYear()) {
          cell.classList.add("is-today");
        }
      }
    }
    function positionPopover(cell) {
      const padding = 12;
      const anchor = cell.querySelector(".day-popover-anchor") || cell;
      const rect = anchor.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      let top = rect.top - popRect.height - padding;
      let left = rect.left + rect.width / 2 - popRect.width / 2;
      if (top < padding) { top = rect.bottom + padding; popover.dataset.position = "bottom"; }
      else { popover.dataset.position = "top"; }
      if (left < padding) left = padding;
      if (left + popRect.width > window.innerWidth - padding) left = window.innerWidth - popRect.width - padding;
      popover.style.top = `${top + window.scrollY}px`;
      popover.style.left = `${left}px`;
    }
    function showPopover(cell) {
      const date = cell.getAttribute("data-date");
      const events = eventsByDate[date];
      if (!events || !events.length) return;
      popoverList.innerHTML = "";
      popoverTitle.textContent = `${events.length} event${events.length > 1 ? "s" : ""}`;
      events.forEach(eventEl => {
        const clone = popoverTemplate.cloneNode(true);
        clone.style.display = "flex";
        const titleEl = clone.querySelector(".popover-event-title");
        const metaEl = clone.querySelector(".popover-meta");
        const thumbEl = clone.querySelector(".popover-thumb");
        const titleSrc = eventEl.querySelector("[data-event-title]");
        const timeSrc = eventEl.querySelector("[data-event-time]");
        const imgSrc = eventEl.querySelector("img");
        const linkSrc = eventEl.querySelector("[data-event-link]");
        if (titleEl && titleSrc) titleEl.textContent = titleSrc.textContent;
        if (metaEl && timeSrc) metaEl.textContent = timeSrc.textContent;
        if (thumbEl && imgSrc) {
          if (thumbEl.tagName === "IMG") thumbEl.src = imgSrc.src;
          else thumbEl.style.backgroundImage = `url(${imgSrc.src})`;
        }
        if (linkSrc && linkSrc.href) clone.href = linkSrc.href;
        popoverList.appendChild(clone);
      });
      popover.style.display = "block";
      positionPopover(cell);
    }
    function hidePopover() { popover.style.display = "none"; }

    dayCells.forEach(cell => {
      cell.addEventListener("mouseenter", () => {
        if (!cell.classList.contains("has-event")) return;
        clearTimeout(hideTimeout);
        showPopover(cell);
      });
      cell.addEventListener("mouseleave", () => { hideTimeout = setTimeout(hidePopover, 150); });
    });
    popover.addEventListener("mouseenter", () => clearTimeout(hideTimeout));
    popover.addEventListener("mouseleave", hidePopover);
    prevBtn.addEventListener("click", () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(currentDate); });
    nextBtn.addEventListener("click", () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(currentDate); });

    collectEvents();
    renderCalendar(currentDate);

    const eventListBtn = document.getElementById("event-list");
    const eventCalendarBtn = document.getElementById("event-calendar");
    const listView = document.getElementById("list-view");
    const calendarView = document.getElementById("calendar");
    if (eventListBtn && eventCalendarBtn && listView && calendarView) {
      eventListBtn.addEventListener("click", () => {
        eventListBtn.classList.add("active"); listView.classList.add("active");
        eventCalendarBtn.classList.remove("active"); calendarView.classList.remove("active");
      });
      eventCalendarBtn.addEventListener("click", () => {
        eventCalendarBtn.classList.add("active"); calendarView.classList.add("active");
        eventListBtn.classList.remove("active"); listView.classList.remove("active");
      });
    }
  });

  /*=========================================================
    SECTION 6 — MEMBER PROFILE FETCH (Supabase)
    src: member-profile-supabase.js
    Fetches full member object from /member-profile and logs it
  =========================================================*/
  document.addEventListener("DOMContentLoaded", async () => {
    const memberIdEl = document.querySelector('[data-ms-member="id"]');
    if (!memberIdEl) {
      console.warn("[MEMBER] No [data-ms-member='id'] element found.");
      return;
    }

    // Memberstack sets the text content asynchronously — poll until it's populated
    let tries = 0;
    const memberId = await new Promise(resolve => {
      const timer = setInterval(() => {
        tries++;
        const val = memberIdEl.textContent.trim();
        if (val) { clearInterval(timer); resolve(val); return; }
        if (tries >= 30) { clearInterval(timer); resolve(null); }
      }, 200);
    });

    if (!memberId) {
      console.warn("[MEMBER] member_id not found after polling.");
      return;
    }

    console.log("[MEMBER] member_id:", memberId);
    console.log("[MEMBER] Fetching /member-profile...");

    let data;
    try {
      const res = await fetch("https://houseofmore.nico-97c.workers.dev/member-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[MEMBER] /member-profile error:", res.status, errText);
        return;
      }

      data = await res.json();
    } catch (err) {
      console.error("[MEMBER] Fetch failed:", err);
      return;
    }

    console.log("[MEMBER] Full profile response:", data);
    console.log("[MEMBER] --- Profile fields ---");
    console.log("  id:", data.id);
    console.log("  member_id:", data.member_id);
    console.log("  email:", data.email);
    console.log("  first_name:", data.first_name);
    console.log("  last_name:", data.last_name);
    console.log("  phone:", data.phone);
    console.log("  birthday:", data.birthday);
    console.log("  gender:", data.gender);
    console.log("  marital_status:", data.marital_status);
    console.log("  application_status:", data.application_status);
    console.log("  date_of_request:", data.date_of_request);
    console.log("  approved_date:", data.approved_date);

    console.log("[MEMBER] --- Plan ---");
    console.log("  plan_name:", data.plan_name);

    console.log("[MEMBER] --- Questionnaire ---");
    console.log("  questionnaire:", data.questionnaire);

    console.log("[MEMBER] --- RSVPs (" + (data.rsvps?.length ?? 0) + ") ---");
    (data.rsvps || []).forEach((r, i) => console.log(`  rsvp[${i}]:`, r));

    console.log("[MEMBER] --- Donations (" + (data.donations?.length ?? 0) + ") ---");
    (data.donations || []).forEach((d, i) => console.log(`  donation[${i}]:`, d));
  });

})();
