// ==UserScript==
// @name         Instagram Non-Followers Checker
// @namespace    vm-instagram-nonfollowers
// @version      1.4.0
// @description  Finds accounts that do not follow back for an exact username you enter, with stricter multi-pass fetch, profile pictures, and adaptive dark/light UI.
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @grant        none
// @run-at       document-idle
// @author       Zytact
// ==/UserScript==

(function () {
  'use strict';

  const APP_ID = '936619743392459';
  const COUNT = 50;
  const MAX_USERS_PER_LIST = 10_000;
  const COOLDOWN_MS = 30_000;
  const JITTER_MIN = 300;
  const JITTER_MAX = 900;

  const state = {
    running: false,
    cancel: false,
    cooldownUntil: 0,
    reverseSort: false,
    rawResults: [],
    filter: '',
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = () => JITTER_MIN + Math.floor(Math.random() * (JITTER_MAX - JITTER_MIN + 1));
  const now = () => Date.now();

  const ui = createUI();

  function createUI() {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

    const btn = document.createElement('button');
    btn.textContent = 'Find non-followers';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px'
    });
    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;';
    const modal = document.createElement('div');
    modal.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,92vw);height:min(80vh,760px);border-radius:12px;padding:14px;display:flex;flex-direction:column;font:14px system-ui;';
    overlay.appendChild(modal);

    const title = document.createElement('div');
    title.textContent = 'People not following you back';
    title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:8px;';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;';

    const progress = document.createElement('span');
    progress.textContent = 'Idle';
    progress.style.cssText = 'font-size:12px;color:#444;';

    const cancelBtn = mkBtn('Cancel');
    const closeBtn = mkBtn('Close');
    const copyBtn = mkBtn('Copy usernames');
    const csvBtn = mkBtn('Download CSV');
    const sortBtn = mkBtn('Sort A→Z');

    const filter = document.createElement('input');
    filter.placeholder = 'Filter by username or full name';
    filter.style.cssText = 'flex:1;min-width:220px;padding:8px;border-radius:8px;';

    row1.append(progress, cancelBtn, copyBtn, csvBtn, sortBtn, closeBtn);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
    row2.append(filter);

    const stats = document.createElement('div');
    stats.style.cssText = 'font-size:12px;color:#333;margin-bottom:8px;';

    const list = document.createElement('div');
    list.style.cssText = 'overflow:auto;border:1px solid #ddd;border-radius:8px;padding:8px;flex:1;background:#fafafa;';

    modal.append(title, row1, row2, stats, list);
    document.body.appendChild(overlay);

    btn.addEventListener('click', onRunClick);
    closeBtn.addEventListener('click', () => (overlay.style.display = 'none'));
    cancelBtn.addEventListener('click', () => {
      state.cancel = true;
      setProgress('Cancel requested...');
    });
    copyBtn.addEventListener('click', () => copyUsernames(state.rawResults));
    csvBtn.addEventListener('click', () => downloadCsv(state.rawResults));
    sortBtn.addEventListener('click', () => {
      state.reverseSort = !state.reverseSort;
      sortBtn.textContent = state.reverseSort ? 'Sort Z→A' : 'Sort A→Z';
      renderList();
    });
    filter.addEventListener('input', () => {
      state.filter = filter.value.trim().toLowerCase();
      renderList();
    });

    function mkBtn(text) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = 'padding:7px 10px;border-radius:8px;cursor:pointer;';
      return b;
    }

    function applyTheme() {
      const dark = colorScheme.matches;

      overlay.style.background = dark ? 'rgba(0,0,0,.72)' : 'rgba(0,0,0,.6)';

      modal.style.background = dark ? '#111827' : '#ffffff';
      modal.style.color = dark ? '#e5e7eb' : '#111111';
      modal.style.border = dark ? '1px solid #374151' : '1px solid #e5e7eb';

      Object.assign(btn.style, {
        border: dark ? '1px solid #6b7280' : '1px solid #333',
        background: dark ? '#111827' : '#111111',
        color: '#ffffff'
      });

      progress.style.color = dark ? '#d1d5db' : '#444';
      stats.style.color = dark ? '#d1d5db' : '#333';

      list.style.border = dark ? '1px solid #374151' : '1px solid #ddd';
      list.style.background = dark ? '#0b1220' : '#fafafa';

      filter.style.border = dark ? '1px solid #4b5563' : '1px solid #ccc';
      filter.style.background = dark ? '#111827' : '#ffffff';
      filter.style.color = dark ? '#f9fafb' : '#111111';
      filter.style.caretColor = dark ? '#f9fafb' : '#111111';

      [cancelBtn, closeBtn, copyBtn, csvBtn, sortBtn].forEach(b => {
        b.style.border = dark ? '1px solid #4b5563' : '1px solid #ccc';
        b.style.background = dark ? '#1f2937' : '#fff';
        b.style.color = dark ? '#f9fafb' : '#111';
      });
    }

    applyTheme();
    colorScheme.addEventListener('change', applyTheme);

    function setProgress(text) {
      progress.textContent = text;
    }

    function setStats(text) {
      stats.textContent = text;
    }

    function renderList() {
      const q = state.filter;
      let arr = [...state.rawResults].sort((a, b) => a.username.localeCompare(b.username));
      if (state.reverseSort) arr.reverse();
      if (q) arr = arr.filter(u => (u.username + ' ' + (u.full_name || '')).toLowerCase().includes(q));

      list.innerHTML = '';
      if (!arr.length) {
        list.textContent = 'No results.';
        return;
      }
      const frag = document.createDocumentFragment();
      for (const u of arr) {
        const dark = colorScheme.matches;
        const row = document.createElement('div');
        row.style.cssText = `padding:6px 4px;border-bottom:1px solid ${dark ? '#1f2937' : '#eee'};display:grid;grid-template-columns:40px 220px 1fr auto;gap:8px;align-items:center;`;

        const avatarWrap = document.createElement('div');
        avatarWrap.style.cssText = `width:32px;height:32px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:${dark ? '#374151' : '#e5e7eb'};color:${dark ? '#f3f4f6' : '#111827'};font-size:11px;font-weight:700;`;
        const avatar = document.createElement('img');
        avatar.src = u.profile_pic_url || '';
        avatar.alt = `${u.username} profile picture`;
        avatar.width = 32;
        avatar.height = 32;
        avatar.loading = 'lazy';
        avatar.style.cssText = 'width:32px;height:32px;object-fit:cover;display:block;';
        const fallbackText = (u.username || '?').slice(0, 2).toUpperCase();
        if (!u.profile_pic_url) {
          avatarWrap.textContent = fallbackText;
        } else {
          avatar.onerror = () => {
            avatar.remove();
            avatarWrap.textContent = fallbackText;
          };
          avatarWrap.appendChild(avatar);
        }

        const uname = document.createElement('code');
        uname.textContent = '@' + u.username;
        uname.style.color = dark ? '#c7d2fe' : '#1d4ed8';
        uname.style.fontWeight = '700';

        const full = document.createElement('span');
        full.textContent = u.full_name || '—';

        const a = document.createElement('a');
        a.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Open';
        a.style.color = dark ? '#93c5fd' : '#2563eb';

        row.append(avatarWrap, uname, full, a);
        frag.appendChild(row);
      }
      list.appendChild(frag);
    }

    return { overlay, setProgress, setStats, renderList };
  }

  async function onRunClick() {
    if (state.running) return;
    const left = state.cooldownUntil - now();
    if (left > 0) {
      alert(`Cooldown active. Try again in ${Math.ceil(left / 1000)}s.`);
      return;
    }

    ui.overlay.style.display = 'block';
    state.running = true;
    state.cancel = false;
    state.rawResults = [];
    state.filter = '';

    try {
      const inputUsername = prompt('Enter the exact Instagram username to analyze:');
      if (!inputUsername || !inputUsername.trim()) throw new Error('Username required.');

      ui.setProgress(`Resolving @${inputUsername.trim()}...`);
      const target = await resolveTargetFromUsername(inputUsername.trim());
      const userId = target.id;

      const following = await fetchFriendListStrict(userId, 'following');
      const followers = await fetchFriendListStrict(userId, 'followers');

      const followerIds = new Set(followers.map(u => String(u.pk)));
      const notFollowingBack = following.filter(u => !followerIds.has(String(u.pk)));

      state.rawResults = notFollowingBack.map(u => ({
        pk: String(u.pk),
        username: u.username || '',
        full_name: u.full_name || '',
        profile_pic_url:
          u.profile_pic_url ||
          u.profile_pic_url_hd ||
          u?.hd_profile_pic_url_info?.url ||
          '',
      }));

      ui.setProgress('Done');
      const mismatchWarnings = [];
      const tolerance = 3;
      if (typeof target.following_count === 'number' && following.length + tolerance < target.following_count) {
        mismatchWarnings.push(`following fetched ${following.length}/${target.following_count}`);
      }
      if (typeof target.follower_count === 'number' && followers.length + tolerance < target.follower_count) {
        mismatchWarnings.push(`followers fetched ${followers.length}/${target.follower_count}`);
      }
      const warningText = mismatchWarnings.length
        ? ` | ⚠ Possibly incomplete: ${mismatchWarnings.join(', ')}.`
        : '';
      ui.setStats(`Target: @${target.username} | Following: ${following.length} | Followers: ${followers.length} | Not following back: ${state.rawResults.length}${warningText}`);
      ui.renderList();
    } catch (err) {
      ui.setProgress('Stopped with error');
      ui.setStats(String(err?.message || err));
      ui.renderList();
    } finally {
      state.running = false;
      state.cooldownUntil = now() + COOLDOWN_MS;
    }
  }

  async function resolveTargetFromUsername(username) {
    const clean = username.replace(/^@+/, '').trim();
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`;
    const r = await fetch(url, { credentials: 'include', headers: { 'X-IG-App-ID': APP_ID } });
    if (!r.ok) throw new Error(`Could not resolve username @${clean} (HTTP ${r.status}).`);

    const j = await r.json().catch(() => ({}));
    const user = j?.data?.user;
    const id = user?.id;
    if (!id) throw new Error(`Could not resolve username @${clean}.`);

    return {
      id: String(id),
      username: user?.username || clean,
      follower_count: Number.isFinite(user?.edge_followed_by?.count) ? user.edge_followed_by.count : null,
      following_count: Number.isFinite(user?.edge_follow?.count) ? user.edge_follow.count : null,
    };
  }

  async function fetchFriendListStrict(userId, listName) {
    const pass1 = await fetchFriendListSinglePass(userId, listName, 1);
    const pass2 = await fetchFriendListSinglePass(userId, listName, 2);

    const merged = [];
    const seen = new Set();
    for (const u of [...pass1, ...pass2]) {
      const key = String(u?.pk ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(u);
      if (seen.size >= MAX_USERS_PER_LIST) break;
    }

    return merged;
  }

  async function fetchFriendListSinglePass(userId, listName, passNo) {
    let maxId = '';
    const out = [];
    const seen = new Set();
    const seenCursors = new Set();
    const rankToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let pages = 0;

    while (true) {
      if (state.cancel) throw new Error('Cancelled by user.');
      if (seen.size >= MAX_USERS_PER_LIST) {
        ui.setStats(`Warning: truncated at cap ${MAX_USERS_PER_LIST} for ${listName}.`);
        break;
      }

      const cursorKey = maxId || '__start__';
      if (seenCursors.has(cursorKey)) {
        ui.setStats(`Warning: cursor loop detected on ${listName} (pass ${passNo}).`);
        break;
      }
      seenCursors.add(cursorKey);

      const qs = new URLSearchParams({
        count: String(COUNT),
        search_surface: 'follow_list_page',
        rank_token: rankToken,
      });
      if (maxId) qs.set('max_id', maxId);

      const iUrl = `https://i.instagram.com/api/v1/friendships/${encodeURIComponent(userId)}/${listName}/?${qs}`;
      const wUrl = `https://www.instagram.com/api/v1/friendships/${encodeURIComponent(userId)}/${listName}/?${qs}`;

      ui.setProgress(`Fetching ${listName} (pass ${passNo}): page ${pages + 1}, collected ${seen.size}`);

      let r = await fetch(iUrl, {
        credentials: 'include',
        headers: {
          'X-IG-App-ID': APP_ID,
          Origin: 'https://www.instagram.com',
        },
      });
      if (!r.ok) {
        r = await fetch(wUrl, { credentials: 'include', headers: { 'X-IG-App-ID': APP_ID } });
      }

      if (r.status === 429) throw new Error(`Rate limited while fetching ${listName}. Partial results shown.`);
      if (!r.ok) throw new Error(`HTTP ${r.status} while fetching ${listName}.`);

      const j = await r.json().catch(() => ({}));
      if (j?.message === 'challenge_required') throw new Error('Instagram challenge required. Stopped for safety.');

      const users = Array.isArray(j?.users) ? j.users : [];
      for (const u of users) {
        const key = String(u?.pk ?? '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(u);
        if (seen.size >= MAX_USERS_PER_LIST) break;
      }

      pages += 1;
      if (!j?.next_max_id || j?.has_more === false) break;
      maxId = String(j.next_max_id);

      await sleep(jitter());
    }

    return out;
  }

  async function copyUsernames(items) {
    const text = items.map(x => x.username).join('\n');
    if (!text) return alert('No results to copy.');
    await navigator.clipboard.writeText(text);
    alert(`Copied ${items.length} usernames.`);
  }

  function downloadCsv(items) {
    if (!items.length) return alert('No results to export.');
    const esc = s => `"${String(s ?? '').replaceAll('"', '""')}"`;
    const lines = ['username,full_name,profile_url'];
    for (const u of items) {
      lines.push([u.username, u.full_name, `https://www.instagram.com/${u.username}/`].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `instagram-non-followers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
})();
