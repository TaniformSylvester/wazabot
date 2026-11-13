/*
 * The public site says what WazaBolt is today (Product Documentation,
 * 12 Nov 2026): business management software for shops, restaurants and
 * schools; the WhatsApp AI assistant labelled "coming soon" wherever it
 * appears; WhatsApp usable without Meta; the core business types in the menu
 * and on the home page; the Terms for the current plans; the generator's
 * trial invitation. In English and French. Plain HTTP, no browser.
 *
 *   APP_URL=http://localhost:3000 node tests/e2e/site-copy.e2e.mjs
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};
/** The page's visible text (scripts, styles and tags removed, entities decoded). */
const text = async (path) => {
  const html = await (await fetch(`${APP}${path}`)).text();
  const body = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  return {
    html,
    text: body
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;| | /g, " ")
      .replace(/\s+/g, " "),
  };
};

(async () => {
  try {
    // ------------------------------------------------------------ home
    const { text: home, html: homeHtml } = await text("/en");
    ok("home: positioned as business management software for shops, restaurants and schools", /Run your shop, restaurant or school/.test(home) && /business management software that works in your browser/.test(home), home.slice(0, 300));
    ok("home: the AI assistant is coming soon, never presented as live", /A WhatsApp AI assistant is coming soon/.test(home) && /AI assistant · coming soon/.test(home) && /Coming soon: the AI assistant/.test(home) && !/AI Business Assistant on WhatsApp/.test(home) && !/its AI assistant answers customer questions/.test(home));
    ok("home: shops, restaurants and schools as three cards, with 10 free kitchen and 30 free teacher accounts", /data-testid="core-verticals"/.test(homeHtml) && /Shops &amp; boutiques|Shops & boutiques/.test(home) && /up to 10 free kitchen accounts/.test(home) && /up to 30 free teacher accounts/.test(home));
    ok("home: the menu has Shops, Restaurants and Schools", /href="\/en\/solutions\/retail"[^>]*>Shops</.test(homeHtml) && /href="\/en\/solutions\/restaurants"[^>]*>Restaurants</.test(homeHtml) && /href="\/en\/schools"[^>]*>Schools</.test(homeHtml));
    ok("home: the contact phone is +237 651 57 59 33, the company is registered (RCCM)", /\+237 651 57 59 33/.test(home) && /RCCM RC\/BDA\/2026\/A\/000590/.test(home) && /WazaBolt ENTERPRISE, Bamenda, Cameroon \(RCCM RC\/BDA\/2026\/A\/000590\)/.test(home) && !/SYLVESTER WANKA TANIFORM/.test(home) && /Mawa Hotel Junction, opposite Mawa Hotel, Mile 6 Nkwen, Bamenda III, Cameroon/.test(home) && !/675 12 98 68/.test(home));
    ok("home: contact@wazabolt.com in the footer", /contact@wazabolt\.com/.test(home));
    ok("home: Facebook and Instagram in the footer", /facebook\.com\/profile\.php\?id=61594928852496/.test(homeHtml) && /instagram\.com\/wazabolt/.test(homeHtml));
    const { text: homeFr } = await text("/fr");
    ok("home (fr): the same positioning, the assistant « bientôt »", /Gérez votre boutique, votre restaurant ou votre école/.test(homeFr) && /Un assistant IA WhatsApp arrive bientôt/.test(homeFr) && /Assistant IA · bientôt disponible/.test(homeFr) && /Boutiques/.test(homeFr) && /Écoles/.test(homeFr));

    // ------------------------------------------------------------ the schools page has a way back
    for (const [locale, label] of [["en", "WazaBolt home"], ["fr", "Accueil WazaBolt"]]) {
      const { html: schools } = await text(`/${locale}/schools`);
      ok(`schools (${locale}): the school menu links back to the WazaBolt home page`, new RegExp(`aria-label="${label}"[^>]*data-testid="school-main-site" href="/${locale}">`).test(schools));
    }

    // ------------------------------------------------------------ the company, named the same way everywhere
    const company = /WazaBolt ENTERPRISE, Bamenda, Cameroon \(RCCM RC\/BDA\/2026\/A\/000590\)/;
    for (const path of ["/en/contact", "/fr/contact", "/en/terms", "/fr/terms", "/en/privacy", "/fr/privacy"]) {
      const { text: page } = await text(path);
      ok(`${path}: the company as "WazaBolt ENTERPRISE, Bamenda, Cameroon (RCCM …)", with the Mawa Hotel address`, company.test(page) && /Mawa Hotel Junction, opposite Mawa Hotel, Mile 6 Nkwen, Bamenda III, Cameroon/.test(page) && /\+237 651 57 59 33/.test(page) && !/SYLVESTER WANKA TANIFORM/.test(page));
    }

    // ------------------------------------------------------------ the verticals' pages
    const { text: resto } = await text("/en/solutions/restaurants");
    ok("restaurants: kitchen screen with up to 10 free kitchen accounts, tables and open bills", /kitchen screen/.test(resto) && /Up to 10 free kitchen accounts/.test(resto) && /Open bills per table/.test(resto));
    const { text: schoolPage } = await text("/en/schools");
    ok("schools: 30 free teachers who never see fees, marks lock once published, report cards sent on WhatsApp, balances", /30 free teacher accounts|Up to 30 teachers/.test(schoolPage) && /never see(s)? fees/.test(schoolPage) && /marks lock once published/.test(schoolPage) && /sent to parents on WhatsApp|send them to parents on WhatsApp/.test(schoolPage) && /balance/.test(schoolPage));

    // ------------------------------------------------------------ how it works
    const { text: how } = await text("/en/how-it-works");
    ok("how it works: no Meta approval to start; connecting a number (Phone Number ID, WABA ID, access token) adds the team inbox", /no Meta approval needed to start/.test(how) && /Without connecting a number/.test(how) && /Phone Number ID, WhatsApp Business Account ID and access token/.test(how) && /shared team inbox/.test(how) && /stored encrypted/.test(how));
    ok("how it works: the AI sections are labelled coming soon", /is coming soon and not yet available\. It will need a connected number\. No customer conversation is sent to an AI provider today/.test(how) && /Coming soon: the AI assistant/.test(how) && /the AI assistant is not available yet/.test(how));
    const { text: howFr } = await text("/fr/how-it-works");
    ok("how it works (fr): « sans validation de Meta », the two ways", /Aucune validation de Meta|aucune validation de Meta/.test(howFr) && /Sans connecter de numéro/.test(howFr) && /Avec votre numéro WhatsApp Business connecté/.test(howFr));

    // ------------------------------------------------------------ FAQ: payments by hand
    // The answers open in place (an accordion) and are in the page's FAQ data for search engines.
    const { html: faq } = await text("/en/faq");
    ok("FAQ: till payments recorded by hand; plans switched on by hand, usually the same day; read-only after the trial", /recorded by your team/.test(faq) && /switches your plan on by hand, usually the same day/.test(faq) && /read-only/.test(faq) && /3 days of grace/.test(faq) && /one trial per owner, however many businesses/.test(faq) && /no customer conversation is sent to an AI provider today/.test(faq) && /one shared team inbox/.test(faq) && /Do I need Meta or WhatsApp approval to start\?/.test(faq));

    // ------------------------------------------------------------ terms
    for (const [locale, checks] of [
      ["en", [/shops, restaurants and schools/, /14 days/, /one free trial/, /read-only/, /stored encrypted/, /not affiliated with, endorsed by or sponsored by WhatsApp or Meta/, /The AI assistant \(coming soon\)/, /10 months for 12/, /by hand, usually the same day/]],
      ["fr", [/boutiques, les restaurants et les écoles/, /14 jours/, /un seul essai gratuit/, /lecture seule/, /stocké chiffré/, /ni affilié, ni approuvé, ni sponsorisé par WhatsApp ou Meta/, /L'assistant IA \(bientôt disponible\)/, /10 mois pour 12/, /à la main, en général le jour même/]],
    ]) {
      const { text: terms } = await text(`/${locale}/terms`);
      const missing = checks.filter((re) => !re.test(terms)).map(String);
      ok(`terms (${locale}): the platform, trial once per owner, read-only, encrypted tokens, non-affiliation, AI coming soon`, missing.length === 0 && !/One Free account per WhatsApp number|moves to the Free plan|passe au forfait Free/.test(terms), missing.join(", "));
    }

    // ------------------------------------------------------------ privacy
    for (const [locale, checks] of [
      ["en", [/shops, restaurants and schools/, /students, many of whom are minors/, /no conversation is sent to an AI provider today/, /not saved on our servers/, /hashed/, /stored encrypted/, /read-only/, /teachers see only their own classes and never fees/]],
      ["fr", [/boutiques, les restaurants et les écoles/, /dont beaucoup sont mineurs/, /aucune conversation n'est envoyée aujourd'hui à un fournisseur d'IA/, /n'est pas enregistré sur nos serveurs/, /stocké chiffré/, /lecture seule/, /jamais les frais/]],
    ]) {
      const { text: privacy } = await text(`/${locale}/privacy`);
      const missing = checks.filter((re) => !re.test(privacy)).map(String);
      ok(`privacy (${locale}): shops, restaurants and schools, students' data, the AI not in use yet, the free generator, read-only`, missing.length === 0 && !/WazaBolt is an AI business assistant|WazaBolt est un assistant IA pour WhatsApp/.test(privacy), missing.join(", "));
    }

    // ------------------------------------------------------------ the free generator
    const { text: tool, html: toolHtml } = await text("/en/tools/documents");
    ok("generator: a trial invitation under the tool (balances, credit, stock, receipts in one tap)", /data-testid="doc-trial-banner"/.test(toolHtml) && /Customer balances saved automatically/.test(tool) && /Credit and part payments tracked/.test(tool) && /Receipts sent on WhatsApp in one tap/.test(tool) && /Want to automatically save customer balances, track credit, and send receipts straight to WhatsApp\?/.test(tool) && /Start your 14-day free WazaBolt trial/.test(tool));
    const { html: toolFrHtml, text: toolFr } = await text("/fr/tools/documents");
    ok("generator (fr): the invitation in French", /data-testid="doc-trial-banner"/.test(toolFrHtml) && /Commencer l'essai gratuit WazaBolt de 14 jours/.test(toolFr));

    // ------------------------------------------------------------ sign-up page
    const { text: reg } = await text("/en/register");
    ok("sign-up page: no automated-replies promise", !/Automated replies from your own catalogue/.test(reg) && /Sales, stock and customer credit in one place/.test(reg));
  } catch (e) {
    ok("suite ran to the end", false, String(e?.stack ?? e));
  } finally {
    console.log(results.join("\n"));
    console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  }
})();
