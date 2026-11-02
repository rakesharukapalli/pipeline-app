// Backend: Microsoft sign-in (MSAL) + Excel workbook via Microsoft Graph.
// A Demo backend with the same interface runs when no clientId is configured or ?demo=1.
(function () {
  const C = window.APP_CONFIG;
  const GRAPH = "https://graph.microsoft.com/v1.0";
  // Personal OneDrive: file addressed by path under /me/drive, and the "Files.ReadWrite"
  // scope (own files) needs no admin consent. Org SharePoint: addressed by drive+item id.
  const PATH_MODE = !!C.workbookPath;
  const SCOPES = ["User.Read", PATH_MODE ? "Files.ReadWrite" : "Files.ReadWrite.All", "Calendars.ReadWrite"];
  const encPath = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const ITEM = PATH_MODE ? `/me/drive/root:/${encPath(C.workbookPath)}` : `/drives/${C.driveId}/items/${C.itemId}`;
  const WB = PATH_MODE ? `${ITEM}:/workbook` : `${ITEM}/workbook`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const encSheet = (s) => encodeURIComponent(s.replace(/'/g, "''"));

  function parseAddress(addr) {
    // "'Clients & Logos'!A3:AE8"  ->  {sheet, c1, r1, c2, r2}
    const i = addr.lastIndexOf("!");
    const sheet = addr.slice(0, i).replace(/^'|'$/g, "").replace(/''/g, "'");
    const m = addr.slice(i + 1).replace(/\$/g, "").match(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/);
    return { sheet, c1: m[1], r1: +m[2], c2: m[3] || m[1], r2: +(m[4] || m[2]) };
  }
  function colLetter(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function colIndex(L) { let n = 0; for (const ch of L) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
  window.XL = { parseAddress, colLetter, colIndex };

  // Excel would treat text starting with = + - @ as a formula; keep it as text.
  function safeVal(v, header) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") {
      if (/phone/i.test(header || "") && v) return "'" + v;
      if (/^[=+\-@]/.test(v)) return "'" + v;
    }
    return v;
  }

  // ---------------------------------------------------------------- Graph backend
  class GraphBackend {
    constructor() {
      this.demo = false;
      const base = location.origin + location.pathname.replace(/index\.html$/, "");
      this.msal = new msal.PublicClientApplication({
        auth: { clientId: C.clientId, authority: `https://login.microsoftonline.com/${C.tenantId || "organizations"}`, redirectUri: base, postLogoutRedirectUri: base },
        cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
      });
      this.account = null;
    }
    async init() {
      try {
        const res = await this.msal.handleRedirectPromise();
        if (res && res.account) this.account = res.account;
      } catch (e) { console.warn("redirect", e); this.lastAuthError = e; }
      if (!this.account) { const all = this.msal.getAllAccounts(); if (all.length) this.account = all[0]; }
      return this.account;
    }
    userName() { return this.account ? (this.account.name || this.account.username) : ""; }
    signIn() { return this.msal.loginRedirect({ scopes: SCOPES, prompt: "select_account" }); }
    signOut() { ["pp.cache.v1","pp.queue.v1","pp.today.v1"].forEach((k) => localStorage.removeItem(k)); return this.msal.logoutRedirect({ account: this.account }); }
    async token() {
      if (!this.account) throw new Error("NOT_SIGNED_IN");
      try {
        const r = await this.msal.acquireTokenSilent({ scopes: SCOPES, account: this.account });
        return r.accessToken;
      } catch (e) {
        if (!navigator.onLine) throw new Error("OFFLINE");
        if (e instanceof msal.InteractionRequiredAuthError) { await this.msal.acquireTokenRedirect({ scopes: SCOPES, account: this.account }); }
        throw e;
      }
    }
    async call(method, url, body, attempt = 0) {
      if (!navigator.onLine) throw new Error("OFFLINE");
      const tok = await this.token();
      let res;
      try {
        res = await fetch(GRAPH + url, {
          method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) { throw new Error("OFFLINE"); }
      if ((res.status === 429 || res.status === 503 || res.status === 504 || res.status === 409) && attempt < 4) {
        const ra = +(res.headers.get("Retry-After") || 0);
        await sleep((ra || 1.5 * (attempt + 1)) * 1000);
        return this.call(method, url, body, attempt + 1);
      }
      const txt = await res.text();
      const json = txt ? JSON.parse(txt) : {};
      if (!res.ok) { const err = new Error((json.error && json.error.message) || res.statusText); err.status = res.status; err.code = json.error && json.error.code; throw err; }
      return json;
    }
    async batch(reqs) {
      const out = {};
      for (let i = 0; i < reqs.length; i += 20) {
        const chunk = reqs.slice(i, i + 20).map((r, k) => ({ id: String(i + k), method: r.method || "GET", url: r.url, body: r.body, headers: r.body ? { "Content-Type": "application/json" } : undefined }));
        const res = await this.call("POST", "/$batch", { requests: chunk });
        for (const r of res.responses) out[r.id] = r;
      }
      return reqs.map((_, i) => out[String(i)]);
    }
    async meta() {
      return this.call("GET", `${ITEM}?$select=eTag,lastModifiedDateTime,lastModifiedBy,webUrl`);
    }
    // tables: {key: {table}}  -> {key: {address, values}} ; settings + lists
    async loadAll(tables) {
      const keys = Object.keys(tables);
      const reqs = keys.map((k) => ({ url: `${WB}/tables/${tables[k].table}/range?$select=address,values` }));
      reqs.push({ url: `${WB}/worksheets('Settings')/range(address='A3:B22')?$select=values` });
      reqs.push({ url: `${WB}/worksheets('Settings')/range(address='E2:AF14')?$select=values` });
      const res = await this.batch(reqs);
      const out = { tables: {}, settings: null, lists: null };
      keys.forEach((k, i) => {
        const r = res[i];
        if (r && r.status === 200) out.tables[k] = { address: r.body.address, values: r.body.values };
        else if (r && r.status === 404) out.tables[k] = null;
        else throw new Error(`Could not read ${tables[k].table}: ${(r && r.body && r.body.error && r.body.error.message) || "error"}`);
      });
      const s = res[keys.length], l = res[keys.length + 1];
      out.settings = s && s.status === 200 ? s.body.values : null;
      out.lists = l && l.status === 200 ? l.body.values : null;
      return out;
    }
    async readRange(sheet, addr) {
      const r = await this.call("GET", `${WB}/worksheets('${encSheet(sheet)}')/range(address='${addr}')?$select=values,address`);
      return r.values;
    }
    // updates: [{addr:"P12", value, header}]
    async patchCells(sheet, updates) {
      const reqs = updates.map((u) => ({
        method: "PATCH", url: `${WB}/worksheets('${encSheet(sheet)}')/range(address='${u.addr}')`,
        body: Object.assign({ values: [[safeVal(u.value, u.header)]] }, u.numberFormat ? { numberFormat: [[u.numberFormat]] } : {}),
      }));
      const res = await this.batch(reqs);
      const bad = res.find((r) => !r || r.status >= 300);
      if (bad) throw new Error("Write failed: " + ((bad.body && bad.body.error && bad.body.error.message) || bad.status));
    }
    // write a full row (input values by header; formula cells come from the first data row's R1C1 template)
    async writeRow(sheet, table, rowAddrOrNull, headers, valuesByHeader, dateHeaders) {
      const t = await this.call("GET", `${WB}/tables/${table}/rows/itemAt(index=0)/range?$select=formulasR1C1`);
      const tpl = t.formulasR1C1[0];
      let addr = rowAddrOrNull;
      if (!addr) {
        const add = await this.call("POST", `${WB}/tables/${table}/rows/add`, { values: [headers.map(() => "")] });
        const rr = await this.call("GET", `${WB}/tables/${table}/rows/itemAt(index=${add.index})/range?$select=address`);
        addr = rr.address.split("!")[1];
      }
      const row = headers.map((h, i) => {
        const f = tpl[i];
        if (typeof f === "string" && f.startsWith("=")) return f;
        const v = valuesByHeader[h];
        return v === undefined ? "" : safeVal(v, h);
      });
      const nf = headers.map((h) => (dateHeaders.includes(h) ? "dd-mmm-yy" : null));
      await this.call("PATCH", `${WB}/worksheets('${encSheet(sheet)}')/range(address='${addr}')`, { formulasR1C1: [row], numberFormat: [nf] });
      return addr;
    }
    async createTable(sheet, table, headers) {
      try { await this.call("POST", `${WB}/worksheets/add`, { name: sheet }); } catch (e) { if (e.status !== 400 && e.code !== "ItemAlreadyExists") throw e; }
      const last = colLetter(headers.length - 1);
      await this.call("PATCH", `${WB}/worksheets('${encSheet(sheet)}')/range(address='A1:${last}1')`, { values: [headers] });
      const t = await this.call("POST", `${WB}/worksheets('${encSheet(sheet)}')/tables/add`, { address: `A1:${last}2`, hasHeaders: true });
      await this.call("PATCH", `${WB}/tables/${t.id}`, { name: table, style: "TableStyleLight9" });
    }
    async createEvent(ev) {
      return this.call("POST", `/me/events`, ev);
    }
  }

  // ---------------------------------------------------------------- Demo backend (in-memory, fictional data)
  class DemoBackend {
    constructor() { this.demo = true; this.account = { name: "Demo user" }; this.etag = 1; this.db = JSON.parse(JSON.stringify(window.DEMO_DATA)); }
    async init() { return this.account; }
    userName() { return "Demo mode"; }
    signIn() { location.reload(); } signOut() { location.href = location.pathname; }
    async meta() { return { eTag: String(this.etag), lastModifiedDateTime: new Date().toISOString(), lastModifiedBy: { user: { displayName: "Demo" } } }; }
    async loadAll(tables) {
      await sleep(250);
      const out = { tables: {}, settings: this.db.settings, lists: this.db.lists };
      for (const k of Object.keys(tables)) out.tables[k] = this.db.tables[k] ? JSON.parse(JSON.stringify(this.db.tables[k])) : null;
      return out;
    }
    _t(sheet) { return Object.values(this.db.tables).find((t) => t && parseAddress(t.address).sheet === sheet); }
    async readRange(sheet, addr) {
      const t = this._t(sheet), a = parseAddress(t.address), m = addr.match(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/);
      const r1 = +m[2] - a.r1, r2 = +(m[4] || m[2]) - a.r1, c1 = colIndex(m[1]), c2 = colIndex(m[3] || m[1]);
      const out = []; for (let r = r1; r <= r2; r++) out.push((t.values[r] || []).slice(c1, c2 + 1)); return out;
    }
    async patchCells(sheet, updates) {
      await sleep(150);
      const t = this._t(sheet), a = parseAddress(t.address);
      for (const u of updates) { const m = u.addr.match(/([A-Z]+)(\d+)/); const r = +m[2] - a.r1; t.values[r][colIndex(m[1])] = u.value; }
      this.etag++;
    }
    async writeRow(sheet, table, rowAddr, headers, vals) {
      await sleep(200);
      const t = this._t(sheet), a = parseAddress(t.address);
      let r;
      if (rowAddr) r = +rowAddr.match(/\d+/)[0] - a.r1;
      else { t.values.push(headers.map(() => "")); r = t.values.length - 1; a.r2++; t.address = `${sheet}!${a.c1}${a.r1}:${a.c2}${a.r2}`; }
      headers.forEach((h, i) => { if (vals[h] !== undefined) t.values[r][i] = vals[h]; });
      this.etag++;
      return `A${a.r1 + r}`;
    }
    async createTable(sheet, table, headers) {
      const key = table === "tblActivity" ? "activity" : table;
      this.db.tables[key] = { address: `${sheet}!A1:${colLetter(headers.length - 1)}2`, values: [headers, headers.map(() => "")] };
    }
    async createEvent(ev) { console.log("demo event", ev); return { id: "demo" }; }
  }

  const forceDemo = /[?&]demo=1/.test(location.search);
  const hasSheets = C.sheetsUrl && !/PASTE/.test(C.sheetsUrl);
  const hasGraph = C.clientId && !C.clientId.startsWith("PASTE");
  window.Backend = forceDemo ? new DemoBackend()
    : hasSheets ? new window.SheetsBackend()
    : hasGraph ? new GraphBackend()
    : new DemoBackend();
})();
