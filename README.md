# Lab Inventory — modular version

A web app for running a lab inventory. Each lab builds its own **modules** — antibodies, reagents, cell lines, mice/PDX, protocols, or anything else — and links them to **experiments**. When an experiment draft is saved, the amounts used are subtracted from stock automatically.

**Every lab runs its own copy**, on its own GitHub account and its own Firebase project. No lab can see another lab's data.

Setting it up takes about 30 minutes. Everything happens in the browser. You do not need a terminal or any programming.

---

## How this template works

This repository is a **template**. You do not use it directly.

```
   This template (fatemehahmadi999/lab-inventory-modular)
             │  "Use this template"
             ▼
   Your lab's own copy on GitHub  ──►  online with GitHub Pages
             │  config.js points to
             ▼
   Your lab's own Firebase project  (logins + database)
```

- **Your copy on GitHub** holds the app itself. GitHub Pages puts it online for free.
- **Your Firebase project** holds your lab's data and the user accounts. It belongs to your lab.
- **`config.js`** is the only file you change. It tells your copy which Firebase project to use.

The template itself stays empty: it has no lab data and no Firebase settings.

---

## What you need

- A **GitHub account** (free): <https://github.com/signup>
- A **Google account**, for Firebase (free): <https://accounts.google.com/signup>

---

## Setup — step by step

Do the steps in this order. Each step says what you should see when it worked.

### Step 1 — Make your lab's copy on GitHub

1. Open the template: <https://github.com/fatemehahmadi999/lab-inventory-modular>
2. Click the green **Use this template** button, then **Create a new repository**.
3. Fill in the form:
   - **Owner:** your lab's GitHub organization, if you have one. Otherwise your own account.
   - **Repository name:** for example `smith-lab-inventory`.
   - **Visibility:** **Public**. GitHub Pages is free only for public repositories. This is safe: the repository holds only the app code. Your data lives in Firebase and is protected there.
   - **Include all branches:** leave it off.
4. Click **Create repository**.

**You should see:** your new repository, with the line "generated from fatemehahmadi999/lab-inventory-modular" under its name.

### Step 2 — Create a Firebase project

1. Open the Firebase console: <https://console.firebase.google.com>
2. Click **Create a project** (or **Add project**).
3. Give it a name, for example `smith-lab-inventory`.
4. Google Analytics: you can turn it **off**. The app does not use it.
5. Click **Create project**, wait, then click **Continue**.

**You should see:** the start page of your new project.

### Step 3 — Register the app and copy its settings

1. On the project's start page, click the **web icon** `</>` ("Add an app" → Web).
2. **App nickname:** for example `lab inventory web`.
3. Leave **"Also set up Firebase Hosting"** unchecked.
4. Click **Register app**.
5. Firebase shows a block of code with `const firebaseConfig = { … }`. It has six lines: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
6. Copy these six lines and keep them open. You need them in Step 7. Then click **Continue to console**.

These values are **not secret**. They only tell the app which Firebase project to use. Your data is protected by the security rules in Step 6.

You can find them again later: gear icon → **Project settings** → **General** → scroll to **Your apps**.

### Step 4 — Turn on email login

1. Open **Authentication**: <https://console.firebase.google.com/project/_/authentication/providers>
   (Pick your project if Firebase asks. In the menu it is under **Security** in the newer console, or **Build** in the older one.)
2. If you see **Get started**, click it.
3. On the **Sign-in method** tab, click **Email/Password**.
4. Switch on the first toggle, **Email/Password**. Leave "Email link (passwordless sign-in)" off.
5. Click **Save**.

**You should see:** Email/Password with the status **Enabled**.

### Step 5 — Create the database

1. Open **Firestore**: <https://console.firebase.google.com/project/_/firestore>
2. Click **Create database** and choose:
   - **Edition:** Standard (if asked).
   - **Database ID:** leave it as **(default)**. The app needs this exact name.
   - **Location:** one close to your lab, for example **europe-west3 (Frankfurt)** in Europe. **This cannot be changed later.**
   - **Mode:** **Start in production mode**.
3. Click **Create**.

**You should see:** an empty database page with the tabs **Data**, **Rules**, **Indexes**.

### Step 6 — Paste the security rules

The rules decide who may see and change what. Without them, nobody can use the app.

1. In **your lab's copy** on GitHub, open the file `firestore.rules`.
2. Click **Copy raw file** (the two-squares icon at the top right of the file).
3. In Firebase, open the **Rules** tab of the database.
4. Delete everything in the box, paste the copied rules, and click **Publish**.

**You should see:** the first line is `rules_version = '2';`, and there is no red error.

### Step 7 — Put your Firebase settings into `config.js`

1. In **your lab's copy** on GitHub, open `config.js`.
2. Click the **pencil icon** (Edit this file) at the top right.
3. Change `labName` to your lab's name, for example `labName: 'Smith Lab',`.
4. Replace the line `firebase: null,` with your six values from Step 3, like this:

   ```js
   firebase: {
     apiKey: "AIza…",
     authDomain: "smith-lab-inventory.firebaseapp.com",
     projectId: "smith-lab-inventory",
     storageBucket: "smith-lab-inventory.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   },
   ```

   Keep the comma after the closing `}`.
5. Click **Commit changes…**, then **Commit changes** again.

### Step 8 — Put the app online with GitHub Pages

1. In your lab's copy, click **Settings** → **Pages** (in the left menu).
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
4. Wait 1–2 minutes, then reload the page.

**You should see:** "Your site is live at `https://OWNER.github.io/REPOSITORY/`". This is your lab's address. Save it as a bookmark.

### Step 9 — Allow your address in Firebase

Firebase only accepts logins from addresses you allow.

1. Open **Authentication → Settings → Authorized domains**: <https://console.firebase.google.com/project/_/authentication/settings>
2. Click **Add domain**.
3. Type `OWNER.github.io` — only the domain, without `https://` and without the repository name. For example `smith-lab.github.io`.
4. Click **Add**.

### Step 10 — Become the first admin

Do this **right after Step 9**. Until the lab is set up, the first person who signs up becomes its admin.

1. Open your lab's address from Step 8.
2. Click **Create an account**. Enter your name, email and a password.
3. You see **Set up your lab**. Check the lab name, pick the starter modules you want, and click **Create lab**.

**You should see:** the lab's overview page, with your modules in the left menu. You are now the admin.

### Step 11 — Invite your colleagues

1. In the app, open **People** (under Lab admin).
2. Type a colleague's email, choose a role, and click **Invite**.
3. Send them your lab's address. They:
   1. click **Create an account** and sign up with **exactly the invited email**,
   2. open the confirmation email from Firebase and click the link (check spam),
   3. click **I have confirmed it** in the app.

They are then let in with the role you chose.

| Role | What they can do |
|---|---|
| Admin | Everything: modules, people, lab settings, backups |
| Member | Add and edit items, experiments and projects |
| Viewer | Look only |

People who sign up without an invitation see nothing except a "waiting for access" page.

---

## Optional extras

### File attachments (Firebase Storage)

Without Storage, small attachments (up to about 700 KB) are saved inside the item. For larger files:

1. Open **Storage**: <https://console.firebase.google.com/project/_/storage> and click **Get started**. Firebase asks you to switch to the **Blaze (pay-as-you-go)** plan and add a card. For a lab inventory the cost is usually zero.
2. Open the **Rules** tab of Storage. Paste the content of `storage.rules` from your copy, and click **Publish**.

### Bring over data from the original Lab Inventory

If your lab used the older single-lab Lab Inventory app:

1. In the old app, open the **Backup** tab and click **Download full backup (.json)**.
2. In the new app, open **Lab settings** → **Import from the original Lab Inventory**, choose the file, check the summary, and click **Import**.

The import only reads the file. The old app and its data are not changed. Import only once; importing the same file again creates duplicates.

### Low-stock emails (EmailJS)

The app can email the person who created an experiment when stock drops below its alert level.

1. Create a free account at <https://www.emailjs.com>, add an email service, and create a template using the variables `to_email`, `material_name`, `stock`, `unit`, `location`, `experiment_title`.
2. In `config.js`, replace `emailjs: null,` with your IDs:

   ```js
   emailjs: { serviceId: "service_…", templateId: "template_…", publicKey: "…" },
   ```

---

## Using the app

- **Modules** (admins): add from a template or build your own. For each module you choose its fields, how stock is counted (one amount, counted per part, or none), and whether experiments **reserve from stock**, **link for reference**, or don't use it.
- **Dropdown fields:** users can always add a new choice. Preset choices are optional.
- **Experiments:** saving a draft subtracts the amounts right away. Editing changes only the difference. Deleting lets you return the stock or keep it as used.
- **Backups:** **Lab settings → Download backup** saves everything as one JSON file. Do this at least once a month.

---

## Getting updates from the template

Copies made from a template do **not** update themselves. When the template gets a new version:

1. In your lab's copy, open each changed file (usually in the `js` folder, or `index.html`).
2. Replace its content with the new version from the template.
3. **Never overwrite your `config.js`** — it holds your lab's settings.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| A yellow "Demo mode" banner | `config.js` still says `firebase: null`. Do Step 7 again. |
| "Could not connect" | A typo in `config.js`, often a missing comma or quote. Compare with Step 7. |
| Login fails with "unauthorized domain" | Do Step 9. Add only `OWNER.github.io`. |
| "You do not have permission" | The rules are missing or old. Do Step 6 again. |
| A colleague stays on "Waiting for access" | Invite exactly their sign-up email. They must also confirm their email. |
| Changes don't show after an update | Reload with **Cmd + Shift + R** (Mac) or **Ctrl + Shift + R** (Windows). |

---

## Files

| File | What it is | Do you edit it? |
|---|---|---|
| `index.html` | The app page | No |
| `config.js` | Your lab's settings | **Yes — only this file** |
| `js/` | The app code | No |
| `firestore.rules` | Database security rules | No — paste into Firebase |
| `storage.rules` | File storage security rules | No — paste into Firebase |
| `firebase.json` | Only needed if you use Firebase Hosting | No |
| `Setup guide.docx` | This guide as a Word file | No |
