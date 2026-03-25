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
    SECTION 6 — MEMBER PROFILE FETCH + RENDER + EDIT UI (Supabase)
    src: member-profile-supabase.js
  =========================================================*/
  document.addEventListener("DOMContentLoaded", async () => {
    const ui = {
      memberIdEl:      document.querySelector('[data-ms-member="id"]'),
      editBtn:         document.getElementById("edit-form"),
      cancelBtn:       document.getElementById("cancel-profile-form"),
      submitWrapper:   document.querySelector(".submit-wrapper"),
      facilitatorMenu: document.querySelector(".menu-wrapper.facilitator"),
      profileTabBtn:   document.querySelector(".app-button.profile"),
    };
    if (!ui.memberIdEl) { console.warn("[MEMBER] No [data-ms-member='id'] element found."); return; }

    const state = { data: null };

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

    function applyViewModeLocking() {
      document.querySelectorAll(".text-area, .selector-wrapper, .checkbox-container")
        .forEach(el => el.classList.add("locked"));

      // Add .filled to all form elements (.field-text already has it by default in HTML)
      document.querySelectorAll("input, textarea, select, .selector-wrapper, .text-area")
        .forEach(el => el.classList.add("filled"));

      // Checkboxes: only show filled if checked, hide unchecked
      document.querySelectorAll(".checkbox-container").forEach(container => {
        const checkbox = container.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        if (checkbox.checked) { container.classList.add("filled"); container.classList.remove("hide"); }
        else { container.classList.remove("filled"); container.classList.add("hide"); }
      });
    }

    function enterEditModeUI() {
      // Remove .filled from all form elements
      document.querySelectorAll("input, textarea, select, .selector-wrapper, .text-area, .checkbox-container, .field-text, .select-field")
        .forEach(el => el.classList.remove("filled", "locked", "hide"));
      // Lock email — members cannot change it
      document.querySelectorAll('[data-field="email"], input[name="email"]')
        .forEach(el => el.classList.add("filled", "locked"));
    }

    function syncFilledUIState() {
      document.querySelectorAll(".selector-wrapper").forEach(wrapper => {
        if (wrapper.tagName === "INPUT") {
          if (wrapper.value?.trim()) wrapper.classList.add("filled");
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
          if (input.value?.trim()) wrapper.classList.add("filled");
          else wrapper.classList.remove("filled");
        }
      });
      document.querySelectorAll(".select-field").forEach(select => {
        const filled = !!(select.value?.trim());
        select.classList.toggle("filled", filled);
        select.closest(".selector-wrapper")?.classList.toggle("filled", filled);
      });
    }

    const PAY_PLANS = new Set(["advocate","builder","champion","neighbor","partner","patron","supporter","sustainer","visionary"]);

    function updateFacilitatorMenu(data) {
      hide(ui.facilitatorMenu);
      if (!ui.facilitatorMenu || !Array.isArray(data?.plan_name)) return;
      const hasFacilitator = data.plan_name.some(p => String(p?.planName || "").toLowerCase() === "facilitator");
      if (hasFacilitator) show(ui.facilitatorMenu);
    }

    function updateCancelPlan(data) {
      const cancelPlanEl = document.querySelector(".cancel-plan");
      if (!cancelPlanEl) return;
      const hasActivePayPlan = Array.isArray(data?.plan_name) && data.plan_name.some(plan => {
        if (!PAY_PLANS.has(String(plan?.planName || "").toLowerCase())) return false;
        const status = String(plan?.status || "").toLowerCase();
        return status !== "canceled" && status !== "cancelled";
      });
      cancelPlanEl.classList.toggle("hide", !hasActivePayPlan);
    }

    function addMemberProfileToEventLinks(data) {
      if (!data?.member_profile) return;
      document.querySelectorAll(".button.event-card").forEach(btn => {
        if (!btn.href) return;
        try {
          const url = new URL(btn.href, window.location.origin);
          url.searchParams.set("member_profile", data.member_profile);
          btn.href = url.toString();
        } catch (err) { console.warn("[MEMBER] Invalid event URL:", btn.href); }
      });
    }

    function renderFields(data) {
      const flat = { ...data, ...data.questionnaire };
      let rendered = 0;
      Object.entries(flat).forEach(([key, value]) => {
        if (Array.isArray(value) || (value !== null && typeof value === "object")) return;
        if (value === null || value === undefined) return;

        const checkboxes = document.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
        if (checkboxes.length) {
          const selected = String(value).split("/").map(normalizeOption);
          checkboxes.forEach(cb => {
            cb.checked = selected.includes(normalizeOption(cb.getAttribute("data-option") || ""));
          });
          rendered += checkboxes.length;
          return;
        }

        const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
        if (radios.length) {
          radios.forEach(radio => { radio.checked = radio.value === String(value); });
          rendered += radios.length;
          return;
        }

        const selectField = document.querySelector(`.select-field[data-field="${key}"]`);
        if (selectField) {
          const incoming = String(value).trim().toLowerCase();
          Array.from(selectField.options).forEach(opt => {
            if (opt.value.trim().toLowerCase() === incoming) selectField.value = opt.value;
          });
          rendered++;
          return;
        }

        let displayValue = key === "birthday" ? toDateInputValue(value) : value;
        const els = document.querySelectorAll(`[data-field="${key}"]`);
        els.forEach(el => {
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
            el.value = displayValue;
          } else {
            el.textContent = displayValue;
          }
          el.classList.add("filled");
          rendered++;
        });
      });
      console.log(`[MEMBER] renderFields — ${rendered} element(s) updated`);
    }

    function setViewModeButtons() { show(ui.editBtn); hide(ui.cancelBtn); hide(ui.submitWrapper); }
    function setEditModeButtons() { hide(ui.editBtn); show(ui.cancelBtn); show(ui.submitWrapper); }

    function onCancel() {
      setViewModeButtons();
      renderFields(state.data);
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
      if (ui.editBtn) ui.editBtn.addEventListener("click", e => { e.preventDefault(); setEditModeButtons(); enterEditModeUI(); });
      if (ui.cancelBtn) ui.cancelBtn.addEventListener("click", e => { e.preventDefault(); onCancel(); });
    }

    // Poll for member_id — Memberstack sets it asynchronously
    let tries = 0;
    const memberId = await new Promise(resolve => {
      const timer = setInterval(() => {
        tries++;
        const val = ui.memberIdEl.textContent.trim();
        if (val) { clearInterval(timer); resolve(val); return; }
        if (tries >= 30) { clearInterval(timer); resolve(null); }
      }, 200);
    });
    if (!memberId) { console.warn("[MEMBER] member_id not found after polling."); return; }

    setInitialUI();
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
    state.data = data;

    updateFacilitatorMenu(data);
    updateCancelPlan(data);
    addMemberProfileToEventLinks(data);
    renderFields(data);
    applyViewModeLocking();
    syncFilledUIState();
    bindButtons();
    bindLiveCheckboxFill();
    setViewModeButtons();
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
        const res = await fetch("https://houseofmore.nico-97c.workers.dev/member-profile-update-supabase", {
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

})();
