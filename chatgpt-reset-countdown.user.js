// ==UserScript==
// @name         ChatGPT Usage Reset Countdown
// @namespace    vm-chatgpt-reset-countdown
// @version      1.2.0
// @description  Lightweight reset countdown plus targeted “used” label conversion with minimal CPU overhead.
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// @author       Zytact
// ==/UserScript==

(function () {
  'use strict';

  const COUNTDOWN_CLASS = 'vm-reset-countdown';
  const PREFIX = 'How long before reset: ';
  const resetElements = new Set();
  let discoverTimer = null;

  function parseResetDate(text) {
    const cleaned = text.replace(/^\s*Resets\s*/i, '').trim();
    if (!cleaned) return null;

    const date = new Date(cleaned);
    if (!Number.isNaN(date.getTime())) return date;

    return null;
  }

  function formatRemaining(ms) {
    if (ms <= 0) return 'less than 1m';

    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function getOrCreateCountdownLine(resetEl) {
    let line = resetEl.nextElementSibling;
    if (line && line.classList.contains(COUNTDOWN_CLASS)) return line;

    line = document.createElement('span');
    line.className = COUNTDOWN_CLASS;
    line.style.display = 'block';
    line.style.width = '100%';
    line.style.fontSize = '12px';
    line.style.lineHeight = '1.4';
    line.style.marginTop = '2px';
    line.style.color = '#22c55e';
    resetEl.insertAdjacentElement('afterend', line);
    return line;
  }

  const USAGE_SELECTORS = [
    'article.border-token-border-subtle:nth-child(1) > header:nth-child(1) > div:nth-child(2) > span:nth-child(1)',
    'article.flex:nth-child(2) > header:nth-child(1) > div:nth-child(2) > span:nth-child(1)',
  ];
  const REMAINING_LABEL_SELECTORS = [
    'article.border-token-border-subtle:nth-child(1) > header:nth-child(1) > div:nth-child(2) > span:nth-child(2)',
  ];

  function toUsedText(valueText) {
    const match = (valueText || '').match(/(\d+(?:\.\d+)?)\s*%/);
    if (!match) return null;

    const remaining = Number(match[1]);
    if (Number.isNaN(remaining)) return null;

    const used = Math.max(0, Math.min(100, 100 - remaining));
    const usedText = Number.isInteger(used) ? String(used) : used.toFixed(1).replace(/\.0$/, '');
    return `${usedText}% used`;
  }

  function convertRemainingToUsed() {
    for (const selector of REMAINING_LABEL_SELECTORS) {
      const label = document.querySelector(selector);
      if (!label) continue;
      label.textContent = '';
      label.style.display = 'none';
    }

    for (const selector of USAGE_SELECTORS) {
      const el = document.querySelector(selector);
      if (!el) continue;

      const next = toUsedText(el.textContent || '');
      if (!next) continue;

      if (el.textContent !== next) el.textContent = next;
    }
  }

  function discoverResetElements(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const text = node.nodeValue?.trim();
      if (!text || !/^Resets\s+/i.test(text)) continue;

      const el = node.parentElement;
      if (!el) continue;

      // Prefer leaf-ish nodes so we don't match big container blocks.
      if (el.childElementCount > 0) continue;

      resetElements.add(el);
    }
  }

  function updateCountdowns() {
    for (const resetEl of resetElements) {
      if (!document.contains(resetEl)) {
        resetElements.delete(resetEl);
        continue;
      }

      const countdownLine = getOrCreateCountdownLine(resetEl);
      const resetDate = parseResetDate(resetEl.textContent || '');

      countdownLine.textContent = resetDate
        ? `${PREFIX}${formatRemaining(resetDate.getTime() - Date.now())}`
        : `${PREFIX}unavailable`;
    }
  }

  function scheduleDiscover(root) {
    if (discoverTimer) return;
    discoverTimer = setTimeout(() => {
      discoverTimer = null;
      discoverResetElements(root || document.body);
      updateCountdowns();
    }, 300);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType === Node.ELEMENT_NODE && n.textContent && /Resets\s+/i.test(n.textContent)) {
          scheduleDiscover(n);
          return;
        }
        if (n.nodeType === Node.TEXT_NODE && n.nodeValue && /Resets\s+/i.test(n.nodeValue)) {
          scheduleDiscover(m.target);
          return;
        }
      }
    }
  });

  discoverResetElements();
  convertRemainingToUsed();
  updateCountdowns();

  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(() => {
    convertRemainingToUsed();
    updateCountdowns();
  }, 2000);
})();



