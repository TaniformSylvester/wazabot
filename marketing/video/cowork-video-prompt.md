# Prompt for Claude Cowork — WazaBolt tutorial & demo video

Copy everything below the line into Claude Cowork.

---

You are making a finished video, recording included, that shows how to use
**WazaBolt** (www.wazabolt.com), a web app that helps small shops in Cameroon manage
sales, stock, customers, credit, expenses and profit. **You drive the browser, record
it, edit the clips and deliver the final video files.** I only step in when you need
a password or an email confirmation.

## How to record (choose in this order)

**Method A — scripted browser recording (preferred).** Use your code tools:
- Write a Playwright script that opens WazaBolt in Chromium with video recording on
  (`recordVideo`).
- Record **two formats**:
  - **Landscape** for Facebook/YouTube: viewport 1280 × 800.
  - **Vertical** for WhatsApp Status/TikTok: viewport 390 × 844, mobile.
- Make it look human:
  - Use `slowMo` of about 400 ms.
  - Type with a delay of about 60 ms per character.
  - Wait 1.5–2 s after each important click so viewers can follow.
  - Scroll smoothly.
  - Headless recordings don't show a mouse pointer, so inject a visible cursor dot
    and a click ripple into the page.
- Record **one clip per scene**. Then, with ffmpeg:
  - convert the clips to MP4 (H.264, 30 fps)
  - add a short title card before each scene
  - burn in the caption for each scene (white text on a dark band, large enough for a
    phone)
  - join everything into the final videos
- Colours for cards and caption bands:
  - background `#102a2a`
  - green `#16b878`
  - gold `#ffc83d`
  - text `#fffdf8`
- WazaBolt's logo is at `https://www.wazabolt.com/logo/wazabolt-icon-512.png`.

**Method B — if you can't run code or can't reach the site from your tools.** Use
computer use on my computer:
- Start the system screen recorder yourself (Mac: Cmd + Shift + 5 → Record Selected
  Portion; Windows: Win + Alt + R).
- Perform the scenes in my browser, and stop the recorder after each scene.
- Then edit the clips as in Method A if you can, or tell me where the raw recordings
  are.

Before starting, tell me which method you'll use and why.

## Ground rules (follow them strictly)

1. **Passwords and sign-in:** these two accounts are demo accounts with no real data.
   I'll give you their passwords one of two ways, as you prefer:
   - (a) in a file named `wazabolt-video.env` in our shared folder:
     ```
     TUTORIAL_EMAIL=...
     TUTORIAL_PASSWORD=...
     DEMO_EMAIL=...
     DEMO_PASSWORD=...
     ```
   - (b) for Method B, I type them myself when you say "Please sign in now".

   Never write the passwords into captions, scripts, logs or the final video. Password
   fields must appear only as dots.
2. **Accounts:** only use the two accounts below. Never touch my main business account.
3. **Don't change** billing, plans, team members or WhatsApp settings, and don't
   connect WhatsApp. Don't delete anything.
4. **No real people:** use only the invented names and numbers given in this prompt.
5. **When something differs** from what I describe (a button has another name, a page
   looks different, an error appears), stop and tell me. Don't improvise
   work-arounds. If a scene goes wrong, re-record that scene only.
6. The app is in English at `https://www.wazabolt.com/en`. If I ask for a French
   version, use `https://www.wazabolt.com/fr` and the French button names on screen.
7. **Data the scenes create:** Scenes 1–7 create real records in the tutorial account
   (products, a customer, sales, an expense). That's expected. If you need to record a
   scene again, use new names (e.g. "T-Shirt coton 2") rather than deleting anything.

## The two accounts

- **Account A — "Tutorial" (new, empty):**
  - Registered during Scene 1 with the email I give you when we get there (a Gmail
    alias like `myname+tutorial@gmail.com`).
  - Business name: **Boutique Démo Tutoriel**.
- **Account B — "Demo shop" (already full of data):**
  - My demo account, with the business **MJ Fashion Cameroon**: 8 products, 6
    fictional customers, a month of sales.
  - Use it for the dashboard and report scenes, because they look better with data.

## Scenes (Account A first, then Account B)

### Scene 1 — Create an account (Account A)
1. Go to `https://www.wazabolt.com/en/register`.
2. Fill in:
   - **Your name:** "Demo Tutorial"
   - **Business name:** "Boutique Démo Tutoriel"
   - **Email:** the alias I give you
3. **Password:** use `TUTORIAL_PASSWORD` (it shows as dots) or let me type it.
4. Click **Create account**. The page shows **Check your email**. End the clip here.
5. Tell me: "Open the confirmation email and click the link, then tell me." Wait.
   Don't record this part.
6. Start a new clip:
   - Sign in at `https://www.wazabolt.com/en/login` with the tutorial account.
   - The setup guide opens. Show it briefly, then click **Skip for now** to reach the
     dashboard.

### Scene 2 — Add a product with its stock (Account A)
1. Open **Products** in the left menu (on a phone-sized window, open the ☰ menu
   first), then click **New product**.
2. Fill in:
   - **Name:** "T-Shirt coton"
   - **Selling price (FCFA):** 8000
   - **Cost price (FCFA):** 4500
   - **Unit:** piece
   - **Opening stock:** 20
   - **Minimum stock level:** 5
   - **Category:** "Vêtements"
3. Click **Save**.
4. Do the same for a second product:
   - **Name:** "Jeans"
   - **Selling price (FCFA):** 18000
   - **Cost price (FCFA):** 11000
   - **Opening stock:** 8
   - **Minimum stock level:** 3

### Scene 3 — Add stock when goods arrive (Account A)
1. Open the product **T-Shirt coton**. Point out the stock level (20).
2. In the stock panel, set:
   - **Reason:** Purchase
   - **Quantity:** 10
   - **Note (optional):** "Livraison fournisseur"
3. Click **Update stock**.
4. Show that the stock is now **30**, then scroll to the **stock history** to show the
   opening stock and the purchase, each with the reason, date and who did it.

### Scene 4 — Add a customer (Account A)
1. Open **Customers** → **New customer**.
2. Fill in:
   - **Name:** "Awa Exemple"
   - **WhatsApp number:** +237 600 000 001 (an invented number, used only for the demo)
3. Click **Save**.

### Scene 5 — Make a cash sale and print the receipt (Account A)
1. Open **Sales** → **New sale**.
2. Tap **T-Shirt coton** twice (quantity 2). Show the total: **16,000 FCFA**.
3. Leave the customer as walk-in. **Payment method:** Cash.
4. Click **Complete sale**. Show the receipt, then click **Print** and show the print
   preview. Cancel the printing.
5. Go back to the product to show the stock dropped from 30 to **28**.

### Scene 6 — A sale on credit, then the customer pays (Account A)
1. **Sales → New sale**. Add **Jeans** once (18,000 FCFA).
2. Set the payment:
   - **Customer:** Awa Exemple
   - **Payment method:** MTN MoMo
   - **Amount paid now:** 10000
   - **Reference (MoMo, bank):** "MP-DEMO-001"
3. Point out the part shown as credit: **8,000 FCFA**. Click **Complete sale**.
4. Open **Customers** → **Awa Exemple**. Show **Outstanding balance: 8,000 FCFA** and
   the purchase.
5. In **Record a payment**, fill in:
   - **Amount received (FCFA):** 5000
   - **Paid by:** Orange Money
   - **Reference (optional):** "OM-DEMO-002"
6. Click **Record payment**. Show that the balance is now **3,000 FCFA** and the
   payment appears in the history.

### Scene 7 — Record an expense (Account A)
1. Open **Expenses**. In **Add an expense**, fill in:
   - **Category:** Transport
   - **Amount (FCFA):** 2000
   - **Description (optional):** "Taxi marché"
   - **Paid by (optional):** Cash
2. Click **Add an expense**. Show the monthly total.

### Scene 8 — Switch to the demo shop (Account B)
1. Log out of Account A (**Log out** at the bottom of the menu).
2. Sign in to the demo account. Don't show its email address on screen for long; cut
   the login out of the final video if you can.

### Scene 9 — The dashboard (Account B, MJ Fashion Cameroon)
1. Check the top bar shows **MJ Fashion Cameroon**. If not, switch to it in the top
   bar.
2. On the **Dashboard**, slowly show:
   - **Sales today**, **Money received today**, **Estimated profit today** and
     **Owed by customers**
   - **Last 7 days** and **This month**, with expenses and estimated net profit
   - The **Sales, last 30 days** chart
   - **Best sellers this month**
   - **Stock** (low / out of stock), **Customers**, **Needs attention**
   - **Recent sales**

### Scene 10 — Reports and stock alerts (Account B)
1. Open **Reports** and set **Period** to "Last 30 days", then click **Show**. Show:
   - the summary (sales amount, cost of goods sold, gross profit, expenses, net
     profit)
   - the products lists (best-selling, highest sales amount, highest estimated
     profit)
   - **Customers who owe**
   - **Expenses by category**
2. Click one **Download CSV** link to show it downloads.
3. Open **Products** and show the low-stock / out-of-stock products.

### Scene 11 — Closing shot (Account B)
Return to the **Dashboard** and hold still for 5 seconds for the end caption.

## What to give me at the end

Put everything in a folder called `WazaBolt video` in our shared folder:

1. **Final videos (MP4):**
   - `wazabolt-tutorial-landscape.mp4`: all scenes, for Facebook/YouTube.
   - `wazabolt-tutorial-vertical.mp4`: all scenes, phone format.
   - `wazabolt-status-30s.mp4`: a 30-second vertical cut of the 4 strongest moments
     (suggestion: sale → receipt → customer owes → dashboard). Keep it under 30 seconds
     so it fits one WhatsApp Status.
   - **Each video ends with a 4-second end card** using the end card text below.
2. **The raw clips,** one per scene, so I can re-edit.
3. **Voice-over:**
   - If you have a text-to-speech tool, add a French voice-over track to the landscape
     video and also deliver a version without voice.
   - If you don't, deliver the videos with captions only and say so. Don't add music
     unless it's royalty-free and you tell me its source.
4. **Narration script**, one paragraph per scene, in three versions: **French**,
   **English** and **Cameroonian Pidgin**. Use simple, friendly sentences, about
   15–25 seconds of speech per scene.
5. **On-screen captions**: one short line per scene (max 8 words), in French and
   English, e.g. "Ajoutez vos produits et votre stock / Add your products and stock".
6. **Captions for the 30-second Status version.**
7. **End card text:** "WazaBolt — Ventes, stock, clients et crédits au même endroit.
   Gratuit pour commencer · wazabolt.com · WhatsApp +237 651 575 933".
8. **A list of any problems** you noticed during the scenes (slow pages, confusing
   labels, errors), so I can fix them before publishing.

## Honesty rules for the narration

- Describe only what the video shows.
- Say **"estimated profit"**, not "exact profit".
- Payments (MoMo, Orange Money) are **recorded by hand** with their reference;
  WazaBolt does not check them with the operators. Don't say it does.
- The WhatsApp AI assistant is **coming soon**. Don't present it as available.
- Don't invent customer numbers, testimonials or statistics.
