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
    "WazaBolt is an AI business assistant for WhatsApp: it helps businesses answer their customers, share products and prices, take orders and appointments, and hand conversations to their team. {operator}",
    "This policy explains what personal data WazaBolt handles, why, who it is shared with and the rights you have. It applies to our website, the WazaBolt dashboard and the WhatsApp assistant we run for businesses. It is written to meet Cameroon's Law No. 2024/017 of 23 December 2024 on personal data protection.",
  ],
  sections: [
    {
      id: "roles",
      heading: "1. Who is responsible for your data",
      body: [
        "Two situations, two roles:",
        {
          list: [
            "Businesses using WazaBolt (owners, admins and team members): WazaBolt is responsible (the data controller) for your account, your business profile, billing and how you use the dashboard.",
            "Customers who write to a business on WhatsApp: the business you are talking to is responsible for your data (the controller). WazaBolt processes it only on that business's behalf and following its instructions (as its processor), to run the assistant and the inbox. For questions about your data, contact that business first; we will help it answer you.",
          ],
        },
      ],
    },
    {
      id: "data",
      heading: "2. The data we handle",
      body: [
        "For businesses and their team members:",
        {
          list: [
            "Account: name, email address, password (stored only as a secure hash by our authentication provider), dashboard language.",
            "Business profile: business name, industry, city, address, phone number, opening hours, products and prices (with photos), FAQs, policies and delivery information, assistant settings, team members, their roles and invitations.",
            "WhatsApp connection: your WhatsApp Business Account and phone number identifiers, the display number and the access token Meta gives you (stored encrypted, never shown again in full).",
            "Billing: your plan, plan and renewal requests, the phone number you give us to arrange payment, and the payments we record (amount, method, Mobile Money reference, dates).",
            "Usage: how many AI conversations and WhatsApp messages your business uses, and technical records of each AI reply (model, number of tokens, cost, outcome) — these records contain identifiers, not message content.",
          ],
        },
        "For customers who write to a business on WhatsApp:",
        {
          list: [
            "Your WhatsApp phone number and profile name.",
            "The messages you exchange with the business: text, photos, voice notes, documents, locations and their delivery status.",
            "What the conversation produces: your preferred language, details you share (for example your name or city), orders, appointments, notes and tags added by the business's team, and a short running summary of the conversation used by the assistant.",
          ],
        },
        "When you visit our website or contact us: the messages you send us (email, WhatsApp, phone) and basic technical data our hosting provider records to keep the service running and secure (such as IP address, browser type and the pages requested).",
      ],
    },
    {
      id: "purposes",
      heading: "3. Why we use it",
      body: [
        {
          list: [
            "To provide the service: create and secure your account, run the dashboard, receive and send WhatsApp messages for your business, generate the assistant's replies, record orders and appointments, and send the notifications you switch on. (Basis: our contract with you.)",
            "To bill and support you: handle plan requests, renewals and payments, answer your questions, and send service emails such as sign-up confirmation, password reset, renewal reminders and plan changes. (Basis: our contract; legal obligations for accounting.)",
            "To keep the service safe and working: prevent abuse and spam, enforce plan limits, detect and fix errors, and protect accounts. (Basis: our legitimate interest in a secure, reliable service.)",
            "To improve WazaBolt: understand, in aggregate, how features are used and what the service costs to run. We do not use the content of customer conversations to train AI models.",
          ],
        },
        "We do not sell personal data, and we do not use it for advertising.",
      ],
    },
    {
      id: "ai",
      heading: "4. The AI assistant",
      body: [
        "When a customer writes to a business, the assistant answers automatically from the information that business has added (products, prices, hours, policies, FAQs). To do this, the latest messages of the conversation, a short summary and the relevant business information are sent to our AI provider, Anthropic, which generates the reply. Simple questions (opening hours, location, a price) may be answered by WazaBolt's own rules without the AI.",
        "Under its commercial terms, Anthropic processes this content only to provide the service to us and does not use it to train its models.",
        "AI replies can contain mistakes. Each business stays responsible for the information it gives its customers and can take over any conversation; customers can always ask to speak to a person. Businesses can switch the assistant off at any time.",
      ],
    },
    {
      id: "sharing",
      heading: "5. Who we share it with",
      body: [
        "Only with the service providers we need to run WazaBolt, each bound to protect the data and use it only for us:",
        {
          list: [
            "Meta Platforms (WhatsApp Business Platform): to send and receive WhatsApp messages. Meta also processes messages under its own terms and policies.",
            "Anthropic: to generate the assistant's replies (see section 4).",
            "Supabase: database, authentication and file storage.",
            "Vercel: hosting of the website and dashboard.",
            "Resend: delivery of WazaBolt's emails. Zoho: our team's mailbox (contact@wazabolt.com).",
            "Payment providers (for example a Mobile Money provider), when we use one to collect plan payments.",
          ],
        },
        "Within a business, team members see that business's conversations, customers and orders according to the role the owner gives them. We may also disclose data when required by law or a court order, or to protect the rights and safety of our users or of WazaBolt.",
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
            "Account and business data: for as long as the account is open. When an account is closed, we delete or anonymise its data within 30 days, except what we must keep longer by law.",
            "Conversations, customers, orders and appointments: kept for the business while its account is open; the business can delete them, and they are deleted with the account.",
            "Billing records and payments: kept as long as accounting and tax law requires.",
            "Technical logs: kept for a limited time for security and troubleshooting, then deleted.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "8. How we protect it",
      body: [
        "Connections are encrypted (HTTPS). Passwords are stored only as secure hashes. WhatsApp access tokens are encrypted before they are stored. Each business's data is kept separate at database level, so one business can never see another's. Access by the WazaBolt team is limited to what is needed to run and support the service. No system is perfectly secure, but we work to prevent unauthorised access, loss or misuse, and we will inform affected users and the authorities of a serious breach as the law requires.",
      ],
    },
    {
      id: "rights",
      heading: "9. Your rights",
      body: [
        "Under Law No. 2024/017 you can ask to access your data, correct or complete it, delete it, restrict or object to its use, receive it in a portable format, and not be subject to decisions based solely on automated processing that significantly affect you. You can also withdraw consent you have given.",
        "Write to {email}. We answer within one month. If you are a customer of a business that uses WazaBolt, you can also contact that business directly.",
        "If you are not satisfied with our answer, you can complain to Cameroon's Personal Data Protection Authority once it is operating, or to the competent courts.",
      ],
    },
    {
      id: "cookies",
      heading: "10. Cookies",
      body: [
        "We use only the cookies the service needs: to keep you logged in, to remember your language, and to remember which business you are working on. We do not use advertising or tracking cookies.",
      ],
    },
    {
      id: "children",
      heading: "11. Children",
      body: ["WazaBolt accounts are for businesses and people aged 18 or over. We do not knowingly create accounts for children."],
    },
    {
      id: "changes",
      heading: "12. Changes to this policy",
      body: [
        "We may update this policy when the service or the law changes. The date at the top shows the latest version; we will tell account holders by email or in the dashboard before an important change takes effect.",
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
    "WazaBolt est un assistant IA pour WhatsApp destiné aux entreprises : il les aide à répondre à leurs clients, à présenter leurs produits et leurs prix, à prendre des commandes et des rendez-vous, et à transmettre les conversations à leur équipe. {operator}",
    "Cette politique explique quelles données personnelles WazaBolt traite, pourquoi, avec qui elles sont partagées et quels sont vos droits. Elle s'applique à notre site, au tableau de bord WazaBolt et à l'assistant WhatsApp que nous faisons fonctionner pour les entreprises. Elle est rédigée conformément à la loi camerounaise n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel.",
  ],
  sections: [
    {
      id: "roles",
      heading: "1. Qui est responsable de vos données",
      body: [
        "Deux situations, deux rôles :",
        {
          list: [
            "Entreprises utilisatrices de WazaBolt (propriétaires, administrateurs et membres de l'équipe) : WazaBolt est responsable du traitement de votre compte, du profil de votre entreprise, de la facturation et de votre utilisation du tableau de bord.",
            "Clients qui écrivent à une entreprise sur WhatsApp : c'est l'entreprise avec laquelle vous échangez qui est responsable de vos données. WazaBolt les traite uniquement pour son compte et selon ses instructions (en tant que sous-traitant), pour faire fonctionner l'assistant et la messagerie. Pour toute question sur vos données, adressez-vous d'abord à cette entreprise ; nous l'aiderons à vous répondre.",
          ],
        },
      ],
    },
    {
      id: "data",
      heading: "2. Les données que nous traitons",
      body: [
        "Pour les entreprises et les membres de leur équipe :",
        {
          list: [
            "Compte : nom, adresse e-mail, mot de passe (conservé uniquement sous forme chiffrée irréversible par notre prestataire d'authentification), langue du tableau de bord.",
            "Profil de l'entreprise : nom, secteur, ville, adresse, téléphone, horaires, produits et prix (avec photos), FAQ, politiques et informations de livraison, réglages de l'assistant, membres de l'équipe, leurs rôles et invitations.",
            "Connexion WhatsApp : identifiants de votre compte WhatsApp Business et de votre numéro, numéro affiché et jeton d'accès fourni par Meta (conservé chiffré, jamais réaffiché en entier).",
            "Facturation : votre forfait, vos demandes de forfait et de renouvellement, le numéro que vous nous donnez pour organiser le paiement, et les paiements que nous enregistrons (montant, moyen, référence Mobile Money, dates).",
            "Utilisation : nombre de conversations IA et de messages WhatsApp utilisés par votre entreprise, et relevés techniques de chaque réponse IA (modèle, nombre de jetons, coût, résultat) — ces relevés contiennent des identifiants, pas le contenu des messages.",
          ],
        },
        "Pour les clients qui écrivent à une entreprise sur WhatsApp :",
        {
          list: [
            "Votre numéro WhatsApp et votre nom de profil.",
            "Les messages échangés avec l'entreprise : textes, photos, notes vocales, documents, positions et leur statut de remise.",
            "Ce que la conversation produit : votre langue préférée, les informations que vous communiquez (par exemple votre nom ou votre ville), commandes, rendez-vous, notes et étiquettes ajoutées par l'équipe de l'entreprise, et un court résumé de la conversation utilisé par l'assistant.",
          ],
        },
        "Lorsque vous visitez notre site ou nous contactez : les messages que vous nous envoyez (e-mail, WhatsApp, téléphone) et des données techniques de base enregistrées par notre hébergeur pour assurer le fonctionnement et la sécurité du service (adresse IP, type de navigateur, pages demandées).",
      ],
    },
    {
      id: "purposes",
      heading: "3. Pourquoi nous les utilisons",
      body: [
        {
          list: [
            "Fournir le service : créer et sécuriser votre compte, faire fonctionner le tableau de bord, recevoir et envoyer les messages WhatsApp de votre entreprise, générer les réponses de l'assistant, enregistrer commandes et rendez-vous, et envoyer les notifications que vous activez. (Fondement : notre contrat avec vous.)",
            "Vous facturer et vous accompagner : traiter les demandes de forfait, les renouvellements et les paiements, répondre à vos questions, et envoyer les e-mails de service (confirmation d'inscription, réinitialisation du mot de passe, rappels de renouvellement, changements de forfait). (Fondement : notre contrat ; obligations légales comptables.)",
            "Assurer la sécurité et le bon fonctionnement : prévenir les abus et le spam, appliquer les limites des forfaits, détecter et corriger les erreurs, protéger les comptes. (Fondement : notre intérêt légitime à un service sûr et fiable.)",
            "Améliorer WazaBolt : comprendre, de manière agrégée, l'usage des fonctionnalités et le coût du service. Nous n'utilisons pas le contenu des conversations des clients pour entraîner des modèles d'IA.",
          ],
        },
        "Nous ne vendons pas de données personnelles et ne les utilisons pas à des fins publicitaires.",
      ],
    },
    {
      id: "ai",
      heading: "4. L'assistant IA",
      body: [
        "Lorsqu'un client écrit à une entreprise, l'assistant répond automatiquement à partir des informations ajoutées par cette entreprise (produits, prix, horaires, politiques, FAQ). Pour cela, les derniers messages de la conversation, un court résumé et les informations utiles de l'entreprise sont transmis à notre fournisseur d'IA, Anthropic, qui génère la réponse. Les questions simples (horaires, adresse, un prix) peuvent recevoir une réponse des règles propres à WazaBolt, sans l'IA.",
        "Selon ses conditions commerciales, Anthropic traite ce contenu uniquement pour nous fournir le service et ne l'utilise pas pour entraîner ses modèles.",
        "Les réponses de l'IA peuvent comporter des erreurs. Chaque entreprise reste responsable des informations qu'elle donne à ses clients et peut reprendre toute conversation ; les clients peuvent toujours demander à parler à une personne. Les entreprises peuvent désactiver l'assistant à tout moment.",
      ],
    },
    {
      id: "sharing",
      heading: "5. Avec qui nous les partageons",
      body: [
        "Uniquement avec les prestataires nécessaires au fonctionnement de WazaBolt, chacun tenu de protéger les données et de ne les utiliser que pour nous :",
        {
          list: [
            "Meta Platforms (WhatsApp Business Platform) : pour envoyer et recevoir les messages WhatsApp. Meta traite également les messages selon ses propres conditions et politiques.",
            "Anthropic : pour générer les réponses de l'assistant (voir section 4).",
            "Supabase : base de données, authentification et stockage des fichiers.",
            "Vercel : hébergement du site et du tableau de bord.",
            "Resend : envoi des e-mails de WazaBolt. Zoho : la messagerie de notre équipe (contact@wazabolt.com).",
            "Prestataires de paiement (par exemple un prestataire Mobile Money), lorsque nous en utilisons un pour encaisser les forfaits.",
          ],
        },
        "Au sein d'une entreprise, les membres de l'équipe voient les conversations, clients et commandes de cette entreprise selon le rôle donné par le propriétaire. Nous pouvons aussi communiquer des données lorsque la loi ou une décision de justice l'exige, ou pour protéger les droits et la sécurité de nos utilisateurs ou de WazaBolt.",
      ],
    },
    {
      id: "transfers",
      heading: "6. Données conservées hors du Cameroun",
      body: [
        "Nos prestataires exploitent des serveurs situés hors du Cameroun (par exemple dans l'Union européenne ou aux États-Unis). En cas de transfert, nous nous appuyons sur des prestataires offrant une protection appropriée par leurs engagements contractuels et leurs mesures de sécurité, comme l'exige la loi camerounaise.",
      ],
    },
    {
      id: "retention",
      heading: "7. Durée de conservation",
      body: [
        {
          list: [
            "Données du compte et de l'entreprise : tant que le compte est ouvert. À la fermeture d'un compte, nous supprimons ou anonymisons ses données dans un délai de 30 jours, sauf ce que la loi nous oblige à conserver plus longtemps.",
            "Conversations, clients, commandes et rendez-vous : conservés pour l'entreprise tant que son compte est ouvert ; l'entreprise peut les supprimer, et ils sont supprimés avec le compte.",
            "Factures et paiements : conservés aussi longtemps que l'exigent les lois comptables et fiscales.",
            "Journaux techniques : conservés pour une durée limitée à des fins de sécurité et de dépannage, puis supprimés.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "8. Comment nous les protégeons",
      body: [
        "Les connexions sont chiffrées (HTTPS). Les mots de passe ne sont conservés que sous forme chiffrée irréversible. Les jetons d'accès WhatsApp sont chiffrés avant d'être enregistrés. Les données de chaque entreprise sont cloisonnées au niveau de la base de données : une entreprise ne peut jamais voir celles d'une autre. L'accès de l'équipe WazaBolt est limité à ce qui est nécessaire au fonctionnement et à l'assistance. Aucun système n'est parfaitement sûr, mais nous mettons tout en œuvre pour empêcher l'accès non autorisé, la perte ou l'utilisation abusive, et nous informerons les personnes concernées et les autorités de toute violation grave comme la loi l'exige.",
      ],
    },
    {
      id: "rights",
      heading: "9. Vos droits",
      body: [
        "Conformément à la loi n° 2024/017, vous pouvez demander à accéder à vos données, à les rectifier ou les compléter, à les effacer, à en limiter l'utilisation ou à vous y opposer, à les recevoir dans un format portable, et à ne pas faire l'objet d'une décision fondée exclusivement sur un traitement automatisé produisant des effets importants pour vous. Vous pouvez aussi retirer un consentement donné.",
        "Écrivez à {email}. Nous répondons dans un délai d'un mois. Si vous êtes client d'une entreprise qui utilise WazaBolt, vous pouvez aussi contacter directement cette entreprise.",
        "Si notre réponse ne vous satisfait pas, vous pouvez saisir l'Autorité de protection des données à caractère personnel du Cameroun dès qu'elle sera en fonction, ou les juridictions compétentes.",
      ],
    },
    {
      id: "cookies",
      heading: "10. Cookies",
      body: [
        "Nous n'utilisons que les cookies nécessaires au service : pour vous garder connecté, retenir votre langue et l'entreprise sur laquelle vous travaillez. Nous n'utilisons pas de cookies publicitaires ou de suivi.",
      ],
    },
    {
      id: "children",
      heading: "11. Enfants",
      body: ["Les comptes WazaBolt sont réservés aux entreprises et aux personnes âgées de 18 ans ou plus. Nous ne créons pas sciemment de comptes pour des enfants."],
    },
    {
      id: "changes",
      heading: "12. Modifications de cette politique",
      body: [
        "Nous pouvons mettre à jour cette politique lorsque le service ou la loi évolue. La date en haut de page indique la dernière version ; nous informerons les titulaires de comptes par e-mail ou dans le tableau de bord avant qu'un changement important ne prenne effet.",
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
