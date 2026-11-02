// ============================================================
//  Pipeline app configuration  -  the ONLY file you edit
// ============================================================
window.APP_CONFIG = {
  // From Entra ID > App registrations > your app > Overview
  clientId: "7909f8f1-eedc-4ad4-89de-d8e38ab28b4f",
  // "Directory (tenant) ID" from the same page (or leave "organizations")
  tenantId: "677a4d2d-6ebe-4fb9-97e0-8d5dd8471b15",

  // Your workbook in SharePoint (RakeshArukapalli site > General >
  // "Sales Pipeline - Growth & Partnerships.xlsx"). Already filled in.
  driveId: "b!NsU4lc4uTEyBnAvmncwyy53ydjJEhZ5Bv_f6u2h0NKvKc4O6iRSUQYEl6Y85d9vX",
  itemId: "01HFQ3MDD3EXWTPE4PRZA2XULUTK6KVRSW",
  workbookUrl: "https://initiatefirst.sharepoint.com/:x:/r/sites/RakeshArukapalli/_layouts/15/Doc.aspx?sourcedoc=%7B37ED257B-8F93-418E-ABD1-749ABCAAC656%7D&action=default",

  owner: "Rakesh",
  timeZone: "India Standard Time",   // Outlook reminders
  pollSeconds: 20                      // how often to check the sheet for changes
};
