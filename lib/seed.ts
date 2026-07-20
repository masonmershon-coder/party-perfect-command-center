import type {
  Agent,
  GrokModel,
  InventoryItem,
  MarketingItem,
  EmailItem,
  BookkeepingEntry,
  Task,
  SocialPost,
  SocialComment,
  SocialDirectMessage,
  SavedReport,
} from "./types";

const COMPANY = "Party Perfect Event Rentals";
const LOCATION = "Tulsa, Oklahoma";

export const GROK_CHAT_AGENT_ID = "agent-grok-assistant";
export const MIKE_OPERATIONS_AGENT_ID = "agent-mike-operations";
export const MADISON_COMMS_AGENT_ID = "agent-madison-comms";

export const DEFAULT_AGENTS: Omit<Agent, "createdAt" | "updatedAt">[] = [
  {
    id: MIKE_OPERATIONS_AGENT_ID,
    slug: "mike-operations",
    name: "Mike - Operations Manager",
    icon: "📱",
    description:
      "Weekly recaps via SMS, task & inventory monitoring, and business ops summaries.",
    goal: `You are Mike, the Operations Manager for ${COMPANY} in ${LOCATION}. Monitor day-to-day operations, tasks, inventory levels, inbox and social queues, flag urgent quotes and bookings, prepare weekly recaps, and keep leadership informed via SMS. Be direct, actionable, and focused on what needs attention today.`,
    status: "idle",
    model: "grok-build-0.1",
  },
  {
    id: MADISON_COMMS_AGENT_ID,
    slug: "madison-comms",
    name: "Madison - Social & Client Communications",
    icon: "💬",
    description:
      "Warm, upbeat voice for FB/IG, Tulsa trends, Michelle client emails, and general inbox.",
    goal: `You are Madison, Social & Client Communications for ${COMPANY} in ${LOCATION}. Write warm, friendly, upbeat responses for Facebook and Instagram comments and DMs. Monitor Tulsa event engagement trends. Draft quick replies and help with Michelle's big client emails plus the general company inbox. Sound personable, celebratory, and on-brand — never stiff or robotic.`,
    status: "idle",
    model: "grok-build-0.1",
  },
  {
    id: GROK_CHAT_AGENT_ID,
    slug: "grok-assistant",
    name: "Grok Assistant",
    icon: "🤖",
    description: "General AI assistant for Party Perfect operations.",
    goal: `You are a versatile AI assistant for ${COMPANY}, a premium party and event rental company in ${LOCATION}. Help with any business question: operations, customer service, logistics, or strategy. Be professional, warm, and concise.`,
    status: "idle",
    model: "grok-build-0.1",
  },
];

export const DEFAULT_TASKS: Omit<Task, "id" | "createdAt" | "updatedAt">[] = [
  {
    agentId: MIKE_OPERATIONS_AGENT_ID,
    title: "Weekly ops recap for management",
    description:
      "Summarize inbox, social queue, tasks, and send SMS recap to manager.",
    status: "todo",
    progress: 0,
    priority: "high",
  },
  {
    agentId: MADISON_COMMS_AGENT_ID,
    title: "Reply to Tulsa wedding inquiry on Instagram",
    description:
      "Warm, friendly response to comment asking about June tent availability.",
    status: "in_progress",
    progress: 55,
    priority: "high",
  },
  {
    agentId: MADISON_COMMS_AGENT_ID,
    title: "Draft Michelle client follow-up — charity gala",
    description:
      "Professional but warm email for big client centerpieces consult.",
    status: "todo",
    progress: 0,
    priority: "medium",
  },
  {
    agentId: MIKE_OPERATIONS_AGENT_ID,
    title: "Review Catch Up queue — outstanding replies",
    description:
      "Prioritize unreplied emails and FB/IG comments from last 30 days.",
    status: "in_progress",
    progress: 40,
    priority: "medium",
  },
  {
    agentId: MADISON_COMMS_AGENT_ID,
    title: "March spring promo social captions",
    description:
      "Instagram carousel copy for spring wedding season in Tulsa.",
    status: "done",
    progress: 100,
    priority: "low",
    result: "Captions approved and scheduled in Marketing.",
  },
];

export const DEFAULT_INVENTORY: Omit<InventoryItem, "id" | "updatedAt">[] = [
  {
    name: "40x80 Frame Tent",
    category: "Tents",
    quantity: 6,
    available: 4,
    pricePerDay: 850,
    status: "available",
  },
  {
    name: "Gold Chiavari Chair",
    category: "Seating",
    quantity: 400,
    available: 280,
    pricePerDay: 8,
    status: "available",
  },
  {
    name: "60\" Round Table",
    category: "Tables",
    quantity: 120,
    available: 95,
    pricePerDay: 12,
    status: "available",
  },
  {
    name: "Ivory Satin Linens",
    category: "Linens",
    quantity: 300,
    available: 45,
    pricePerDay: 15,
    status: "available",
    notes: "Low stock — reorder recommended",
  },
  {
    name: "12x12 Dance Floor",
    category: "Flooring",
    quantity: 8,
    available: 6,
    pricePerDay: 275,
    status: "available",
  },
  {
    name: "LED Uplighting (set of 10)",
    category: "Lighting",
    quantity: 15,
    available: 12,
    pricePerDay: 95,
    status: "available",
  },
  {
    name: "Champagne Spandex Chair Cover",
    category: "Linens",
    quantity: 200,
    available: 18,
    pricePerDay: 4,
    status: "maintenance",
    notes: "18 available — rest in cleaning rotation",
  },
];

export const DEFAULT_MARKETING: Omit<MarketingItem, "id" | "updatedAt">[] = [
  {
    title: "Spring Wedding Season Launch",
    channel: "Instagram",
    status: "scheduled",
    content:
      "Tulsa couples — your dream wedding setup is one quote away. Tents, tables, and timeless elegance from Party Perfect. Book your spring date today!",
    scheduledDate: "2026-03-15",
  },
  {
    title: "Corporate Event Packages Email",
    channel: "Email",
    status: "draft",
    content:
      "Introduce our corporate gala packages for Tulsa businesses — tent, AV-ready layout, premium seating.",
  },
  {
    title: "Google Ads — Tulsa Event Rentals",
    channel: "Google Ads",
    status: "draft",
    content:
      "Placeholder: Search campaigns for 'party rentals Tulsa', 'wedding tent rental Broken Arrow', and 'corporate event rentals'. Connect Google Ads API for live spend and conversion data.",
  },
  {
    title: "Prom Season TikTok Concept",
    channel: "TikTok",
    status: "published",
    content:
      "Before/after venue transformation reel featuring gold chiavari + uplighting.",
    scheduledDate: "2026-02-01",
  },
];

export const DEFAULT_EMAILS: Omit<EmailItem, "id" | "updatedAt">[] = [
  {
    accountId: "company",
    subject: "Wedding tent quote request — June 14",
    sender: "Sarah Johnson",
    senderEmail: "sarah.johnson@gmail.com",
    preview:
      "Hi! We're planning a backyard wedding in Broken Arrow and need a 40x80 tent plus seating for 150…",
    body: `Hi Party Perfect team,

We're planning a backyard wedding in Broken Arrow on June 14 and would love a quote for:
- 40x80 frame tent
- 150 gold chiavari chairs
- 20 round tables with ivory linens
- Delivery and setup

Could you send pricing and availability? Our budget is around $8,500.

Thank you!
Sarah Johnson
(918) 555-0142`,
    receivedAt: "2026-07-05T14:22:00.000Z",
    status: "unread",
    priority: "business",
  },
  {
    accountId: "company",
    subject: "Corporate gala inquiry — Cain's Ballroom",
    sender: "Events Team",
    senderEmail: "events@cainsballroom.com",
    preview:
      "Following up on our call about a 200-guest corporate gala package for September…",
    body: `Hello,

Following up on our call about a 200-guest corporate gala in September. We need:
- Premium seating and tables
- Stage platform
- Uplighting in brand colors (navy & gold)
- Load-in window starting at 8 AM

Please confirm availability and send a formal proposal.

Best,
Cain's Ballroom Events`,
    receivedAt: "2026-07-04T16:45:00.000Z",
    status: "read",
    priority: "business",
  },
  {
    accountId: "company",
    subject: "Re: Linen inventory for prom season",
    sender: "Union High School",
    senderEmail: "activities@unionhigh.edu",
    preview:
      "Can you reserve 300 champagne spandex chair covers for our April 18 prom?",
    body: `Good afternoon,

Can you reserve 300 champagne spandex chair covers for our April 18 prom? We also need a quote for 40 round tables.

Please let us know lead time and deposit requirements.

Union High Activities Office`,
    receivedAt: "2026-07-03T11:10:00.000Z",
    status: "read",
    priority: "business",
  },
  {
    accountId: "josh",
    subject: "Vendor partnership — Tulsa Wedding Expo",
    sender: "Tulsa Bridal Association",
    senderEmail: "expo@tulsabridal.org",
    preview:
      "Josh, we'd love Party Perfect as a featured vendor at the March expo…",
    body: `Hi Josh,

We'd love Party Perfect as a featured vendor at the March Tulsa Wedding Expo. Booth spaces are $1,200 and include premium placement near the main stage.

Are you available for a quick call this week to discuss sponsorship tiers?

Thanks,
Tulsa Bridal Association`,
    receivedAt: "2026-07-05T09:30:00.000Z",
    status: "unread",
    priority: "business",
  },
  {
    accountId: "josh",
    subject: "Delivery route confirmation — Saturday events",
    sender: "Warehouse Team",
    senderEmail: "warehouse@partyperfecteventrental.com",
    preview:
      "Josh, confirming three Saturday deliveries: Bixby, Owasso, and downtown Tulsa…",
    body: `Josh,

Confirming Saturday delivery schedule:
1. 7:00 AM — Bixby corporate picnic (tables/chairs)
2. 10:30 AM — Owasso birthday party (tent package)
3. 2:00 PM — Downtown Tulsa gala (full package)

All trucks loaded except chiavari count for stop #3 — please approve extra 20 chairs.

Warehouse`,
    receivedAt: "2026-07-04T18:00:00.000Z",
    status: "read",
    priority: "general",
  },
  {
    accountId: "josh",
    subject: "Insurance certificate request",
    sender: "River Spirit Casino",
    senderEmail: "events@riverspirittulsa.com",
    preview:
      "Please send updated COI naming River Spirit Casino as additional insured…",
    body: `Josh,

Before we finalize the contract for the August charity gala, please send an updated certificate of insurance naming River Spirit Casino as additional insured.

Deadline: July 12.

Events Department
River Spirit Casino`,
    receivedAt: "2026-07-02T13:20:00.000Z",
    status: "read",
    priority: "urgent",
  },
  {
    accountId: "michelle",
    subject: "Design consult — black & gold charity gala",
    sender: "Jennifer Walsh",
    senderEmail: "j.walsh@tulsacharity.org",
    preview:
      "Michelle, we loved the mood board! Can we schedule a follow-up on centerpieces?",
    body: `Hi Michelle,

We loved the black & gold mood board you sent! The board loved it too.

Can we schedule a follow-up to finalize:
- Centerpiece options within $85/table
- Stage backdrop draping
- Dance floor size for 180 guests

I'm free Thursday or Friday afternoon.

Warmly,
Jennifer`,
    receivedAt: "2026-07-05T15:05:00.000Z",
    status: "unread",
    priority: "business",
  },
  {
    accountId: "michelle",
    subject: "Fabric swatch approval — ivory vs champagne",
    sender: "St. John's Episcopal",
    senderEmail: "office@stjohnstulsa.org",
    preview:
      "The bride prefers champagne linens over ivory. Do you have swatches we can review?",
    body: `Hello Michelle,

The bride prefers champagne linens over ivory for the September wedding. Do you have swatches we can review this week?

Also confirming the 12x12 dance floor and uplighting package from your earlier quote.

St. John's Episcopal Office`,
    receivedAt: "2026-07-04T10:15:00.000Z",
    status: "read",
    priority: "business",
  },
  {
    accountId: "michelle",
    subject: "Instagram feature request",
    sender: "Tulsa Bride Magazine",
    senderEmail: "editor@tulsabride.com",
    preview:
      "We'd like to feature your gold chiavari setup in our fall issue…",
    body: `Hi Michelle,

We're producing a fall issue spotlight on Tulsa rental companies and would love to feature your gold chiavari + uplighting setup from the Walsh gala.

Can you share 5–6 high-res photos and a short quote about your design philosophy?

Editorial Team
Tulsa Bride Magazine`,
    receivedAt: "2026-07-01T08:40:00.000Z",
    status: "read",
    priority: "low",
  },
];

export const DEFAULT_SOCIAL: {
  posts: Omit<SocialPost, "id">[];
  comments: Omit<SocialComment, "id">[];
  messages: Omit<SocialDirectMessage, "id">[];
} = {
  posts: [
    {
      platform: "instagram",
      caption:
        "Spring wedding season is here ✨ Gold chiavari + ivory linens at a Broken Arrow garden wedding. DM us for your quote!",
      publishedAt: "2026-07-04T18:00:00.000Z",
      likes: 284,
      comments: 18,
      reach: 4200,
      status: "published",
    },
    {
      platform: "facebook",
      caption:
        "Corporate gala packages now booking for fall — tents, premium seating, uplighting, and full setup for Tulsa venues.",
      publishedAt: "2026-07-03T14:30:00.000Z",
      likes: 96,
      comments: 7,
      reach: 2100,
      status: "published",
    },
    {
      platform: "instagram",
      caption:
        "Behind the scenes: loading out a 40x80 tent for this weekend's charity gala downtown.",
      publishedAt: "2026-07-01T10:00:00.000Z",
      likes: 412,
      comments: 24,
      reach: 6800,
      status: "published",
    },
  ],
  comments: [
    {
      postId: "post-instagram-1",
      platform: "instagram",
      author: "Sarah J.",
      authorHandle: "@sarahjohnson_weds",
      text: "Love this setup! What would a 150-guest package run for June?",
      createdAt: "2026-07-05T11:20:00.000Z",
      status: "unread",
    },
    {
      postId: "post-instagram-1",
      platform: "instagram",
      author: "Tulsa Bride Co.",
      authorHandle: "@tulsabride",
      text: "Gorgeous as always! Can we feature this in our vendor spotlight?",
      createdAt: "2026-07-04T20:15:00.000Z",
      status: "read",
    },
    {
      postId: "post-facebook-1",
      platform: "facebook",
      author: "Cain's Ballroom Events",
      authorHandle: "CainsBallroom",
      text: "Interested in your corporate package for September — can someone call us?",
      createdAt: "2026-07-05T09:45:00.000Z",
      status: "unread",
    },
    {
      postId: "post-facebook-1",
      platform: "facebook",
      author: "Mike R.",
      authorHandle: "Mike Reynolds",
      text: "Do you deliver to Owasso for backyard events?",
      createdAt: "2026-07-03T16:00:00.000Z",
      status: "read",
    },
  ],
  messages: [
    {
      platform: "instagram",
      sender: "Jennifer Walsh",
      senderHandle: "@j.walsh.events",
      preview: "Hi! Saw your gala post — need a quote for 180 guests…",
      body: "Hi! Saw your gala post — need a quote for 180 guests with black & gold theming. Available for a call Thursday?",
      receivedAt: "2026-07-05T13:10:00.000Z",
      status: "unread",
    },
    {
      platform: "facebook",
      sender: "Union High Activities",
      senderHandle: "Union High School",
      preview: "Prom rental inquiry — 300 chair covers + 40 tables…",
      body: "Prom rental inquiry — 300 chair covers + 40 tables for April 18. What are your deposit terms?",
      receivedAt: "2026-07-04T11:30:00.000Z",
      status: "read",
    },
    {
      platform: "instagram",
      sender: "River Spirit Casino",
      senderHandle: "@riverspirittulsa",
      preview: "Can you send portfolio shots from recent casino events?",
      body: "Can you send portfolio shots from recent casino events? Planning a charity gala for August.",
      receivedAt: "2026-07-02T15:00:00.000Z",
      status: "read",
    },
  ],
};

export const DEFAULT_BOOKKEEPING: Omit<BookkeepingEntry, "id" | "updatedAt">[] = [
  {
    vendor: "Tent Supply Co.",
    description: "Frame tent maintenance & replacement parts",
    amount: 2450,
    status: "pending",
    dueDate: "2026-03-20",
  },
  {
    vendor: "Linens Direct",
    description: "Ivory satin linen restock order",
    amount: 1875,
    status: "paid",
    dueDate: "2026-02-28",
  },
  {
    vendor: "OK Power & Lighting",
    description: "Warehouse electrical upgrade",
    amount: 3200,
    status: "overdue",
    dueDate: "2026-02-15",
  },
];

export const DEFAULT_REPORTS: Omit<SavedReport, "id">[] = [
  {
    type: "weekly-recap",
    title: "Weekly Operations Recap",
    content:
      "Party Perfect Weekly: 9 emails need reply, 3 social comments waiting. 2 tasks in progress, 3 to do. 12 outstanding items in Catch Up queue. Priority: Reply to Tulsa wedding inquiry on Instagram.",
    generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    sentViaSms: true,
    generatedBy: "mike-operations",
  },
];

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function defaultModelForAgent(slug: string): GrokModel {
  return slug === "madison-comms" ? "grok-build-0.1" : "grok-build-0.1";
}
