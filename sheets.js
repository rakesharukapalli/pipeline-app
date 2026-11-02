// Backend: Google Sheet via an Apps Script web app. Same interface as the Graph backend,
// so store.js/ui.js don't change. Selected when config.sheetsUrl is set.
(function () {
  const C = window.APP_CONFIG;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class SheetsBackend {
    constructor() {
      this.demo = false;
      this.account = null;
      this.url = C.sheetsUrl;
      this.token = C.sheetsToken || "";
    }
    async init() {
      this.account = { name: "Google Sheet" };
      try { const m = await this.rpc("me"); if (m && m.name) this.account = { name: m.name }; }
      catch (e) { this.lastAuthError = e; /* still allow app to open; refresh will surface errors */ }
      return this.account;
    }
    userName() { return this.account ? this.account.name : ""; }
    signIn() { location.reload(); }
    signOut() { ["pp.cache.v1", "pp.queue.v1", "pp.today.v1"].forEach((k) => localStorage.removeItem(k)); location.reload(); }

    async rpc(action, payload, attempt = 0) {
      if (!navigator.onLine) throw new Error("OFFLINE");
      if (!this.url || /PASTE/.test(this.url)) throw new Error("Google web app URL is not set in config.js");
      let res;
      try {
        res = await fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" }, // text/plain avoids a CORS preflight
          body: JSON.stringify(Object.assign({ action, token: this.token }, payload || {})),
          redirect: "follow",
        });
      } catch (e) { throw new Error("OFFLINE"); }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(1500 * (attempt + 1)); return this.rpc(action, payload, attempt + 1); }
      const txt = await res.text();
      let j;
      try { j = JSON.parse(txt); }
      catch (e) {
        if (/accounts\.google\.com|sign in/i.test(txt)) throw new Error('The web app is not shared with "Anyone". Re-deploy with Who has access = Anyone.');
        throw new Error("Unexpected response from Google - check the web app URL in config.js");
      }
      if (j.error) throw new Error(j.error);
      return j;
    }

    async meta() { return this.rpc("meta"); }                       // {eTag}
    async loadAll() { const j = await this.rpc("load"); return { tables: j.tables, settings: j.settings, lists: j.lists }; }
    async readRange(sheet, a1) { const j = await this.rpc("readRange", { sheet, a1 }); return j.values; }
    async patchCells(sheet, updates) {
      const u = updates.map((x) => ({ addr: x.addr, value: x.value, isDate: !!x.numberFormat }));
      await this.rpc("patch", { sheet, updates: u });
    }
    async writeRow(sheet, table, rowAddrOrNull, headers, valuesByHeader, dateHeaders) {
      const j = await this.rpc("addRow", { sheet, headers, values: valuesByHeader, dateHeaders });
      return j.addr;
    }
    async createTable(sheet, table, headers) { await this.rpc("createTable", { sheet, headers }); }
    async createEvent(ev) {
      const start = ev.start && ev.start.dateTime, end = ev.end && ev.end.dateTime;
      return this.rpc("event", { subject: ev.subject, start, end, body: (ev.body && ev.body.content) || "" });
    }
  }
  window.SheetsBackend = SheetsBackend;
})();
