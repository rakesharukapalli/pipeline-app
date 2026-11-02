// ============================================================
//  Pipeline app configuration  -  the ONLY file you edit
//  GOOGLE SHEETS mode: no Microsoft, no Azure, no login screen.
// ============================================================
window.APP_CONFIG = {
  // Paste the Apps Script Web app URL here (ends with /exec). From your Google Sheet:
  // Extensions > Apps Script > Deploy > New deployment > Web app.
  sheetsUrl: "https://script.google.com/macros/s/AKfycbxbCIJ2tgZLjyzR-cdC4D5yuLyHA4w3c7UE_n4pxxE9qMGHT2Sja9LTfIDfy8Ro3Kg/exec",

  // Must match TOKEN at the top of Code.gs (already set to match the script I gave you).
  sheetsToken: "caSCmeUz7RxuGkFHA0ncGA4S",

  owner: "Rakesh",
  timeZone: "India Standard Time",
  pollSeconds: 20,
  clientId: ""
};
