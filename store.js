// Data store: loads the workbook tables, keeps an offline cache + write queue, syncs to Excel.
(function () {
  const C = window.APP_CONFIG;
  const B = window.Backend;

  const TABLES = {
    pipeline: { sheet: "Pipeline", table: "tblPipeline", key: "Deal ID", dates: ["Qualified Date", "Last Contact", "Next Step Date"] },
    accounts: { sheet: "Clients & Logos", table: "tblAccounts", key: "Account", dates: ["Next Step Date", "Logo Won Date", "First Requirement Date", "First Resource Deployed Date"] },
    meetings: { sheet: "Meetings", table: "tblMeetings", dates: ["Date"] },
    proposals: { sheet: "Proposals & Rates", table: "tblProposals", dates: ["Date Sent"] },
    requirements: { sheet: "Requirements", table: "tblRequirements", dates: ["Date Received"] },
    contracts: { sheet: "Contracts", table: "tblContracts", dates: ["Submitted Date", "Signed Date"] },
    outreach: { sheet: "Outreach Log", table: "tblOutreach", dates: ["Week Start (Mon)"] },
    events: { sheet: "Events & Referrals", table: "tblEvents", dates: ["Date"] },
    leads: { sheet: "Leads", table: "tblLeads", dates: ["Last Follow-up", "Next Follow-up"] },
    targets: { sheet: "Target Accounts", table: "tblTargets", key: "Account", dates: [] },
    commitments: { sheet: "Commitments", table: "tblCommitments", dates: ["Stand-up Date", "Due Date"] },
    intel: { sheet: "Market Intel", table: "tblIntel", dates: ["Date"] },
    contacts: { sheet: "Client Contacts", table: "tblClientContacts", dates: ["Last Follow-up", "Next Follow-up"] },
    activity: { sheet: "Activity Log", table: "tblActivity", dates: ["Date", "Next Step Date"], optional: true },
  };
  const ACTIVITY_HEADERS = ["Date", "Deal ID", "Account", "Contact", "Channel", "Outcome", "Notes", "Next Step", "Next Step Date", "Logged By"];
  // calculated columns (never written by the app)
  const CALC = new Set(["Probability", "Weighted Billing (INR)", "Days Since Contact", "Follow-up Status", "Gross Margin %", "Margin OK?",
    "First Resource Deployed?", "Logo Quarter", "Days Deployed", "Incentive Status", "Margin Check", "Days Open", "Days in Review",
    "Response Rate", "Meeting Rate", "Leads Captured", "Opps in Pipeline", "Account in Pipeline?", "Contacts in Pipeline", "Open Opps"]);
  const isCalc = (h) => CALC.has(h) || h.startsWith("_");

  const SETTING_NAMES = ["AsOfOverride", "AsOf", "MarginMin", "LogoTarget", "IncentiveDays", "IncentiveWarn", "NewWindow", "T_Email", "T_Call",
    "T_LinkedIn", "T_Meetings", "WeekStart", "QStart", "QEnd", "QLabel", "OKRDay", "WeekOfMonth", "Agenda", "MonthStart", "QNum"];
  const DEFAULT_LISTS = {
    Stage: ["Contacted", "Contact Established", "Discovery Meeting", "Qualified", "Proposal Sent", "Empanelment", "MSA / Contracting", "First Requirement", "Won - Deployed", "Nurture", "Lost"],
    StageProb: [0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 0.03, 0],
    Temp: ["Hot", "Warm", "Cool", "Cold"], TempScore: [30, 15, 5, 0],
  };

  // ---------------- dates (Excel serials, local calendar)
  const D = {
    today() { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) + 25569; },
    toJS(s) { return new Date((s - 25569) * 864e5); },               // UTC midnight
    fromISO(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5) + 25569; },
    toISO(s) { if (!isNum(s)) return ""; return D.toJS(s).toISOString().slice(0, 10); },
    weekday(s) { return D.toJS(s).getUTCDay(); },                    // 0 Sun
    weekStart(s) { const w = D.weekday(s); return s - ((w + 6) % 7); },
    addBiz(s, n) { let x = s; while (n > 0) { x++; const w = D.weekday(x); if (w !== 0 && w !== 6) n--; } return x; },
    nextMonday(s) { const w = D.weekday(s); return s + ((8 - w) % 7 || 7); },
    eom(s) { const d = D.toJS(s); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / 864e5) + 25569; },
    lastThursday(s) { const e = D.eom(s); const w = D.weekday(e); return e - ((w - 4 + 7) % 7); },
    fmt(s, opt) {
      if (!isNum(s)) return "";
      const t = D.today(), diff = s - t;
      if (!opt || !opt.abs) { if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday"; }
      return D.toJS(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC", ...(opt && opt.year ? { year: "2-digit" } : {}) });
    },
  };
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  // ---------------- state
  const LS = { cache: "pp.cache.v1", queue: "pp.queue.v1", today: "pp.today.v1" };
  const S = { ver: 0, tables: {}, settings: {}, lists: {}, etag: null, loadedAt: null, queue: [], status: "idle", error: null, listeners: [], lastWriteBy: "" };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  S.queue = load(LS.queue, []);

  function emit() { S.ver++; S.listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }
  function setStatus(st, err) { S.status = st; S.error = err || null; emit(); }

  // ---------------- parse workbook payload
  function sigOf(t, row) {
    const cfg = TABLES[t];
    if (cfg.key) return String(row[cfg.key] || "");
    const hs = S.tables[t].headers.filter((h) => !isCalc(h)).slice(0, 3);
    return JSON.stringify(hs.map((h) => row[h] === undefined ? "" : row[h]));
  }
  function parse(payload) {
    const tables = {};
    for (const [k, raw] of Object.entries(payload.tables)) {
      if (!raw) { tables[k] = null; continue; }
      const a = XL.parseAddress(raw.address);
      const headers = raw.values[0];
      const rows = raw.values.slice(1).map((vals, i) => {
        const o = { _r: a.r1 + 1 + i };
        headers.forEach((h, j) => { o[h] = vals[j]; });
        return o;
      });
      tables[k] = { headers, rows, sheet: a.sheet, startRow: a.r1, lastCol: a.c2 };
    }
    const settings = {};
    if (payload.settings) payload.settings.forEach((r, i) => { if (SETTING_NAMES[i]) settings[SETTING_NAMES[i]] = r[1]; });
    const lists = JSON.parse(JSON.stringify(DEFAULT_LISTS));
    if (payload.lists) {
      const hdr = payload.lists[0];
      hdr.forEach((name, j) => {
        if (!name) return;
        const vals = payload.lists.slice(1).map((r) => r[j]);
        if (name === "Blocker") lists[name] = vals.filter((v) => v !== "" && v != null);
        else { const out = []; for (const v of vals) { if (v === "" || v == null) break; out.push(v); } lists[name] = out; }
      });
    }
    return { tables, settings, lists };
  }
  function adopt(p) {
    S.tables = p.tables; S.settings = p.settings; S.lists = p.lists;
    for (const k of Object.keys(S.tables)) if (S.tables[k]) S.tables[k].rows.forEach((r) => (r._sig = sigOf(k, r)));
    // re-apply pending queue locally
    for (const op of S.queue) applyLocal(op, true);
  }

  // ---------------- local application of ops
  function findRow(t, op) {
    const T = S.tables[t]; if (!T) return null;
    if (op.tempId) { const r = T.rows.find((x) => x._tempId === op.tempId); if (r) return r; }
    return T.rows.find((x) => x._sig === op.sig && (op.r == null || x._r === op.r)) || T.rows.find((x) => x._sig === op.sig) || null;
  }
  function applyLocal(op, replay) {
    if (op.kind === "update") {
      const row = findRow(op.t, op); if (!row) return;
      Object.assign(row, op.changes); row._pending = true;
    } else if (op.kind === "add") {
      const T = S.tables[op.t] || ensureLocalTable(op.t);
      if (T.rows.find((x) => x._tempId === op.tempId)) return;
      const row = Object.assign({ _r: null, _tempId: op.tempId, _pending: true }, op.values);
      T.rows.push(row);
    } else if (op.kind === "inc") {
      const T = S.tables.outreach; if (!T) return;
      let row = T.rows.find((x) => x["Week Start (Mon)"] === op.week && x["Channel"] === op.channel);
      if (!row) { row = { _r: null, _tempId: "inc-" + op.week + op.channel, _pending: true, "Week Start (Mon)": op.week, Channel: op.channel, Activities: 0, Responses: 0, "Meetings Booked": 0 }; T.rows.push(row); }
      row[op.field] = (+row[op.field] || 0) + op.delta; row._pending = true;
    }
  }
  function ensureLocalTable(t) {
    const headers = t === "activity" ? ACTIVITY_HEADERS : [];
    S.tables[t] = { headers, rows: [], sheet: TABLES[t].sheet, startRow: 1 };
    return S.tables[t];
  }

  // ---------------- public mutation API (optimistic + queued)
  let seq = Date.now();
  function enqueue(op) {
    op.id = ++seq;
    if (op.kind === "inc") {
      const ex = S.queue.find((q) => q.kind === "inc" && q.week === op.week && q.channel === op.channel && q.field === op.field);
      applyLocal(op);
      if (ex) { ex.delta += op.delta; save(LS.queue, S.queue); emit(); scheduleFlush(); return; }
    } else applyLocal(op);
    S.queue.push(op); save(LS.queue, S.queue); emit(); scheduleFlush();
  }
  const API = {
    update(t, row, changes) {
      const clean = {}; for (const [k, v] of Object.entries(changes)) if (!isCalc(k) && row[k] !== v) clean[k] = v;
      if (!Object.keys(clean).length) return;
      if (row._tempId && !row._r) { // still pending add: merge into add op
        const op = S.queue.find((q) => q.kind === "add" && q.tempId === row._tempId);
        if (op) { Object.assign(op.values, clean); Object.assign(row, clean); save(LS.queue, S.queue); emit(); return; }
      }
      enqueue({ kind: "update", t, r: row._r, sig: row._sig, changes: clean });
    },
    add(t, values) {
      const tempId = "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      enqueue({ kind: "add", t, values, tempId });
      return S.tables[t].rows.find((x) => x._tempId === tempId);
    },
    inc(channel, field, delta, week) { enqueue({ kind: "inc", channel, field, delta, week: week || D.weekStart(D.today()) }); bumpToday(channel, field, delta); },
    event(ev) { enqueue({ kind: "event", ev }); },
  };
  function bumpToday(channel, field, delta) {
    const t = D.today(); const st = load(LS.today, {});
    if (st.day !== t) { st.day = t; st.c = {}; }
    const k = channel + "|" + field; st.c[k] = Math.max(0, (st.c[k] || 0) + delta); save(LS.today, st);
  }
  function todayCount(channel, field) { const st = load(LS.today, {}); return st.day === D.today() ? (st.c[channel + "|" + field] || 0) : 0; }

  // ---------------- sync
  let flushing = false, flushTimer = null;
  function scheduleFlush(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms == null ? 1200 : ms); }

  async function refresh(silent) {
    if (B.demo === false && !B.account) return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    try {
      if (!silent) setStatus("loading");
      const payload = await B.loadAll(TABLES);
      if (payload.tables.activity === null && !B.demo) {
        try { await B.createTable(TABLES.activity.sheet, TABLES.activity.table, ACTIVITY_HEADERS); payload.tables.activity = { address: "'Activity Log'!A1:J2", values: [ACTIVITY_HEADERS, ACTIVITY_HEADERS.map(() => "")] }; } catch (e) { console.warn("activity table", e); }
      }
      const p = parse(payload);
      adopt(p);
      const m = await B.meta(); S.etag = m.eTag; S.lastWriteBy = (m.lastModifiedBy && m.lastModifiedBy.user && m.lastModifiedBy.user.displayName) || "";
      S.loadedAt = Date.now();
      save(LS.cache, { payload, etag: S.etag, loadedAt: S.loadedAt });
      setStatus(S.queue.length ? "pending" : "synced");
    } catch (e) {
      console.error(e);
      setStatus(e.message === "OFFLINE" ? "offline" : "error", e.message);
    }
  }

  async function execOp(op, fresh) {
    if (op.kind === "event") { await B.createEvent(op.ev); return; }
    if (op.kind === "update") {
      const T = fresh.tables[op.t];
      const row = T && (T.rows.find((x) => x._sig === op.sig && x._r === op.r) || T.rows.find((x) => x._sig === op.sig));
      if (!row) throw Object.assign(new Error(`Row changed in the sheet (${TABLES[op.t].sheet}) - edit skipped`), { conflict: true });
      const updates = Object.entries(op.changes).map(([h, v]) => {
        const ci = T.headers.indexOf(h); if (ci < 0) return null;
        return { addr: XL.colLetter(ci) + row._r, value: v, header: h, numberFormat: TABLES[op.t].dates.includes(h) ? "dd-mmm-yy" : undefined };
      }).filter(Boolean);
      await B.patchCells(T.sheet, updates);
      Object.assign(row, op.changes); row._sig = sigOfFresh(op.t, T, row);
      return;
    }
    if (op.kind === "add" || op.kind === "inc") {
      const t = op.kind === "inc" ? "outreach" : op.t;
      let T = fresh.tables[t];
      if (!T && t === "activity") {
        await B.createTable(TABLES.activity.sheet, TABLES.activity.table, ACTIVITY_HEADERS);
        const p = parse(await B.loadAll({ activity: TABLES.activity })); fresh.tables.activity = p.tables.activity; T = fresh.tables.activity;
      }
      if (!T) throw new Error("Table missing: " + TABLES[t].table);
      if (op.kind === "inc") {
        const row = T.rows.find((x) => x["Week Start (Mon)"] === op.week && x["Channel"] === op.channel);
        if (row) {
          const ci = T.headers.indexOf(op.field);
          const cur = (await B.readRange(T.sheet, XL.colLetter(ci) + row._r))[0][0];
          const nv = Math.max(0, (+cur || 0) + op.delta);
          await B.patchCells(T.sheet, [{ addr: XL.colLetter(ci) + row._r, value: nv, header: op.field }]);
          row[op.field] = nv; return;
        }
        op = { values: { "Week Start (Mon)": op.week, Channel: op.channel, Activities: 0, Responses: 0, "Meetings Booked": 0, [op.field]: Math.max(0, op.delta) } };
      }
      const inputs = T.headers.filter((h) => !isCalc(h));
      const blank = T.rows.find((x) => x._r && inputs.every((h) => x[h] === "" || x[h] == null));
      const addr = await B.writeRow(T.sheet, TABLES[t].table, blank ? `A${blank._r}:${XL.colLetter(T.headers.length - 1)}${blank._r}` : null, T.headers, op.values, TABLES[t].dates);
      const r = +addr.match(/\d+/)[0];
      const row = blank || { _r: r }; Object.assign(row, op.values); row._r = r; if (!blank) T.rows.push(row);
      return;
    }
  }
  function sigOfFresh(t, T, row) {
    const cfg = TABLES[t]; if (cfg.key) return String(row[cfg.key] || "");
    const hs = T.headers.filter((h) => !isCalc(h)).slice(0, 3);
    return JSON.stringify(hs.map((h) => row[h] === undefined ? "" : row[h]));
  }

  async function flush() {
    if (flushing || !S.queue.length) return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    if (!B.demo && !B.account) return;
    flushing = true; setStatus("saving");
    const notes = [];
    try {
      const fresh = parse(await B.loadAll(TABLES));
      for (const k of Object.keys(fresh.tables)) if (fresh.tables[k]) fresh.tables[k].rows.forEach((r) => (r._sig = sigOfFresh(k, fresh.tables[k], r)));
      while (S.queue.length) {
        const op = S.queue[0];
        try { await execOp(op, fresh); S.queue.shift(); save(LS.queue, S.queue); }
        catch (e) {
          if (e.message === "OFFLINE" || e.message === "NOT_SIGNED_IN") throw e;
          op.fails = (op.fails || 0) + 1;
          if (e.conflict || op.fails >= 3) { notes.push(e.message); S.queue.shift(); save(LS.queue, S.queue); }
          else throw e;
        }
      }
    } catch (e) {
      flushing = false;
      setStatus(e.message === "OFFLINE" ? "offline" : "error", e.message);
      if (e.message !== "OFFLINE") scheduleFlush(15000);
      return;
    }
    flushing = false;
    if (notes.length) window.UI && UI.toast(notes[0], "warn");
    await refresh(true);
  }

  // poll the workbook for changes made in Excel / by others
  async function poll() {
    if (document.hidden || flushing || S.queue.length || !navigator.onLine) return;
    if (!B.demo && !B.account) return;
    try {
      const m = await B.meta();
      if (S.etag && m.eTag !== S.etag) { await refresh(true); window.UI && UI.toast("Updated from the sheet"); }
    } catch (e) { /* ignore */ }
  }

  function bootFromCache() {
    const c = load(LS.cache, null);
    if (c && c.payload) { adopt(parse(c.payload)); S.etag = c.etag; S.loadedAt = c.loadedAt; return true; }
    return false;
  }

  // ---------------- derived helpers used by the UI
  const L = () => S.lists;
  function stageProb(stage) { const i = L().Stage.indexOf(stage); return i < 0 ? 0 : +(L().StageProb[i] || 0); }
  function tempScore(t) { const i = L().Temp.indexOf(t); return i < 0 ? 0 : +(L().TempScore[i] || 0); }
  const CLOSED = ["Lost", "Won - Deployed"];
  function deal(r) {
    const t = D.today();
    const open = !!r.Account && !CLOSED.includes(r.Stage) && r.Stage !== "Nurture";
    let follow;
    if (!r.Account) follow = "";
    else if (CLOSED.includes(r.Stage)) follow = "Closed";
    else if (!isNum(r["Next Step Date"])) follow = "No next step";
    else if (r["Next Step Date"] < t) follow = "Overdue";
    else if (r["Next Step Date"] === t) follow = "Due today";
    else if (r["Next Step Date"] <= t + 7) follow = "This week";
    else follow = "Scheduled";
    const days = isNum(r["Last Contact"]) ? t - r["Last Contact"] : null;
    const bill = isNum(r["Est. Monthly Billing (INR)"]) ? r["Est. Monthly Billing (INR)"] : 0;
    const score = open ? stageProb(r.Stage) * 100 + tempScore(r.Temperature) + (r["Qualified?"] === "Y" ? 10 : 0) + Math.min(bill / 1e5, 20) - (days != null ? Math.min(Math.max(days - 30, 0), 90) / 3 : 0) : -999;
    return { open, follow, days, score, prob: stageProb(r.Stage), weighted: bill * stageProb(r.Stage) };
  }
  function setting(name, dflt) { const v = S.settings[name]; return v === "" || v == null ? dflt : v; }

  window.Store = { S, TABLES, D, API, refresh, flush, poll, bootFromCache, deal, setting, isNum, isCalc, todayCount, ACTIVITY_HEADERS, scheduleFlush, C };
})();
