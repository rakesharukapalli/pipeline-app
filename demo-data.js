// Fictional sample data for demo mode only (no real contacts). Dates are relative to today.
(function () {
  const d = new Date();
  const T = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) + 25569;
  const ws = T - ((new Date((T - 25569) * 864e5).getUTCDay() + 6) % 7);
  const H = {
    pipeline: ["Deal ID","Account","Contact","Designation","City","Source","Service Line","Stage","Temperature","Qualified?","Qualified Date","Est. Headcount","Est. Monthly Billing (INR)","Last Contact","Next Step","Next Step Date","Blocker","Notes","Email","Phone","Owner","Probability","Weighted Billing (INR)","Days Since Contact","Follow-up Status","_Open","_Score","_Rank","_NewQ","_NewQSeq","_Act","_ActSeq"],
    accounts: ["Account","Account Type","Current Stage","Next Step","Next Step Date","Empanelment","MSA","Logo Won Date","First Requirement Date","First Resource Deployed Date","Monthly Billing (INR)","Monthly Cost (INR)","Handover Ready?","Brief Complete?","AM Owner","Notes","Gross Margin %","Margin OK?","First Resource Deployed?","Logo Quarter","Days Deployed","Incentive Status","_InProg","_InProgSeq","_Hand","_HandSeq","_LogoY","_LogoYSeq","_LogoQ","_Inc","_IncSeq"],
    meetings: ["Date","Account","Contact","Designation","Decision Maker?","Meeting Type","Status","Outcome / Next Step","Owner","_Held","_HeldSeq","_Up","_UpRank"],
    proposals: ["Date Sent","Account","Type","Scope / Roles","Headcount","Bill Rate (INR/month)","Cost Rate (INR/month)","Gross Margin %","Margin Check","Approval Status","Status","Notes","_OpenP","_OpenPSeq","_Appr","_ApprSeq"],
    requirements: ["Date Received","Account","Role / Skill","Positions","Experience (yrs)","Location","Bill Rate (INR/month)","TA Can Fill?","Profiles Submitted","Interviews","Selected","Status","TA Owner","Notes","Days Open","_OpenR","_OpenRSeq"],
    contracts: ["Account","Agreement","Status","Submitted Date","Owner","Pending Item / Blocker","Signed Date","Days in Review","_Rev","_RevSeq"],
    outreach: ["Week Start (Mon)","Channel","Activities","Responses","Meetings Booked","Notes","Response Rate","Meeting Rate"],
    events: ["Event / Referral","Type","Date","City","Status","Purpose / Target Accounts","Notes","Leads Captured","Opps in Pipeline","_Plan","_PlanSeq"],
    leads: ["Event","Name","Organization","Location","Designation","Response","Comments","Email","Phone","Last Follow-up","Next Step","Next Follow-up","Account in Pipeline?"],
    targets: ["Account","Industry / Segment","Tier","Recommendation","Reason","Your Decision","Owner","Contacts in Pipeline","Open Opps","_Pend","_PendSeq"],
    commitments: ["Stand-up Date","Commitment","Account","Owner","Due Date","Status","_Open","_Rank"],
    intel: ["Date","Account / Market","Insight","Implication","Action / Plan","Type","_Rec","_RecSeq","_Plan","_PlanSeq"],
    contacts: ["SPOC","Client","City","Country","BU","S-BU","Role","Last Follow-up","Next Follow-up","Status","Notes","Email","Phone","SPOC Manager","Comments","Days Since Contact"],
    deliveryReqs: ["Req ID","Client","SPOC","Role","Req Received","Budget","Priority","Status","Notes"],
    delivery: ["Candidate","Req ID","Client","Role","SPOC","Submitted","Status","Last Follow-up","Next Follow-up","Interview Date","Experience (yrs)","Notice Period","Current CTC (LPA)","Expected CTC (LPA)","Notes"],
    activity: ["Date","Deal ID","Account","Contact","Channel","Outcome","Notes","Next Step","Next Step Date","Logged By"],
  };
  const SHEET = { pipeline: "Pipeline", accounts: "Clients & Logos", meetings: "Meetings", proposals: "Proposals & Rates", requirements: "Requirements", contracts: "Contracts", outreach: "Outreach Log", events: "Events & Referrals", leads: "Leads", targets: "Target Accounts", commitments: "Commitments", intel: "Market Intel", contacts: "Client Contacts", deliveryReqs: "Delivery Reqs", delivery: "Delivery", activity: "Activity Log" };
  const obj = (k, o) => H[k].map((h) => (o[h] === undefined ? "" : o[h]));
  const P = (id, a, c, des, city, src, svc, st, tmp, q, qd, hc, bill, lc, ns, nd, blk, notes, ph) =>
    obj("pipeline", { "Deal ID": id, Account: a, Contact: c, Designation: des, City: city, Source: src, "Service Line": svc, Stage: st, Temperature: tmp, "Qualified?": q, "Qualified Date": qd, "Est. Headcount": hc, "Est. Monthly Billing (INR)": bill, "Last Contact": lc, "Next Step": ns, "Next Step Date": nd, Blocker: blk, Notes: notes, Email: c.split(" ")[0].toLowerCase() + "@" + a.split(" ")[0].toLowerCase() + ".example", Phone: ph, Owner: "Demo" });
  const pipeline = [
    P("D-001","Northwind Bank GCC","Asha Menon","VP Engineering","Hyderabad","GCC Leadership Conclave","Contract Staffing","Qualified","Hot","Y",T-6,12,3600000,T-2,"Send rate card for 12 Java devs",T-1,"","Need 12 Java/Spring devs in Q1","9800000001"),
    P("D-002","Contoso Health","Ravi Kumar","Director Procurement","Bengaluru","Procurement Excellence 2026","Contract Staffing","Proposal Sent","Hot","Y",T-20,8,2400000,T-5,"Proposal review call",T,"Rate / margin","Pushing on rates","9800000002"),
    P("D-003","Fabrikam Auto","Neha Shah","Head - Digital","Pune","Direct Outreach","AI / Solutions","Discovery Meeting","Warm","N","","","",T-9,"","","Requirement not defined","Interested in QA automation","9800000003"),
    P("D-004","Tailspin Pharma","Vikram Rao","CPO","Hyderabad","FE GCC Leadership Exchange","BOT / GCC Build","Contact Established","Warm","N","","","",T-12,"Book discovery meeting",T+3,"","","9800000004"),
    P("D-005","Adventure Works","Priya Nair","TA Head","Chennai","LinkedIn","Permanent Hiring","Contacted","Cool","N","","","",T-15,"Follow-up call",T-4,"No response","","9800000005"),
    P("D-006","Wide World Retail","Arjun Das","CTO","Mumbai","Referral","Contract Staffing","Empanelment","Hot","Y",T-35,5,1500000,T-3,"Submit vendor forms",T+2,"MSA / vendor onboarding","Vendor portal access received","9800000006"),
    P("D-007","Litware Systems","Meera Iyer","Engineering Manager","Bengaluru","Cold Call","Contract Staffing","Contact Established","Hot","N","","","",T-1,"","","Need decision maker","Wants profiles for SDET","9800000007"),
    P("D-008","Proseware Finance","Karan Mehta","Director IT","Gurugram","Email Campaign","Managed Services","Nurture","Cool","N","","","",T-40,"Check-in next quarter",T+45,"Timing / next quarter","Budget in April","9800000008"),
    P("D-009","Coho Logistics","Sneha Pillai","Sr Manager Ops","Hyderabad","Procurement Excellence 2026","Managed Services","First Requirement","Warm","Y",T-50,20,4000000,T-7,"Share profiles for 5 roles",T+1,"","First requirement received","9800000009"),
    P("D-010","Blue Yonder Labs","Rahul Verma","Founder","Bengaluru","Direct Outreach","AI / Solutions","Lost","Cold","N","","","",T-60,"","","In-house hiring only","","9800000010"),
  ];
  const tbl = (k, rows) => ({ address: `'${SHEET[k]}'!A3:${"A"}${3 + rows.length}`, values: [H[k]].concat(rows.length ? rows : [H[k].map(() => "")]) });
  const fixAddr = (k, t) => { const n = H[k].length; let s = "", x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } t.address = `'${SHEET[k]}'!A3:${s}${3 + t.values.length - 1}`; return t; };
  const tables = {
    pipeline: pipeline,
    accounts: [obj("accounts", { Account: "Coho Logistics", "Account Type": "Client in Progress", "Current Stage": "First Requirement", "Next Step": "Share profiles", "Next Step Date": T + 1, Empanelment: "Done", MSA: "Signed", "Logo Won Date": T - 20, "First Requirement Date": T - 7, "Handover Ready?": "N", "Brief Complete?": "N" }),
      obj("accounts", { Account: "Wide World Retail", "Account Type": "Client in Progress", "Current Stage": "Empanelment", "Next Step": "Submit vendor forms", "Next Step Date": T + 2, Empanelment: "In progress", MSA: "Drafting", "Handover Ready?": "N", "Brief Complete?": "N" }),
      obj("accounts", { Account: "Graphic Design Inst", "Account Type": "Active Client", "Current Stage": "Active - Billing", "Logo Won Date": T - 80, "First Resource Deployed Date": T - 52, "Monthly Billing (INR)": 900000, "Monthly Cost (INR)": 650000, "Handover Ready?": "Y", "Brief Complete?": "N", Empanelment: "Done", MSA: "Signed" })],
    meetings: [obj("meetings", { Date: T + 1, Account: "Tailspin Pharma", Contact: "Vikram Rao", Designation: "CPO", "Decision Maker?": "Y", "Meeting Type": "Discovery", Status: "Booked", "Outcome / Next Step": "Understand GCC plan" }),
      obj("meetings", { Date: T - 3, Account: "Fabrikam Auto", Contact: "Neha Shah", Designation: "Head - Digital", "Decision Maker?": "Y", "Meeting Type": "Discovery", Status: "Booked", "Outcome / Next Step": "QA automation" }),
      obj("meetings", { Date: T - 8, Account: "Northwind Bank GCC", Contact: "Asha Menon", Designation: "VP Engineering", "Decision Maker?": "Y", "Meeting Type": "Workshop", Status: "Held", "Outcome / Next Step": "12 Java devs, Q1 start" })],
    proposals: [obj("proposals", { "Date Sent": T - 5, Account: "Contoso Health", Type: "Rate Card", "Scope / Roles": "8 QA engineers", Headcount: 8, "Bill Rate (INR/month)": 300000, "Cost Rate (INR/month)": 235000, "Approval Status": "Pending", Status: "Sent" }),
      obj("proposals", { Account: "Northwind Bank GCC", Type: "Rate Card", "Scope / Roles": "12 Java devs", Headcount: 12, "Bill Rate (INR/month)": 300000, "Cost Rate (INR/month)": 210000, "Approval Status": "Not needed", Status: "In preparation" })],
    requirements: [obj("requirements", { "Date Received": T - 7, Account: "Coho Logistics", "Role / Skill": "Ops analysts (24x7)", Positions: 5, Location: "Hyderabad", "TA Can Fill?": "Yes", "Profiles Submitted": 3, Status: "Profiles Submitted" }),
      obj("requirements", { "Date Received": T - 2, Account: "Litware Systems", "Role / Skill": "SDET - Selenium/Java", Positions: 2, Location: "Bengaluru", "TA Can Fill?": "Assessing", Status: "Open" })],
    contracts: [obj("contracts", { Account: "Wide World Retail", Agreement: "MSA", Status: "Legal Review", "Submitted Date": T - 9, Owner: "Demo", "Pending Item / Blocker": "Liability clause" })],
    outreach: [obj("outreach", { "Week Start (Mon)": ws, Channel: "Email", Activities: 42, Responses: 4, "Meetings Booked": 1 }), obj("outreach", { "Week Start (Mon)": ws, Channel: "Cold Call", Activities: 18, Responses: 6, "Meetings Booked": 1 }),
      obj("outreach", { "Week Start (Mon)": ws - 7, Channel: "LinkedIn", Activities: 40, Responses: 9, "Meetings Booked": 2 }), obj("outreach", { "Week Start (Mon)": ws - 7, Channel: "Email", Activities: 95, Responses: 5, "Meetings Booked": 0 })],
    events: [obj("events", { "Event / Referral": "GCC Leadership Conclave", Type: "Conference", Date: T + 20, City: "Hyderabad", Status: "Registered", "Purpose / Target Accounts": "GCC heads" })],
    leads: [obj("leads", { Event: "GCC Leadership Conclave", Name: "Sam Joseph", Organization: "Trey Research", Designation: "Site Head", Response: "Positive", Comments: "BOT interest" })],
    targets: [obj("targets", { Account: "Trey Research", Recommendation: "Add", Reason: "Positive at conclave; BOT" }), obj("targets", { Account: "Blue Yonder Labs", Recommendation: "Drop", Reason: "In-house only" })],
    commitments: [obj("commitments", { "Stand-up Date": T - 1, Commitment: "Close Contoso rate negotiation", Account: "Contoso Health", Owner: "Demo", "Due Date": T + 6, Status: "Committed" })],
    intel: [obj("intel", { Date: T - 4, "Account / Market": "GCCs", Insight: "BOT model in demand", Implication: "Lead with BOT", "Action / Plan": "BOT one-pager", Type: "Intel" }), obj("intel", { Date: T - 4, "Account / Market": "Pharma", Insight: "Budgets reopen in Q1", "Action / Plan": "January re-engagement", Type: "Next-month plan" })],
    contacts: [obj("contacts", { SPOC: "Lena Fox", Client: "Graphic Design Inst", City: "Pune", Country: "India", BU: "R&D", Role: "Engineering Manager", "Last Follow-up": T - 20, Status: "Active", Phone: "9800000099" })],
    deliveryReqs: [
      obj("deliveryReqs", { "Req ID": "R-001", Client: "Coho Logistics", SPOC: "Sam Rao", Role: "Senior Java Developer", "Req Received": T - 20, Budget: "20 LPA", Priority: "High", Status: "Open" }),
      obj("deliveryReqs", { "Req ID": "R-002", Client: "Contoso Health", SPOC: "Ria Shah", Role: "QA Automation (Selenium)", "Req Received": T - 14, Budget: "5 Factor", Priority: "Medium", Status: "Open" }),
      obj("deliveryReqs", { "Req ID": "R-003", Client: "Wide World Retail", SPOC: "Arjun Das", Role: "Data Engineer", "Req Received": T - 40, Budget: "18 LPA", Status: "Filled" })],
    delivery: [
      obj("delivery", { Candidate: "Imran Qureshi", "Req ID": "R-001", Client: "Coho Logistics", Role: "Senior Java Developer", SPOC: "Sam Rao", Submitted: T - 12, Status: "L2 Scheduled", "Next Follow-up": T + 1, "Interview Date": T + 1, "Experience (yrs)": 7, "Notice Period": "30 Days", "Current CTC (LPA)": 14, "Expected CTC (LPA)": 19 }),
      obj("delivery", { Candidate: "Priya Nel", "Req ID": "R-001", Client: "Coho Logistics", Role: "Senior Java Developer", SPOC: "Sam Rao", Submitted: T - 10, Status: "L1 FB Pending", "Next Follow-up": T - 1, "Experience (yrs)": 6, "Notice Period": "Immediate", "Current CTC (LPA)": 12, "Expected CTC (LPA)": 17 }),
      obj("delivery", { Candidate: "Rohan Mehta", "Req ID": "R-001", Client: "Coho Logistics", Role: "Senior Java Developer", SPOC: "Sam Rao", Submitted: T - 9, Status: "Screen Reject", "Experience (yrs)": 5, Notes: "CTC too high" }),
      obj("delivery", { Candidate: "Lata Sinha", "Req ID": "R-002", Client: "Contoso Health", Role: "QA Automation (Selenium)", SPOC: "Ria Shah", Submitted: T - 8, Status: "Final Select", "Next Follow-up": T + 2, "Experience (yrs)": 8, "Notice Period": "60 Days", "Current CTC (LPA)": 16, "Expected CTC (LPA)": 22 }),
      obj("delivery", { Candidate: "Dev Anand", "Req ID": "R-002", Client: "Contoso Health", Role: "QA Automation (Selenium)", SPOC: "Ria Shah", Submitted: T - 6, Status: "On Hold", "Next Follow-up": T + 4, "Experience (yrs)": 4 }),
      obj("delivery", { Candidate: "Nisha Varma", "Req ID": "R-003", Client: "Wide World Retail", Role: "Data Engineer", SPOC: "Arjun Das", Submitted: T - 35, Status: "Joined", "Experience (yrs)": 9, "Current CTC (LPA)": 18, "Expected CTC (LPA)": 24 })],
    activity: [obj("activity", { Date: T - 2, "Deal ID": "D-001", Account: "Northwind Bank GCC", Contact: "Asha Menon", Channel: "Call", Outcome: "Requirement shared", Notes: "12 Java devs, Q1", "Next Step": "Send rate card", "Next Step Date": T - 1, "Logged By": "Demo" })],
  };
  const out = {};
  for (const k of Object.keys(tables)) out[k] = fixAddr(k, tbl(k, tables[k]));
  const q = Math.ceil(((new Date((T - 25569) * 864e5)).getUTCMonth() + 1) / 3);
  const yr = new Date((T - 25569) * 864e5).getUTCFullYear();
  const qs = Math.floor(Date.UTC(yr, (q - 1) * 3, 1) / 864e5) + 25569, qe = Math.floor(Date.UTC(yr, q * 3, 0) / 864e5) + 25569;
  const settings = [["", ""], ["", T], ["", 0.25], ["", 2], ["", 60], ["", 15], ["", 14], ["", 100], ["", 50], ["", 50], ["", 4], ["", ws], ["", qs], ["", qe], ["", "Q" + q], ["", ""], ["", ""], ["", ""], ["", ""], ["", q]];
  const lists = [["Stage","StageProb","Temp","TempScore","Service","Source","Blocker","YN","MeetType","MeetStatus","PropType","Approval","PropStatus","TAFill","ReqStatus","Agreement","ContractStatus","Channel","EventType","EventStatus","AcctType","AcctStage","Decision","CommitStatus","ContactStatus","Response","IntelType","Progress"]];
  const L = {
    Stage: ["Contacted","Contact Established","Discovery Meeting","Qualified","Proposal Sent","Empanelment","MSA / Contracting","First Requirement","Won - Deployed","Nurture","Lost"], StageProb: [0.05,0.1,0.2,0.3,0.45,0.6,0.75,0.9,1,0.03,0],
    Temp: ["Hot","Warm","Cool","Cold"], TempScore: [30,15,5,0], Service: ["Contract Staffing","Permanent Hiring","BOT / GCC Build","Managed Services","AI / Solutions"],
    Source: ["Direct Outreach","Referral","LinkedIn","Cold Call","Email Campaign","Inbound","Partner","GCC Leadership Conclave","Procurement Excellence 2026","FE GCC Leadership Exchange","Nasscom Technology Conference"],
    Blocker: ["","No response","Need decision maker","Requirement not defined","Timing / next quarter","Budget freeze","No current opportunity","In-house hiring only","MSA / vendor onboarding","Rate / margin","Competition"],
    YN: ["Y","N"], MeetType: ["Discovery","Workshop","In-person","Follow-up","Proposal Review","Negotiation","QBR"], MeetStatus: ["Booked","Held","To confirm","Cancelled","No-show"],
    PropType: ["Proposal","Rate Card","Capability Note","BOT Proposition","SOW"], Approval: ["Not needed","Pending","Approved","Rejected"], PropStatus: ["In preparation","Sent","Under review","Accepted","Lost"],
    TAFill: ["Yes","Partial","No","Assessing"], ReqStatus: ["Open","Profiles Submitted","Interviewing","Filled","On Hold","Closed - Lost"], Agreement: ["Empanelment / Vendor Registration","NDA","MSA","SOW","Rate Card Agreement"],
    ContractStatus: ["Drafting","With Client","Legal Review","Finance Review","Signed","On Hold"], Channel: ["Email","Cold Call","LinkedIn","Referral","Event"], EventType: ["Conference","Referral","Webinar","Roundtable","Partner"],
    EventStatus: ["Planned","Registered","Done","Dropped"], AcctType: ["Client in Progress","Active Client","Handed over to AM"], AcctStage: ["Meeting","Empanelment","MSA","First Requirement","First Resource Deployed","Active - Billing","Active - Account Mining"],
    Decision: ["Keep","Add","Drop","Review"], CommitStatus: ["Proposed","Committed","Done","Slipped"], ContactStatus: ["Active","No demand","No response","On hold","Inactive"], Response: ["Positive","Neutral","Negative"], IntelType: ["Intel","Next-month plan"], Progress: ["Not started","In progress","Done","To confirm","NA"],
  };
  for (let r = 0; r < 12; r++) lists.push(lists[0].map((n) => (L[n][r] === undefined ? "" : L[n][r])));
  window.DEMO_DATA = { tables: out, settings, lists };
})();
