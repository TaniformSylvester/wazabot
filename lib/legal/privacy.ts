import type { LegalDoc } from "./types";

/*
 * Privacy Policy. Describes what the product actually does (see README and
 * the code): keep it in step when data handling changes, and update
 * siteConfig.legal.updated.
 */

const en: LegalDoc = {
  title: "Privacy Policy",
  eyebrow: "Legal",
  updatedLabel: "Last updated",
  tocLabel: "Contents",
  intro: [
    "WazaBolt is business management software for shops, restaurants and schools: sales at the till, stock, customer credit, orders, invoices and receipts, an online shop page, and for schools marks, report cards and school fees. Businesses can share documents on WhatsApp and, once they connect their own WhatsApp Business number, answer customers from a shared inbox. A WhatsApp AI assistant is coming soon. {operator}",
    "This policy explains what personal data WazaBolt handles, why, who it is shared with and the rights you have. It applies to our website, our free document generator, the WazaBolt dashboard and the pages and messages we run for the businesses and schools that use it. It is written to meet Cameroon's Law No. 2024/017 of 23 December 2024 on personal data protection.",
  ],
  sections: [
    {
      id: "roles",
      heading: "1. Who is responsible for your data",
      body: [
        "Two situations, two roles:",
        {
          list: [
            "Businesses and schools using WazaBolt (owners, admins, staff, teachers and kitchen accounts): WazaBolt is responsible (the data controller) for your account, your business profile, billing and how you use the dashboard.",
            "People a business or school deals with (its customers, its students and their parents or guardians, people who write to it on WhatsApp or order from its shop page): that business or school is responsible for their data (the controller). WazaBolt processes it only on its behalf and following its instructions (as its processor). For questions about your data, contact that business or school first; we will help it answer you.",
          ],
        },
      ],
    },
    {
      id: "data",
      heading: "2. The data we handle",
      body: [
        "For businesses, schools and their team members:",
        {
          list: [
            "Account: name, email address, password (stored only as a secure hash by our authentication provider), dashboard language, and the role and access each team member, teacher or kitchen account is given.",
            "Business profile: business or school name, type, country, city, address, phone number, opening hours, logo, products, menu and prices (with photos), FAQs, policies and delivery information.",
            "WhatsApp connection, if the business connects a number: its WhatsApp Business Account and phone number identifiers, the display number and the access token Meta gives it (stored encrypted, never shown again in full).",
            "Billing: the plan, the free trial (one per owner), plan and renewal requests, the phone number given to arrange payment, and the payments we record by hand (amount, method such as MTN Mobile Money, Orange Money or bank transfer, payment reference, dates).",
          ],
        },
        "What a business or school records in WazaBolt about the people it deals with:",
        {
          list: [
            "Customers: name, WhatsApp number, email, city, preferred language, notes and tags, sales, orders and their delivery details, payments recorded, balances owed, invoices, receipts, quotations and statements.",
            "Schools: students' names, student numbers, gender, date of birth, class and enrolment; their marks, averages, results and report cards; the parent or guardian's name and WhatsApp number; school fee invoices, payments and balances. Teachers see only the classes and subjects they are given, never fees.",
            "Restaurants: tables, open bills, orders sent to the kitchen and their payments.",
            "Payments recorded at a till (cash, Mobile Money, transfer, card, credit) are typed in by the business's team; WazaBolt does not collect card or Mobile Money account details and does not check payments with banks or operators.",
          ],
        },
        "For people who write to a business on WhatsApp, once the business has connected its number:",
        {
          list: [
            "Your WhatsApp phone number and profile name.",
            "The messages you exchange with the business: text, photos, voice notes, documents (such as receipts or report cards), locations and their delivery status.",
            "What the conversation produces: your preferred language, details you share (for example your name or city), orders, notes and tags added by the business's team.",
          ],
        },
        "Visitors to a business's online shop page: the page shows the business's products; when you tap Order on WhatsApp, your own WhatsApp app opens with a message you choose whether to send. The page itself does not ask for your personal data.",
        "The free document generator on our website: what you type is used only to make your PDF and is not saved on our servers. If you tick \"Remember my business details on this device\", your business details and logo are kept in your own browser only. To prevent abuse, we limit the number of PDFs per visitor per hour using a hashed (non-readable) form of your IP address.",
        "When you visit our website or contact us: the messages you send us (email, WhatsApp, phone) and basic technical data our hosting provider records to keep the service running and secure (such as IP address, browser type, the pages requested and error reports).",
      ],
    },
    {
      id: "purposes",
      heading: "3. Why we use it",
      body: [
        {
          list: [
            "To provide the service: create and secure your account, run the dashboard, record the sales, stock, orders, marks, fees and documents your team enters, make PDFs, show your online shop page, receive and send WhatsApp messages for a business that has connected its number, and send the notifications you switch on. (Basis: our contract with you.)",
            "To bill and support you: run the free trial, handle plan requests, renewals and payments, answer your questions, and send service emails such as sign-up confirmation, password reset, renewal reminders and plan changes. (Basis: our contract; legal obligations for accounting.)",
            "To keep the service safe and working: prevent abuse and spam, enforce plan limits, detect and fix errors, and protect accounts. (Basis: our legitimate interest in a secure, reliable service.)",
            "To improve WazaBolt: understand, in aggregate, how features are used and what the service costs to run. We do not use the content of businesses' records or customer conversations to train AI models.",
          ],
        },
        "We do not sell personal data, and we do not use it for advertising.",
      ],
    },
    {
      id: "ai",
      heading: "4. The AI assistant (coming soon)",
      body: [
        "The WhatsApp AI assistant is not available yet, and no conversation is sent to an AI provider today. This section describes how it will handle data once it is offered and a business turns it on.",
        "When a customer writes to that business, the assistant will answer from the information the business has added (products, prices, hours, policies, FAQs). To do this, the latest messages of the conversation, a short summary and the relevant business information will be sent to our AI provider, Anthropic, which generates the reply. Simple questions may be answered by WazaBolt's own rules without the AI. Under its commercial terms, Anthropic processes this content only to provide the service to us and does not use it to train its models.",
        "AI replies can contain mistakes. Each business will stay responsible for the information it gives its customers, will be able to take over any conversation and to switch the assistant off at any time; customers will always be able to ask for a person. We will update this policy before the assistant is offered if anything here changes.",
      ],
    },
    {
      id: "sharing",
      heading: "5. Who we share it with",
      body: [
        "Only with the service providers we need to run WazaBolt, each bound to protect the data and use it only for us:",
        {
          list: [
            "Supabase: database, authentication and file storage.",
            "Vercel: hosting of the website and dashboard.",
            "Resend: delivery of WazaBolt's emails. Zoho: our team's mailbox (contact@wazabolt.com).",
            "Meta Platforms (WhatsApp Business Platform): to send and receive WhatsApp messages for businesses that connect their number. Meta also processes messages under its own terms and policies.",
            "Anthropic: only once the AI assistant is offered and a business turns it on (see section 4).",
            "Your bank or Mobile Money operator (MTN, Orange) processes the payment you make to us under its own terms; we receive only what we need to match your payment to your plan.",
          ],
        },
        "Within a business or school, team members see its records according to the role the owner gives them: for example, teachers see only their own classes and never fees. We may also disclose data when required by law or a court order, or to protect the rights and safety of our users or of WazaBolt.",
      ],
    },
    {
      id: "transfers",
      heading: "6. Data stored outside Cameroon",
      body: [
        "Our providers operate servers outside Cameroon (for example in the European Union or the United States). When data is transferred, we rely on providers that offer appropriate protection through their contractual commitments and security measures, as Cameroonian law requires.",
      ],
    },
    {
      id: "retention",
      heading: "7. How long we keep it",
      body: [
        {
          list: [
            "Account and business data: for as long as the account is open. If a trial or plan ends unpaid, the business becomes read-only: nothing is deleted, and the business can still view and export its data. When an account is closed, we delete or anonymise its data within 30 days, except what we must keep longer by law.",
            "Records a business or school keeps in WazaBolt (customers, sales, orders, documents, students, marks, report cards, fees, conversations): kept for it while its account is open; it can delete them, and they are deleted with the account.",
            "Billing records and payments: kept as long as accounting and tax law requires.",
            "Technical logs and the generator's hourly limit counters: kept for a limited time for security and troubleshooting, then deleted.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "8. How we protect it",
      body: [
        "Connections are encrypted (HTTPS). Passwords are stored only as secure hashes. WhatsApp access tokens are encrypted before they are stored. Each business's data is kept separate at database level, so one business can never see another's, and every action is checked on our servers against the signed-in person's business and role. Access by the WazaBolt team is limited to what is needed to run and support the service. No system is perfectly secure, but we work to prevent unauthorised access, loss or misuse, and we will inform affected users and the authorities of a serious breach as the law requires.",
      ],
    },
    {
      id: "rights",
      heading: "9. Your rights",
      body: [
        "Under Law No. 2024/017 you can ask to access your data, correct or complete it, delete it, restrict or object to its use, receive it in a portable format, and not be subject to decisions based solely on automated processing that significantly affect you. You can also withdraw consent you have given.",
        "Write to {email}. We answer within one month. If a business or school that uses WazaBolt holds your data (as its customer, student or parent), you can also contact it directly: it decides on your request, and we help it answer.",
        "If you are not satisfied with our answer, you can complain to Cameroon's Personal Data Protection Authority once it is operating, or to the competent courts.",
      ],
    },
    {
      id: "cookies",
      heading: "10. Cookies and storage on your device",
      body: [
        "We use only the cookies the service needs: to keep you logged in, to remember your language, and to remember which business you are working on. The free document generator can keep your business details in your browser's own storage if you ask it to. We do not use advertising or tracking cookies.",
      ],
    },
    {
      id: "children",
      heading: "11. Children and students",
      body: [
        "WazaBolt accounts are for businesses, schools and people aged 18 or over; we do not knowingly create accounts for children. Schools record data about their students, many of whom are minors: the school is responsible for it, must have a lawful basis for it, and decides who receives results (for example a parent's WhatsApp number). WazaBolt processes it only for the school, does not contact students, and never uses it for any other purpose.",
      ],
    },
    {
      id: "changes",
      heading: "12. Changes to this policy",
      body: [
        "We may update this policy when the service or the law changes, including before the AI assistant is offered. The date at the top shows the latest version; we will tell account holders by email or in the dashboard before an important change takes effect.",
      ],
    },
    {
      id: "contact",
      heading: "13. Contact",
      body: ["{operator}", "Email: {email} · Phone and WhatsApp: {phone} · Address: {address}"],
    },
  ],
};

const fr: LegalDoc = {
  title: "Politique de confidentialité",
  eyebrow: "Mentions légales",
  updatedLabel: "Dernière mise à jour",
  tocLabel: "Sommaire",
  intro: [
    "WazaBolt est un logiciel de gestion pour les boutiques, les restaurants et les écoles : ventes à la caisse, stock, crédits clients, commandes, factures et reçus, une page boutique en ligne et, pour les écoles, les notes, les bulletins et les frais de scolarité. Les entreprises peuvent partager leurs documents sur WhatsApp et, une fois leur propre numéro WhatsApp Business connecté, répondre à leurs clients depuis une messagerie partagée. Un assistant IA WhatsApp sera bientôt disponible. {operator}",
    "Cette politique explique quelles données personnelles WazaBolt traite, pourquoi, avec qui elles sont partagées et quels sont vos droits. Elle s'applique à notre site, à notre générateur de documents gratuit, au tableau de bord WazaBolt et aux pages et messages que nous faisons fonctionner pour les entreprises et les écoles qui l'utilisent. Elle est rédigée conformément à la loi camerounaise n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel.",
  ],
  sections: [
    {
      id: "roles",
      heading: "1. Qui est responsable de vos données",
      body: [
        "Deux situations, deux rôles :",
        {
          list: [
            "Les entreprises et écoles qui utilisent WazaBolt (propriétaires, administrateurs, personnel, enseignants et comptes cuisine) : WazaBolt est responsable (responsable du traitement) de votre compte, du profil de votre entreprise, de la facturation et de votre utilisation du tableau de bord.",
            "Les personnes avec qui une entreprise ou une école est en relation (ses clients, ses élèves et leurs parents ou tuteurs, les personnes qui lui écrivent sur WhatsApp ou commandent depuis sa page boutique) : cette entreprise ou cette école est responsable de leurs données (responsable du traitement). WazaBolt les traite uniquement pour son compte et selon ses instructions (en tant que sous-traitant). Pour toute question sur vos données, contactez d'abord cette entreprise ou cette école ; nous l'aiderons à vous répondre.",
          ],
        },
      ],
    },
    {
      id: "data",
      heading: "2. Les données que nous traitons",
      body: [
        "Pour les entreprises, les écoles et les membres de leur équipe :",
        {
          list: [
            "Compte : nom, adresse e-mail, mot de passe (conservé uniquement sous forme d'empreinte sécurisée par notre fournisseur d'authentification), langue du tableau de bord, et le rôle et l'accès donnés à chaque membre de l'équipe, enseignant ou compte cuisine.",
            "Profil de l'entreprise : nom de l'entreprise ou de l'école, type, pays, ville, adresse, numéro de téléphone, horaires, logo, produits, menu et prix (avec photos), FAQ, politiques et informations de livraison.",
            "Connexion WhatsApp, si l'entreprise connecte un numéro : les identifiants de son compte WhatsApp Business et de son numéro, le numéro affiché et le jeton d'accès fourni par Meta (stocké chiffré, jamais réaffiché en entier).",
            "Facturation : le forfait, l'essai gratuit (un par propriétaire), les demandes de forfait et de renouvellement, le numéro de téléphone donné pour organiser le paiement, et les paiements que nous enregistrons à la main (montant, moyen tel que MTN Mobile Money, Orange Money ou virement bancaire, référence de paiement, dates).",
          ],
        },
        "Ce qu'une entreprise ou une école enregistre dans WazaBolt sur les personnes avec qui elle est en relation :",
        {
          list: [
            "Clients : nom, numéro WhatsApp, e-mail, ville, langue préférée, notes et étiquettes, ventes, commandes et leurs informations de livraison, paiements enregistrés, soldes dus, factures, reçus, devis et relevés.",
            "Écoles : nom, matricule, sexe, date de naissance, classe et inscription des élèves ; leurs notes, moyennes, résultats et bulletins ; le nom et le numéro WhatsApp du parent ou tuteur ; les factures de frais de scolarité, paiements et soldes. Les enseignants ne voient que les classes et matières qui leur sont confiées, jamais les frais.",
            "Restaurants : tables, additions ouvertes, commandes envoyées à la cuisine et leurs paiements.",
            "Les paiements enregistrés à une caisse (espèces, Mobile Money, virement, carte, crédit) sont saisis par l'équipe de l'entreprise ; WazaBolt ne collecte ni données de carte ni identifiants de compte Mobile Money et ne vérifie pas les paiements auprès des banques ou des opérateurs.",
          ],
        },
        "Pour les personnes qui écrivent à une entreprise sur WhatsApp, une fois son numéro connecté :",
        {
          list: [
            "Votre numéro de téléphone WhatsApp et votre nom de profil.",
            "Les messages échangés avec l'entreprise : textes, photos, notes vocales, documents (comme des reçus ou des bulletins), positions et leur statut de remise.",
            "Ce que produit la conversation : votre langue préférée, les informations que vous partagez (par exemple votre nom ou votre ville), les commandes, les notes et étiquettes ajoutées par l'équipe de l'entreprise.",
          ],
        },
        "Les visiteurs de la page boutique en ligne d'une entreprise : la page présente les produits de l'entreprise ; quand vous appuyez sur « Commander sur WhatsApp », votre propre application WhatsApp s'ouvre avec un message que vous choisissez d'envoyer ou non. La page elle-même ne vous demande aucune donnée personnelle.",
        "Le générateur de documents gratuit de notre site : ce que vous saisissez sert uniquement à créer votre PDF et n'est pas enregistré sur nos serveurs. Si vous cochez « Retenir les informations de mon entreprise sur cet appareil », les informations et le logo de votre entreprise sont conservés uniquement dans votre propre navigateur. Pour éviter les abus, nous limitons le nombre de PDF par visiteur et par heure à l'aide d'une forme chiffrée (non lisible) de votre adresse IP.",
        "Quand vous visitez notre site ou nous contactez : les messages que vous nous envoyez (e-mail, WhatsApp, téléphone) et les données techniques de base que notre hébergeur enregistre pour faire fonctionner et sécuriser le service (adresse IP, type de navigateur, pages demandées et rapports d'erreur).",
      ],
    },
    {
      id: "purposes",
      heading: "3. Pourquoi nous les utilisons",
      body: [
        {
          list: [
            "Pour fournir le service : créer et sécuriser votre compte, faire fonctionner le tableau de bord, enregistrer les ventes, le stock, les commandes, les notes, les frais et les documents saisis par votre équipe, créer les PDF, afficher votre page boutique en ligne, recevoir et envoyer les messages WhatsApp d'une entreprise qui a connecté son numéro, et envoyer les notifications que vous activez. (Base : notre contrat avec vous.)",
            "Pour vous facturer et vous accompagner : gérer l'essai gratuit, les demandes de forfait, les renouvellements et les paiements, répondre à vos questions, et envoyer les e-mails du service (confirmation d'inscription, réinitialisation du mot de passe, rappels de renouvellement, changements de forfait). (Base : notre contrat ; obligations légales comptables.)",
            "Pour assurer la sécurité et le bon fonctionnement du service : prévenir les abus et le spam, appliquer les limites des forfaits, détecter et corriger les erreurs, protéger les comptes. (Base : notre intérêt légitime à offrir un service sûr et fiable.)",
            "Pour améliorer WazaBolt : comprendre, de façon agrégée, l'utilisation des fonctionnalités et le coût du service. Nous n'utilisons pas le contenu des données des entreprises ni des conversations clients pour entraîner des modèles d'IA.",
          ],
        },
        "Nous ne vendons pas de données personnelles et ne les utilisons pas à des fins publicitaires.",
      ],
    },
    {
      id: "ai",
      heading: "4. L'assistant IA (bientôt disponible)",
      body: [
        "L'assistant IA WhatsApp n'est pas encore disponible, et aucune conversation n'est envoyée aujourd'hui à un fournisseur d'IA. Cette section décrit comment il traitera les données dès qu'il sera proposé et qu'une entreprise l'activera.",
        "Quand un client écrira à cette entreprise, l'assistant répondra à partir des informations ajoutées par l'entreprise (produits, prix, horaires, politiques, FAQ). Pour cela, les derniers messages de la conversation, un court résumé et les informations utiles de l'entreprise seront transmis à notre fournisseur d'IA, Anthropic, qui génère la réponse. Les questions simples pourront recevoir une réponse des règles propres à WazaBolt, sans l'IA. Selon ses conditions commerciales, Anthropic traite ce contenu uniquement pour nous fournir le service et ne l'utilise pas pour entraîner ses modèles.",
        "Les réponses de l'IA peuvent comporter des erreurs. Chaque entreprise restera responsable des informations qu'elle donne à ses clients, pourra reprendre toute conversation et désactiver l'assistant à tout moment ; les clients pourront toujours demander à parler à une personne. Nous mettrons cette politique à jour avant de proposer l'assistant si quelque chose change.",
      ],
    },
    {
      id: "sharing",
      heading: "5. Avec qui nous les partageons",
      body: [
        "Uniquement avec les prestataires nécessaires au fonctionnement de WazaBolt, chacun tenu de protéger les données et de ne les utiliser que pour nous :",
        {
          list: [
            "Supabase : base de données, authentification et stockage de fichiers.",
            "Vercel : hébergement du site et du tableau de bord.",
            "Resend : envoi des e-mails de WazaBolt. Zoho : la messagerie de notre équipe (contact@wazabolt.com).",
            "Meta Platforms (plateforme WhatsApp Business) : pour envoyer et recevoir les messages WhatsApp des entreprises qui connectent leur numéro. Meta traite aussi les messages selon ses propres conditions et politiques.",
            "Anthropic : uniquement quand l'assistant IA sera proposé et qu'une entreprise l'activera (voir section 4).",
            "Votre banque ou votre opérateur Mobile Money (MTN, Orange) traite le paiement que vous nous faites selon ses propres conditions ; nous ne recevons que ce qu'il faut pour rattacher votre paiement à votre forfait.",
          ],
        },
        "Au sein d'une entreprise ou d'une école, les membres de l'équipe voient ses données selon le rôle que leur donne le propriétaire : par exemple, les enseignants ne voient que leurs propres classes et jamais les frais. Nous pouvons aussi communiquer des données lorsque la loi ou une décision de justice l'exige, ou pour protéger les droits et la sécurité de nos utilisateurs ou de WazaBolt.",
      ],
    },
    {
      id: "transfers",
      heading: "6. Données stockées hors du Cameroun",
      body: [
        "Nos prestataires exploitent des serveurs hors du Cameroun (par exemple dans l'Union européenne ou aux États-Unis). Lors d'un transfert, nous nous appuyons sur des prestataires qui offrent une protection adéquate par leurs engagements contractuels et leurs mesures de sécurité, comme l'exige la loi camerounaise.",
      ],
    },
    {
      id: "retention",
      heading: "7. Combien de temps nous les conservons",
      body: [
        {
          list: [
            "Données du compte et de l'entreprise : tant que le compte est ouvert. Si un essai ou un forfait se termine sans paiement, l'entreprise passe en lecture seule : rien n'est supprimé, et elle peut toujours consulter et exporter ses données. À la fermeture d'un compte, nous supprimons ou anonymisons ses données sous 30 jours, sauf ce que la loi nous oblige à garder plus longtemps.",
            "Données qu'une entreprise ou une école conserve dans WazaBolt (clients, ventes, commandes, documents, élèves, notes, bulletins, frais, conversations) : conservées pour elle tant que son compte est ouvert ; elle peut les supprimer, et elles sont supprimées avec le compte.",
            "Factures et paiements : conservés aussi longtemps que l'exigent les lois comptables et fiscales.",
            "Journaux techniques et compteurs horaires du générateur : conservés pour une durée limitée à des fins de sécurité et de dépannage, puis supprimés.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "8. Comment nous les protégeons",
      body: [
        "Les connexions sont chiffrées (HTTPS). Les mots de passe sont conservés uniquement sous forme d'empreinte sécurisée. Les jetons d'accès WhatsApp sont chiffrés avant d'être stockés. Les données de chaque entreprise sont séparées au niveau de la base de données, de sorte qu'une entreprise ne peut jamais voir celles d'une autre, et chaque action est vérifiée sur nos serveurs selon l'entreprise et le rôle de la personne connectée. L'accès de l'équipe WazaBolt est limité à ce qui est nécessaire pour faire fonctionner le service et vous accompagner. Aucun système n'est parfaitement sûr, mais nous travaillons à empêcher tout accès non autorisé, perte ou mauvaise utilisation, et nous informerons les personnes concernées et les autorités d'une violation grave, comme la loi l'exige.",
      ],
    },
    {
      id: "rights",
      heading: "9. Vos droits",
      body: [
        "Selon la loi n° 2024/017, vous pouvez demander à accéder à vos données, les rectifier ou les compléter, les effacer, en limiter l'utilisation ou vous y opposer, les recevoir dans un format portable, et ne pas faire l'objet d'une décision fondée uniquement sur un traitement automatisé qui vous affecte de manière importante. Vous pouvez aussi retirer un consentement donné.",
        "Écrivez à {email}. Nous répondons dans un délai d'un mois. Si une entreprise ou une école qui utilise WazaBolt détient vos données (en tant que client, élève ou parent), vous pouvez aussi la contacter directement : elle décide de votre demande, et nous l'aidons à y répondre.",
        "Si notre réponse ne vous satisfait pas, vous pouvez saisir l'Autorité camerounaise de protection des données personnelles dès qu'elle sera en fonction, ou les juridictions compétentes.",
      ],
    },
    {
      id: "cookies",
      heading: "10. Cookies et stockage sur votre appareil",
      body: [
        "Nous utilisons uniquement les cookies nécessaires au service : pour vous garder connecté, retenir votre langue et l'entreprise sur laquelle vous travaillez. Le générateur de documents gratuit peut conserver les informations de votre entreprise dans le stockage de votre navigateur si vous le lui demandez. Nous n'utilisons aucun cookie publicitaire ou de suivi.",
      ],
    },
    {
      id: "children",
      heading: "11. Enfants et élèves",
      body: [
        "Les comptes WazaBolt sont destinés aux entreprises, aux écoles et aux personnes de 18 ans ou plus ; nous ne créons pas sciemment de comptes pour des enfants. Les écoles enregistrent des données sur leurs élèves, dont beaucoup sont mineurs : l'école en est responsable, doit disposer d'une base légale, et décide qui reçoit les résultats (par exemple le numéro WhatsApp d'un parent). WazaBolt les traite uniquement pour l'école, ne contacte pas les élèves et ne les utilise jamais à d'autres fins.",
      ],
    },
    {
      id: "changes",
      heading: "12. Modification de cette politique",
      body: [
        "Nous pouvons mettre à jour cette politique lorsque le service ou la loi évolue, notamment avant de proposer l'assistant IA. La date en haut indique la dernière version ; nous prévenons les titulaires de compte par e-mail ou dans le tableau de bord avant qu'un changement important prenne effet.",
      ],
    },
    {
      id: "contact",
      heading: "13. Contact",
      body: ["{operator}", "E-mail : {email} · Téléphone et WhatsApp : {phone} · Adresse : {address}"],
    },
  ],
};

export const privacyPolicy = { en, fr };
