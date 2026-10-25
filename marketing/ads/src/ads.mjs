/*
 * Content of the video ads (Instagram and Facebook), in English and French.
 * Only features WazaBolt really has. Names, products and amounts on the
 * phone screens are examples. <hl>…</hl> marks the gold highlight.
 */

const money = (lang, n) => `${new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB").format(n).replace(/[\u202f\u00a0 ]/g, "\u00a0")}\u00a0FCFA`;

const outro = {
  en: { title: "Start <hl>free</hl> today", url: "www.wazabolt.com", note: "Free plan · Prices in FCFA · English & French" },
  fr: { title: "Commencez <hl>gratuitement</hl>", url: "www.wazabolt.com", note: "Forfait gratuit · Prix en FCFA · Français & anglais" },
};

const till = (lang) => ({
  caption: lang === "fr" ? "Enregistrez chaque vente en <hl>quelques secondes</hl>" : "Record every sale <hl>in seconds</hl>",
  phone: {
    title: lang === "fr" ? "Nouvelle vente" : "New sale",
    kind: "rows",
    rows: [
      { l: lang === "fr" ? "Robe en wax · L" : "Wax dress · L", sub: "× 2", v: money(lang, 30000) },
      { l: lang === "fr" ? "Sac en pagne" : "Pagne bag", sub: "× 1", v: money(lang, 8500) },
      { l: "Total", v: money(lang, 38500), tone: "total" },
    ],
    badge: lang === "fr" ? "Payé · MTN MoMo" : "Paid · MTN MoMo",
  },
});

const whatsapp = (lang, them, ai) => ({
  caption: lang === "fr" ? "Un assistant qui répond <hl>sur WhatsApp</hl>" : "An assistant that answers <hl>on WhatsApp</hl>",
  phone: { title: "WhatsApp", kind: "chat", contact: lang === "fr" ? "Client" : "Customer", messages: [{ from: "them", text: them }, { from: "ai", text: ai }] },
  note: lang === "fr" ? "Français · anglais · pidgin" : "English · French · Pidgin",
});

export const ADS = {
  product: {
    en: {
      hook: { eyebrow: "For shops, schools and restaurants in Cameroon", title: "Your whole business <hl>in your phone.</hl>", photo: "hero-owner.jpg" },
      scenes: [
        till("en"),
        {
          caption: "Know your stock and <hl>who owes you</hl>",
          phone: {
            title: "Today",
            kind: "rows",
            rows: [
              { l: "Wax dress · L", sub: "Stock", v: "2 left", tone: "low" },
              { l: "Pagne bag", sub: "Stock", v: "14", tone: "ok" },
              { l: "Nadège", sub: "Owes you", v: money("en", 12000), tone: "gold" },
              { l: "Serge", sub: "Owes you", v: money("en", 5500), tone: "gold" },
            ],
          },
        },
        {
          caption: "Invoices and receipts <hl>in FCFA</hl>",
          phone: { title: "Invoice", kind: "doc", heading: "INVOICE", ref: "INV-2026-000041", meta: "Awa Styles · Douala", rows: [{ l: "Wax dress · L × 2", v: money("en", 30000) }, { l: "Delivery", v: money("en", 1500) }], total: money("en", 31500), foot: "PDF · Send on WhatsApp" },
        },
        whatsapp("en", "Do you still have the wax dress in L?", `Yes! Wax dress, size L: ${money("en", 15000)}. Would you like one?`),
      ],
      outro: outro.en,
    },
    fr: {
      hook: { eyebrow: "Pour les boutiques, écoles et restaurants au Cameroun", title: "Toute votre activité <hl>dans votre téléphone.</hl>", photo: "hero-owner.jpg" },
      scenes: [
        till("fr"),
        {
          caption: "Votre stock et <hl>qui vous doit</hl>",
          phone: {
            title: "Aujourd'hui",
            kind: "rows",
            rows: [
              { l: "Robe en wax · L", sub: "Stock", v: "Reste 2", tone: "low" },
              { l: "Sac en pagne", sub: "Stock", v: "14", tone: "ok" },
              { l: "Nadège", sub: "Vous doit", v: money("fr", 12000), tone: "gold" },
              { l: "Serge", sub: "Vous doit", v: money("fr", 5500), tone: "gold" },
            ],
          },
        },
        {
          caption: "Factures et reçus <hl>en FCFA</hl>",
          phone: { title: "Facture", kind: "doc", heading: "FACTURE", ref: "FAC-2026-000041", meta: "Awa Styles · Douala", rows: [{ l: "Robe en wax · L × 2", v: money("fr", 30000) }, { l: "Livraison", v: money("fr", 1500) }], total: money("fr", 31500), foot: "PDF · Envoyer sur WhatsApp" },
        },
        whatsapp("fr", "Vous avez encore la robe en wax en L ?", `Oui ! Robe en wax, taille L : ${money("fr", 15000)}. Vous en voulez une ?`),
      ],
      outro: outro.fr,
    },
  },

  shops: {
    en: {
      hook: { eyebrow: "For shops and boutiques", title: "Still counting stock <hl>in a notebook?</hl>", photo: "hero-owner.jpg" },
      scenes: [
        till("en"),
        {
          caption: "Stock by <hl>size and colour</hl>",
          phone: {
            title: "Wax dress",
            kind: "rows",
            rows: [
              { l: "Red · M", sub: "Stock", v: "6", tone: "ok" },
              { l: "Red · L", sub: "Stock", v: "2 · low", tone: "low" },
              { l: "Blue · L", sub: "Stock", v: "0 · out", tone: "out" },
            ],
          },
        },
        {
          caption: "See <hl>who owes you</hl> money",
          phone: {
            title: "Customer credit",
            kind: "rows",
            rows: [
              { l: "Nadège", sub: "Since 12 Oct", v: money("en", 12000), tone: "gold" },
              { l: "Serge", sub: "Since 18 Oct", v: money("en", 5500), tone: "gold" },
              { l: "Total owed", v: money("en", 17500), tone: "total" },
            ],
            badge: "Payment recorded · Cash",
          },
        },
        {
          caption: "Your estimated profit, <hl>every day</hl>",
          phone: {
            title: "This week",
            kind: "rows",
            rows: [
              { l: "Sales", v: money("en", 152000) },
              { l: "Cost of goods", v: `− ${money("en", 87500)}` },
              { l: "Expenses", sub: "Rent, transport", v: `− ${money("en", 23000)}` },
              { l: "Estimated profit", v: money("en", 41500), tone: "total" },
            ],
          },
          note: "Expenses and profit: paid plans",
        },
      ],
      outro: outro.en,
    },
    fr: {
      hook: { eyebrow: "Pour les boutiques", title: "Vous comptez encore votre stock <hl>dans un cahier ?</hl>", photo: "hero-owner.jpg" },
      scenes: [
        till("fr"),
        {
          caption: "Le stock par <hl>taille et couleur</hl>",
          phone: {
            title: "Robe en wax",
            kind: "rows",
            rows: [
              { l: "Rouge · M", sub: "Stock", v: "6", tone: "ok" },
              { l: "Rouge · L", sub: "Stock", v: "2 · bas", tone: "low" },
              { l: "Bleu · L", sub: "Stock", v: "0 · épuisé", tone: "out" },
            ],
          },
        },
        {
          caption: "Voyez <hl>qui vous doit</hl> de l'argent",
          phone: {
            title: "Crédits clients",
            kind: "rows",
            rows: [
              { l: "Nadège", sub: "Depuis le 12 oct.", v: money("fr", 12000), tone: "gold" },
              { l: "Serge", sub: "Depuis le 18 oct.", v: money("fr", 5500), tone: "gold" },
              { l: "Total dû", v: money("fr", 17500), tone: "total" },
            ],
            badge: "Paiement enregistré · Espèces",
          },
        },
        {
          caption: "Votre bénéfice estimé, <hl>chaque jour</hl>",
          phone: {
            title: "Cette semaine",
            kind: "rows",
            rows: [
              { l: "Ventes", v: money("fr", 152000) },
              { l: "Coût des marchandises", v: `− ${money("fr", 87500)}` },
              { l: "Dépenses", sub: "Loyer, transport", v: `− ${money("fr", 23000)}` },
              { l: "Bénéfice estimé", v: money("fr", 41500), tone: "total" },
            ],
          },
          note: "Dépenses et bénéfice : forfaits payants",
        },
      ],
      outro: outro.fr,
    },
  },

  schools: {
    en: {
      hook: { eyebrow: "For schools", title: "Report cards <hl>without the late nights.</hl>" },
      scenes: [
        {
          caption: "Teachers <hl>enter their marks</hl>",
          phone: {
            title: "Mathematics · Form 2A",
            kind: "rows",
            rows: [
              { l: "Ngo Marie", sub: "Sequence 1", v: "15 / 20", tone: "ok" },
              { l: "Tabi Paul", sub: "Sequence 1", v: "12.5 / 20" },
              { l: "Fon Grace", sub: "Sequence 1", v: "17 / 20", tone: "ok" },
            ],
            badge: "Free teacher accounts",
          },
        },
        {
          caption: "Averages <hl>calculated for you</hl>",
          phone: {
            title: "Ngo Marie · Term 1",
            kind: "rows",
            rows: [
              { l: "Mathematics", sub: "Coef. 4", v: "15 / 20" },
              { l: "French", sub: "Coef. 3", v: "13.5 / 20" },
              { l: "English", sub: "Coef. 2", v: "14 / 20" },
              { l: "Average", v: "14.28 / 20", tone: "total" },
            ],
          },
        },
        {
          caption: "Report cards <hl>in PDF</hl>",
          phone: { title: "Report card", kind: "doc", heading: "REPORT CARD", ref: "Term 1 · 2026–2027", meta: "Ngo Marie · Form 2A", rows: [{ l: "Mathematics", v: "15" }, { l: "French", v: "13.5" }, { l: "English", v: "14" }], total: "14.28 / 20", totalLabel: "Average", foot: "Print or send to parents" },
        },
        {
          caption: "School fees, <hl>with receipts</hl>",
          phone: {
            title: "Fees · Ngo Marie",
            kind: "rows",
            rows: [
              { l: "Tuition · Term 1", v: money("en", 75000) },
              { l: "Paid", sub: "Orange Money", v: money("en", 50000), tone: "ok" },
              { l: "Balance", v: money("en", 25000), tone: "gold" },
            ],
            badge: "Receipt REC-2026-000118",
          },
        },
      ],
      outro: { ...outro.en, note: "Free plan · Free teacher accounts · English & French" },
    },
    fr: {
      hook: { eyebrow: "Pour les écoles", title: "Des bulletins <hl>sans nuits blanches.</hl>" },
      scenes: [
        {
          caption: "Les enseignants <hl>saisissent leurs notes</hl>",
          phone: {
            title: "Mathématiques · 5e A",
            kind: "rows",
            rows: [
              { l: "Ngo Marie", sub: "Séquence 1", v: "15 / 20", tone: "ok" },
              { l: "Tabi Paul", sub: "Séquence 1", v: "12,5 / 20" },
              { l: "Fon Grace", sub: "Séquence 1", v: "17 / 20", tone: "ok" },
            ],
            badge: "Comptes enseignants gratuits",
          },
        },
        {
          caption: "Les moyennes <hl>calculées pour vous</hl>",
          phone: {
            title: "Ngo Marie · 1er trimestre",
            kind: "rows",
            rows: [
              { l: "Mathématiques", sub: "Coef. 4", v: "15 / 20" },
              { l: "Français", sub: "Coef. 3", v: "13,5 / 20" },
              { l: "Anglais", sub: "Coef. 2", v: "14 / 20" },
              { l: "Moyenne", v: "14,28 / 20", tone: "total" },
            ],
          },
        },
        {
          caption: "Les bulletins <hl>en PDF</hl>",
          phone: { title: "Bulletin", kind: "doc", heading: "BULLETIN DE NOTES", ref: "1er trimestre · 2026–2027", meta: "Ngo Marie · 5e A", rows: [{ l: "Mathématiques", v: "15" }, { l: "Français", v: "13,5" }, { l: "Anglais", v: "14" }], total: "14,28 / 20", totalLabel: "Moyenne", foot: "À imprimer ou envoyer aux parents" },
        },
        {
          caption: "Les frais de scolarité, <hl>avec reçus</hl>",
          phone: {
            title: "Frais · Ngo Marie",
            kind: "rows",
            rows: [
              { l: "Scolarité · 1er trimestre", v: money("fr", 75000) },
              { l: "Payé", sub: "Orange Money", v: money("fr", 50000), tone: "ok" },
              { l: "Reste à payer", v: money("fr", 25000), tone: "gold" },
            ],
            badge: "Reçu REC-2026-000118",
          },
        },
      ],
      outro: { ...outro.fr, note: "Forfait gratuit · Comptes enseignants gratuits · Français & anglais" },
    },
  },

  restaurants: {
    en: {
      hook: { eyebrow: "For restaurants, snack bars and cafés", title: "From the table to the kitchen. <hl>No paper.</hl>" },
      scenes: [
        {
          caption: "Open a bill <hl>for each table</hl>",
          phone: {
            title: "Table 4 · 3 guests",
            kind: "rows",
            rows: [
              { l: "Poulet DG", sub: "× 2", v: money("en", 9000) },
              { l: "Ndolé", sub: "+ extra plantain", v: money("en", 3500) },
              { l: "Bill", v: money("en", 12500), tone: "total" },
            ],
            badge: "Sent to the kitchen",
          },
        },
        {
          caption: "The kitchen sees <hl>every order</hl>",
          phone: {
            title: "Kitchen",
            kind: "rows",
            rows: [
              { l: "Table 4 · Round 1", sub: "Ndolé · no pepper", v: "Preparing", tone: "gold" },
              { l: "Table 7 · Round 2", sub: "Grilled fish × 2", v: "Ready", tone: "ok" },
              { l: "Takeaway", sub: "Poulet DG × 1", v: "New", tone: "low" },
            ],
          },
        },
        {
          caption: "Print the bill, <hl>take payment</hl>",
          phone: {
            title: "Table 4 · Bill",
            kind: "rows",
            rows: [
              { l: "Total", v: money("en", 12500), tone: "total" },
              { l: "Cash", v: money("en", 5000) },
              { l: "Orange Money", v: money("en", 7500) },
            ],
            badge: "Paid in full · Bill closed",
          },
        },
        whatsapp("en", "Can I order 2 Poulet DG to take away?", `Yes! 2 × Poulet DG = ${money("en", 9000)}. Pickup or delivery?`),
      ],
      outro: { ...outro.en, note: "Free plan · Free kitchen accounts · English & French" },
    },
    fr: {
      hook: { eyebrow: "Pour les restaurants, snacks et cafés", title: "De la table à la cuisine. <hl>Sans papier.</hl>" },
      scenes: [
        {
          caption: "Une addition <hl>pour chaque table</hl>",
          phone: {
            title: "Table 4 · 3 couverts",
            kind: "rows",
            rows: [
              { l: "Poulet DG", sub: "× 2", v: money("fr", 9000) },
              { l: "Ndolé", sub: "+ plantain en plus", v: money("fr", 3500) },
              { l: "Addition", v: money("fr", 12500), tone: "total" },
            ],
            badge: "Envoyé en cuisine",
          },
        },
        {
          caption: "La cuisine voit <hl>chaque commande</hl>",
          phone: {
            title: "Cuisine",
            kind: "rows",
            rows: [
              { l: "Table 4 · Tournée 1", sub: "Ndolé · sans piment", v: "En préparation", tone: "gold" },
              { l: "Table 7 · Tournée 2", sub: "Poisson braisé × 2", v: "Prêt", tone: "ok" },
              { l: "À emporter", sub: "Poulet DG × 1", v: "Nouveau", tone: "low" },
            ],
          },
        },
        {
          caption: "Imprimez l'addition, <hl>encaissez</hl>",
          phone: {
            title: "Table 4 · Addition",
            kind: "rows",
            rows: [
              { l: "Total", v: money("fr", 12500), tone: "total" },
              { l: "Espèces", v: money("fr", 5000) },
              { l: "Orange Money", v: money("fr", 7500) },
            ],
            badge: "Payée en entier · Addition clôturée",
          },
        },
        whatsapp("fr", "Je peux commander 2 poulets DG à emporter ?", `Oui ! 2 × Poulet DG = ${money("fr", 9000)}. À emporter ou en livraison ?`),
      ],
      outro: { ...outro.fr, note: "Forfait gratuit · Comptes cuisine gratuits · Français & anglais" },
    },
  },
};

/** Ad length (ms): hook, each scene, outro. */
export const TIMING = { hook: 2600, scene: 3400, outro: 3600 };
