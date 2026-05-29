// ==UserScript==
// @name         ChatGPT Usage Reset Countdown
// @namespace    vm-chatgpt-reset-countdown
// @version      1.0.0
// @description  Adds “How long before reset” countdown under ChatGPT usage reset timestamps.
// @match        https://chatgpt.com/codex/cloud/settings/analytics*
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
    }, 200);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.textContent && /Resets\s+/i.test(n.textContent)) {
            scheduleDiscover(n);
            return;
          }
        } else if (n.nodeType === Node.TEXT_NODE) {
          if (n.nodeValue && /Resets\s+/i.test(n.nodeValue)) {
            scheduleDiscover(m.target);
            return;
          }
        }
      }
    }
  });

  discoverResetElements();
  updateCountdowns();

  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(updateCountdowns, 60_000);
})();



