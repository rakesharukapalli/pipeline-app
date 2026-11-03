// UI: screens, sheets and sales workflows.
(function () {
  const { S, D, deal, setting, isNum } = Store;
  const C = window.APP_CONFIG;
  const B = window.Backend;
  let edits = 0;
  const API = new Proxy(Store.API, { get: (o, k) => (...a) => { edits++; const r = o[k](...a); return r; } });

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
  function phones(p) { return String(p || "").split(/[\/,;]| or /).map((x) => x.replace(/[^\d+]/g, "")).filter((x) => x.replace(/\D/g, "").length >= 8); }
  function telLink(p) { const a = phones(p)[0]; return a ? "tel:" + a : ""; }
  function waLink(p) { let a = (phones(p)[0] || "").replace(/\D/g, ""); if (!a) return ""; if (a.length === 10) a = "91" + a; return "https://wa.me/" + a; }
  function liLink(name, org) { return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(((name || "") + " " + (org || "")).trim()); }
  const rows = (t) => (S.tables[t] ? S.tables[t].rows : []);
  const hasData = (t, r) => (S.tables[t] ? S.tables[t].headers.filter((h) => !Store.isCalc(h)).some((h) => r[h] !== "" && r[h] != null) : false);
  const live = (t) => rows(t).filter((r) => hasData(t, r));
  const deals = () => live("pipeline").filter((r) => r.Account);
  const dealById = (id) => deals().find((r) => r["Deal ID"] === id);
  const L = (n) => S.lists[n] || [];
  const tempDot = (t) => `<i class="dotT ${esc(t)}"></i>`;
  function followChip(f, date) {
    const cls = { Overdue: "bad", "Due today": "warn", "No next step": "warn", "This week": "ok", Scheduled: "", Closed: "" }[f] || "";
    const txt = f === "Overdue" ? "Overdue · " + D.fmt(date) : f === "This week" || f === "Scheduled" ? D.fmt(date) : f;
    return f ? `<span class="chip ${cls}">${esc(txt)}</span>` : "";
  }
  const nextDealId = () => { const n = deals().map((r) => +(String(r["Deal ID"] || "").match(/\d+/) || [0])[0]); return "D-" + String(Math.max(0, ...n) + 1).padStart(3, "0"); };

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
  };

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
    const iso = D.toISO(dateSerial); const [h, m] = (time || "10:00").split(":").map(Number);
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
          <button class="pri" data-act="log" data-id="${esc(r["Deal ID"])}">Log touch</button>
          ${telLink(r.Phone) ? `<button data-act="call" data-id="${esc(r["Deal ID"])}">Call</button>` : ""}
          <button data-act="snooze" data-id="${esc(r["Deal ID"])}">Snooze</button>
        </div>`}
      </div></div>`;
  }
  function section(title, items, cls = "", emptyMsg) {
    if (!items.length && !emptyMsg) return "";
    return `<div class="sec ${cls}"><h2>${esc(title)}</h2><span class="count">${items.length}</span></div>${items.length ? items.join("") : `<div class="empty">${esc(emptyMsg)}</div>`}`;
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

  V.today = () => {
    const t = today();
    const ds = deals().map((r) => ({ r, x: deal(r) }));
    const actionable = ds.filter(({ r, x }) => x.open || r.Stage === "Nurture");
    const overdue = actionable.filter(({ x }) => x.follow === "Overdue").sort((a, b) => (b.x.score - a.x.score));
    const dueToday = actionable.filter(({ x }) => x.follow === "Due today").sort((a, b) => b.x.score - a.x.score);
    const noNext = ds.filter(({ r, x }) => x.open && x.follow === "No next step" && (r.Temperature === "Hot" || r.Temperature === "Warm")).sort((a, b) => b.x.score - a.x.score);
    const week = ds.filter(({ x }) => x.open && x.follow === "This week").sort((a, b) => a.r["Next Step Date"] - b.r["Next Step Date"]);
    const ms = live("meetings");
    const upcoming = ms.filter((m) => isNum(m.Date) && m.Date >= t && m.Date <= t + 7 && ["Booked", "To confirm"].includes(m.Status)).sort((a, b) => a.Date - b.Date);
    const closeOut = ms.filter((m) => isNum(m.Date) && m.Date < t && ["Booked", "To confirm"].includes(m.Status));
    const commits = live("commitments").filter((c) => ["Proposed", "Committed"].includes(c.Status)).sort((a, b) => (a["Due Date"] || 9e9) - (b["Due Date"] || 9e9));
    const mm = setting("MarginMin", 0.25);
    const approvals = live("proposals").filter((p) => { const g = gm(p["Bill Rate (INR/month)"], p["Cost Rate (INR/month)"]); return g !== null && g < mm && !["Approved", "Rejected"].includes(p["Approval Status"]); });
    const incDays = setting("IncentiveDays", 60), warn = setting("IncentiveWarn", 15);
    const inc = live("accounts").filter((a) => isNum(a["First Resource Deployed Date"]) && t - a["First Resource Deployed Date"] >= incDays - warn && t - a["First Resource Deployed Date"] <= incDays + 30);
    const clients = live("accounts").filter((a) => a["Account Type"] === "Client in Progress" && (!isNum(a["Next Step Date"]) || a["Next Step Date"] <= t));
    const agenda = agendaKey();
    const hot = ds.filter(({ r, x }) => x.open && r.Temperature === "Hot").length;
    const out = outreachWeek(D.weekStart(t));
    const callsTarget = setting("T_Call", 50), emailT = setting("T_Email", 100), liT = setting("T_LinkedIn", 50);
    const hr = new Date().getHours();
    const html = `
      <div class="hello"><div><div class="sub">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h2>Good ${hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"}${C.owner ? ", " + esc(C.owner) : ""}</h2></div></div>
      <a class="agenda" href="#/standup">${I.stand}<div><div style="font-size:12px;color:var(--ink-3)">Stand-up focus this week</div><b>${esc(AGENDA[agenda].title)}</b></div></a>
      <div class="kpis">
        <button class="kpi" data-go="#/pipeline"><div class="v">${ds.filter((d) => d.x.open).length}</div><div class="l">Open deals</div></button>
        <button class="kpi" data-go="#/pipeline?temp=Hot"><div class="v">${hot}</div><div class="l">Hot</div></button>
        <button class="kpi ${overdue.length ? "bad" : ""}" data-scroll="sec-over"><div class="v">${overdue.length}</div><div class="l">Overdue</div></button>
        <button class="kpi ${noNext.length ? "warn" : ""}" data-scroll="sec-nonext"><div class="v">${noNext.length}</div><div class="l">No next step</div></button>
      </div>
      <div class="card" data-go="#/outreach" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center"><b>Outreach this week</b><span class="chip">${Math.round(100 * (out.Email.a + out["Cold Call"].a + out.LinkedIn.a) / Math.max(1, emailT + callsTarget + liT))}% of target</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;font-size:13px">
          ${[["Email", emailT], ["Cold Call", callsTarget], ["LinkedIn", liT]].map(([c, tg]) => `<div><div style="color:var(--ink-3)">${c === "Cold Call" ? "Calls" : c}</div><b>${out[c].a}</b> / ${tg}<div class="bar"><i style="width:${Math.min(100, (100 * out[c].a) / Math.max(1, tg))}%"></i></div></div>`).join("")}
        </div></div>
      <div id="sec-over">${section("Overdue follow-ups", overdue.map((d) => dealCard(d.r)), "bad")}</div>
      ${section("Due today", dueToday.map((d) => dealCard(d.r)), "warn")}
      ${section("Meetings - next 7 days", upcoming.map(meetCard))}
      ${section("Meetings to close out", closeOut.map(meetCard), "warn")}
      <div id="sec-nonext">${section("Hot & warm - no next step", noNext.map((d) => dealCard(d.r)), "warn")}</div>
      ${section("Clients in progress - needs a next step", clients.map(accCard), "warn")}
      ${section("Coming up this week", week.map((d) => dealCard(d.r)))}
      ${section("Your commitments", commits.slice(0, 5).map(commitCard))}
      ${section("Needs your approval (below margin)", approvals.map(propCard), "bad")}
      ${section("Logo incentive watch", inc.map(accCard))}
      ${!overdue.length && !dueToday.length && !noNext.length && !upcoming.length ? '<div class="card" style="text-align:center">Nothing urgent. Good time to prospect - open <a href="#/outreach">Outreach</a>.</div>' : ""}`;
    return { title: "Today", html };
  };

  // ---------------- PIPELINE board
  const pstate = { q: "", temp: "", view: "board", closed: false };
  V.pipeline = (params) => {
    if (params.temp != null) pstate.temp = params.temp;
    const stages = L("Stage").filter((s) => pstate.closed || !["Nurture", "Lost"].includes(s));
    const html = `
      <div class="toolbar">
        <input class="search" id="pq" placeholder="Search account, contact, notes..." value="${esc(pstate.q)}">
        <div class="seg" id="pview"><button data-v="board" class="${pstate.view === "board" ? "on" : ""}">Board</button><button data-v="list" class="${pstate.view === "list" ? "on" : ""}">List</button></div>
      </div>
      <div class="toolbar">
        <div class="seg" id="ptemp">${["", "Hot", "Warm", "Cool", "Cold"].map((t) => `<button data-v="${t}" class="${pstate.temp === t ? "on" : ""}">${t || "All"}</button>`).join("")}</div>
        <div class="seg" id="pclosed"><button class="${pstate.closed ? "on" : ""}">Nurture & lost</button></div>
      </div>
      <div id="pbody">${pipeBody(stages)}</div>`;
    return {
      title: "Pipeline", html, mount: (el) => {
        $("#pq", el).addEventListener("input", (e) => { pstate.q = e.target.value; $("#pbody", el).innerHTML = pipeBody(stages); });
        $("#pview", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { pstate.view = b.dataset.v; render(); } };
        $("#ptemp", el).onclick = (e) => { const b = e.target.closest("button"); if (b) { pstate.temp = b.dataset.v; history.replaceState(null, "", "#/pipeline"); render(); } };
        $("#pclosed", el).onclick = () => { pstate.closed = !pstate.closed; render(); };
        wireDnD(el);
      },
    };
  };
  function filtered() {
    const q = pstate.q.toLowerCase();
    return deals().filter((r) => (!pstate.temp || r.Temperature === pstate.temp) &&
      (!q || [r.Account, r.Contact, r.Designation, r.Notes, r["Next Step"], r.City, r.Source].join(" ").toLowerCase().includes(q)) &&
      (pstate.closed || !["Nurture", "Lost"].includes(r.Stage)));
  }
  function pipeBody(stages) {
    const ds = filtered();
    if (pstate.view === "list") {
      const s = ds.map((r) => ({ r, x: deal(r) })).sort((a, b) => b.x.score - a.x.score);
      return s.length ? s.map((d) => dealCard(d.r, { noActs: true })).join("") : '<div class="empty">No deals match.</div>';
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
    if (st === "Qualified" && r["Qualified?"] !== "Y") { ch["Qualified?"] = "Y"; if (!isNum(r["Qualified Date"])) ch["Qualified Date"] = today(); }
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
    const tl = [...acts.map((a) => ({ d: a.Date, h: `<b>${esc(a.Channel)}</b> · ${esc(a.Outcome)}`, s: [a.Notes, a["Next Step"] ? "Next: " + a["Next Step"] + (isNum(a["Next Step Date"]) ? " (" + D.fmt(a["Next Step Date"], { abs: 1 }) + ")" : "") : ""].filter(Boolean).join(" - ") })),
      ...ms.map((m) => ({ d: m.Date, h: `<b>Meeting</b> · ${esc(m.Status)}${m["Decision Maker?"] === "Y" ? " · DM" : ""}`, s: m["Outcome / Next Step"] }))]
      .sort((a, b) => (b.d || 0) - (a.d || 0));
    const others = deals().filter((o) => o.Account === r.Account && o["Deal ID"] !== r["Deal ID"]);
    const acc = live("accounts").find((a) => a.Account === r.Account);
    const tel = telLink(r.Phone), wa = waLink(r.Phone);
    const html = `
      <div class="hero"><h2>${esc(r.Account)}</h2><div class="sub">${esc(r.Contact)}${r.Designation ? " · " + esc(r.Designation) : ""}${r.City ? " · " + esc(r.City) : ""}</div>
        <div class="chips"><span class="chip">${esc(r.Stage)}</span><span class="chip">${esc(r.Temperature || "-")}</span>${r["Qualified?"] === "Y" && r.Stage !== "Qualified" ? '<span class="chip">Qualified</span>' : ""}<span class="chip">${esc(r["Service Line"] || "")}</span>${x.days != null ? `<span class="chip">Last touch ${x.days}d ago</span>` : ""}</div></div>
      <div class="quick">
        <a class="${tel ? "" : "dis"}" href="${tel || "#"}" data-act="call" data-id="${esc(r["Deal ID"])}">${I.call}Call</a>
        <a class="${wa ? "" : "dis"}" href="${wa || "#"}" target="_blank" rel="noopener" data-act="wa" data-id="${esc(r["Deal ID"])}">${I.wa}WhatsApp</a>
        <a class="${r.Email ? "" : "dis"}" href="mailto:${esc(r.Email)}" data-act="mail" data-id="${esc(r["Deal ID"])}">${I.mail}Email</a>
        <a href="${liLink(r.Contact, r.Account)}" target="_blank" rel="noopener">${I.li}LinkedIn</a>
        <button data-act="log" data-id="${esc(r["Deal ID"])}">${I.log}Log</button>
      </div>
      <div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div><div style="font-size:12px;color:var(--ink-3)">NEXT STEP</div><div style="font-weight:650;margin-top:2px">${esc(r["Next Step"] || "No next step set")}</div>
        <div style="margin-top:6px">${followChip(x.follow, r["Next Step Date"])} ${r.Blocker ? `<span class="chip">Blocker: ${esc(r.Blocker)}</span>` : ""}</div></div>
        <button class="btn" data-act="snooze" data-id="${esc(r["Deal ID"])}">Reschedule</button></div></div>
      <div class="card"><div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">STAGE</div>
        <div class="stepper">${stages.map((s, i) => `<button data-act="stage" data-id="${esc(r["Deal ID"])}" data-v="${esc(s)}" class="${s === r.Stage ? "on" : i < si && si < 9 ? "done" : ""}">${esc(s)}</button>`).join("")}</div>
        <div style="font-size:12px;color:var(--ink-3);margin:8px 0 6px">TEMPERATURE</div>
        ${chips("temp", L("Temp"), r.Temperature)}
      </div>
      <div class="acts" style="margin:0 0 10px;flex-wrap:wrap">
        <button data-act="newmeeting" data-id="${esc(r["Deal ID"])}">${"Book meeting"}</button>
        <button data-act="newprop" data-id="${esc(r["Deal ID"])}">Proposal / rate card</button>
        <button data-act="newreq" data-id="${esc(r["Deal ID"])}">Requirement</button>
        <button data-act="edit" data-id="${esc(r["Deal ID"])}">Edit details</button>
      </div>
      <div class="card"><div class="kv">
        <div>Source</div><div>${esc(r.Source)}</div>
        <div>Est. headcount</div><div>${esc(r["Est. Headcount"] || "-")}</div>
        <div>Est. billing</div><div>${fmtL(r["Est. Monthly Billing (INR)"]) || "-"}${r["Est. Monthly Billing (INR)"] ? " / month" : ""}</div>
        <div>Phone</div><div>${esc(r.Phone || "-")}</div>
        <div>Email</div><div style="word-break:break-all">${esc(r.Email || "-")}</div>
        <div>Notes</div><div>${esc(r.Notes || "-")}</div>
      </div></div>
      ${acc ? `<div class="card deal" data-go="#/clients/${encodeURIComponent(acc.Account)}"><div class="main"><div class="t1">Client account: ${esc(acc.Account)}</div><div class="t2">${esc(acc["Current Stage"])} · ${esc(acc["Next Step"] || "")}</div></div></div>` : ""}
      <div class="sec"><h2>Timeline</h2><span class="count">${tl.length}</span></div>
      <div class="card">${tl.length ? `<div class="tl">${tl.map((i) => `<div class="it"><div class="d">${esc(D.fmt(i.d, { abs: 1, year: 1 }))}</div><div>${i.h}</div>${i.s ? `<div style="font-size:13px;color:var(--ink-2)">${esc(i.s)}</div>` : ""}</div>`).join("")}</div>` : '<div class="empty">No activity logged in the app yet. Earlier history is in Notes.</div>'}</div>
      ${others.length ? `<div class="sec"><h2>Other contacts at ${esc(r.Account)}</h2><span class="count">${others.length}</span></div>${others.map((o) => dealCard(o, { noActs: true })).join("")}` : ""}`;
    return {
      title: r.Account, back: true, html, mount: (el) => {
        wireChips(el);
        const on = $(".stepper .on", el); if (on) on.parentElement.scrollLeft = on.offsetLeft - 20;
        const g = $('.chips[data-name="temp"]', el);
        g.addEventListener("pick", (e) => { if (e.detail) { API.update("pipeline", r, { Temperature: e.detail }); toast("Temperature: " + e.detail); } });
      },
    };
  };

  // ---------------- LOG TOUCH
  const OUTCOMES = ["No answer", "Connected", "Replied", "Meeting booked", "Requirement shared", "Call back later", "Not interested"];
  const NEXT_SUGGEST = ["Follow-up call", "Send capability deck", "Send rate card", "Share profiles", "Book meeting", "Proposal follow-up", "Check-in next quarter"];
  const CH_MAP = { Call: "Cold Call", WhatsApp: "Cold Call", Email: "Email", LinkedIn: "LinkedIn" };
  function logTouch(r, preset = {}) {
    const html = `
      <div class="f"><label>Channel</label>${chips("ch", ["Call", "WhatsApp", "Email", "LinkedIn", "Meeting"], preset.ch || "Call")}</div>
      <div class="f"><label>Outcome</label>${chips("oc", OUTCOMES, preset.oc || "")}</div>
      <div id="mtgbox" class="hidden"><div class="f2">${field("Meeting date", "mdate", "", "date")}${field("Time", "mtime", "11:00", "time")}</div>
        <div class="f"><label>With decision maker?</label>${chips("mdm", ["Y", "N"], "Y")}</div></div>
      ${field("Notes", "notes", "", "textarea", 'placeholder="What happened? Need, timeline, budget, who decides..."')}
      <div class="f"><label>Next step</label><input name="next" value="${esc(r["Next Step"] || "")}" list="nsugg" placeholder="e.g. Send rate card"></div>
      ${datalist("nsugg", NEXT_SUGGEST)}
      <div class="chips" style="margin:-4px 0 10px" id="nchips">${NEXT_SUGGEST.slice(0, 5).map((s) => `<button type="button" class="pick" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      <div class="f"><label>Next step date</label>${dateChips("ndate", "")}</div>
      <div class="f"><label>Temperature</label>${chips("temp", L("Temp"), r.Temperature)}</div>
      ${select("Stage", "stage", L("Stage"), r.Stage, false)}
      <div class="toggle"><div><b>Outlook reminder</b><div class="hint">Adds a 15-min event on the next-step date</div></div><input type="checkbox" name="cal" ${localStorage.getItem("pp.cal") === "0" ? "" : "checked"}></div>
      ${field("Reminder time", "rtime", "10:00", "time")}
      <button class="btn pri block" id="save">Save</button>`;
    sheet(`Log touch · ${r.Contact}`, html, (el, close) => {
      wireDateChips(el);
      $("#nchips", el).onclick = (e) => { const b = e.target.closest(".pick"); if (b) $('[name="next"]', el).value = b.dataset.s; };
      const ocG = $('.chips[data-name="oc"]', el);
      ocG.addEventListener("pick", (e) => {
        const v = e.detail;
        $("#mtgbox", el).classList.toggle("hidden", v !== "Meeting booked");
        const st = $('[name="stage"]', el);
        const order = L("Stage");
        const lvl = (s) => order.indexOf(s);
        if (v === "Not interested") st.value = "Nurture";
        else if (v === "Requirement shared" && lvl(r.Stage) < lvl("Qualified")) st.value = "Qualified";
        else if (["Connected", "Replied", "Meeting booked", "Call back later"].includes(v) && r.Stage === "Contacted") st.value = "Contact Established";
        else st.value = r.Stage;
        if (v === "Meeting booked" && !$('[name="next"]', el).value) $('[name="next"]', el).value = "Meeting";
      });
      $("#save", el).onclick = () => {
        const f = form(el); const ch = chipVal(el, "ch") || "Call"; const oc = chipVal(el, "oc");
        if (!oc) return toast("Pick an outcome", "warn");
        const t = today();
        let nd = f.ndate;
        if (oc === "Meeting booked" && isNum(f.mdate) && !nd) nd = f.mdate;
        const temp = chipVal(el, "temp") || r.Temperature;
        const stamp = D.toJS(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
        const noteLine = `${stamp}: ${ch} - ${oc}${f.notes ? " - " + f.notes : ""}`;
        const changes = { "Last Contact": t, "Next Step": f.next, "Next Step Date": nd || "", Temperature: temp, Stage: f.stage, Notes: (noteLine + (r.Notes ? " | " + r.Notes : "")).slice(0, 1500) };
        if (f.stage === "Qualified" && r["Qualified?"] !== "Y") { changes["Qualified?"] = "Y"; if (!isNum(r["Qualified Date"])) changes["Qualified Date"] = t; }
        if (oc === "Not interested" || (f.stage !== r.Stage && f.stage !== "Contact Established")) { /* keep blocker */ }
        API.add("activity", { Date: t, "Deal ID": r["Deal ID"], Account: r.Account, Contact: r.Contact, Channel: ch, Outcome: oc, Notes: f.notes, "Next Step": f.next, "Next Step Date": nd || "", "Logged By": C.owner || "" });
        API.update("pipeline", r, changes);
        const oc_ch = CH_MAP[ch];
        if (oc_ch) {
          API.inc(oc_ch, "Activities", 1);
          if (!["No answer"].includes(oc)) API.inc(oc_ch, "Responses", 1);
          if (oc === "Meeting booked") API.inc(oc_ch, "Meetings Booked", 1);
        }
        if (oc === "Meeting booked" && isNum(f.mdate)) {
          API.add("meetings", { Date: f.mdate, Account: r.Account, Contact: r.Contact, Designation: r.Designation, "Decision Maker?": chipVal(el, "mdm") || "N", "Meeting Type": "Discovery", Status: "Booked", "Outcome / Next Step": f.notes || f.next, Owner: C.owner });
          if (f.cal) API.event(reminderEvent(`Meeting: ${r.Contact} (${r.Account})`, f.mdate, f.mtime, contactBlock(r), 45));
        } else if (f.cal && isNum(nd)) {
          API.event(reminderEvent(`${f.next || "Follow-up"}: ${r.Contact} (${r.Account})`, nd, f.rtime, contactBlock(r)));
        }
        localStorage.setItem("pp.cal", f.cal ? "1" : "0");
        close(); toast("Logged · " + r.Account); render();
      };
    });
  }

  function snooze(r) {
    const t = today();
    const opts = [["Tomorrow", D.addBiz(t, 1)], ["In 3 days", D.addBiz(t, 3)], ["Next Monday", D.nextMonday(t)], ["In 1 week", t + 7], ["In 2 weeks", t + 14], ["In 1 month", t + 30]];
    sheet(`Reschedule · ${r.Account}`, `<div class="list">${opts.map(([l, v]) => `<div class="li" data-d="${v}"><div class="main"><b>${l}</b></div><span class="chip">${D.fmt(v, { abs: 1 })}</span></div>`).join("")}</div>
      ${field("Or pick a date", "d", "", "date")}<button class="btn pri block" id="ok">Set date</button>`, (el, close) => {
      const set = (v) => { API.update("pipeline", r, { "Next Step Date": v }); close(); toast("Next step → " + D.fmt(v, { abs: 1 })); render(); };
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
    const isNew = !r; r = r || Object.assign({ Stage: "Contacted", Temperature: "Warm", "Service Line": "Contract Staffing", Source: "Direct Outreach", "Qualified?": "N" }, preset);
    const html = `
      ${field("Account *", "Account", r.Account, "text", 'list="accts" autocomplete="off"')}${datalist("accts", deals().map((d) => d.Account).concat(live("targets").map((t) => t.Account)))}
      <div class="f2">${field("Contact *", "Contact", r.Contact)}${field("Designation", "Designation", r.Designation)}</div>
      <div class="f2">${field("Phone", "Phone", r.Phone, "tel")}${field("Email", "Email", r.Email, "email")}</div>
      <div class="f2">${field("City", "City", r.City)}${select("Source", "Source", L("Source"), r.Source)}</div>
      <div class="f2">${select("Service line", "Service Line", L("Service"), r["Service Line"])}${select("Stage", "Stage", L("Stage"), r.Stage, false)}</div>
      <div class="f"><label>Temperature</label>${chips("Temperature", L("Temp"), r.Temperature)}</div>
      <div class="f2">${select("Qualified?", "Qualified?", ["Y", "N"], r["Qualified?"])}${select("Blocker", "Blocker", L("Blocker"), r.Blocker)}</div>
      <div class="f2">${field("Est. headcount", "Est. Headcount", r["Est. Headcount"], "number", 'inputmode="numeric"')}${field("Est. billing (₹ lakhs / month)", "billL", isNum(r["Est. Monthly Billing (INR)"]) ? r["Est. Monthly Billing (INR)"] / 1e5 : "", "number", 'step="0.1" inputmode="decimal"')}</div>
      ${field("Next step", "Next Step", r["Next Step"])}
      <div class="f"><label>Next step date</label>${dateChips("Next Step Date", r["Next Step Date"])}</div>
      ${field("Notes", "Notes", r.Notes, "textarea")}
      <button class="btn pri block" id="save">${isNew ? "Add to pipeline" : "Save changes"}</button>`;
    sheet(isNew ? "New opportunity" : "Edit " + r.Contact, html, (el, close) => {
      wireDateChips(el);
      $("#save", el).onclick = () => {
        const f = form(el);
        if (!f.Account || !f.Contact) return toast("Account and contact are required", "warn");
        const v = { Account: f.Account, Contact: f.Contact, Designation: f.Designation, Phone: f.Phone, Email: f.Email, City: f.City, Source: f.Source,
          "Service Line": f["Service Line"], Stage: f.Stage, Temperature: chipVal(el, "Temperature"), "Qualified?": f["Qualified?"], Blocker: f.Blocker,
          "Est. Headcount": f["Est. Headcount"], "Est. Monthly Billing (INR)": f.billL === "" ? "" : Math.round(f.billL * 1e5), "Next Step": f["Next Step"], "Next Step Date": f["Next Step Date"], Notes: f.Notes };
        if (v["Qualified?"] === "Y" && !isNum(r["Qualified Date"])) v["Qualified Date"] = today();
        if (isNew) { v["Deal ID"] = nextDealId(); v.Owner = C.owner; v["Last Contact"] = preset["Last Contact"] || ""; API.add("pipeline", v); close(); toast("Added " + v.Account); location.hash = "#/deal/" + encodeURIComponent(v["Deal ID"]); }
        else { API.update("pipeline", r, v); close(); toast("Saved"); render(); }
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
        <div class="toggle"><div><b>Also add to pipeline</b><div class="hint">Creates an opportunity with this event as source</div></div><input type="checkbox" name="topipe"></div>
        <button class="btn pri block" id="saveLead">Save lead</button></div>
      ${section("Recent leads", recent.map((l) => `<div class="card deal"><div class="main"><div class="t1"><span>${esc(l.Name)}</span></div><div class="t2">${esc(l.Organization)}${l.Designation ? " · " + esc(l.Designation) : ""}</div>
        <div class="meta"><span class="chip">${esc(l.Event)}</span>${l.Response ? `<span class="chip ${l.Response === "Positive" ? "ok" : ""}">${esc(l.Response)}</span>` : ""}${deals().some((d) => d.Account === l.Organization) ? '<span class="chip stage">In pipeline</span>' : `<button class="btn" data-act="lead2pipe" data-sig='${esc(l._sig)}'>→ Pipeline</button>`}</div></div></div>`))}`,
      mount: (el) => {
        wireChips(el);
        $("#saveLead", el).onclick = () => {
          const f = form(el); if (!f.Name || !f.Organization) return toast("Name and organization are required", "warn");
          const v = { Event: f.Event, Name: f.Name, Organization: f.Organization, Location: f.Location, Designation: f.Designation, Response: chipVal(el, "resp"), Comments: f.Comments, Email: f.Email, Phone: f.Phone, "Last Follow-up": today() };
          API.add("leads", v); localStorage.setItem("pp.lastEvent", f.Event);
          if (f.topipe) API.add("pipeline", { "Deal ID": nextDealId(), Account: f.Organization, Contact: f.Name, Designation: f.Designation, City: f.Location, Source: f.Event, "Service Line": "Contract Staffing", Stage: "Contact Established", Temperature: v.Response === "Positive" ? "Warm" : "Cool", "Qualified?": "N", "Last Contact": today(), "Next Step": "Follow up after event", "Next Step Date": D.addBiz(today(), 2), Notes: f.Comments, Email: f.Email, Phone: f.Phone, Owner: C.owner });
          toast("Lead saved"); render();
        };
        $("#scan", el).onchange = (e) => scanCard(e.target.files[0], el);
      } };
  };
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
      <button class="btn pri block" id="save">Save</button>`, (el, close) => {
      wireDateChips(el);
      $("#save", el).onclick = () => { const f = form(el); if (!f.cm) return toast("Write the commitment", "warn");
        const v = { "Stand-up Date": c["Stand-up Date"], Commitment: f.cm, Account: f.acc, Owner: c.Owner || C.owner, "Due Date": f.due, Status: chipVal(el, "st") };
        if (isNew) API.add("commitments", v); else API.update("commitments", c, v); close(); toast("Saved"); render(); };
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
      const newQ = ds.filter(({ r }) => r["Qualified?"] === "Y" && isNum(r["Qualified Date"]) && r["Qualified Date"] >= t - nw);
      const top = ds.filter((d) => !newQ.includes(d)).sort((a, b) => b.x.score - a.x.score).slice(0, 8);
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
        { t: "Pipeline", q: "New qualified opportunities, top deals and what blocks each", h:
          `<div style="display:flex;gap:20px;margin-bottom:8px"><div><div class="big-n">${ds.length}</div><div class="hint">open</div></div><div><div class="big-n">${ds.filter((d) => d.r["Qualified?"] === "Y").length}</div><div class="hint">qualified</div></div><div><div class="big-n">${newQ.length}</div><div class="hint">new qualified (${nw}d)</div></div></div>
          ${newQ.map(({ r }) => row(`🆕 ${esc(r.Account)} - ${esc(r.Contact)}`, esc(r["Next Step"] || ""), dl(r))).join("")}
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
    return cs.filter((c) => !q || [c.SPOC, c.Client, c.BU, c["S-BU"], c.Role].join(" ").toLowerCase().includes(q)).map((c) => `<div class="card deal"><div class="main">
      <div class="t1"><span>${esc(c.SPOC)}</span></div><div class="t2">${esc(c.Client)} · ${esc(c.BU || "")}${c["S-BU"] ? " / " + esc(c["S-BU"]) : ""} · ${esc(c.Role || "")}</div>
      ${c.Notes ? `<div class="t3">${esc(c.Notes)}</div>` : ""}
      <div class="meta"><span class="chip">${esc(c.Status || "-")}</span>${isNum(c["Last Follow-up"]) ? `<span class="chip">Last ${D.fmt(c["Last Follow-up"], { abs: 1 })}</span>` : ""}</div>
      <div class="acts">${telLink(c.Phone) ? `<a class="btn" href="${telLink(c.Phone)}">Call</a>` : ""}${waLink(c.Phone) ? `<a class="btn" href="${waLink(c.Phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${c.Email ? `<a class="btn" href="mailto:${esc(c.Email)}">Email</a>` : ""}<button class="pri" data-act="ctouch" data-sig='${esc(c._sig)}'>Log</button></div></div></div>`).join("") || '<div class="empty">No contacts</div>';
  }
  function contactTouch(c) {
    sheet("Log · " + c.SPOC, `<div class="f"><label>Channel</label>${chips("ch", ["Call", "WhatsApp", "Email", "LinkedIn", "Meeting"], "Call")}</div>
      <div class="f"><label>Status</label>${chips("st", L("ContactStatus"), c.Status)}</div>${field("Notes", "notes", "", "textarea")}
      <div class="f"><label>Next follow-up</label>${dateChips("nf", "")}</div><button class="btn pri block" id="save">Save</button>`, (el, close) => {
      wireDateChips(el);
      $("#save", el).onclick = () => {
        const f = form(el); const ch = chipVal(el, "ch"); const t = today();
        API.update("contacts", c, { "Last Follow-up": t, "Next Follow-up": f.nf || "", Status: chipVal(el, "st"), Notes: f.notes || c.Notes });
        API.add("activity", { Date: t, "Deal ID": "", Account: c.Client, Contact: c.SPOC, Channel: ch, Outcome: chipVal(el, "st"), Notes: f.notes, "Next Step": "", "Next Step Date": f.nf || "", "Logged By": C.owner });
        if (CH_MAP[ch]) API.inc(CH_MAP[ch], "Activities", 1);
        close(); toast("Logged"); render();
      };
    });
  }

  // ---------------- MORE + SETTINGS
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
  V.more = () => {
    const tiles = [["#/standup", I.stand, "Stand-up", "This week's agenda as slides"], ["#/meetings", I.cal, "Meetings", "Book, close out, DM meetings"], ["#/leads", I.lead, "Leads & events", "Quick-add, scan cards"],
      ["#/proposals", I.rupee, "Proposals & rates", "GM% and approvals"], ["#/reqs", I.req, "Requirements & logos", "TA fill, logos, 60-day incentive"], ["#/commitments", I.flag, "Commitments", "Top 3 for the fortnight"],
      ["#/contacts", I.people, "Client contacts", "Broadcom, Mouritech, UWorld..."], ["#/settings", I.sync, "Sync & settings", "Status, theme, sign out"]];
    return { title: "More", html: `<div class="grid">${tiles.map(([h, ic, t, s]) => `<a class="tile" href="${h}">${ic}<b>${t}</b><span>${s}</span></a>`).join("")}
      <a class="tile" href="${esc(C.workbookUrl)}" target="_blank" rel="noopener">${I.xl}<b>Open the sheet</b><span>Excel for the web</span></a>
      <button class="tile" data-act="newdeal">${I.target}<b>New opportunity</b><span>Add to pipeline</span></button></div>` };
  };
  V.settings = () => {
    const st = { synced: "All changes saved", saving: "Saving...", loading: "Loading...", pending: "Changes waiting to sync", offline: "Offline - changes are queued", error: "Sync problem", idle: "" }[S.status] || S.status;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return { title: "Sync & settings", back: true, html: `
      <div class="card"><div class="kv"><div>Signed in</div><div>${esc(B.userName())}</div><div>Status</div><div>${esc(st)}${S.error ? `<div class="hint" style="color:var(--bad)">${esc(S.error)}</div>` : ""}</div>
      <div>Waiting to sync</div><div>${S.queue.length} change(s)</div><div>Last loaded</div><div>${S.loadedAt ? new Date(S.loadedAt).toLocaleString("en-GB") : "-"}</div>
      <div>Last edited by</div><div>${esc(S.lastWriteBy || "-")}</div></div>
      <div class="acts"><button class="pri" data-act="syncnow">Sync now</button>${S.queue.length ? '<button class="danger" data-act="dropq">Discard queued changes</button>' : ""}</div></div>
      <div class="card"><b>Theme</b><div style="margin-top:8px">${chips("theme", [["", "Auto"], ["light", "Light"], ["dark", "Dark"]], localStorage.getItem("pp.theme") || "")}</div></div>
      <div class="card"><b>Install on your phone</b><div class="hint" style="margin-top:6px">${isIOS ? "Safari: tap Share → Add to Home Screen." : "Chrome: menu ⋮ → Install app (or Add to Home screen)."}</div>${installEvt ? '<button class="btn pri" data-act="install" style="margin-top:8px">Install now</button>' : ""}</div>
      <div class="card"><b>Targets & thresholds</b><div class="hint">Edit them in the Settings tab of the workbook - the app picks them up automatically.</div>
        <div class="kv" style="margin-top:8px"><div>Margin threshold</div><div>${pct(setting("MarginMin", 0.25))}</div><div>Logos / quarter</div><div>${setting("LogoTarget", 2)}</div><div>Weekly emails / calls / LinkedIn</div><div>${setting("T_Email", 100)} / ${setting("T_Call", 50)} / ${setting("T_LinkedIn", 50)}</div><div>Meetings / week</div><div>${setting("T_Meetings", 4)}</div></div></div>
      ${B.demo ? "" : '<button class="btn block danger" data-act="signout">Sign out</button>'}`,
      mount: (el) => { $('.chips[data-name="theme"]', el).addEventListener("pick", (e) => { const v = e.detail; if (v) { localStorage.setItem("pp.theme", v); document.documentElement.setAttribute("data-theme", v); } else { localStorage.removeItem("pp.theme"); document.documentElement.removeAttribute("data-theme"); } }); } };
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
        case "tdec": { const t = live("targets").find((x) => x.Account === a.dataset.n); if (t) { API.update("targets", t, { "Your Decision": a.dataset.v }); toast(t.Account + ": " + a.dataset.v); render(); } return; }
        case "ctouch": { const c = bySig("contacts", sig); return c && contactTouch(c); }
        case "syncnow": Store.flush().then(() => Store.refresh()); return toast("Syncing...");
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
      <div class="li" data-q="deal">${I.target}<div class="main"><b>New opportunity</b></div></div>
      <div class="li" data-q="meet">${I.cal}<div class="main"><b>Book a meeting</b></div></div>
      <div class="li" data-q="lead">${I.lead}<div class="main"><b>Event lead / scan card</b></div></div>
      <div class="li" data-q="prop">${I.rupee}<div class="main"><b>Proposal / rate card</b></div></div>
      <div class="li" data-q="req">${I.req}<div class="main"><b>Requirement</b></div></div>
      <div class="li" data-q="commit">${I.flag}<div class="main"><b>Commitment</b></div></div></div>`, (el, close) => {
      $(".list", el).onclick = (e) => { const li = e.target.closest(".li"); if (!li) return; close(); setTimeout(() => ({ log: pickDeal, deal: () => dealForm(null), meet: () => meetingForm(null), lead: () => (location.hash = "#/leads"), prop: () => propForm(null), req: () => reqForm(null), commit: () => commitForm(null) })[li.dataset.q](), 260); };
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
        <a href="#/outreach" data-nav="outreach">${I.out}Outreach</a><a href="#/more" data-nav="more">${I.more}More</a>
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
    if (S.status === "error" && !S.tables.pipeline) $("#view").innerHTML = `<div class="card"><b>Couldn't open the workbook.</b><p class="hint">${esc(S.error)}</p><p class="hint">Check the web app is deployed with access = Anyone and sheetsUrl/token match. See SETUP-google.md.</p><button class="btn pri" onclick="location.reload()">Retry</button></div>`;
  }
  window.UI = { toast, render };
  boot();
})();
