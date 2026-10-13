/* ──────────────────────────────────────────────────────────────────────────
   config.js — the ONLY file a lab needs to edit.

   Follow README.md (Step 7) to fill this in for your lab.

   1. labName: your lab's name.
   2. firebase: replace `null` with the six values from YOUR lab's own
      Firebase project (Firebase console → Project settings → Your apps).
   3. emailjs: optional low-stock emails (README → Optional extras).

   While `firebase` is null, the app shows a yellow "Demo mode" banner and
   saves nothing online.
   ────────────────────────────────────────────────────────────────────────── */

window.LAB_CONFIG = {
  // Shown on the sign-in screen before anyone has logged in.
  labName: 'Lab Inventory',

  // Paste your Firebase web app config here, for example:
  // firebase: {
  //   apiKey: "AIza…",
  //   authDomain: "my-lab-inventory.firebaseapp.com",
  //   projectId: "my-lab-inventory",
  //   storageBucket: "my-lab-inventory.firebasestorage.app",
  //   messagingSenderId: "123456789",
  //   appId: "1:123456789:web:abc123"
  // },
  firebase: null,

  // Optional: low-stock emails through EmailJS (https://www.emailjs.com).
  // emailjs: { serviceId: "service_…", templateId: "template_…", publicKey: "…" },
  emailjs: null
};
