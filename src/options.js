(function () {
  "use strict";

  const STORAGE_KEY = "selfAccountId";
  const DEFAULT_ACCOUNT_ID = "807150";

  function normalizeAccountId(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function getElements() {
    return {
      input: document.getElementById("selfAccountId"),
      saveButton: document.getElementById("saveButton"),
      statusMessage: document.getElementById("statusMessage")
    };
  }

  function setStatus(message) {
    const { statusMessage } = getElements();
    if (statusMessage) {
      statusMessage.textContent = message;
    }
  }

  function loadSettings() {
    chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_ACCOUNT_ID }, (result) => {
      const { input } = getElements();
      if (!input) {
        return;
      }

      input.value = normalizeAccountId(result[STORAGE_KEY]);
    });
  }

  function saveSettings() {
    const { input } = getElements();
    if (!input) {
      return;
    }

    const selfAccountId = normalizeAccountId(input.value);
    input.value = selfAccountId;

    chrome.storage.sync.set({ [STORAGE_KEY]: selfAccountId }, () => {
      setStatus(selfAccountId ? "保存しました。" : "空で保存しました。自動判定にフォールバックします。");
      window.setTimeout(() => setStatus(""), 2500);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const { saveButton, input } = getElements();
    loadSettings();

    if (saveButton) {
      saveButton.addEventListener("click", saveSettings);
    }

    if (input) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveSettings();
        }
      });
    }
  });
})();
