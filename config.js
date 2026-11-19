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
  workbookUrl: "https://docs.google.com/spreadsheets/d/1b-4vrsjsxR_Sayx1yWJaNKuPEPgvTs1fKG1H1qMI7Yc/edit?gid=1522304945#gid=1522304945",
  timeZone: "India Standard Time",
  pollSeconds: 20,
  clientId: "",
  aiUrl: "https://ifpipeline-ai.rakesharukapalli.workers.dev",
  aiToken: "Navi@1623"
};
