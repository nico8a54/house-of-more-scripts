document.addEventListener("DOMContentLoaded", () => {

  /*********************************************************
  0) ELEMENT REFERENCES FOR MOBILE LANDSCAPE TOGGLE
  *********************************************************/
  const messageView = document.querySelector(".message-view");
  const messageList = document.getElementById("messages-list");
  const newMessageBtn = document.getElementById("new-message");
  const backToListBtn = document.getElementById("back-to-list");
  const deleteMessageBtn = document.getElementById("delete-message");

  /*********************************************************
  0.1) GET MEMBER ID ONCE
  *********************************************************/
  const memberIdEl = document.querySelector('[data-ms-member="id"]');
  const memberId = (memberIdEl?.textContent || "").trim();

  console.log("MEMBER ID ELEMENT:", memberIdEl);
  console.log("MEMBER ID:", memberId);

  if (!memberId) {
    console.log("MEMBER ID NOT FOUND");
    return;
  }

  /*********************************************************
  0.2) SHOW MESSAGE VIEW
  *********************************************************/
  function showMessageView() {
    if (messageView) messageView.classList.remove("hide-mobile-landscape");
    if (messageList) messageList.classList.add("hide-mobile-landscape");
    if (newMessageBtn) newMessageBtn.classList.add("hide-mobile-landscape");
    if (backToListBtn) backToListBtn.classList.remove("hide");
  }

  /*********************************************************
  0.3) SHOW MESSAGE LIST
  *********************************************************/
  function showMessageList() {
    if (messageView) messageView.classList.add("hide-mobile-landscape");
    if (messageList) messageList.classList.remove("hide-mobile-landscape");
    if (newMessageBtn) newMessageBtn.classList.remove("hide-mobile-landscape");
    if (backToListBtn) backToListBtn.classList.add("hide");
  }

  /*********************************************************
  0.4) TOGGLE ALERT IF ANY MESSAGE IS UNREAD
  *********************************************************/
  function updateMessagesAlert() {
    const alertEl = document.querySelector(".app-button.messages .alert");
    if (!alertEl) return;

    const visibleRows = Array.from(document.querySelectorAll(".message-row")).filter(row => {
      const messageItem = row.closest(".message-item");
      return !messageItem || !messageItem.classList.contains("hide");
    });

    const hasUnread = visibleRows.some(row => {
      return !row.classList.contains("read");
    });

    if (hasUnread) {
      alertEl.classList.remove("hide");
    } else {
      alertEl.classList.add("hide");
    }
  }

  /*********************************************************
  1) FETCH WEBHOOK ON PAGE LOAD
  *********************************************************/
  async function loadMessagesWebhook() {
    try {
      const payload = {
        member_id: memberId
      };

      console.log("PAGE LOAD PAYLOAD:", payload);

      const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-messages-load", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const rawResponse = await response.text();
      console.log("PAGE LOAD WEBHOOK RESPONSE:", rawResponse);

      /*********************************************************
      1.1) PARSE RESPONSE AND MARK READ / ERASED MESSAGES
      *********************************************************/
      const parsed = safeParseJSON(rawResponse);
      const records = parsed?.data?.records || [];

      document.querySelectorAll(".message-row").forEach(row => {
        const messageIdEl = row.querySelector('[data-field="message-id"]');
        const messageId = (messageIdEl?.textContent || "").trim();

        const matchedRecord = records.find(record => {
          return record?.data?.message_record_id === messageId;
        });

        if (!matchedRecord) return;

        const isRead = String(matchedRecord?.data?.read || "").toLowerCase() === "true";
        const isErased = String(matchedRecord?.data?.erased || "").toLowerCase() === "true";

        if (isRead) {
          row.classList.add("read");
        }

        if (isErased) {
          const messageItem = row.closest(".message-item");
          if (messageItem) {
            messageItem.classList.add("hide");
          }
        }
      });

      updateMessagesAlert();

    } catch (error) {
      console.error("PAGE LOAD WEBHOOK ERROR:", error);
    }
  }

  loadMessagesWebhook();

  /*********************************************************
  2) SAFE JSON PARSER
  *********************************************************/
  function safeParseJSON(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error("JSON PARSE ERROR:", error);
      return null;
    }
  }

  /*********************************************************
  3) UPDATE ROW FROM SECOND WEBHOOK
  read = add .read to .message-row
  erased = add .hide to closest .message-item
  *********************************************************/
  function updateRowFromWebhook(rawResponse, targetRow) {
    if (!rawResponse || !targetRow) return;

    const trimmedResponse = String(rawResponse).trim();

    /*********************************************************
    3.1) SKIP NON JSON RESPONSES
    *********************************************************/
    if (
      !trimmedResponse.startsWith("{") &&
      !trimmedResponse.startsWith("[")
    ) {
      console.log("SECOND WEBHOOK RETURNED NON JSON:", trimmedResponse);
      return;
    }

    const parsed = safeParseJSON(trimmedResponse);
    if (!parsed) return;

    console.log("SECOND WEBHOOK PARSED RESPONSE:", parsed);

    let isRead = false;
    let isErased = false;

    if (Array.isArray(parsed) && parsed[0]?.body?.data?.data) {
      const rowData = parsed[0].body.data.data;
      isRead = String(rowData.read || "").toLowerCase() === "true";
      isErased = String(rowData.erased || "").toLowerCase() === "true";
    } else {
      isRead = String(
        parsed?.read ||
        parsed?.data?.read ||
        ""
      ).toLowerCase() === "true";

      isErased = String(
        parsed?.erased ||
        parsed?.data?.erased ||
        ""
      ).toLowerCase() === "true";
    }

    if (isRead) {
      targetRow.classList.add("read");
    }

    if (isErased) {
      const messageItem = targetRow.closest(".message-item");
      if (messageItem) {
        messageItem.classList.add("hide");
      }
    }

    updateMessagesAlert();
  }

  /*********************************************************
  4) RENDER ONE MESSAGE ROW
  Copies each [data-field="x"] into #x
  *********************************************************/
  function renderRow(row) {
    if (!row) return;

    document.querySelectorAll(".message-row").forEach(item => {
      item.classList.remove("active");
    });

    row.classList.add("active");

    row.querySelectorAll("[data-field]").forEach(field => {
      const key = field.getAttribute("data-field");
      if (!key) return;

      const target = document.getElementById(key);
      if (!target) return;

      target.innerHTML = field.innerHTML;
    });
  }

  /*********************************************************
  5) CLICK MESSAGE ITEM
  Each clicked row sends its own message id
  If second webhook returns read=true, add .read to that row
  If second webhook returns erased=true, hide closest .message-item
  *********************************************************/
  document.addEventListener("click", async (e) => {
    const row = e.target.closest(".message-row");
    if (!row) return;

    renderRow(row);
    showMessageView();

    const messageIdEl = row.querySelector('[data-field="message-id"]');
    const messageId = (messageIdEl?.textContent || "").trim();

    console.log("ROW MESSAGE ID:", messageId);

    try {
      const payload = {
        member_id: memberId,
        message_id: messageId,
        erased: false
      };

      console.log("ROW PAYLOAD:", payload);

      const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-message-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.text();
      console.log("ROW WEBHOOK RESPONSE:", result);

      /*********************************************************
      5.1) UPDATE CLICKED ROW
      *********************************************************/
      updateRowFromWebhook(result, row);

    } catch (error) {
      console.error("ROW WEBHOOK ERROR:", error);
    }
  });

  /*********************************************************
  6) BACK TO LIST
  *********************************************************/
  if (backToListBtn) {
    backToListBtn.addEventListener("click", () => {
      showMessageList();
    });
  }

  /*********************************************************
  7) NEW MESSAGE CLICK
  Same mobile landscape behavior as clicking .message-row
  *********************************************************/
  if (newMessageBtn) {
    newMessageBtn.addEventListener("click", () => {
      showMessageView();
    });
  }

  /*********************************************************
  8) DELETE MESSAGE CLICK
  Same mobile landscape behavior as clicking #back-to-list
  *********************************************************/
  if (deleteMessageBtn) {
    deleteMessageBtn.addEventListener("click", () => {
      showMessageList();
    });
  }

  /*********************************************************
  9) RENDER TOP MESSAGE ON PAGE LOAD
  *********************************************************/
  const firstRow = document.querySelector(".message-row");
  if (firstRow) {
    renderRow(firstRow);
  }

  /*********************************************************
  10) LOG PLAN NAME WHEN CLICKING MESSAGES TAB
  *********************************************************/
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".app-button.messages");
    if (!btn) return;

    const planEl = document.querySelector('[data-field="plan_name"]');
    if (!planEl) {
      console.log("PLAN NAME element not found");
      return;
    }

    console.log("PLAN NAME:", (planEl.textContent || "").trim());
  });

  /*********************************************************
  12) SEND ACTIVE MESSAGE ID WHEN CLICKING MESSAGES TAB
  If second webhook returns read=true, add .read to active row
  If second webhook returns erased=true, hide closest .message-item
  *********************************************************/
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".app-button.messages");
    if (!btn) return;

    /*********************************************************
    11) HIDE FACILITATOR ITEMS FOR NON FACILITATORS
    Hide the whole .message-item wrapper
    *********************************************************/
    const planEl = document.querySelector('[data-field="plan_name"]');
    const planName = (planEl?.textContent || "").trim().toLowerCase();
    const isFacilitator = planName.includes("facilitator");
    document.querySelectorAll(".message-item").forEach((item) => {
      const recipientEl = item.querySelector('[data-field="recipient"]');
      if (!recipientEl) return;
      const recipient = (recipientEl.textContent || "").trim().toLowerCase();
      if (!isFacilitator && recipient === "facilitators") {
        item.classList.add("hide");
      }
    });
    updateMessagesAlert();

    const activeRow = document.querySelector(".message-row.active") || document.querySelector(".message-row");
    if (!activeRow) {
      console.log("No message row found");
      return;
    }

    const messageIdEl = activeRow.querySelector('[data-field="message-id"]');
    const messageId = (messageIdEl?.textContent || "").trim();

    console.log("MESSAGE ID:", messageId);

    try {
      const payload = {
        member_id: memberId,
        message_id: messageId,
        erased: false
      };

      console.log("MESSAGES TAB PAYLOAD:", payload);

      const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-message-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.text();
      console.log("MESSAGES TAB WEBHOOK RESPONSE:", result);

      /*********************************************************
      12.1) UPDATE ACTIVE ROW
      *********************************************************/
      updateRowFromWebhook(result, activeRow);

    } catch (error) {
      console.error("MESSAGES TAB WEBHOOK ERROR:", error);
    }
  });

  /*********************************************************
  13) ERASE ACTIVE MESSAGE
  Sends same webhook with erased=true
  If webhook succeeds, hide closest .message-item immediately
  *********************************************************/
  document.addEventListener("click", async (e) => {
    const eraseBtn = e.target.closest("#erase-message");
    if (!eraseBtn) return;

    const activeRow = document.querySelector(".message-row.active") || document.querySelector(".message-row");
    if (!activeRow) {
      console.log("No active message row found for erase");
      return;
    }

    const messageIdEl = activeRow.querySelector('[data-field="message-id"]');
    const messageId = (messageIdEl?.textContent || "").trim();

    console.log("ERASE MESSAGE ID:", messageId);

    try {
      const payload = {
        member_id: memberId,
        message_id: messageId,
        erased: true
      };

      console.log("ERASE PAYLOAD:", payload);

      const response = await fetch("https://houseofmore.nico-97c.workers.dev/member-message-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.text();
      console.log("ERASE WEBHOOK RESPONSE:", result);
      console.log("ERASE WEBHOOK STATUS:", response.status);

      if (response.ok) {
        const messageItem = activeRow.closest(".message-item");
        if (messageItem) {
          messageItem.classList.add("hide");
        }
        updateMessagesAlert();
      }

    } catch (error) {
      console.error("ERASE WEBHOOK ERROR:", error);
    }
  });

});
