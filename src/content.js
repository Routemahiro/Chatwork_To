(function () {
  "use strict";

  const BUTTON_TEXT = "全員に返信";
  const BUTTON_CLASS = "cwto-reply-all-button";
  const PROCESSING_CLASS = "is-processing";
  const REPLY_SETTLE_TIMEOUT_MS = 2500;
  const REPLY_SETTLE_POLL_MS = 100;
  const STORAGE_KEY_SELF_ACCOUNT_ID = "selfAccountId";
  const MESSAGE_ROOT_SELECTOR = [
    "[data-mid]",
    "[data-message-id]",
    "[role='listitem']",
    ".message",
    ".chatMessage",
    "article"
  ].join(",");

  let observerStarted = false;
  let cachedSettings = {
    selfAccountId: ""
  };

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function trimPreservingLines(value) {
    return (value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeAccountId(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function loadSettings() {
    return new Promise((resolve) => {
      if (!chrome.storage || !chrome.storage.sync) {
        resolve(cachedSettings);
        return;
      }

      chrome.storage.sync.get({ [STORAGE_KEY_SELF_ACCOUNT_ID]: "" }, (result) => {
        cachedSettings = {
          selfAccountId: normalizeAccountId(result[STORAGE_KEY_SELF_ACCOUNT_ID])
        };
        resolve(cachedSettings);
      });
    });
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
    const replyButton = findReplyButton(messageRoot);
    if (replyButton && replyButton.parentElement) {
      return replyButton.parentElement;
    }

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

    if (element.classList.contains(BUTTON_CLASS)) {
      return false;
    }

    const label = normalizeText(
      element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent
    );

    if (!label || label === BUTTON_TEXT) {
      return false;
    }

    const normalizedLabel = label.replace(/\s+/g, "");
    return normalizedLabel === "返信";
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

  function parseAccountId(rawValue, attributeName) {
    if (!rawValue) {
      return null;
    }

    const value = String(rawValue);
    const isStrictNumericAttribute =
      attributeName &&
      [
        "data-aid",
        "data-account-id",
        "data-user-id",
        "data-member-id",
        "data-chatwork-id"
      ].includes(attributeName);

    if (isStrictNumericAttribute) {
      const direct = value.match(/^\d+$/);
      if (direct) {
        return direct[0];
      }
    }

    const aidMatch = value.match(/aid(?:=|\/|:)(\d{4,})/i);
    if (aidMatch) {
      return aidMatch[1];
    }

    const chatworkMatch = value.match(
      /(?:users|members|account|contacts|contact)\/(\d{4,})/i
    );
    if (chatworkMatch) {
      return chatworkMatch[1];
    }

    return null;
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
      const accountId = parseAccountId(value, attribute);
      if (accountId) {
        return accountId;
      }
    }

    return null;
  }

  function isLikelyUrl(value) {
    return /^https?:\/\//i.test(value) || /^www\./i.test(value);
  }

  function isLikelyToBadge(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const text = normalizeText(element.textContent);
    if (text !== "TO") {
      return false;
    }

    const className = typeof element.className === "string" ? element.className : "";
    return /to/i.test(className) || text === "TO";
  }

  function isLikelyRecipientName(value) {
    const text = normalizeText(value);
    if (!text || text === "TO") {
      return false;
    }

    if (isLikelyUrl(text)) {
      return false;
    }

    if (/^\d+$/.test(text)) {
      return false;
    }

    if (/^(返信|リアクション|引用|ブックマーク|タスク|リンク)$/.test(text)) {
      return false;
    }

    return true;
  }

  function trimRecipientDisplayName(value) {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }

    const sanMatch = text.match(/^(.*?さん)/);
    if (sanMatch) {
      return sanMatch[1];
    }

    return text;
  }

  function extractFirstMeaningfulLine(value) {
    const lines = String(value || "")
      .split(/\r?\n/)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    return trimRecipientDisplayName(lines[0] || "");
  }

  function readRecipientNameFromSiblings(tagElement) {
    let current = tagElement.nextSibling;

    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        const text = extractFirstMeaningfulLine(current.textContent || "");
        if (isLikelyRecipientName(text)) {
          return text;
        }
      }

      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current;

        if (
          element instanceof HTMLElement &&
          element.hasAttribute("data-cwtag") &&
          /^\[(?:To|rp)\b/i.test(element.getAttribute("data-cwtag") || "")
        ) {
          return "";
        }

        const text = extractFirstMeaningfulLine(element.textContent || "");
        if (isLikelyRecipientName(text)) {
          return text;
        }
      }

      current = current.nextSibling;
    }

    return "";
  }

  function collectRecipientsFromChatworkTags(messageRoot) {
    const tagElements = messageRoot.querySelectorAll("[data-cwtag^='[To:']");
    const recipients = [];
    for (const tagElement of tagElements) {
      const cwtag = tagElement.getAttribute("data-cwtag") || "";
      const accountId = parseAccountId(cwtag);
      const embeddedAccountId =
        accountId || extractAccountIdFromElement(tagElement.querySelector("[data-aid], [data-account-id], button, img"));
      const name = readRecipientNameFromSiblings(tagElement);

      if (!embeddedAccountId || !isLikelyRecipientName(name)) {
        continue;
      }

      recipients.push({
        accountId: embeddedAccountId,
        name
      });
    }

    return recipients;
  }

  function collectRecipientsFromToBadges(messageRoot) {
    const badgeCandidates = Array.from(
      messageRoot.querySelectorAll(".chatTimeLineTo, span, div, button, a, strong, b")
    ).filter(isLikelyToBadge);

    const recipients = [];
    for (const badge of badgeCandidates) {
      const tagContainer = badge.closest("[data-cwtag^='[To:']") || badge.parentElement;
      if (!tagContainer) {
        continue;
      }

      const accountId =
        parseAccountId(tagContainer.getAttribute("data-cwtag") || "") ||
        extractAccountIdFromElement(tagContainer.querySelector("[data-aid], [data-account-id], button, img"));
      const name = readRecipientNameFromSiblings(tagContainer);

      if (!accountId || !isLikelyRecipientName(name)) {
        continue;
      }

      recipients.push({ accountId, name });
    }

    return recipients;
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
    const candidates = collectRecipientsFromChatworkTags(messageRoot);
    if (candidates.length === 0) {
      candidates.push(...collectRecipientsFromToBadges(messageRoot));
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

  function dedupeRecipients(candidates, currentUser, author, settings) {
    const recipientMap = new Map();
    const configuredSelfAccountId = normalizeAccountId(settings && settings.selfAccountId);
    const currentUserId = configuredSelfAccountId || (currentUser && currentUser.accountId);
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
    const blocks = [trimPreservingLines(replySnippet), recipientsText, previousValue];
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
      const settings = await loadSettings();
      const previousValue = getComposerValue(composer);
      replyButton.click();
      const currentValue = await waitForReplyInsertion(composer, previousValue);
      const replySnippet = extractReplySnippet(previousValue, currentValue);

      const currentUser = inferCurrentUser();
      const author = extractMessageAuthor(messageRoot);
      const recipients = dedupeRecipients(collectMentionCandidates(messageRoot), currentUser, author, settings);
      const recipientsText = buildRecipientLines(recipients);
      const nextValue = composeReplyAllText(replySnippet, recipientsText, previousValue);

      setComposerValue(composer, nextValue);
    } finally {
      button.classList.remove(PROCESSING_CLASS);
    }
  }

  function createReplyAllButton() {
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const pathOne = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const pathTwo = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const label = document.createElement("span");

    button.type = "button";
    button.className = BUTTON_CLASS;
    button.setAttribute("aria-label", BUTTON_TEXT);

    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("width", "14");
    icon.setAttribute("height", "14");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("class", "cwto-reply-all-icon");

    pathOne.setAttribute(
      "d",
      "M6.2 4.2 2.5 8l3.7 3.8"
    );
    pathOne.setAttribute("fill", "none");
    pathOne.setAttribute("stroke", "currentColor");
    pathOne.setAttribute("stroke-linecap", "round");
    pathOne.setAttribute("stroke-linejoin", "round");
    pathOne.setAttribute("stroke-width", "1.6");

    pathTwo.setAttribute(
      "d",
      "M3 8h5.4c2.6 0 4.6 1.3 5.6 3.5M8.8 4.5c2.1.1 3.8 1.2 4.9 3"
    );
    pathTwo.setAttribute("fill", "none");
    pathTwo.setAttribute("stroke", "currentColor");
    pathTwo.setAttribute("stroke-linecap", "round");
    pathTwo.setAttribute("stroke-linejoin", "round");
    pathTwo.setAttribute("stroke-width", "1.6");

    icon.appendChild(pathOne);
    icon.appendChild(pathTwo);

    label.className = "cwto-reply-all-label";
    label.textContent = BUTTON_TEXT;

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener("click", handleReplyAllClick);
    return button;
  }

  function injectReplyAllButton(messageRoot) {
    if (!(messageRoot instanceof Element)) {
      return;
    }

    const replyButton = findReplyButton(messageRoot);
    const actionContainer = findActionContainer(messageRoot);
    if (!actionContainer || !replyButton) {
      return;
    }

    if (actionContainer.querySelector(`.${BUTTON_CLASS}`)) {
      return;
    }

    const replyAllButton = createReplyAllButton();
    const replyButtonStyle = window.getComputedStyle(replyButton);
    replyAllButton.style.color = replyButtonStyle.color;
    replyButton.insertAdjacentElement("beforebegin", replyAllButton);
  }

  function handleMessageHover(event) {
    const messageRoot = findMessageRoot(event.target);
    if (!messageRoot || !(messageRoot instanceof Element) || !messageRoot.matches(MESSAGE_ROOT_SELECTOR)) {
      return;
    }

    injectReplyAllButton(messageRoot);
  }

  function startObservers() {
    if (observerStarted) {
      return;
    }

    observerStarted = true;
    loadSettings();
    document.addEventListener("mouseover", handleMessageHover, true);

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync" || !changes[STORAGE_KEY_SELF_ACCOUNT_ID]) {
          return;
        }

        cachedSettings.selfAccountId = normalizeAccountId(
          changes[STORAGE_KEY_SELF_ACCOUNT_ID].newValue
        );
      });
    }

    window.addEventListener("beforeunload", () => {
      document.removeEventListener("mouseover", handleMessageHover, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObservers, { once: true });
  } else {
    startObservers();
  }
})();
