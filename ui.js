// UI: screens, sheets and sales workflows.
(function () {
  const { S, D, deal, setting, isNum } = Store;
  const C = window.APP_CONFIG;
  const B = window.Backend;
  let edits = 0;
  const VERSION = "v49";   // bump with each release; shown in Settings so you can confirm the update loaded (not cache)
  const API = new Proxy(Store.API, { get: (o, k) => (...a) => { edits++; try { recordAct(k, a); } catch (e) {} const r = o[k](...a); return r; } });

  // ---------------- daily activity log (for stand-up: everything you did in the app that day)
  let suppressAct = false;
  const actStore = () => { try { return JSON.parse(localStorage.getItem("pp.actlog") || "{}"); } catch (e) { return {}; } };
  const actSave = (o) => { try { localStorage.setItem("pp.actlog", JSON.stringify(o)); } catch (e) {} };
  function logAct(text) {
    if (!text) return;
    try {
      const now = Date.now(), dk = new Date().toLocaleDateString("en-CA"); // local yyyy-mm-dd
      const o = actStore(); (o[dk] = o[dk] || []).push({ t: now, x: text });
      const keys = Object.keys(o).sort(); while (keys.length > 130) delete o[keys.shift()];  // keep ~a quarter
      if (o[dk].length > 500) o[dk] = o[dk].slice(-500);
      actSave(o);
    } catch (e) {}
  }
  // Everything except Delivery is tracked. Known tables get a friendly line; anything else
  // falls back to a generic "record · changed fields" so nothing is ever missed.
  const TABLE_LABEL = { pipeline: "Deal", leads: "Lead", commitments: "Commitment", meetings: "Meeting", deliveryReqs: "Requirement", requirements: "Requirement", proposals: "Proposal", contacts: "Contact", accounts: "Client", intel: "Market intel", contracts: "Contract", events: "Event", targets: "Target", library: "Library" };
  const recName = (r) => r.Account || r.Name || r.SPOC || r.Commitment || r.Role || r["Role / Skill"] || r.Contact || r.Client || r.Title || r["Event / Referral"] || r["Deal ID"] || "";
  const DATE_FLD = /(date|follow[- ]?up|received|submitted|signed|deployed|qualified|due|start|last contact)/i;
  const NOTE_FLD = /(note|comment|remark|feedback)/i;
  const fmtActV = (h, v) => { if (v === "" || v == null) return ""; if (typeof v === "number" && DATE_FLD.test(h) && v > 20000 && v < 90000) return D.fmt(v, { abs: 1 }); return String(v).slice(0, NOTE_FLD.test(h) ? 240 : 60); };
  const ADD_DESC = {
    activity: (v) => `${v.Channel || "Touch"} · ${v.Outcome || ""} — ${v.Account || ""}${v.Contact ? " (" + v.Contact + ")" : ""}${v["Next Step"] ? " · next: " + v["Next Step"] : ""}${isNum(v["Next Step Date"]) ? " · f/u " + D.fmt(v["Next Step Date"], { abs: 1 }) : ""}`,
    pipeline: (v) => `New deal · ${v.Account || ""}${v.Contact ? " (" + v.Contact + ")" : ""}`,
    leads: (v) => `New lead · ${v.Name || ""}${v.Organization ? " (" + v.Organization + ")" : ""}`,
    commitments: (v) => `New commitment · ${v.Commitment || ""}`,
    meetings: (v) => `Meeting booked · ${v.Account || ""}${isNum(v.Date) ? " · " + D.fmt(v.Date, { abs: 1 }) : ""}`,
    deliveryReqs: (v) => `New requirement · ${v.Role || ""}${v.Client ? " @ " + v.Client : ""}`,
    requirements: (v) => `New requirement · ${v["Role / Skill"] || v.Role || ""}`,
    proposals: (v) => `New proposal · ${v.Account || ""}`,
    contacts: (v) => `New contact · ${v.SPOC || ""}${v.Client ? " @ " + v.Client : ""}`,
  };
  function describeAdd(t, v) { if (ADD_DESC[t]) return ADD_DESC[t](v); const nm = recName(v); return `New ${TABLE_LABEL[t] || t}${nm ? " · " + nm : ""}`; }
  function describeUpdate(t, row, ch) {
    const parts = [];
    Object.keys(ch).forEach((h) => { if (h.charAt(0) === "_" || Store.isCalc(h)) return; const s = fmtActV(h, ch[h]); parts.push(s === "" ? h + " cleared" : h + ": " + s); });
    if (!parts.length) return "";
    return `${recName(row) || TABLE_LABEL[t] || t} · ${parts.join(", ")}`;
  }
  const ACT_SKIP = { delivery: 1, deliveryReqs: 1 };   // the whole Delivery module is excluded, per request
  function recordAct(k, a) {
    if (suppressAct) return;
    if (k === "add") { const t = a[0]; if (ACT_SKIP[t]) return; logAct(describeAdd(t, a[1] || {})); }
    else if (k === "update") { const t = a[0]; if (ACT_SKIP[t]) return; logAct(describeUpdate(t, a[1] || {}, a[2] || {})); }
  }

  // Dashboard scope: "all" (consolidated) | "core" (existing pipeline) | "gcc" (new GCC hunt)
  let dashScope = (() => { try { return localStorage.getItem("pp.dash") || "all"; } catch (e) { return "all"; } })();
  const setDashScope = (v) => { dashScope = v; try { localStorage.setItem("pp.dash", v); } catch (e) {} };
  let askMsgs = [];   // in-memory AI chat thread for the Ask / advisor screen (cleared on reload)

  // ------------------------------------------------------------------ helpers
  const esc = (v) => (v == null ? "" : String(v)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const today = () => D.today();
  function fmtL(n) {
    if (!isNum(n) || !n) return "";
    if (n >= 1e7) return "₹" + (n / 1e7).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "") + "Cr";
    return "₹" + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, "") + "L";
  }
  const pct = (v) => (isNum(v) ? (v * 100).toFixed(1).replace(/\.0$/, "") + "%" : "");
  // tiny markdown: escape, then links, **bold**, `code`, and leading "- "/"* " bullets (kept readable with pre-wrap)
  function mdLite(s) {
    let h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // [label](url) → clickable label
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // bare URL → clickable (skip ones already inside an anchor we just made)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)(?![^<]*<\/a>)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/(^|\n)\s*[-*]\s+/g, "$1• ");
    return h;
  }
  function phones(p) { return String(p || "").split(/[\/,;]| or /).map((x) => x.replace(/[^\d+]/g, "")).filter((x) => x.replace(/\D/g, "").length >= 8); }
  function telLink(p) { const a = phones(p)[0]; return a ? "tel:" + a : ""; }
  function waLink(p) { let a = (phones(p)[0] || "").replace(/\D/g, ""); if (!a) return ""; if (a.length === 10) a = "91" + a; return "https://wa.me/" + a; }
  function liLink(name, org) { return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(((name || "") + " " + (org || "")).trim()); }
  const rows = (t) => (S.tables[t] ? S.tables[t].rows : []);
  const hasData = (t, r) => (S.tables[t] ? S.tables[t].headers.filter((h) => !Store.isCalc(h)).some((h) => r[h] !== "" && r[h] != null) : false);
  const live = (t) => rows(t).filter((r) => hasData(t, r));
  const deals = () => live("pipeline").filter((r) => r.Account);
  const dealById = (id) => deals().find((r) => r["Deal ID"] === id);
  // Pull phone/email from Client Contacts or Leads when the pipeline row itself has none.
  // Matching is tolerant of spelling differences in company names ("ZF" vs "ZF Group")
  // and personal titles ("Mr. Rao" vs "Rao"), since Search draws on the same contact rows.
  const ACC_STOP = /\b(group|india|pvt|private|ltd|limited|technologies|technology|tech|solutions|services|systems|software|global|corp|corporation|inc|llp|llc|co|company|consulting|labs|digital|gcc|the)\b/g;
  const normAcc = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(ACC_STOP, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const NAME_TITLE = /\b(mr|mrs|ms|miss|dr|prof|shri|smt|sri|sir)\b\.?/g;
  const normName = (s) => String(s || "").toLowerCase().replace(NAME_TITLE, " ").replace(/[^a-z0-9]+/g, " ").trim();
  function contactInfoFor(r) {
    let phone = r.Phone || "", email = r.Email || "", src = "";
    if (phone && email) return { Phone: phone, Email: email, src: "" };
    const nm = normName(r.Contact), acc = normAcc(r.Account);
    if (nm || acc) {
      const words = nm.split(/\s+/).filter((w) => w.length >= 3);
      const accWords = acc.split(/\s+/).filter((w) => w.length >= 3);
      const nameTok = (b) => b && (b === nm || words.some((w) => b.indexOf(w) >= 0) || (nm && nm.indexOf(b) >= 0));
      const nameClose = (b) => b && nm && (b.indexOf(nm) >= 0 || nm.indexOf(b) >= 0);
      const accHit = (b) => b && (b === acc || accWords.some((w) => b.indexOf(w) >= 0) || (acc && acc.indexOf(b) >= 0));
      const pool = live("contacts").map((c) => ({ nm: normName(c.SPOC), acc: normAcc(c.Client), Phone: c.Phone, Email: c.Email, src: "Client Contacts" }))
        .concat(live("leads").map((l) => ({ nm: normName(l.Name), acc: normAcc(l.Organization), Phone: l.Phone, Email: l.Email, src: "Leads" })))
        .filter((c) => c.Phone || c.Email);
      const m = pool.find((c) => nm && c.nm === nm)                        // exact name
            || pool.find((c) => accHit(c.acc) && nameTok(c.nm))           // same company + name overlap
            || pool.find((c) => nameClose(c.nm))                          // name containment, any company
            || pool.find((c) => !nm && accHit(c.acc));                    // deal has no contact name: any at the company
      if (m) { if (!phone && m.Phone) { phone = m.Phone; src = m.src; } if (!email && m.Email) { email = m.Email; src = src || m.src; } }
    }
    return { Phone: phone, Email: email, src: src };
  }
  // GCC classification: reads the Segment field; falls back to [GF]/[BF] or greenfield/brownfield in Notes
  const gccType = (r) => {
    const s = String(r.Segment || "").toLowerCase();
    if (s.includes("green")) return "Greenfield";
    if (s.includes("brown")) return "Brownfield";
    const n = String(r.Notes || "").toLowerCase();
    if (/\[gf|greenfield/.test(n)) return "Greenfield";
    if (/\[bf|brownfield/.test(n)) return "Brownfield";
    return null;
  };
  const isGcc = (r) => !!gccType(r);
  const hcIntel = (r) => r["HC Intelligence"] || r["HC Intelligence "] || "";
  const L = (n) => S.lists[n] || [];
  const tempDot = (t) => `<i class="dotT ${esc(t)}"></i>`;
  function followChip(f, date) {
    const cls = { Overdue: "bad", "Due today": "warn", "No next step": "warn", "This week": "ok", Scheduled: "", Closed: "" }[f] || "";
    const txt = f === "Overdue" ? "Overdue · " + D.fmt(date) : f === "This week" || f === "Scheduled" ? D.fmt(date) : f;
    return f ? `<span class="chip ${cls}">${esc(txt)}</span>` : "";
  }
  const nextDealId = () => { const n = deals().map((r) => +(String(r["Deal ID"] || "").match(/\d+/) || [0])[0]); return "D-" + String(Math.max(0, ...n) + 1).padStart(3, "0"); };

  // ---------------- TickTick (one-way push: app -> TickTick, via the Apps Script bridge)
  async function ttCall(action, payload) {
    if (B.demo) { await new Promise((r) => setTimeout(r, 250)); return { ok: true, id: "demo", demo: true, connected: true, configured: true, authUrl: "#" }; }
    if (!B.rpc) throw new Error("TickTick needs the Google Sheets backend");
    return B.rpc(action, payload);
  }
  const ttDue = (serial) => (isNum(serial) ? D.toISO(serial) : "");
  const ttPrio = (temp) => (/hot/i.test(temp) ? 5 : /warm/i.test(temp) ? 3 : 1);
  function ttPushDeal(r) {
    return ttCall("ticktick_push", {
      ref: "pipe:" + (r["Deal ID"] || r.Account),
      title: (r["Next Step"] || "Follow up") + " — " + (r.Account || ""),
      content: [r.Contact ? "Contact: " + r.Contact : "", r.Stage ? "Stage: " + r.Stage : "", r["Deal ID"] ? "Deal " + r["Deal ID"] : ""].filter(Boolean).join("\n"),
      dueISO: ttDue(r["Next Step Date"]), priority: ttPrio(r.Temperature),
    });
  }
  function ttPushCand(c) {
    const due = isNum(c["Next Follow-up"]) ? c["Next Follow-up"] : c["Interview Date"];
    return ttCall("ticktick_push", {
      ref: "cand:" + [c.Candidate, c.Role, c.Client].join("|"),
      title: "Follow up: " + (c.Candidate || "candidate") + " — " + (c.Role || "") + (c.Client ? " @ " + c.Client : ""),
      content: [c.Status ? "Status: " + c.Status : "", isNum(c["Interview Date"]) ? "Interview: " + D.fmt(c["Interview Date"], { abs: 1 }) + (c["Interview Time"] ? " " + c["Interview Time"] : "") : ""].filter(Boolean).join("\n"),
      dueISO: ttDue(due), priority: 3,
    });
  }
  function ttPushCommit(c) {
    return ttCall("ticktick_push", {
      ref: "commit:" + String(c.Commitment || "").trim().slice(0, 60),
      title: "Commitment: " + (c.Commitment || ""),
      content: [c.Account ? "Account: " + c.Account : "", c.Status ? "Status: " + c.Status : ""].filter(Boolean).join("\n"),
      dueISO: ttDue(c["Due Date"]), priority: 3,
    });
  }
  async function ttButton(btn, fn) {
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = "Sending…";
    try { const r = await fn(); toast(r && r.demo ? "(demo) would send to TickTick" : r && r.updated ? "Updated in TickTick" : "Added to TickTick"); btn.innerHTML = I.tt + "In TickTick"; }
    catch (e) { toast(e.message || "TickTick push failed", "warn"); btn.disabled = false; btn.innerHTML = old; }
  }
  async function ttPushAll(btn) {
    const t = today();
    const dl = deals().filter((r) => deal(r).open && isNum(r["Next Step Date"]));
    const cm = live("commitments").filter((c) => ["Proposed", "Committed"].includes(c.Status) && isNum(c["Due Date"]));
    // Delivery candidates are intentionally NOT pushed — Delivery stays app↔sheet only.
    const jobs = [...dl.map((r) => () => ttPushDeal(r)), ...cm.map((c) => () => ttPushCommit(c))];
    if (!jobs.length) return toast("Nothing with a due date to push");
    let ok = 0, fail = 0; btn.disabled = true;
    for (let i = 0; i < jobs.length; i++) { btn.innerHTML = `Pushing ${i + 1}/${jobs.length}…`; try { await jobs[i](); ok++; } catch (e) { fail++; } }
    btn.disabled = false; btn.innerHTML = "Push all follow-ups to TickTick";
    toast(`TickTick: ${ok} sent${fail ? ", " + fail + " failed" : ""}`, fail ? "warn" : "");
  }
  // Two-way: pull reschedules / renames / completions made in TickTick back into the sheet.
  const ttStripAcc = (title, acc) => { const suf = acc ? " — " + acc : ""; return (suf && title.endsWith(suf)) ? title.slice(0, -suf.length) : title; };
  async function ttPullAll(btn, silent) {
    if (B.demo) { if (btn) toast("(demo) would sync from TickTick"); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = "Syncing…"; }
    let changed = 0;
    try {
      const res = await ttCall("ticktick_pull");
      (res.items || []).forEach((it) => {
        if (it.gone) return;
        const dueISO = String(it.due || "").slice(0, 10);
        const dueSerial = /^\d{4}-\d{2}-\d{2}$/.test(dueISO) ? D.fromISO(dueISO) : "";
        const done = Number(it.status) === 2;
        if (it.ref.indexOf("pipe:") === 0) {
          const r = deals().find((d) => "pipe:" + d["Deal ID"] === it.ref); if (!r) return;
          const ch = {};
          const nn = ttStripAcc(String(it.title || ""), r.Account).trim();
          if (nn && nn !== r["Next Step"]) ch["Next Step"] = nn;
          if (done) { ch["Next Step Date"] = ""; const note = "✓ Done in TickTick (" + D.fmt(today(), { abs: 1 }) + ")"; if (!String(r.Notes || "").startsWith(note)) ch.Notes = (note + (r.Notes ? " | " + r.Notes : "")).slice(0, 1500); }
          else if (dueSerial && dueSerial !== r["Next Step Date"]) ch["Next Step Date"] = dueSerial;
          if (Object.keys(ch).length) { API.update("pipeline", r, ch); changed++; }
        } else if (it.ref.indexOf("commit:") === 0) {
          const cm = live("commitments").find((x) => "commit:" + String(x.Commitment || "").trim().slice(0, 60) === it.ref); if (!cm) return;
          const ch = {};
          if (done) { if (cm.Status !== "Done") ch.Status = "Done"; }
          else if (dueSerial && dueSerial !== cm["Due Date"]) ch["Due Date"] = dueSerial;
          if (Object.keys(ch).length) { API.update("commitments", cm, ch); changed++; }
        }
      });
      if (!silent) toast(changed ? `Synced ${changed} change(s) from TickTick` : "Already up to date with TickTick");
      else if (changed) toast(`${changed} update(s) from TickTick`);
    } catch (e) { if (!silent) toast(e.message || "Sync failed", "warn"); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = "Sync from TickTick"; } }
  }
  // Auto two-way: connection is checked once at boot; then changes push automatically and
  // TickTick changes pull automatically (on open + when the app returns to the foreground).
  let ttState = { connected: false, configured: false, checked: false };
  let ttLastPull = 0;
  const ttPaused = () => { try { return localStorage.getItem("pp.ttpause") === "1"; } catch (e) { return false; } };
  // Auto-push to TickTick is OFF by default — the sheet saves fast, and TickTick is updated only
  // when you tap the TickTick button, OR if you turn auto-push on here. ("1" = auto on.)
  const ttAutoOn = () => { try { return localStorage.getItem("pp.ttauto") === "1"; } catch (e) { return false; } };
  async function ttRefreshState() {
    if (B.demo || ttPaused()) { ttState = { connected: false, demo: B.demo, paused: ttPaused(), checked: true }; return ttState; }
    try { const s = await ttCall("ticktick_status"); ttState = Object.assign({ checked: true }, s); }
    catch (e) { ttState = { checked: true, connected: false, error: e.message }; }
    return ttState;
  }
  function ttAutoPull(force) {
    if (B.demo || ttPaused() || !ttState.connected) return;
    const now = Date.now(); if (!force && now - ttLastPull < 45000) return;
    ttLastPull = now; ttPullAll(null, true);
  }
  // TickTick pushes are DEFERRED: they run only after the sheet save queue is empty, one at a
  // time, so they never compete with the sheet save for an Apps Script execution slot (which was
  // making saves feel slow). Each is a separate call to the same endpoint, hence the throttling.
  const ttPending = [];
  let ttDrainTimer = null;
  function ttDrain() {
    clearTimeout(ttDrainTimer);
    ttDrainTimer = setTimeout(async () => {
      if (S.queue.length) { ttDrain(); return; }   // wait until sheet writes finish
      const jobs = ttPending.splice(0);
      for (const j of jobs) { try { await j(); } catch (e) {} }   // sequential, never parallel
    }, 3000);
  }
  function ttLater(fn) { ttPending.push(fn); ttDrain(); }
  function ttAutoDeal(r) { if (ttAutoOn() && !B.demo && !ttPaused() && ttState.connected && isNum(r["Next Step Date"])) ttLater(() => ttPushDeal(r)); }
  function ttAutoCommit(c) { if (ttAutoOn() && !B.demo && !ttPaused() && ttState.connected && isNum(c["Due Date"]) && ["Proposed", "Committed"].includes(c.Status)) ttLater(() => ttPushCommit(c)); }

  // ---------------- AI (optional, via your private Cloudflare Workers AI endpoint)
  const aiOn = () => !!(C.aiUrl && !/PASTE/.test(C.aiUrl));
  async function aiAsk(messages) {
    if (!aiOn()) throw new Error("AI isn't set up yet (add aiUrl in config.js)");
    let res;
    try { res = await fetch(C.aiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token: C.aiToken || "", messages }) }); }
    catch (e) { throw new Error("Can't reach the AI service — check the Worker URL"); }
    const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch (e) { throw new Error("Unexpected AI response"); }
    if (j.error) throw new Error(j.error);
    return String(j.text || j.result || "").trim();
  }
  // Shared "suggest next move" runner: fills outEl with the AI answer + a small Copy button.
  async function aiMove(btn, outEl, system, userCtx) {
    if (!btn || !outEl) return;
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = "Thinking…";
    try {
      const text = await aiAsk([{ role: "system", content: system }, { role: "user", content: userCtx }]);
      outEl.innerHTML = `<div class="card" style="white-space:pre-wrap;margin:10px 0">${mdLite(text)}<div style="margin-top:9px"><button class="btn aimovecopy" style="padding:4px 10px;font-size:11px">${I.copy} Copy</button></div></div>`;
      const cp = outEl.querySelector(".aimovecopy"); if (cp) cp.onclick = () => { copyText(text); toast("Copied"); };
    } catch (e) { toast("AI: " + (e.message || e), "warn"); }
    btn.disabled = false; btn.innerHTML = old;
  }
  const DEAL_MOVE_SYS = "You are a B2B IT staffing & GCC (Global Capability Centre) sales advisor (InitiateFirst, India). You are given ONE deal. Recommend the single best NEXT MOVE. Output exactly: (1) one line reading where the deal stands; (2) a line 'Next move:' then 2–4 concrete, prioritised actions specific to THIS account — reference the blocker, timeline, candidates and collateral where relevant; (3) if useful, name ONE collateral file to send and write it as a clickable markdown link in the form [File name](link) using its exact link from the data. Use ONLY the data given; never invent accounts, people, files or numbers. Be concrete and brief (~130 words). Plain text + simple bullets.";
  const CAND_MOVE_SYS = "You are a recruitment-delivery advisor for an India IT staffing firm (InitiateFirst). You are given ONE candidate in a hiring process. Recommend the best NEXT MOVE to progress them. Output: (1) one line on where this candidate stands; (2) a line 'Next move:' with 2–3 concrete actions (e.g. chase interview feedback, schedule the next round, prep the candidate, manage notice/offer, keep the client's SPOC warm) specific to this candidate's status and dates. Use ONLY the data given; don't invent. Brief (~110 words), plain text + simple bullets.";
  // "Read inside files": ask the backend to extract text from every linked Drive file into a Content column.
  async function indexFiles(btn) {
    if (B.demo) return toast("Indexing runs against your real Google Sheet (not demo).", "warn");
    if (!B.rpc) return toast("Needs the Google Sheets backend", "warn");
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = "Reading files… (up to a minute)";
    try {
      const r = await B.rpc("index_library", { onlyMissing: false });
      if (r && r.error) throw new Error(r.error);
      await Store.refresh(true);
      const fails = r.failed || [];
      if (!r.processed && fails.length) {
        sheet("Couldn't read the files", `<div class="card"><b>None of the files could be read.</b><p class="hint" style="margin-top:6px">Common fixes:</p>
          <ul style="margin:4px 0 0 18px;font-size:13px"><li>Add <b>library-index.gs</b> and <b>redeploy</b> (Deploy → Manage → edit → New version).</li><li>Each file must be in your Google Drive, or shared with the Google account that runs the app.</li><li>The Library <b>Link</b> column must hold the file's share link (not a folder).</li></ul></div>
          <div style="font-size:12px;color:var(--ink-3);margin:2px 4px">What the server reported:</div>
          <div class="card" style="white-space:pre-wrap;font-size:11.5px">${esc(fails.join("\n\n"))}</div>`, () => {});
      } else {
        const parts = [`✅ Read ${r.processed || 0} file(s)`]; if (r.skipped) parts.push(`${r.skipped} without a link`); if (fails.length) parts.push(`${fails.length} failed`);
        toast(parts.join(" · "));
        if (fails.length) sheet("Some files couldn't be read", `<div class="card" style="white-space:pre-wrap;font-size:11.5px">${esc(fails.join("\n\n"))}</div>`, () => {});
      }
      render();
    } catch (e) {
      const m = String(e.message || e);
      if (/unknown action/i.test(m)) sheet("Update needed", `<div class="card"><b>Your Google Sheet script needs updating.</b><p class="hint" style="margin-top:6px">The "Index files" feature isn't in your backend yet. Paste the updated <b>Code.gs</b>, add the new <b>library-index.gs</b> file, then redeploy (New version). Full steps are in the chat.</p></div>`, () => {});
      else toast("Indexing failed: " + m, "warn");
    }
    btn.disabled = false; btn.innerHTML = old;
  }

  const I = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 20.5l1.8-5.3A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 9.5c.3 1.6 1.9 3.6 4 4.4l1-1 2 .8"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>',
    li: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 10v7"/></svg>',
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    stand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.5"/><path d="M14 10h5M14 14h3"/></svg>',
    rupee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/></svg>',
    req: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 13l2 2 4-4"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>',
    xl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    tt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  };
  // Conversation links (doc / Outlook thread / drive) — parse from a dedicated field and from Notes
  const URL_RE = /(https?:\/\/[^\s,;]+)/gi;
  function linkList(...sources) {
    const set = [];
    sources.forEach((s) => (String(s == null ? "" : s).match(URL_RE) || []).forEach((u) => { u = u.replace(/[.,)]+$/, ""); if (set.indexOf(u) < 0) set.push(u); }));
    return set;
  }
  function linkLabel(u) {
    try {
      const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
      if (/outlook\.|office\.|live\.com|owa/.test(h)) return "Outlook thread";
      if (/mail\.google|gmail/.test(h)) return "Gmail thread";
      if (/docs\.google/.test(h)) return "Google Doc";
      if (/drive\.google/.test(h)) return "Drive file";
      if (/sharepoint|onedrive|1drv/.test(h)) return "SharePoint";
      return h;
    } catch (e) { return "Link"; }
  }
  const linkChips = (arr) => (arr.length ? `<div class="chips" style="gap:6px;flex-wrap:wrap;margin-top:2px">${arr.map((u) => `<a class="chip" href="${esc(u)}" target="_blank" rel="noopener">${I.link} ${esc(linkLabel(u))}</a>`).join("")}</div>` : "");
  // Upload a file attachment to Drive (via the backend), then append its link to a Links textarea.
  function fileToB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); }); }
  async function uploadAttach(file, ta) {
    if (!file) return;
    if (file.size > 12e6) return toast("File too large (max ~12 MB)", "warn");
    if (B.demo) return toast("File upload works on your live app (not in demo)", "warn");
    if (!B.rpc) return toast("Needs the Google Sheets backend", "warn");
    toast("Uploading " + file.name + "…");
    try {
      const dataBase64 = await fileToB64(file);
      const r = await B.rpc("attach", { filename: file.name, mimeType: file.type, dataBase64 });
      if (r && r.error) throw new Error(r.error);
      if (ta) ta.value = (ta.value ? ta.value.trim() + "\n" : "") + r.url;
      toast("Attached ✓ " + (r.name || file.name));
    } catch (e) { toast("Upload failed: " + (e.message || e), "warn"); }
  }

  // ------------------------------------------------------------------ toast / sheet
  let toastT;
  function toast(msg, kind) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast on " + (kind || "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 2600);
  }
  function sheet(title, html, mount) {
    const scrim = document.createElement("div"); scrim.className = "scrim";
    const el = document.createElement("div"); el.className = "sheet";
    el.innerHTML = `<div class="grab"></div><h3><span>${esc(title)}</span><button data-x aria-label="Close">×</button></h3>${html}`;
    document.body.append(scrim, el);
    requestAnimationFrame(() => { scrim.classList.add("on"); el.classList.add("on"); });
    const close = () => { el.classList.remove("on"); scrim.classList.remove("on"); setTimeout(() => { el.remove(); scrim.remove(); }, 250); };
    scrim.onclick = close; $("[data-x]", el).onclick = close;
    wireChips(el);
    if (mount) mount(el, close);
    return { el, close };
  }
  function wireChips(el) {
    $$(".chips[data-name]", el).forEach((g) => {
      g.addEventListener("click", (e) => {
        const b = e.target.closest(".pick"); if (!b) return;
        const multi = g.hasAttribute("data-multi");
        if (!multi) { const was = b.classList.contains("on"); $$(".pick", g).forEach((x) => x.classList.remove("on")); if (!(was && g.hasAttribute("data-toggle"))) b.classList.add("on"); }
        else b.classList.toggle("on");
        g.dataset.value = $$(".pick.on", g).map((x) => x.dataset.v).join("|");
        g.dispatchEvent(new CustomEvent("pick", { detail: g.dataset.value }));
      });
    });
  }
  const chips = (name, opts, val, extra = "") => `<div class="chips" data-name="${name}" data-value="${esc(val || "")}" ${extra}>${opts.map((o) => {
    const [v, lab] = Array.isArray(o) ? o : [o, o];
    return `<button type="button" class="pick ${esc(v)} ${String(val) === String(v) ? "on" : ""}" data-v="${esc(v)}">${esc(lab)}</button>`;
  }).join("")}</div>`;
  const chipVal = (el, name) => { const g = $(`.chips[data-name="${name}"]`, el); return g ? g.dataset.value : ""; };
  function field(label, name, val, type = "text", attrs = "") {
    if (type === "textarea") return `<div class="f"><label>${label}</label><textarea name="${name}" ${attrs}>${esc(val)}</textarea></div>`;
    if (type === "date") return `<div class="f"><label>${label}</label><input type="date" name="${name}" value="${esc(isNum(val) ? D.toISO(val) : "")}" ${attrs}></div>`;
    return `<div class="f"><label>${label}</label><input type="${type}" name="${name}" value="${esc(val == null ? "" : val)}" ${attrs}></div>`;
  }
  function select(label, name, opts, val, blank = true) {
    return `<div class="f"><label>${label}</label><select name="${name}">${blank ? '<option value=""></option>' : ""}${opts.map((o) => `<option ${String(o) === String(val) ? "selected" : ""}>${esc(o)}</option>`).join("")}${val && !opts.includes(val) ? `<option selected>${esc(val)}</option>` : ""}</select></div>`;
  }
  function form(el) {
    const o = {};
    $$("[name]", el).forEach((i) => {
      let v = i.value.trim();
      if (i.type === "date") v = v ? D.fromISO(v) : "";
      else if (i.type === "number") v = v === "" ? "" : +v;
      else if (i.type === "checkbox") v = i.checked;
      o[i.name] = v;
    });
    return o;
  }
  function datalist(id, values) { return `<datalist id="${id}">${[...new Set(values.filter(Boolean))].sort().map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`; }
  const dateChips = (name, cur) => {
    const t = today();
    const opts = [["Tomorrow", D.addBiz(t, 1)], ["+3 days", D.addBiz(t, 3)], ["Next Mon", D.nextMonday(t)], ["+1 week", t + 7], ["+2 weeks", t + 14], ["+1 month", t + 30]];
    return `<div class="chips" data-dates="${name}">${opts.map(([l, v]) => `<button type="button" class="pick" data-d="${v}">${l}</button>`).join("")}</div>
      <div class="f" style="margin-top:8px"><input type="date" name="${name}" value="${esc(isNum(cur) ? D.toISO(cur) : "")}"></div>`;
  };
  function wireDateChips(el) {
    $$("[data-dates]", el).forEach((g) => g.addEventListener("click", (e) => {
      const b = e.target.closest(".pick"); if (!b) return;
      $$(".pick", g).forEach((x) => x.classList.remove("on")); b.classList.add("on");
      $(`input[name="${g.dataset.dates}"]`, el).value = D.toISO(+b.dataset.d);
    }));
  }

  // ------------------------------------------------------------------ Outlook reminder
  function reminderEvent(subject, dateSerial, time, body, minutes = 15) {
    const iso = D.toISO(dateSerial); const [h, m] = (time || "11:00").split(":").map(Number);
    const end = new Date(Date.UTC(2000, 0, 1, h, m + minutes));
    const pad = (x) => String(x).padStart(2, "0");
    return {
      subject, body: { contentType: "HTML", content: body },
      start: { dateTime: `${iso}T${pad(h)}:${pad(m)}:00`, timeZone: C.timeZone },
      end: { dateTime: `${iso}T${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}:00`, timeZone: C.timeZone },
      isReminderOn: true, reminderMinutesBeforeStart: 15, showAs: "free", categories: ["Pipeline"],
    };
  }
  function contactBlock(r) {
    return `<p><b>${esc(r.Contact || r.Name || "")}</b> - ${esc(r.Designation || "")}<br>${esc(r.Account || r.Organization || "")}</p>
      <p>Phone: ${esc(r.Phone || "")}<br>Email: ${esc(r.Email || "")}</p><p>${esc(r.Notes || "")}</p><p><a href="${location.origin + location.pathname}#/deal/${encodeURIComponent(r["Deal ID"] || "")}">Open in Pipeline app</a></p>`;
  }

  // ------------------------------------------------------------------ cards
  function dealCard(r, opt = {}) {
    const x = deal(r);
    return `<div class="card deal" data-go="#/deal/${encodeURIComponent(r["Deal ID"])}">
      ${tempDot(r.Temperature)}
      <div class="main">
        <div class="t1"><span>${esc(r.Account)}</span>${r._pending ? '<span class="pend">• saving</span>' : ""}</div>
        <div class="t2">${esc(r.Contact)}${r.Designation ? " · " + esc(r.Designation) : ""}</div>
        ${r["Next Step"] ? `<div class="t3">→ ${esc(r["Next Step"])}</div>` : ""}
        <div class="meta"><span class="chip stage">${esc(r.Stage || "-")}</span>${followChip(x.follow, r["Next Step Date"])}${r.Blocker ? `<span class="chip">${esc(r.Blocker)}</span>` : ""}</div>
        ${opt.noActs ? "" : `<div class="acts">
          <button class="pri" data-act="log" data-id="${esc(r["Deal ID"])}" aria-label="Log touch">${I.log}<span class="lbl">Log</span></button>
          ${telLink(r.Phone) ? `<button data-act="call" data-id="${esc(r["Deal ID"])}" aria-label="Call">${I.call}<span class="lbl">Call</span></button>` : ""}
          <button data-act="snooze" data-id="${esc(r["Deal ID"])}" aria-label="Snooze">${I.cal}<span class="lbl">Snooze</span></button>
        </div>`}
      </div></div>`;
  }
  function section(title, items, cls = "", emptyMsg) {
    if (!items.length && !emptyMsg) return "";
    const body = items.length ? `<div class="cardgrid">${items.join("")}</div>` : `<div class="empty">${esc(emptyMsg)}</div>`;
    const k = "pp.sec." + title; let open = true; try { open = localStorage.getItem(k) !== "0"; } catch (e) {}
    return `<details class="secwrap" data-seck="${esc(k)}" ${open ? "open" : ""}><summary class="sec ${cls}"><h2>${esc(title)}</h2><span class="count">${items.length}</span><span class="secchev">▾</span></summary>${body}</details>`;
  }
  // Compact one-line row for a deal (used on dashboards for an at-a-glance list).
  function dealRow(d) {
    const r = d.r, x = d.x;
    return `<div class="lrow" data-go="#/deal/${encodeURIComponent(r["Deal ID"])}">
      ${tempDot(r.Temperature)}
      <div class="lmain"><div class="lt1">${esc(r.Account)}${r._pending ? ' <span class="pend">•</span>' : ""}</div>
        <div class="lmeta">${esc(r.Stage || "")}${r["Next Step"] ? " · " + esc(r["Next Step"]) : ""}${r.Blocker ? " · ⚠ " + esc(r.Blocker) : ""}</div></div>
      <div class="lright">${followChip(x.follow, r["Next Step Date"])}<button class="lbtn" data-act="log" data-id="${esc(r["Deal ID"])}" aria-label="Update">${I.log}</button></div></div>`;
  }
  // Compact section whose items are rows inside one card (not big blocks).
  function sectionRows(title, rows, cls = "") {
    if (!rows.length) return "";
    const k = "pp.sec." + title; let open = true; try { open = localStorage.getItem(k) !== "0"; } catch (e) {}
    return `<details class="secwrap" data-seck="${esc(k)}" ${open ? "open" : ""}><summary class="sec ${cls}"><h2>${esc(title)}</h2><span class="count">${rows.length}</span><span class="secchev">▾</span></summary><div class="card lrows">${rows.join("")}</div></details>`;
  }
  function meetCard(m) {
    const past = isNum(m.Date) && m.Date < today();
    return `<div class="card deal" data-act="meeting" data-sig='${esc(m._sig)}'>
      <i class="dotT ${m["Decision Maker?"] === "Y" ? "Hot" : "Cool"}"></i>
      <div class="main"><div class="t1"><span>${esc(m.Account)}</span></div>
      <div class="t2">${esc(m.Contact)}${m.Designation ? " · " + esc(m.Designation) : ""}</div>
      ${m["Outcome / Next Step"] ? `<div class="t3">${esc(m["Outcome / Next Step"])}</div>` : ""}
      <div class="meta"><span class="chip ${past ? "warn" : "ok"}">${esc(D.fmt(m.Date))}</span><span class="chip">${esc(m["Meeting Type"] || "Meeting")}</span><span class="chip">${esc(m.Status || "")}</span>${m["Decision Maker?"] === "Y" ? '<span class="chip stage">Decision maker</span>' : ""}</div>
      ${past ? `<div class="acts"><button class="pri" data-act="held" data-sig='${esc(m._sig)}'>Mark held</button><button data-act="meeting" data-sig='${esc(m._sig)}'>Reschedule</button></div>` : ""}
      </div></div>`;
  }

  // ------------------------------------------------------------------ VIEWS
  const V = {};

  const scopeToggle = () => `<div class="seg dashseg" id="dashscope">${[["all", "Consolidated"], ["core", "Pipeline"], ["gcc", "GCC"]].map(([v, l]) => `<button data-v="${v}" class="${dashScope === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const mountScope = (el) => { const g = $("#dashscope", el); if (g) g.onclick = (e) => { const b = e.target.closest("button"); if (b) { setDashScope(b.dataset.v); render(); } }; };

  V.today = () => {
    const t = today();
    const allds = deals().map((r) => ({ r, x: deal(r) }));
    const ds = dashScope === "gcc" ? allds.filter((d) => isGcc(d.r)) : dashScope === "core" ? allds.filter((d) => !isGcc(d.r)) : allds;
    if (dashScope === "gcc") return { title: "GCC", html: scopeToggle() + gccDash(ds), mount: mountScope };
    const pipeHref = dashScope === "core" ? "#/pipeline?seg=core" : "#/pipeline";
    const actionable = ds.filter(({ r, x }) => x.open || r.Stage === "Nurture");
    const overdue = actionable.filter(({ x }) => x.follow === "Overdue").sort((a, b) => (b.x.score - a.x.score));
    const noNext = ds.filter(({ r, x }) => x.open && x.follow === "No next step" && (r.Temperature === "Hot" || r.Temperature === "Warm")).sort((a, b) => b.x.score - a.x.score);
    // Forward follow-up buckets by next-step date (non-overlapping), soonest first.
    const inRange = (lo, hi) => ds.filter(({ r, x }) => x.open && isNum(r["Next Step Date"]) && r["Next Step Date"] >= lo && r["Next Step Date"] <= hi).sort((a, b) => a.r["Next Step Date"] - b.r["Next Step Date"]);
    const bToday = inRange(t, t), bTom = inRange(t + 1, t + 1), bWeek = inRange(t + 2, t + 7), bFort = inRange(t + 8, t + 14), bMonth = inRange(t + 15, t + 30), bQtr = inRange(t + 31, t + 90);
    const ms = live("meetings");
    const upcoming = ms.filter((m) => isNum(m.Date) && m.Date >= t && m.Date <= t + 7 && ["Booked", "To confirm"].includes(m.Status)).sort((a, b) => a.Date - b.Date);
    const closeOut = ms.filter((m) => isNum(m.Date) && m.Date < t && ["Booked", "To confirm"].includes(m.Status));
    const commits = live("commitments").filter((c) => ["Proposed", "Committed"].includes(c.Status)).sort((a, b) => (a["Due Date"] || 9e9) - (b["Due Date"] || 9e9));
    const mm = setting("MarginMin", 0.25);
    const approvals = live("proposals").filter((p) => { const g = gm(p["Bill Rate (INR/month)"], p["Cost Rate (INR/month)"]); return g !== null && g < mm && !["Approved", "Rejected"].includes(p["Approval Status"]); });
    const incDays = setting("IncentiveDays", 60), warn = setting("IncentiveWarn", 15);
    const inc = live("accounts").filter((a) => isNum(a["First Resource Deployed Date"]) && t - a["First Resource Deployed Date"] >= incDays - warn && t - a["First Resource Deployed Date"] <= incDays + 30);
    const clients = live("accounts").filter((a) => a["Account Type"] === "Client in Progress" && (!isNum(a["Next Step Date"]) || a["Next Step Date"] <= t));
    const dAll = live("delivery");
    const dDue = dAll.filter((c) => dActive(c.Status) && isNum(c["Next Follow-up"]) && c["Next Follow-up"] <= t).sort((a, b) => a["Next Follow-up"] - b["Next Follow-up"]);
    const dIv = dAll.filter((c) => dActive(c.Status) && isNum(c["Interview Date"]) && c["Interview Date"] >= t && c["Interview Date"] <= t + 7).sort((a, b) => a["Interview Date"] - b["Interview Date"]);
    const agenda = agendaKey();
    // ---- Recent traction: accounts/leads with a POSITIVE recent outcome (progress at a glance)
    const scopeAccts = new Set(ds.map((d) => d.r.Account));
    const POS = /connected|replied|meeting|requirement shared|positive|interested|proposal|shortlist|selected|advanced/i;
    const NEG = /not interested|no answer|call busy|busy|declined|lost|reject/i;
    const tmap = {};
    live("activity").filter((a) => isNum(a.Date) && a.Date >= t - 14 && a.Outcome && POS.test(a.Outcome) && !NEG.test(a.Outcome))
      .sort((a, b) => (a.Date || 0) - (b.Date || 0))
      .forEach((a) => { const k = a.Account || a["Deal ID"] || ""; if (!k) return; if (dashScope !== "all" && !scopeAccts.has(a.Account)) return; tmap[k] = { name: a.Account || a["Deal ID"], outcome: a.Outcome, note: a.Notes, date: a.Date, go: a["Deal ID"] ? "#/deal/" + encodeURIComponent(a["Deal ID"]) : "" }; });
    const traction = Object.values(tmap);
    live("leads").filter((l) => /positive/i.test(l.Response || "") && isNum(l["Last Follow-up"]) && l["Last Follow-up"] >= t - 14)
      .forEach((l) => traction.push({ name: (l.Name || l.Organization || "lead") + (l.Organization && l.Name ? " · " + l.Organization : ""), outcome: "Positive (lead)", note: l.Comments, date: l["Last Follow-up"], go: "#/leads" }));
    traction.sort((a, b) => (b.date || 0) - (a.date || 0));
    const tractionRow = (x) => `<div class="lrow" ${x.go ? `data-go="${x.go}"` : ""}>
      <span class="dotT Hot" style="flex:none"></span>
      <div class="lmain"><div class="lt1">${esc(x.name)}</div><div class="lmeta">✅ ${esc(x.outcome)}${x.note ? " · " + esc(String(x.note).slice(0, 70)) : ""}</div></div>
      <span class="lwhen">${esc(D.fmt(x.date, { abs: 1 }))}</span></div>`;
    const hot = ds.filter(({ r, x }) => x.open && r.Temperature === "Hot").length;
    const out = outreachWeek(D.weekStart(t));
    const callsTarget = setting("T_Call", 50), emailT = setting("T_Email", 100), liT = setting("T_LinkedIn", 50);
    const hr = new Date().getHours();
    const html = scopeToggle() + `
      <div class="hello"><div><div class="sub">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h2>Good ${hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"}${C.owner ? ", " + esc(C.owner) : ""}</h2></div></div>
      <a class="agenda" href="#/standup">${I.stand}<div><div style="font-size:12px;color:var(--ink-3)">Stand-up focus this week</div><b>${esc(AGENDA[agenda].title)}</b></div></a>
      <div class="kpis">
        <button class="kpi" data-go="${pipeHref}"><div class="v">${ds.filter((d) => d.x.open).length}</div><div class="l">Open deals</div></button>
        <button class="kpi" data-go="${pipeHref}${dashScope === "core" ? "&" : "?"}temp=Hot"><div class="v">${hot}</div><div class="l">Hot</div></button>
        <button class="kpi ${overdue.length ? "bad" : ""}" data-scroll="sec-over"><div class="v">${overdue.length}</div><div class="l">Overdue</div></button>
        <button class="kpi ${noNext.length ? "warn" : ""}" data-go="${pipeHref}${dashScope === "core" ? "&" : "?"}follow=No next step"><div class="v">${noNext.length}</div><div class="l">No next step</div></button>
      </div>
      <div class="card" data-go="#/outreach" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center"><b>Outreach this week</b><span class="chip">${Math.round(100 * (out.Email.a + out["Cold Call"].a + out.LinkedIn.a) / Math.max(1, emailT + callsTarget + liT))}% of target</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;font-size:13px">
          ${[["Email", emailT], ["Cold Call", callsTarget], ["LinkedIn", liT]].map(([c, tg]) => `<div><div style="color:var(--ink-3)">${c === "Cold Call" ? "Calls" : c}</div><b>${out[c].a}</b> / ${tg}<div class="bar"><i style="width:${Math.min(100, (100 * out[c].a) / Math.max(1, tg))}%"></i></div></div>`).join("")}
        </div></div>
      ${sectionRows("Recent tractions", traction.slice(0, 15).map(tractionRow), "ok")}
      <div id="sec-over">${sectionRows("Overdue follow-ups", overdue.map(dealRow), "bad")}</div>
      ${sectionRows("Due today", bToday.map(dealRow), "warn")}
      ${sectionRows("Tomorrow", bTom.map(dealRow))}
      ${sectionRows("This week", bWeek.map(dealRow))}
      ${sectionRows("Next fortnight", bFort.map(dealRow))}
      ${sectionRows("This month", bMonth.map(dealRow))}
      ${sectionRows("This quarter", bQtr.map(dealRow))}
      ${section("Meetings - next 7 days", upcoming.map(meetCard))}
      ${section("Meetings to close out", closeOut.map(meetCard), "warn")}
      ${section("Clients in progress - needs a next step", clients.map(accCard), "warn")}
      ${section("Your commitments", commits.slice(0, 5).map(commitCard))}
      ${dDue.length || dIv.length ? `<div class="sec"><h2>Delivery</h2><a href="#/delivery" style="font-size:12px;font-weight:600">Open ›</a></div>` : ""}
      ${section("Delivery - interviews this week", dIv.map(dCandCard))}
      ${section("Delivery - follow-ups due", dDue.map(dCandCard), "warn")}
      ${section("Needs your approval (below margin)", approvals.map(propCard), "bad")}
      ${section("Logo incentive watch", inc.map(accCard))}
      ${!overdue.length && !bToday.length && !bTom.length && !upcoming.length && !dDue.length && !dIv.length ? '<div class="card" style="text-align:center">Nothing urgent. Good time to prospect - open <a href="#/outreach">Outreach</a>.</div>' : ""}`;
    return { title: dashScope === "core" ? "Pipeline" : "Today", html, mount: mountScope };
  };

  // ---------------- GCC HUNT dashboard (new greenfield/brownfield GCC tracking)
  function gccDash(ds) {
    const gf = ds.filter((d) => gccType(d.r) === "Greenfield");
    const bf = ds.filter((d) => gccType(d.r) === "Brownfield");
    const overdue = ds.filter((d) => d.x.follow === "Overdue").sort((a, b) => b.x.score - a.x.score);
    const due = ds.filter((d) => ["Due today", "This week"].includes(d.x.follow)).sort((a, b) => a.r["Next Step Date"] - b.r["Next Step Date"]);
    const noNext = ds.filter((d) => d.x.open && d.x.follow === "No next step").sort((a, b) => b.x.score - a.x.score);
    const followDue = overdue.length + due.length;
    const byCity = {}, byStage = {};
    ds.forEach((d) => { const c = d.r.City || "—"; byCity[c] = (byCity[c] || 0) + 1; const s = d.r.Stage || "—"; byStage[s] = (byStage[s] || 0) + 1; });
    const maxCity = Math.max(1, ...Object.values(byCity)), maxStage = Math.max(1, ...Object.values(byStage));
    const bar = (label, n, max) => `<div style="display:grid;grid-template-columns:96px 1fr 26px;align-items:center;gap:9px;margin:6px 0;font-size:13px"><div style="color:var(--ink-2);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</div><div style="height:10px;border-radius:6px;background:var(--card);border:2px solid var(--b);overflow:hidden"><i style="display:block;height:100%;width:${Math.round(100 * n / max)}%;background:linear-gradient(90deg,#FB6A2E,#F9A825)"></i></div><b>${n}</b></div>`;
    const hcList = ds.slice().sort((a, b) => (gccType(a.r) || "").localeCompare(gccType(b.r) || "") || String(a.r.Account).localeCompare(String(b.r.Account)));
    return `
      ${ds.length ? "" : `<div class="card" style="text-align:center"><b>No GCC targets yet.</b><p class="hint">Tag deals with <b>Segment</b> = GCC-Greenfield / GCC-Brownfield in your sheet (or put [GF] / [BF] in Notes) and they'll appear here.</p></div>`}
      <div class="kpis">
        <button class="kpi" data-go="#/pipeline?seg=gcc"><div class="v">${ds.length}</div><div class="l">GCC targets</div></button>
        <button class="kpi" data-go="#/pipeline?seg=gf"><div class="v">${gf.length}</div><div class="l">Greenfield</div></button>
        <button class="kpi" data-go="#/pipeline?seg=bf"><div class="v">${bf.length}</div><div class="l">Brownfield</div></button>
        <button class="kpi ${followDue ? "warn" : ""}" data-scroll="gcc-follow"><div class="v">${followDue}</div><div class="l">Follow-ups due</div></button>
      </div>
      <div id="gcc-follow">${sectionRows("Follow-ups overdue", overdue.map(dealRow), "bad")}</div>
      ${sectionRows("Due / this week", due.map(dealRow), "warn")}
      ${sectionRows("Open · no next step", noNext.map(dealRow), "warn")}
      ${ds.length ? `<div class="sec"><h2>By city</h2></div><div class="card">${Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([c, n]) => bar(c, n, maxCity)).join("")}</div>` : ""}
      ${ds.length ? `<div class="sec"><h2>By stage</h2></div><div class="card">${L("Stage").filter((s) => byStage[s]).map((s) => bar(s, byStage[s], maxStage)).join("") || Object.entries(byStage).map(([s, n]) => bar(s, n, maxStage)).join("")}</div>` : ""}
      ${ds.length ? `<div class="sec"><h2>Headcount intelligence</h2><span class="count">${ds.length}</span></div>
      <div class="card" style="padding:0;overflow:hidden">${hcList.map((d) => `
        <div data-go="#/deal/${encodeURIComponent(d.r["Deal ID"])}" style="display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-top:1px solid var(--b);cursor:pointer">
          <span class="chip ${gccType(d.r) === "Greenfield" ? "ok" : "stage"}" style="flex:none">${gccType(d.r) === "Greenfield" ? "GF" : "BF"}</span>
          <div style="flex:1;min-width:0"><div class="t1" style="font-weight:800">${esc(d.r.Account)}</div>
            <div class="t2" style="font-size:12px;color:var(--ink-3)">${esc(d.r.City || "")}${d.r.Stage ? " · " + esc(d.r.Stage) : ""}</div>
            ${hcIntel(d.r) ? `<div style="font-size:12.5px;margin-top:3px">${esc(hcIntel(d.r))}</div>` : ""}</div>
        </div>`).join("")}</div>` : ""}`;
  }

  // ---------------- PIPELINE board
  const pstate = { q: "", temp: "", view: "board", closed: false, seg: "", stage: "", city: "", source: "", svc: "", follow: "" };
  const SEGLAB = { "": "All", core: "Pipeline", gcc: "GCC", gf: "GCC", bf: "GCC" };
  const FOLLOW_OPTS = ["Overdue", "Due today", "This week", "Scheduled", "No next step"];
  V.pipeline = (params) => {
    if (params.temp != null) pstate.temp = params.temp;
    if (params.seg != null) pstate.seg = params.seg;
    const segOn = (v) => (pstate.seg === v || (v === "gcc" && ["gf", "bf"].includes(pstate.seg))) ? "on" : "";
    const all = deals();
    const uniq = (k) => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const sel = (id, cur, opts, allLabel) => `<select id="${id}" class="fsel"><option value="">${esc(allLabel)}</option>${opts.map((o) => `<option ${cur === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const nf = [pstate.stage, pstate.city, pstate.source, pstate.svc, pstate.temp, pstate.follow].filter(Boolean).length + (pstate.closed ? 1 : 0);
    const html = `
      <div class="toolbar">
        <input class="search" id="pq" placeholder="Search account, contact, notes..." value="${esc(pstate.q)}">
        <div class="seg" id="pview"><button data-v="board" class="${pstate.view === "board" ? "on" : ""}">Board</button><button data-v="list" class="${pstate.view === "list" ? "on" : ""}">List</button></div>
      </div>
      <div class="toolbar">
        <div class="seg" id="pseg"><button data-v="" class="${segOn("")}">All</button><button data-v="core" class="${segOn("core")}">Pipeline</button><button data-v="gcc" class="${segOn("gcc")}">GCC</button></div>
        ${["gcc", "gf", "bf"].includes(pstate.seg) ? `<div class="seg" id="pgcc"><button data-v="gcc" class="${pstate.seg === "gcc" ? "on" : ""}">All GCC</button><button data-v="gf" class="${pstate.seg === "gf" ? "on" : ""}">Greenfield</button><button data-v="bf" class="${pstate.seg === "bf" ? "on" : ""}">Brownfield</button></div>` : ""}
      </div>
      <details class="filters" id="pfilters">
        <summary>Filters${nf ? ` · ${nf} active` : ""}</summary>
        <div class="fgrid">
          ${sel("fstage", pstate.stage, L("Stage"), "All stages")}
          ${sel("fcity", pstate.city, uniq("City"), "All cities")}
          ${sel("fsource", pstate.source, uniq("Source"), "All sources")}
          ${sel("fsvc", pstate.svc, uniq("Service Line"), "All service lines")}
          ${sel("ftemp", pstate.temp, ["Hot", "Warm", "Cool", "Cold"], "All temperatures")}
          ${sel("ffollow", pstate.follow, FOLLOW_OPTS, "All follow-ups")}
        </div>
        <div class="frow"><label class="fchk"><input type="checkbox" id="fclosed" ${pstate.closed ? "checked" : ""}> Include Nurture &amp; Lost</label><button class="btn" id="fclear">Clear filters</button></div>
      </details>
      <div id="pbody">${pipeBody()}</div>`;
    return {
      title: pstate.seg && pstate.seg !== "" ? SEGLAB[pstate.seg] : "Pipeline", html, mount: (el) => {
        const refresh = () => { $("#pbody", el).innerHTML = pipeBody(); };
        $("#pq", el).addEventListener("input", (e) => { pstate.q = e.target.value; refresh(); });
        $("#pview", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { pstate.view = b.dataset.v; render(); } };
        $("#pseg", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { pstate.seg = b.dataset.v; history.replaceState(null, "", "#/pipeline"); render(); } };
        if ($("#pgcc", el)) $("#pgcc", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { pstate.seg = b.dataset.v; history.replaceState(null, "", "#/pipeline"); render(); } };
        [["fstage", "stage"], ["fcity", "city"], ["fsource", "source"], ["fsvc", "svc"], ["ftemp", "temp"], ["ffollow", "follow"]].forEach(([id, key]) => { const s = $("#" + id, el); if (s) s.onchange = () => { pstate[key] = s.value; refresh(); }; });
        $("#fclosed", el).onchange = (e) => { pstate.closed = e.target.checked; refresh(); };
        $("#fclear", el).onclick = () => { Object.assign(pstate, { temp: "", stage: "", city: "", source: "", svc: "", follow: "", closed: false }); render(); };
        wireDnD(el);
      },
    };
  };
  function segMatch(r) {
    if (!pstate.seg) return true;
    if (pstate.seg === "core") return !isGcc(r);
    if (pstate.seg === "gcc") return isGcc(r);
    if (pstate.seg === "gf") return gccType(r) === "Greenfield";
    if (pstate.seg === "bf") return gccType(r) === "Brownfield";
    return true;
  }
  function filtered() {
    const q = pstate.q.toLowerCase();
    return deals().filter((r) => segMatch(r)
      && (!pstate.temp || r.Temperature === pstate.temp)
      && (!pstate.stage || r.Stage === pstate.stage)
      && (!pstate.city || r.City === pstate.city)
      && (!pstate.source || r.Source === pstate.source)
      && (!pstate.svc || r["Service Line"] === pstate.svc)
      && (!pstate.follow || deal(r).follow === pstate.follow)
      && (!q || [r.Account, r.Contact, r.Designation, r.Notes, r["Next Step"], r.City, r.Source].join(" ").toLowerCase().includes(q))
      && (pstate.closed || pstate.stage === "Nurture" || pstate.stage === "Lost" || !["Nurture", "Lost"].includes(r.Stage)));
  }
  function pipeBody() {
    const stages = pstate.stage ? [pstate.stage] : L("Stage").filter((s) => pstate.closed || !["Nurture", "Lost"].includes(s));
    const ds = filtered();
    if (pstate.view === "list") {
      const s = ds.map((r) => ({ r, x: deal(r) })).sort((a, b) => b.x.score - a.x.score);
      return s.length ? `<div class="cardgrid">${s.map((d) => dealCard(d.r, { noActs: true })).join("")}</div>` : '<div class="empty">No deals match.</div>';
    }
    return `<div class="board">${stages.map((st) => {
      const items = ds.filter((r) => r.Stage === st).map((r) => ({ r, x: deal(r) })).sort((a, b) => b.x.score - a.x.score);
      const w = items.reduce((s, d) => s + d.x.weighted, 0);
      return `<div class="col" data-stage="${esc(st)}"><h3><span>${esc(st)} · ${items.length}</span><span>${fmtL(w)}</span></h3>
        ${items.map(({ r, x }) => `<div class="card bcard" draggable="true" data-id="${esc(r["Deal ID"])}" data-go="#/deal/${encodeURIComponent(r["Deal ID"])}">
          <div class="row" style="margin:0"><div class="t1">${tempDot(r.Temperature)} ${esc(r.Account)}</div><button class="mv" data-act="move" data-id="${esc(r["Deal ID"])}" aria-label="Move stage">⇄</button></div>
          <div class="t2">${esc(r.Contact)}</div>
          <div class="row">${followChip(x.follow, r["Next Step Date"])}${r["Est. Monthly Billing (INR)"] ? `<span class="chip">${fmtL(r["Est. Monthly Billing (INR)"])}/mo</span>` : ""}</div>
        </div>`).join("") || '<div class="empty">-</div>'}</div>`;
    }).join("")}</div>`;
  }
  function wireDnD(el) {
    let dragId = null;
    el.addEventListener("dragstart", (e) => { const c = e.target.closest(".bcard"); if (c) { dragId = c.dataset.id; e.dataTransfer.effectAllowed = "move"; } });
    el.addEventListener("dragover", (e) => { const col = e.target.closest(".col"); if (col && dragId) { e.preventDefault(); $$(".col", el).forEach((c) => c.classList.toggle("drop", c === col)); } });
    el.addEventListener("drop", (e) => { const col = e.target.closest(".col"); if (col && dragId) { e.preventDefault(); setStage(dealById(dragId), col.dataset.stage); dragId = null; $$(".col", el).forEach((c) => c.classList.remove("drop")); } });
  }
  function setStage(r, st) {
    if (!r || r.Stage === st) return;
    const ch = { Stage: st };
    API.update("pipeline", r, ch);
    toast(`${r.Account} → ${st}`);
    if (st === "Won - Deployed" || st === "MSA / Contracting" || st === "Empanelment" || st === "First Requirement") ensureAccount(r, st);
    render();
  }
  function ensureAccount(r, st) {
    const map = { "Empanelment": "Empanelment", "MSA / Contracting": "MSA", "First Requirement": "First Requirement", "Won - Deployed": "First Resource Deployed" };
    const a = live("accounts").find((x) => x.Account === r.Account);
    if (!a) API.add("accounts", { Account: r.Account, "Account Type": "Client in Progress", "Current Stage": map[st], "Next Step": r["Next Step"] || "", "Next Step Date": r["Next Step Date"] || "", "Handover Ready?": "N", "Brief Complete?": "N", Notes: `From pipeline ${r["Deal ID"]} (${r.Contact})` });
    else if (map[st]) API.update("accounts", a, { "Current Stage": map[st] });
    if (st === "Won - Deployed") toast("Add logo & deployment dates in Clients & Logos", "warn");
  }

  // ---------------- DEAL detail
  V.deal = (params, id) => {
    const r = dealById(decodeURIComponent(id));
    if (!r) return { title: "Deal", back: true, html: '<div class="empty">Deal not found (it may have been renamed in the sheet).</div>' };
    const x = deal(r);
    const stages = L("Stage"); const si = stages.indexOf(r.Stage);
    const acts = live("activity").filter((a) => a["Deal ID"] === r["Deal ID"] || (!a["Deal ID"] && a.Contact === r.Contact && a.Account === r.Account));
    const ms = live("meetings").filter((m) => m.Account === r.Account && (!m.Contact || m.Contact === r.Contact));
    const noteItems = String(r.Notes || "").trim()
      ? String(r.Notes).split(/\n+|\s\|\s/).map((s) => s.trim()).filter(Boolean).map((line) => {
          const m = line.match(/^(\d{1,2}[\s\-\/][A-Za-z]{3,}|\d{1,2}[\-\/]\d{1,2}(?:[\-\/]\d{2,4})?)\s*[:\-]\s*(.*)$/);
          return { d: isNum(r["Last Contact"]) ? r["Last Contact"] : today(), h: "<b>Note</b>", s: m ? (m[1] + " — " + m[2]) : line, note: 1 };
        })
      : [];
    const tl = [...noteItems,
      ...acts.map((a) => ({ d: a.Date, h: `<b>${esc(a.Channel)}</b> · ${esc(a.Outcome)}`, s: [a.Notes, a["Next Step"] ? "Next: " + a["Next Step"] + (isNum(a["Next Step Date"]) ? " (" + D.fmt(a["Next Step Date"], { abs: 1 }) + ")" : "") : ""].filter(Boolean).join(" - ") })),
      ...ms.map((m) => ({ d: m.Date, h: `<b>Meeting</b> · ${esc(m.Status)}${m["Decision Maker?"] === "Y" ? " · DM" : ""}`, s: m["Outcome / Next Step"] }))]
      .sort((a, b) => (b.d || 0) - (a.d || 0));
    const others = deals().filter((o) => o.Account === r.Account && o["Deal ID"] !== r["Deal ID"]);
    const acc = live("accounts").find((a) => a.Account === r.Account);
    const ci = contactInfoFor(r), phone = ci.Phone, email = ci.Email;
    const tel = telLink(phone), wa = waLink(phone);
    const html = `
      <div class="hero"><h2>${esc(r.Account)}</h2><div class="sub">${esc(r.Contact)}${r.Designation ? " · " + esc(r.Designation) : ""}${r.City ? " · " + esc(r.City) : ""}</div>
        <div class="chips"><span class="chip">${esc(r.Stage)}</span><span class="chip">${esc(r.Temperature || "-")}</span><span class="chip">${esc(r["Service Line"] || "")}</span>${x.days != null ? `<span class="chip">Last touch ${x.days}d ago</span>` : ""}</div></div>
      <div class="quick">
        <a class="${tel ? "" : "dis"}" href="${tel || "#"}" data-act="call" data-id="${esc(r["Deal ID"])}">${I.call}Call</a>
        <a class="${wa ? "" : "dis"}" href="${wa || "#"}" target="_blank" rel="noopener" data-act="wa" data-id="${esc(r["Deal ID"])}">${I.wa}WhatsApp</a>
        <a class="${email ? "" : "dis"}" href="mailto:${esc(email)}" data-act="mail" data-id="${esc(r["Deal ID"])}">${I.mail}Email</a>
        <a href="${liLink(r.Contact, r.Account)}" target="_blank" rel="noopener">${I.li}LinkedIn</a>
        <button data-act="tt" data-id="${esc(r["Deal ID"])}">${I.tt}TickTick</button>
        <button class="upd" data-act="log" data-id="${esc(r["Deal ID"])}">${I.log}Update</button>
      </div>
      <div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div><div style="font-size:12px;color:var(--ink-3)">NEXT STEP</div><div style="font-weight:650;margin-top:2px">${esc(r["Next Step"] || "No next step set")}</div>
        <div style="margin-top:6px">${followChip(x.follow, r["Next Step Date"])} ${r.Blocker ? `<span class="chip">Blocker: ${esc(r.Blocker)}</span>` : ""}</div></div>
        </div></div>
      <div class="card"><div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">STAGE</div>
        <div class="stepper">${stages.map((s, i) => `<button data-act="stage" data-id="${esc(r["Deal ID"])}" data-v="${esc(s)}" class="${s === r.Stage ? "on" : i < si && !["Nurture", "Lost"].includes(r.Stage) ? "done" : ""}">${esc(s)}</button>`).join("")}</div>
        <div style="font-size:12px;color:var(--ink-3);margin:8px 0 6px">TEMPERATURE</div>
        ${chips("temp", L("Temp"), r.Temperature)}
      </div>
      <div class="acts" style="margin:0 0 10px;flex-wrap:wrap">
        <button data-act="newmeeting" data-id="${esc(r["Deal ID"])}">${"Book meeting"}</button>
        <button data-act="newprop" data-id="${esc(r["Deal ID"])}">Proposal / rate card</button>
        <button data-act="newreq" data-id="${esc(r["Deal ID"])}">Requirement</button>
      </div>
      <div class="card"><div class="kv">
        <div>Source</div><div>${esc(r.Source)}</div>
        <div>Est. headcount</div><div>${esc(r["Est. Headcount"] || "-")}</div>
        <div>Est. billing</div><div>${fmtL(r["Est. Monthly Billing (INR)"]) || "-"}${r["Est. Monthly Billing (INR)"] ? " / month" : ""}</div>
        <div>Phone</div><div>${esc(phone || "-")}${ci.src && phone ? ` <span style="font-size:11px;color:var(--ink-3)">(from ${esc(ci.src)})</span>` : ""}</div>
        <div>Email</div><div style="word-break:break-all">${esc(email || "-")}${ci.src && email && !phone ? ` <span style="font-size:11px;color:var(--ink-3)">(from ${esc(ci.src)})</span>` : ""}</div>
        <div>Notes</div><div>${esc(r.Notes || "-")}</div>
      </div></div>
      ${acc ? `<div class="card deal" data-go="#/clients/${encodeURIComponent(acc.Account)}"><div class="main"><div class="t1">Client account: ${esc(acc.Account)}</div><div class="t2">${esc(acc["Current Stage"])} · ${esc(acc["Next Step"] || "")}</div></div></div>` : ""}
      ${(() => { const ls = linkList(r.Links, r.Notes); return ls.length ? `<div class="card"><div style="font-size:12px;color:var(--ink-3);margin-bottom:4px">CONVERSATION LINKS</div>${linkChips(ls)}</div>` : ""; })()}
      <div class="sec"><h2>Timeline</h2><span class="count">${tl.length}</span></div>
      <div class="card">${(() => {
        if (!tl.length) return '<div class="empty">Nothing yet. Use Log to add a touch, or notes you type on the deal will appear here.</div>';
        const item = (i) => `<div class="it"><div class="d">${esc(D.fmt(i.d, { abs: 1, year: 1 }))}</div><div>${i.h}</div>${i.s ? `<div style="font-size:13px;color:var(--ink-2)">${esc(i.s)}</div>` : ""}</div>`;
        const head = tl.slice(0, 4), rest = tl.slice(4);
        return `<div class="tl">${head.map(item).join("")}</div>${rest.length ? `<details class="tlmore"><summary>Show ${rest.length} older</summary><div class="tl">${rest.map(item).join("")}</div></details>` : ""}`;
      })()}</div>
      ${others.length ? `<div class="sec"><h2>Other contacts at ${esc(r.Account)}</h2><span class="count">${others.length}</span></div>${others.map((o) => dealCard(o, { noActs: true })).join("")}` : ""}
      ${aiOn() ? `<button class="btn pri block" id="aimove" style="margin-top:12px">✨ Suggest next move</button><div id="aimoveout"></div>` : ""}`;
    return {
      title: r.Account, back: true, html, mount: (el) => {
        wireChips(el);
        const on = $(".stepper .on", el); if (on) on.parentElement.scrollLeft = on.offsetLeft - 20;
        const g = $('.chips[data-name="temp"]', el);
        g.addEventListener("pick", (e) => { if (e.detail) { API.update("pipeline", r, { Temperature: e.detail }); toast("Temperature: " + e.detail); } });
        const am = $("#aimove", el); if (am) am.onclick = () => aiMove(am, $("#aimoveout", el), DEAL_MOVE_SYS, dealMoveCtx(r));
      },
    };
  };

  // ---------------- LOG TOUCH
  const OUTCOMES = ["No answer", "Call Busy", "Connected", "Replied", "Meeting booked", "Requirement shared", "Call back later", "Not interested"];
  const NEXT_SUGGEST = ["Follow-up call", "Send capability deck", "Send rate card", "Share profiles", "Book meeting", "Proposal follow-up", "Check-in next quarter"];
  const CH_MAP = { Call: "Cold Call", WhatsApp: "Cold Call", Email: "Email", LinkedIn: "LinkedIn" };
  // ---- ONE unified "Update" sheet: the single place to log a contact AND update any detail.
  function logTouch(r, preset = {}) {
    const t = today();
    const billL = isNum(r["Est. Monthly Billing (INR)"]) ? r["Est. Monthly Billing (INR)"] / 1e5 : "";
    const html = `
      <div class="f"><label>Mode of contact *</label>${chips("ch", ["Call", "WhatsApp", "Email", "LinkedIn", "Meeting"], preset.ch || "Call")}</div>
      <div class="f"><label>Outcome / response *</label>${chips("oc", OUTCOMES, preset.oc || "")}</div>
      ${field("When did this happen? *", "cdate", t, "date")}
      <div id="mtgbox" class="hidden"><div class="f2">${field("Meeting date", "mdate", "", "date")}${field("Time", "mtime", "11:00", "time")}</div>
        <div class="f"><label>With decision maker?</label>${chips("mdm", ["Y", "N"], "Y")}</div></div>
      ${field("Notes — what they said / response *", "notes", "", "textarea", 'placeholder="What happened? Need, timeline, budget, who decides..."')}
      <div class="f"><label>Next step</label>
        <select name="nextsel" id="nextsel"><option value="">— pick a next step —</option>${NEXT_SUGGEST.map((s) => `<option ${r["Next Step"] === s ? "selected" : ""}>${esc(s)}</option>`).join("")}${r["Next Step"] && !NEXT_SUGGEST.includes(r["Next Step"]) ? `<option selected>${esc(r["Next Step"])}</option>` : ""}<option value="__other">Other (type your own)…</option></select>
        <input name="next" id="nextinput" value="${esc(r["Next Step"] || "")}" placeholder="Type the next step" class="hidden" style="margin-top:6px"></div>
      <div class="f"><label>Next follow-up date *</label>${dateChips("ndate", "")}</div>
      <div class="f"><label>Temperature</label>${chips("temp", L("Temp"), r.Temperature)}</div>
      ${select("Stage", "stage", L("Stage"), r.Stage, false)}
      <details class="moredetails"><summary>More details (edit anything — optional)</summary>
        <div style="margin-top:10px">
        <div class="f2">${select("Blocker", "Blocker", L("Blocker"), r.Blocker)}${select("Service line", "Service Line", L("Service"), r["Service Line"])}</div>
        <div class="f2">${field("Designation", "Designation", r.Designation)}${field("City", "City", r.City)}</div>
        <div class="f2">${field("Phone", "Phone", r.Phone, "tel")}${field("Email", "Email", r.Email, "email")}</div>
        <div class="f2">${field("Est. headcount", "Est. Headcount", r["Est. Headcount"], "number", 'inputmode="numeric"')}${field("Est. billing (₹ lakhs/mo)", "billL", billL, "number", 'step="0.1" inputmode="decimal"')}</div>
        ${field("Conversation links (one per line)", "Links", r.Links, "textarea")}
        </div>
      </details>
      <div class="toggle"><div><b>Outlook reminder</b><div class="hint">Adds a 15-min event on the next follow-up date</div></div><input type="checkbox" name="cal" ${localStorage.getItem("pp.cal") === "0" ? "" : "checked"}></div>
      ${field("Reminder time", "rtime", "11:00", "time")}
      <button class="btn pri block" id="save">Save update</button>`;
    sheet(`Update · ${r.Contact || r.Account}`, html, (el, close) => {
      wireDateChips(el);
      const nsel = $("#nextsel", el), nin = $("#nextinput", el);
      if (nsel) nsel.onchange = () => { const v = nsel.value; if (v === "__other") { nin.classList.remove("hidden"); nin.value = ""; nin.focus(); } else if (v) { nin.value = v; nin.classList.add("hidden"); } else { nin.value = ""; nin.classList.add("hidden"); } };
      const ocG = $('.chips[data-name="oc"]', el);
      ocG.addEventListener("pick", (e) => {
        const v = e.detail;
        $("#mtgbox", el).classList.toggle("hidden", v !== "Meeting booked");
        const st = $('[name="stage"]', el);
        const order = L("Stage");
        const lvl = (s) => order.indexOf(s);
        if (v === "Not interested") st.value = "Nurture";
        else if (v === "Requirement shared" && lvl(r.Stage) < lvl("Discovery Meeting")) st.value = "Discovery Meeting";
        else if (["Connected", "Replied", "Meeting booked", "Call back later"].includes(v) && r.Stage === "Contacted") st.value = "Contact Established";
        else st.value = r.Stage;
        if (v === "Meeting booked" && !$('[name="next"]', el).value) $('[name="next"]', el).value = "Meeting";
      });
      $("#save", el).onclick = () => {
        const f = form(el); const ch = chipVal(el, "ch") || "Call"; const oc = chipVal(el, "oc");
        // Mandatory fields, with friendly messages
        if (!oc) return toast("Pick the outcome / response", "warn");
        const cd = isNum(f.cdate) ? f.cdate : t;
        const noAnswer = ["No answer", "Call Busy"].includes(oc);
        if (!f.notes && !noAnswer) return toast("Add a quick note on what they said", "warn");
        let nd = f.ndate;
        if (oc === "Meeting booked" && isNum(f.mdate) && !nd) nd = f.mdate;
        if (!isNum(nd) && oc !== "Not interested") return toast("Set the next follow-up date", "warn");
        const temp = chipVal(el, "temp") || r.Temperature;
        const stamp = D.toJS(cd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
        const noteLine = `${stamp}: ${ch} - ${oc}${f.notes ? " - " + f.notes : ""}`;
        const changes = { "Last Contact": cd, "Next Step": f.next, "Next Step Date": nd || "", Temperature: temp, Stage: f.stage, Notes: (noteLine + (r.Notes ? " | " + r.Notes : "")).slice(0, 1500) };
        // "More details" fields — only the ones the user actually changed get written (API.update drops unchanged).
        changes.Blocker = f.Blocker; changes["Service Line"] = f["Service Line"]; changes.Designation = f.Designation; changes.City = f.City;
        changes.Phone = f.Phone; changes.Email = f.Email; changes["Est. Headcount"] = f["Est. Headcount"];
        changes["Est. Monthly Billing (INR)"] = f.billL === "" ? "" : Math.round(f.billL * 1e5); changes.Links = f.Links;
        const stageMoved = changes.Stage && changes.Stage !== r.Stage;
        API.add("activity", { Date: cd, "Deal ID": r["Deal ID"], Account: r.Account, Contact: r.Contact, Channel: ch, Outcome: oc, Notes: f.notes, "Next Step": f.next, "Next Step Date": nd || "", "Logged By": C.owner || "" });
        suppressAct = true; API.update("pipeline", r, changes); suppressAct = false;   // touch already logged via the activity entry above
        if (stageMoved) logAct(`${r.Account} · stage → ${changes.Stage}`);
        ttAutoDeal(r);
        const oc_ch = CH_MAP[ch];
        if (oc_ch) {
          API.inc(oc_ch, "Activities", 1);
          if (!noAnswer) API.inc(oc_ch, "Responses", 1);
          if (oc === "Meeting booked") API.inc(oc_ch, "Meetings Booked", 1);
        }
        if (oc === "Meeting booked" && isNum(f.mdate)) {
          API.add("meetings", { Date: f.mdate, Account: r.Account, Contact: r.Contact, Designation: r.Designation, "Decision Maker?": chipVal(el, "mdm") || "N", "Meeting Type": "Discovery", Status: "Booked", "Outcome / Next Step": f.notes || f.next, Owner: C.owner });
          if (f.cal) API.event(reminderEvent(`Meeting: ${r.Contact} (${r.Account})`, f.mdate, f.mtime, contactBlock(r), 45));
        } else if (f.cal && isNum(nd)) {
          API.event(reminderEvent(`${f.next || "Follow-up"}: ${r.Contact} (${r.Account})`, nd, f.rtime, contactBlock(r)));
        }
        localStorage.setItem("pp.cal", f.cal ? "1" : "0");
        close(); toast("Updated · " + r.Account); render();
      };
    });
  }

  function snooze(r) {
    const t = today();
    const opts = [["Tomorrow", D.addBiz(t, 1)], ["In 3 days", D.addBiz(t, 3)], ["Next Monday", D.nextMonday(t)], ["In 1 week", t + 7], ["In 2 weeks", t + 14], ["In 1 month", t + 30]];
    sheet(`Reschedule · ${r.Account}`, `<div class="list">${opts.map(([l, v]) => `<div class="li" data-d="${v}"><div class="main"><b>${l}</b></div><span class="chip">${D.fmt(v, { abs: 1 })}</span></div>`).join("")}</div>
      ${field("Or pick a date", "d", "", "date")}<button class="btn pri block" id="ok">Set date</button>`, (el, close) => {
      const set = (v) => { API.update("pipeline", r, { "Next Step Date": v }); ttAutoDeal(r); close(); toast("Next step → " + D.fmt(v, { abs: 1 })); render(); };
      $(".list", el).onclick = (e) => { const li = e.target.closest(".li"); if (li) set(+li.dataset.d); };
      $("#ok", el).onclick = () => { const v = form(el).d; if (isNum(v)) set(v); };
    });
  }
  function moveSheet(r) {
    sheet(`Move · ${r.Account}`, `<div class="list">${L("Stage").map((s) => `<div class="li" data-v="${esc(s)}"><div class="main"><b>${esc(s)}</b></div>${s === r.Stage ? '<span class="chip ok">current</span>' : ""}</div>`).join("")}</div>`, (el, close) => {
      $(".list", el).onclick = (e) => { const li = e.target.closest(".li"); if (li) { close(); setStage(r, li.dataset.v); } };
    });
  }

  // ---------------- deal form (new / edit)
  function dealForm(r, preset = {}) {
    const isNew = !r; r = r || Object.assign({ Stage: "Contacted", Temperature: "Warm", "Service Line": "Contract Staffing", Source: "Direct Outreach" }, preset);
    const html = `
      ${field("Account *", "Account", r.Account, "text", 'list="accts" autocomplete="off"')}${datalist("accts", deals().map((d) => d.Account).concat(live("targets").map((t) => t.Account)))}
      <div class="f2">${field("Contact *", "Contact", r.Contact)}${field("Designation", "Designation", r.Designation)}</div>
      <div class="f2">${field("Phone", "Phone", r.Phone, "tel")}${field("Email", "Email", r.Email, "email")}</div>
      <div class="f2">${field("City", "City", r.City)}${select("Source", "Source", L("Source"), r.Source)}</div>
      <div class="f2">${select("Service line", "Service Line", L("Service"), r["Service Line"])}${select("Stage", "Stage", L("Stage"), r.Stage, false)}</div>
      <div class="f"><label>Temperature</label>${chips("Temperature", L("Temp"), r.Temperature)}</div>
      <div class="f">${select("Blocker", "Blocker", L("Blocker"), r.Blocker)}</div>
      <div class="f2">${field("Est. headcount", "Est. Headcount", r["Est. Headcount"], "number", 'inputmode="numeric"')}${field("Est. billing (₹ lakhs / month)", "billL", isNum(r["Est. Monthly Billing (INR)"]) ? r["Est. Monthly Billing (INR)"] / 1e5 : "", "number", 'step="0.1" inputmode="decimal"')}</div>
      <div class="f"><label>Next step</label>
        <select id="nextsel2"><option value="">— pick a next step —</option>${NEXT_SUGGEST.map((s) => `<option ${r["Next Step"] === s ? "selected" : ""}>${esc(s)}</option>`).join("")}${r["Next Step"] && !NEXT_SUGGEST.includes(r["Next Step"]) ? `<option selected>${esc(r["Next Step"])}</option>` : ""}<option value="__other">Other (type your own)…</option></select>
        <input name="Next Step" id="nextinput2" value="${esc(r["Next Step"] || "")}" placeholder="Type the next step" class="hidden" style="margin-top:6px"></div>
      <div class="f"><label>Next step date</label>${dateChips("Next Step Date", r["Next Step Date"])}</div>
      ${field("Notes", "Notes", r.Notes, "textarea")}
      ${field("Conversation links (doc / Outlook thread — one per line)", "Links", r.Links, "textarea")}
      <button class="btn pri block" id="save">${isNew ? "Add to pipeline" : "Save changes"}</button>`;
    sheet(isNew ? "New opportunity" : "Edit " + r.Contact, html, (el, close) => {
      wireDateChips(el);
      const nsel = $("#nextsel2", el), nin2 = $("#nextinput2", el); if (nsel) nsel.onchange = () => { const v = nsel.value; if (v === "__other") { nin2.classList.remove("hidden"); nin2.value = ""; nin2.focus(); } else if (v) { nin2.value = v; nin2.classList.add("hidden"); } else { nin2.value = ""; nin2.classList.add("hidden"); } };
      $("#save", el).onclick = () => {
        const f = form(el);
        if (!f.Account || !f.Contact) return toast("Account and contact are required", "warn");
        const v = { Account: f.Account, Contact: f.Contact, Designation: f.Designation, Phone: f.Phone, Email: f.Email, City: f.City, Source: f.Source,
          "Service Line": f["Service Line"], Stage: f.Stage, Temperature: chipVal(el, "Temperature"), Blocker: f.Blocker,
          "Est. Headcount": f["Est. Headcount"], "Est. Monthly Billing (INR)": f.billL === "" ? "" : Math.round(f.billL * 1e5), "Next Step": f["Next Step"], "Next Step Date": f["Next Step Date"], Notes: f.Notes, Links: f.Links };
        if (isNew) { v["Deal ID"] = nextDealId(); v.Owner = C.owner; v["Last Contact"] = preset["Last Contact"] || ""; API.add("pipeline", v); ttAutoDeal(v); close(); toast("Added " + v.Account); location.hash = "#/deal/" + encodeURIComponent(v["Deal ID"]); }
        else { API.update("pipeline", r, v); ttAutoDeal(r); close(); toast("Saved"); render(); }
      };
    });
  }

  // ---------------- MEETINGS
  V.meetings = () => {
    const t = today(); const ms = live("meetings");
    const up = ms.filter((m) => isNum(m.Date) && m.Date >= t && m.Status !== "Cancelled" && m.Status !== "Held").sort((a, b) => a.Date - b.Date);
    const close = ms.filter((m) => isNum(m.Date) && m.Date < t && ["Booked", "To confirm"].includes(m.Status));
    const held = ms.filter((m) => m.Status === "Held").sort((a, b) => (b.Date || 0) - (a.Date || 0)).slice(0, 15);
    const qs = setting("QStart", t - 90);
    const heldQ = ms.filter((m) => m.Status === "Held" && isNum(m.Date) && m.Date >= qs);
    return { title: "Meetings", back: true, html: `
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="v">${up.length}</div><div class="l">Booked ahead</div></div>
      <div class="kpi"><div class="v">${heldQ.length}</div><div class="l">Held this qtr</div></div><div class="kpi"><div class="v">${heldQ.filter((m) => m["Decision Maker?"] === "Y").length}</div><div class="l">With decision makers</div></div></div>
      <button class="btn pri block" data-act="newmeeting">Book a meeting</button>
      ${section("Upcoming", up.map(meetCard), "", "No meetings booked")}
      ${section("To close out", close.map(meetCard), "warn")}
      ${section("Recently held", held.map(meetCard))}` };
  };
  function meetingForm(m, r) {
    const isNew = !m; m = m || { Date: today() + 1, Status: "Booked", "Meeting Type": "Discovery", "Decision Maker?": "Y", Account: r ? r.Account : "", Contact: r ? r.Contact : "", Designation: r ? r.Designation : "" };
    sheet(isNew ? "Book meeting" : "Meeting · " + m.Account, `
      ${field("Account", "Account", m.Account, "text", 'list="accts2"')}${datalist("accts2", deals().map((d) => d.Account))}
      <div class="f2">${field("Contact", "Contact", m.Contact)}${field("Designation", "Designation", m.Designation)}</div>
      <div class="f2">${field("Date", "Date", m.Date, "date")}${field("Time (for Outlook)", "time", "11:00", "time")}</div>
      <div class="f"><label>Decision maker?</label>${chips("dm", ["Y", "N"], m["Decision Maker?"])}</div>
      <div class="f"><label>Type</label>${chips("type", L("MeetType"), m["Meeting Type"])}</div>
      <div class="f"><label>Status</label>${chips("status", L("MeetStatus"), m.Status)}</div>
      ${field("Agenda / outcome / next step", "out", m["Outcome / Next Step"], "textarea")}
      ${isNew ? `<div class="toggle"><div><b>Add to Outlook</b><div class="hint">45-min calendar event with reminder</div></div><input type="checkbox" name="cal" checked></div>` : ""}
      <button class="btn pri block" id="save">${isNew ? "Book" : "Save"}</button>`, (el, close) => {
      $("#save", el).onclick = () => {
        const f = form(el);
        const v = { Date: f.Date, Account: f.Account, Contact: f.Contact, Designation: f.Designation, "Decision Maker?": chipVal(el, "dm"), "Meeting Type": chipVal(el, "type"), Status: chipVal(el, "status"), "Outcome / Next Step": f.out, Owner: m.Owner || C.owner };
        if (!v.Account || !isNum(v.Date)) return toast("Account and date are required", "warn");
        if (isNew) {
          API.add("meetings", v);
          if (f.cal && v.Status === "Booked") { const d = deals().find((x) => x.Account === v.Account && x.Contact === v.Contact) || v; API.event(reminderEvent(`Meeting: ${v.Contact} (${v.Account})`, v.Date, f.time, contactBlock(d), 45)); }
          const d = deals().find((x) => x.Account === v.Account && x.Contact === v.Contact);
          if (d && v.Status === "Booked") API.update("pipeline", d, { "Next Step": "Meeting" + (v["Meeting Type"] ? " (" + v["Meeting Type"] + ")" : ""), "Next Step Date": v.Date });
        } else API.update("meetings", m, v);
        if (v.Status === "Held") afterHeld(v);
        close(); toast(isNew ? "Meeting booked" : "Saved"); render();
      };
    });
  }
  function afterHeld(v) {
    const d = deals().find((x) => x.Account === v.Account && x.Contact === v.Contact);
    if (!d) return;
    const order = L("Stage"); const ch = { "Last Contact": v.Date };
    if (order.indexOf(d.Stage) < order.indexOf("Discovery Meeting")) ch.Stage = "Discovery Meeting";
    API.update("pipeline", d, ch);
  }
  function markHeld(m) {
    sheet("Meeting held · " + m.Account, `
      <div class="f"><label>Was it with the decision maker?</label>${chips("dm", ["Y", "N"], m["Decision Maker?"] || "Y")}</div>
      ${field("Outcome", "out", "", "textarea", 'placeholder="Need, roles, headcount, timeline, who signs off..."')}
      ${field("Next step", "next", "")}
      <div class="f"><label>Next step date</label>${dateChips("nd", "")}</div>
      <button class="btn pri block" id="save">Save</button>`, (el, close) => {
      wireDateChips(el);
      $("#save", el).onclick = () => {
        const f = form(el);
        API.update("meetings", m, { Status: "Held", "Decision Maker?": chipVal(el, "dm"), "Outcome / Next Step": [f.out, f.next].filter(Boolean).join(" | Next: ") || m["Outcome / Next Step"] });
        const d = deals().find((x) => x.Account === m.Account && x.Contact === m.Contact);
        if (d) {
          const order = L("Stage"); const ch = { "Last Contact": m.Date || today() };
          if (order.indexOf(d.Stage) < order.indexOf("Discovery Meeting")) ch.Stage = "Discovery Meeting";
          if (f.next) ch["Next Step"] = f.next; if (isNum(f.nd)) ch["Next Step Date"] = f.nd;
          API.update("pipeline", d, ch);
          API.add("activity", { Date: m.Date || today(), "Deal ID": d["Deal ID"], Account: d.Account, Contact: d.Contact, Channel: "Meeting", Outcome: "Held", Notes: f.out, "Next Step": f.next, "Next Step Date": f.nd || "", "Logged By": C.owner });
        }
        close(); toast("Meeting closed out"); render();
      };
    });
  }

  // ---------------- OUTREACH
  const CHANNELS = ["Email", "Cold Call", "LinkedIn", "Referral", "Event"];
  function outreachWeek(ws) {
    const o = {}; CHANNELS.forEach((c) => (o[c] = { a: 0, r: 0, m: 0 }));
    live("outreach").filter((x) => x["Week Start (Mon)"] === ws).forEach((x) => { const c = o[x.Channel]; if (c) { c.a += +x.Activities || 0; c.r += +x.Responses || 0; c.m += +x["Meetings Booked"] || 0; } });
    return o;
  }
  V.outreach = () => {
    const ws = D.weekStart(today());
    const wk = outreachWeek(ws);
    const tg = { Email: setting("T_Email", 100), "Cold Call": setting("T_Call", 50), LinkedIn: setting("T_LinkedIn", 50) };
    const four = {}; CHANNELS.forEach((c) => (four[c] = { a: 0, r: 0, m: 0 }));
    for (let k = 0; k < 4; k++) { const w = outreachWeek(ws - 7 * k); CHANNELS.forEach((c) => { four[c].a += w[c].a; four[c].r += w[c].r; four[c].m += w[c].m; }); }
    const best = CHANNELS.filter((c) => four[c].a > 0).sort((a, b) => four[b].m / four[b].a - four[a].m / four[a].a || four[b].r / four[b].a - four[a].r / four[a].a)[0];
    const mt = setting("T_Meetings", 4); const mBooked = CHANNELS.reduce((s, c) => s + wk[c].m, 0);
    const tile = (c) => {
      const t = tg[c]; const p = t ? Math.min(100, (100 * wk[c].a) / t) : 0;
      return `<div class="card otile"><div><div class="name">${c === "Cold Call" ? "Calls" : c}</div>
        <div class="nums">Today <b>${Store.todayCount(c, "Activities")}</b>${t ? ` / ${Math.ceil(t / 5)}` : ""} · Week <b>${wk[c].a}</b>${t ? ` / ${t}` : ""} · ${wk[c].r} replies · ${wk[c].m} mtgs</div></div>
        <div class="ctr"><button class="minus" data-act="inc" data-c="${c}" data-f="Activities" data-d="-1">−</button><button data-act="inc" data-c="${c}" data-f="Activities" data-d="1">+1</button><button data-act="inc" data-c="${c}" data-f="Activities" data-d="5">+5</button></div>
        ${t ? `<div class="bar ${p >= 100 ? "over" : ""}"><i style="width:${p}%"></i></div>` : ""}
        <div style="grid-column:1/-1;display:flex;gap:6px;margin-top:6px"><button class="btn" data-act="inc" data-c="${c}" data-f="Responses" data-d="1">+ Reply</button><button class="btn" data-act="inc" data-c="${c}" data-f="Meetings Booked" data-d="1">+ Meeting booked</button></div></div>`;
    };
    return { title: "Outreach", html: `
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:12px;color:var(--ink-3)">MEETINGS BOOKED THIS WEEK</div><div class="big-n">${mBooked} <span style="font-size:16px;color:var(--ink-3)">/ ${mt}</span></div></div>
        <div style="text-align:right"><div style="font-size:12px;color:var(--ink-3)">BEST CHANNEL (4 WKS)</div><b style="color:var(--teal)">${esc(best ? (best === "Cold Call" ? "Calls" : best) : "Log a week to see")}</b></div></div>
        <div class="bar ${mBooked >= mt ? "over" : ""}"><i style="width:${Math.min(100, (100 * mBooked) / Math.max(1, mt))}%"></i></div></div>
      <div class="hint" style="margin:0 4px 8px">Week of ${D.fmt(ws, { abs: 1 })}. Calls, emails & LinkedIn logged on a deal count automatically - use + for bulk outreach.</div>
      ${CHANNELS.map(tile).join("")}
      <div class="sec"><h2>Last 4 weeks - what's working</h2></div>
      <div class="card"><table class="mini"><tr><th>Channel</th><th class="n">Touches</th><th class="n">Reply %</th><th class="n">Mtgs</th><th class="n">Mtg %</th></tr>
        ${CHANNELS.map((c) => `<tr><td>${c === "Cold Call" ? "Calls" : c}</td><td class="n">${four[c].a}</td><td class="n">${four[c].a ? pct(four[c].r / four[c].a) : "-"}</td><td class="n">${four[c].m}</td><td class="n">${four[c].a ? pct(four[c].m / four[c].a) : "-"}</td></tr>`).join("")}
      </table></div>` };
  };

  // ---------------- PROPOSALS
  function gm(b, c) { return isNum(b) && b > 0 && isNum(c) ? (b - c) / b : null; }
  function propCard(p) {
    const g = gm(p["Bill Rate (INR/month)"], p["Cost Rate (INR/month)"]); const mm = setting("MarginMin", 0.25);
    return `<div class="card deal" data-act="prop" data-sig='${esc(p._sig)}'><div class="main">
      <div class="t1"><span>${esc(p.Account)}</span></div><div class="t2">${esc(p.Type)} · ${esc(p["Scope / Roles"] || "")}</div>
      <div class="meta"><span class="chip">${esc(p.Status || "")}</span>${isNum(p["Date Sent"]) ? `<span class="chip">Sent ${D.fmt(p["Date Sent"], { abs: 1 })}</span>` : ""}
      ${g !== null ? `<span class="chip ${g < mm ? "bad" : "ok"}">GM ${pct(g)}</span>` : ""}${p["Approval Status"] && p["Approval Status"] !== "Not needed" ? `<span class="chip">${esc(p["Approval Status"])}</span>` : ""}</div></div></div>`;
  }
  V.proposals = () => {
    const ps = live("proposals");
    const open = ps.filter((p) => ["In preparation", "Sent", "Under review"].includes(p.Status));
    const done = ps.filter((p) => !open.includes(p));
    return { title: "Proposals & rates", back: true, html: `<button class="btn pri block" data-act="newprop">New proposal / rate card</button>
      ${section("In play", open.map(propCard), "", "No open proposals")}${section("Closed", done.map(propCard))}` };
  };
  function propForm(p, r) {
    const isNew = !p; p = p || { Account: r ? r.Account : "", Type: "Rate Card", Status: "In preparation", "Approval Status": "Not needed" };
    const mm = setting("MarginMin", 0.25);
    sheet(isNew ? "New proposal / rate card" : p.Account, `
      ${field("Account", "Account", p.Account, "text", 'list="accts3"')}${datalist("accts3", deals().map((d) => d.Account))}
      <div class="f"><label>Type</label>${chips("type", L("PropType"), p.Type)}</div>
      ${field("Scope / roles", "scope", p["Scope / Roles"], "textarea")}
      <div class="f2">${field("Headcount", "hc", p.Headcount, "number")}${field("Date sent", "ds", p["Date Sent"], "date")}</div>
      <div class="f2">${field("Bill rate ₹ / month", "bill", p["Bill Rate (INR/month)"], "number", 'inputmode="numeric"')}${field("Cost rate ₹ / month", "cost", p["Cost Rate (INR/month)"], "number", 'inputmode="numeric"')}</div>
      <div class="card" id="gmbox" style="text-align:center;box-shadow:none;background:var(--bg)"></div>
      <div class="f"><label>Status</label>${chips("status", L("PropStatus"), p.Status)}</div>
      <div class="f"><label>Approval</label>${chips("appr", L("Approval"), p["Approval Status"])}</div>
      ${field("Notes", "notes", p.Notes, "textarea")}
      <button class="btn pri block" id="save">Save</button>`, (el, close) => {
      const upd = () => { const f = form(el); const g = gm(f.bill, f.cost); const box = $("#gmbox", el);
        box.innerHTML = g === null ? '<span class="hint">Enter bill & cost rate to see gross margin</span>' : `<div style="font-size:12px;color:var(--ink-3)">GROSS MARGIN</div><div class="big-n" style="color:${g < mm ? "var(--bad)" : "var(--ok)"}">${pct(g)}</div><div class="hint">${g < mm ? `Below ${pct(mm)} - needs your approval` : `Meets the ${pct(mm)} threshold`} · margin ${fmtL((f.bill - f.cost) * (f.hc || 1))}/mo${f.hc ? " for " + f.hc : ""}</div>`; };
      $$('[name="bill"],[name="cost"],[name="hc"]', el).forEach((i) => i.addEventListener("input", upd)); upd();
      $("#save", el).onclick = () => {
        const f = form(el); const g = gm(f.bill, f.cost);
        let appr = chipVal(el, "appr"); if (g !== null && g < mm && (!appr || appr === "Not needed")) appr = "Pending";
        const v = { Account: f.Account, Type: chipVal(el, "type"), "Scope / Roles": f.scope, Headcount: f.hc, "Date Sent": f.ds, "Bill Rate (INR/month)": f.bill, "Cost Rate (INR/month)": f.cost, Status: chipVal(el, "status"), "Approval Status": appr, Notes: f.notes };
        if (!v.Account) return toast("Account is required", "warn");
        if (isNew) API.add("proposals", v); else API.update("proposals", p, v);
        const d = deals().find((x) => x.Account === v.Account);
        const order = L("Stage");
        if (d && v.Status === "Sent" && order.indexOf(d.Stage) < order.indexOf("Proposal Sent")) API.update("pipeline", d, { Stage: "Proposal Sent" });
        close(); toast("Saved"); render();
      };
    });
  }

  // ---------------- REQUIREMENTS & LOGOS
  function reqCard(q) {
    const cls = { Yes: "ok", Partial: "warn", No: "bad", Assessing: "" }[q["TA Can Fill?"]] || "";
    const days = isNum(q["Date Received"]) ? today() - q["Date Received"] : null;
    return `<div class="card deal" data-act="req" data-sig='${esc(q._sig)}'><div class="main"><div class="t1"><span>${esc(q.Account)}</span></div>
      <div class="t2">${esc(q["Role / Skill"])}${q.Positions ? " · " + esc(q.Positions) + " pos" : ""}${q.Location ? " · " + esc(q.Location) : ""}</div>
      <div class="meta"><span class="chip ${cls}">TA: ${esc(q["TA Can Fill?"] || "-")}</span><span class="chip stage">${esc(q.Status)}</span>${q["Profiles Submitted"] ? `<span class="chip">${q["Profiles Submitted"]} submitted</span>` : ""}${days != null ? `<span class="chip">${days}d open</span>` : ""}</div></div></div>`;
  }
  function accCard(a) {
    const t = today(); const dep = isNum(a["First Resource Deployed Date"]) ? t - a["First Resource Deployed Date"] : null; const N = setting("IncentiveDays", 60);
    const g = gm(a["Monthly Billing (INR)"], a["Monthly Cost (INR)"]);
    return `<div class="card deal" data-go="#/clients/${encodeURIComponent(a.Account)}"><div class="main"><div class="t1"><span>${esc(a.Account)}</span></div>
      <div class="t2">${esc(a["Account Type"])} · ${esc(a["Current Stage"])}</div>${a["Next Step"] ? `<div class="t3">→ ${esc(a["Next Step"])}</div>` : ""}
      <div class="meta">${isNum(a["Next Step Date"]) ? `<span class="chip ${a["Next Step Date"] < t ? "bad" : ""}">${D.fmt(a["Next Step Date"])}</span>` : '<span class="chip warn">No date</span>'}
      ${isNum(a["Logo Won Date"]) ? `<span class="chip ok">Logo ${D.fmt(a["Logo Won Date"], { abs: 1 })}</span>` : ""}${g !== null ? `<span class="chip ${g < setting("MarginMin", 0.25) ? "bad" : "ok"}">GM ${pct(g)}</span>` : ""}</div>
      ${dep != null ? `<div style="margin-top:8px;font-size:12px;color:var(--ink-2)">Deployed ${dep} days · ${dep >= N ? "<b style='color:var(--ok)'>Incentive triggered</b>" : `${N - dep} days to incentive`}</div><div class="prog" style="margin-top:4px"><i style="width:${Math.min(100, (100 * dep) / N)}%"></i></div>` : ""}
      </div></div>`;
  }
  const rstate = { tab: "req" };
  V.reqs = (params) => {
    if (params.tab) rstate.tab = params.tab;
    const reqs = live("requirements"); const open = reqs.filter((q) => !["Filled", "Closed - Lost"].includes(q.Status));
    const accs = live("accounts");
    const t = today(); const qs = setting("QStart", t), qe = setting("QEnd", t);
    const logosQ = accs.filter((a) => isNum(a["Logo Won Date"]) && a["Logo Won Date"] >= qs && a["Logo Won Date"] <= qe).length;
    const body = rstate.tab === "req"
      ? `<button class="btn pri block" data-act="newreq">Add requirement</button>${section("Open", open.map(reqCard), "", "No open requirements")}${section("Closed", reqs.filter((q) => !open.includes(q)).map(reqCard))}`
      : `<div class="card"><div style="display:flex;justify-content:space-between"><div><div style="font-size:12px;color:var(--ink-3)">NEW LOGOS THIS QUARTER</div><div class="big-n">${logosQ} <span style="font-size:16px;color:var(--ink-3)">/ ${setting("LogoTarget", 2)}</span></div></div>
         <button class="btn" data-act="newacc">Add client</button></div><div class="prog"><i style="width:${Math.min(100, (100 * logosQ) / setting("LogoTarget", 2))}%"></i></div></div>
         ${section("Clients in progress", accs.filter((a) => a["Account Type"] === "Client in Progress").map(accCard))}
         ${section("Active clients", accs.filter((a) => a["Account Type"] === "Active Client").map(accCard))}
         ${section("Handed over", accs.filter((a) => a["Account Type"] === "Handed over to AM").map(accCard))}`;
    return { title: "Requirements & logos", back: true, html: `<div class="seg" style="margin-bottom:10px" id="rtab"><button data-v="req" class="${rstate.tab === "req" ? "on" : ""}">Requirements (${open.length})</button><button data-v="logo" class="${rstate.tab === "logo" ? "on" : ""}">Clients & logos</button></div>${body}`,
      mount: (el) => { $("#rtab", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { rstate.tab = b.dataset.v; render(); } }; } };
  };
  function reqForm(q, r) {
    const isNew = !q; q = q || { Account: r ? r.Account : "", "Date Received": today(), Status: "Open", "TA Can Fill?": "Assessing" };
    sheet(isNew ? "New requirement" : q.Account, `
      ${field("Account", "Account", q.Account, "text", 'list="accts4"')}${datalist("accts4", deals().map((d) => d.Account).concat(live("accounts").map((a) => a.Account)))}
      ${field("Role / skill", "role", q["Role / Skill"])}
      <div class="f2">${field("Positions", "pos", q.Positions, "number")}${field("Experience (yrs)", "exp", q["Experience (yrs)"])}</div>
      <div class="f2">${field("Location", "loc", q.Location)}${field("Bill rate ₹ / month", "bill", q["Bill Rate (INR/month)"], "number")}</div>
      ${field("Date received", "dr", q["Date Received"], "date")}
      <div class="f"><label>Can TA fill it?</label>${chips("ta", L("TAFill"), q["TA Can Fill?"])}</div>
      <div class="f"><label>Status</label>${chips("st", L("ReqStatus"), q.Status)}</div>
      <div class="f2" style="grid-template-columns:1fr 1fr 1fr">${field("Submitted", "sub", q["Profiles Submitted"], "number")}${field("Interviews", "int", q.Interviews, "number")}${field("Selected", "sel", q.Selected, "number")}</div>
      ${field("TA owner", "ta_o", q["TA Owner"])}${field("Notes", "notes", q.Notes, "textarea")}
      <button class="btn pri block" id="save">Save</button>`, (el, close) => {
      $("#save", el).onclick = () => {
        const f = form(el);
        const v = { Account: f.Account, "Role / Skill": f.role, Positions: f.pos, "Experience (yrs)": f.exp, Location: f.loc, "Bill Rate (INR/month)": f.bill, "Date Received": f.dr, "TA Can Fill?": chipVal(el, "ta"), Status: chipVal(el, "st"), "Profiles Submitted": f.sub, Interviews: f.int, Selected: f.sel, "TA Owner": f.ta_o, Notes: f.notes };
        if (!v.Account || !v["Role / Skill"]) return toast("Account and role are required", "warn");
        if (isNew) API.add("requirements", v); else API.update("requirements", q, v);
        const d = deals().find((x) => x.Account === v.Account); const order = L("Stage");
        if (isNew && d && order.indexOf(d.Stage) < order.indexOf("First Requirement") && order.indexOf(d.Stage) >= order.indexOf("MSA / Contracting")) API.update("pipeline", d, { Stage: "First Requirement" });
        const a = live("accounts").find((x) => x.Account === v.Account);
        if (isNew && a && !isNum(a["First Requirement Date"])) API.update("accounts", a, { "First Requirement Date": v["Date Received"] || today() });
        close(); toast("Saved"); render();
      };
    });
  }
  V.clients = (params, name) => {
    const a = live("accounts").find((x) => x.Account === decodeURIComponent(name));
    if (!a) return { title: "Client", back: true, html: '<div class="empty">Not found</div>' };
    const stages = L("AcctStage"); const si = stages.indexOf(a["Current Stage"]);
    const reqs = live("requirements").filter((q) => q.Account === a.Account);
    const ppl = deals().filter((d) => d.Account === a.Account);
    return { title: a.Account, back: true, html: `${accCard(a).replace('data-go=', 'data-x=')}
      <div class="card"><div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">STAGE</div><div class="stepper">${stages.map((s, i) => `<button data-act="accstage" data-n="${esc(a.Account)}" data-v="${esc(s)}" class="${s === a["Current Stage"] ? "on" : i < si ? "done" : ""}">${esc(s)}</button>`).join("")}</div></div>
      <div class="card"><div class="kv"><div>Empanelment</div><div>${esc(a.Empanelment || "-")}</div><div>MSA</div><div>${esc(a.MSA || "-")}</div>
      <div>Logo won</div><div>${esc(D.fmt(a["Logo Won Date"], { abs: 1, year: 1 }) || "-")}</div><div>First requirement</div><div>${esc(D.fmt(a["First Requirement Date"], { abs: 1, year: 1 }) || "-")}</div>
      <div>First deployed</div><div>${esc(D.fmt(a["First Resource Deployed Date"], { abs: 1, year: 1 }) || "-")}</div><div>Billing / cost</div><div>${fmtL(a["Monthly Billing (INR)"]) || "-"} / ${fmtL(a["Monthly Cost (INR)"]) || "-"}</div>
      <div>Handover</div><div>${a["Handover Ready?"] === "Y" ? "Ready" : "Not yet"} · brief ${a["Brief Complete?"] === "Y" ? "complete" : "pending"}${a["AM Owner"] ? " · AM " + esc(a["AM Owner"]) : ""}</div><div>Notes</div><div>${esc(a.Notes || "-")}</div></div></div>
      <button class="btn pri block" data-act="editacc" data-n="${esc(a.Account)}">Update client</button>
      ${section("Requirements", reqs.map(reqCard))}${section("Contacts in pipeline", ppl.map((d) => dealCard(d, { noActs: true })))}` };
  };
  function accForm(a) {
    const isNew = !a; a = a || { "Account Type": "Client in Progress", "Current Stage": "Meeting", "Handover Ready?": "N", "Brief Complete?": "N" };
    sheet(isNew ? "Add client" : a.Account, `
      ${field("Account", "Account", a.Account, "text", isNew ? "" : "readonly")}
      <div class="f"><label>Type</label>${chips("type", L("AcctType"), a["Account Type"])}</div>
      ${select("Current stage", "stage", L("AcctStage"), a["Current Stage"], false)}
      ${field("Next step", "ns", a["Next Step"])}<div class="f"><label>Next step date</label>${dateChips("nd", a["Next Step Date"])}</div>
      <div class="f2">${select("Empanelment", "emp", L("Progress"), a.Empanelment)}${select("MSA", "msa", L("ContractStatus"), a.MSA)}</div>
      <div class="f2">${field("Logo won date", "lw", a["Logo Won Date"], "date")}${field("First requirement", "fr", a["First Requirement Date"], "date")}</div>
      ${field("First resource deployed", "fd", a["First Resource Deployed Date"], "date")}
      <div class="f2">${field("Monthly billing ₹", "bill", a["Monthly Billing (INR)"], "number")}${field("Monthly cost ₹", "cost", a["Monthly Cost (INR)"], "number")}</div>
      <div class="f2"><div class="f"><label>Handover ready?</label>${chips("ho", ["Y", "N"], a["Handover Ready?"])}</div><div class="f"><label>Brief complete?</label>${chips("br", ["Y", "N"], a["Brief Complete?"])}</div></div>
      ${field("AM owner", "am", a["AM Owner"])}${field("Notes", "notes", a.Notes, "textarea")}
      <button class="btn pri block" id="save">Save</button>`, (el, close) => {
      wireDateChips(el);
      $("#save", el).onclick = () => {
        const f = form(el);
        const v = { Account: f.Account, "Account Type": chipVal(el, "type"), "Current Stage": f.stage, "Next Step": f.ns, "Next Step Date": f.nd, Empanelment: f.emp, MSA: f.msa, "Logo Won Date": f.lw, "First Requirement Date": f.fr, "First Resource Deployed Date": f.fd, "Monthly Billing (INR)": f.bill, "Monthly Cost (INR)": f.cost, "Handover Ready?": chipVal(el, "ho"), "Brief Complete?": chipVal(el, "br"), "AM Owner": f.am, Notes: f.notes };
        if (!v.Account) return toast("Account is required", "warn");
        if (v["Handover Ready?"] === "Y" && v["Brief Complete?"] !== "Y") toast("Handover marked ready - brief still pending", "warn");
        if (isNew) API.add("accounts", v); else API.update("accounts", a, v);
        close(); toast("Saved"); render();
      };
    });
  }

  // ---------------- LEADS (event quick-add + business card scan)
  V.leads = () => {
    const ls = live("leads"); const evs = [...new Set(live("events").map((e) => e["Event / Referral"]).concat(L("Source")))].filter(Boolean);
    const last = localStorage.getItem("pp.lastEvent") || evs[evs.length - 1] || "";
    const recent = ls.slice(-25).reverse();
    return { title: "Leads & events", back: true, html: `
      <div class="card"><b>Quick-add lead</b>
        <div class="acts" style="margin:10px 0"><label class="btn pri" style="display:inline-flex;gap:6px;align-items:center">${I.lead}<span>Scan business card</span><input type="file" accept="image/*" capture="environment" id="scan" class="hidden"></label><span class="hint" id="scanmsg"></span></div>
        <div class="f"><label>Event</label><input name="Event" value="${esc(last)}" list="evs">${datalist("evs", evs)}</div>
        <div class="f2">${field("Name *", "Name", "")}${field("Organization *", "Organization", "")}</div>
        <div class="f2">${field("Designation", "Designation", "")}${field("Location", "Location", "")}</div>
        <div class="f2">${field("Phone", "Phone", "", "tel")}${field("Email", "Email", "", "email")}</div>
        <div class="f"><label>Response</label>${chips("resp", L("Response"), "")}</div>
        ${field("What they said / need", "Comments", "", "textarea")}
        ${field("Attachments & links (doc / Outlook thread / Drive — one per line)", "Links", "", "textarea")}
        <label class="btn block" style="margin-top:-2px">${I.link} Upload a file (PDF, image, doc…)<input type="file" id="leadfile2" class="hidden"></label>
        <div class="toggle" style="margin-top:8px"><div><b>Also add to pipeline</b><div class="hint">Creates an opportunity with this event as source</div></div><input type="checkbox" name="topipe"></div>
        <button class="btn pri block" id="saveLead">Save lead</button></div>
      ${section("Recent leads", recent.map((l) => `<div class="card deal"><div class="main"><div class="t1"><span>${esc(l.Name)}</span></div><div class="t2">${esc(l.Organization)}${l.Designation ? " · " + esc(l.Designation) : ""}</div>
        <div class="meta"><span class="chip">${esc(l.Event)}</span>${l.Response ? `<span class="chip ${l.Response === "Positive" ? "ok" : ""}">${esc(l.Response)}</span>` : ""}${deals().some((d) => d.Account === l.Organization) ? '<span class="chip stage">In pipeline</span>' : `<button class="btn" data-act="lead2pipe" data-sig='${esc(l._sig)}'>→ Pipeline</button>`}<button class="btn" data-act="editlead" data-sig='${esc(l._sig)}'>Edit / links</button></div>
        ${linkChips(linkList(l.Links, l.Comments))}</div></div>`))}`,
      mount: (el) => {
        wireChips(el);
        $("#saveLead", el).onclick = () => {
          const f = form(el); if (!f.Name || !f.Organization) return toast("Name and organization are required", "warn");
          const v = { Event: f.Event, Name: f.Name, Organization: f.Organization, Location: f.Location, Designation: f.Designation, Response: chipVal(el, "resp"), Comments: f.Comments, Links: f.Links, Email: f.Email, Phone: f.Phone, "Last Follow-up": today() };
          API.add("leads", v); localStorage.setItem("pp.lastEvent", f.Event);
          if (f.topipe) API.add("pipeline", { "Deal ID": nextDealId(), Account: f.Organization, Contact: f.Name, Designation: f.Designation, City: f.Location, Source: f.Event, "Service Line": "Contract Staffing", Stage: "Contact Established", Temperature: v.Response === "Positive" ? "Warm" : "Cool", "Last Contact": today(), "Next Step": "Follow up after event", "Next Step Date": D.addBiz(today(), 2), Notes: f.Comments, Email: f.Email, Phone: f.Phone, Owner: C.owner });
          toast("Lead saved"); render();
        };
        $("#scan", el).onchange = (e) => scanCard(e.target.files[0], el);
        const lf2 = $("#leadfile2", el); if (lf2) lf2.onchange = (e) => uploadAttach(e.target.files[0], $('[name="Links"]', el));
      } };
  };
  function leadEdit(l) {
    sheet("Edit · " + (l.Name || "lead"), `
      <div class="f2">${field("Name", "Name", l.Name)}${field("Organization", "Organization", l.Organization)}</div>
      <div class="f2">${field("Phone", "Phone", l.Phone, "tel")}${field("Email", "Email", l.Email, "email")}</div>
      <div class="f"><label>Response</label>${chips("resp", L("Response"), l.Response)}</div>
      ${field("Notes / what they said", "Comments", l.Comments, "textarea")}
      ${field("Attachments & links (doc / Outlook thread / Drive — one per line)", "Links", l.Links, "textarea")}
      <label class="btn block" style="margin-top:-2px">${I.link} Upload a file (PDF, image, doc…)<input type="file" id="leadfile" class="hidden"></label>
      ${l.Links ? `<div style="margin-top:6px">${linkChips(linkList(l.Links))}</div>` : ""}
      <button class="btn pri block" id="save" style="margin-top:8px">Save</button>`, (el, close) => {
      wireChips(el);
      const lf = $("#leadfile", el); if (lf) lf.onchange = (e) => uploadAttach(e.target.files[0], $('[name="Links"]', el));
      $("#save", el).onclick = () => {
        const f = form(el);
        API.update("leads", l, { Name: f.Name, Organization: f.Organization, Phone: f.Phone, Email: f.Email, Response: chipVal(el, "resp"), Comments: f.Comments, Links: f.Links });
        close(); toast("Saved"); render();
      };
    });
  }
  async function scanCard(file, el) {
    if (!file) return;
    const msg = $("#scanmsg", el); msg.textContent = "Reading card...";
    try {
      if (!window.Tesseract) {
        if (!navigator.onLine) throw new Error("Card scan needs a connection the first time");
        await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
      }
      const { data } = await Tesseract.recognize(file, "eng", { logger: (m) => { if (m.status === "recognizing text") msg.textContent = "Reading card... " + Math.round(m.progress * 100) + "%"; } });
      const text = data.text; const lines = text.split("\n").map((x) => x.trim()).filter((x) => x.length > 1);
      const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [""])[0];
      const phone = (text.replace(/[()]/g, "").match(/(\+?\d[\d\s-]{8,}\d)/) || [""])[0].replace(/\s+/g, " ");
      const desigRe = /(director|manager|head|vp|vice president|chief|ceo|cto|cfo|cio|lead|officer|president|founder|partner|engineer|consultant|architect|specialist|analyst|executive)/i;
      const desig = lines.find((l) => desigRe.test(l)) || "";
      const name = lines.find((l) => /^[A-Za-z][A-Za-z.\s'-]{3,40}$/.test(l) && l.split(" ").length <= 4 && !desigRe.test(l) && !/@|www|\.com/i.test(l)) || "";
      let org = "";
      if (email) { const dom = email.split("@")[1].split(".")[0]; if (!/gmail|yahoo|outlook|hotmail/.test(dom)) org = dom.charAt(0).toUpperCase() + dom.slice(1); }
      const orgLine = lines.find((l) => /(ltd|limited|pvt|inc|llp|technologies|solutions|systems|labs|group|services|corp)/i.test(l));
      if (orgLine) org = orgLine;
      const set = (n, v) => { const i = $(`[name="${n}"]`, el); if (i && v && !i.value) i.value = v; };
      set("Name", name); set("Designation", desig); set("Email", email); set("Phone", phone); set("Organization", org);
      set("Comments", ""); msg.textContent = "Check the fields - scan isn't perfect.";
    } catch (e) { msg.textContent = "Could not read the card: " + e.message; }
  }
  function lead2pipe(l) {
    dealForm(null, { Account: l.Organization, Contact: l.Name, Designation: l.Designation, City: l.Location, Source: l.Event, Phone: l.Phone, Email: l.Email, Notes: l.Comments, Stage: "Contact Established", Temperature: l.Response === "Positive" ? "Warm" : "Cool", "Next Step": "Follow up after event", "Next Step Date": D.addBiz(today(), 2) });
  }

  // ---------------- COMMITMENTS
  function commitCard(c) {
    const t = today(); const od = isNum(c["Due Date"]) && c["Due Date"] < t && ["Proposed", "Committed"].includes(c.Status);
    return `<div class="card deal" data-act="commit" data-sig='${esc(c._sig)}'><div class="main"><div class="t1"><span>${esc(c.Commitment)}</span></div>
      <div class="meta">${c.Account ? `<span class="chip">${esc(c.Account)}</span>` : ""}<span class="chip ${od ? "bad" : ""}">${isNum(c["Due Date"]) ? "Due " + D.fmt(c["Due Date"]) : "No due date"}</span><span class="chip stage">${esc(c.Status)}</span></div>
      ${["Proposed", "Committed"].includes(c.Status) ? `<div class="acts"><button class="pri" data-act="cdone" data-sig='${esc(c._sig)}'>Done</button>${c.Status === "Proposed" ? `<button data-act="ccommit" data-sig='${esc(c._sig)}'>Commit</button>` : ""}<button data-act="cslip" data-sig='${esc(c._sig)}'>Slipped</button></div>` : ""}</div></div>`;
  }
  V.commitments = () => {
    const cs = live("commitments"); const open = cs.filter((c) => ["Proposed", "Committed"].includes(c.Status)).sort((a, b) => (a["Due Date"] || 9e9) - (b["Due Date"] || 9e9));
    return { title: "Commitments", back: true, html: `<button class="btn pri block" data-act="newcommit">Add commitment</button>${section("Open", open.map(commitCard), "", "No open commitments")}${section("Done / slipped", cs.filter((c) => !open.includes(c)).slice(-15).reverse().map(commitCard))}` };
  };
  function commitForm(c) {
    const isNew = !c; c = c || { "Stand-up Date": today(), Status: "Committed", Owner: C.owner, "Due Date": today() + 14 };
    sheet(isNew ? "New commitment" : "Commitment", `${field("Commitment", "cm", c.Commitment, "textarea")}${field("Account", "acc", c.Account, "text", 'list="accts5"')}${datalist("accts5", deals().map((d) => d.Account))}
      <div class="f"><label>Due</label>${dateChips("due", c["Due Date"])}</div><div class="f"><label>Status</label>${chips("st", L("CommitStatus"), c.Status)}</div>
      <button class="btn pri block" id="save">Save</button>
      ${isNew ? "" : `<button class="btn block" id="tt" style="margin-top:8px">${I.tt}Send to TickTick</button>`}`, (el, close) => {
      wireDateChips(el);
      if ($("#tt", el)) $("#tt", el).onclick = () => ttButton($("#tt", el), () => ttPushCommit(c));
      $("#save", el).onclick = () => { const f = form(el); if (!f.cm) return toast("Write the commitment", "warn");
        const v = { "Stand-up Date": c["Stand-up Date"], Commitment: f.cm, Account: f.acc, Owner: c.Owner || C.owner, "Due Date": f.due, Status: chipVal(el, "st") };
        if (isNew) API.add("commitments", v); else API.update("commitments", c, v); ttAutoCommit(v); close(); toast("Saved"); render(); };
    });
  }

  // ---------------- STAND-UP
  const AGENDA = { deals: { title: "Deals (Weeks 1 & 3)" }, outreach: { title: "Outreach & Contracts (Weeks 2 & 4)" }, okr: { title: "OKR review (last Thursday)" } };
  function agendaKey() {
    const t = today(); if (t === D.lastThursday(t)) return "okr";
    const w = Math.floor((D.toJS(t).getUTCDate() - 1) / 7) + 1; return w === 2 || w === 4 ? "outreach" : "deals";
  }
  const sstate = { tab: null };
  V.standup = () => {
    const tab = sstate.tab || agendaKey();
    const slides = STANDUP[tab]();
    return { title: "Stand-up", back: true, html: `
      <div class="tabs seg" id="stab">${Object.entries(AGENDA).map(([k, v]) => `<button data-v="${k}" class="${k === tab ? "on" : ""}">${k === agendaKey() ? "● " : ""}${v.title.split(" (")[0]}</button>`).join("")}</div>
      <div class="deck" id="deck">${slides.map((s, i) => `<div class="slide"><div class="q">${i + 1} / ${slides.length}</div><h3>${esc(s.t)}</h3><div class="q">${esc(s.q || "")}</div>${s.h}</div>`).join("")}</div>
      <div class="dots" id="dots">${slides.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>`,
      mount: (el) => {
        $("#stab", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { sstate.tab = b.dataset.v; render(); } };
        const deck = $("#deck", el); deck.addEventListener("scroll", () => { const i = Math.round(deck.scrollLeft / (deck.firstElementChild.offsetWidth + 12)); $$("#dots i", el).forEach((d, k) => d.classList.toggle("on", k === i)); }, { passive: true });
      } };
  };
  const row = (b, s, go) => `<div class="row" ${go ? `data-go="${go}" style="cursor:pointer"` : ""}><b>${b}</b>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const none = (m) => `<div class="empty">${esc(m)}</div>`;
  const STANDUP = {
    deals() {
      const t = today(), nw = setting("NewWindow", 14), mm = setting("MarginMin", 0.25);
      const ds = deals().map((r) => ({ r, x: deal(r) })).filter((d) => d.x.open);
      const top = ds.slice().sort((a, b) => b.x.score - a.x.score).slice(0, 10);
      const clients = live("accounts").filter((a) => a["Account Type"] === "Client in Progress");
      const ms = live("meetings");
      const held = ms.filter((m) => m.Status === "Held" && isNum(m.Date) && m.Date >= t - nw && m.Date <= t);
      const next = ms.filter((m) => isNum(m.Date) && m.Date >= t && ["Booked", "To confirm"].includes(m.Status)).sort((a, b) => a.Date - b.Date);
      const props = live("proposals").filter((p) => ["In preparation", "Sent", "Under review"].includes(p.Status) || (isNum(p["Date Sent"]) && p["Date Sent"] >= t - nw));
      const below = live("proposals").filter((p) => { const g = gm(p["Bill Rate (INR/month)"], p["Cost Rate (INR/month)"]); return g !== null && g < mm && !["Approved", "Rejected"].includes(p["Approval Status"]); });
      const reqs = live("requirements").filter((q) => !["Filled", "Closed - Lost"].includes(q.Status));
      const commits = live("commitments").filter((c) => ["Proposed", "Committed"].includes(c.Status)).sort((a, b) => (a["Due Date"] || 9e9) - (b["Due Date"] || 9e9)).slice(0, 3);
      const dl = (r) => "#/deal/" + encodeURIComponent(r["Deal ID"]);
      return [
        { t: "Pipeline", q: "Top open deals and what blocks each", h:
          `<div style="display:flex;gap:20px;margin-bottom:8px"><div><div class="big-n">${ds.length}</div><div class="hint">open</div></div><div><div class="big-n">${ds.filter((d) => d.r.Temperature === "Hot").length}</div><div class="hint">hot</div></div></div>
          ${top.map(({ r, x }) => row(`${tempDot(r.Temperature)} ${esc(r.Account)} <span class="chip stage">${esc(r.Stage)}</span>`, `${esc(r["Next Step"] || "No next step")} ${isNum(r["Next Step Date"]) ? "· " + D.fmt(r["Next Step Date"]) : ""}${r.Blocker ? ` · <b style="display:inline;color:var(--bad)">Blocker: ${esc(r.Blocker)}</b>` : ""}`, dl(r))).join("")}` },
        { t: "Clients in progress", q: "Stage and next step with a date (meeting, empanelment, MSA, first requirement)", h:
          clients.map((a) => row(`${esc(a.Account)} <span class="chip stage">${esc(a["Current Stage"])}</span>`, `${esc(a["Next Step"] || "No next step")} · ${isNum(a["Next Step Date"]) ? D.fmt(a["Next Step Date"]) : '<b style="display:inline;color:#B7791F">no date</b>'} · Empanelment ${esc(a.Empanelment || "-")} · MSA ${esc(a.MSA || "-")}`, "#/clients/" + encodeURIComponent(a.Account))).join("") || none("No clients in progress") },
        { t: "Decision-maker meetings", q: `Held in the last ${nw} days, and who is booked next`, h:
          `<div class="hint">HELD</div>${held.map((m) => row(`${esc(m.Account)} - ${esc(m.Contact)}${m["Decision Maker?"] === "Y" ? ' <span class="chip stage">DM</span>' : ""}`, `${D.fmt(m.Date, { abs: 1 })} · ${esc(m["Outcome / Next Step"] || "")}`)).join("") || none("None held")}
           <div class="hint" style="margin-top:12px">BOOKED NEXT</div>${next.map((m) => row(`${esc(m.Account)} - ${esc(m.Contact)}`, `${D.fmt(m.Date)} · ${esc(m.Status)}`)).join("") || none("Nothing booked")}` },
        { t: "Proposals & rate cards", q: "Sent, and anything below the margin threshold that needs approval", h:
          props.map((p) => { const g = gm(p["Bill Rate (INR/month)"], p["Cost Rate (INR/month)"]); return row(`${esc(p.Account)} · ${esc(p.Type)}`, `${esc(p.Status)}${isNum(p["Date Sent"]) ? " · sent " + D.fmt(p["Date Sent"], { abs: 1 }) : ""}${g !== null ? " · GM " + pct(g) : ""}`, "#/proposals"); }).join("") + (below.length ? `<div class="hint" style="margin-top:12px;color:var(--bad)">NEEDS YOUR APPROVAL (&lt; ${pct(mm)})</div>${below.map((p) => row(esc(p.Account), "GM " + pct(gm(p["Bill Rate (INR/month)"], p["Cost Rate (INR/month)"])), "#/proposals")).join("")}` : "") || none("No proposals in play") },
        { t: "Requirements", q: "New requirements, and whether TA can fill them", h:
          reqs.map((q) => row(`${esc(q.Account)} · ${esc(q["Role / Skill"])}`, `${q.Positions || "?"} positions · TA: <b style="display:inline">${esc(q["TA Can Fill?"] || "-")}</b> · ${esc(q.Status)}`, "#/reqs")).join("") || none("No open requirements") },
        { t: "Top 3 commitments", q: "For the next two weeks", h:
          commits.map((c, i) => row(`${i + 1}. ${esc(c.Commitment)}`, `${esc(c.Account || "")} · due ${D.fmt(c["Due Date"])} · ${esc(c.Status)}`, "#/commitments")).join("") || none("Add commitments") + '<button class="btn pri" data-act="newcommit" style="margin-top:10px">Add commitment</button>' },
      ];
    },
    outreach() {
      const ws = D.weekStart(today()); const wk = outreachWeek(ws), lw = outreachWeek(ws - 7);
      const tg = { Email: setting("T_Email", 100), "Cold Call": setting("T_Call", 50), LinkedIn: setting("T_LinkedIn", 50) };
      const four = {}; CHANNELS.forEach((c) => (four[c] = { a: 0, m: 0 })); for (let k = 0; k < 4; k++) { const w = outreachWeek(ws - 7 * k); CHANNELS.forEach((c) => { four[c].a += w[c].a; four[c].m += w[c].m; }); }
      const best = CHANNELS.filter((c) => four[c].a).sort((a, b) => four[b].m / four[b].a - four[a].m / four[a].a)[0];
      const evs = live("events").filter((e) => ["Planned", "Registered"].includes(e.Status));
      const tg2 = live("targets").filter((t) => ["Add", "Drop"].includes(t.Recommendation) && !t["Your Decision"]);
      const ct = live("contracts").filter((c) => c.Status !== "Signed" && c.Status !== "On Hold");
      const ho = live("accounts").filter((a) => a["Handover Ready?"] === "Y" && a["Account Type"] !== "Handed over to AM");
      return [
        { t: "Outreach vs weekly targets", q: "Emails, cold calls, LinkedIn and meetings booked - which channel is working", h:
          `<table class="mini"><tr><th>Channel</th><th class="n">This wk</th><th class="n">Target</th><th class="n">Last wk</th><th class="n">Mtgs (4w)</th></tr>${CHANNELS.map((c) => `<tr><td>${c === "Cold Call" ? "Calls" : c}</td><td class="n">${wk[c].a}</td><td class="n">${tg[c] || "-"}</td><td class="n">${lw[c].a}</td><td class="n">${four[c].m}</td></tr>`).join("")}</table>
          <div style="margin-top:12px">Meetings booked this week: <b>${CHANNELS.reduce((s, c) => s + wk[c].m, 0)}</b> / ${setting("T_Meetings", 4)}</div><div style="margin-top:6px">Best channel (4 weeks): <b style="color:var(--teal)">${esc(best ? (best === "Cold Call" ? "Calls" : best) : "not enough data")}</b></div>` },
        { t: "Events, conferences & referrals", q: "Planned - brief discussion only", h: evs.map((e) => row(esc(e["Event / Referral"]), `${esc(e.Type)} · ${isNum(e.Date) ? D.fmt(e.Date, { abs: 1 }) : "date tbc"} · ${esc(e["Purpose / Target Accounts"] || "")}`, "#/leads")).join("") || none("Nothing planned") },
        { t: "Target list", q: "Accounts to add or drop", h: tg2.map((t) => `<div class="row"><b>${esc(t.Account)} <span class="chip ${t.Recommendation === "Drop" ? "bad" : "ok"}">${esc(t.Recommendation)}</span></b><div class="s">${esc(t.Reason || "")}</div><div class="acts" style="margin-top:6px"><button data-act="tdec" data-n="${esc(t.Account)}" data-v="${esc(t.Recommendation)}" class="pri">Agree</button><button data-act="tdec" data-n="${esc(t.Account)}" data-v="Keep">Keep</button></div></div>`).join("") || none("No pending add/drop decisions") },
        { t: "MSAs & vendor agreements", q: "In legal or finance review", h: ct.map((c) => row(`${esc(c.Account)} · ${esc(c.Agreement)}`, `${esc(c.Status)}${isNum(c["Submitted Date"]) ? " · " + (today() - c["Submitted Date"]) + " days in review" : ""} · ${esc(c["Pending Item / Blocker"] || "")}`)).join("") || none("Nothing in review") },
        { t: "Handover to account management", q: "Clients ready to move, with the brief complete", h: ho.map((a) => row(esc(a.Account), `Brief ${a["Brief Complete?"] === "Y" ? "complete ✓" : "<b style='display:inline;color:var(--bad)'>pending</b>"} · AM ${esc(a["AM Owner"] || "tbc")}`, "#/clients/" + encodeURIComponent(a.Account))).join("") || none("No clients marked handover-ready") },
      ];
    },
    okr() {
      const t = today(); const accs = live("accounts"); const qs = setting("QStart", t), qe = setting("QEnd", t), tgt = setting("LogoTarget", 2), qn = setting("QNum", 1);
      const yr = D.toJS(t).getUTCFullYear();
      const ytd = accs.filter((a) => isNum(a["Logo Won Date"]) && D.toJS(a["Logo Won Date"]).getUTCFullYear() === yr);
      const q = ytd.filter((a) => a["Logo Won Date"] >= qs && a["Logo Won Date"] <= qe);
      const bill = ytd.reduce((s, a) => s + (+a["Monthly Billing (INR)"] || 0), 0), cost = ytd.reduce((s, a) => s + (+a["Monthly Cost (INR)"] || 0), 0);
      const g = bill ? (bill - cost) / bill : null; const mm = setting("MarginMin", 0.25);
      const N = setting("IncentiveDays", 60), W = setting("IncentiveWarn", 15);
      const inc = accs.filter((a) => isNum(a["First Resource Deployed Date"])).map((a) => ({ a, d: t - a["First Resource Deployed Date"] })).filter((x) => x.d >= N - W);
      const intel = live("intel").filter((i) => i.Type !== "Next-month plan" && isNum(i.Date) && i.Date >= t - 31);
      const plan = live("intel").filter((i) => i.Type === "Next-month plan");
      return [
        { t: "New logos vs pace", q: `Target ${tgt} per quarter · first resource deployed?`, h:
          `<div style="display:flex;gap:24px"><div><div class="big-n">${q.length}/${tgt}</div><div class="hint">this quarter</div></div><div><div class="big-n">${ytd.length}/${tgt * qn}</div><div class="hint">year to date</div></div></div>
           <div class="prog" style="margin:10px 0"><i style="width:${Math.min(100, (100 * q.length) / tgt)}%"></i></div>
           ${ytd.map((a) => row(esc(a.Account), `Logo ${D.fmt(a["Logo Won Date"], { abs: 1 })} · first resource ${isNum(a["First Resource Deployed Date"]) ? "deployed " + D.fmt(a["First Resource Deployed Date"], { abs: 1 }) + " ✓" : "<b style='display:inline;color:var(--bad)'>not deployed</b>"}`, "#/clients/" + encodeURIComponent(a.Account))).join("") || none("No new logos recorded this year - add the logo date in Clients & logos")}` },
        { t: "Gross margin on new-logo billing", q: `Target ${pct(mm)} or more`, h: g === null ? none("No new-logo billing yet") :
          `<div class="big-n" style="color:${g >= mm ? "var(--ok)" : "var(--bad)"}">${pct(g)}</div><div class="hint">${fmtL(bill)}/mo billing · ${fmtL(cost)}/mo cost</div>${ytd.map((a) => { const x = gm(a["Monthly Billing (INR)"], a["Monthly Cost (INR)"]); return x === null ? "" : row(esc(a.Account), "GM " + pct(x) + (x < mm ? " - below target" : "")); }).join("")}` },
        { t: "Logo incentive", q: `Logos approaching ${N} days of deployment`, h: inc.map(({ a, d }) => row(esc(a.Account), `${d} days deployed · ${d >= N ? "<b style='display:inline;color:var(--ok)'>incentive triggered</b>" : N - d + " days to go"}`)).join("") || none("None within " + W + " days of the mark") },
        { t: "Market intelligence & next month", q: "Results only", h: intel.map((i) => row(esc(i["Account / Market"]), esc(i.Insight))).join("") + `<div class="hint" style="margin-top:12px">PLAN FOR NEXT MONTH</div>` + (plan.map((i) => row(esc(i["Account / Market"]), esc(i["Action / Plan"] || i.Insight))).join("") || none("Add a 'Next-month plan' in Market Intel")) },
      ];
    },
  };

  // ---------------- CLIENT CONTACTS
  V.contacts = () => {
    const cs = live("contacts");
    return { title: "Client contacts", back: true, html: `<input class="search" id="cq" placeholder="Search client contacts" style="width:100%;margin-bottom:10px"><div id="cl">${contactList(cs, "")}</div>`,
      mount: (el) => { $("#cq", el).oninput = (e) => ($("#cl", el).innerHTML = contactList(cs, e.target.value.toLowerCase())); } };
  };
  function contactList(cs, q) {
    const rows = cs.filter((c) => !q || [c.SPOC, c.Client, c.BU, c["S-BU"], c.Role].join(" ").toLowerCase().includes(q))
      .sort((a, b) => ((a.Status === "Active" ? 0 : 1) - (b.Status === "Active" ? 0 : 1)) || String(a.Client || "").localeCompare(String(b.Client || "")) || String(a.SPOC || "").localeCompare(String(b.SPOC || "")));
    if (!rows.length) return '<div class="empty">No contacts</div>';
    return `<div class="cardgrid">` + rows.map((c) => `<div class="card deal"><div class="main">
      <div class="t1"><span>${esc(c.SPOC)}</span></div><div class="t2">${esc(c.Client)} · ${esc(c.BU || "")}${c["S-BU"] ? " / " + esc(c["S-BU"]) : ""} · ${esc(c.Role || "")}</div>
      ${c.Notes ? `<div class="t3">${esc(c.Notes)}</div>` : ""}
      <div class="meta"><span class="chip">${esc(c.Status || "-")}</span>${isNum(c["Last Follow-up"]) ? `<span class="chip">Last ${D.fmt(c["Last Follow-up"], { abs: 1 })}</span>` : ""}</div>
      <div class="acts">${telLink(c.Phone) ? `<a class="btn" href="${telLink(c.Phone)}">Call</a>` : ""}${waLink(c.Phone) ? `<a class="btn" href="${waLink(c.Phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${c.Email ? `<a class="btn" href="mailto:${esc(c.Email)}">Email</a>` : ""}<button class="pri" data-act="ctouch" data-sig='${esc(c._sig)}'>Log</button></div></div></div>`).join("") + `</div>`;
  }
  function contactTouch(c) {
    sheet("Log · " + c.SPOC, `<div class="f"><label>Channel</label>${chips("ch", ["Call", "WhatsApp", "Email", "LinkedIn", "Meeting"], "Call")}</div>
      <div class="f"><label>Status</label>${chips("st", L("ContactStatus"), c.Status)}</div>${field("Notes", "notes", "", "textarea")}
      <div class="f"><label>Next follow-up</label>${dateChips("nf", "")}</div><button class="btn pri block" id="save">Save</button>`, (el, close) => {
      wireDateChips(el);
      $("#save", el).onclick = () => {
        const f = form(el); const ch = chipVal(el, "ch"); const t = today();
        suppressAct = true; API.update("contacts", c, { "Last Follow-up": t, "Next Follow-up": f.nf || "", Status: chipVal(el, "st"), Notes: f.notes || c.Notes }); suppressAct = false;  // logged via the activity entry below
        API.add("activity", { Date: t, "Deal ID": "", Account: c.Client, Contact: c.SPOC, Channel: ch, Outcome: chipVal(el, "st"), Notes: f.notes, "Next Step": "", "Next Step Date": f.nf || "", "Logged By": C.owner });
        if (CH_MAP[ch]) API.inc(CH_MAP[ch], "Activities", 1);
        close(); toast("Logged"); render();
      };
    });
  }

  // ---------------- MORE + SETTINGS
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
  // ------------------------------------------------------------------ LIBRARY (content repository)
  const libItems = () => live("library");
  const libState = { q: "", cat: "" };
  function copyText(txt) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).catch(() => fallbackCopy(txt)); return; } } catch (e) {}
    fallbackCopy(txt);
  }
  function fallbackCopy(txt) { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
  function libCardHtml(i) {
    const link = i.Link || "";
    const meta = `<div class="libmeta">${i.Category ? `<span class="chip stage">${esc(i.Category)}</span>` : ""}${i.Type ? `<span class="chip">${esc(i.Type)}</span>` : ""}${i.Updated ? `<span class="hint">Updated ${esc(D.fmt(i.Updated, { abs: 1 }))}</span>` : ""}</div>`;
    const indexed = !!String(i.Content || "").trim();
    const inner = `<div class="libmain"><div class="libtitle">${esc(i.Title || "Untitled")}${indexed ? ' <span class="chip ok" style="font-size:9.5px;padding:1px 6px">AI-read</span>' : ""}</div>${(i.Category || i.Type || i.Updated) ? meta : ""}</div><span class="libarrow">${link ? I.out : I.copy}</span>`;
    // A document link → the whole row opens it. A text template → the row opens the viewer (with Copy).
    const main = link
      ? `<a class="librow" href="${esc(link)}" target="_blank" rel="noopener" style="flex:1;min-width:0">${inner}</a>`
      : `<button class="librow" data-act="libview" data-sig='${esc(i._sig)}' style="flex:1;min-width:0">${inner}</button>`;
    const ask = aiOn() ? `<button class="btn libask" data-act="libask" data-sig='${esc(i._sig)}' title="Ask AI about this file" style="flex:none;padding:0 13px;font-size:16px">✨</button>` : "";
    return `<div class="librowwrap" style="display:flex;gap:6px;align-items:stretch;margin-bottom:8px">${main}${ask}</div>`;
  }
  function libFilter() {
    const q = libState.q.toLowerCase();
    return libItems().filter((i) => (!libState.cat || (i.Category || "Other").trim() === libState.cat) &&
      (!q || [i.Title, i.Category, i.Tags, i.Body, i.Type, i.Owner].join(" ").toLowerCase().includes(q)));
  }
  function libViewSheet(i) {
    const hasContent = !!String(i.Content || "").trim();
    sheet(i.Title || "Item", `${i.Category || i.Type ? `<div style="margin-bottom:8px">${i.Category ? `<span class="chip stage">${esc(i.Category)}</span> ` : ""}${i.Type ? `<span class="chip">${esc(i.Type)}</span>` : ""}</div>` : ""}
      ${i.Body ? `<div class="card" style="white-space:pre-wrap">${esc(i.Body)}</div>` : ""}
      ${i.Link ? `<a class="btn block" href="${esc(i.Link)}" target="_blank" rel="noopener">Open attachment</a>` : ""}
      ${aiOn() ? `<button class="btn pri block" id="lask" style="margin-top:8px">✨ Ask AI about this file</button>${hasContent ? "" : `<div class="hint" style="margin-top:6px">Tip: this file isn't indexed yet — run <b>Index files for AI</b> on the Library screen so the AI can read inside it.</div>`}` : ""}
      ${i.Body ? `<button class="btn block" id="lc" style="margin-top:8px">${I.copy} Copy text</button>` : ""}`, (el) => {
      const lc = $("#lc", el); if (lc) lc.onclick = () => { copyText(i.Body || ""); toast("Copied"); };
      const la = $("#lask", el); if (la) la.onclick = () => libAskSheet(i);
    });
  }
  // Ask a free-form question about ONE file, using its extracted Content (full text).
  function libAskSheet(i) {
    const content = String(i.Content || "").trim();
    const src = content || String(i.Body || "").trim();
    sheet("Ask · " + (i.Title || "file"), `
      ${src ? "" : `<div class="card"><b>This file hasn't been read yet.</b><p class="hint">Go to Library → <b>Index files for AI</b> to let the AI read inside it, then come back.</p></div>`}
      <textarea id="lfq" rows="3" placeholder="e.g. 'What bill rates are quoted?' or 'Summarise this deck in 5 bullets'" style="width:100%;border:1px solid var(--b);border-radius:10px;padding:10px;font:inherit;font-size:14px;box-sizing:border-box" ${src ? "" : "disabled"}></textarea>
      <button class="btn pri block" id="lfsend" style="margin-top:8px" ${src ? "" : "disabled"}>${I.out} Ask</button>
      <div id="lfout"></div>`, (el) => {
      const box = $("#lfq", el), send = $("#lfsend", el);
      if (send) send.onclick = () => {
        const q = (box.value || "").trim(); if (!q) return;
        const ctx = `FILE: ${i.Title || "(untitled)"}${i.Type ? " (" + i.Type + ")" : ""}\n\nFILE CONTENT (text read from inside the file):\n${src.slice(0, 11000)}\n\nQUESTION: ${q}`;
        aiMove(send, $("#lfout", el), "You answer questions about ONE sales/collateral file for an India IT staffing & GCC firm (InitiateFirst), using ONLY the file content provided. Quote figures and lines exactly as written. If the answer isn't in the file, say so plainly — do not guess. Be concise.", ctx);
      };
      if (box) box.focus();
    });
  }
  V.library = () => {
    const items = libItems();
    const cats = [...new Set(items.map((i) => (i.Category || "Other").trim()).filter(Boolean))].sort();
    const empty = !items.length;
    const render_ = () => `<div class="libstack">${libFilter().map(libCardHtml).join("") || '<div class="empty">Nothing matches.</div>'}</div>`;
    return {
      title: "Library", back: true, html: empty ? `<div class="card"><b>Your content library is empty.</b>
        <p class="hint">Add a <b>Library</b> tab to your sheet (header row 1) with columns: <b>Category, Title, Type, Body, Link, Tags, Owner, Updated</b>.</p>
        <p class="hint">Put email templates & pitches in <b>Body</b> (shown with a Copy button). Put decks/PDFs in Google Drive or SharePoint and paste the share link in <b>Link</b> (shown with an Open button). Then add <code>library</code> to Code.gs and redeploy.</p></div>` : `
      <div class="toolbar"><input class="search" id="lq" placeholder="Search pitches, templates, decks..." value="${esc(libState.q)}"></div>
      ${aiOn() ? `<div class="card" style="padding:10px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font-size:12.5px"><b>Let AI read inside your files</b><div class="hint">Reads the text in your linked decks/PDFs so Ask AI can answer from them.</div></div><button class="btn pri" id="libindex" style="flex:none;white-space:nowrap">${I.search} Index files</button></div></div>` : ""}
      <div class="seg" id="lcat" style="margin-bottom:8px;flex-wrap:wrap"><button data-v="" class="${libState.cat === "" ? "on" : ""}">All</button>${cats.map((c) => `<button data-v="${esc(c)}" class="${libState.cat === c ? "on" : ""}">${esc(c)}</button>`).join("")}</div>
      <div id="lbody">${render_()}</div>`,
      mount: (el) => {
        const q = $("#lq", el); if (q) q.addEventListener("input", (e) => { libState.q = e.target.value; $("#lbody", el).innerHTML = render_(); });
        const lc = $("#lcat", el); if (lc) lc.onclick = (e) => { const b = e.target.closest("button"); if (b) { libState.cat = b.dataset.v; render(); } };
        const li = $("#libindex", el); if (li) li.onclick = () => indexFiles(li);
      },
    };
  };

  V.datacheck = () => {
    const all = deals();
    // Deals with no reachable phone AND no email, even after the Client Contacts / Leads fallback
    const noContact = all.map((r) => ({ r, ci: contactInfoFor(r) }))
      .filter((o) => !telLink(o.ci.Phone) && !o.ci.Email)
      .sort((a, b) => deal(b.r).score - deal(a.r).score);
    // Duplicate and blank Deal IDs
    const counts = {};
    all.forEach((r) => { const k = String(r["Deal ID"] || "").trim(); counts[k] = (counts[k] || 0) + 1; });
    const dups = Object.keys(counts).filter((k) => k && counts[k] > 1).sort();
    const blanks = all.filter((r) => !String(r["Deal ID"] || "").trim());
    const dl = (r) => "#/deal/" + encodeURIComponent(r["Deal ID"] || "");
    const row = (o) => `<div class="card deal"><div class="main"><div class="t1"><span>${esc(o.r.Account)}</span><span class="hint" style="font-weight:400"> · ${esc(o.r["Deal ID"] || "—")}</span></div>
        <div class="t2">${esc(o.r.Contact || "(no contact name)")}${o.r.Designation ? " · " + esc(o.r.Designation) : ""} · ${esc(o.r.Stage || "")}</div>
        <div class="acts" style="margin-top:6px"><a class="btn" href="${dl(o.r)}">Open</a><a class="btn" href="${liLink(o.r.Contact, o.r.Account)}" target="_blank" rel="noopener">LinkedIn</a><a class="btn" href="#/contacts">Contacts tab</a></div></div></div>`;
    return { title: "Data check", back: true, html: `
      <div class="card"><b>What this checks</b><div class="hint" style="margin-top:6px">The app reads one source only — your Google Sheet. The Pipeline and Search show the same data. Below are deals where no phone or email can be found (on the deal row <i>or</i> in Client Contacts / Leads), plus Deal IDs that are duplicated or blank.</div></div>

      <div class="sec"><h2>Deals with no reachable contact</h2><span class="count">${noContact.length}</span></div>
      ${noContact.length ? noContact.map(row).join("")
        : '<div class="card"><div class="empty">Every deal resolves to a phone or email. 🎉</div></div>'}
      ${noContact.length ? `<div class="card"><div class="hint">To fix one: add the Phone/Email on that person's row in the <b>Client Contacts</b> tab (match the Company and SPOC name to the deal), or fill the Phone/Email on the Pipeline row itself. The fallback matches even if the company is written slightly differently (e.g. "ZF" vs "ZF Group").</div></div>` : ""}

      <div class="sec"><h2>Duplicate Deal IDs</h2><span class="count">${dups.length}</span></div>
      ${dups.length ? `<div class="card"><div class="hint" style="margin-bottom:8px">The app opens the <b>first</b> row for a given Deal ID, so duplicates make <code>/deal/ID</code> ambiguous. Give each the correct unique ID in the Pipeline tab.</div>${dups.map((k) => `<div class="kv"><div><b>${esc(k)}</b></div><div>${counts[k]} rows</div></div>`).join("")}</div>`
        : '<div class="card"><div class="empty">All Deal IDs are unique.</div></div>'}

      ${blanks.length ? `<div class="sec"><h2>Deals with a blank Deal ID</h2><span class="count">${blanks.length}</span></div>
        <div class="card"><div class="hint" style="margin-bottom:8px">These can't be opened by URL. Give each a Deal ID in the Pipeline tab.</div>${blanks.map((r) => `<div class="kv"><div>${esc(r.Account)}</div><div>${esc(r.Contact || "")}</div></div>`).join("")}</div>` : ""}

      <div class="card"><div class="hint">Deal IDs are identifiers, not row numbers — ID D-037 can sit on any row, and the app's list is sorted by priority, not by row. That by itself is normal; only duplicate or blank IDs cause trouble.</div></div>` };
  };

  let dayLogMode = "today";
  const DAY_MODES = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["quarter", "This quarter"]];
  const fmtT = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  function dayRange(mode) {
    const n = new Date(); n.setHours(0, 0, 0, 0);
    const start = new Date(n), end = new Date(n);
    if (mode === "yesterday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (mode === "week") { start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); }      // Monday → today
    else if (mode === "month") { start.setDate(1); }
    else if (mode === "quarter") { start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); }
    return { start, end };
  }
  const actRowText = (a) => `${a.Channel || "Touch"} · ${a.Outcome || ""} — ${a.Account || ""}${a.Contact ? " (" + a.Contact + ")" : ""}${a["Next Step"] ? " · next: " + a["Next Step"] : ""}${isNum(a["Next Step Date"]) ? " · f/u " + D.fmt(a["Next Step Date"], { abs: 1 }) : ""}`;
  const actNorm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  V.daylog = () => {
    const log = actStore();
    const { start, end } = dayRange(dayLogMode);
    const startKey = start.toLocaleDateString("en-CA"), endKey = end.toLocaleDateString("en-CA");
    const sSer = D.fromISO(startKey), eSer = D.fromISO(endKey);
    const byDay = {};  // yyyy-mm-dd -> { entries:[], seen:Set }
    const push = (key, t, x, noTime) => { if (!x) return; const g = (byDay[key] = byDay[key] || { entries: [], seen: new Set() }); const n = actNorm(x); if (g.seen.has(n)) return; g.seen.add(n); g.entries.push({ t, x, noTime }); };
    // 1) this device's local log
    Object.keys(log).forEach((k) => { if (k >= startKey && k <= endKey) (log[k] || []).forEach((e) => push(k, e.t, e.x, false)); });
    // 2) the Activity Log sheet — persistent touches across time & devices (the real history)
    live("activity").forEach((a) => { if (!isNum(a.Date) || a.Date < sSer || a.Date > eSer) return; push(D.toISO(a.Date), D.toJS(a.Date).getTime() + 126e5, actRowText(a), true); });
    const days = Object.keys(byDay).sort().reverse().map((k) => ({ d: new Date(k + "T00:00:00"), e: byDay[k].entries.sort((a, b) => a.t - b.t) }));
    let total = 0; days.forEach((dd) => (total += dd.e.length));
    const rangeText = dayLogMode === "today" || dayLogMode === "yesterday" ? dayLabel(start) : `${dayLabel(start)} – ${dayLabel(end)}`;
    const modeLabel = DAY_MODES.find((m) => m[0] === dayLogMode)[1];
    // ---- consolidated summary (leadership-ready), built from this period's touches + notes
    const acts = live("activity").filter((a) => isNum(a.Date) && a.Date >= sSer && a.Date <= eSer);
    const localTexts = []; Object.keys(log).forEach((k) => { if (k >= startKey && k <= endKey) (log[k] || []).forEach((e) => localTexts.push(e.x)); });
    // ---- GLANCE: unique accounts touched + unique leads touched, with mode / outcome / note / next f/u
    const accMap = {};
    acts.slice().sort((a, b) => (a.Date || 0) - (b.Date || 0)).forEach((a) => {
      const k = (a.Account || "(no account)");
      const g = accMap[k] || (accMap[k] = { name: k, modes: new Set(), contacts: new Set(), n: 0 });
      g.n++; if (a.Channel) g.modes.add(a.Channel); if (a.Contact) g.contacts.add(a.Contact);
      if (a.Outcome) g.outcome = a.Outcome;                               // latest wins (sorted oldest→newest)
      if (a.Notes && String(a.Notes).trim()) g.note = String(a.Notes).trim();
      if (isNum(a["Next Step Date"])) g.nf = a["Next Step Date"];
    });
    const touchAccts = Object.values(accMap).sort((a, b) => a.name.localeCompare(b.name));
    const touchLeads = live("leads").filter((l) => isNum(l["Last Follow-up"]) && l["Last Follow-up"] >= sSer && l["Last Follow-up"] <= eSer)
      .map((l) => ({ name: l.Name || l.Organization || "(lead)", org: l.Organization, resp: l.Response, note: String(l.Comments || "").trim(), nf: l["Next Follow-up"] }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const sumLines = [], sumNotes = [];
    { const ch = {}; let resp = 0, mtg = 0; const accs = new Set();
      acts.forEach((a) => { const c = a.Channel || "Other"; ch[c] = (ch[c] || 0) + 1; const oc = String(a.Outcome || ""); if (oc && !/no answer|call busy/i.test(oc)) resp++; if (/meeting/i.test(oc)) mtg++; if (a.Account) accs.add(a.Account); if (a.Notes && String(a.Notes).trim()) sumNotes.push(`${a.Account ? a.Account + " — " : ""}${String(a.Notes).trim()}`); });
      localTexts.forEach((x) => { const m = x.match(/(?:Comments?|Notes?):\s*(.+)$/i); if (m) sumNotes.push(`${x.split(" · ")[0]} — ${m[1]}`); });
      const cnt = (re) => localTexts.filter((x) => re.test(x)).length;
      const newDeals = cnt(/^New deal/), newLeads = cnt(/^New lead/), newMeet = cnt(/^Meeting booked/), commits = cnt(/^New commitment/), props = cnt(/^New proposal/);
      const stageMoves = localTexts.filter((x) => /stage →|· Stage:/.test(x)).length;
      const chStr = Object.keys(ch).sort((a, b) => ch[b] - ch[a]).map((c) => `${ch[c]}× ${c}`).join(", ");
      if (acts.length) sumLines.push(`${acts.length} follow-up${acts.length > 1 ? "s" : ""} across ${accs.size} account${accs.size !== 1 ? "s" : ""}${chStr ? " (" + chStr + ")" : ""}${resp ? `, ${resp} with a response` : ""}.`);
      const adv = [];
      if (stageMoves) adv.push(`${stageMoves} stage move${stageMoves > 1 ? "s" : ""}`);
      if (mtg + newMeet) adv.push(`${mtg + newMeet} meeting${mtg + newMeet > 1 ? "s" : ""}`);
      if (newDeals) adv.push(`${newDeals} new opportunit${newDeals > 1 ? "ies" : "y"}`);
      if (newLeads) adv.push(`${newLeads} new lead${newLeads > 1 ? "s" : ""}`);
      if (props) adv.push(`${props} proposal${props > 1 ? "s" : ""}`);
      if (commits) adv.push(`${commits} commitment${commits > 1 ? "s" : ""}`);
      if (adv.length) sumLines.push(adv.join(" · ") + ".");
    }
    const notesTop = sumNotes.slice(0, 10);
    // glance rows (deterministic — no AI needed)
    const glanceRow = (name, line, note, nf) => `<div style="padding:8px 0;border-top:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:13.5px">${esc(name)}</b>${isNum(nf) ? `<span style="font-size:11px;color:var(--ink-3);white-space:nowrap">f/u ${esc(D.fmt(nf, { abs: 1 }))}</span>` : ""}</div>
      ${line ? `<div style="font-size:12px;color:var(--ink-2);margin-top:2px">${esc(line)}</div>` : ""}
      ${note ? `<div style="font-size:12px;color:var(--ink-3);margin-top:2px">${esc(note)}</div>` : ""}</div>`;
    const glanceHtml = (touchAccts.length || touchLeads.length) ? `
      ${touchAccts.length ? `<div style="font-size:12px;color:var(--ink-3);margin:10px 0 0;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Accounts touched · ${touchAccts.length}</div>
        ${touchAccts.map((g) => glanceRow(g.name, [[...g.modes].join("/"), g.outcome, g.contacts.size ? [...g.contacts][0] : ""].filter(Boolean).join(" · "), g.note, g.nf)).join("")}` : ""}
      ${touchLeads.length ? `<div style="font-size:12px;color:var(--ink-3);margin:12px 0 0;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Leads touched · ${touchLeads.length}</div>
        ${touchLeads.map((l) => glanceRow(l.name + (l.org ? " (" + l.org + ")" : ""), l.resp || "", l.note, l.nf)).join("")}` : ""}` : "";
    const summaryCard = total ? `<div class="sec"><h2>Summary — ${esc(modeLabel)}</h2></div>
      <div class="card">${sumLines.map((l) => `<div style="margin-bottom:6px">${esc(l)}</div>`).join("") || '<div class="hint">Activity recorded — see the list below.</div>'}
      ${glanceHtml}
      <button class="btn block" id="copysum" style="margin-top:12px">${I.copy} Copy summary for leadership</button>
      ${aiOn() ? `<button class="btn pri block" id="aisum" style="margin-top:8px">✨ AI summary & advice</button><div id="aiout"></div>` : ""}</div>` : "";
    const glanceText = () => (touchAccts.length ? "\nAccounts touched (" + touchAccts.length + "):\n" + touchAccts.map((g) => `• ${g.name} — ${[[...g.modes].join("/"), g.outcome].filter(Boolean).join(", ")}${g.note ? " — " + g.note : ""}${isNum(g.nf) ? " (next " + D.fmt(g.nf, { abs: 1 }) + ")" : ""}`).join("\n") : "")
      + (touchLeads.length ? "\n\nLeads touched (" + touchLeads.length + "):\n" + touchLeads.map((l) => `• ${l.name}${l.org ? " (" + l.org + ")" : ""}${l.note ? " — " + l.note : ""}${isNum(l.nf) ? " (next " + D.fmt(l.nf, { abs: 1 }) + ")" : ""}`).join("\n") : "");
    const summaryText = () => `${modeLabel} · ${rangeText}\n` + (sumLines.length ? sumLines.map((l) => "• " + l).join("\n") : "• Activity recorded.") + glanceText();
    const dayBlock = (dd) => `<div class="sec"><h2>${esc(dayLabel(dd.d))}</h2><span class="count">${dd.e.length}</span></div>
      <div class="card" style="padding:0;overflow:hidden">${dd.e.map((e) => `<div style="display:flex;gap:10px;padding:10px 13px;border-top:1px solid var(--b)"><div style="font-variant-numeric:tabular-nums;color:var(--ink-3);font-size:12px;flex:none;width:46px">${e.noTime ? "" : fmtT(e.t)}</div><div style="font-size:13.5px">${esc(e.x)}</div></div>`).join("")}</div>`;
    const body = days.length ? days.map(dayBlock).join("")
      : '<div class="card"><div class="empty">Nothing in this period. This shows logged touches/follow-ups from your sheet plus edits you make in the app. Older history only appears if it was logged through the app.</div></div>';
    return {
      title: "My activity", back: true, html: `
      <div class="seg" id="dayseg" style="margin-bottom:10px;flex-wrap:wrap">${DAY_MODES.map(([v, l]) => `<button data-o="${v}" class="${dayLogMode === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="hint" style="margin:0 4px 6px">${esc(rangeText)} · <b>${total}</b> action(s)</div>
      ${summaryCard}
      <div class="sec"><h2>Detail</h2></div>
      ${body}
      ${total ? `<button class="btn pri block" id="copyday" style="margin-top:10px">${I.copy} Copy full detail</button>` : ""}`,
      mount: (el) => {
        $("#dayseg", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { dayLogMode = b.dataset.o; render(); } };
        const cs = $("#copysum", el); if (cs) cs.onclick = () => { copyText(summaryText()); toast("Summary copied — ready for leadership"); };
        const ai = $("#aisum", el); if (ai) ai.onclick = async () => {
          const old = ai.innerHTML; ai.disabled = true; ai.innerHTML = "Thinking…";
          try {
            const acctCtx = touchAccts.map((g) => `${g.name} | ${[...g.modes].join("/") || "-"} | ${g.outcome || "-"} | ${g.note || "-"} | next ${isNum(g.nf) ? D.fmt(g.nf, { abs: 1 }) : "-"}`).join("\n") || "(none)";
            const leadCtx = touchLeads.map((l) => `${l.name}${l.org ? " (" + l.org + ")" : ""} | ${l.resp || "-"} | ${l.note || "-"} | next ${isNum(l.nf) ? D.fmt(l.nf, { abs: 1 }) : "-"}`).join("\n") || "(none)";
            const ctx = `Period: ${modeLabel} (${rangeText})\nStats: ${sumLines.join(" ") || "(none)"}\n\nACCOUNTS TOUCHED (unique) — "name | mode | outcome | note | next follow-up":\n${acctCtx}\n\nLEADS TOUCHED (unique) — "name | response | note | next follow-up":\n${leadCtx}`;
            const text = await aiAsk([
              { role: "system", content: "You are a sales-operations assistant for a B2B IT staffing & GCC sales leader in India. Produce a leadership glance for the period using ONLY the data given. Format EXACTLY: (1) one-line summary (how many unique accounts and leads were touched, main channels). (2) A section 'Accounts touched:' listing each UNIQUE account once as a bullet: Account — mode, outcome, one-line what-happened (from the note), next follow-up date. (3) A section 'Leads touched:' same style (skip if none). (4) 'Follow-ups coming up:' the next dates that need action. No duplication — each account/lead appears once. Don't invent anything not in the data. Keep bullets tight." },
              { role: "user", content: ctx },
            ]);
            $("#aiout", el).innerHTML = `<div class="card" style="white-space:pre-wrap;margin-top:8px">${mdLite(text)}</div><button class="btn block" id="aicopy" style="margin-top:8px">${I.copy} Copy AI update</button>`;
            const ac = $("#aicopy", el); if (ac) ac.onclick = () => { copyText(text); toast("AI update copied"); };
          } catch (e) { toast("AI: " + (e.message || e), "warn"); }
          ai.disabled = false; ai.innerHTML = old;
        };
        const cp = $("#copyday", el); if (cp) cp.onclick = () => {
          const head = `${DAY_MODES.find((m) => m[0] === dayLogMode)[1]} · ${rangeText} (${total} actions)`;
          const txt = head + "\n\n" + days.map((dd) => dayLabel(dd.d) + "\n" + dd.e.map((e) => `• ${e.noTime ? "" : fmtT(e.t) + " — "}${e.x}`).join("\n")).join("\n\n");
          copyText(txt); toast("Copied — paste into your stand-up / review");
        };
      },
    };
  };
  // ---------------- AI pipeline snapshot: a compact, data-only picture the model reasons over
  function aiSnapshot() {
    const t = today();
    const ds = deals().map((r) => ({ r, x: deal(r) }));
    const open = ds.filter((d) => d.x.open);
    const stages = L("Stage");
    const funnel = stages.map((s) => ({ s, n: ds.filter((d) => d.r.Stage === s).length })).filter((f) => f.n);
    const overdue = open.filter((d) => d.x.follow === "Overdue").length;
    const noNext = open.filter((d) => d.x.follow === "No next step").length;
    const hot = open.filter((d) => d.r.Temperature === "Hot").length, warm = open.filter((d) => d.r.Temperature === "Warm").length;
    const cold = open.filter((d) => d.x.days != null && d.x.days >= 21).length;
    const weighted = ds.reduce((s, d) => s + (d.x.open ? d.x.weighted || 0 : 0), 0);
    const line = ({ r, x }) => [
      r.Account, r.Stage, (r.Temperature || "?"),
      x.follow === "No next step" ? "NO next step" : x.follow + (isNum(r["Next Step Date"]) ? " " + D.fmt(r["Next Step Date"], { abs: 1 }) : ""),
      x.days != null ? x.days + "d since contact" : "never contacted",
      r["Est. Monthly Billing (INR)"] ? fmtL(r["Est. Monthly Billing (INR)"]) + "/mo" : "",
      r["Service Line"] || "", r.City || "",
      r.Blocker ? "BLOCKER: " + r.Blocker : "",
      r["Next Step"] ? "next: " + r["Next Step"] : "",
    ].filter(Boolean).join(" | ");
    const openList = open.sort((a, b) => b.x.score - a.x.score).slice(0, 45).map(line);
    const nurture = ds.filter((d) => d.r.Stage === "Nurture").map((d) => d.r.Account);
    const lost = ds.filter((d) => d.r.Stage === "Lost").map((d) => d.r.Account);
    const won = ds.filter((d) => d.r.Stage === "Won - Deployed").map((d) => d.r.Account);
    // leads, commitments, requirements/logos
    const lds = live("leads").filter((l) => !deals().some((d) => d.Account === l.Organization));
    const commits = live("commitments").filter((c) => ["Proposed", "Committed"].includes(c.Status))
      .map((c) => `${c.Commitment}${c.Account ? " (" + c.Account + ")" : ""} — due ${isNum(c["Due Date"]) ? D.fmt(c["Due Date"], { abs: 1 }) : "?"} · ${c.Status}`);
    const logosQ = live("requirements").filter((r) => /deployed|placed|joined/i.test(r.Status || "")).length;
    // recent activity (last 14 days)
    const recent = live("activity").filter((a) => isNum(a.Date) && a.Date >= t - 14);
    const byCh = {}; recent.forEach((a) => { const c = a.Channel || "Other"; byCh[c] = (byCh[c] || 0) + 1; });
    const chStr = Object.keys(byCh).sort((a, b) => byCh[b] - byCh[a]).map((c) => byCh[c] + "× " + c).join(", ");
    const L2 = [];
    L2.push(`Company: InitiateFirst — B2B IT staffing & GCC sales, India. Date: ${D.fmt(t, { abs: 1 })}.`);
    L2.push(`Targets: ${setting("LogoTarget", 2)} logos/quarter. Logos won so far: ${won.length}.`);
    L2.push("");
    L2.push(`FUNNEL (deals per stage): ${funnel.map((f) => f.s + "=" + f.n).join(", ")}`);
    L2.push(`Open deals: ${open.length} (Hot ${hot}, Warm ${warm}). Overdue follow-ups: ${overdue}. No next step set: ${noNext}. Gone cold (21d+ no contact): ${cold}.`);
    L2.push(`Weighted open pipeline (billing × stage prob): ${fmtL(weighted) || "—"}/mo.`);
    if (nurture.length) L2.push(`Nurture (parked): ${nurture.join(", ")}`);
    if (won.length) L2.push(`Won: ${won.join(", ")}`);
    if (lost.length) L2.push(`Lost: ${lost.join(", ")}`);
    L2.push("");
    L2.push(`OPEN DEALS (sorted by priority; "field | field"): `);
    L2.push(openList.join("\n") || "(none)");
    L2.push("");
    if (lds.length) L2.push(`LEADS not yet in pipeline (${lds.length}): ${lds.slice(0, 20).map((l) => (l.Name || "?") + (l.Organization ? " @ " + l.Organization : "")).join("; ")}`);
    if (commits.length) { L2.push(""); L2.push("COMMITMENTS (open):"); L2.push(commits.join("\n")); }
    // ---- DELIVERY pipeline (candidates + requirements) — read-only, for Q&A
    const cands = live("delivery"), dreqs = live("deliveryReqs");
    if (cands.length || dreqs.length) {
      L2.push("");
      const byStatus = {}; cands.forEach((c) => { const s = c.Status || "No status"; byStatus[s] = (byStatus[s] || 0) + 1; });
      const stStr = Object.keys(byStatus).sort((a, b) => byStatus[b] - byStatus[a]).map((s) => byStatus[s] + " " + s).join(", ");
      L2.push(`DELIVERY — ${cands.length} candidate(s)${stStr ? " (" + stStr + ")" : ""}, ${dreqs.length} requirement(s).`);
      if (dreqs.length) {
        const openR = dreqs.filter((r) => !/closed|filled|cancel|on hold/i.test(r.Status || ""));
        L2.push("Open requirements: " + (openR.length ? openR.slice(0, 20).map((r) => `${r.Role || "?"}${r.Client ? " @ " + r.Client : ""}${r.Priority ? " · " + r.Priority : ""}${r.Status ? " · " + r.Status : ""}${r.Budget ? " · budget " + r.Budget : ""}`).join("; ") : "(none)"));
      }
      if (cands.length) {
        const cline = (c) => [c.Candidate || c.Name, c.Role, c.Client, c.Status,
          isNum(c["Interview Date"]) ? "interview " + D.fmt(c["Interview Date"], { abs: 1 }) : "",
          isNum(c["Next Follow-up"]) ? "f/u " + D.fmt(c["Next Follow-up"], { abs: 1 }) : "",
          c["Experience (yrs)"] ? c["Experience (yrs)"] + "y exp" : "", c["Notice Period"] ? "NP " + c["Notice Period"] : "",
          c["Expected CTC (LPA)"] ? "ECTC " + c["Expected CTC (LPA)"] : ""].filter(Boolean).join(" | ");
        L2.push('Candidates ("field | field"):');
        L2.push(cands.slice(0, 35).map(cline).join("\n"));
      }
    }
    // ---- COLLATERAL LIBRARY (pitch decks, presentations, templates) — titles/tags/links only
    const libs = live("library");
    if (libs.length) {
      const anyContent = libs.some((l) => String(l.Content || "").trim());
      L2.push("");
      L2.push(`COLLATERAL LIBRARY (${libs.length} files — decks, presentations, templates). Each shows title/type/tags/link. Where CONTENT is shown, that is real text read from inside the file — you MAY quote and summarise it. Where no CONTENT is shown, do NOT guess what's inside the file.${anyContent ? "" : " (No files indexed yet — recommend by title/tags and give the link.)"}`);
      L2.push(libs.slice(0, 30).map((l) => {
        const head = [l.Title || l.Category || "?", l.Type || l.Category, l.Tags ? "tags: " + l.Tags : "", l.Link ? "link: " + l.Link : ""].filter(Boolean).join(" | ");
        const body = String(l.Content || l.Body || "").trim();
        return head + (body ? "\n   CONTENT: " + body.replace(/\s+/g, " ").slice(0, 500) : "");
      }).join("\n"));
    }
    L2.push("");
    L2.push(`ACTIVITY last 14 days: ${recent.length} logged touches${chStr ? " (" + chStr + ")" : ""}.`);
    return L2.join("\n");
  }
  // Per-deal context for the "Suggest next move" button.
  function dealMoveCtx(r) {
    const x = deal(r);
    const eqA = (b) => String(b || "").trim().toLowerCase() === String(r.Account || "").trim().toLowerCase();
    const acts = live("activity").filter((a) => a["Deal ID"] === r["Deal ID"] || (!a["Deal ID"] && eqA(a.Account) && a.Contact === r.Contact)).sort((a, b) => (b.Date || 0) - (a.Date || 0));
    const cands = live("delivery").filter((c) => eqA(c.Client));
    const reqs = live("deliveryReqs").filter((q) => eqA(q.Client));
    const libs = live("library").slice(0, 14).map((l) => `${l.Title || l.Category || "?"}${l.Type ? " [" + l.Type + "]" : ""}${l.Tags ? " (" + l.Tags + ")" : ""}${l.Link ? " " + l.Link : ""}`);
    const lines = [
      `DEAL: ${r.Account} — ${r.Contact || ""}${r.Designation ? " (" + r.Designation + ")" : ""}${r.City ? ", " + r.City : ""}`,
      `Stage: ${r.Stage} | Temp: ${r.Temperature || "?"} | Service: ${r["Service Line"] || "?"}`,
      `Est HC: ${r["Est. Headcount"] || "?"} | Est billing: ${fmtL(r["Est. Monthly Billing (INR)"]) || "?"}/mo | Source: ${r.Source || "?"}`,
      `Follow-up: ${x.follow}${isNum(r["Next Step Date"]) ? " (" + D.fmt(r["Next Step Date"], { abs: 1 }) + ")" : ""} | Last contact: ${x.days != null ? x.days + "d ago" : "never"}`,
      `Current next step: ${r["Next Step"] || "(none set)"}`,
      r.Blocker ? `BLOCKER: ${r.Blocker}` : "",
      `Notes: ${String(r.Notes || "").slice(0, 500) || "(none)"}`,
      "", "TIMELINE (recent first):",
      acts.slice(0, 8).map((a) => `- ${isNum(a.Date) ? D.fmt(a.Date, { abs: 1 }) : "?"}: ${a.Channel || "Touch"} / ${a.Outcome || ""}${a.Notes ? " — " + a.Notes : ""}${a["Next Step"] ? " (next: " + a["Next Step"] + ")" : ""}`).join("\n") || "(no logged touches)",
    ];
    if (reqs.length) lines.push("", `OPEN REQUIREMENTS for ${r.Account}: ` + reqs.map((q) => `${q.Role || "?"}${q.Status ? " (" + q.Status + ")" : ""}`).join("; "));
    if (cands.length) lines.push("", `CANDIDATES in play for ${r.Account}: ` + cands.slice(0, 12).map((c) => `${c.Candidate || c.Name || "?"} [${c.Role || "?"}] ${c.Status || ""}`).join("; "));
    lines.push("", "COLLATERAL AVAILABLE (suggest one & give its link if useful; do NOT quote inside files):", libs.join("\n") || "(none)");
    return lines.filter((l) => l !== undefined).join("\n");
  }
  // Per-candidate context for the delivery "Suggest next move" button.
  function candMoveCtx(c) {
    const sameReq = live("delivery").filter((o) => o["Req ID"] && o["Req ID"] === c["Req ID"] && o !== c);
    const req = live("deliveryReqs").find((q) => q["Req ID"] === c["Req ID"]);
    const lines = [
      `CANDIDATE: ${c.Candidate || c.Name || "?"} for ${c.Role || "?"} @ ${c.Client || "?"}`,
      `Status: ${c.Status || "?"} | Submitted: ${isNum(c.Submitted) ? D.fmt(c.Submitted, { abs: 1 }) : "?"} | Last f/u: ${isNum(c["Last Follow-up"]) ? D.fmt(c["Last Follow-up"], { abs: 1 }) : "?"} | Next f/u: ${isNum(c["Next Follow-up"]) ? D.fmt(c["Next Follow-up"], { abs: 1 }) : "(none)"}`,
      `Interview: ${isNum(c["Interview Date"]) ? D.fmt(c["Interview Date"], { abs: 1 }) + (c["Interview Time"] ? " " + c["Interview Time"] : "") : "(none scheduled)"}`,
      `Exp: ${c["Experience (yrs)"] || "?"}y${c["Relevant Exp"] ? " (rel " + c["Relevant Exp"] + ")" : ""} | Notice: ${c["Notice Period"] || "?"} | CCTC: ${c["Current CTC (LPA)"] || "?"} | ECTC: ${c["Expected CTC (LPA)"] || "?"}`,
      `Location: ${c["Current Location"] || "?"}${c["Preferred Location"] ? " → " + c["Preferred Location"] : ""} | Availability: ${c["Interview Availability"] || "?"} | SPOC: ${c.SPOC || "?"}`,
      `Notes: ${String(c.Notes || "").slice(0, 400) || "(none)"}`,
    ];
    if (req) lines.push(`Requirement: ${req.Role || "?"} · ${req.Status || ""}${req.Priority ? " · " + req.Priority : ""}${req.Budget ? " · budget " + req.Budget : ""}`);
    if (sameReq.length) lines.push(`Other candidates on same req: ` + sameReq.slice(0, 8).map((o) => `${o.Candidate || o.Name} (${o.Status || ""})`).join("; "));
    return lines.join("\n");
  }
  const AI_PERSONA = "You are an expert sales-operations advisor built into the pipeline app of a B2B IT staffing and GCC (Global Capability Centre) sales leader in India (company: InitiateFirst). You are given a LIVE SNAPSHOT covering THREE things: (A) the SALES pipeline (deals, funnel, leads, commitments), (B) the DELIVERY pipeline (candidates and open requirements), and (C) a COLLATERAL LIBRARY of sales files (pitch decks, presentations, templates) listed by title, type, tags and link. Rules: (1) Use ONLY the snapshot data — never invent accounts, candidates, files, numbers or facts not present. (2) Be specific — name the actual accounts/candidates/files and cite the real numbers. (3) Give practical, prioritised, action-oriented advice; prefer a short ranked list with a one-line 'why' each. (4) For the collateral library, when you recommend a file, write it as a clickable markdown link [Title](link) using its exact link from the data (never show the raw URL separately). Some files include CONTENT (real text read from inside the file) — when CONTENT is shown you MAY quote and summarise it; when only title/type/tags/link are shown, do NOT guess or invent what is inside that file. (5) If the data lacks what's needed, say so in one line. (6) Keep it focused (~220 words) unless asked for more. Use plain text with simple bullets.";
  const ASK_PRESETS = [
    ["📊 Analyse my funnel", "Analyse my current sales funnel. Where are deals concentrated, where is the likely drop-off, and what does the shape tell me? Name the accounts in each key stage."],
    ["⚠️ What's at risk?", "Which of my open deals are most at risk of slipping or going cold, and why? Give me a prioritised list with the single best next action for each."],
    ["🎯 Focus this week", "Based on my pipeline, what are the 3–5 most important things I should focus on this week? Be specific about which accounts and why."],
    ["📈 Pipeline health", "Assess the overall health of my pipeline. Am I set up to hit my logo and revenue targets this quarter? What's the biggest gap, and what should I do about it?"],
    ["🔁 Nudge the cold ones", "List the deals that have gone cold or have no next step, and for each suggest a specific re-engagement move I can do this week."],
    ["👥 Delivery status", "Give me a snapshot of my delivery pipeline: candidates by stage, upcoming interviews, and which open requirements still need profiles. Flag anything that needs my attention."],
    ["📁 Which file to send", "From my collateral library, recommend the best file to send for my most important active deal, say why it fits, and give me its link. If nothing fits, tell me what's missing."],
  ];
  V.ask = () => {
    if (!aiOn()) return { title: "Ask AI", back: true, html: `<div class="card"><b>AI isn't set up yet.</b><p class="hint">Add your Cloudflare Worker URL in config.js (aiUrl + aiToken) to enable the AI assistant. See the AI setup guide.</p></div>` };
    const bubble = (m) => m.role === "user"
      ? `<div style="align-self:flex-end;max-width:85%;background:var(--ink);color:var(--bg);padding:9px 13px;border-radius:16px 16px 4px 16px;font-size:14px;font-weight:600;white-space:pre-wrap">${esc(m.content)}</div>`
      : `<div class="card" style="align-self:flex-start;max-width:93%;margin:0;padding:12px 14px;border-radius:16px 16px 16px 4px;font-size:14px;white-space:pre-wrap">${mdLite(m.content)}<div style="margin-top:9px"><button class="btn aicopybtn" data-i="0" style="padding:4px 10px;font-size:11px">${I.copy} Copy</button></div></div>`;
    const thread = askMsgs.length
      ? `<div id="aithread" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">${askMsgs.map(bubble).join("")}</div>`
      : `<div class="card" style="margin-bottom:12px"><b>Your AI pipeline assistant</b><p class="hint" style="margin:6px 0 0">Ask anything across your <b>sales pipeline</b>, <b>delivery pipeline</b> (candidates &amp; requirements) and <b>collateral library</b> (decks &amp; templates). Try a quick analysis below, or type your own question.</p></div>`;
    return {
      title: "Ask AI", back: true, html: `
      ${thread}
      <div class="seg" style="flex-wrap:wrap;gap:6px;margin-bottom:10px">${ASK_PRESETS.map(([lbl], i) => `<button class="askpreset" data-i="${i}" style="font-size:12.5px">${esc(lbl)}</button>`).join("")}</div>
      <div class="card" style="padding:10px">
        <textarea id="askbox" rows="2" placeholder="Ask about your pipeline… e.g. 'Which hot deals haven't I touched in 2 weeks?'" style="width:100%;border:1px solid var(--b);border-radius:10px;padding:10px;font:inherit;font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
        <div class="acts" style="margin-top:8px;display:flex;gap:8px"><button class="btn pri" id="asksend" style="flex:1">${I.out} Ask</button>${askMsgs.length ? '<button class="btn" id="askclear">Clear</button>' : ""}</div>
        <div class="hint" style="margin-top:6px;font-size:11.5px">Reads your sales pipeline, delivery pipeline & collateral library. Advice only — always use your judgement.</div>
      </div>`,
      mount: (el) => {
        const box = $("#askbox", el), out = $("#aithread", el);
        const wireCopies = () => $$(".aicopybtn", el).forEach((b) => { b.onclick = () => { const i = +b.dataset.i; copyText(askMsgs[i] ? askMsgs[i].content : ""); toast("Copied"); }; });
        // fix copy indices (each assistant bubble copies its own message)
        $$("#aithread > div", el).forEach((d, i) => { const b = d.querySelector(".aicopybtn"); if (b) b.dataset.i = i; });
        wireCopies();
        const ask = async (q) => {
          q = (q || "").trim(); if (!q) return;
          askMsgs.push({ role: "user", content: q });
          render();  // show the question immediately
          try {
            const snap = aiSnapshot();
            const text = await aiAsk([
              { role: "system", content: AI_PERSONA },
              { role: "system", content: "LIVE PIPELINE SNAPSHOT:\n" + snap },
              ...askMsgs.slice(-8),
            ]);
            askMsgs.push({ role: "assistant", content: text || "(no answer)" });
          } catch (e) { askMsgs.push({ role: "assistant", content: "⚠️ " + (e.message || e) }); }
          render();
          window.scrollTo(0, document.body.scrollHeight);
        };
        const sendBtn = $("#asksend", el);
        if (sendBtn) sendBtn.onclick = () => { if (box && box.value.trim()) ask(box.value); };
        if (box) box.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (box.value.trim()) ask(box.value); } });
        $$(".askpreset", el).forEach((b) => { b.onclick = () => ask(ASK_PRESETS[+b.dataset.i][1]); });
        const clr = $("#askclear", el); if (clr) clr.onclick = () => { askMsgs = []; render(); };
        if (box) box.focus();
      },
    };
  };
  V.more = () => {
    const tiles = [["#/daylog", I.today, "My activity", "Daily / weekly / monthly / quarterly"], ...(aiOn() ? [["#/ask", I.out, "Ask AI", "Funnel advice, risks, focus — over your live pipeline"]] : []), ["#/library", I.lib, "Library", "Pitches, email templates, decks"], ["#/outreach", I.out, "Outreach", "Weekly email / call / LinkedIn counters"], ["#/standup", I.stand, "Stand-up", "This week's agenda as slides"], ["#/meetings", I.cal, "Meetings", "Book, close out, DM meetings"], ["#/leads", I.lead, "Leads & events", "Quick-add, scan cards"],
      ["#/proposals", I.rupee, "Proposals & rates", "GM% and approvals"], ["#/reqs", I.req, "Requirements & logos", "TA fill, logos, 60-day incentive"], ["#/commitments", I.flag, "Commitments", "Top 3 for the fortnight"],
      ["#/contacts", I.people, "Client contacts", "Broadcom, Mouritech, UWorld..."], ["#/datacheck", I.search, "Data check", "Missing contacts & duplicate IDs"], ["#/settings", I.sync, "Sync & settings", "Status, theme, sign out"]];
    return { title: "More", html: `<div class="grid">${tiles.map(([h, ic, t, s]) => `<a class="tile" href="${h}">${ic}<b>${t}</b><span>${s}</span></a>`).join("")}
      ${C.workbookUrl && !/PASTE/.test(C.workbookUrl) ? `<a class="tile" href="${esc(C.workbookUrl)}" target="_blank" rel="noopener">${I.xl}<b>Open the sheet</b><span>Your Google Sheet</span></a>` : ""}
      <button class="tile" data-act="newdeal">${I.target}<b>New opportunity</b><span>Add to pipeline</span></button></div>` };
  };
  V.settings = () => {
    const st = { synced: "All changes saved", saving: "Saving...", loading: "Loading...", pending: "Changes waiting to sync", offline: "Offline - changes are queued", error: "Sync problem", idle: "" }[S.status] || S.status;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return { title: "Sync & settings", back: true, html: `
      <div class="card"><div class="kv"><div>Signed in</div><div>${esc(B.userName())}</div><div>Status</div><div>${esc(st)}${S.error ? `<div class="hint" style="color:var(--bad)">${esc(S.error)}</div>` : ""}</div>
      <div>Waiting to sync</div><div>${S.queue.length} change(s)</div><div>Last loaded</div><div>${S.loadedAt ? new Date(S.loadedAt).toLocaleString("en-GB") : "-"}</div>
      <div>Last edited by</div><div>${esc(S.lastWriteBy || "-")}</div><div>App version</div><div><b>${VERSION}</b></div></div>
      <div class="acts" style="flex-wrap:wrap;gap:8px"><button class="pri" data-act="syncnow">Sync now</button><button data-act="testconn">Test sheet connection</button>${S.queue.length ? '<button class="danger" data-act="dropq">Discard queued changes</button>' : ""}</div></div>
      <div class="card"><b>Theme</b><div style="margin-top:8px">${chips("theme", [["", "Auto"], ["light", "Light"], ["dark", "Dark"]], localStorage.getItem("pp.theme") || "")}</div></div>
      <div class="card"><b>Install on your phone</b><div class="hint" style="margin-top:6px">${isIOS ? "Safari: tap Share → Add to Home Screen." : "Chrome: menu ⋮ → Install app (or Add to Home screen)."}</div>${installEvt ? '<button class="btn pri" data-act="install" style="margin-top:8px">Install now</button>' : ""}</div>
      <div class="card"><b>Targets & thresholds</b><div class="hint">Edit them in the Settings tab of the workbook - the app picks them up automatically.</div>
        <div class="kv" style="margin-top:8px"><div>Margin threshold</div><div>${pct(setting("MarginMin", 0.25))}</div><div>Logos / quarter</div><div>${setting("LogoTarget", 2)}</div><div>Weekly emails / calls / LinkedIn</div><div>${setting("T_Email", 100)} / ${setting("T_Call", 50)} / ${setting("T_LinkedIn", 50)}</div><div>Meetings / week</div><div>${setting("T_Meetings", 4)}</div></div></div>
      <div class="card"><b>TickTick</b><div id="ttbox" class="hint" style="margin-top:6px">Checking connection…</div></div>
      ${B.demo ? "" : '<button class="btn block danger" data-act="signout">Sign out</button>'}`,
      mount: (el) => {
        $('.chips[data-name="theme"]', el).addEventListener("pick", (e) => { const v = e.detail; if (v) { localStorage.setItem("pp.theme", v); document.documentElement.setAttribute("data-theme", v); } else { localStorage.removeItem("pp.theme"); document.documentElement.removeAttribute("data-theme"); } });
        const box = $("#ttbox", el);
        const autoRow = () => `<label class="fchk" style="margin-top:10px"><input type="checkbox" id="ttauto" ${ttAutoOn() ? "checked" : ""}> Auto-send follow-ups to TickTick on every save <span class="hint">(off = fastest; TickTick updates only when you tap the TickTick button)</span></label>`;
        const pauseRow = () => `<label class="fchk" style="margin-top:10px"><input type="checkbox" id="ttpause" ${ttPaused() ? "checked" : ""}> Pause ALL TickTick sync (push & pull)</label>`;
        const wirePause = () => {
          const p = $("#ttpause", el); if (p) p.onchange = () => { try { localStorage.setItem("pp.ttpause", p.checked ? "1" : "0"); } catch (e) {} toast(p.checked ? "TickTick paused" : "TickTick resumed"); };
          const a = $("#ttauto", el); if (a) a.onchange = () => { try { localStorage.setItem("pp.ttauto", a.checked ? "1" : "0"); } catch (e) {} toast(a.checked ? "Auto-send to TickTick ON" : "Auto-send OFF — use the TickTick button"); };
        };
        if (ttPaused()) { box.innerHTML = '<p>⏸ <b>TickTick is paused.</b> Only your Google Sheet sync is running. Uncheck below to resume.</p>' + pauseRow(); wirePause(); return; }
        const paint = (st) => {
          box.dataset.done = "1";
          if (!st.configured) { box.innerHTML = 'Not set up yet. Add <b>TT_CLIENT_ID</b> / <b>TT_CLIENT_SECRET</b> in the Apps Script project, then redeploy. (See the setup notes.)' + pauseRow(); wirePause(); return; }
          if (!st.connected) { box.innerHTML = `<p>Not connected.</p><a class="btn pri" href="${esc(st.authUrl)}" target="_blank" rel="noopener">${I.tt}Connect TickTick</a>` + pauseRow(); wirePause(); return; }
          const exp = st.expiresAt ? new Date(st.expiresAt).toLocaleDateString("en-GB") : "";
          box.innerHTML = `<p>✅ Connected${exp ? " · token valid to " + esc(exp) : ""}. ${ttAutoOn() ? "<b>Sales / pipeline & commitment</b> follow-ups auto-sync to TickTick." : "Auto-send is <b>off</b> — your sheet saves stay fast; tap the TickTick button on a lead, or <b>Push all</b> below, to send."} Delivery is kept separate — it never goes to TickTick.</p>
            <div class="acts" style="flex-wrap:wrap;gap:8px"><button class="btn pri" id="ttall">Push all follow-ups to TickTick</button><button class="btn" id="ttpull">Sync from TickTick</button><a class="btn" href="${esc(st.authUrl)}" target="_blank" rel="noopener">Reconnect</a></div>${autoRow()}${pauseRow()}`;
          $("#ttall", el).onclick = () => ttPushAll($("#ttall", el));
          $("#ttpull", el).onclick = () => ttPullAll($("#ttpull", el));
          wirePause();
        };
        if (B.demo) { paint({ configured: true, connected: true, expiresAt: Date.now() + 15552e6, authUrl: "#" }); return; }
        ttCall("ticktick_status").then(paint).catch((e) => { box.innerHTML = 'Could not reach the TickTick bridge: ' + esc(e.message) + '. Make sure ticktick.gs is added and redeployed.' + pauseRow(); wirePause(); });
      } };
  };

  // ------------------------------------------------------------------ actions (event delegation)
  const bySig = (t, sig) => live(t).find((r) => r._sig === sig);
  let pendingCallLog = null;
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a) {
      const act = a.dataset.act, id = a.dataset.id, sig = a.dataset.sig;
      const r = id ? dealById(id) : null;
      switch (act) {
        case "log": e.preventDefault(); e.stopPropagation(); return r && logTouch(r);
        case "tt": e.preventDefault(); e.stopPropagation(); return r && ttButton(a, () => ttPushDeal(r));
        case "call": e.stopPropagation(); if (r) { if (a.tagName !== "A") { const l = telLink(r.Phone); if (l) location.href = l; } pendingCallLog = { id: r["Deal ID"], ch: "Call", at: Date.now() }; } return;
        case "wa": e.stopPropagation(); if (r) pendingCallLog = { id: r["Deal ID"], ch: "WhatsApp", at: Date.now() }; return;
        case "mail": e.stopPropagation(); if (r) pendingCallLog = { id: r["Deal ID"], ch: "Email", at: Date.now() }; return;
        case "snooze": e.stopPropagation(); return r && snooze(r);
        case "move": e.stopPropagation(); return r && moveSheet(r);
        case "stage": return r && setStage(r, a.dataset.v);
        case "edit": return r && dealForm(r);
        case "newdeal": return dealForm(null);
        case "newmeeting": return meetingForm(null, r);
        case "meeting": e.stopPropagation(); { const m = bySig("meetings", sig); return m && meetingForm(m); }
        case "held": e.stopPropagation(); { const m = bySig("meetings", sig); return m && markHeld(m); }
        case "newprop": return propForm(null, r);
        case "prop": { const p = bySig("proposals", sig); return p && propForm(p); }
        case "newreq": return reqForm(null, r);
        case "req": { const q = bySig("requirements", sig); return q && reqForm(q); }
        case "newacc": return accForm(null);
        case "editacc": return accForm(live("accounts").find((x) => x.Account === a.dataset.n));
        case "accstage": { const ac = live("accounts").find((x) => x.Account === a.dataset.n); if (ac) { API.update("accounts", ac, { "Current Stage": a.dataset.v }); toast(ac.Account + " → " + a.dataset.v); render(); } return; }
        case "newcommit": return commitForm(null);
        case "commit": { const c = bySig("commitments", sig); return c && commitForm(c); }
        case "cdone": case "cslip": case "ccommit": e.stopPropagation(); { const c = bySig("commitments", sig); if (c) { API.update("commitments", c, { Status: act === "cdone" ? "Done" : act === "cslip" ? "Slipped" : "Committed" }); render(); } return; }
        case "inc": { API.inc(a.dataset.c, a.dataset.f, +a.dataset.d); render(); return; }
        case "lead2pipe": { const l = bySig("leads", sig); return l && lead2pipe(l); }
        case "editlead": e.stopPropagation(); { const l = bySig("leads", sig); return l && leadEdit(l); }
        case "tdec": { const t = live("targets").find((x) => x.Account === a.dataset.n); if (t) { API.update("targets", t, { "Your Decision": a.dataset.v }); toast(t.Account + ": " + a.dataset.v); render(); } return; }
        case "ctouch": { const c = bySig("contacts", sig); return c && contactTouch(c); }
        case "libcopy": e.stopPropagation(); { const i = bySig("library", sig); if (i && i.Body) { copyText(i.Body); toast("Copied · " + (i.Title || "")); } return; }
        case "libview": { const i = bySig("library", sig); return i && libViewSheet(i); }
        case "libask": e.stopPropagation(); { const i = bySig("library", sig); return i && libAskSheet(i); }
        case "revcopy": e.stopPropagation(); copyText(reviewSummaryText); return toast("Review summary copied");
        case "dayrepcopy": e.stopPropagation(); copyText(deliveryDayText); return toast("Day report copied");
        case "dcand": { const c = bySig("delivery", sig); return c && dCandForm(c); }
        case "dlog": e.stopPropagation(); { const c = bySig("delivery", sig); return c && dLog(c); }
        case "newcand": return dCandForm(null, a.dataset.req ? dreqs().find((r) => r["Req ID"] === a.dataset.req) : null);
        case "impcand": return dImport();
        case "newreq": return dReqForm(null);
        case "editreq": return dReqForm(dreqs().find((r) => r["Req ID"] === a.dataset.id));
        case "syncnow": Store.flush().then(() => Store.refresh()); return toast("Syncing...");
        case "testconn": (async () => { toast("Testing the sheet connection…"); const t0 = Date.now(); try { const m = B.meta ? await B.meta() : await B.rpc("meta"); toast("✅ Sheet reachable in " + Math.round((Date.now() - t0) / 1000) + "s (version " + ((m && m.eTag) || "?") + ")"); } catch (e) { toast("❌ Connection failed: " + (e.message || e), "warn"); } })(); return;
        case "dropq": if (confirm("Discard changes that haven't reached the sheet?")) { S.queue.length = 0; localStorage.setItem("pp.queue.v1", "[]"); Store.refresh(); } return;
        case "install": installEvt && installEvt.prompt(); return;
        case "signout": return B.signOut();
        case "fab": return fabSheet();
      }
    }
    const go = e.target.closest("[data-go]");
    if (go && !e.target.closest("a[href],button:not([data-go]),input,select,label")) { location.hash = go.dataset.go; return; }
    const sc = e.target.closest("[data-scroll]");
    if (sc) { const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth" }); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pendingCallLog && Date.now() - pendingCallLog.at > 4000 && Date.now() - pendingCallLog.at < 3600e3) {
      const r = dealById(pendingCallLog.id); const ch = pendingCallLog.ch; pendingCallLog = null; if (r) logTouch(r, { ch });
    } else if (!document.hidden) { Store.poll(); }
  });
  function fabSheet() {
    sheet("Quick add", `<div class="list">
      <div class="li" data-q="log">${I.log}<div class="main"><b>Log a touch</b><div class="hint">Call, email, LinkedIn, WhatsApp</div></div></div>
      <div class="li" data-q="dcand">${I.people}<div class="main"><b>Delivery: add candidate</b><div class="hint">Pick or add a requirement inside</div></div></div>
      <div class="li" data-q="dimp">${I.copy}<div class="main"><b>Delivery: import profiles</b><div class="hint">Paste a candidate table from Outlook</div></div></div>
      <div class="li" data-q="deal">${I.target}<div class="main"><b>New opportunity</b></div></div>
      <div class="li" data-q="meet">${I.cal}<div class="main"><b>Book a meeting</b></div></div>
      <div class="li" data-q="lead">${I.lead}<div class="main"><b>Event lead / scan card</b></div></div>
      <div class="li" data-q="prop">${I.rupee}<div class="main"><b>Proposal / rate card</b></div></div>
      <div class="li" data-q="req">${I.req}<div class="main"><b>Requirement</b></div></div>
      <div class="li" data-q="commit">${I.flag}<div class="main"><b>Commitment</b></div></div>
      <div class="li" data-q="dreq">${I.req}<div class="main"><b>Delivery: add requirement</b></div></div></div>`, (el, close) => {
      $(".list", el).onclick = (e) => { const li = e.target.closest(".li"); if (!li) return; close(); setTimeout(() => ({ log: pickDeal, deal: () => dealForm(null), meet: () => meetingForm(null), lead: () => (location.hash = "#/leads"), prop: () => propForm(null), req: () => reqForm(null), commit: () => commitForm(null), dcand: () => dCandForm(null), dimp: () => dImport(), dreq: () => dReqForm(null) })[li.dataset.q](), 260); };
    });
  }
  function pickDeal() {
    const all = deals().map((r) => ({ r, x: deal(r) })).sort((a, b) => b.x.score - a.x.score);
    const list = (q) => all.filter(({ r }) => !q || (r.Account + " " + r.Contact).toLowerCase().includes(q)).slice(0, 40).map(({ r }) => `<div class="li" data-id="${esc(r["Deal ID"])}">${tempDot(r.Temperature)}<div class="main"><b>${esc(r.Contact)}</b><div class="hint">${esc(r.Account)} · ${esc(r.Stage)}</div></div></div>`).join("");
    sheet("Who did you contact?", `<input class="search" id="dq" placeholder="Search name or company" style="width:100%;margin-bottom:8px" autofocus><div class="list" id="dl">${list("")}</div>`, (el, close) => {
      $("#dq", el).oninput = (e) => ($("#dl", el).innerHTML = list(e.target.value.toLowerCase()));
      $("#dl", el).onclick = (e) => { const li = e.target.closest(".li"); if (li) { close(); setTimeout(() => logTouch(dealById(li.dataset.id)), 260); } };
    });
  }

  // ================================================================ DELIVERY (recruitment)
  // Master status list + colours mirror the sheet's Base tab / conditional formatting.
  const DSTATUS_COLOR = {
    "TA - To Share": "DEEAF6", "TA Shared": "DEEAF6", "TA Rejection": "F4CCCC",
    "Screening FB": "EEF3F8", "Screen Reject": "F4CCCC", "Dropped": "D9D9D9", "No Show": "D9D9D9", "Duplicate": "D9D9D9",
    "L1 - To Schedule": "DEEAF6", "L1 Scheduled": "BDD7EE", "L1 FB Pending": "FFE699", "L1 Reject": "F4CCCC", "L1 Declined": "F4CCCC",
    "L2 - To Schedule": "DEEAF6", "L2 Scheduled": "BDD7EE", "L2 FB Pending": "FFE699", "L2 Reject": "F4CCCC", "L2 Declined": "F4CCCC",
    "L3 - To Schedule": "DEEAF6", "L3 Scheduled": "BDD7EE", "L3 FB Pending": "FFE699", "L3 Reject": "F4CCCC",
    "Final Select": "C6EFCE", "Offer Accepted": "9BD6A3", "Offer Declined": "F4CCCC",
    "On Hold": "FFF2CC", "Position Closed": "D9D9D9", "Joined": "63BE7B" };
  const DSTATUS = Object.keys(DSTATUS_COLOR);
  const STAGE_OF = { "TA - To Share": "TA", "TA Shared": "TA", "TA Rejection": "TA",
    "Screening FB": "Screening", "Screen Reject": "Screening", "Dropped": "Screening", "No Show": "Screening", "Duplicate": "Screening",
    "L1 - To Schedule": "L1", "L1 Scheduled": "L1", "L1 FB Pending": "L1", "L1 Reject": "L1", "L1 Declined": "L1",
    "L2 - To Schedule": "L2", "L2 Scheduled": "L2", "L2 FB Pending": "L2", "L2 Reject": "L2", "L2 Declined": "L2",
    "L3 - To Schedule": "L3", "L3 Scheduled": "L3", "L3 FB Pending": "L3", "L3 Reject": "L3",
    "Final Select": "Offer", "Offer Accepted": "Offer", "Offer Declined": "Offer",
    "On Hold": "On Hold", "Position Closed": "Closed", "Joined": "Joined" };
  const STAGE_ORDER = ["TA", "Screening", "L1", "L2", "L3", "Offer", "Joined", "On Hold", "Closed"];
  const DLOST = new Set(["TA Rejection", "Screen Reject", "Dropped", "No Show", "Duplicate", "L1 Reject", "L1 Declined", "L2 Reject", "L2 Declined", "L3 Reject", "Offer Declined", "Position Closed"]);
  const SCHEDULED = new Set(["L1 - To Schedule", "L1 Scheduled", "L2 - To Schedule", "L2 Scheduled", "L3 - To Schedule", "L3 Scheduled"]);
  const statusChip = (st) => { const c = DSTATUS_COLOR[st]; const dark = c && parseInt(c, 16) < 0x999999; return c ? `<span class="chip" style="background:#${c};color:${dark ? "#fff" : "#1a1a1a"}">${esc(st || "-")}</span>` : `<span class="chip">${esc(st || "-")}</span>`; };
  const DPARKED = new Set(["On Hold"]); // client-held: not a live follow-up, not a loss
  const dWon = (s) => s === "Joined";
  const dActive = (s) => !!s && !dWon(s) && !DLOST.has(s) && !DPARKED.has(s);
  const dcands = () => live("delivery");
  const dreqs = () => live("deliveryReqs");
  const candsFor = (id) => dcands().filter((c) => c["Req ID"] === id);
  // lenient: match by Req ID, or by Client+Role when a candidate wasn't linked to a Req ID
  const candsForReq = (r) => dcands().filter((c) => (c["Req ID"] && c["Req ID"] === r["Req ID"]) || (r.Role && c.Role === r.Role && c.Client === r.Client));
  // #3: a requirement is auto-closed when it HAS candidates but none has a pending (active) next follow-up
  const reqAutoClosed = (r) => { const cs = candsForReq(r); return cs.length > 0 && !cs.some((c) => dActive(c.Status) && isNum(c["Next Follow-up"])); };
  const reqOpen = (r) => r.Status === "Open" && !reqAutoClosed(r);
  const fmtCTC = (n) => (isNum(n) ? n + " LPA" : "");
  const nextReqId = () => { const n = dreqs().map((r) => +(String(r["Req ID"] || "").match(/\d+/) || [0])[0]); return "R-" + String(Math.max(0, ...n) + 1).padStart(3, "0"); };
  const reqOpts = () => dreqs().slice().sort((a, b) => (a.Status === "Open" ? -1 : 1) - (b.Status === "Open" ? -1 : 1)).map((r) => `${r["Req ID"]} · ${r.Client} · ${r.Role}`);

  function dCandCard(c) {
    const st = c.Status || "", cls = dWon(st) ? "ok" : DLOST.has(st) ? "bad" : "warn";
    return `<div class="card deal" data-act="dcand" data-sig='${esc(c._sig)}'>
      <i class="dotT ${dWon(st) ? "Hot" : DLOST.has(st) ? "" : "Warm"}"></i>
      <div class="main"><div class="t1"><span>${esc(c.Candidate)}</span>${c._pending ? '<span class="pend">• saving</span>' : ""}</div>
      <div class="t2">${esc(c.Role || "")}${c.Client ? " · " + esc(c.Client) : ""}</div>
      <div class="meta">${statusChip(st)}${isNum(c["Interview Date"]) ? `<span class="chip ${c["Interview Date"] < today() ? "bad" : "stage"}">📅 ${esc(D.fmt(c["Interview Date"]))}${c["Interview Time"] ? " " + esc(c["Interview Time"]) : ""}</span>` : ""}${isNum(c["Expected CTC (LPA)"]) ? `<span class="chip">ECTC ${c["Expected CTC (LPA)"]}L</span>` : ""}${c["Notice Period"] ? `<span class="chip">${esc(c["Notice Period"])}</span>` : ""}${isNum(c["Next Follow-up"]) ? `<span class="chip ${c["Next Follow-up"] < today() ? "bad" : ""}">${esc(D.fmt(c["Next Follow-up"]))}</span>` : ""}</div>
      <div class="acts"><button class="pri" data-act="dlog" data-sig='${esc(c._sig)}'>Log / move</button>${c.Phone ? "" : ""}</div></div></div>`;
  }
  function dReqCard(r) {
    const cs = candsFor(r["Req ID"]), active = cs.filter((c) => dActive(c.Status)).length, joined = cs.filter((c) => dWon(c.Status)).length;
    const cls = { Open: "ok", "On Hold": "warn", Filled: "stage", Closed: "" }[r.Status] || "";
    return `<div class="card deal" data-go="#/req/${encodeURIComponent(r["Req ID"])}"><div class="main">
      <div class="t1"><span>${esc(r.Role)}</span></div>
      <div class="t2">${esc(r.Client)}${r.SPOC ? " · " + esc(r.SPOC) : ""}${r.Budget ? " · " + esc(r.Budget) : ""}</div>
      <div class="meta"><span class="chip ${cls}">${esc(r.Status || "Open")}</span><span class="chip">${cs.length} cand</span>${active ? `<span class="chip ok">${active} active</span>` : ""}${joined ? `<span class="chip ok">${joined} joined</span>` : ""}</div></div></div>`;
  }

  // compact rows (for closed / on-hold lists — not boxes)
  function dCandRow(c) { return `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid var(--b)"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.Candidate)}</div><div style="font-size:11px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.Role || "")}${c.Client ? " · " + esc(c.Client) : ""}</div></div>${statusChip(c.Status)}<button class="btn" data-act="dcand" data-sig='${esc(c._sig)}' style="padding:6px 11px;font-size:12px;flex:none">Edit</button></div>`; }
  function dReqRow(r) { const dormant = r.Status === "Open" && reqAutoClosed(r); const label = dormant ? "No pending f/u" : (r.Status || "-"); const cls = dormant ? "" : ({ Open: "ok", "On Hold": "warn", Filled: "stage", Closed: "" }[r.Status] || ""); return `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid var(--b)"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.Role)}</div><div style="font-size:11px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.Client || "")}${r.SPOC ? " · " + esc(r.SPOC) : ""}</div></div><span class="chip ${cls}">${esc(label)}</span><button class="btn" data-act="editreq" data-id="${esc(r["Req ID"])}" style="padding:6px 11px;font-size:12px;flex:none">Edit</button></div>`; }
  function compactList(title, rows, count) { if (!rows.length) return ""; return `<div class="sec"><h2>${esc(title)}</h2><span class="count">${count}</span></div><div class="card" style="padding:0;overflow:hidden">${rows.join("")}</div>`; }

  // ---------------- DELIVERY REVIEW (management dashboard)
  let delivView = (() => { try { return localStorage.getItem("pp.deliv") || "review"; } catch (e) { return "review"; } })();
  const setDelivView = (v) => { delivView = v; try { localStorage.setItem("pp.deliv", v); } catch (e) {} };
  const delivToggle = () => `<div class="seg dashseg" id="delivseg"><button data-v="review" class="${delivView === "review" ? "on" : ""}">Review</button><button data-v="queue" class="${delivView === "queue" ? "on" : ""}">Queue</button><button data-v="work" class="${delivView === "work" ? "on" : ""}">Work</button></div>`;
  let revPeriod = "all";
  const PERIOD_LABEL = { all: "all time", w: "this week", m: "this month", q: "this quarter", y: "this year" };
  const periodStart = (t) => { if (revPeriod === "w") return D.weekStart(t); const d = D.toJS(t); const S = (y, mo) => Math.floor(Date.UTC(y, mo, 1) / 864e5) + 25569; if (revPeriod === "m") return S(d.getUTCFullYear(), d.getUTCMonth()); if (revPeriod === "q") return S(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3); if (revPeriod === "y") return S(d.getUTCFullYear(), 0); return 0; };
  const mountDeliv = (el) => {
    const g = $("#delivseg", el); if (g) g.onclick = (e) => { const b = e.target.closest("button"); if (b) { setDelivView(b.dataset.v); render(); } };
    const p = $("#revperiod", el); if (p) p.onclick = (e) => { const b = e.target.closest("button"); if (b) { revPeriod = b.dataset.v; render(); } };
  };
  let reviewSummaryText = "", deliveryDayText = "";
  function deliveryReview(reqs, cands) {
    const t = today(), ws = D.weekStart(t);
    const pstart = periodStart(t);
    const pcands = revPeriod === "all" ? cands : cands.filter((c) => isNum(c.Submitted) && c.Submitted >= pstart);
    const openReqs = reqs.filter(reqOpen);
    const active = cands.filter((c) => dActive(c.Status));
    const joined = cands.filter((c) => dWon(c.Status));
    const joinedP = pcands.filter((c) => dWon(c.Status));
    const lost = pcands.filter((c) => DLOST.has(c.Status));
    const offers = cands.filter((c) => STAGE_OF[c.Status] === "Offer" && c.Status !== "Offer Declined");
    const ivWeek = cands.filter((c) => dActive(c.Status) && isNum(c["Interview Date"]) && c["Interview Date"] >= t && c["Interview Date"] <= t + 7);
    const sub = pcands.length;
    const reached = (set) => pcands.filter((c) => set.includes(STAGE_OF[c.Status])).length;
    const rIv = reached(["L1", "L2", "L3", "Offer", "Joined"]), rOf = reached(["Offer", "Joined"]), rJn = reached(["Joined"]);
    const pc = (a, b) => (b ? Math.round((100 * a) / b) : 0);
    const ageOf = (r) => (isNum(r["Req Received"]) ? t - r["Req Received"] : null);
    const activeForReq = (r) => candsForReq(r).filter((c) => dActive(c.Status)).length;
    const subForReq = (r) => candsForReq(r).length;
    const furthest = (r) => { const cs = candsForReq(r); let best = -1; cs.forEach((c) => { const i = STAGE_ORDER.indexOf(STAGE_OF[c.Status]); if (i > best) best = i; }); return best >= 0 ? STAGE_ORDER[best] : "—"; };
    const riskOf = (r) => { const a = ageOf(r); if (subForReq(r) === 0 && (a == null || a > 7)) return 2; if (a != null && a > 21 && activeForReq(r) === 0) return 2; if (a != null && a > 30) return 1; return 0; };
    const atRisk = openReqs.filter((r) => riskOf(r) === 2);
    const avgAge = openReqs.length ? Math.round(openReqs.reduce((s, r) => s + (ageOf(r) || 0), 0) / openReqs.length) : 0;
    const filledRoles = reqs.filter((r) => r.Status === "Filled").length;
    const fillRate = pc(filledRoles, filledRoles + openReqs.length);
    const dropRate = pc(lost.length, sub);
    const offerStale = offers.filter((c) => !isNum(c["Last Follow-up"]) || t - c["Last Follow-up"] > 7);
    const needAttn = active.filter((c) => !isNum(c["Next Follow-up"]) || c["Next Follow-up"] <= t);
    const newReqs = reqs.filter((r) => isNum(r["Req Received"]) && r["Req Received"] >= ws).length;
    const newSubs = cands.filter((c) => isNum(c.Submitted) && c.Submitted >= ws).length;
    const clientOpen = {}; openReqs.forEach((r) => { const k = r.Client || "(none)"; clientOpen[k] = (clientOpen[k] || 0) + 1; });
    const byClient = {};
    cands.forEach((c) => { const k = c.Client || "(none)"; const o = (byClient[k] = byClient[k] || { sub: 0, act: 0, iv: 0, off: 0, jn: 0 }); o.sub++; if (dActive(c.Status)) o.act++; if (isNum(c["Interview Date"]) && c["Interview Date"] >= t && c["Interview Date"] <= t + 7 && dActive(c.Status)) o.iv++; if (STAGE_OF[c.Status] === "Offer") o.off++; if (dWon(c.Status)) o.jn++; });
    Object.keys(clientOpen).forEach((k) => { byClient[k] = byClient[k] || { sub: 0, act: 0, iv: 0, off: 0, jn: 0 }; });
    const clientRows = Object.entries(byClient).sort((a, b) => (clientOpen[b[0]] || 0) - (clientOpen[a[0]] || 0) || b[1].act - a[1].act);
    const nc = Object.keys(clientOpen).length;
    // ---- Day report glance: what's actively in motion, across reqs / accounts / POCs, by stage
    const actReqIds = new Set(), actClients = new Set(), actSpocs = new Set(), stageCount = {};
    active.forEach((c) => {
      actReqIds.add(c["Req ID"] || (c.Role || "") + "|" + (c.Client || ""));
      actClients.add(c.Client || "(none)"); if (c.SPOC) actSpocs.add(c.SPOC);
      const s = STAGE_OF[c.Status] || "Other"; stageCount[s] = (stageCount[s] || 0) + 1;
    });
    const stageGlance = STAGE_ORDER.filter((s) => stageCount[s]).map((s) => `${s} ${stageCount[s]}`).join(" · ");
    // ---- POC-wise (SPOC) stats
    const spocOpen = {}; openReqs.forEach((r) => { const k = r.SPOC || "(none)"; spocOpen[k] = (spocOpen[k] || 0) + 1; });
    const bySpoc = {};
    cands.forEach((c) => { const k = c.SPOC || "(none)"; const o = (bySpoc[k] = bySpoc[k] || { sub: 0, act: 0, iv: 0, off: 0, jn: 0 }); o.sub++; if (dActive(c.Status)) o.act++; if (isNum(c["Interview Date"]) && c["Interview Date"] >= t && c["Interview Date"] <= t + 7 && dActive(c.Status)) o.iv++; if (STAGE_OF[c.Status] === "Offer") o.off++; if (dWon(c.Status)) o.jn++; });
    const spocRows = Object.entries(bySpoc).filter(([k]) => k !== "(none)").sort((a, b) => b[1].act - a[1].act || b[1].sub - a[1].sub);
    const tp = [];
    tp.push(`<b>${openReqs.length}</b> open role${openReqs.length !== 1 ? "s" : ""} across <b>${nc}</b> client${nc !== 1 ? "s" : ""}, avg age <b>${avgAge}d</b>; <b>${active.length}</b> candidates in process.`);
    tp.push(`Funnel: submit→interview <b>${pc(rIv, sub)}%</b>, interview→offer <b>${pc(rOf, rIv)}%</b>, offer→join <b>${pc(rJn, rOf)}%</b>. Overall fill rate <b>${fillRate}%</b>.`);
    tp.push(`Near-term: <b>${ivWeek.length}</b> interview${ivWeek.length !== 1 ? "s" : ""} this week, <b>${offers.length}</b> offer${offers.length !== 1 ? "s" : ""} in hand, <b>${joinedP.length}</b> joined (${PERIOD_LABEL[revPeriod]}).`);
    tp.push(`Momentum this week: <b>+${newReqs}</b> new role${newReqs !== 1 ? "s" : ""}, <b>+${newSubs}</b> new submission${newSubs !== 1 ? "s" : ""}. Drop/reject rate <b>${dropRate}%</b>.`);
    if (atRisk.length) tp.push(`<span style="color:#C0392B">At risk: <b>${atRisk.length}</b> role${atRisk.length !== 1 ? "s" : ""} aged with no live pipeline — ${atRisk.slice(0, 3).map((r) => esc(r.Role) + " (" + esc(r.Client) + ")").join(", ")}${atRisk.length > 3 ? "…" : ""}.</span>`);
    if (offerStale.length) tp.push(`<span style="color:#C0392B">Ask management: expedite client feedback on <b>${offerStale.length}</b> pending offer${offerStale.length !== 1 ? "s" : ""} (no update in 7+ days) — drop risk.</span>`);
    if (needAttn.length) tp.push(`<b>${needAttn.length}</b> active candidate${needAttn.length !== 1 ? "s" : ""} need a follow-up today.`);
    const strip = (s) => s.replace(/<[^>]+>/g, "");
    reviewSummaryText = "Delivery review — " + D.toJS(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) + "\n\n• " + tp.map(strip).join("\n• ");
    const riskDot = (r) => { const x = riskOf(r); return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${x === 2 ? "#E5484D" : x === 1 ? "#F5A33B" : "#2EB36A"}"></span>`; };
    const reqRows = openReqs.slice().sort((a, b) => riskOf(b) - riskOf(a) || (ageOf(b) || 0) - (ageOf(a) || 0))
      .map((r) => `<tr data-go="#/req/${encodeURIComponent(r["Req ID"])}" style="cursor:pointer"><td>${riskDot(r)} ${esc(r.Role)}<div style="font-size:11px;color:var(--ink-3)">${esc(r.Client || "")}</div></td><td class="n">${ageOf(r) != null ? ageOf(r) + "d" : "—"}</td><td class="n">${subForReq(r)}</td><td class="n">${activeForReq(r)}</td><td>${esc(furthest(r))}</td></tr>`).join("");
    const bar = (label, n, max) => `<div style="display:grid;grid-template-columns:64px 1fr 26px;align-items:center;gap:8px;margin:5px 0;font-size:13px"><div style="color:var(--ink-2);font-weight:700">${esc(label)}</div><div style="height:10px;border-radius:6px;background:var(--card);border:2px solid var(--b);overflow:hidden"><i style="display:block;height:100%;width:${max ? Math.round((100 * n) / max) : 0}%;background:linear-gradient(90deg,#FB6A2E,#F9A825)"></i></div><b>${n}</b></div>`;
    const buckets = [["0-7d", 0], ["8-21d", 0], ["22-45d", 0], ["45d+", 0]];
    openReqs.forEach((r) => { const a = ageOf(r); if (a == null) return; if (a <= 7) buckets[0][1]++; else if (a <= 21) buckets[1][1]++; else if (a <= 45) buckets[2][1]++; else buckets[3][1]++; });
    const maxB = Math.max(1, ...buckets.map((b) => b[1]));
    deliveryDayText = `Delivery day report — ${D.toJS(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}\n`
      + `• Actively working ${active.length} candidate(s) across ${actReqIds.size} requirement(s), ${actClients.size} account(s), ${actSpocs.size} POC(s).\n`
      + (stageGlance ? `• In process by stage: ${stageGlance}.\n` : "")
      + `• Needs action: ${needAttn.length} follow-up(s) due, ${ivWeek.length} interview(s) this week, ${offers.length} offer(s) pending${offerStale.length ? " (" + offerStale.length + " stale)" : ""}.`;
    return `
      <div class="seg" id="revperiod" style="margin-bottom:10px;flex-wrap:wrap">${[["all", "All"], ["w", "Weekly"], ["m", "Monthly"], ["q", "Quarterly"], ["y", "Annually"]].map(([v, l]) => `<button data-v="${v}" class="${revPeriod === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="sec"><h2>Today's delivery report</h2><span class="count">${esc(D.fmt(t, { abs: 1 }))}</span></div>
      <div class="card" style="border-left:5px solid #2EB36A">
        <div style="font-size:14px;line-height:1.55">Actively working <b>${active.length}</b> candidate${active.length !== 1 ? "s" : ""} across <b>${actReqIds.size}</b> requirement${actReqIds.size !== 1 ? "s" : ""}, <b>${actClients.size}</b> account${actClients.size !== 1 ? "s" : ""}, <b>${actSpocs.size}</b> POC${actSpocs.size !== 1 ? "s" : ""}.</div>
        ${stageGlance ? `<div style="font-size:13px;color:var(--ink-2);margin-top:7px"><b>By stage:</b> ${esc(stageGlance)}</div>` : ""}
        <div style="font-size:13px;margin-top:7px"><b>Needs action:</b> ${needAttn.length} follow-up${needAttn.length !== 1 ? "s" : ""} due · ${ivWeek.length} interview${ivWeek.length !== 1 ? "s" : ""} this week · ${offers.length} offer${offers.length !== 1 ? "s" : ""} pending${offerStale.length ? ` <span style="color:#C0392B">(${offerStale.length} stale)</span>` : ""}</div>
        <div class="acts" style="margin-top:10px"><button class="pri" data-act="dayrepcopy" style="padding:5px 11px;font-size:11.5px;border-radius:10px">${I.copy}<span class="lbl">Copy day report</span></button></div>
      </div>
      <div class="kpis">
        <button class="kpi" data-scroll="rv-reqs"><div class="v">${openReqs.length}</div><div class="l">Open roles</div></button>
        <button class="kpi"><div class="v">${active.length}</div><div class="l">In process</div></button>
        <button class="kpi"><div class="v">${ivWeek.length}</div><div class="l">Interviews / wk</div></button>
        <button class="kpi ${offers.length ? "warn" : ""}"><div class="v">${offers.length}</div><div class="l">Offers</div></button>
      </div>
      <div class="card" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
        <div><div style="font-size:20px;font-weight:800">${fillRate}%</div><div class="hint">Fill rate</div></div>
        <div><div style="font-size:20px;font-weight:800">${pc(rJn, rOf)}%</div><div class="hint">Offer→Join</div></div>
        <div><div style="font-size:20px;font-weight:800">${dropRate}%</div><div class="hint">Drop rate</div></div>
        <div><div style="font-size:20px;font-weight:800">${avgAge}d</div><div class="hint">Avg age</div></div>
      </div>
      <div class="sec"><h2>Review talking points</h2></div>
      <div class="card" style="border-left:5px solid #EFA000"><ul style="margin:0;padding-left:18px;line-height:1.7">${tp.map((x) => `<li>${x}</li>`).join("")}</ul>
        <div class="acts" style="margin-top:10px"><button class="pri" data-act="revcopy" style="padding:5px 11px;font-size:11.5px;border-radius:10px">${I.copy}<span class="lbl">Copy</span></button></div></div>
      <div class="sec"><h2>Client-wise</h2><span class="count">${clientRows.length}</span></div>
      <div class="card"><table class="mini"><tr><th>Client</th><th class="n">Open</th><th class="n">Sub</th><th class="n">Active</th><th class="n">IV/wk</th><th class="n">Offer</th><th class="n">Joined</th></tr>
        ${clientRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${clientOpen[k] || 0}</td><td class="n">${v.sub}</td><td class="n">${v.act}</td><td class="n">${v.iv}</td><td class="n">${v.off}</td><td class="n">${v.jn}</td></tr>`).join("")}</table></div>
      ${spocRows.length ? `<div class="sec"><h2>POC-wise (SPOC)</h2><span class="count">${spocRows.length}</span></div>
      <div class="card"><table class="mini"><tr><th>POC</th><th class="n">Open</th><th class="n">Sub</th><th class="n">Active</th><th class="n">IV/wk</th><th class="n">Offer</th><th class="n">Joined</th></tr>
        ${spocRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${spocOpen[k] || 0}</td><td class="n">${v.sub}</td><td class="n">${v.act}</td><td class="n">${v.iv}</td><td class="n">${v.off}</td><td class="n">${v.jn}</td></tr>`).join("")}</table></div>` : ""}
      <div class="sec"><h2>Conversion funnel · ${PERIOD_LABEL[revPeriod]}</h2></div>
      <div class="card"><table class="mini"><tr><th>Stage</th><th class="n">#</th><th class="n">of prev</th><th class="n">of sub</th></tr>
        <tr><td>Submitted</td><td class="n">${sub}</td><td class="n">—</td><td class="n">100%</td></tr>
        <tr><td>Interviewed</td><td class="n">${rIv}</td><td class="n">${pc(rIv, sub)}%</td><td class="n">${pc(rIv, sub)}%</td></tr>
        <tr><td>Offered</td><td class="n">${rOf}</td><td class="n">${pc(rOf, rIv)}%</td><td class="n">${pc(rOf, sub)}%</td></tr>
        <tr><td>Joined</td><td class="n">${rJn}</td><td class="n">${pc(rJn, rOf)}%</td><td class="n">${pc(rJn, sub)}%</td></tr></table></div>
      <div id="rv-reqs" class="sec"><h2>Requirement-wise</h2><span class="count">${openReqs.length}</span></div>
      <div class="card">${openReqs.length ? `<table class="mini"><tr><th>Role</th><th class="n">Age</th><th class="n">Sub</th><th class="n">Active</th><th>Furthest</th></tr>${reqRows}</table><div class="hint" style="margin-top:7px">● red = aged / no pipeline · ● amber = aging · ● green = healthy — tap a row to open</div>` : '<div class="empty">No open roles</div>'}</div>
      <div class="sec"><h2>Aging of open roles</h2></div>
      <div class="card">${buckets.map((b) => bar(b[0], b[1], maxB)).join("")}</div>
      ${atRisk.length ? `<div class="sec bad"><h2>Needs attention</h2><span class="count">${atRisk.length}</span></div><div class="cardgrid">${atRisk.map(dReqCard).join("")}</div>` : ""}`;
  }

  // ---------------- DELIVERY QUEUE (per-requirement stage boards, grouped by client)
  const qAge = (c) => { const t = today(); if (isNum(c["Last Follow-up"])) return t - c["Last Follow-up"]; if (isNum(c.Submitted)) return t - c.Submitted; return null; };
  const qKind = (c) => { const st = c.Status || "", stg = STAGE_OF[st], a = qAge(c) || 0; if (stg === "Offer") return a >= 3 ? "red" : "amb"; if (/FB Pending/i.test(st)) return a >= 4 ? "red" : "amb"; if (SCHEDULED.has(st)) return (isNum(c["Interview Date"]) && c["Interview Date"] < today()) ? "amb" : "grn"; if (/Screen/i.test(st)) return a >= 3 ? "red" : "amb"; return "amb"; };
  const qNext = (c) => { const st = c.Status || "", stg = STAGE_OF[st], a = qAge(c) || 0, t = today(); if (stg === "Offer") return "Confirm acceptance & joining date"; if (/FB Pending/i.test(st)) return `Chase client for ${stg} feedback` + (a >= 4 ? " — overdue" : ""); if (SCHEDULED.has(st)) { if (isNum(c["Interview Date"])) { if (c["Interview Date"] < t) return "Collect " + stg + " feedback"; if (c["Interview Date"] === t) return "Interview today — confirm"; } return "Prep candidate for " + stg; } if (/Screen/i.test(st)) return "Screen & submit to client"; return "Follow up"; };
  const qAgeLabel = (c) => { if (SCHEDULED.has(c.Status || "") && isNum(c["Interview Date"]) && c["Interview Date"] >= today()) return D.fmt(c["Interview Date"]) + (c["Interview Time"] ? " " + c["Interview Time"] : ""); const a = qAge(c); return a == null ? "—" : a + "d"; };
  function qPill(c) {
    const k = qKind(c), chipCls = { red: "bad", amb: "warn", grn: "ok" }[k], col = k === "red" ? "#B3201F" : k === "amb" ? "#8A5A00" : "#17874F";
    const note = c.Notes ? String(c.Notes).split("|")[0].trim() : "";
    return `<div class="card deal" style="padding:9px;margin:0 0 8px;cursor:pointer" data-act="dlog" data-sig='${esc(c._sig)}'>
      <div style="font-weight:800;font-size:12.5px">${esc(c.Candidate)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px"><span class="chip ${chipCls}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto">${esc(c.Status || "-")}</span><span style="font-size:10px;font-weight:800;color:${col};flex:none">${esc(qAgeLabel(c))}</span></div>
      ${note ? `<div style="font-size:10.5px;color:var(--ink-3);margin-top:6px;font-style:italic;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(note)}</div>` : ""}
      <div style="font-size:10px;margin-top:7px;padding-top:6px;border-top:1px dashed var(--b);color:var(--ink-2)">→ ${esc(qNext(c))}</div>
    </div>`;
  }
  function qBoard(cs) {
    const byStage = {}; cs.forEach((c) => { const s = STAGE_OF[c.Status] || "Other"; (byStage[s] = byStage[s] || []).push(c); });
    const cols = STAGE_ORDER.filter((s) => byStage[s] && byStage[s].length).concat(Object.keys(byStage).filter((s) => STAGE_ORDER.indexOf(s) < 0));
    return `<div style="display:flex;gap:9px;overflow-x:auto;padding-bottom:4px">${cols.map((s) => `
      <div style="flex:0 0 156px;background:rgba(120,90,50,.06);border:1.5px dashed rgba(60,40,20,.18);border-radius:13px;padding:8px">
        <div style="font-size:11px;font-weight:800;color:var(--ink-2);display:flex;justify-content:space-between;margin-bottom:7px"><span>${esc(s)}</span><span>${byStage[s].length}</span></div>
        ${byStage[s].slice().sort((a, b) => (qAge(b) || 0) - (qAge(a) || 0)).map(qPill).join("")}</div>`).join("")}</div>`;
  }
  function deliveryQueue(reqs, cands) {
    const t = today();
    const active = cands.filter((c) => dActive(c.Status));
    if (!active.length) return `<div class="card" style="text-align:center"><b>No active submissions in motion.</b><p class="hint">Candidates in Screening / L1 / L2 / L3 / Offer appear here, grouped by client and requirement.</p></div>`;
    const atClient = active.filter((c) => /FB Pending/i.test(c.Status || "")).length;
    const stale = active.filter((c) => (qAge(c) || 0) >= 5).length;
    const ivs = active.filter((c) => SCHEDULED.has(c.Status || "") || (isNum(c["Interview Date"]) && c["Interview Date"] >= t && c["Interview Date"] <= t + 7)).length;
    const byClient = {};
    active.forEach((c) => { const cl = c.Client || "(no client)"; (byClient[cl] = byClient[cl] || {}); const rk = (c["Req ID"] || "") + "|" + (c.Role || "(no role)"); (byClient[cl][rk] = byClient[cl][rk] || { role: c.Role || "(no role)", rid: c["Req ID"] || "", cands: [] }); byClient[cl][rk].cands.push(c); });
    let html = `<div class="kpis">
      <button class="kpi"><div class="v">${active.length}</div><div class="l">In motion</div></button>
      <button class="kpi ${atClient ? "warn" : ""}"><div class="v">${atClient}</div><div class="l">At client</div></button>
      <button class="kpi ${stale ? "bad" : ""}"><div class="v">${stale}</div><div class="l">Stale 5d+</div></button>
      <button class="kpi"><div class="v">${ivs}</div><div class="l">Interviews</div></button></div>`;
    Object.keys(byClient).sort().forEach((cl) => {
      const rm = byClient[cl], keys = Object.keys(rm).sort((a, b) => rm[b].cands.length - rm[a].cands.length);
      const total = keys.reduce((s, k) => s + rm[k].cands.length, 0);
      html += `<div class="sec"><h2>${esc(cl)}</h2><span class="count">${keys.length} role${keys.length !== 1 ? "s" : ""} · ${total}</span></div>`;
      keys.forEach((k) => {
        const r = rm[k], rr = r.rid ? dreqs().find((x) => x["Req ID"] === r.rid) : null;
        const age = rr && isNum(rr["Req Received"]) ? t - rr["Req Received"] : null;
        html += `<div class="card" style="padding:12px">
          <div ${r.rid ? `data-go="#/req/${encodeURIComponent(r.rid)}" style="cursor:pointer"` : ""} style="margin-bottom:9px">
            <div style="font-weight:800;font-size:13.5px">${esc(r.role)}</div>
            <div style="font-size:11px;color:var(--ink-3)">${r.cands.length} in customer queue${age != null ? " · role age " + age + "d" : ""}</div></div>
          ${qBoard(r.cands)}</div>`;
      });
    });
    return html;
  }

  V.delivery = () => {
    const t = today();
    const reqs = dreqs(), cands = dcands();
    if ((reqs.length || cands.length) && delivView === "review") return { title: "Delivery · Review", back: true, html: delivToggle() + deliveryReview(reqs, cands), mount: mountDeliv };
    if ((reqs.length || cands.length) && delivView === "queue") return { title: "Delivery · Queue", back: true, html: delivToggle() + deliveryQueue(reqs, cands), mount: mountDeliv };
    const live_ = reqs.filter(reqOpen);
    const active = cands.filter((c) => dActive(c.Status));
    const due = active.filter((c) => !isNum(c["Next Follow-up"]) || c["Next Follow-up"] <= t)
      .sort((a, b) => (a["Next Follow-up"] || 0) - (b["Next Follow-up"] || 0));
    const ivKey = (c) => (isNum(c["Interview Date"]) ? c["Interview Date"] : isNum(c["Next Follow-up"]) ? c["Next Follow-up"] : 9e9);
    const interviews = cands.filter((c) => SCHEDULED.has(c.Status) || isNum(c["Interview Date"])).filter((c) => dActive(c.Status)).sort((a, b) => ivKey(a) - ivKey(b));
    const offered = cands.filter((c) => STAGE_OF[c.Status] === "Offer" && c.Status !== "Offer Declined");
    const joined = cands.filter((c) => dWon(c.Status));
    // funnel
    const stageN = (s) => cands.filter((c) => STAGE_OF[c.Status] === s).length;
    const reached = (set) => cands.filter((c) => set.includes(STAGE_OF[c.Status])).length;
    const sub = cands.length, rL1 = reached(["L1", "L2", "Offer", "Joined"]), rL2 = reached(["L2", "Offer", "Joined"]), rOf = reached(["Offer", "Joined"]), rJn = reached(["Joined"]);
    const convRow = (lab, a, b) => `<tr><td>${lab}</td><td class="n">${a}</td><td class="n">${b ? Math.round(100 * a / b) + "%" : "-"}</td></tr>`;
    // recruiter output
    const bySpoc = {}; cands.forEach((c) => { const k = c.SPOC || "(none)"; (bySpoc[k] = bySpoc[k] || { s: 0, a: 0, j: 0 }); bySpoc[k].s++; if (dActive(c.Status)) bySpoc[k].a++; if (dWon(c.Status)) bySpoc[k].j++; });
    const spocRows = Object.entries(bySpoc).sort((a, b) => b[1].s - a[1].s).slice(0, 10);
    const byClient = {}; cands.forEach((c) => { const k = c.Client || "(none)"; (byClient[k] = byClient[k] || { s: 0, a: 0, j: 0 }); byClient[k].s++; if (dActive(c.Status)) byClient[k].a++; if (dWon(c.Status)) byClient[k].j++; });
    const clientRows = Object.entries(byClient).sort((a, b) => b[1].s - a[1].s);
    const empty = !reqs.length && !cands.length;
    return {
      title: "Delivery", back: true, mount: mountDeliv, html: empty ? `<div class="card"><b>No delivery data yet.</b><p class="hint">Import the two Delivery tabs into your sheet (see the delivery guide), or add a requirement below.</p><button class="btn pri" data-act="newreq">Add requirement</button></div>` : delivToggle() + `
      <div class="kpis"><button class="kpi" data-scroll="d-reqs"><div class="v">${live_.length}</div><div class="l">Open roles</div></button>
        <button class="kpi" data-scroll="d-due"><div class="v">${active.length}</div><div class="l">Active cand.</div></button>
        <button class="kpi ${due.length ? "warn" : ""}" data-scroll="d-due"><div class="v">${due.length}</div><div class="l">Follow-ups due</div></button>
        <button class="kpi" data-scroll="d-int"><div class="v">${joined.length}</div><div class="l">Joined</div></button></div>
      <div class="acts" style="margin-bottom:6px"><button class="pri" data-act="newcand">Add candidate</button><button data-act="impcand">Import profiles</button><button data-act="newreq">Add requirement</button></div>
      <div class="sec"><h2>Funnel</h2></div>
      <div class="card"><table class="mini"><tr><th>Stage</th><th class="n">#</th><th class="n">of submitted</th></tr>
        ${convRow("Submitted", sub, sub)}${convRow("Reached L1", rL1, sub)}${convRow("Reached L2", rL2, sub)}${convRow("Offered", rOf, sub)}${convRow("Joined", rJn, sub)}</table>
        <div class="hint" style="margin-top:8px">In play now: TA ${stageN("TA")} · Screening ${stageN("Screening")} · L1 ${stageN("L1")} · L2 ${stageN("L2")} · L3 ${stageN("L3")} · Offer ${stageN("Offer")}</div>
        <div class="hint">Closed: lost ${cands.filter((c) => DLOST.has(c.Status)).length} · client-parked (on hold) ${stageN("On Hold")}</div></div>
      <div id="d-due">${section("Follow-ups due", due.slice(0, 20).map(dCandCard), "warn", "No follow-ups due")}</div>
      <div id="d-int">${section("Interviews lined up", interviews.map(dCandCard), "", "No interviews scheduled")}</div>
      ${section("Offered", offered.map(dCandCard))}
      ${(() => { const oh = cands.filter((c) => DPARKED.has(c.Status)); return compactList("On hold (client-parked · closed)", oh.map(dCandRow), oh.length); })()}
      ${section("Recently joined", joined.slice(-10).reverse().map(dCandCard))}
      <div id="d-reqs" class="sec"><h2>Open roles</h2><span class="count">${live_.length}</span></div>
      ${live_.map(dReqCard).join("") || '<div class="empty">No open roles</div>'}
      <div class="sec"><h2>By recruiter</h2></div>
      <div class="card"><table class="mini"><tr><th>SPOC</th><th class="n">Subm.</th><th class="n">Active</th><th class="n">Joined</th></tr>
        ${spocRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.s}</td><td class="n">${v.a}</td><td class="n">${v.j}</td></tr>`).join("")}</table></div>
      <div class="sec"><h2>By client</h2></div>
      <div class="card"><table class="mini"><tr><th>Client</th><th class="n">Subm.</th><th class="n">Active</th><th class="n">Joined</th></tr>
        ${clientRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.s}</td><td class="n">${v.a}</td><td class="n">${v.j}</td></tr>`).join("")}</table></div>
      ${(() => { const other = reqs.filter((r) => !live_.includes(r)); return compactList("All roles", other.map(dReqRow), other.length); })()}`,
    };
  };

  V.req = (params, id) => {
    const r = dreqs().find((x) => x["Req ID"] === decodeURIComponent(id));
    if (!r) return { title: "Requirement", back: true, html: '<div class="empty">Requirement not found.</div>' };
    const cs = candsFor(r["Req ID"]);
    const groups = STAGE_ORDER.map((st) => [st, cs.filter((c) => STAGE_OF[c.Status] === st)]).filter(([, a]) => a.length);
    const stCls = { Open: "ok", "On Hold": "warn", Filled: "stage", Closed: "" }[r.Status] || "";
    return {
      title: r.Role, back: true, html: `
      <div class="hero"><h2>${esc(r.Role)}</h2><div class="sub">${esc(r.Client)}${r.SPOC ? " · " + esc(r.SPOC) : ""}${isNum(r["Req Received"]) ? " · recvd " + D.fmt(r["Req Received"], { abs: 1 }) : ""}</div>
        <div class="chips"><span class="chip">${esc(r.Status || "Open")}</span>${r.Budget ? `<span class="chip">Budget: ${esc(r.Budget)}</span>` : ""}${r.Priority ? `<span class="chip">${esc(r.Priority)}</span>` : ""}<span class="chip">${cs.length} candidates</span></div></div>
      <div class="acts" style="margin-bottom:8px"><button class="pri" data-act="newcand" data-req="${esc(r["Req ID"])}">Add candidate</button><button data-act="editreq" data-id="${esc(r["Req ID"])}">Edit role</button></div>
      <div class="card"><div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">ROLE STATUS</div>${chips("rstatus", ["Open", "On Hold", "Filled", "Closed"], r.Status || "Open")}</div>
      ${r.Notes ? `<div class="card"><div class="kv"><div>Notes</div><div>${esc(r.Notes)}</div></div></div>` : ""}
      ${groups.map(([st, arr]) => `<div class="sec"><h2>${esc(st)}</h2><span class="count">${arr.length}</span></div>${arr.map(dCandCard).join("")}`).join("") || '<div class="empty">No candidates yet. Add one above.</div>'}`,
      mount: (el) => {
        wireChips(el);
        $('.chips[data-name="rstatus"]', el).addEventListener("pick", (e) => { if (e.detail) { API.update("deliveryReqs", r, { Status: e.detail }); toast("Role: " + e.detail); } });
      },
    };
  };

  function dLog(c) {
    sheet("Update · " + c.Candidate, `
      <div class="f"><label>Quick move</label>${chips("stg", ["L1 Scheduled", "L1 FB Pending", "L2 Scheduled", "L2 FB Pending", "L3 Scheduled", "Final Select", "Offer Accepted", "On Hold", "Joined"], DSTATUS.includes(c.Status) ? c.Status : "")}</div>
      ${select("Or pick any status", "status", DSTATUS, c.Status, false)}
      <div class="f2">${field("Interview date (if scheduled)", "iv", c["Interview Date"], "date")}${field("Interview time", "ivt", c["Interview Time"] || "", "time")}</div>
      ${field("Note (feedback / next step)", "notes", "", "textarea")}
      <div class="f"><label>Next follow-up</label>${dateChips("nf", c["Next Follow-up"])}</div>
      <div class="toggle"><div><b>Add interview to Google Calendar</b><div class="hint">Only when an interview date is set</div></div><input type="checkbox" name="cal" checked></div>
      ${aiOn() ? `<button class="btn block" id="cmove" style="margin-bottom:8px">✨ Suggest next move</button><div id="cmoveout"></div>` : ""}
      <button class="btn pri block" id="save">Save</button>`, (el, close) => {
      wireDateChips(el);
      $('.chips[data-name="stg"]', el).addEventListener("pick", (e) => { if (e.detail) $('[name="status"]', el).value = e.detail; });
      const cm = $("#cmove", el); if (cm) cm.onclick = () => aiMove(cm, $("#cmoveout", el), CAND_MOVE_SYS, candMoveCtx(c));
      $("#save", el).onclick = () => {
        const f = form(el), t = today();
        const line = f.notes ? `${D.toJS(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}: ${f.notes}` : "";
        API.update("delivery", c, { Status: f.status, "Last Follow-up": t, "Next Follow-up": f.nf || "", "Interview Date": f.iv || "", "Interview Time": f.ivt || "", Notes: line ? (line + (c.Notes ? " | " + c.Notes : "")).slice(0, 1500) : c.Notes });
        if (f.cal && isNum(f.iv)) API.event(reminderEvent(`Interview: ${c.Candidate} - ${c.Role || ""} (${c.Client || ""})`, f.iv, f.ivt || "11:00", `Candidate: ${esc(c.Candidate)}\nRole: ${esc(c.Role || "")}\nClient: ${esc(c.Client || "")}\nStatus: ${esc(f.status)}`, 60));
        close(); toast("Updated · " + c.Candidate); render();
      };
    });
  }
  function dCandForm(c, req) {
    const isNew = !c;
    c = c || { Status: "Screening FB", Submitted: today(), "Req ID": req ? req["Req ID"] : "", Client: req ? req.Client : "", Role: req ? req.Role : "", SPOC: req ? req.SPOC : "" };
    const reqList = reqOpts();
    const curReqLabel = c["Req ID"] ? (dreqs().find((r) => r["Req ID"] === c["Req ID"]) ? `${c["Req ID"]} · ${c.Client} · ${c.Role}` : c["Req ID"]) : "";
    sheet(isNew ? "New candidate" : c.Candidate, `
      ${field("Candidate *", "Candidate", c.Candidate)}
      ${req ? `<div class="f"><label>Requirement</label><input value="${esc(curReqLabel)}" readonly></div>`
        : `<div class="f"><label>Requirement</label><div style="display:flex;gap:6px"><select name="reqpick" style="flex:1;min-width:0"><option value="">— none / fill manually —</option>${reqList.map((o) => `<option ${o.indexOf(c["Req ID"] + " ") === 0 ? "selected" : ""}>${esc(o)}</option>`).join("")}</select><button type="button" class="btn" id="newreqbtn" style="white-space:nowrap">+ New</button></div></div>`}
      <div class="f2"><div class="f"><label>Client</label><input name="Client" value="${esc(c.Client)}" list="ccli" autocomplete="off">${datalist("ccli", clientOptions())}</div>${field("Role", "Role", c.Role)}</div>
      <div class="f2"><div class="f"><label>SPOC</label><input name="SPOC" value="${esc(c.SPOC)}" list="cspo" autocomplete="off">${datalist("cspo", spocOptions())}</div>${field("Submitted", "Submitted", c.Submitted, "date")}</div>
      <div class="f2">${field("Contact number", "Phone", c.Phone, "tel")}${field("Email", "Email", c.Email, "email")}</div>
      <div class="f2">${field("Current company", "Company", c.Company)}${field("Notice period", "Notice Period", c["Notice Period"])}</div>
      ${select("Status", "status", DSTATUS, c.Status, false)}
      <div class="f2">${field("Total exp (yrs)", "Experience (yrs)", c["Experience (yrs)"], "number", 'step="0.1" inputmode="decimal"')}${field("Relevant exp", "Relevant Exp", c["Relevant Exp"])}</div>
      <div class="f2">${field("Current CTC (LPA)", "Current CTC (LPA)", c["Current CTC (LPA)"], "number", 'step="0.1" inputmode="decimal"')}${field("Expected CTC (LPA)", "Expected CTC (LPA)", c["Expected CTC (LPA)"], "number", 'step="0.1" inputmode="decimal"')}</div>
      <div class="f2">${field("Current location", "Current Location", c["Current Location"])}${field("Preferred location", "Preferred Location", c["Preferred Location"])}</div>
      ${field("Interview availability", "Interview Availability", c["Interview Availability"])}
      <div class="f2">${field("Interview date", "Interview Date", c["Interview Date"], "date")}${field("Interview time", "Interview Time", c["Interview Time"] || "", "time")}</div>
      <div class="f"><label>Next follow-up</label>${dateChips("nf", c["Next Follow-up"])}</div>
      ${field("Notes", "Notes", c.Notes, "textarea")}
      <button class="btn pri block" id="save">${isNew ? "Add candidate" : "Save"}</button>`, (el, close) => {
      wireDateChips(el);
      const nrb = $("#newreqbtn", el); if (nrb) nrb.onclick = () => { close(); setTimeout(() => dReqForm(null, (nr) => dCandForm(null, nr)), 260); };
      const pick = $('[name="reqpick"]', el);
      if (pick) pick.addEventListener("change", () => {
        const m = pick.value.split(" · "); if (m.length >= 3) { const rr = dreqs().find((r) => r["Req ID"] === m[0]); if (rr) { $('[name="Client"]', el).value = rr.Client || ""; $('[name="Role"]', el).value = rr.Role || ""; $('[name="SPOC"]', el).value = rr.SPOC || ""; } }
      });
      $("#save", el).onclick = () => {
        const f = form(el);
        if (!f.Candidate) return toast("Candidate name is required", "warn");
        const rid = req ? req["Req ID"] : (pick && pick.value ? pick.value.split(" · ")[0] : c["Req ID"] || "");
        const v = { Candidate: f.Candidate, "Req ID": rid, Client: f.Client, Role: f.Role, SPOC: f.SPOC, Phone: f.Phone, Email: f.Email, Company: f.Company, Submitted: f.Submitted, Status: f.status,
          "Next Follow-up": f.nf || "", "Interview Date": f["Interview Date"] || "", "Interview Time": f["Interview Time"] || "", "Experience (yrs)": f["Experience (yrs)"], "Relevant Exp": f["Relevant Exp"], "Notice Period": f["Notice Period"], "Current CTC (LPA)": f["Current CTC (LPA)"], "Expected CTC (LPA)": f["Expected CTC (LPA)"], "Current Location": f["Current Location"], "Preferred Location": f["Preferred Location"], "Interview Availability": f["Interview Availability"], Notes: f.Notes };
        if (isNew) API.add("delivery", v); else API.update("delivery", c, v);
        close(); toast("Saved"); render();
      };
    });
  }
  // ---- Import candidates from a pasted profile table (Outlook / Excel / Word) ----
  const CAND_MAP = [
    [/^(slno|sno|srno|serialno|srnumber)$/, "_ignore"],
    [/^(candidate|name|candidatename|resource|consultant|profile|fullname)/, "Candidate"],
    [/^(skill|role|position|designation|reqrole|skillset)/, "Role"],
    [/^(client|customer|account|endclient)/, "Client"],
    [/^(spoc|poc|contactperson)/, "SPOC"],
    [/^(contactnumber|contactno|mobilenumber|mobileno|phoneno|phone|mobile|contact)/, "Phone"],
    [/^(emailid|email|mailid|mail)/, "Email"],
    [/^(currentcompany|presentcompany|company|organisation|organization|employer)/, "Company"],
    [/^(relevantexp|relevantexperience|relexp)/, "Relevant Exp"],
    [/^(expectedctc|expctc|ectc|expected)/, "Expected CTC (LPA)"],
    [/^(currentctc|presentctc|cctc|ctc)/, "Current CTC (LPA)"],
    [/^(totalexp|totalexperience|experience|exp|yrsofexp|yearsofexp|years|yrs)/, "Experience (yrs)"],
    [/^(interviewavailability|interviewavail|availabilityforinterview|availslot)/, "Interview Availability"],
    [/^(noticeperiod|notice|np|joining|joiningtime)/, "Notice Period"],
    [/^(status|stage)/, "Status"],
    [/^(preferredlocation|preflocation|preferredloc)/, "Preferred Location"],
    [/^(currentlocation|location|baselocation|city)/, "Current Location"],
    [/^(remarks|comments|notes|feedback)/, "Notes"],
  ];
  const candFieldFor = (h) => { const n = String(h).toLowerCase().replace(/[^a-z0-9]/g, ""); for (const [re, f] of CAND_MAP) if (re.test(n)) return f; return null; };
  const NOTE_LABEL = { Phone: "📞", Email: "✉", Company: "Company", "Relevant Exp": "Rel exp", "Current Location": "Location", "Preferred Location": "Pref loc", "Interview Availability": "Avail" };
  // candidate fields beyond the always-present core — mapped to their own sheet column if it exists, else folded into Notes
  const CAND_EXTRA = ["Phone", "Email", "Company", "Relevant Exp", "Current Location", "Preferred Location", "Interview Availability"];
  function parseCandTable(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { rows: [] };
    const num = (v) => { const m = String(v).match(/[\d.]+/); return m ? +m[0] : ""; };
    // Tabular (one candidate per line) vs vertical (one value per line)
    const delim = lines[0].indexOf("\t") >= 0 ? "\t" : (lines[0].indexOf("|") >= 0 ? "|" : (/\s{2,}/.test(lines[0]) ? "SP" : (lines[0].indexOf(",") >= 0 ? "," : null)));
    const splitRow = (l) => (delim === "SP" ? l.split(/\s{2,}/) : (delim ? l.split(delim) : [l])).map((c) => c.trim());
    let headers, dataRows;
    if (delim && splitRow(lines[0]).length >= 3) {
      headers = splitRow(lines[0]);
      dataRows = lines.slice(1).map(splitRow);
    } else {
      // vertical: header block, then repeating blocks of the same length
      let H = lines.findIndex((l, i) => i > 0 && /^\d{1,4}$/.test(l));   // first SL-No value marks data start
      if (H < 1) { let i = 0; while (i < lines.length && lines[i].length <= 28 && (candFieldFor(lines[i]) || /^(slno|sno)/.test(lines[i].toLowerCase().replace(/[^a-z0-9]/g, "")))) i++; H = i; }
      if (H < 2) return { rows: [], failed: true };
      headers = lines.slice(0, H);
      const vals = lines.slice(H);
      dataRows = [];
      for (let i = 0; i + H <= vals.length; i += H) dataRows.push(vals.slice(i, i + H));
    }
    const map = headers.map(candFieldFor);
    const rows = dataRows.map((cells) => {
      const o = {}; const extra = [];
      headers.forEach((h, i) => {
        const f = map[i]; const val = (cells[i] == null ? "" : cells[i]).trim(); if (!val || f === "_ignore") return;
        if (f === "Experience (yrs)" || f === "Current CTC (LPA)" || f === "Expected CTC (LPA)") o[f] = num(val);
        else if (f === "Notes") extra.push(val);
        else if (f) o[f] = val;                 // every recognised field → its own key (Phone, Email, Company, locations, etc.)
        else extra.push(h + ": " + val);        // unrecognised column → Notes
      });
      if (extra.length) o.Notes = [o.Notes, extra.join(" · ")].filter(Boolean).join(" · ");
      return o;
    }).filter((o) => o.Candidate);
    return { rows, headers };
  }
  // de-duplicate ignoring case + surrounding spaces (keeps first-seen spelling)
  const uniqCI = (arr) => { const seen = new Set(); const out = []; arr.forEach((v) => { const s = String(v == null ? "" : v).trim(); if (!s) return; const k = s.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push(s); }); return out.sort((a, b) => a.localeCompare(b)); };
  function clientOptions() { return uniqCI([...live("delivery").map((c) => c.Client), ...dreqs().map((r) => r.Client), ...live("accounts").map((a) => a.Account), ...live("contacts").map((c) => c.Client)]); }
  function spocOptions() {
    // SPOCs come ONLY from the Delivery sheet's SPOC column — never candidate names
    const candNames = new Set(live("delivery").map((c) => String(c.Candidate || "").trim().toLowerCase()));
    return uniqCI(live("delivery").map((c) => c.SPOC)).filter((s) => !candNames.has(s.toLowerCase()));
  }
  function dImport() {
    sheet("Import candidates", `
      <div class="hint" style="margin-bottom:8px">Paste the profile table from your Outlook email (or the Excel/Word you built it in). The <b>first row must be the column headings</b>. Every recognised column (phone, email, company, locations, CTC, notice…) is filled; set the Client & SPOC below.</div>
      <textarea id="imp" rows="6" placeholder="Name	Role	Experience	Current CTC	Expected CTC	Notice Period" style="width:100%;font-family:monospace;font-size:12px"></textarea>
      <div class="f2" style="margin-top:8px">
        <div class="f"><label>Client (pick or type new)</label><input name="dclient" list="impclients" autocomplete="off">${datalist("impclients", clientOptions())}</div>
        <div class="f"><label>SPOC (pick or type new)</label><input name="dspoc" list="impspocs" autocomplete="off">${datalist("impspocs", spocOptions())}</div>
      </div>
      <div class="f2">${field("Apply Role (optional override)", "drole", "")}<div class="f"><label>Attach to requirement (optional)</label><select name="dreq"><option value="">— none —</option>${reqOpts().map((o) => `<option>${esc(o)}</option>`).join("")}</select></div></div>
      <button class="btn block" id="prev">Preview</button>
      <div id="impprev" style="margin-top:10px"></div>
      <button class="btn pri block" id="impadd" style="margin-top:10px;display:none">Add candidates</button>`, (el, close) => {
      let parsed = { rows: [] };
      const doPrev = () => {
        parsed = parseCandTable($("#imp", el).value);
        const box = $("#impprev", el), add = $("#impadd", el);
        if (!parsed.rows.length) { box.innerHTML = '<div class="empty">Couldn\'t read candidate rows. Check the first row is headings and there\'s a Name/Candidate column.</div>'; add.style.display = "none"; return; }
        const cols = [["Candidate", "Candidate"], ["Role", "Role"], ["Phone", "Phone"], ["Email", "Email"], ["Experience (yrs)", "Exp"], ["Current CTC (LPA)", "CCTC"], ["Expected CTC (LPA)", "ECTC"], ["Notice Period", "Notice"]];
        box.innerHTML = `<div class="hint" style="margin-bottom:6px">Found <b>${parsed.rows.length}</b> candidate(s):</div>
          <div style="overflow:auto;border:2px solid var(--b);border-radius:10px"><table style="border-collapse:collapse;font-size:12px;width:100%">
          <tr>${cols.map(([, h]) => `<th style="text-align:left;padding:5px 7px;border-bottom:2px solid var(--b)">${h}</th>`).join("")}</tr>
          ${parsed.rows.map((r) => `<tr>${cols.map(([k]) => `<td style="padding:5px 7px;border-bottom:1px solid rgba(120,90,50,.18)">${esc(r[k] == null ? "" : r[k])}</td>`).join("")}</tr>`).join("")}
          </table></div>`;
        add.style.display = "block"; add.textContent = `Add ${parsed.rows.length} candidate(s)`;
      };
      $("#prev", el).onclick = doPrev;
      $("#imp", el).addEventListener("input", doPrev);   // live preview as you paste/type
      $("#impadd", el).onclick = () => {
        if (!parsed.rows.length) return toast("Nothing to import yet — paste a table and check the preview", "warn");
        const f = form(el);
        const rid = f.dreq ? String(f.dreq).split(" · ")[0] : "";
        const rr = rid ? dreqs().find((x) => x["Req ID"] === rid) : null;
        const headers = (S.tables.delivery && S.tables.delivery.headers) || [];
        const has = (h) => headers.indexOf(h) >= 0;
        let n = 0;
        try {
        suppressAct = true;
        parsed.rows.forEach((r) => {
          const obj = {
            Candidate: r.Candidate, "Req ID": rid,
            Client: f.dclient || r.Client || (rr && rr.Client) || "",
            Role: r.Role || f.drole || (rr && rr.Role) || "",
            SPOC: f.dspoc || r.SPOC || (rr && rr.SPOC) || "",
            Submitted: today(), Status: (r.Status && DSTATUS.includes(r.Status)) ? r.Status : "",
            "Next Follow-up": D.addBiz(today(), 2), "Notice Period": r["Notice Period"] || "",
            "Experience (yrs)": r["Experience (yrs)"] == null ? "" : r["Experience (yrs)"],
            "Current CTC (LPA)": r["Current CTC (LPA)"] == null ? "" : r["Current CTC (LPA)"], "Expected CTC (LPA)": r["Expected CTC (LPA)"] == null ? "" : r["Expected CTC (LPA)"],
          };
          // Extra fields → their own column if the sheet has it, else keep in Notes (no data lost)
          const noteBits = r.Notes ? [r.Notes] : [];
          CAND_EXTRA.forEach((k) => { const v = r[k]; if (v === "" || v == null) return; if (has(k)) obj[k] = v; else noteBits.push((NOTE_LABEL[k] || k) + " " + v); });
          obj.Notes = noteBits.join(" · ");
          API.add("delivery", obj); n++;
        });
        } catch (e) { suppressAct = false; return toast("Import error: " + (e.message || e), "warn"); }
        suppressAct = false; logAct(`Imported ${n} candidate(s)`);
        setDelivView("work");                 // jump to the Work list so the new candidates are visible
        close(); toast(`Imported ${n} candidate(s) — saving…`);
        render();
        Store.flush().then(() => Store.refresh(true)).then(() => { if (S.status === "error") toast("Added in the app, but saving to the sheet failed: " + (S.error || "sync error"), "warn"); else toast(`${n} candidate(s) saved to the sheet`); }).catch((e) => toast("Sheet save issue: " + (e.message || e), "warn"));
      };
    });
  }
  function dReqForm(r, after) {
    const isNew = !r;
    r = r || { Status: "Open", "Req Received": today() };
    sheet(isNew ? "New requirement" : r.Role, `
      ${field("Role *", "Role", r.Role)}
      <div class="f2">${field("Client", "Client", r.Client)}${field("SPOC", "SPOC", r.SPOC)}</div>
      <div class="f2">${field("Req received", "Req Received", r["Req Received"], "date")}${field("Budget", "Budget", r.Budget)}</div>
      <div class="f2">${select("Priority", "Priority", ["High", "Medium", "Low"], r.Priority)}${select("Status", "Status", ["Open", "On Hold", "Filled", "Closed"], r.Status, false)}</div>
      ${field("Notes", "Notes", r.Notes, "textarea")}
      <button class="btn pri block" id="save">${isNew ? "Add requirement" : "Save"}</button>`, (el, close) => {
      $("#save", el).onclick = () => {
        const f = form(el);
        if (!f.Role) return toast("Role is required", "warn");
        const v = { Client: f.Client, SPOC: f.SPOC, Role: f.Role, "Req Received": f["Req Received"], Budget: f.Budget, Priority: f.Priority, Status: f.Status, Notes: f.Notes };
        if (isNew) { v["Req ID"] = nextReqId(); API.add("deliveryReqs", v); close(); toast("Role added"); if (after) setTimeout(() => after(v), 260); else location.hash = "#/req/" + encodeURIComponent(v["Req ID"]); }
        else { API.update("deliveryReqs", r, v); close(); toast("Saved"); render(); }
      };
    });
  }

  // ------------------------------------------------------------------ global search
  function gsResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return '<div class="empty">Type a name, company, phone, city, role, BU...</div>';
    const hit = (s) => String(s == null ? "" : s).toLowerCase().includes(q);
    const out = [];
    const D1 = deals().filter((r) => [r.Account, r.Contact, r.Designation, r.City, r.Notes, r["Next Step"], r.Phone, r.Email, r.Source, r["Service Line"]].some(hit)).slice(0, 40);
    if (D1.length) out.push(`<div class="sec"><h2>Pipeline</h2><span class="count">${D1.length}</span></div>` + D1.map((r) =>
      `<div class="card deal gsrow" data-go="#/deal/${encodeURIComponent(r["Deal ID"])}">${tempDot(r.Temperature)}<div class="main"><div class="t1"><span>${esc(r.Account)}</span></div><div class="t2">${esc(r.Contact)}${r.Designation ? " · " + esc(r.Designation) : ""}</div><div class="meta"><span class="chip stage">${esc(r.Stage || "-")}</span>${r.City ? `<span class="chip">${esc(r.City)}</span>` : ""}</div></div></div>`).join(""));
    const A1 = live("accounts").filter((a) => [a.Account, a.Notes, a["Current Stage"], a["AM Owner"]].some(hit)).slice(0, 20);
    if (A1.length) out.push(`<div class="sec"><h2>Clients & logos</h2><span class="count">${A1.length}</span></div>` + A1.map((a) =>
      `<div class="card deal gsrow" data-go="#/clients/${encodeURIComponent(a.Account)}"><div class="main"><div class="t1"><span>${esc(a.Account)}</span></div><div class="t2">${esc(a["Account Type"])} · ${esc(a["Current Stage"])}</div></div></div>`).join(""));
    const C1 = live("contacts").filter((c) => [c.SPOC, c.Client, c.BU, c["S-BU"], c.Role, c.Phone, c.Email, c.City].some(hit)).slice(0, 25);
    if (C1.length) out.push(`<div class="sec"><h2>Client contacts</h2><span class="count">${C1.length}</span></div>` + C1.map((c) =>
      `<div class="card deal"><div class="main"><div class="t1"><span>${esc(c.SPOC)}</span></div><div class="t2">${esc(c.Client)}${c.BU ? " · " + esc(c.BU) : ""}${c.Role ? " · " + esc(c.Role) : ""}</div><div class="acts">${telLink(c.Phone) ? `<a class="btn" href="${telLink(c.Phone)}">Call</a>` : ""}${waLink(c.Phone) ? `<a class="btn" href="${waLink(c.Phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${c.Email ? `<a class="btn" href="mailto:${esc(c.Email)}">Email</a>` : ""}<button class="pri" data-act="ctouch" data-sig='${esc(c._sig)}'>Log</button></div></div></div>`).join(""));
    const L1 = live("leads").filter((l) => [l.Name, l.Organization, l.Designation, l.Event, l.Email, l.Phone, l.Location].some(hit)).slice(0, 25);
    if (L1.length) out.push(`<div class="sec"><h2>Leads</h2><span class="count">${L1.length}</span></div>` + L1.map((l) =>
      `<div class="card deal"><div class="main"><div class="t1"><span>${esc(l.Name)}</span></div><div class="t2">${esc(l.Organization)}${l.Designation ? " · " + esc(l.Designation) : ""}</div><div class="meta"><span class="chip">${esc(l.Event || "")}</span>${l.Response ? `<span class="chip ${l.Response === "Positive" ? "ok" : ""}">${esc(l.Response)}</span>` : ""}</div><div class="acts">${telLink(l.Phone) ? `<a class="btn" href="${telLink(l.Phone)}">Call</a>` : ""}${l.Email ? `<a class="btn" href="mailto:${esc(l.Email)}">Email</a>` : ""}${deals().some((d) => d.Account === l.Organization) ? "" : `<button class="pri" data-act="lead2pipe" data-sig='${esc(l._sig)}'>→ Pipeline</button>`}</div></div></div>`).join(""));
    const DC = live("delivery").filter((c) => [c.Candidate, c.Role, c.Client, c.SPOC, c.Status, c["Notice Period"], c.Notes].some(hit)).slice(0, 25);
    if (DC.length) out.push(`<div class="sec"><h2>Delivery candidates</h2><span class="count">${DC.length}</span></div>` + DC.map(dCandCard).join(""));
    return out.length ? out.join("") : `<div class="empty">Nothing matches "${esc(q)}".</div>`;
  }
  function globalSearch() {
    const html = `<input class="search" id="gq" placeholder="Search deals, contacts, leads, clients..." autocomplete="off" style="width:100%;margin-bottom:8px"><div id="gres"></div>`;
    const { el, close } = sheet("Search", html, (el) => {
      const inp = $("#gq", el), res = $("#gres", el);
      res.innerHTML = gsResults("");
      inp.addEventListener("input", () => { res.innerHTML = gsResults(inp.value); });
      el.addEventListener("click", (e) => {
        const go = e.target.closest(".gsrow[data-go]");
        if (go) { close(); location.hash = go.dataset.go; }
      });
      setTimeout(() => inp.focus(), 250);
    });
  }

  // ------------------------------------------------------------------ shell + router
  function shell() {
    $("#app").innerHTML = `
      <header class="top"><button class="back hidden" id="back" aria-label="Back">‹</button><h1 id="title">Pipeline</h1><button class="iconbtn" id="gsearch" aria-label="Search">${I.search}</button><button class="sync" id="sync"><i class="dot"></i><span id="synctxt"></span></button></header>
      ${B.demo ? '<div style="max-width:860px;margin:10px auto 0;padding:0 12px"><div class="banner"><b>Demo mode</b> - sample data, nothing is saved. Set sheetsUrl in config.js to connect to your Google Sheet.</div></div>' : ""}
      <main id="view"></main>
      <nav class="bottom">
        <a href="#/today" data-nav="today">${I.today}Today</a><a href="#/pipeline" data-nav="pipeline">${I.board}Pipeline</a>
        <button class="fab" data-act="fab" aria-label="Quick add">+</button>
        <a href="#/delivery" data-nav="delivery">${I.req}Delivery</a><a href="#/more" data-nav="more">${I.more}More</a>
      </nav>`;
    $("#back").onclick = () => (history.length > 1 ? history.back() : (location.hash = "#/today"));
    $("#gsearch").onclick = globalSearch;
    $("#sync").onclick = () => { Store.flush().then(() => Store.refresh()); toast("Syncing with the sheet..."); };
  }
  function syncPill() {
    const el = $("#sync"); if (!el) return;
    const ago = S.loadedAt ? Math.round((Date.now() - S.loadedAt) / 60000) : null;
    const map = { synced: ago == null ? "Synced" : ago < 1 ? "Synced" : `Synced ${ago}m`, saving: "Saving", loading: "Loading", pending: `${S.queue.length} pending`, offline: S.queue.length ? `Offline · ${S.queue.length}` : "Offline", error: "Sync issue", idle: "" };
    el.className = "sync " + S.status; $("#synctxt").textContent = map[S.status] || S.status;
  }
  let lastKey = "";
  function render() {
    const h = location.hash.replace(/^#\/?/, "") || "today";
    const [path, qs] = h.split("?"); const [name, arg] = path.split("/");
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    const view = V[name] || V.today;
    let out;
    try { out = view(params, arg); } catch (e) { console.error(e); out = { title: "Error", html: `<div class="card">Something went wrong: ${esc(e.message)}</div>` }; }
    $("#title").textContent = out.title; $("#back").classList.toggle("hidden", !out.back);
    const v = $("#view"); v.innerHTML = out.html; if (out.mount) out.mount(v);
    wireChips(v);
    $$("nav.bottom a").forEach((a) => a.classList.toggle("on", a.dataset.nav === name || (name === "deal" && a.dataset.nav === "pipeline")));
    lastKey = dataKey(); syncPill();
  }
  const dataKey = () => `${S.loadedAt}|${S.queue.length}|${edits}`;
  S.listeners.push(() => {
    syncPill();
    if (dataKey() === lastKey) return;
    const ae = document.activeElement;
    if (ae && $("#view") && $("#view").contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return; // don't disturb typing
    render();
  });
  // Remember which dashboard sections the user collapsed
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.classList && d.classList.contains("secwrap") && d.dataset.seck) { try { localStorage.setItem(d.dataset.seck, d.open ? "1" : "0"); } catch (e2) {} } }, true);
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  window.addEventListener("online", () => { Store.flush(); Store.refresh(true); });
  window.addEventListener("offline", () => { S.status = "offline"; syncPill(); });
  setInterval(syncPill, 30000);

  function loginScreen(err) {
    $("#app").innerHTML = `<div class="login"><img src="icon-192.png" alt=""><h1>Pipeline</h1><p>Growth & Partnerships sales pipeline - your live pipeline.</p>
      <button class="btn" id="signin">Sign in with Microsoft</button>${err ? `<p style="font-size:13px;margin-top:14px">${esc(err)}</p>` : ""}<a href="?demo=1">Try the demo</a></div>`;
    $("#signin").onclick = () => B.signIn();
  }

  async function boot() {
    const acct = await B.init();
    if (!acct) return loginScreen(B.lastAuthError && B.lastAuthError.message);
    shell();
    const cached = Store.bootFromCache();
    if (cached) render(); else $("#view").innerHTML = '<div class="spinner"></div>';
    await Store.refresh(cached);
    render();
    Store.flush();
    setInterval(Store.poll, (C.pollSeconds || 20) * 1000);
    // TickTick two-way: check connection once, then pull immediately on open and whenever
    // the app returns to the foreground (throttled). Pushes happen automatically on edits.
    if (!B.demo) {
      ttRefreshState().then((s) => { if (s.connected) ttAutoPull(true); });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) ttAutoPull(); });
    }
    if (S.status === "error" && !S.tables.pipeline) $("#view").innerHTML = `<div class="card"><b>Couldn't open the workbook.</b><p class="hint">${esc(S.error)}</p><p class="hint">Check the web app is deployed with access = Anyone and sheetsUrl/token match. See SETUP-google.md.</p><button class="btn pri" onclick="location.reload()">Retry</button></div>`;
  }
  window.UI = { toast, render };
  boot();
})();
