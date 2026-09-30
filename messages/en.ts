/**
 * English UI dictionary — the source of truth for every string on the
 * website, auth pages and dashboard. Other locales (messages/fr.ts) must
 * match this shape; TypeScript enforces it.
 *
 * Conventions:
 *   {name}          interpolation, filled with format()
 *   <hl>…</hl>      rich-text tags, rendered with rich() — tags depend on the component
 *   Validation / auth error messages are looked up by key (see lib/validation/auth.ts).
 */
const en = {
  meta: {
    siteTitle: "WazaBolt — WhatsApp Business Automation for Africa",
    siteDescription:
      "WazaBolt is your AI business assistant on WhatsApp. It answers customer questions in English, French and Pidgin, shares products and prices, captures orders and hands conversations to your team when needed.",
    keywords: [
      "WhatsApp business automation",
      "WhatsApp automation Africa",
      "WhatsApp orders",
      "AI customer service",
      "Cameroon",
      "WazaBolt",
      "AI business assistant",
      "English French Pidgin",
    ],
    ogAlt: "WazaBolt — Power your business on WhatsApp. Never miss a customer.",
    pages: {
      features: {
        title: "Features",
        description:
          "Answer customers in their language, share products, capture orders, manage customers and take over any conversation — WazaBolt, your AI business assistant on WhatsApp.",
      },
      howItWorks: {
        title: "How It Works",
        description:
          "How WazaBolt works: connect your business WhatsApp account, add your business information, let WazaBolt answer, and take over anytime.",
      },
      pricing: {
        title: "Pricing",
        description: "Simple WazaBolt plans in XAF, from Free to Pro. AI usage is metered — no unlimited surprises.",
      },
      solutions: {
        title: "Solutions",
        description:
          "How shops, restaurants, hotels, fashion brands, salons, real estate agencies, schools and service businesses use WazaBolt on WhatsApp.",
      },
      faq: { title: "FAQ", description: "Answers to common questions about WazaBolt, WhatsApp, languages and AI conversations." },
      resources: { title: "Resources", description: "Guides, answers and help for getting your business running on WazaBolt." },
      about: { title: "About", description: "WazaBolt builds WhatsApp business automation for African businesses, starting in Cameroon." },
      contact: { title: "Contact", description: "Contact the WazaBolt team." },
      privacy: { title: "Privacy Policy", description: "How WazaBolt handles your data." },
      terms: { title: "Terms of Service", description: "The terms for using WazaBolt." },
      login: { title: "Log In", description: "Log in to WazaBolt." },
      register: { title: "Get Started", description: "Create your WazaBolt account." },
      forgotPassword: { title: "Reset your password", description: "Reset your WazaBolt password." },
      resetPassword: { title: "Choose a new password", description: "Choose a new WazaBolt password." },
      dashboard: { title: "Overview", description: "" },
      settings: { title: "Settings", description: "" },
      languages: { title: "Languages & AI style", description: "" },
    },
  },

  common: {
    brand: {
      tagline: "Your AI Business Assistant on WhatsApp.",
      headline: "Power your business on WhatsApp.",
      supporting: "Never miss a customer.",
      positioning: "WhatsApp Business Automation for Africa",
      trademarkNotice:
        "WazaBolt is an independent product. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of its respective owner.",
      home: "WazaBolt home",
    },
    nav: {
      home: "Home",
      features: "Features",
      howItWorks: "How It Works",
      pricing: "Pricing",
      solutions: "Solutions",
      faq: "FAQ",
      about: "About",
      contact: "Contact",
      resources: "Resources",
      privacy: "Privacy",
      terms: "Terms",
      login: "Login",
      startFree: "Start Free",
      startFreeShort: "Start Free",
      seeHowItWorks: "See How It Works",
      backToHome: "Back to home",
      openMenu: "Open menu",
      menu: "Menu",
      siteNavigation: "Site navigation",
      main: "Main",
      mobile: "Mobile",
      skipToContent: "Skip to content",
    },
    footer: { product: "Product", company: "Company", legal: "Legal" },
    status: {
      aiOnline: "AI Online",
      humanMode: "Human Mode",
      viaWhatsApp: "via WhatsApp",
      replying: "WazaBolt is replying",
      wazaboltAi: "WazaBolt AI",
      read: "Read",
      businessAccount: "Business account",
      online: "Online",
    },
    badges: { comingSoon: "Coming Soon", planned: "Planned", soon: "Soon", recommended: "Recommended" },
    errorPage: {
      label: "Something went wrong",
      title: "We couldn't load this page",
      text: "Please try again. If it keeps happening, log out and back in.",
      retry: "Try again",
    },
    language: {
      label: "Language",
      switcher: "Change language",
      names: { en: "English", fr: "Français" },
    },
  },

  hero: {
    badge: "Built for African Businesses",
    title: "Power your business on <hl>WhatsApp.</hl>",
    subtitle: "Never miss a <u>customer.</u>",
    lead: "<b>WazaBolt</b> is your AI business assistant on WhatsApp. It answers customer questions, shares products and prices, captures orders and hands conversations to your team when needed.",
    trust: {
      setup: { title: "Quick Setup", text: "In minutes, not days" },
      whatsapp: { title: "Works on WhatsApp", text: "No app for customers" },
      takeover: { title: "Human Takeover", text: "Step in any time" },
      languages: { title: "English, French & Pidgin", text: "Replies in their language" },
    },
    photoAlt: "A smiling shop owner in a colourful head wrap checks customer messages on her phone",
    orderCaptured: "New order captured",
    orderItem: "Robe en wax · {price}",
  },

  chatMockup: {
    business: "MJ Fashion",
    customer1: "Hi, do you have this dress in size L?",
    bot1: "Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?",
    product: "Robe en wax",
    productMeta: "15,000 FCFA · Size L",
    productAlt: "Robe en wax dress",
    orderNow: "Order Now",
    customer2: "Yes please! 🙏",
    bot2: "Great! I'll help you with your order.",
    caption: "Demo conversation",
  },

  solutionsStrip: {
    title: "Perfect for all types of businesses",
    text: "If your customers message you on WhatsApp, WazaBolt can help.",
  },

  problem: {
    eyebrow: "The problem",
    title: "Your customers are messaging. Are you answering?",
    description:
      "For most African businesses, WhatsApp is the shop front. But one person can't reply to every message, all day, every day.",
    unanswered: "Unanswered",
    chats: "23 chats",
    items: {
      busy: { title: "You're busy serving", text: "Customers message while you're with someone else — and they don't wait long." },
      buried: { title: "Messages get buried", text: "Customer chats sit between family groups and suppliers until they're forgotten." },
      repeat: { title: "Same questions, every day", text: "“How much?” “Where are you?” “Are you open?” — typed by hand, again and again." },
      night: { title: "Nobody replies at night", text: "Customers who message at 22:00 buy elsewhere by morning." },
      cold: { title: "Leads go cold", text: "A slow reply is a lost customer. They simply message the next shop." },
      orders: { title: "Orders slip through", text: "Order details spread across chats and voice notes are easy to miss." },
    },
    notifications: [
      { name: "Nadège", text: "How much is delivery to Bonapriso?", time: "22:14" },
      { name: "+237 6•• ••• 412", text: "Wuna di open for Sunday?", time: "21:52" },
      { name: "Serge", text: "Je veux 3 des bleus. Je peux commander ?", time: "21:30" },
      { name: "Clarisse", text: "Hello?? Still waiting", time: "20:05" },
    ],
  },

  howItWorks: {
    eyebrow: "How it works",
    title: "Live in four steps",
    description: "No new app for your customers, and no technical team needed.",
    steps: {
      connect: {
        title: "Connect your WhatsApp",
        text: "Connect your business WhatsApp account to WazaBolt through Meta's official WhatsApp Business Platform.",
      },
      add: {
        title: "Add your business",
        text: "Add products, services, FAQs, prices and policies. This is the only information the AI answers from.",
      },
      respond: {
        title: "Let WazaBolt respond",
        text: "Customers message your business as usual. WazaBolt replies in English, French or Pidgin — whichever they write in — and captures orders.",
      },
      takeover: {
        title: "Take over anytime",
        text: "Jump into any conversation from your dashboard. Automation pauses until you hand it back.",
      },
    },
    flowTitle: "How a message travels",
    flow: { customer: "Customer", whatsapp: "WhatsApp", wazabolt: "WazaBolt", business: "Your business" },
  },

  liveDemo: {
    eyebrow: "See it in action",
    title: "Real answers from <hl>your real data.</hl>",
    description:
      "Before WazaBolt replies, it checks your catalogue, stock and prices. Every answer comes from information you've given it — never guesswork.",
    takeoverNote: "Your team can take over this conversation at any moment.",
    illustration: "Example conversation for illustration.",
    customerName: "Sarah M.",
    logLabel: "Example customer conversation",
    automationReplying: "Automation is replying",
    takeOver: "Take over",
    automationLog: "Automation log",
    waiting: "Waiting for a message…",
    replay: "Replay",
    productSizes: "Sizes S–XL · in stock",
    productPrice: "15,000 FCFA",
    script: {
      customer1: "Hi, do you have this dress in size L?",
      checkLanguage: "Language detected: English",
      checkCatalogue: "Found in your catalogue: Robe en wax",
      checkStock: "Stock checked: size L available",
      checkPrice: "Price from your catalogue: 15,000 XAF",
      bot1: "Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?",
      customer2: "Yes please.",
      checkOrder: "Order #1042 started — visible in Orders",
      bot2: "Great! I'll help you with your order. What name and delivery area should I use?",
    },
  },

  features: {
    eyebrow: "Features",
    title: "A business assistant, not just a chatbot",
    description: "WazaBolt handles the routine work so you and your team can focus on the customers who need a person.",
    items: {
      answer: { title: "Answer Customers", text: "AI handles repetitive customer questions, any time of day." },
      share: { title: "Share Products", text: "Customers discover your products and verified prices in the chat." },
      capture: { title: "Capture Orders", text: "Turn conversations into structured orders your team can fulfil." },
      customers: { title: "Manage Customers", text: "Keep every customer's details, history and preferred language organised." },
      takeover: { title: "Human Takeover", text: "A staff member can take over any conversation at any time." },
      knowledge: { title: "Business Knowledge", text: "Teach WazaBolt your FAQs, services and policies." },
      analytics: { title: "Analytics", text: "Understand conversations, customers and orders." },
    },
    planned: {
      appointments: "Appointment booking",
      broadcasts: "Broadcasts to opted-in customers",
      mobileMoney: "Mobile Money payments",
      morePacks: "More African language packs",
    },
  },

  platform: {
    eyebrow: "Always on",
    title: "Your business never stops. <hl>Neither should your customer service.</hl>",
    description: "WazaBolt works inside your business WhatsApp as an AI business assistant — not just a chatbot.",
    pillars: {
      answer: {
        name: "Answer",
        text: "Reply to routine questions instantly — day and night — from the information you've given WazaBolt.",
        points: ["FAQs, hours and location", "English, French and Pidgin"],
      },
      share: {
        name: "Share",
        text: "Show products, prices and availability straight from your catalogue, right in the chat.",
        points: ["Product cards with prices", "Verified prices only"],
      },
      capture: {
        name: "Capture",
        text: "Turn “I want this” into a structured order your team can confirm and deliver.",
        points: ["Order details collected", "Human takeover any time"],
      },
      grow: {
        name: "Grow",
        text: "See what customers ask for, when they message and which conversations become orders.",
        points: ["Conversation and order analytics", "Customer records"],
      },
    },
    neverTitle: "What WazaBolt will never do",
    never: [
      "Invent a price, stock level or delivery fee",
      "Confirm a payment it hasn't seen",
      "Approve refunds or make promises for you",
    ],
    neverNote: "If it can't confirm something, it brings in your team.",
  },

  languagesSection: {
    eyebrow: "Multilingual from day one",
    title: "Your customers write the way they speak. <hl>WazaBolt understands.</hl>",
    description:
      "Customers switch between English, French and Pidgin — sometimes in one message. WazaBolt detects the language of every message, remembers each customer's preference and replies in your chosen style.",
    points: {
      detect: { title: "Automatic detection", text: "Every message is checked for English, French and Cameroonian Pidgin — no menus for customers." },
      mixed: { title: "Mixed messages understood", text: "“Bonjour, how much for dis robe?” is understood as one question, not three." },
      preference: { title: "Customer preferences", text: "Ask once — “reply in English please” — and WazaBolt remembers it for that customer." },
      style: { title: "Your response style", text: "Choose the tone, formality (vous or tu), emoji and reply length for your business." },
    },
    examplesTitle: "Same question, three languages",
    examples: [
      { lang: "EN", text: "How much is delivery to Bonamoussadi?" },
      { lang: "FR", text: "C'est combien la livraison à Bonamoussadi ?" },
      { lang: "Pidgin", text: "How much una di take for deliver for Bonamoussadi?" },
    ],
    note: "Pidgin replies can be switched off per business — WazaBolt then answers Pidgin messages in English.",
  },

  dashboardPreview: {
    eyebrow: "Your dashboard",
    title: "Not just a chatbot. <hl>Your whole WhatsApp business.</hl>",
    description:
      "Conversations, customers, orders and performance in one place — from your laptop or your phone. When automation hands a chat to you, you'll know straight away.",
    caption: "Dashboard preview with example data.",
  },

  dashboardMock: {
    windowTitle: "WazaBolt dashboard",
    greeting: "Good morning, MJ 👋",
    subtitle: "Here's what's happening with MJ Fashion today.",
    subtitleShort: "Here's what's happening today.",
    fromYesterday: "from yesterday",
    metrics: { conversations: "Conversations", customers: "Customers", orders: "Orders", resolution: "AI Resolution" },
    humanTitle: "Aïcha B. is now in Human Mode",
    humanText: "Refund request — WazaBolt paused and handed the chat to your team.",
    openChat: "Open chat",
    humanCompact: "1 chat in Human Mode",
    humanCompactReason: " · refund request",
    recentConversations: "Recent conversations",
    latestOrders: "Latest orders",
    mostAsked: "Most-asked products",
    askedToday: "Asked {count}× today",
    newCustomers: "New customers",
    conversations: [
      { name: "Sarah M.", message: "Do you have this dress in size L?" },
      { name: "Jean-Paul K.", message: "What are your opening hours on Sunday?" },
      { name: "Aïcha B.", message: "I want a refund for my order" },
      { name: "Marie T.", message: "Je veux passer une commande." },
    ],
    orderStatus: { new: "New", confirmed: "Confirmed", delivered: "Delivered" },
    nav: {
      groups: { main: "Main", business: "Business", ai: "AI", insights: "Insights", settings: "Settings" },
      items: {
        dashboard: "Dashboard",
        conversations: "Conversations",
        customers: "Customers",
        products: "Products",
        orders: "Orders",
        knowledge: "Knowledge",
        assistant: "AI Assistant",
        automations: "Automations",
        analytics: "Analytics",
        whatsapp: "WhatsApp",
        team: "Team",
        billing: "Billing",
        settings: "Settings",
      },
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Simple plans in FCFA",
    description: "Start free. Upgrade when your customers keep WazaBolt busy.",
    perMonth: "/month",
    aiConversations: "AI conversations / month",
    choose: "Choose {plan}",
    includesTitle: "Every plan includes",
    inclusions: [
      "Automated replies on your business WhatsApp",
      "Products, prices, FAQs and policies",
      "Human takeover at any time",
      "Customer and order records",
      "Replies in English, French and Pidgin",
    ],
    meteredTitle: "AI usage is metered — no “unlimited” surprises.",
    meteredText:
      "Each plan includes a monthly number of AI conversations. When you reach your limit, automatic replies stop and new messages wait for your team in the dashboard — nothing is lost. You can upgrade at any time.",
    plans: {
      free: { name: "Free", description: "Try WazaBolt with your own business number." },
      starter: { name: "Starter", description: "For small shops and solo businesses." },
      business: { name: "Business", description: "For busy teams answering customers every day." },
      pro: { name: "Pro", description: "For high-volume businesses and multiple agents." },
    },
  },

  security: {
    eyebrow: "Trust",
    title: "Your business data <hl>belongs to you.</hl>",
    description: "Your customers trust you with their messages. WazaBolt is built so you stay in control of that trust.",
    points: {
      auth: { title: "Secure authentication", text: "Dashboard sign-in with secure sessions. Only your team can get in." },
      tenant: { title: "Tenant-isolated data", text: "Every record is tied to your business. Other businesses can't see your data." },
      keys: { title: "Protected API credentials", text: "WhatsApp and AI keys stay on our servers — never in the browser or in logs." },
      control: { title: "Human control", text: "You decide when automation answers. Take over, pause or hand back in one tap." },
      knowledge: { title: "Business-specific knowledge", text: "The AI answers from your information only, and says so when it doesn't know." },
    },
  },

  faq: {
    eyebrow: "FAQ",
    title: "Questions, answered",
    items: [
      {
        q: "Is WazaBolt part of WhatsApp?",
        a: "No. WazaBolt is an independent business platform. You connect your business WhatsApp account to WazaBolt through Meta's official WhatsApp Business Platform, and WazaBolt helps you automate and manage those conversations. WazaBolt is not affiliated with WhatsApp or Meta.",
      },
      {
        q: "Do my customers need to download an app?",
        a: "No. Customers keep messaging your business on WhatsApp exactly as they do today. WazaBolt replies in the same conversation.",
      },
      {
        q: "What do I need to connect?",
        a: "A WhatsApp Business account connected through Meta's official WhatsApp Business Platform. WazaBolt never uses WhatsApp Web scraping or unofficial tools, which can get numbers banned.",
      },
      {
        q: "Will the AI make up prices or promise things I can't deliver?",
        a: "No. WazaBolt only answers from the products, prices, FAQs and policies you add. If it can't confirm something — a price, stock, a delivery fee, a payment — it tells the customer and hands the conversation to your team.",
      },
      {
        q: "Can I reply to customers myself?",
        a: "Yes. Open any conversation in your dashboard and tap Take Over. Automation pauses for that customer until you tap Return to AI.",
      },
      {
        q: "Which languages does it speak?",
        a: "English, French and Cameroonian Pidgin English. WazaBolt detects the language of each message — even when a customer mixes them — and replies in that language. If a customer asks for a language, it remembers. You choose which languages your business replies in, and the dashboard itself is available in English and French.",
      },
      {
        q: "Can I control how it sounds?",
        a: "Yes. Choose the tone, formality (for example “vous” or “tu” in French), emoji use and reply length. You can also set one default language or let it follow each customer.",
      },
      {
        q: "What happens when I reach my monthly AI conversation limit?",
        a: "Automatic replies stop and new messages wait for your team in the dashboard, so nothing is lost. You can upgrade your plan at any time.",
      },
      {
        q: "Is WazaBolt only for Cameroon?",
        a: "Cameroon is our first market, with prices in XAF and English, French and Pidgin support. WazaBolt is built around country language packs so more African countries and languages can follow.",
      },
    ],
  },

  cta: {
    title: "Ready to stop missing customers?",
    text: "Power your business on WhatsApp. Give every customer a fast, reliable answer — day and night, in their language.",
  },

  pages: {
    features: {
      eyebrow: "Features",
      title: "More than a chatbot. A business assistant.",
      description:
        "WazaBolt answers the routine questions, turns conversations into orders and keeps every customer organised — in their language, with your team always in control.",
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "From first message to finished order",
      description:
        "WazaBolt connects to your business WhatsApp account and turns conversations into answers, orders and loyal customers.",
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Pay for what your customers use",
      description: "Every plan is priced in FCFA with a clear monthly allowance of AI conversations.",
    },
    solutions: {
      eyebrow: "Solutions",
      title: "Built for the way your business sells",
      description: "If your customers message you on WhatsApp, WazaBolt can help you answer, sell and follow up.",
    },
    resources: {
      eyebrow: "Resources",
      title: "Everything you need to get started",
      description: "Answers, guides and help for running your business on WhatsApp with WazaBolt.",
      items: {
        how: {
          title: "How WazaBolt works",
          text: "A walkthrough of connecting WhatsApp, adding your business information and letting automation respond.",
          cta: "See how it works",
        },
        guides: {
          title: "Setup guides",
          text: "Step-by-step guides for connecting your business WhatsApp account and building your catalog.",
          cta: "Coming soon",
        },
        help: { title: "Help & contact", text: "Questions before you start? Reach the WazaBolt team.", cta: "Contact us" },
      },
    },
    about: {
      eyebrow: "About WazaBolt",
      title: "Helping African businesses move at the speed of their customers",
      description:
        "WazaBolt is a business automation platform that helps companies use WhatsApp to answer customers, take orders and grow. We're starting in Cameroon and building for the whole continent.",
      principles: [
        {
          title: "Built for African businesses",
          text: "Prices in FCFA, replies in English, French and Pidgin, and a product designed around how businesses here already sell: on WhatsApp.",
        },
        {
          title: "Honest automation",
          text: "WazaBolt only answers from information a business has given it. When it can't confirm something, it says so and brings in a person.",
        },
        {
          title: "Your team stays in charge",
          text: "Automation handles the routine. People handle the rest — and can take over any conversation at any moment.",
        },
      ],
    },
    comingSoon: {
      note: "This page is being written and will be published before launch.",
    },
    notFound: {
      label: "Error 404",
      title: "This page took a wrong turn",
      text: "We couldn't find the page you were looking for.",
    },
  },

  solutions: {
    items: {
      retail: {
        name: "Retail",
        useCases: ["Share products, prices and stock from your catalogue", "Capture orders with delivery details", "Answer opening-hours and location questions"],
        exampleQuestion: "Do you still have the 5L cooking oil?",
      },
      restaurants: {
        name: "Restaurants",
        useCases: ["Share the menu and prices", "Take pickup and delivery orders", "Answer “Are you open now?”"],
        exampleQuestion: "Is the ndolé available today?",
      },
      hotels: {
        name: "Hotels",
        useCases: ["Answer questions about rooms, rates and check-in times", "Collect booking requests for reception", "Share directions and hotel policies"],
        exampleQuestion: "What time is check-in?",
      },
      fashion: {
        name: "Fashion",
        useCases: ["Share items with sizes and prices", "Capture orders and delivery addresses", "Answer delivery-fee questions from your own rates"],
        exampleQuestion: "Do you have this dress in size L?",
      },
      beauty: {
        name: "Beauty & Salons",
        useCases: ["Share your service menu and prices", "Collect appointment requests", "Answer questions about products you sell"],
        exampleQuestion: "How much are knotless braids?",
      },
      realEstate: {
        name: "Real Estate",
        useCases: ["Share listing details and prices", "Collect buyer and tenant details", "Pass viewing requests to your agents"],
        exampleQuestion: "Is the 2-bedroom in Bonamoussadi still available?",
      },
      schools: {
        name: "Schools",
        useCases: ["Answer questions about fees and enrolment dates", "Share the list of required documents", "Collect parent enquiries for the office"],
        exampleQuestion: "When does registration for next year start?",
      },
      services: {
        name: "Professional Services",
        useCases: ["Explain your services and fees", "Collect client details and requests", "Hand complex questions to your team"],
        exampleQuestion: "What documents do I need for a business registration?",
      },
    },
  },

  auth: {
    points: [
      "Automated replies from your own catalogue and FAQs",
      "Replies in English, French and Pidgin",
      "Orders captured inside the conversation",
      "Your team can take over any chat, any time",
    ],
    notConfigured:
      "Accounts aren't open yet: the authentication service hasn't been connected. Set the Supabase environment variables to enable sign-up and login.",
    fields: {
      email: "Email",
      password: "Password",
      fullName: "Your name",
      businessName: "Business name",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordHint: "At least 8 characters, with letters and numbers.",
      showPassword: "Show password",
      hidePassword: "Hide password",
    },
    login: {
      title: "Welcome back",
      description: "Log in to manage your WhatsApp business.",
      newHere: "New to WazaBolt?",
      createAccount: "Create an account",
      forgot: "Forgot password?",
      submit: "Log in",
      pending: "Logging in…",
      linkInvalid: "That link is invalid or has expired. Please try again or request a new one.",
      signedOut: "You've been logged out.",
    },
    register: {
      title: "Get started with WazaBolt",
      description: "Create your account — free for 50 AI conversations every month.",
      haveAccount: "Already have an account?",
      login: "Log in",
      submit: "Create account",
      pending: "Creating your account…",
      agree: "By creating an account you agree to our <terms>Terms</terms> and <privacy>Privacy Policy</privacy>.",
      checkEmailTitle: "Check your email",
      checkEmailText: "We sent a confirmation link to <b>{email}</b>. Open it to activate your WazaBolt account.",
      checkEmailHelp: "Didn't get it? Check your spam folder, or <login>log in</login> if you've already confirmed.",
    },
    forgot: {
      title: "Reset your password",
      description: "Enter the email you use for WazaBolt and we'll send you a reset link.",
      remembered: "Remembered it?",
      backToLogin: "Back to log in",
      submit: "Send reset link",
      pending: "Sending…",
      sent: "If an account exists for <b>{email}</b>, we've sent a link to reset your password. It expires in one hour.",
    },
    reset: {
      title: "Choose a new password",
      forEmail: "For <b>{email}</b>",
      expiredTitle: "Link expired",
      expiredDescription: "Password reset links work once and expire after an hour.",
      expiredText: "We couldn't verify your reset link. Please request a new one.",
      requestNew: "Request a new link",
      submit: "Save new password",
      pending: "Saving…",
      continue: "Continue",
      updated: "Your password has been updated.",
    },
    errors: {
      not_configured: "Accounts aren't available yet — the authentication service hasn't been configured.",
      invalid_form: "Please fix the highlighted fields.",
      invalid_credentials: "That email and password don't match. Try again or reset your password.",
      email_not_confirmed: "Please confirm your email first — check your inbox for the link we sent.",
      weak_password: "That password is too weak. Use at least 8 characters with letters and numbers.",
      same_password: "Your new password must be different from your current one.",
      rate_limited: "Too many attempts. Please wait a few minutes and try again.",
      signup_disabled: "New sign-ups are currently closed.",
      signup_failed: "We couldn't create that account. If you already have one, log in or reset your password.",
      reset_expired: "Your reset link has expired. Request a new one to continue.",
      unknown: "Something went wrong. Please try again.",
    },
    validation: {
      email_invalid: "Enter a valid email address.",
      password_required: "Enter your password.",
      password_min: "Use at least 8 characters.",
      password_max: "Use 72 characters or fewer.",
      password_letter: "Include at least one letter.",
      password_number: "Include at least one number.",
      password_mismatch: "Passwords don't match.",
      name_required: "Enter your name.",
      business_required: "Enter your business name.",
      too_long: "Use 120 characters or fewer.",
      style_notes_too_long: "Use 500 characters or fewer.",
      languages_required: "Choose at least one language.",
      default_language_enabled: "The default language must be one of the reply languages.",
    },
  },

  dashboard: {
    title: "Dashboard",
    nav: {
      label: "Dashboard",
      open: "Open navigation",
      navigation: "Navigation",
      sections: "Dashboard sections",
      groups: { main: "Main", business: "Business", ai: "AI", insights: "Insights", settings: "Settings" },
      items: {
        dashboard: "Dashboard",
        conversations: "Conversations",
        customers: "Customers",
        products: "Products",
        orders: "Orders",
        knowledge: "Knowledge",
        languages: "Languages & style",
        assistant: "AI Assistant",
        automations: "Automations",
        analytics: "Analytics",
        whatsapp: "WhatsApp",
        team: "Team",
        billing: "Billing",
        settings: "Settings",
      },
    },
    header: {
      yourBusiness: "Your business",
      whatsappNotConnected: "WhatsApp not connected",
      accountSettings: "Account settings",
      roles: { owner: "Owner", admin: "Admin", agent: "Agent" },
    },
    userCard: { yourAccount: "Your account", logout: "Log out" },
    overview: {
      welcomeConfirmed: "Your email is confirmed — welcome to WazaBolt!",
      welcome: "Welcome, {name}",
      there: "there",
      businessReady: "{business} is set up.",
      accountReady: "Your account is ready.",
      next: "Here's what comes next.",
      activity: "Activity",
      stats: { conversations: "Conversations", customers: "Customers", orders: "Orders" },
      statsHint: "Appears once WhatsApp is connected",
      setupTitle: "Set up your AI assistant",
      setupText: "Seven short steps. Languages and response style can already be set.",
      progress: "{done} of {total} done",
      accountCreated: "Account created",
      steps: {
        business: { title: "Business information", text: "Opening hours, location and delivery areas." },
        products: { title: "Products & services", text: "Your catalog with prices and availability." },
        faqs: { title: "FAQs & policies", text: "The answers WazaBolt is allowed to give." },
        languages: { title: "Languages & response style", text: "Reply languages, tone and formality." },
        whatsapp: { title: "Connect WhatsApp", text: "Link your WhatsApp Business account." },
        test: { title: "Test WazaBolt", text: "Try real questions before customers do." },
        live: { title: "Go live", text: "Switch automation on for your customers." },
      },
      open: "Open",
      settingsPrompt: "Need to change your name, password or dashboard language?",
      openSettings: "Open settings",
    },
    settings: {
      title: "Settings",
      account: { title: "Account", description: "Your personal login details.", name: "Name", email: "Email" },
      interface: {
        title: "Dashboard language",
        description: "The language of the WazaBolt dashboard and the emails we send you.",
        saved: "Dashboard language updated.",
      },
      business: {
        title: "Business",
        description: "Editing comes with guided setup in the next update.",
        name: "Business name",
        role: "Your role",
        country: "Country",
        currency: "Currency",
        timezone: "Timezone",
        replyLanguages: "Reply languages",
        defaultLanguage: "Default language",
        manageLanguages: "Manage languages & AI style",
      },
      password: {
        title: "Password",
        description: "Choose a strong password you don't use anywhere else.",
        submit: "Update password",
      },
      countries: { CM: "Cameroon" },
    },
    languages: {
      title: "Languages & AI style",
      intro:
        "How your WhatsApp assistant chooses a language and how it sounds. These settings are saved now and used as soon as WhatsApp is connected.",
      back: "Back to settings",
      readOnly: "Only the business owner or an admin can change these settings.",
      replyLanguages: {
        title: "Reply languages",
        description: "Languages your assistant may reply in. Customers can still write in any of them.",
        default: "Default",
        setDefault: "Make default",
        defaultHelp: "The default is used when a customer's language isn't clear or isn't enabled.",
        fallbackNote: "When off, Pidgin messages are answered in English.",
        beta: "Beta",
      },
      mode: {
        title: "Language choice",
        auto: { label: "Follow each customer", text: "Detect the language of each message, remember what each customer prefers and reply in it." },
        fixed: { label: "Always use the default language", text: "Reply in the default language whatever the customer writes in." },
      },
      style: {
        title: "Response style",
        description: "Applies to every reply language.",
        tone: { label: "Tone", friendly: "Friendly", professional: "Professional", warm: "Warm" },
        formality: {
          label: "Formality",
          informal: "Informal",
          neutral: "Neutral",
          formal: "Formal",
          help: "In French, neutral and formal always use “vous”; informal uses “tu” only if the customer does.",
        },
        emoji: { label: "Emoji", none: "None", light: "A few", expressive: "Expressive" },
        length: { label: "Reply length", short: "Short", medium: "Medium", detailed: "Detailed" },
        mirror: {
          label: "Mirror mixed language",
          text: "When a customer mixes languages, allow a few of their own words in the reply (e.g. an English product word in a French reply).",
        },
        notes: {
          label: "Notes for your assistant",
          placeholder: "e.g. Call customers “Ma” or “Sir”. Never promise same-day delivery.",
          help: "Optional, up to 500 characters.",
        },
      },
      save: "Save settings",
      saving: "Saving…",
      saved: "Settings saved.",
      errors: {
        forbidden: "Only the business owner or an admin can change these settings.",
        invalid: "Please check the highlighted settings.",
        unknown: "We couldn't save your settings. Please try again.",
      },
      preview: {
        title: "Try language detection",
        description:
          "Type a customer message to see which language WazaBolt detects and which language it would reply in with the settings above. This runs the real detection rules — no AI reply is generated.",
        placeholder: "e.g. Bonjour, how much for dis robe?",
        detected: "Detected",
        mixedWith: "mixed with {language}",
        none: "No clear language (short message or emoji)",
        confidence: "Confidence",
        request: "Customer asked for",
        replyIn: "Would reply in",
        reasons: {
          business_fixed: "Your business always uses its default language.",
          explicit_request: "The customer asked for this language — it will be remembered.",
          customer_preference: "The customer's saved preference.",
          detected: "Detected in this message.",
          conversation: "The language the conversation is already in.",
          inferred_preference: "The language this customer usually writes in.",
          business_default: "Your default language.",
        },
        fallback: "{from} isn't enabled, so the assistant uses {to}.",
        samples: "Examples",
      },
    },
    loading: "Loading",
  },
};

export default en;
export type Messages = typeof en;
