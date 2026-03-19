(function () {
  "use strict";

  // Capture donation/plan flags before any listener can remove the URL params
  const _urlParams = new URLSearchParams(window.location.search);
  const _donationConfirmed = _urlParams.get("donation") === "confirm";

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
      // Plan changed via Memberstack — do a clean reload so member data re-initializes fresh
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
    SECTION 6 — MEMBER PROFILE
    src: member-profile.js
    Fetches profile data, renders into page, handles edit/cancel
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const WEBHOOK_URL = "https://houseofmore.nico-97c.workers.dev/member-profile";
    const ui = {
      editBtn: document.getElementById("edit-form"),
      cancelBtn: document.getElementById("cancel-profile-form"),
      submitWrapper: document.querySelector(".submit-wrapper"),
      memberIdEl: document.querySelector('[data-ms-member="id"]'),
      facilitatorMenu: document.querySelector(".menu-wrapper.facilitator"),
      profileTabBtn: document.querySelector(".app-button.profile")
    };
    if (!ui.memberIdEl || !ui.editBtn || !ui.cancelBtn) return;
    const memberId = (ui.memberIdEl.textContent || "").trim();
    if (!memberId) return;

    const state = { webhookData: null };

    function show(el) { if (el) el.classList.remove("hide"); }
    function hide(el) { if (el) el.classList.add("hide"); }
    function normalizeOption(str) {
      return String(str).toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
    }
    function toDateInputValue(value) {
      try { return new Date(value).toISOString().split("T")[0]; }
      catch (e) { return String(value); }
    }

    function setInitialUI() {
      hide(ui.facilitatorMenu);
      hide(ui.cancelBtn);
      hide(ui.submitWrapper);
    }

    async function fetchProfileData() {
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId })
        });
        if (!res.ok) { console.error("[MEMBER] Profile webhook failed:", res.status); return null; }
        const raw = await res.json();
        let parsed = raw;
        if (raw && typeof raw.json === "string") {
          try { parsed = JSON.parse(raw.json); }
          catch (err) { console.error("[MEMBER] Failed to parse inner JSON:", err); return null; }
        }
        if (typeof parsed === "string") {
          try { parsed = JSON.parse(parsed); }
          catch (err) { console.error("[MEMBER] Failed to parse string response:", err); return null; }
        }
        return parsed;
      } catch (error) {
        console.error("[MEMBER] Profile fetch error:", error);
        return null;
      }
    }

    function applyViewModeLocking() {
      document.querySelectorAll(".text-area, .selector-wrapper, .checkbox-container")
        .forEach(el => el.classList.add("locked"));
      document.querySelectorAll(".checkbox-container").forEach(container => {
        const checkbox = container.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        if (checkbox.checked) { container.classList.add("filled"); container.classList.remove("hide"); }
        else { container.classList.remove("filled"); container.classList.add("hide"); }
      });
    }

    function enterEditModeUI() {
      document.querySelectorAll(".checkbox-container, .text-area, .selector-wrapper")
        .forEach(el => el.classList.remove("locked", "hide", "filled"));
      document.querySelectorAll(".field-text").forEach(el => el.classList.remove("hide", "filled"));
      document.querySelectorAll(".select-field").forEach(select => select.classList.remove("filled"));
    }

    function updateFacilitatorMenu(data) {
      hide(ui.facilitatorMenu);
      if (!ui.facilitatorMenu || !data || !Array.isArray(data.plan_name)) return;
      const hasFacilitator = data.plan_name.some(plan => {
        if (!plan || !plan.planName) return false;
        return String(plan.planName).toLowerCase() === "facilitator";
      });
      if (hasFacilitator) show(ui.facilitatorMenu);
    }

    const PAY_PLANS = new Set(["advocate","builder","champion","neighbor","partner","patron","supporter","sustainer","visionary"]);

    function updateCancelPlan(data) {
      const cancelPlanEl = document.querySelector(".cancel-plan");
      if (!cancelPlanEl) return;
      const hasPayPlan = Array.isArray(data?.plan_name) && data.plan_name.some(plan => PAY_PLANS.has(String(plan?.planName || "").toLowerCase()));
      cancelPlanEl.classList.toggle("hide", !hasPayPlan);
    }

    function renderProfile(data) {
      if (!data) return;
      updateFacilitatorMenu(data);
      updateCancelPlan(data);
      Object.entries(data).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        const checkboxes = document.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
        if (checkboxes.length) {
          const values = String(value).split("/").map(normalizeOption);
          checkboxes.forEach(cb => {
            cb.checked = values.includes(normalizeOption(cb.getAttribute("data-option") || ""));
          });
          return;
        }
        const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
        if (radios.length) {
          radios.forEach(radio => { radio.checked = radio.value === String(value); });
          return;
        }
        const selectField = document.querySelector(`.select-field[data-field="${key}"]`);
        if (selectField) {
          const incomingValue = String(value).trim().toLowerCase();
          Array.from(selectField.options).forEach(option => {
            if (option.value.trim().toLowerCase() === incomingValue) selectField.value = option.value;
          });
          return;
        }
        const elements = document.querySelectorAll(`[data-field="${key}"]`);
        if (!elements.length) return;
        let displayValue = value;
        if (Array.isArray(value)) {
          displayValue = value.map(v => v?.planName || v).filter(Boolean).join(", ");
        }
        if (key === "birthday") displayValue = toDateInputValue(displayValue);
        elements.forEach(el => {
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
            el.value = displayValue;
          } else {
            el.textContent = displayValue;
          }
          el.classList.add("filled");
        });
      });
      applyViewModeLocking();
      syncFilledUIState();
    }

    function addMemberProfileToEventLinks(data) {
      if (!data || !data.member_profile) return;
      const memberProfile = data.member_profile;
      document.querySelectorAll(".button.event-card").forEach(btn => {
        if (!btn.href) return;
        try {
          const url = new URL(btn.href, window.location.origin);
          url.searchParams.set("member_profile", memberProfile);
          btn.href = url.toString();
        } catch (err) {
          console.warn("[MEMBER] Invalid event URL:", btn.href);
        }
      });
    }

    function setViewModeButtons() { show(ui.editBtn); hide(ui.cancelBtn); hide(ui.submitWrapper); }
    function setEditModeButtons() { hide(ui.editBtn); show(ui.cancelBtn); show(ui.submitWrapper); }

    function onCancel() {
      setViewModeButtons();
      renderProfile(state.webhookData);
      syncFilledUIState();
      if (ui.profileTabBtn) ui.profileTabBtn.click();
    }

    function bindLiveCheckboxFill() {
      document.addEventListener("change", e => {
        if (!e.target.matches('input[type="checkbox"]')) return;
        const container = e.target.closest(".checkbox-container");
        if (!container) return;
        if (e.target.checked) container.classList.add("filled");
        else container.classList.remove("filled");
      });
    }

    function bindButtons() {
      ui.editBtn.addEventListener("click", e => { e.preventDefault(); setEditModeButtons(); enterEditModeUI(); });
      ui.cancelBtn.addEventListener("click", e => { e.preventDefault(); onCancel(); });
    }

    function syncFilledUIState() {
      document.querySelectorAll(".field-text").forEach(el => {
        const text = (el.textContent || "").trim();
        if (text) el.classList.add("filled");
        else el.classList.remove("filled");
      });
      document.querySelectorAll(".selector-wrapper").forEach(wrapper => {
        if (wrapper.tagName === "INPUT") {
          if (wrapper.value && wrapper.value.trim()) wrapper.classList.add("filled");
          else wrapper.classList.remove("filled");
          return;
        }
        const select = wrapper.querySelector("select");
        if (select) {
          if (select.selectedIndex > 0) wrapper.classList.add("filled");
          else wrapper.classList.remove("filled");
          return;
        }
        const input = wrapper.querySelector("input");
        if (input) {
          if (input.value && input.value.trim()) wrapper.classList.add("filled");
          else wrapper.classList.remove("filled");
        }
      });
      document.querySelectorAll(".select-field").forEach(select => {
        if (select.value && select.value.trim()) {
          select.classList.add("filled");
          select.closest(".selector-wrapper")?.classList.add("filled");
        } else {
          select.classList.remove("filled");
          select.closest(".selector-wrapper")?.classList.remove("filled");
        }
      });
    }

    async function init() {
      setInitialUI();
      const data = await fetchProfileData();
      if (!data) return;
      state.webhookData = data;
      addMemberProfileToEventLinks(data);
      renderProfile(data);
      bindButtons();
      bindLiveCheckboxFill();
      setViewModeButtons();
    }

    init();
  });

  /*=========================================================
    SECTION 7 — PROFILE FORM SUBMIT
    src: fetch-update-profile.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("profile-form");
    const submitBtn = document.getElementById("submit-form");
    const memberIdEl = document.querySelector('[data-ms-member="id"]');
    if (!form || !submitBtn || !memberIdEl) return;
    const memberId = memberIdEl.textContent.trim();
    if (!memberId) return;

    submitBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      const payload = { member_id: memberId };

      form.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, textarea')
        .forEach(field => { if (field.name) payload[field.name] = field.value; });

      form.querySelectorAll('input[type="radio"]:checked')
        .forEach(radio => { if (radio.name) payload[radio.name] = radio.value; });

      const checkboxGroups = {};
      form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.name || !cb.checked) return;
        const option = cb.getAttribute("data-option");
        if (!option) return;
        if (!checkboxGroups[cb.name]) checkboxGroups[cb.name] = [];
        checkboxGroups[cb.name].push(option);
      });
      Object.entries(checkboxGroups).forEach(([key, values]) => { payload[key] = values.join(" / "); });

      console.log("[MEMBER] Profile update payload:", payload);
      try {
        const res = await fetch("https://houseofmore.nico-97c.workers.dev/member-profile-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        console.log("[MEMBER] Profile update status:", res.status);
        if (res.status === 200) {
          sessionStorage.setItem("forceClickProfile", "true");
          window.location.reload();
        } else {
          submitBtn.disabled = false;
          console.error("[MEMBER] Profile update returned non-200");
        }
      } catch (err) {
        submitBtn.disabled = false;
        console.error("[MEMBER] Profile update error:", err);
      }
    });
  });

  /*=========================================================
    SECTION 8 — MY EVENTS
    src: fetch-my-events.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const myEventsBtn = document.getElementById("my-events");
    const pastBtn = document.getElementById("past-events");
    const upcomingBtn = document.getElementById("upcoming-events");
    if (!myEventsBtn) return;

    const state = { bookedEventIds: [] };

    function filterBookedEventsByDate(type) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      $$(".event-item-wrapper.booked-event").forEach(wrapper => {
        const rawDate = wrapper.getAttribute("data-event-date") || wrapper.querySelector("[data-event-date]")?.getAttribute("data-event-date") || "";
        if (!rawDate) { wrapper.classList.add("hide"); return; }
        const eventDate = new Date(rawDate);
        if (isNaN(eventDate)) { console.warn("[MEMBER] Invalid event date:", rawDate); wrapper.classList.add("hide"); return; }
        eventDate.setHours(0, 0, 0, 0);
        const isPast = eventDate < today;
        wrapper.classList.toggle("hide", type === "upcoming" ? isPast : !isPast);
      });
    }

    function setActiveFilter(activeBtn, inactiveBtn) {
      if (activeBtn) activeBtn.classList.add("active");
      if (inactiveBtn) inactiveBtn.classList.remove("active");
    }

    if (upcomingBtn) upcomingBtn.addEventListener("click", () => { setActiveFilter(upcomingBtn, pastBtn); filterBookedEventsByDate("upcoming"); });
    if (pastBtn) pastBtn.addEventListener("click", () => { setActiveFilter(pastBtn, upcomingBtn); filterBookedEventsByDate("past"); });

    myEventsBtn.addEventListener("click", async () => {
      const memberId = $('[data-ms-member="id"]')?.textContent?.trim() || "";
      const memberEmail = $('[data-ms-member="email"]')?.textContent?.trim() || "";
      const memberRecordId = $('[data-field="member_profile"]')?.textContent?.trim() || "";
      console.log("[MEMBER] My Events — memberId:", memberId, "| memberEmail:", memberEmail, "| memberRecordId:", memberRecordId);
      if (!memberId || !memberEmail) { console.warn("[MEMBER] My Events — aborting, missing memberId or memberEmail"); return; }

      try {
        const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-list-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId, member_email: memberEmail, member_record_id: memberRecordId })
        });
        const parsed = JSON.parse(await response.text());
        console.log("[MEMBER] My Events webhook response:", parsed);
        if (!Array.isArray(parsed)) { console.warn("[MEMBER] My Events — response is not an array:", typeof parsed, parsed); return; }

        state.bookedEventIds = parsed.map(r => r?.data?.event_record_id?.toString().trim()).filter(Boolean);
        console.log("[MEMBER] bookedEventIds:", state.bookedEventIds);

        const allWrappers = $$("#my-collection-events .event-item-wrapper");
        console.log("[MEMBER] event wrappers found:", allWrappers.length);
        allWrappers.forEach(wrapper => { wrapper.classList.add("hide"); wrapper.classList.remove("booked-event"); });

        allWrappers.forEach(wrapper => {
          const recordEl = wrapper.querySelector(".event_record");
          if (!recordEl) return;
          const cmsEventId = recordEl.textContent.trim();
          if (!cmsEventId || !state.bookedEventIds.includes(cmsEventId)) return;

          wrapper.classList.remove("hide");
          wrapper.classList.add("booked-event");

          const recordData = parsed.find(r => r?.data?.event_record_id?.toString().trim() === cmsEventId);
          const status = recordData?.data?.status;
          const btn = wrapper.querySelector(".button.event-card.manage");
          if (btn?.href) {
            const url = new URL(btn.href, window.location.origin);
            url.searchParams.set("booked", "true");
            btn.href = url.toString();
          }
          if (status === "canceled") {
            wrapper.classList.add("canceled");
            wrapper.querySelectorAll(".tag-booked").forEach(tag => { tag.classList.add("canceled"); tag.textContent = "Canceled"; });
            if (btn) btn.classList.add("hide");
          }
        });

        if (upcomingBtn) { setActiveFilter(upcomingBtn, pastBtn); filterBookedEventsByDate("upcoming"); }
      } catch (error) {
        console.error("[MEMBER] My Events error:", error);
      }
    });
  });

  /*=========================================================
    SECTION 9 — ONE-TIME DONATION
    src: donation-checkout.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const donateBtn = document.getElementById("on-time-donation");
    const amountInput = document.getElementById("donation-amount");
    if (!donateBtn) return;

    donateBtn.addEventListener("click", async () => {
      try {
        const member = await window.$memberstackDom.getCurrentMember();
        if (!member) { alert("You must be logged in to donate."); return; }
        const memberId = member.data.id;
        const email = member.data.email || document.querySelector('[data-ms-member="email"]')?.textContent?.trim();
        if (!amountInput) { alert("Donation amount input not found."); return; }
        const amount = Number(amountInput.value);
        if (!amount || amount <= 0) { alert("Please enter a valid amount."); return; }

        const response = await fetch("https://houseofmore.nico-97c.workers.dev/donation-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: Math.round(amount * 100), memberId, email })
        });
        let data;
        try { data = JSON.parse(await response.text()); }
        catch (err) { console.error("[MEMBER] Invalid JSON from donation checkout:", err); alert("Invalid response from server."); return; }
        if (!data.url) { alert("Checkout URL not returned."); return; }
        window.location.href = data.url;
      } catch (error) {
        console.error("[MEMBER] Donation checkout error:", error);
        alert("Something went wrong.");
      }
    });
  });

  /*=========================================================
    SECTION 10 — RECURRING DONATION PLAN SELECTOR
    src: donation-recurrent.js
  =========================================================*/
  const plans = {
    neighbor_18:    { amount: 18,   planId: "prc_neighbor-9d2107s4"  },
    supporter_36:   { amount: 36,   planId: "prc_supporter-l2200758" },
    advocate_54:    { amount: 54,   planId: "prc_advocate-cs1r05km"  },
    builder_100:    { amount: 100,  planId: "prc_builder-1l2207pl"   },
    sustainer_180:  { amount: 180,  planId: "prc_sustainer-7o1t05pv" },
    patron_360:     { amount: 360,  planId: "prc_patron-qo24071q"    },
    partner_540:    { amount: 540,  planId: "prc_partner-1n1x05r5"   },
    champion_1000:  { amount: 1000, planId: "prc_champion-fy28079v"  },
    visionary_1800: { amount: 1800, planId: "prc_visionary-iw2005dl" }
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const select = document.getElementById("membership-tier");
    const button = document.getElementById("recurrent-donation");
    if (!select || !button) return;

    function updatePlan() {
      const plan = plans[select.value];
      if (!plan) return;
      button.setAttribute("data-ms-price:update", plan.planId);
      button.dataset.amount = plan.amount;
      button.dataset.plan = select.value;
      console.log("[MEMBER] Plan updated:", plan);
    }

    // Pre-select the member's current plan
    try {
      const member = await window.$memberstackDom.getCurrentMember();
      const connections = member?.data?.planConnections || [];
      console.log("[MEMBER] All plan connections:", JSON.stringify(connections));
      const donationPlanIds = new Set(Object.values(plans).map(p => p.planId));
      const activeDonationPlan = connections.find(c => donationPlanIds.has(c.payment?.priceId));
      const currentPlanId = activeDonationPlan?.payment?.priceId || "";
      console.log("[MEMBER] Current donation plan ID:", currentPlanId);
      const matchingKey = Object.keys(plans).find(key => plans[key].planId === currentPlanId);
      if (matchingKey) {
        select.value = matchingKey;
        console.log("[MEMBER] Pre-selected plan:", matchingKey);
      }
    } catch (err) {
      console.warn("[MEMBER] Could not pre-select plan:", err);
    }

    select.addEventListener("change", updatePlan);
    updatePlan();
  });

  /*=========================================================
    SECTION 11 — DONATION HISTORY
    src: donation-history.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", async () => {
    if (_donationConfirmed) {
      console.log("[MEMBER] Donation confirmed — waiting 4s for webhook to process...");
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    try {
      const template = document.querySelector(".donation-template:not([data-donation-clone='true'])");
      if (!template) return;
      const container = template.parentElement;
      const memberIdEl = document.querySelector('[data-ms-member="id"]');
      if (!memberIdEl) return;
      const memberId = memberIdEl.textContent.trim();

      const response = await fetch("https://houseofmore.nico-97c.workers.dev/donation-list-mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId })
      });
      const records = await response.json();
      if (!Array.isArray(records) || records.length === 0) return;

      records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      template.style.display = "none";
      let totalImpact = 0;

      records.forEach(record => {
        if (!record?.data) return;
        const clone = template.cloneNode(true);
        clone.setAttribute("data-donation-clone", "true");
        clone.style.removeProperty("display");
        const amount = (Number(record.data.amount) || 0) / 100;
        totalImpact += amount;
        const amountEl = clone.querySelector(".donation-amount");
        if (amountEl) amountEl.textContent = "$" + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const typeEl = clone.querySelector(".donation-type");
        if (typeEl) typeEl.textContent = record.data.type === "subscription" ? "Monthly" : "One-Time";
        const dateEl = clone.querySelector(".donated-at");
        if (dateEl) dateEl.textContent = new Date(record.createdAt).toLocaleDateString();
        container.appendChild(clone);
      });

      const impactEl = document.querySelector(".impact-value");
      if (impactEl) impactEl.textContent = "$" + totalImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (error) {
      console.error("[MEMBER] Donation history error:", error);
    }
  });

  /*=========================================================
    SECTION 12 — FACILITATOR EVENTS
    src: facilitator-events.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".facilitator-event").forEach(event => event.classList.add("hide"));

    document.addEventListener("click", async (e) => {
      const button = e.target.closest(".app-button.facilitator-events");
      if (!button) return;

      const emailElement = document.querySelector('[data-ms-member="email"]');
      if (!emailElement) return;
      const memberEmail = emailElement.textContent.trim().toLowerCase();

      const events = document.querySelectorAll(".facilitator-event");
      events.forEach(ev => ev.classList.add("hide"));
      events.forEach(ev => {
        const emailEl = ev.querySelector(".event-facilitator-email");
        if (!emailEl || emailEl.textContent.trim().toLowerCase() !== memberEmail) return;
        ev.classList.remove("hide");
        const link = ev.querySelector(".icon-wrapper.view-record-event");
        if (link?.href) {
          const url = new URL(link.href, window.location.origin);
          url.searchParams.set("admin", "true");
          link.href = url.toString();
        }
      });

      const visibleEvents = document.querySelectorAll(".facilitator-event:not(.hide)");
      visibleEvents.forEach(async event => {
        const recordEl = event.querySelector(".event-record-id");
        if (!recordEl) return;
        const eventRecordId = recordEl.textContent.trim();
        if (!eventRecordId) return;
        try {
          const response = await fetch("https://houseofmore.nico-97c.workers.dev/facilitator-list-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_record_id: eventRecordId })
          });
          let data;
          try { data = JSON.parse(await response.text()); }
          catch (err) { console.error("[MEMBER] Facilitator events parse error:", err); return; }
          Object.entries(data).forEach(([key, value]) => {
            const field = event.querySelector(`[data-field="${key}"]`);
            if (field) field.textContent = value;
          });
        } catch (err) {
          console.error("[MEMBER] Facilitator events error:", err);
        }
      });
    });
  });

  /*=========================================================
    SECTION 13 — MESSAGES
    src: messages.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", () => {
    const memberIdEl = document.querySelector('[data-ms-member="id"]');
    const memberId = (memberIdEl?.textContent || "").trim();
    if (!memberId) return;

    const messageView = document.querySelector(".message-view");
    const messageList = document.getElementById("messages-list");
    const newMessageBtn = document.getElementById("new-message");
    const backToListBtn = document.getElementById("back-to-list");
    const deleteMessageBtn = document.getElementById("delete-message");

    function showMessageView() {
      if (messageView) messageView.classList.remove("hide-mobile-landscape");
      if (messageList) messageList.classList.add("hide-mobile-landscape");
      if (newMessageBtn) newMessageBtn.classList.add("hide-mobile-landscape");
      if (backToListBtn) backToListBtn.classList.remove("hide");
    }
    function showMessageList() {
      if (messageView) messageView.classList.add("hide-mobile-landscape");
      if (messageList) messageList.classList.remove("hide-mobile-landscape");
      if (newMessageBtn) newMessageBtn.classList.remove("hide-mobile-landscape");
      if (backToListBtn) backToListBtn.classList.add("hide");
    }
    function updateMessagesAlert() {
      const alertEl = document.querySelector(".app-button.messages .alert");
      if (!alertEl) return;
      const visibleRows = Array.from(document.querySelectorAll(".message-row")).filter(row => {
        const item = row.closest(".message-item");
        return !item || !item.classList.contains("hide");
      });
      const hasUnread = visibleRows.some(row => !row.classList.contains("read"));
      if (hasUnread) alertEl.classList.remove("hide");
      else alertEl.classList.add("hide");
    }
    function safeParseJSON(value) {
      try { return JSON.parse(value); }
      catch (error) { console.error("[MEMBER] JSON parse error:", error); return null; }
    }
    function renderRow(row) {
      if (!row) return;
      document.querySelectorAll(".message-row").forEach(item => item.classList.remove("active"));
      row.classList.add("active");
      row.querySelectorAll("[data-field]").forEach(field => {
        const key = field.getAttribute("data-field");
        if (!key) return;
        const target = document.getElementById(key);
        if (target) target.innerHTML = field.innerHTML;
      });
    }
    function updateRowFromWebhook(rawResponse, targetRow) {
      if (!rawResponse || !targetRow) return;
      const trimmed = String(rawResponse).trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
      const parsed = safeParseJSON(trimmed);
      if (!parsed) return;
      let isRead = false, isErased = false;
      if (Array.isArray(parsed) && parsed[0]?.body?.data?.data) {
        const rowData = parsed[0].body.data.data;
        isRead = String(rowData.read || "").toLowerCase() === "true";
        isErased = String(rowData.erased || "").toLowerCase() === "true";
      } else {
        isRead = String(parsed?.read || parsed?.data?.read || "").toLowerCase() === "true";
        isErased = String(parsed?.erased || parsed?.data?.erased || "").toLowerCase() === "true";
      }
      if (isRead) targetRow.classList.add("read");
      if (isErased) targetRow.closest(".message-item")?.classList.add("hide");
      updateMessagesAlert();
    }

    // Load messages on page load
    (async () => {
      try {
        const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-messages-load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId })
        });
        const rawResponse = await response.text();
        console.log("[MEMBER] Messages load response:", rawResponse);
        const parsed = safeParseJSON(rawResponse);
        const records = parsed?.data?.records || [];
        document.querySelectorAll(".message-row").forEach(row => {
          const messageId = (row.querySelector('[data-field="message-id"]')?.textContent || "").trim();
          const matched = records.find(r => r?.data?.message_record_id === messageId);
          if (!matched) return;
          if (String(matched.data.read || "").toLowerCase() === "true") row.classList.add("read");
          if (String(matched.data.erased || "").toLowerCase() === "true") row.closest(".message-item")?.classList.add("hide");
        });
        updateMessagesAlert();
      } catch (error) {
        console.error("[MEMBER] Messages load error:", error);
      }
    })();

    // Click message row
    document.addEventListener("click", async (e) => {
      const row = e.target.closest(".message-row");
      if (!row) return;
      renderRow(row);
      showMessageView();
      const messageId = (row.querySelector('[data-field="message-id"]')?.textContent || "").trim();
      try {
        const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-message-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId, message_id: messageId, erased: false })
        });
        updateRowFromWebhook(await response.text(), row);
      } catch (error) {
        console.error("[MEMBER] Message click error:", error);
      }
    });

    // Messages tab click
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".app-button.messages");
      if (!btn) return;

      // Hide message view while loading
      if (messageView) messageView.classList.add("hide");

      // Apply filter
      const planEl = document.querySelector('[data-field="plan_name"]');
      const planName = (planEl?.textContent || "").trim().toLowerCase();
      const isFacilitator = planName.includes("facilitator");
      document.querySelectorAll(".message-item").forEach(item => {
        const recipient = (item.querySelector('[data-field="recipient"]')?.textContent || "").trim().toLowerCase();
        if (!isFacilitator && recipient === "facilitators") item.classList.add("hide");
      });
      updateMessagesAlert();

      // Find top visible row
      const topRow = Array.from(document.querySelectorAll(".message-row")).find(row => {
        const item = row.closest(".message-item");
        return !item || !item.classList.contains("hide");
      });
      if (!topRow) return;

      // Set active explicitly
      document.querySelectorAll(".message-row").forEach(r => r.classList.remove("active"));
      topRow.classList.add("active");

      // Copy fields to reading panel
      topRow.querySelectorAll("[data-field]").forEach(field => {
        const key = field.getAttribute("data-field");
        if (!key) return;
        const target = document.getElementById(key);
        if (target) target.innerHTML = field.innerHTML;
      });

      // Show message view
      if (messageView) messageView.classList.remove("hide");

      const messageId = (topRow.querySelector('[data-field="message-id"]')?.textContent || "").trim();
      try {
        const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-message-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId, message_id: messageId, erased: false })
        });
        updateRowFromWebhook(await response.text(), topRow);
      } catch (error) {
        console.error("[MEMBER] Messages tab error:", error);
      }
    });

    // Erase message
    document.addEventListener("click", async (e) => {
      const eraseBtn = e.target.closest("#erase-message");
      if (!eraseBtn) return;
      const activeRow = document.querySelector(".message-row.active") || document.querySelector(".message-row");
      if (!activeRow) return;
      const messageId = (activeRow.querySelector('[data-field="message-id"]')?.textContent || "").trim();
      try {
        const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-message-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId, message_id: messageId, erased: true })
        });
        if (response.ok) {
          activeRow.closest(".message-item")?.classList.add("hide");
          updateMessagesAlert();

          const nextRow = Array.from(document.querySelectorAll(".message-row")).find(row => {
            const item = row.closest(".message-item");
            return !item || !item.classList.contains("hide");
          });
          if (nextRow) {
            document.querySelectorAll(".message-row").forEach(r => r.classList.remove("active"));
            nextRow.classList.add("active");
            nextRow.querySelectorAll("[data-field]").forEach(field => {
              const key = field.getAttribute("data-field");
              if (!key) return;
              const target = document.getElementById(key);
              if (target) target.innerHTML = field.innerHTML;
            });
          }
        }
      } catch (error) {
        console.error("[MEMBER] Erase message error:", error);
      }
    });

    if (backToListBtn) backToListBtn.addEventListener("click", showMessageList);
    if (newMessageBtn) newMessageBtn.addEventListener("click", showMessageView);
    if (deleteMessageBtn) deleteMessageBtn.addEventListener("click", showMessageList);

    const firstRow = document.querySelector(".message-row");
    if (firstRow) firstRow.classList.add("active");

  });

})();
