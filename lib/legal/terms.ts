import type { LegalDoc } from "./types";

/*
 * Terms of Service. Plan rules (prepaid, AI conversation = 24-hour window,
 * grace days, Free per number) mirror config/economics.ts and the billing
 * code: keep them in step, and update siteConfig.legal.updated.
 */

const en: LegalDoc = {
  title: "Terms of Service",
  eyebrow: "Legal",
  updatedLabel: "Last updated",
  tocLabel: "Contents",
  intro: [
    "These terms are the agreement between you and WazaBolt for the use of the WazaBolt website, dashboard and WhatsApp assistant. {operator}",
    "By creating an account or using WazaBolt, you accept these terms on behalf of yourself and of the business you register. If you do not accept them, do not use the service.",
  ],
  sections: [
    {
      id: "service",
      heading: "1. The service",
      body: [
        "WazaBolt connects a business's own WhatsApp Business number to an AI assistant and a shared inbox. The assistant answers customers from the information the business provides (products, prices, opening hours, delivery, policies, FAQs), can record orders and appointments, and hands conversations to the business's team when needed. Features available depend on your plan and may evolve.",
        "WazaBolt is an independent product. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of its respective owner.",
      ],
    },
    {
      id: "accounts",
      heading: "2. Accounts",
      body: [
        {
          list: [
            "You must be at least 18 and authorised to act for the business you register. The information you give us must be accurate and kept up to date.",
            "You are responsible for your login details and for everything done under your account, including by team members you invite. Tell us straight away at {email} if you think your account has been misused.",
            "One Free account per WhatsApp number: a number already used with another WazaBolt account can only be connected on a paid plan.",
          ],
        },
      ],
    },
    {
      id: "whatsapp",
      heading: "3. WhatsApp and Meta",
      body: [
        {
          list: [
            "Your business uses its own WhatsApp Business Account and phone number, and must accept and follow Meta's WhatsApp Business terms and policies (including the WhatsApp Business Messaging Policy and Commerce Policy).",
            "You may only message people who contacted you or who agreed to receive your messages, and you must honour requests to stop. Broadcasts and other marketing messages require the recipients' prior agreement.",
            "Meta charges your business directly for some WhatsApp messages (for example beyond its monthly free allowance, or for marketing messages). These charges are between your business and Meta; they are not part of your WazaBolt plan, and Meta may require a payment method on your WhatsApp Business Account.",
            "Meta may limit, suspend or restrict your WhatsApp Business Account or number. WazaBolt has no control over these decisions and is not responsible for them.",
          ],
        },
      ],
    },
    {
      id: "responsibilities",
      heading: "4. Your content and your customers",
      body: [
        {
          list: [
            "You are responsible for the information you add to WazaBolt (products, prices, stock, policies, messages) and for the products and services you sell. Keep it accurate: the assistant relies on it.",
            "You are responsible for your relationship with your customers, including deliveries, payments, refunds and complaints, and for informing them, as the law requires, that you use WazaBolt and an automated assistant to answer them.",
            "For your customers' personal data you are the data controller and WazaBolt acts as your processor: we process it only to provide the service, following your instructions and our Privacy Policy, keep it confidential and secure, use only service providers bound by the same obligations, help you answer your customers' requests, and delete it when your account is closed.",
          ],
        },
      ],
    },
    {
      id: "ai",
      heading: "5. AI replies",
      body: [
        "Replies written by the assistant are generated automatically and may be incomplete or wrong. WazaBolt is designed to answer only from your information and to hand over to your team when unsure, but we cannot guarantee every reply. Check your conversations regularly, correct your information when needed, and take over any conversation where a person should answer. You can switch the assistant off at any time.",
      ],
    },
    {
      id: "plans",
      heading: "6. Plans, payment and renewal",
      body: [
        {
          list: [
            "Plans, prices (in FCFA) and the AI conversations they include are shown on our Pricing page and in your dashboard. An AI conversation is one customer's 24-hour window in which the AI assistant replied; simple answers from WazaBolt's rules do not count.",
            "Paid plans are prepaid, monthly or yearly (a yearly plan costs 10 months for 12), by Mobile Money or another method we accept. The plan starts, or a renewal follows on from the current period, once we have received your payment.",
            "When a period ends without renewal, your plan stays active for 3 more days (payment due); after that your business moves to the Free plan. Nothing is deleted, and paying restores your plan.",
            "When the conversations included in your plan are used up for the month, conversations already under way continue, the assistant still answers simple questions, and other messages wait for your team until the next month or until you upgrade. To keep the service fair and sustainable, WazaBolt may also limit the assistant's use in a conversation or in a month (for example by handing over to your team) as described in your dashboard.",
            "Payments cover the period paid for and are not refundable, except where the law requires it or where we end the service without fault on your side; then we refund the unused part.",
            "We may change our prices or plans. Changes apply from your next period, and we will tell you at least 30 days in advance by email or in your dashboard.",
            "The Free plan is offered as is and its limits may change.",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "7. Acceptable use",
      body: [
        "You must not use WazaBolt to:",
        {
          list: [
            "send spam or unsolicited messages, or message people who asked you to stop;",
            "sell or promote illegal, counterfeit or dangerous goods or services, or anything WhatsApp's Commerce Policy forbids;",
            "deceive, defraud, harass or threaten anyone, or impersonate another person or business;",
            "collect sensitive data (such as health, payment card or identity documents) through the assistant without a lawful basis;",
            "break the law, infringe others' rights, or attempt to access other businesses' data, overload, reverse-engineer or disrupt the service.",
          ],
        },
      ],
    },
    {
      id: "suspension",
      heading: "8. Suspension and closing your account",
      body: [
        "You can stop using WazaBolt and ask us to close your account at any time by writing to {email}. We may pause the assistant, suspend or close an account if these terms or Meta's policies are broken, if payment is not made, if there is a security risk, or if the law requires it. Where possible we will tell you first and give you a chance to fix the problem. After closure, your data is deleted as described in our Privacy Policy.",
      ],
    },
    {
      id: "ip",
      heading: "9. Intellectual property",
      body: [
        "WazaBolt, its software, design and brand belong to WazaBolt. You keep all rights to your content (business information, product photos, messages) and allow us to use it only to provide the service to you.",
      ],
    },
    {
      id: "availability",
      heading: "10. Availability",
      body: [
        "We work to keep WazaBolt available and secure, but the service depends on the internet and on third parties (Meta, our AI and hosting providers) and may sometimes be interrupted, for maintenance or for reasons outside our control. We do not guarantee that it will always be available or error-free.",
      ],
    },
    {
      id: "liability",
      heading: "11. Liability",
      body: [
        "To the extent the law allows, WazaBolt is not liable for indirect losses (such as lost profits, lost sales or lost data), for decisions or actions of Meta, or for losses caused by information you provided or by your use of the service contrary to these terms. Our total liability for any claim is limited to the amounts you paid WazaBolt in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.",
        "You agree to compensate WazaBolt for claims by third parties resulting from your content, your products or services, or your breach of these terms or of Meta's policies.",
      ],
    },
    {
      id: "changes",
      heading: "12. Changes to these terms",
      body: [
        "We may update these terms. The date at the top shows the latest version; we will tell account holders by email or in the dashboard before an important change takes effect. If you continue to use WazaBolt afterwards, the new terms apply.",
      ],
    },
    {
      id: "law",
      heading: "13. Applicable law and disputes",
      body: [
        "These terms are governed by the laws of the Republic of Cameroon. If a dispute arises, contact us first at {email}: we will try to resolve it amicably within 30 days. Failing that, the competent courts of Cameroon will decide. These terms exist in English and French; both versions have the same value.",
      ],
    },
    {
      id: "contact",
      heading: "14. Contact",
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
    "Ces conditions constituent l'accord entre vous et WazaBolt pour l'utilisation du site, du tableau de bord et de l'assistant WhatsApp WazaBolt. {operator}",
    "En créant un compte ou en utilisant WazaBolt, vous acceptez ces conditions pour vous-même et pour l'entreprise que vous enregistrez. Si vous ne les acceptez pas, n'utilisez pas le service.",
  ],
  sections: [
    {
      id: "service",
      heading: "1. Le service",
      body: [
        "WazaBolt relie le propre numéro WhatsApp Business d'une entreprise à un assistant IA et à une messagerie partagée. L'assistant répond aux clients à partir des informations fournies par l'entreprise (produits, prix, horaires, livraison, politiques, FAQ), peut enregistrer des commandes et des rendez-vous, et transmet les conversations à l'équipe de l'entreprise si nécessaire. Les fonctionnalités disponibles dépendent de votre forfait et peuvent évoluer.",
        "WazaBolt est un produit indépendant. Il n'est ni affilié, ni approuvé, ni sponsorisé par WhatsApp ou Meta. WhatsApp est une marque de son propriétaire respectif.",
      ],
    },
    {
      id: "accounts",
      heading: "2. Comptes",
      body: [
        {
          list: [
            "Vous devez avoir au moins 18 ans et être autorisé à agir pour l'entreprise que vous enregistrez. Les informations que vous nous donnez doivent être exactes et tenues à jour.",
            "Vous êtes responsable de vos identifiants et de tout ce qui est fait depuis votre compte, y compris par les membres de l'équipe que vous invitez. Prévenez-nous immédiatement à {email} si vous pensez que votre compte a été utilisé à votre insu.",
            "Un seul compte Gratuit par numéro WhatsApp : un numéro déjà utilisé avec un autre compte WazaBolt ne peut être connecté qu'avec un forfait payant.",
          ],
        },
      ],
    },
    {
      id: "whatsapp",
      heading: "3. WhatsApp et Meta",
      body: [
        {
          list: [
            "Votre entreprise utilise son propre compte WhatsApp Business et son propre numéro, et doit accepter et respecter les conditions et politiques WhatsApp Business de Meta (notamment la politique de messagerie WhatsApp Business et la politique commerciale).",
            "Vous ne pouvez écrire qu'aux personnes qui vous ont contacté ou qui ont accepté de recevoir vos messages, et vous devez respecter les demandes d'arrêt. Les diffusions et autres messages marketing exigent l'accord préalable des destinataires.",
            "Meta facture directement votre entreprise pour certains messages WhatsApp (par exemple au-delà de son quota mensuel gratuit, ou pour les messages marketing). Ces frais concernent votre entreprise et Meta ; ils ne font pas partie de votre forfait WazaBolt, et Meta peut exiger un moyen de paiement sur votre compte WhatsApp Business.",
            "Meta peut limiter, suspendre ou restreindre votre compte WhatsApp Business ou votre numéro. WazaBolt n'a aucun contrôle sur ces décisions et n'en est pas responsable.",
          ],
        },
      ],
    },
    {
      id: "responsibilities",
      heading: "4. Vos contenus et vos clients",
      body: [
        {
          list: [
            "Vous êtes responsable des informations que vous ajoutez à WazaBolt (produits, prix, stock, politiques, messages) et des produits et services que vous vendez. Tenez-les exactes : l'assistant s'appuie sur elles.",
            "Vous êtes responsable de votre relation avec vos clients, notamment des livraisons, paiements, remboursements et réclamations, et de les informer, comme la loi l'exige, que vous utilisez WazaBolt et un assistant automatique pour leur répondre.",
            "Pour les données personnelles de vos clients, vous êtes responsable du traitement et WazaBolt agit en tant que sous-traitant : nous les traitons uniquement pour fournir le service, selon vos instructions et notre politique de confidentialité, les gardons confidentielles et sécurisées, ne faisons appel qu'à des prestataires tenus aux mêmes obligations, vous aidons à répondre aux demandes de vos clients, et les supprimons à la fermeture de votre compte.",
          ],
        },
      ],
    },
    {
      id: "ai",
      heading: "5. Réponses de l'IA",
      body: [
        "Les réponses rédigées par l'assistant sont générées automatiquement et peuvent être incomplètes ou erronées. WazaBolt est conçu pour ne répondre qu'à partir de vos informations et pour passer la main à votre équipe en cas de doute, mais nous ne pouvons garantir chaque réponse. Consultez régulièrement vos conversations, corrigez vos informations si nécessaire et reprenez toute conversation où une personne doit répondre. Vous pouvez désactiver l'assistant à tout moment.",
      ],
    },
    {
      id: "plans",
      heading: "6. Forfaits, paiement et renouvellement",
      body: [
        {
          list: [
            "Les forfaits, leurs prix (en FCFA) et les conversations IA qu'ils comprennent sont indiqués sur notre page Tarifs et dans votre tableau de bord. Une conversation IA correspond à 24 heures d'échanges avec un client pendant lesquelles l'assistant IA a répondu ; les réponses simples des règles de WazaBolt ne comptent pas.",
            "Les forfaits payants sont prépayés, au mois ou à l'année (le forfait annuel coûte 10 mois pour 12), par Mobile Money ou un autre moyen que nous acceptons. Le forfait démarre, ou le renouvellement prolonge la période en cours, dès réception de votre paiement.",
            "À la fin d'une période non renouvelée, votre forfait reste actif 3 jours de plus (paiement attendu) ; ensuite votre entreprise passe au forfait Gratuit. Rien n'est supprimé, et le paiement rétablit votre forfait.",
            "Lorsque les conversations comprises dans votre forfait sont épuisées pour le mois, les conversations en cours continuent, l'assistant répond toujours aux questions simples, et les autres messages attendent votre équipe jusqu'au mois suivant ou jusqu'à ce que vous changiez de forfait. Pour un service équitable et durable, WazaBolt peut aussi limiter l'usage de l'assistant dans une conversation ou sur un mois (par exemple en passant la main à votre équipe), comme indiqué dans votre tableau de bord.",
            "Les paiements couvrent la période payée et ne sont pas remboursables, sauf lorsque la loi l'exige ou si nous mettons fin au service sans faute de votre part ; nous remboursons alors la partie non utilisée.",
            "Nous pouvons modifier nos prix ou nos forfaits. Les changements s'appliquent à partir de votre période suivante, et nous vous prévenons au moins 30 jours à l'avance par e-mail ou dans votre tableau de bord.",
            "Le forfait Gratuit est proposé en l'état et ses limites peuvent évoluer.",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "7. Utilisation acceptable",
      body: [
        "Vous ne devez pas utiliser WazaBolt pour :",
        {
          list: [
            "envoyer du spam ou des messages non sollicités, ou écrire à des personnes qui vous ont demandé d'arrêter ;",
            "vendre ou promouvoir des biens ou services illégaux, contrefaits ou dangereux, ou tout ce que la politique commerciale de WhatsApp interdit ;",
            "tromper, escroquer, harceler ou menacer quiconque, ou vous faire passer pour une autre personne ou entreprise ;",
            "collecter des données sensibles (santé, carte de paiement, pièces d'identité, etc.) par l'assistant sans base légale ;",
            "enfreindre la loi ou les droits d'autrui, ou tenter d'accéder aux données d'autres entreprises, de surcharger, de décompiler ou de perturber le service.",
          ],
        },
      ],
    },
    {
      id: "suspension",
      heading: "8. Suspension et fermeture du compte",
      body: [
        "Vous pouvez cesser d'utiliser WazaBolt et nous demander de fermer votre compte à tout moment en écrivant à {email}. Nous pouvons mettre l'assistant en pause, suspendre ou fermer un compte en cas de non-respect de ces conditions ou des politiques de Meta, de défaut de paiement, de risque pour la sécurité, ou si la loi l'exige. Lorsque c'est possible, nous vous prévenons d'abord et vous laissons la possibilité de corriger le problème. Après la fermeture, vos données sont supprimées comme indiqué dans notre politique de confidentialité.",
      ],
    },
    {
      id: "ip",
      heading: "9. Propriété intellectuelle",
      body: [
        "WazaBolt, son logiciel, son design et sa marque appartiennent à WazaBolt. Vous conservez tous les droits sur vos contenus (informations de l'entreprise, photos de produits, messages) et nous autorisez à les utiliser uniquement pour vous fournir le service.",
      ],
    },
    {
      id: "availability",
      heading: "10. Disponibilité",
      body: [
        "Nous faisons en sorte que WazaBolt reste disponible et sécurisé, mais le service dépend d'internet et de tiers (Meta, nos prestataires d'IA et d'hébergement) et peut être interrompu, pour maintenance ou pour des raisons indépendantes de notre volonté. Nous ne garantissons pas qu'il sera toujours disponible ou exempt d'erreurs.",
      ],
    },
    {
      id: "liability",
      heading: "11. Responsabilité",
      body: [
        "Dans la mesure permise par la loi, WazaBolt n'est pas responsable des pertes indirectes (manque à gagner, ventes ou données perdues, etc.), des décisions ou actions de Meta, ni des pertes causées par les informations que vous avez fournies ou par une utilisation du service contraire à ces conditions. Notre responsabilité totale, toutes réclamations confondues, est limitée aux sommes que vous avez payées à WazaBolt au cours des 12 mois précédant la réclamation. Rien dans ces conditions ne limite une responsabilité que la loi interdit de limiter.",
        "Vous vous engagez à indemniser WazaBolt des réclamations de tiers résultant de vos contenus, de vos produits ou services, ou du non-respect de ces conditions ou des politiques de Meta.",
      ],
    },
    {
      id: "changes",
      heading: "12. Modifications de ces conditions",
      body: [
        "Nous pouvons mettre à jour ces conditions. La date en haut de page indique la dernière version ; nous informerons les titulaires de comptes par e-mail ou dans le tableau de bord avant qu'un changement important ne prenne effet. Si vous continuez à utiliser WazaBolt ensuite, les nouvelles conditions s'appliquent.",
      ],
    },
    {
      id: "law",
      heading: "13. Droit applicable et litiges",
      body: [
        "Ces conditions sont régies par le droit de la République du Cameroun. En cas de litige, contactez-nous d'abord à {email} : nous chercherons une solution amiable dans un délai de 30 jours. À défaut, les juridictions compétentes du Cameroun trancheront. Ces conditions existent en anglais et en français ; les deux versions ont la même valeur.",
      ],
    },
    {
      id: "contact",
      heading: "14. Contact",
      body: ["{operator}", "E-mail : {email} · Téléphone et WhatsApp : {phone} · Adresse : {address}"],
    },
  ],
};

export const termsOfService = { en, fr };
