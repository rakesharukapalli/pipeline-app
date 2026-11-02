# Pipeline app – setup guide (about 20 minutes, ₹0)

The app is a website that you install on your phone. It signs in with your InitiateFirst Microsoft account, then reads and writes **Sales Pipeline - Growth & Partnerships.xlsx** in your SharePoint site (General folder) through Microsoft Graph.

- **Your data stays in SharePoint.** The app's code holds no data.
- **Hosting is free** on GitHub Pages.
- **Microsoft sign-in is free**: you create an app registration in Entra ID.

Before you start, try the demo on your laptop: open `index.html?demo=1` once it's hosted (step 2). The demo uses made-up companies and saves nothing.

---

## Step 1 – Check whether you can register an app yourself (2 min)

1. Go to **https://entra.microsoft.com** (or portal.azure.com) and sign in with your InitiateFirst account.
2. In the left menu, choose **Applications → App registrations → + New registration**.
   - **If the form opens:** you can do this yourself. Close it and continue with Step 2.
   - **If you see "You do not have access" or the button is greyed out:** IT has to do Step 3. Send them the message at the end of this guide, then carry on with Step 2.

## Step 2 – Put the app on GitHub Pages (7 min)

1. Create a free account at **https://github.com** if you don't have one.
2. Click **+ → New repository**:
   - Name: `pipeline-app`
   - Visibility: **Public**. GitHub Pages is free for public repos. The code contains no customer data, and the IDs in `config.js` aren't secrets.
   - Click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Unzip `pipeline-app.zip` on your laptop. Drag **everything inside the folder** into the browser: `index.html`, `manifest.webmanifest`, `sw.js`, and the `css`, `js` and `icons` folders.
5. Click **Commit changes**.
6. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then click **Save**.
7. Wait about a minute and refresh. Your app address appears at the top, like:
   **`https://YOUR-GITHUB-NAME.github.io/pipeline-app/`**
   Copy it **including the slash at the end**.

## Step 3 – Register the app in Microsoft Entra (5 min)

1. In **Entra → App registrations → + New registration**, fill in:
   - **Name:** `Pipeline App`
   - **Supported account types:** *Accounts in this organizational directory only (single tenant)*
   - **Redirect URI:** choose platform **Single-page application (SPA)** and paste the address from step 2.7 (with the trailing `/`)
   - Click **Register**.
2. On the **Overview** page, copy two values:
   - **Application (client) ID**
   - **Directory (tenant) ID**
3. Go to **API permissions → + Add a permission → Microsoft Graph → Delegated permissions** and tick:
   - `User.Read` (usually already there)
   - `Files.ReadWrite.All`, which lets the app read and write the workbook as you
   - `Calendars.ReadWrite`, which lets it create Outlook reminders
   - Then click **Add permissions**.
4. If you're an admin, also click **Grant admin consent**. Otherwise skip this; you'll be asked to consent at first sign-in.

There's no client secret and nothing to pay for. The app only ever acts as you, with your own SharePoint permissions.

## Step 4 – Connect the app to your registration (2 min)

1. In GitHub, open `js/config.js` and click the **pencil** (Edit).
2. Replace `PASTE-APPLICATION-CLIENT-ID-HERE` with the **client ID**.
3. Replace `organizations` with the **tenant ID**.
4. Click **Commit changes** and wait about a minute for GitHub Pages to update.

The workbook's location (driveId and itemId) is already filled in.

## Step 5 – Sign in and install on your phone (3 min)

1. On your phone, open the app address from step 2.7.
2. Tap **Sign in with Microsoft**, choose your InitiateFirst account, and accept the permissions.
3. Install it:
   - **Android (Chrome):** tap ⋮ → **Install app** (or *Add to Home screen*).
   - **iPhone (Safari):** tap **Share → Add to Home Screen**.
4. Open it from the home-screen icon. It runs full-screen like a normal app.

On the first sign-in, the app adds an **Activity Log** sheet to the workbook. This is where every call, email and meeting you log is recorded.

## Step 6 – Troubleshooting

| You see | Fix |
|---|---|
| `AADSTS50011` redirect URI mismatch | The Redirect URI in Entra must match the app address exactly, including `https://` and the trailing `/`. |
| "Need admin approval" at sign-in | Your tenant blocks user consent. Send IT the message below. |
| "Couldn't open the workbook" | The file was moved, renamed or replaced. Tell Claude the new location and it will update `driveId`/`itemId` in `config.js`. |
| Changes made in Excel don't show yet | Excel for the web autosaves within a few seconds, and the app checks every 20 seconds. Tap the sync pill at the top to refresh now. |
| "Row changed in the sheet – edit skipped" | Someone edited or sorted that row in Excel at the same moment. The app reloaded the latest data, so redo your edit. |
| Orange "pending" pill | You were offline. Changes are queued on the phone and sync automatically when you're back online. |

## Rules that keep the app and sheet in step

- **Don't rename** the sheets, the tables (`tblPipeline`, `tblMeetings`…) or the column headers. The app finds data by these names.
- **Sorting, filtering, adding rows and adding new columns at the end are all fine.**
- **Targets and thresholds** (margin %, logos per quarter, weekly outreach targets) live in the workbook's **Settings** tab. Change them there and the app picks them up.
- **Deal IDs** (D-001…) identify each opportunity. Keep them unique.

---

## Message for IT (only if Step 1 or 5 was blocked)

> Subject: App registration request – Pipeline app (SharePoint Excel, delegated only)
>
> Hi team, I've built a small internal web app (hosted on GitHub Pages) that updates my sales pipeline workbook in my SharePoint site through Microsoft Graph. Could you please:
>
> 1. Create an app registration named **Pipeline App** – single tenant, platform **Single-page application**, Redirect URI: `https://YOUR-GITHUB-NAME.github.io/pipeline-app/`
> 2. Add Microsoft Graph **delegated** permissions: User.Read, Files.ReadWrite.All, Calendars.ReadWrite – and grant admin consent.
> 3. Send me the Application (client) ID and Directory (tenant) ID.
>
> It uses delegated permissions only (no client secret, no application permissions), so it can only access what I can already access. Thanks!
