import type { LegalDoc } from "./types";

/*
 * Terms of Service. Plan rules (prepaid, 10 months for 12, 3 days of grace,
 * read-only when unpaid, one trial per owner, manual activation) mirror
 * config/economics.ts and the billing code: keep them in step, and update
 * siteConfig.legal.updated.
 */

const en: LegalDoc = {
  title: "Terms of Service",
  eyebrow: "Legal",
  updatedLabel: "Last updated",
  tocLabel: "Contents",
  intro: [
    "These terms are the agreement between you and WazaBolt for the use of the WazaBolt website and business management software, including its versions for shops, restaurants and schools. {operator}",
    "By creating an account or using WazaBolt, you accept these terms on behalf of yourself and of the business or school you register. If you do not accept them, do not use the service.",
  ],
  sections: [
    {
      id: "service",
      heading: "1. The service",
      body: [
        "WazaBolt is business management software used in a web browser on a phone, tablet or computer. Depending on the business type and plan, it includes sales at the till, products and stock, customer credit, orders, invoices, receipts and quotations, expenses and estimated profit, reports, an online shop page, and team accounts. Restaurants also get menus, tables and open bills, takeaway and delivery, and a kitchen screen. Schools also get school years and terms, classes and subjects, marks, results, report cards and school fees. A business can share documents as PDF on WhatsApp and, once it connects its own WhatsApp Business number, answer customers from a shared team inbox.",
        "Our free invoice, receipt and quotation generator can be used without an account. What you type in it is used only to make your PDF and is not saved on our servers; if you ask it to, your business details are kept in your own browser only. To prevent abuse, the number of PDFs per visitor per hour is limited, using a hashed form of the visitor's IP address. The documents it makes are yours, and you are responsible for their content.",
        "A WhatsApp AI assistant is in preparation and is not available yet; no customer conversation is sent to an AI provider today. Section 8 applies to it once it is offered. Features may evolve; what each plan includes is shown on our Pricing page and in your dashboard.",
        "WazaBolt is an independent product. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of its respective owner.",
      ],
    },
    {
      id: "accounts",
      heading: "2. Accounts and team members",
      body: [
        {
          list: [
            "You must be at least 18 and authorised to act for the business or school you register. The information you give us must be accurate and kept up to date.",
            "You are responsible for your login details and for everything done under your account, including by the team members, teachers and kitchen accounts you create. Give each person only the access they need, and tell us straight away at {email} if you think your account has been misused.",
          ],
        },
      ],
    },
    {
      id: "trial",
      heading: "3. Free trial",
      body: [
        "A new business gets a free trial of the Business plan (School Standard for a school) for 14 days, with no payment required. Each owner gets one free trial, whatever the number of businesses they create. At the end of the trial, choose a plan to keep using WazaBolt in full; otherwise the business becomes read-only as described in section 4.",
      ],
    },
    {
      id: "plans",
      heading: "4. Plans, payment and read-only mode",
      body: [
        {
          list: [
            "Plans and prices are shown on our Pricing page and in your dashboard: in FCFA for businesses in Cameroon, and in US dollars for businesses in other countries.",
            "Plans are prepaid, monthly or yearly (a yearly plan costs 10 months for 12). In Cameroon, payment is by MTN Mobile Money or Orange Money; elsewhere, by bank transfer in US dollars to the details shown in your dashboard. The WazaBolt team checks each payment and activates or renews the plan by hand, usually the same day. A plan starts, or a renewal follows on from the current period, once we have received your payment.",
            "When a paid period ends without renewal, your plan stays active for 3 more days (payment due). After that, or when a trial ends without a plan, your business becomes read-only: nothing is deleted, you can still view and export your data, and paying restores your plan.",
            "Payments cover the period paid for and are not refundable, except where the law requires it or where we end the service without fault on your side; then we refund the unused part.",
            "We may change our prices or plans. Changes apply from your next period, and we will tell you at least 30 days in advance by email or in your dashboard.",
          ],
        },
      ],
    },
    {
      id: "records",
      heading: "5. Payments and records you enter",
      body: [
        "Payments your business receives (cash, MTN MoMo, Orange Money, bank transfer, card, credit or other) are recorded by your team. WazaBolt does not check them with MTN, Orange, a bank or any payment provider, and a payment reference typed in is not a verification. Receipts, invoices, balances, reports and estimated profit reflect what your team records; you are responsible for checking that money was actually received.",
      ],
    },
    {
      id: "whatsapp",
      heading: "6. WhatsApp and Meta",
      body: [
        {
          list: [
            "You can use WazaBolt without connecting WhatsApp. Connecting a number is optional and uses your business's own WhatsApp Business Account through Meta's WhatsApp Business Platform; you must accept and follow Meta's WhatsApp Business terms and policies (including the WhatsApp Business Messaging Policy and Commerce Policy).",
            "You may only message people who contacted you or who agreed to receive your messages, and you must honour requests to stop. Marketing messages require the recipients' prior agreement.",
            "The access token you give us for your WhatsApp Business Account is stored encrypted and used only on our servers to send and receive your messages.",
            "Meta charges your business directly for some WhatsApp messages. These charges are between your business and Meta and are not part of your WazaBolt plan.",
            "Meta may limit, suspend or restrict your WhatsApp Business Account or number. WazaBolt has no control over these decisions and is not responsible for them.",
          ],
        },
      ],
    },
    {
      id: "responsibilities",
      heading: "7. Your content, customers, students and parents",
      body: [
        {
          list: [
            "You are responsible for the information you add to WazaBolt (products, prices, stock, policies, marks, fees, messages) and for the products, services and teaching you provide. Keep it accurate.",
            "You are responsible for your relationship with your customers, and for a school with its students and parents, including deliveries, payments, refunds, results, report cards and complaints.",
            "For the personal data of your customers, students, parents and staff you are the data controller and WazaBolt acts as your processor: we process it only to provide the service, following your instructions and our Privacy Policy, keep it confidential and secure, use only service providers bound by the same obligations, help you answer people's requests, and delete it when your account is closed. A school must have a lawful basis for the data of its students, who are often minors, and for sending results to parents.",
            "A school is responsible for its students' marks, results and report cards, and decides when results are published (marks lock once published) and who receives them, for example a parent's WhatsApp number. WazaBolt never contacts students and never uses their data for any other purpose.",
          ],
        },
      ],
    },
    {
      id: "ai",
      heading: "8. The AI assistant (coming soon)",
      body: [
        "The WhatsApp AI assistant is not available yet. Once it is offered and your business turns it on, its replies are generated automatically and may be incomplete or wrong. It is designed to answer only from your information and to hand over to your team when unsure, but we cannot guarantee every reply. You must check your conversations, correct your information when needed, take over any conversation where a person should answer, and tell your customers, as the law requires, that an automated assistant answers them. You will be able to switch it off at any time. Its price and limits will be shown on our Pricing page before it is offered.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "9. Acceptable use",
      body: [
        "You must not use WazaBolt to:",
        {
          list: [
            "send spam or unsolicited messages, or message people who asked you to stop;",
            "sell or promote illegal, counterfeit or dangerous goods or services, or anything WhatsApp's Commerce Policy forbids;",
            "deceive, defraud, harass or threaten anyone, issue false documents, or impersonate another person, business or school;",
            "collect sensitive data (such as health, payment card or identity documents) without a lawful basis;",
            "break the law, infringe others' rights, or attempt to access other businesses' data, overload, reverse-engineer or disrupt the service.",
          ],
        },
      ],
    },
    {
      id: "suspension",
      heading: "10. Suspension and closing your account",
      body: [
        "You can stop using WazaBolt and ask us to close your account at any time by writing to {email}; export your data first. We may suspend or close an account if these terms or Meta's policies are broken, if there is a security risk, or if the law requires it. Where possible we will tell you first and give you a chance to fix the problem. Non-payment alone makes your business read-only (section 4); it does not delete your data. After closure, your data is deleted as described in our Privacy Policy.",
      ],
    },
    {
      id: "ip",
      heading: "11. Intellectual property",
      body: [
        "WazaBolt, its software, design and brand belong to WazaBolt. Your data is yours: you keep all rights to your content (business information, product photos, marks, documents, messages), you can export it at any time, including in read-only mode, and you allow us to use it only to provide the service to you.",
      ],
    },
    {
      id: "availability",
      heading: "12. Availability",
      body: [
        "We work to keep WazaBolt available and secure, but the service depends on the internet and on third parties (such as our hosting providers and Meta) and may sometimes be interrupted, for maintenance or for reasons outside our control. We do not guarantee that it will always be available or error-free.",
      ],
    },
    {
      id: "liability",
      heading: "13. Liability",
      body: [
        "To the extent the law allows, WazaBolt is not liable for indirect losses (such as lost profits, lost sales or lost data), for decisions or actions of Meta, or for losses caused by information you entered or by your use of the service contrary to these terms. Our total liability for any claim is limited to the amounts you paid WazaBolt in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.",
        "You agree to compensate WazaBolt for claims by third parties resulting from your content, your products or services, or your breach of these terms or of Meta's policies.",
      ],
    },
    {
      id: "changes",
      heading: "14. Changes to these terms",
      body: [
        "We may update these terms. The date at the top shows the latest version; we will tell account holders by email or in the dashboard before an important change takes effect. If you continue to use WazaBolt afterwards, the new terms apply.",
      ],
    },
    {
      id: "law",
      heading: "15. Applicable law and disputes",
      body: [
        "These terms are governed by the laws of the Republic of Cameroon. If a dispute arises, contact us first at {email}: we will try to resolve it amicably within 30 days. Failing that, the competent courts of Cameroon will decide. These terms exist in English and French; both versions have the same value.",
      ],
    },
    {
      id: "contact",
      heading: "16. Contact",
      body: ["{operator}", "Email: {email} · Phone and WhatsApp: {phone} · Address: {address}"],
    },
  ],
};

const fr: LegalDoc = {
  title: "Conditions d'utilisation",
  eyebrow: "Mentions légales",
  updatedLabel: "Dernière mise à jour",
  tocLabel: "Sommaire",
  intro: [
    "Ces conditions constituent l'accord entre vous et WazaBolt pour l'utilisation du site et du logiciel de gestion WazaBolt, y compris ses versions pour les boutiques, les restaurants et les écoles. {operator}",
    "En créant un compte ou en utilisant WazaBolt, vous acceptez ces conditions pour vous-même et pour l'entreprise ou l'école que vous enregistrez. Si vous ne les acceptez pas, n'utilisez pas le service.",
  ],
  sections: [
    {
      id: "service",
      heading: "1. Le service",
      body: [
        "WazaBolt est un logiciel de gestion utilisé dans un navigateur web, sur téléphone, tablette ou ordinateur. Selon le type d'entreprise et le forfait, il comprend les ventes à la caisse, les produits et le stock, le crédit client, les commandes, les factures, reçus et devis, les dépenses et le bénéfice estimé, les rapports, une page boutique en ligne et des comptes d'équipe. Les restaurants disposent aussi des menus, des tables et additions ouvertes, de l'emporter et de la livraison, et d'un écran cuisine. Les écoles disposent aussi des années scolaires et trimestres, des classes et matières, des notes, des résultats, des bulletins et des frais de scolarité. Une entreprise peut partager ses documents en PDF sur WhatsApp et, une fois son propre numéro WhatsApp Business connecté, répondre à ses clients depuis une messagerie d'équipe partagée.",
        "Notre générateur gratuit de factures, reçus et devis peut être utilisé sans compte. Ce que vous y saisissez sert uniquement à créer votre PDF et n'est pas enregistré sur nos serveurs ; si vous le demandez, les informations de votre entreprise sont conservées uniquement dans votre propre navigateur. Pour éviter les abus, le nombre de PDF par visiteur et par heure est limité, à l'aide d'une forme chiffrée de l'adresse IP du visiteur. Les documents créés vous appartiennent, et vous êtes responsable de leur contenu.",
        "Un assistant IA WhatsApp est en préparation et n'est pas encore disponible ; aucune conversation client n'est envoyée aujourd'hui à un fournisseur d'IA. La section 8 s'y appliquera dès qu'il sera proposé. Les fonctionnalités peuvent évoluer ; le contenu de chaque forfait figure sur notre page Tarifs et dans votre tableau de bord.",
        "WazaBolt est un produit indépendant. Il n'est ni affilié, ni approuvé, ni sponsorisé par WhatsApp ou Meta. WhatsApp est une marque de son propriétaire respectif.",
      ],
    },
    {
      id: "accounts",
      heading: "2. Comptes et membres de l'équipe",
      body: [
        {
          list: [
            "Vous devez avoir au moins 18 ans et être autorisé à agir pour l'entreprise ou l'école que vous enregistrez. Les informations que vous nous donnez doivent être exactes et tenues à jour.",
            "Vous êtes responsable de vos identifiants et de tout ce qui est fait avec votre compte, y compris par les membres de l'équipe, les enseignants et les comptes cuisine que vous créez. Donnez à chacun uniquement l'accès dont il a besoin, et prévenez-nous immédiatement à {email} si vous pensez que votre compte a été utilisé à mauvais escient.",
          ],
        },
      ],
    },
    {
      id: "trial",
      heading: "3. Essai gratuit",
      body: [
        "Une nouvelle entreprise bénéficie d'un essai gratuit du forfait Business (École Standard pour une école) pendant 14 jours, sans paiement demandé. Chaque propriétaire a droit à un seul essai gratuit, quel que soit le nombre d'entreprises qu'il crée. À la fin de l'essai, choisissez un forfait pour continuer à utiliser WazaBolt pleinement ; sinon l'entreprise passe en lecture seule comme décrit à la section 4.",
      ],
    },
    {
      id: "plans",
      heading: "4. Forfaits, paiement et lecture seule",
      body: [
        {
          list: [
            "Les forfaits et les prix figurent sur notre page Tarifs et dans votre tableau de bord : en FCFA pour les entreprises au Cameroun, et en dollars US pour les entreprises des autres pays.",
            "Les forfaits sont prépayés, au mois ou à l'année (un forfait annuel coûte 10 mois pour 12). Au Cameroun, le paiement se fait par MTN Mobile Money ou Orange Money ; ailleurs, par virement bancaire en dollars US aux coordonnées indiquées dans votre tableau de bord. L'équipe WazaBolt vérifie chaque paiement et active ou renouvelle le forfait à la main, en général le jour même. Un forfait démarre, ou un renouvellement prend la suite de la période en cours, dès réception de votre paiement.",
            "Quand une période payée se termine sans renouvellement, votre forfait reste actif 3 jours de plus (paiement attendu). Ensuite, ou quand un essai se termine sans forfait, votre entreprise passe en lecture seule : rien n'est supprimé, vous pouvez toujours consulter et exporter vos données, et le paiement rétablit votre forfait.",
            "Les paiements couvrent la période payée et ne sont pas remboursables, sauf si la loi l'exige ou si nous arrêtons le service sans faute de votre part ; nous remboursons alors la partie non utilisée.",
            "Nous pouvons modifier nos prix ou nos forfaits. Les changements s'appliquent à partir de votre période suivante, et nous vous prévenons au moins 30 jours à l'avance par e-mail ou dans votre tableau de bord.",
          ],
        },
      ],
    },
    {
      id: "records",
      heading: "5. Paiements et données que vous saisissez",
      body: [
        "Les paiements que reçoit votre entreprise (espèces, MTN MoMo, Orange Money, virement, carte, crédit ou autre) sont enregistrés par votre équipe. WazaBolt ne les vérifie pas auprès de MTN, d'Orange, d'une banque ou d'un prestataire de paiement, et une référence de paiement saisie n'est pas une vérification. Les reçus, factures, soldes, rapports et le bénéfice estimé reflètent ce que votre équipe enregistre ; il vous appartient de vérifier que l'argent a bien été reçu.",
      ],
    },
    {
      id: "whatsapp",
      heading: "6. WhatsApp et Meta",
      body: [
        {
          list: [
            "Vous pouvez utiliser WazaBolt sans connecter WhatsApp. La connexion d'un numéro est facultative et utilise le propre compte WhatsApp Business de votre entreprise via la plateforme WhatsApp Business de Meta ; vous devez accepter et respecter les conditions et politiques WhatsApp Business de Meta (notamment la politique de messagerie WhatsApp Business et la politique commerciale).",
            "Vous ne pouvez écrire qu'aux personnes qui vous ont contacté ou qui ont accepté de recevoir vos messages, et vous devez respecter les demandes d'arrêt. Les messages marketing exigent l'accord préalable des destinataires.",
            "Le jeton d'accès que vous nous confiez pour votre compte WhatsApp Business est stocké chiffré et utilisé uniquement sur nos serveurs pour envoyer et recevoir vos messages.",
            "Meta facture directement à votre entreprise certains messages WhatsApp. Ces frais concernent votre entreprise et Meta et ne font pas partie de votre forfait WazaBolt.",
            "Meta peut limiter, suspendre ou restreindre votre compte ou votre numéro WhatsApp Business. WazaBolt n'a aucun contrôle sur ces décisions et n'en est pas responsable.",
          ],
        },
      ],
    },
    {
      id: "responsibilities",
      heading: "7. Votre contenu, vos clients, élèves et parents",
      body: [
        {
          list: [
            "Vous êtes responsable des informations que vous ajoutez à WazaBolt (produits, prix, stock, politiques, notes, frais, messages) et des produits, services et enseignements que vous fournissez. Tenez-les exacts.",
            "Vous êtes responsable de votre relation avec vos clients et, pour une école, avec ses élèves et leurs parents, y compris les livraisons, paiements, remboursements, résultats, bulletins et réclamations.",
            "Pour les données personnelles de vos clients, élèves, parents et employés, vous êtes le responsable du traitement et WazaBolt agit comme votre sous-traitant : nous les traitons uniquement pour fournir le service, selon vos instructions et notre Politique de confidentialité, les gardons confidentielles et sécurisées, n'utilisons que des prestataires soumis aux mêmes obligations, vous aidons à répondre aux demandes des personnes concernées, et les supprimons à la fermeture de votre compte. Une école doit disposer d'une base légale pour les données de ses élèves, souvent mineurs, et pour l'envoi des résultats aux parents.",
            "Une école est responsable des notes, résultats et bulletins de ses élèves, et décide quand les résultats sont publiés (les notes sont alors verrouillées) et qui les reçoit, par exemple le numéro WhatsApp d'un parent. WazaBolt ne contacte jamais les élèves et n'utilise jamais leurs données à d'autres fins.",
          ],
        },
      ],
    },
    {
      id: "ai",
      heading: "8. L'assistant IA (bientôt disponible)",
      body: [
        "L'assistant IA WhatsApp n'est pas encore disponible. Dès qu'il sera proposé et que votre entreprise l'activera, ses réponses seront générées automatiquement et pourront être incomplètes ou inexactes. Il est conçu pour répondre uniquement à partir de vos informations et pour passer la main à votre équipe en cas de doute, mais nous ne pouvons pas garantir chaque réponse. Vous devrez vérifier vos conversations, corriger vos informations si besoin, reprendre toute conversation où une personne doit répondre, et informer vos clients, comme la loi l'exige, qu'un assistant automatique leur répond. Vous pourrez le désactiver à tout moment. Son prix et ses limites seront indiqués sur notre page Tarifs avant qu'il soit proposé.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "9. Utilisation acceptable",
      body: [
        "Vous ne devez pas utiliser WazaBolt pour :",
        {
          list: [
            "envoyer du spam ou des messages non sollicités, ou écrire à des personnes qui vous ont demandé d'arrêter ;",
            "vendre ou promouvoir des biens ou services illégaux, contrefaits ou dangereux, ou tout ce que la politique commerciale de WhatsApp interdit ;",
            "tromper, frauder, harceler ou menacer quiconque, émettre de faux documents, ou vous faire passer pour une autre personne, entreprise ou école ;",
            "collecter des données sensibles (santé, carte bancaire, pièces d'identité) sans base légale ;",
            "enfreindre la loi ou les droits d'autrui, ou tenter d'accéder aux données d'autres entreprises, de surcharger, de désassembler ou de perturber le service.",
          ],
        },
      ],
    },
    {
      id: "suspension",
      heading: "10. Suspension et fermeture du compte",
      body: [
        "Vous pouvez cesser d'utiliser WazaBolt et nous demander de fermer votre compte à tout moment en écrivant à {email} ; exportez d'abord vos données. Nous pouvons suspendre ou fermer un compte en cas de non-respect de ces conditions ou des politiques de Meta, de risque pour la sécurité, ou si la loi l'exige. Dans la mesure du possible, nous vous prévenons d'abord et vous laissons le temps de corriger le problème. Le seul défaut de paiement fait passer votre entreprise en lecture seule (section 4) ; il ne supprime pas vos données. Après la fermeture, vos données sont supprimées comme décrit dans notre Politique de confidentialité.",
      ],
    },
    {
      id: "ip",
      heading: "11. Propriété intellectuelle",
      body: [
        "WazaBolt, son logiciel, son design et sa marque appartiennent à WazaBolt. Vos données vous appartiennent : vous conservez tous les droits sur votre contenu (informations de l'entreprise, photos de produits, notes, documents, messages), vous pouvez l'exporter à tout moment, y compris en lecture seule, et vous nous autorisez à l'utiliser uniquement pour vous fournir le service.",
      ],
    },
    {
      id: "availability",
      heading: "12. Disponibilité",
      body: [
        "Nous faisons en sorte que WazaBolt reste disponible et sécurisé, mais le service dépend d'internet et de tiers (comme nos hébergeurs et Meta) et peut parfois être interrompu, pour maintenance ou pour des raisons indépendantes de notre volonté. Nous ne garantissons pas qu'il sera toujours disponible ou exempt d'erreurs.",
      ],
    },
    {
      id: "liability",
      heading: "13. Responsabilité",
      body: [
        "Dans la mesure permise par la loi, WazaBolt n'est pas responsable des pertes indirectes (comme un manque à gagner, des ventes perdues ou des données perdues), des décisions ou actions de Meta, ni des pertes causées par les informations que vous avez saisies ou par une utilisation du service contraire à ces conditions. Notre responsabilité totale pour toute réclamation est limitée aux montants que vous avez payés à WazaBolt au cours des 12 mois précédant la réclamation. Rien dans ces conditions ne limite une responsabilité qui ne peut l'être selon la loi.",
        "Vous acceptez d'indemniser WazaBolt pour les réclamations de tiers résultant de votre contenu, de vos produits ou services, ou d'un manquement de votre part à ces conditions ou aux politiques de Meta.",
      ],
    },
    {
      id: "changes",
      heading: "14. Modification de ces conditions",
      body: [
        "Nous pouvons mettre à jour ces conditions. La date en haut indique la dernière version ; nous prévenons les titulaires de compte par e-mail ou dans le tableau de bord avant qu'un changement important prenne effet. Si vous continuez à utiliser WazaBolt ensuite, les nouvelles conditions s'appliquent.",
      ],
    },
    {
      id: "law",
      heading: "15. Droit applicable et litiges",
      body: [
        "Ces conditions sont régies par le droit de la République du Cameroun. En cas de litige, contactez-nous d'abord à {email} : nous chercherons une solution amiable dans un délai de 30 jours. À défaut, les juridictions compétentes du Cameroun trancheront. Ces conditions existent en anglais et en français ; les deux versions ont la même valeur.",
      ],
    },
    {
      id: "contact",
      heading: "16. Contact",
      body: ["{operator}", "E-mail : {email} · Téléphone et WhatsApp : {phone} · Adresse : {address}"],
    },
  ],
};

export const termsOfService = { en, fr };
