(function () {
  "use strict";

  const BUTTON_TEXT = "全員に返信";
  const BUTTON_CLASS = "cwto-reply-all-button";
  const PROCESSING_CLASS = "is-processing";
  const BUTTON_SCAN_INTERVAL_MS = 800;
  const REPLY_SETTLE_TIMEOUT_MS = 2500;
  const REPLY_SETTLE_POLL_MS = 100;

  let observerStarted = false;
  let periodicScanId = null;

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findMessageRoot(element) {
    return element.closest(
      [
        "[data-mid]",
        "[data-message-id]",
        "[role='listitem']",
        ".message",
        ".chatMessage",
        "._message",
        ".sc-1j80sy4-0"
      ].join(",")
    );
  }

  function findActionContainer(messageRoot) {
    const selectors = [
      "[role='toolbar']",
      ".messageAction",
      ".messageActions",
      ".chatMessage__actions",
      ".sc-1s5v3hg-0",
      ".sc-1d9w3wq-0"
    ];

    for (const selector of selectors) {
      const container = messageRoot.querySelector(selector);
      if (container) {
        return container;
      }
    }

    return null;
  }

  function isReplyButtonCandidate(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const label = normalizeText(
      element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent
    );

    return /返信/.test(label) && !/全員に返信/.test(label);
  }

  function findReplyButton(messageRoot) {
    const selector = [
      "button",
      "a",
      "[role='button']"
    ].join(",");

    return Array.from(messageRoot.querySelectorAll(selector)).find(isReplyButtonCandidate) || null;
  }

  function findComposer() {
    const selectors = [
      "textarea",
      "[contenteditable='true']",
      ".CodeMirror textarea"
    ];

    for (const selector of selectors) {
      const composer = document.querySelector(selector);
      if (composer instanceof HTMLElement) {
        return composer;
      }
    }

    return null;
  }

  function getComposerValue(composer) {
    if (composer instanceof HTMLTextAreaElement) {
      return composer.value;
    }

    if (composer.isContentEditable) {
      return composer.innerText || composer.textContent || "";
    }

    return "";
  }

  function setComposerValue(composer, value) {
    if (composer instanceof HTMLTextAreaElement) {
      composer.focus();
      composer.value = value;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (composer.isContentEditable) {
      composer.focus();
      composer.textContent = value;
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    }
  }

  async function waitForReplyInsertion(composer, previousValue) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < REPLY_SETTLE_TIMEOUT_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, REPLY_SETTLE_POLL_MS));

      const currentValue = getComposerValue(composer);
      if (currentValue !== previousValue) {
        return currentValue;
      }
    }

    return getComposerValue(composer);
  }

  function extractReplySnippet(previousValue, currentValue) {
    if (currentValue === previousValue) {
      return "";
    }

    if (currentValue.endsWith(previousValue)) {
      return currentValue.slice(0, currentValue.length - previousValue.length);
    }

    if (currentValue.startsWith(previousValue)) {
      return currentValue.slice(previousValue.length);
    }

    const previousPattern = previousValue ? new RegExp(escapeRegExp(previousValue), "m") : null;
    if (previousPattern) {
      return currentValue.replace(previousPattern, "");
    }

    return currentValue;
  }

  function parseAccountId(rawValue) {
    if (!rawValue) {
      return null;
    }

    const value = String(rawValue);
    const direct = value.match(/^\d+$/);
    if (direct) {
      return direct[0];
    }

    const aidMatch = value.match(/aid(?:=|\/|:)(\d{4,})/i);
    if (aidMatch) {
      return aidMatch[1];
    }

    const chatworkMatch = value.match(/(?:users|members|account|contacts)\/(\d{4,})/i);
    if (chatworkMatch) {
      return chatworkMatch[1];
    }

    const trailingDigits = value.match(/(\d{4,})/);
    return trailingDigits ? trailingDigits[1] : null;
  }

  function extractAccountIdFromElement(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const candidateAttributes = [
      "data-aid",
      "data-account-id",
      "data-user-id",
      "data-member-id",
      "data-chatwork-id",
      "href",
      "for",
      "data-testid"
    ];

    for (const attribute of candidateAttributes) {
      const value = element.getAttribute(attribute);
      const accountId = parseAccountId(value);
      if (accountId) {
        return accountId;
      }
    }

    return null;
  }

  function extractMessageAuthor(messageRoot) {
    const authorSelectors = [
      "[data-aid]",
      "[data-account-id]",
      ".message__name",
      ".chatMessage__name",
      ".sc-14c2c9v-0",
      "header a",
      "header button"
    ];

    for (const selector of authorSelectors) {
      const candidate = messageRoot.querySelector(selector);
      if (!candidate) {
        continue;
      }

      const name = normalizeText(candidate.textContent);
      const accountId = extractAccountIdFromElement(candidate);
      if (name || accountId) {
        return {
          accountId,
          name
        };
      }
    }

    return null;
  }

  function inferCurrentUser() {
    const currentUserSelectors = [
      "[data-testid='profile-button']",
      "[aria-label*='プロフィール']",
      "[aria-label*='profile']",
      ".globalHeaderProfile",
      ".headerUserName"
    ];

    for (const selector of currentUserSelectors) {
      const candidate = document.querySelector(selector);
      if (!candidate) {
        continue;
      }

      const name = normalizeText(candidate.textContent);
      const accountId = extractAccountIdFromElement(candidate);
      if (name || accountId) {
        return {
          accountId,
          name
        };
      }
    }

    return null;
  }

  function collectMentionCandidates(messageRoot) {
    const candidates = [];
    const seenNodes = new Set();
    const selectors = [
      "[data-aid]",
      "[data-account-id]",
      "a[href*='aid=']",
      "a[href*='/users/']",
      "a[href*='/members/']",
      "span[title*='さん']",
      "span[title]",
      "a[title]"
    ];

    for (const selector of selectors) {
      const elements = messageRoot.querySelectorAll(selector);
      for (const element of elements) {
        if (seenNodes.has(element)) {
          continue;
        }
        seenNodes.add(element);

        const accountId = extractAccountIdFromElement(element);
        const name = normalizeText(
          element.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            element.textContent
        );

        if (!accountId && !name) {
          continue;
        }

        candidates.push({
          accountId,
          name
        });
      }
    }

    const bodyText = normalizeText(messageRoot.textContent);
    const toTagPattern = /\[To:(\d+)\]([^\[\]\n]+)/g;
    let match = null;
    while ((match = toTagPattern.exec(bodyText)) !== null) {
      candidates.push({
        accountId: match[1],
        name: normalizeText(match[2])
      });
    }

    return candidates;
  }

  function dedupeRecipients(candidates, currentUser, author) {
    const recipientMap = new Map();
    const currentUserId = currentUser && currentUser.accountId;
    const currentUserName = currentUser && normalizeText(currentUser.name);

    function shouldExclude(candidate) {
      if (!candidate) {
        return true;
      }

      const candidateName = normalizeText(candidate.name);
      if (currentUserId && candidate.accountId === currentUserId) {
        return true;
      }

      if (!currentUserId && currentUserName && candidateName && candidateName === currentUserName) {
        return true;
      }

      return false;
    }

    const mergedCandidates = [...candidates];
    if (author) {
      mergedCandidates.push(author);
    }

    for (const candidate of mergedCandidates) {
      if (shouldExclude(candidate)) {
        continue;
      }

      const normalizedName = normalizeText(candidate.name);
      const accountId = candidate.accountId || null;
      if (!accountId && !normalizedName) {
        continue;
      }

      const key = accountId ? `id:${accountId}` : `name:${normalizedName}`;
      if (!recipientMap.has(key)) {
        recipientMap.set(key, {
          accountId,
          name: normalizedName
        });
      }
    }

    return Array.from(recipientMap.values()).filter((recipient) => recipient.accountId && recipient.name);
  }

  function buildRecipientLines(recipients) {
    return recipients.map((recipient) => `[To:${recipient.accountId}]${recipient.name}`).join("\n");
  }

  function composeReplyAllText(replySnippet, recipientsText, previousValue) {
    const blocks = [normalizeText(replySnippet), recipientsText, previousValue];
    return blocks.filter(Boolean).join("\n");
  }

  async function handleReplyAllClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement) || button.classList.contains(PROCESSING_CLASS)) {
      return;
    }

    const messageRoot = findMessageRoot(button);
    if (!messageRoot) {
      return;
    }

    const replyButton = findReplyButton(messageRoot);
    const composer = findComposer();
    if (!replyButton || !composer) {
      window.alert("返信欄または返信ボタンを見つけられませんでした。画面を再読み込みしてから再度お試しください。");
      return;
    }

    button.classList.add(PROCESSING_CLASS);

    try {
      const previousValue = getComposerValue(composer);
      replyButton.click();
      const currentValue = await waitForReplyInsertion(composer, previousValue);
      const replySnippet = extractReplySnippet(previousValue, currentValue);

      const currentUser = inferCurrentUser();
      const author = extractMessageAuthor(messageRoot);
      const recipients = dedupeRecipients(collectMentionCandidates(messageRoot), currentUser, author);
      const recipientsText = buildRecipientLines(recipients);
      const nextValue = composeReplyAllText(replySnippet, recipientsText, previousValue);

      setComposerValue(composer, nextValue);
    } finally {
      button.classList.remove(PROCESSING_CLASS);
    }
  }

  function createReplyAllButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = BUTTON_TEXT;
    button.addEventListener("click", handleReplyAllClick);
    return button;
  }

  function injectReplyAllButtons() {
    const possibleMessages = document.querySelectorAll(
      [
        "[data-mid]",
        "[data-message-id]",
        "[role='listitem']",
        ".message",
        ".chatMessage",
        "article"
      ].join(",")
    );

    for (const messageRoot of possibleMessages) {
      const actionContainer = findActionContainer(messageRoot);
      const replyButton = findReplyButton(messageRoot);
      if (!actionContainer || !replyButton) {
        continue;
      }

      if (actionContainer.querySelector(`.${BUTTON_CLASS}`)) {
        continue;
      }

      const replyAllButton = createReplyAllButton();
      replyButton.insertAdjacentElement("beforebegin", replyAllButton);
    }
  }

  function startObservers() {
    if (observerStarted) {
      return;
    }

    observerStarted = true;
    injectReplyAllButtons();

    const observer = new MutationObserver(() => {
      injectReplyAllButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    periodicScanId = window.setInterval(injectReplyAllButtons, BUTTON_SCAN_INTERVAL_MS);
    window.addEventListener("beforeunload", () => {
      if (periodicScanId !== null) {
        window.clearInterval(periodicScanId);
      }
      observer.disconnect();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObservers, { once: true });
  } else {
    startObservers();
  }
})();
