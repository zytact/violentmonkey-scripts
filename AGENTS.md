# AGENTS.md — Violentmonkey Scripts

## Overview

This repository contains custom [Violentmonkey](https://violentmonkey.github.io/) user scripts for browser automation and UI enhancements.

## Project Structure

```
.
├── AGENTS.md                          # This file — agent context & conventions
├── CLAUDE.md → AGENTS.md              # Symlink for Claude-aware tools
└── *.user.js                          # Individual Violentmonkey scripts
```

## Scripts

### `chatgpt-reset-countdown.user.js`
- **Purpose:** Resets the ChatGPT subscription countdown timer.
- **Match:** `https://chatgpt.com/*`
- **Status:** Active, single-file user script.

## Conventions

- Each script is a standalone `.user.js` file following the Violentmonkey metadata block format.
- Scripts should be self-contained with no external dependencies.
- Changes to a script's behavior must be reflected in its metadata (`@version`, `@description`, etc.).
- Use `GM_*` APIs sparingly and only when `unsafeWindow` is insufficient.
- Author should be 'Zytact'

## Agent Tasks

When working in this repo, an agent should:
1. Read the relevant `.user.js` file fully before making changes.
2. Update the `@version` field when modifying a script's behavior.
3. Preserve the Violentmonkey metadata block and all existing `@grant` declarations.
4. Test changes by reloading the script in the browser.
