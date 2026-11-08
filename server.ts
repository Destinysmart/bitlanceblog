import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
// import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp as initClientApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
} from "firebase/firestore";

import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

const isESM = false;

const appDir = process.cwd();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Resolve DB file dynamically with multiple path options to support local fallback seeding.
let DB_FILE = path.join(process.cwd(), "db.json");
const possiblePaths = [
  path.join(process.cwd(), "db.json"),
  path.join(appDir, "db.json"),
  path.join(appDir, "../db.json"),
  path.join(appDir, "..", "db.json")
];

for (const p of possiblePaths) {
  try {
    if (fs.existsSync(p)) {
      DB_FILE = p;
      break;
    }
  } catch (_) { }
}

// Initialize dotenv first
try {
  dotenv.config({ path: ".env.local" });
  dotenv.config();
} catch (e) {
  console.warn("dotenv loading skipped or failed", e);
}



const firebaseApp = initClientApp({
  apiKey: "AIzaSyC3u6AUI8q8RI7rnjFCbBQsEDlBel0Y8Tc",
  authDomain: "bitlanceblog.firebaseapp.com",
  projectId: "bitlanceblog",
  storageBucket: "bitlanceblog.firebasestorage.app",
  messagingSenderId: "479648612879",
  appId: "1:479648612879:web:2c2acc06ef7cc68e12597a",
  measurementId: "G-EN16PSL38F",
});
const db = getFirestore(firebaseApp);

const articlesCol = () => collection(db, "articles");
const draftsCol = () => collection(db, "drafts");
const authorsCol = () => collection(db, "authors");
const categoriesCol = () => collection(db, "categories");
const tagsCol = () => collection(db, "tags");
const settingsCol = () => collection(db, "settings");
const featuredCol = () => collection(db, "featured");
const usersCol = () => collection(db, "users");
const mediaCol = () => collection(db, "media");

// ---------------------------------------------------------------------------
// Cloudinary Setup
// ---------------------------------------------------------------------------
let isCloudinaryConfigured = false;
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  isCloudinaryConfigured = true;
  console.log("Cloudinary integration initialized successfully.");
} else {
  console.warn("Cloudinary configuration missing. Falling back to local/serverless image uploads.");
}

// Ensure local uploads directory exists
const UPLOADS_DIR = process.env.VERCEL ? path.join("/tmp", "uploads") : path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create uploads directory, filesystem might be read-only:", e);
}

// ---------------------------------------------------------------------------
// Automated Database Seeding (JSON to Firestore)
// ---------------------------------------------------------------------------
async function seedFirestoreIfNeeded() {
  try {
    const articlesSnap = await getDocs(articlesCol());
    if (articlesSnap.empty) {
      console.log("Firestore articles collection is empty. Bootstrapping initial database seeding...");

      let seedData: any = null;
      if (fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, "utf-8");
          seedData = JSON.parse(raw);
        } catch (_) { }
      }

      // Default static fallback seeding if db.json is missing or corrupt
      if (!seedData) {
        seedData = {
          categories: [
            { id: "c1", name: "Product Updates", slug: "product-updates" },
            { id: "c2", name: "Success Stories", slug: "success-stories" },
            { id: "c3", name: "Getting Started", slug: "getting-started" },
            { id: "c4", name: "Tutorials", slug: "tutorials" },
            { id: "c5", name: "Bitcoin & Lightning", slug: "bitcoin-lightning" },
            { id: "c6", name: "Insights", slug: "insights" },
          ],
          users: [
            {
              id: "admin-1",
              role: "admin",
              name: "BitLance Team",
              avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
            },
            {
              id: "pub-1",
              role: "publisher",
              name: "BitLance Team",
              avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
            }
          ],
          articles: [],
          media: []
        };
      }

      // 1. Seed Categories
      for (const cat of seedData.categories || []) {
        await setDoc(doc(db, "categories", cat.id), cat);
      }

      // 2. Seed Users & Authors
      for (const u of seedData.users || []) {
        const targetCol = (u.role === "admin" || u.role === "publisher") ? "authors" : "users";
        await setDoc(doc(db, targetCol, u.id), u);
      }

      // 3. Seed Articles / Drafts
      for (const art of seedData.articles || []) {
        const targetCol = art.status === "published" ? "articles" : "drafts";
        await setDoc(doc(db, targetCol, art.id), art);
      }

      // 4. Seed Media Records
      for (const m of seedData.media || []) {
        await setDoc(doc(db, "media", m.id), m);
      }

      console.log("Firestore seeding completed successfully.");
    }
  } catch (err) {
    console.error("Firestore automatic seeding failed:", err);
  }
}

// Trigger initial seed check on load
// Disabled 8 Nov 2026: the server must not write to the database without an admin login.
// seedFirestoreIfNeeded();

async function syncCategoriesOnce() {
  try {
    const targetCategories = [
      { id: "c1", name: "Product Updates", slug: "product-updates" },
      { id: "c2", name: "Success Stories", slug: "success-stories" },
      { id: "c3", name: "Getting Started", slug: "getting-started" },
      { id: "c4", name: "Tutorials", slug: "tutorials" },
      { id: "c5", name: "Bitcoin & Lightning", slug: "bitcoin-lightning" },
      { id: "c6", name: "Insights", slug: "insights" },
    ];

    // Delete existing categories first to avoid orphans
    const snap = await getDocs(categoriesCol());
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "categories", d.id));
    }

    // Write target categories
    for (const cat of targetCategories) {
      await setDoc(doc(db, "categories", cat.id), cat);
    }
    console.log("Firestore categories successfully synchronized to new list.");
  } catch (err) {
    console.error("Failed to sync Firestore categories on boot:", err);
  }
}
// Disabled 8 Nov 2026: categories are already set; this deleted and rewrote them on every start.
// syncCategoriesOnce();

// ---------------------------------------------------------------------------
// Security: Firebase Auth Token Verification Middleware
// ---------------------------------------------------------------------------
// Emails granted admin API access. Override with a comma-separated
// ADMIN_EMAILS env var. Any authenticated user NOT on this list is rejected —
// public signup accounts must never reach admin endpoints.
// Admin moved to the company account on 8 Nov 2026 (the founder's personal email is for freelancing).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "bitlance1@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Verifies a Firebase ID token by asking Google (Identity Toolkit accounts:lookup). Google
// rejects forged or expired tokens, so no service account is needed. Returns the account's
// email and uid, or null.
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyC3u6AUI8q8RI7rnjFCbBQsEDlBel0Y8Tc";
async function verifyAdminToken(token: string): Promise<{ uid: string; email: string } | null> {
  if (!token || token.length > 4096) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const user = data?.users?.[0];
    const email = String(user?.email || "").toLowerCase();
    if (!user?.localId || !email || !ADMIN_EMAILS.includes(email)) return null;
    return { uid: user.localId, email };
  } catch {
    return null;
  }
}

const bearer = (req: any) => {
  const h = String(req.headers?.["authorization"] || "");
  return h.startsWith("Bearer ") ? h.slice(7) : "";
};

// Admin-only routes. Before 8 Nov 2026 this let every request through.
async function adminAuthMiddleware(req: any, res: any, next: any) {
  const admin = await verifyAdminToken(bearer(req));
  if (!admin) return res.status(401).json({ error: "Admin sign-in required." });
  req.user = admin;
  next();
}

/** True when the request carries a valid admin token (used to show drafts only to admins). */
const isAdminRequest = async (req: any) => !!(await verifyAdminToken(bearer(req)));

// ---------------------------------------------------------------------------
// Express Application Router
// ---------------------------------------------------------------------------
const app = express();

// Increase payload limit for base64 image uploads; handle Vercel pre-parsed bodies gracefully
app.use((req: any, res: any, next: any) => {
  if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
    next();
  } else {
    express.json({ limit: "50mb" })(req, res, next);
  }
});
app.use("/uploads", express.static(UPLOADS_DIR));

// Helper to sanitize slug
function sanitizeSlug(title: string, customSlug?: string): string {
  const base = (customSlug || title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
  return base || "untitled";
}

// Helper to prevent duplicate slugs in Firestore
async function uniqueSlugInFirestore(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    // Check in articles collection
    const qPub = query(articlesCol(), where("slug", "==", slug));
    const snapPub = await getDocs(qPub);
    let conflict = false;

    for (const d of snapPub.docs) {
      if (d.id !== excludeId) {
        conflict = true;
        break;
      }
    }

    if (!conflict) {
      // Check in drafts collection
      const qDraft = query(draftsCol(), where("slug", "==", slug));
      const snapDraft = await getDocs(qDraft);
      for (const d of snapDraft.docs) {
        if (d.id !== excludeId) {
          conflict = true;
          break;
        }
      }
    }

    if (!conflict) {
      break;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

// Helper to strip HTML tags and convert formatting for plain-text or Markdown snippets
function cleanHtmlToMarkdown(html: string): string {
  if (!html) return "";
  let text = html;

  // Replace list items with bullet points
  text = text.replace(/<li>(.*?)<\/li>/gi, "- $1\n");

  // Replace headers with markdown equivalent
  text = text.replace(/<h1>(.*?)<\/h1>/gi, "# $1\n\n");
  text = text.replace(/<h2>(.*?)<\/h2>/gi, "## $1\n\n");
  text = text.replace(/<h3>(.*?)<\/h3>/gi, "### $1\n\n");
  text = text.replace(/<h4>(.*?)<\/h4>/gi, "#### $1\n\n");

  // Replace paragraphs and line breaks
  text = text.replace(/<p>(.*?)<\/p>/gi, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Clean up excess whitespace and entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  return text.trim();
}

// Convert any date to RFC822 format (e.g. Thu, 10 Jul 2026 10:49:45 GMT) for RSS feeds
function toRFC822(dateVal: any): string {
  const d = new Date(dateVal || Date.now());
  return d.toUTCString();
}

// Fetch helper mapping functions for SEO/Feeds
async function getCategoriesMap() {
  const map = new Map<string, any>();
  try {
    const snap = await getDocs(categoriesCol());
    snap.forEach(d => {
      map.set(d.id, d.data());
    });
  } catch (err) {
    console.error("Error fetching categories for feeds:", err);
  }
  return map;
}

async function getAuthorsMap() {
  const map = new Map<string, any>();
  try {
    const snap = await getDocs(authorsCol());
    snap.forEach(d => {
      map.set(d.id, d.data());
    });
    // Fallback users
    const snapUsers = await getDocs(usersCol());
    snapUsers.forEach(d => {
      if (!map.has(d.id)) {
        map.set(d.id, d.data());
      }
    });
  } catch (err) {
    console.error("Error fetching authors for feeds:", err);
  }
  return map;
}

// XML Sitemap Integration supporting both main and blog domains with Image tags and rich category/article mapping
app.get("/sitemap.xml", async (req, res) => {
  try {
    const host = (req.headers.host || "").toLowerCase();
    const siteQuery = req.query.site as string;
    const isBlog = host.includes("blog.") || siteQuery === "blog";

    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

    // Fetch Articles & Categories
    const snap = await getDocs(articlesCol());
    const articles: any[] = [];
    snap.forEach(d => {
      articles.push({ id: d.id, ...d.data() });
    });

    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const catsMap = await getCategoriesMap();

    // Base site URL
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}/</loc>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>1.0</priority>\n`;
    xml += `  </url>\n`;

    // Standard Pages (Profile, Signup)
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}/signup</loc>\n`;
    xml += `    <changefreq>monthly</changefreq>\n`;
    xml += `    <priority>0.5</priority>\n`;
    xml += `  </url>\n`;

    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}/profile</loc>\n`;
    xml += `    <changefreq>monthly</changefreq>\n`;
    xml += `    <priority>0.5</priority>\n`;
    xml += `  </url>\n`;

    // Categories Sitemaps
    for (const cat of catsMap.values()) {
      if (cat.slug || cat.id) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/category/${cat.slug || cat.id}</loc>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }
    }

    // Article Sitemaps with image extensions
    for (const art of articles) {
      const lastModDate = new Date(art.updated_at || art.published_at || art.created_at || Date.now()).toISOString().split("T")[0];
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/article/${art.slug || art.id}</loc>\n`;
      xml += `    <lastmod>${lastModDate}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;

      const imgUrl = art.featured_image || art.og_image;
      if (imgUrl) {
        xml += `    <image:image>\n`;
        xml += `      <image:loc>${imgUrl.replace(/&/g, "&amp;")}</image:loc>\n`;
        xml += `      <image:title>${(art.title || "BitLance Article").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</image:title>\n`;
        xml += `    </image:image>\n`;
      }
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;
    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (err: any) {
    res.status(500).send(`Error generating sitemap: ${err.message}`);
  }
});

// Google Search Console Dynamic HTML File Verification Handler
app.get("/google:token.html", (req, res) => {
  const token = req.params.token;
  res.header("Content-Type", "text/html");
  res.send(`google-site-verification: google${token}.html`);
});

// Serve the BitLance logo as the favicon/icon
app.get(["/favicon.ico", "/logo.png", "/apple-touch-icon.png"], (req, res) => {
  const logoPath = path.join(process.cwd(), "src/assets/images/bitlance_logo_1782869809232.jpg");
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).end();
  }
});

// Robots.txt Handler with advanced AI/LLM Web Crawling specifications (AEO optimization)
app.get("/robots.txt", (req, res) => {
  const host = (req.headers.host || "").toLowerCase();
  const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

  let robotsText = `# BitLance Search & AI Crawler configuration\n\n`;

  // Target generic web-search crawlers
  robotsText += `User-agent: *\n`;
  robotsText += `Allow: /\n`;
  robotsText += `Disallow: /admin/\n`;
  robotsText += `Disallow: /api/\n\n`;

  // Target AI / LLM Scrapers explicitly for optimization & indexing
  const aiBots = [
    "GPTBot",          // OpenAI
    "ChatGPT-User",    // ChatGPT Web Browsing
    "ClaudeBot",       // Anthropic Claude
    "Claude-Web",      // Anthropic web agent
    "Google-Extended", // Gemini Training/SGE
    "PerplexityBot",   // Perplexity AI
    "Applebot-Extended"// Apple intelligence
  ];

  for (const bot of aiBots) {
    robotsText += `User-agent: ${bot}\n`;
    robotsText += `Allow: /\n`;
    robotsText += `Disallow: /admin/\n`;
    robotsText += `Disallow: /api/\n\n`;
  }

  // Link to sitemaps & LLM information files
  robotsText += `Sitemap: ${baseUrl}/sitemap.xml\n`;
  robotsText += `LLMs-Agent-Information: ${baseUrl}/llms.txt\n`;

  res.header("Content-Type", "text/plain");
  res.send(robotsText);
});

// Dynamic RSS Feed Route (RSS 2.0)
app.get(["/feed.xml", "/rss.xml", "/feed"], async (req, res) => {
  try {
    const host = (req.headers.host || "").toLowerCase();
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

    const snap = await getDocs(articlesCol());
    const articles: any[] = [];
    snap.forEach(d => {
      articles.push({ id: d.id, ...d.data() });
    });

    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const catsMap = await getCategoriesMap();
    const authorsMap = await getAuthorsMap();

    let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n`;
    rss += `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:sy="http://purl.org/rss/1.0/modules/syndication/" xmlns:slash="http://purl.org/rss/1.0/modules/slash/" xmlns:media="http://search.yahoo.com/mrss/">\n`;
    rss += `<channel>\n`;
    rss += `  <title>BitLance Blog</title>\n`;
    rss += `  <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />\n`;
    rss += `  <link>${baseUrl}</link>\n`;
    rss += `  <description>Guides, tutorials, industry insights, freelancing tips, and Bitcoin career resources from the team at BitLance.</description>\n`;
    rss += `  <language>en-US</language>\n`;
    rss += `  <lastBuildDate>${toRFC822(articles[0]?.published_at || articles[0]?.created_at)}</lastBuildDate>\n`;
    rss += `  <sy:updatePeriod>hourly</sy:updatePeriod>\n`;
    rss += `  <sy:updateFrequency>1</sy:updateFrequency>\n`;

    for (const art of articles) {
      const artUrl = `${baseUrl}/article/${art.slug || art.id}`;
      const authorObj = authorsMap.get(art.author_id);
      const authorName = authorObj?.name || "BitLance Team";
      const catObj = catsMap.get(art.category_id);
      const catName = catObj?.name || "Bitcoin Freelancing";
      const summary = art.meta_description || art.subtitle || (art.content ? cleanHtmlToMarkdown(art.content).substring(0, 160) + "..." : "");

      rss += `  <item>\n`;
      rss += `    <title><![CDATA[${art.title}]]></title>\n`;
      rss += `    <link>${artUrl}</link>\n`;
      rss += `    <guid isPermaLink="true">${artUrl}</guid>\n`;
      rss += `    <pubDate>${toRFC822(art.published_at || art.created_at)}</pubDate>\n`;
      rss += `    <dc:creator><![CDATA[${authorName}]]></dc:creator>\n`;
      rss += `    <category><![CDATA[${catName}]]></category>\n`;
      rss += `    <description><![CDATA[${summary}]]></description>\n`;

      if (art.content) {
        rss += `    <content:encoded><![CDATA[${art.content}]]></content:encoded>\n`;
      }

      const imgUrl = art.featured_image || art.og_image;
      if (imgUrl) {
        rss += `    <media:content url="${imgUrl.replace(/&/g, "&amp;")}" medium="image" type="image/jpeg" />\n`;
      }
      rss += `  </item>\n`;
    }

    rss += `</channel>\n`;
    rss += `</rss>`;

    res.header("Content-Type", "application/xml; charset=utf-8");
    res.send(rss);
  } catch (err: any) {
    res.status(500).send(`<error>${err.message}</error>`);
  }
});

// Dynamic Atom Feed Route (Atom 1.0)
app.get("/atom.xml", async (req, res) => {
  try {
    const host = (req.headers.host || "").toLowerCase();
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

    const snap = await getDocs(articlesCol());
    const articles: any[] = [];
    snap.forEach(d => {
      articles.push({ id: d.id, ...d.data() });
    });

    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const catsMap = await getCategoriesMap();
    const authorsMap = await getAuthorsMap();

    const updatedTime = articles[0] ? new Date(articles[0].published_at || articles[0].created_at || Date.now()).toISOString() : new Date().toISOString();

    let atom = `<?xml version="1.0" encoding="utf-8"?>\n`;
    atom += `<feed xmlns="http://www.w3.org/2005/Atom">\n`;
    atom += `  <title>BitLance Blog</title>\n`;
    atom += `  <subtitle>Guides, tutorials, industry insights, freelancing tips, and Bitcoin career resources from the team at BitLance.</subtitle>\n`;
    atom += `  <link href="${baseUrl}/atom.xml" rel="self" />\n`;
    atom += `  <link href="${baseUrl}/" />\n`;
    atom += `  <id>${baseUrl}/</id>\n`;
    atom += `  <updated>${updatedTime}</updated>\n`;
    atom += `  <author>\n`;
    atom += `    <name>BitLance Team</name>\n`;
    atom += `    <uri>${baseUrl}</uri>\n`;
    atom += `  </author>\n`;

    for (const art of articles) {
      const artUrl = `${baseUrl}/article/${art.slug || art.id}`;
      const authorObj = authorsMap.get(art.author_id);
      const authorName = authorObj?.name || "BitLance Team";
      const summary = art.meta_description || art.subtitle || (art.content ? cleanHtmlToMarkdown(art.content).substring(0, 160) : "");
      const publishedStr = new Date(art.published_at || art.created_at || Date.now()).toISOString();
      const updatedStr = new Date(art.updated_at || art.published_at || art.created_at || Date.now()).toISOString();

      atom += `  <entry>\n`;
      atom += `    <title><![CDATA[${art.title}]]></title>\n`;
      atom += `    <link href="${artUrl}" />\n`;
      atom += `    <id>${artUrl}</id>\n`;
      atom += `    <published>${publishedStr}</published>\n`;
      atom += `    <updated>${updatedStr}</updated>\n`;
      atom += `    <author>\n`;
      atom += `      <name>${authorName}</name>\n`;
      atom += `    </author>\n`;
      atom += `    <summary type="html"><![CDATA[${summary}]]></summary>\n`;
      if (art.content) {
        atom += `    <content type="html"><![CDATA[${art.content}]]></content>\n`;
      }
      atom += `  </entry>\n`;
    }

    atom += `</feed>`;

    res.header("Content-Type", "application/atom+xml; charset=utf-8");
    res.send(atom);
  } catch (err: any) {
    res.status(500).send(`<error>${err.message}</error>`);
  }
});

// Dynamic JSON Feed Route
app.get("/feed.json", async (req, res) => {
  try {
    const host = (req.headers.host || "").toLowerCase();
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

    const snap = await getDocs(articlesCol());
    const articles: any[] = [];
    snap.forEach(d => {
      articles.push({ id: d.id, ...d.data() });
    });

    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const catsMap = await getCategoriesMap();
    const authorsMap = await getAuthorsMap();

    const feedJson = {
      version: "https://jsonfeed.org/version/1.1",
      title: "BitLance Blog",
      home_page_url: `${baseUrl}/`,
      feed_url: `${baseUrl}/feed.json`,
      description: "Guides, tutorials, industry insights, freelancing tips, and Bitcoin career resources from the team at BitLance.",
      items: articles.map(art => {
        const authorObj = authorsMap.get(art.author_id);
        const catObj = catsMap.get(art.category_id);
        return {
          id: art.id,
          url: `${baseUrl}/article/${art.slug || art.id}`,
          title: art.title,
          summary: art.meta_description || art.subtitle || undefined,
          content_html: art.content || undefined,
          image: art.featured_image || art.og_image || undefined,
          date_published: art.published_at || art.created_at || undefined,
          date_modified: art.updated_at || art.published_at || art.created_at || undefined,
          authors: [{
            name: authorObj?.name || "BitLance Team",
            avatar: authorObj?.avatar || undefined
          }],
          tags: catObj?.name ? [catObj.name] : []
        };
      })
    };

    res.json(feedJson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dynamic llms.txt AEO discovery endpoint
app.get("/llms.txt", async (req, res) => {
  try {
    const host = (req.headers.host || "").toLowerCase();
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

    const snap = await getDocs(articlesCol());
    const articles: any[] = [];
    snap.forEach(d => {
      articles.push({ id: d.id, ...d.data() });
    });

    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const catsMap = await getCategoriesMap();

    let md = `# BitLance Blog\n\n`;
    md += `> Insights, remote work, career resources, and Bitcoin freelancing guides.\n\n`;
    md += `BitLance is a vetted remote Bitcoin job marketplace and global micro-payroll platform. Secure freelancing is accomplished via Lightning Network smart contract escrows. This blog syndicates community guides, tech announcements, and design tutorials.\n\n`;

    md += `## Primary Pages\n`;
    md += `- [Blog Home Page](${baseUrl}/) - Main article listing and filtering feed.\n`;
    md += `- [Signup Page](${baseUrl}/signup) - Create a freelancing profile.\n`;
    md += `- [User Profile](${baseUrl}/profile) - Manage your bookmark feeds and career profile.\n\n`;

    md += `## Featured Categories\n`;
    for (const cat of catsMap.values()) {
      md += `- [${cat.name}](${baseUrl}/category/${cat.slug || cat.id}) - Category resource listing for ${cat.name}.\n`;
    }
    md += `\n`;

    md += `## Published Articles\n`;
    for (const art of articles) {
      const summary = art.meta_description || art.subtitle || "Insights on Bitcoin development and freelance careers.";
      md += `- [${art.title}](${baseUrl}/article/${art.slug || art.id}) - ${summary}\n`;
    }

    md += `\n## LLM Crawler Directions\n`;
    md += `To crawl and ingest the complete text of all blog articles in a single structured file, please load the full knowledge base at [llms-full.txt](${baseUrl}/llms-full.txt).\n`;

    res.header("Content-Type", "text/plain; charset=utf-8");
    res.send(md);
  } catch (err: any) {
    res.status(500).send(`Error generating LLMs mapping: ${err.message}`);
  }
});

// Dynamic llms-full.txt full knowledge base endpoint for LLM consumption
app.get("/llms-full.txt", async (req, res) => {
  try {
    const host = (req.headers.host || "").toLowerCase();
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${req.headers.host || "blog.bitlance.work"}`;

    const snap = await getDocs(articlesCol());
    const articles: any[] = [];
    snap.forEach(d => {
      articles.push({ id: d.id, ...d.data() });
    });

    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const catsMap = await getCategoriesMap();
    const authorsMap = await getAuthorsMap();

    let md = `# BitLance Blog Full Knowledge Base\n`;
    md += `This document contains the complete corpus of all published articles on the BitLance Blog, optimized for LLM indexing, retrieval-augmented generation (RAG), and search agents.\n\n`;
    md += `---\n\n`;

    for (const art of articles) {
      const authorObj = authorsMap.get(art.author_id);
      const authorName = authorObj?.name || "BitLance Team";
      const catObj = catsMap.get(art.category_id);
      const catName = catObj?.name || "Uncategorized";
      const pubDate = new Date(art.published_at || art.created_at || Date.now()).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
      const textBody = cleanHtmlToMarkdown(art.content || "");

      md += `# ${art.title}\n`;
      md += `- **URL**: ${baseUrl}/article/${art.slug || art.id}\n`;
      md += `- **Published Date**: ${pubDate}\n`;
      md += `- **Category**: ${catName}\n`;
      md += `- **Author**: ${authorName}\n`;

      if (art.subtitle) {
        md += `- **Subtitle**: ${art.subtitle}\n`;
      }
      if (art.meta_description) {
        md += `- **Description**: ${art.meta_description}\n`;
      }

      md += `\n## Content\n\n`;
      md += `${textBody}\n\n`;
      md += `---\n\n`;
    }

    res.header("Content-Type", "text/plain; charset=utf-8");
    res.send(md);
  } catch (err: any) {
    res.status(500).send(`Error generating LLMs content: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// 1. Articles API Endpoints
// ---------------------------------------------------------------------------
app.get("/api/articles", async (req, res) => {
  try {
    const articles: any[] = [];
    const statusQuery = req.query.status as string;
    // Drafts are private: only a signed-in admin gets them.
    const admin = statusQuery === "published" ? false : await isAdminRequest(req);
    if (statusQuery === "draft" && !admin) return res.status(401).json({ error: "Admin sign-in required." });

    if (!statusQuery || statusQuery === "published") {
      const snap = await getDocs(articlesCol());
      snap.forEach(d => {
        articles.push({ id: d.id, ...d.data() });
      });
    }

    if (admin && (!statusQuery || statusQuery === "draft")) {
      const snap = await getDocs(draftsCol());
      snap.forEach(d => {
        articles.push({ id: d.id, ...d.data() });
      });
    }

    // Sort by publication/creation date descending
    articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.created_at || 0).getTime();
      const dateB = new Date(b.published_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    res.json(articles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/articles/:slug", async (req, res) => {
  try {
    const slugOrId = req.params.slug;

    // 1. Try finding in published articles by slug
    const qPub = query(articlesCol(), where("slug", "==", slugOrId));
    const snapPub = await getDocs(qPub);
    if (!snapPub.empty) {
      const d = snapPub.docs[0];
      // Always use the Firestore document ID as the canonical id
      return res.json({ ...d.data(), id: d.id });
    }

    // 2. Try finding in published articles by Firestore doc ID
    const docPubRef = doc(db, "articles", slugOrId);
    const docPub = await getDoc(docPubRef);
    if (docPub.exists()) {
      return res.json({ ...docPub.data(), id: docPub.id });
    }

    // Drafts (steps 3 and 4) are only for a signed-in admin.
    if (!(await isAdminRequest(req))) return res.status(404).json({ error: "Article not found" });

    // 3. Try finding in drafts by slug
    const qDraft = query(draftsCol(), where("slug", "==", slugOrId));
    const snapDraft = await getDocs(qDraft);
    if (!snapDraft.empty) {
      const d = snapDraft.docs[0];
      return res.json({ ...d.data(), id: d.id });
    }

    // 4. Try finding in drafts by Firestore doc ID
    const docDraftRef = doc(db, "drafts", slugOrId);
    const docDraft = await getDoc(docDraftRef);
    if (docDraft.exists()) {
      return res.json({ ...docDraft.data(), id: docDraft.id });
    }

    res.status(404).json({ error: "Article not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/articles", adminAuthMiddleware, async (req, res) => {
  try {
    const baseSlug = sanitizeSlug(req.body.title, req.body.slug);
    const slug = await uniqueSlugInFirestore(baseSlug);
    const id = "a_" + Date.now();
    const isPublished = req.body.status === "published";

    const article = {
      ...req.body,
      id,
      slug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: isPublished ? new Date().toISOString() : null,
      view_count: 0,
    };

    const targetCol = isPublished ? "articles" : "drafts";
    await setDoc(doc(db, targetCol, id), article);

    res.status(201).json(article);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/articles/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const isPublished = req.body.status === "published";
    const baseSlug = sanitizeSlug(req.body.title, req.body.slug);
    const slug = await uniqueSlugInFirestore(baseSlug, id);

    // Fetch existing article details
    let existing: any = null;
    let oldCollection = "";

    const pubDoc = await getDoc(doc(db, "articles", id));
    if (pubDoc.exists()) {
      existing = pubDoc.data();
      oldCollection = "articles";
    } else {
      const draftDoc = await getDoc(doc(db, "drafts", id));
      if (draftDoc.exists()) {
        existing = draftDoc.data();
        oldCollection = "drafts";
      }
    }

    if (!existing) {
      return res.status(404).json({ error: "Article not found" });
    }

    const updatedArticle = {
      ...existing,
      ...req.body,
      id,
      slug,
      updated_at: new Date().toISOString(),
      published_at: isPublished ? (existing.published_at || new Date().toISOString()) : null
    };

    const targetCollection = isPublished ? "articles" : "drafts";

    // Set updated document in target collection
    await setDoc(doc(db, targetCollection, id), updatedArticle);

    // Clean up older collection if status has changed
    if (oldCollection && oldCollection !== targetCollection) {
      await deleteDoc(doc(db, oldCollection, id));
    }

    res.json(updatedArticle);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Increment view count — tries articles first, falls back to drafts
app.post("/api/articles/:id/view", async (req, res) => {
  try {
    const id = req.params.id;

    // Try articles collection by Firestore doc ID first
    const pubRef = doc(db, "articles", id);
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      const current = (pubSnap.data().view_count || 0) as number;
      await updateDoc(pubRef, { view_count: current + 1 });
      return res.json({ success: true, view_count: current + 1 });
    }

    // Views are only counted for published articles (drafts are private).

    // Fallback: query by stored 'id' field (in case doc ID differs from stored id)
    const qPub = query(articlesCol(), where("id", "==", id));
    const qPubSnap = await getDocs(qPub);
    if (!qPubSnap.empty) {
      const d = qPubSnap.docs[0];
      const current = (d.data().view_count || 0) as number;
      await updateDoc(doc(db, "articles", d.id), { view_count: current + 1 });
      return res.json({ success: true, view_count: current + 1 });
    }


    res.status(404).json({ error: "Article not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/articles/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    await deleteDoc(doc(db, "articles", id));
    await deleteDoc(doc(db, "drafts", id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. Categories API Endpoints
// ---------------------------------------------------------------------------
app.get("/api/categories", async (req, res) => {
  try {
    const targetCategories = [
      { id: "c3", name: "Getting Started", slug: "getting-started" },
      { id: "c4", name: "Tutorials", slug: "tutorials" },
      { id: "c2", name: "Success Stories", slug: "success-stories" },
      { id: "c1", name: "Product Updates", slug: "product-updates" },
      { id: "c5", name: "Bitcoin & Lightning", slug: "bitcoin-lightning" },
      { id: "c6", name: "Insights", slug: "insights" },
    ];

    // Ensure Firestore matches this list asynchronously in the background
    Promise.resolve().then(async () => {
      try {
        const snap = await getDocs(categoriesCol());
        let needsSync = snap.size !== targetCategories.length;
        if (!needsSync) {
          const names = new Set(snap.docs.map(d => d.data().name));
          needsSync = targetCategories.some(c => !names.has(c.name));
        }

        if (needsSync) {
          console.log("Re-synchronizing Firestore categories list...");
          for (const d of snap.docs) {
            await deleteDoc(doc(db, "categories", d.id));
          }
          for (const cat of targetCategories) {
            await setDoc(doc(db, "categories", cat.id), cat);
          }
        }
      } catch (err) {
        console.error("Failed to sync categories in background:", err);
      }
    });

    res.json(targetCategories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/topics", async (req, res) => {
  try {
    const qPub = query(articlesCol(), where("status", "==", "published"));
    const snapPub = await getDocs(qPub);
    const tagsSet = new Set<string>();
    snapPub.forEach(doc => {
      const data = doc.data();
      if (data.tags && Array.isArray(data.tags)) {
        data.tags.forEach((tag: string) => tagsSet.add(tag));
      }
    });
    const topics = Array.from(tagsSet).map(tag => ({
      id: "t_" + tag.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: tag,
      slug: tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    }));
    res.json(topics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/featured-collections", async (req, res) => {
  res.json([
    { id: "fc1", name: "Editor's Picks", slug: "editors-picks" },
    { id: "fc2", name: "Trending", slug: "trending" },
    { id: "fc3", name: "Beginner Friendly", slug: "beginner-friendly" },
    { id: "fc4", name: "Recently Updated", slug: "recently-updated" }
  ]);
});

app.get("/api/bookmarks/check/:id", (req, res) => {
  res.json({ isBookmarked: false });
});

app.get("/api/bookmarks", (req, res) => {
  res.json([]);
});

app.post("/api/bookmarks", (req, res) => {
  res.json({ success: true });
});

app.delete("/api/bookmarks/:id", (req, res) => {
  res.json({ success: true });
});

app.get("/api/follows/feed", (req, res) => {
  res.json([]);
});

app.get("/api/follows/check/:id", (req, res) => {
  res.json({ isFollowed: false });
});

app.post("/api/follows", (req, res) => {
  res.json({ success: true });
});

app.delete("/api/follows/:id", (req, res) => {
  res.json({ success: true });
});

app.get("/api/users/:id/stats", async (req, res) => {
  try {
    const authorId = req.params.id;

    // Count articles by this author across both collections
    const [pubSnap, draftSnap] = await Promise.all([
      getDocs(query(articlesCol(), where("author_id", "==", authorId))),
      getDocs(query(draftsCol(), where("author_id", "==", authorId))),
    ]);
    const totalArticles = pubSnap.size + draftSnap.size;

    // Follower count placeholder (no follows collection yet)
    res.json({ totalArticles, followerCount: 0 });
  } catch (err: any) {
    res.status(500).json({ totalArticles: 0, followerCount: 0 });
  }
});

app.post("/api/categories", adminAuthMiddleware, async (req, res) => {
  try {
    const id = "c_" + Date.now();
    const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const newCategory = {
      id,
      name: req.body.name,
      slug
    };
    await setDoc(doc(db, "categories", id), newCategory);
    res.status(201).json(newCategory);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/categories/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    await deleteDoc(doc(db, "categories", id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. User & Admin Profile API Endpoints
// ---------------------------------------------------------------------------
app.get("/api/users", async (req, res) => {
  try {
    const list: any[] = [];
    const snapAuth = await getDocs(authorsCol());
    snapAuth.forEach(d => {
      list.push({ id: d.id, ...d.data() });
    });
    const snapUsers = await getDocs(usersCol());
    snapUsers.forEach(d => {
      list.push({ id: d.id, ...d.data() });
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    // Check if user is in authors or standard users
    let isAuthor = false;
    let userDoc = await getDoc(doc(db, "authors", id));
    if (userDoc.exists()) {
      isAuthor = true;
    } else {
      userDoc = await getDoc(doc(db, "users", id));
    }

    if (!userDoc.exists()) {
      // Create new author record if it's the default admin-1 updating
      if (id === "admin-1") {
        isAuthor = true;
      } else {
        return res.status(404).json({ error: "User profile not found." });
      }
    }

    const currentData = userDoc.exists() ? userDoc.data() : {};
    const updatedData = {
      ...currentData,
      ...req.body,
      id
    };

    const targetCol = isAuthor ? "authors" : "users";
    await setDoc(doc(db, targetCol, id), updatedData);
    res.json(updatedData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Centralized Media Library API with Cloudinary Support
// ---------------------------------------------------------------------------
app.get("/api/media", async (req, res) => {
  try {
    const list: any[] = [];
    const snap = await getDocs(mediaCol());
    snap.forEach(d => {
      list.push({ id: d.id, ...d.data() });
    });

    // Sort by descending creation date
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/media", adminAuthMiddleware, async (req, res) => {
  const { file, thumbnail, originalName, title, altText: initialAltText, caption, description } = req.body;

  if (!file || !originalName) {
    return res.status(400).json({ error: "Missing required upload fields: file and originalName" });
  }

  try {
    if (!isCloudinaryConfigured) {
      return res.status(500).json({ error: "Cloudinary is not configured. Cloudinary is required to store images." });
    }

    console.log("Uploading file to Cloudinary storage bucket...");
    const uploadRes = await cloudinary.uploader.upload(file, {
      folder: "bitlanceblog",
      resource_type: "image"
    });
    const finalUrl = uploadRes.secure_url;
    const finalThumbnailUrl = finalUrl.replace("/upload/", "/upload/w_300,c_limit/");

    // Default AEO / SEO Metadata
    let altText = initialAltText || title || originalName.replace(/\.[^/.]+$/, "").replace(/-/g, " ");
    let aiMetadata = {
      context: `Contextual image representing ${altText} for BitLance platform.`,
      keywords: ["bitcoin", "freelancing", "remote-work", "lightning-network", "tech"],
      schemaJsonLd: {} as any
    };

    // Enrich using Gemini AI if API Key available
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });

        const base64CleanData = file.replace(/^data:image\/\w+;base64,/, "");
        const promptText = "Analyze this image in the context of a Bitcoin, Lightning Network, and remote tech freelancing platform (BitLance). Return a JSON object with: 'altText' (highly search-optimized, short, under 8 words), 'contextDescription' (a natural, detailed sentence explaining the visual and its thematic connection to Bitcoin/tech freelancing), 'semanticKeywords' (an array of 5-8 highly relevant, search-indexed keywords).";

        const geminiRes = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: "image/webp",
                data: base64CleanData
              }
            },
            { text: promptText }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                altText: { type: Type.STRING },
                contextDescription: { type: Type.STRING },
                semanticKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["altText", "contextDescription", "semanticKeywords"]
            }
          }
        });

        if (geminiRes.text) {
          const parsed = JSON.parse(geminiRes.text);
          if (parsed.altText && !initialAltText) {
            altText = parsed.altText;
          }
          aiMetadata.context = parsed.contextDescription || aiMetadata.context;
          aiMetadata.keywords = parsed.semanticKeywords || aiMetadata.keywords;
        }
      } catch (geminiErr) {
        console.error("Gemini Image Enrichment failed:", geminiErr);
      }
    }

    // Build structured JSON-LD ImageObject schema
    const schemaJsonLd = {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      "contentUrl": finalUrl,
      "creator": {
        "@type": "Organization",
        "name": "BitLance Team"
      },
      "caption": caption || altText,
      "description": description || aiMetadata.context,
      "keywords": aiMetadata.keywords.join(", "),
      "name": originalName
    };
    aiMetadata.schemaJsonLd = schemaJsonLd;

    const id = "m_" + Date.now();
    const newMedia = {
      id,
      filename: originalName,
      thumbnailFilename: originalName,
      url: finalUrl,
      thumbnailUrl: finalThumbnailUrl,
      originalName,
      mimeType: "image/webp",
      size: file.length,
      altText,
      title: title || originalName.replace(/\.[^/.]+$/, "").replace(/-/g, " "),
      caption: caption || "",
      description: description || "",
      createdAt: new Date().toISOString(),
      aiMetadata
    };

    await setDoc(doc(db, "media", id), newMedia);
    res.status(201).json(newMedia);
  } catch (err: any) {
    console.error("Failed to upload/optimize image:", err);
    res.status(500).json({ error: err.message || "Failed to process image upload" });
  }
});

app.put("/api/media/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const mediaId = req.params.id;
    const { altText, title, caption, description } = req.body;

    const docRef = doc(db, "media", mediaId);
    const mediaDoc = await getDoc(docRef);
    if (!mediaDoc.exists()) {
      return res.status(404).json({ error: "Media record not found." });
    }

    const item = mediaDoc.data();
    if (altText !== undefined) item.altText = altText;
    if (title !== undefined) item.title = title;
    if (caption !== undefined) item.caption = caption;
    if (description !== undefined) item.description = description;

    // Refresh JSON-LD structured schema
    if (item.aiMetadata) {
      item.aiMetadata.schemaJsonLd = {
        ...item.aiMetadata.schemaJsonLd,
        "caption": item.caption || item.altText,
        "description": item.description || item.aiMetadata.context,
      };
    }

    await setDoc(docRef, item);
    res.json({ id: mediaId, ...item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/media/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const mediaId = req.params.id;
    const docRef = doc(db, "media", mediaId);
    const mediaDoc = await getDoc(docRef);
    if (!mediaDoc.exists()) {
      return res.status(404).json({ error: "Media record not found." });
    }

    const item = mediaDoc.data();

    // If uploading was local fallback, clear it from local disk
    if (item.url && item.url.startsWith("/uploads/")) {
      try {
        const filename = item.url.split("/").pop();
        if (filename) {
          const mainPath = path.join(UPLOADS_DIR, filename);
          if (fs.existsSync(mainPath)) {
            fs.unlinkSync(mainPath);
          }
        }
        if (item.thumbnailUrl && item.thumbnailUrl.startsWith("/uploads/")) {
          const thumbFilename = item.thumbnailUrl.split("/").pop();
          if (thumbFilename && thumbFilename !== filename) {
            const thumbPath = path.join(UPLOADS_DIR, thumbFilename);
            if (fs.existsSync(thumbPath)) {
              fs.unlinkSync(thumbPath);
            }
          }
        }
      } catch (err) {
        console.error("Local file clean up failed:", err);
      }
    }

    await deleteDoc(docRef);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Google Search Console & SEO Configuration Endpoints
// ---------------------------------------------------------------------------
app.get("/api/settings/google-search-console", async (req, res) => {
  try {
    const docSnap = await getDoc(doc(db, "settings", "google_search_console"));
    if (docSnap.exists()) {
      res.json(docSnap.data());
    } else {
      res.json({ google_site_verification: "" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings/google-search-console", adminAuthMiddleware, async (req, res) => {
  try {
    const { google_site_verification } = req.body;
    await setDoc(doc(db, "settings", "google_search_console"), {
      google_site_verification: google_site_verification || "",
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true, google_site_verification });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// HTML Dynamic Head Metadata Injection (SEO & AEO)
// ---------------------------------------------------------------------------
async function getMetadataForPath(reqPath: string) {
  try {
    const articleMatch = reqPath.match(/^\/article\/([^/?#]+)/);
    if (articleMatch) {
      const slugOrId = articleMatch[1];

      let article: any = null;
      const qPub = query(articlesCol(), where("slug", "==", slugOrId));
      const snapPub = await getDocs(qPub);
      if (!snapPub.empty) {
        article = snapPub.docs[0].data();
      } else {
        const docPub = await getDoc(doc(db, "articles", slugOrId));
        if (docPub.exists()) {
          article = docPub.data();
        }
      }

      if (article) {
        const title = article.seo_title || article.title || "BitLance Article";
        const description = article.meta_description || article.subtitle || article.content?.replace(/<[^>]+>/g, "").substring(0, 155) || "Read this article on BitLance.";
        const image = article.og_image || article.featured_image || "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2670&auto=format&fit=crop";
        const url = `https://blog.bitlance.work/article/${article.slug || article.id}`;

        return {
          title,
          description,
          image,
          url,
          type: "article",
          publishedTime: article.published_at || article.created_at,
          authorName: "BitLance Team",
          schemaData: article.schema_data,
          faqs: article.faqs,
        };
      }
    }
  } catch (_) { }

  // Default Homepage Meta
  const title = "BitLance Blog - Bitcoin Freelancing Blog";
  const description = "Discover guides, tutorials, remote work strategies, and industry insights to thrive in the borderless Bitcoin economy on BitLance.";
  const image = "https://images.unsplash.com/photo-1639762681485-074b7f4ec651?q=80&w=2670&auto=format&fit=crop";
  const url = "https://blog.bitlance.work";

  return {
    title,
    description,
    image,
    url,
    type: "website",
    publishedTime: null,
    authorName: "BitLance Team",
  };
}

function injectMetaTags(html: string, meta: any): string {
  const escapeHtml = (str: string) => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const cleanTitle = escapeHtml(meta.title);
  const cleanDescription = escapeHtml(meta.description);
  const cleanImage = escapeHtml(meta.image);
  const cleanUrl = escapeHtml(meta.url);
  const cleanAuthor = escapeHtml(meta.authorName);

  const metaTags = `
  <!-- SEO Metadata Injected by BitLance Server -->
  <title>${cleanTitle}</title>
  <meta name="title" content="${cleanTitle}" />
  <meta name="description" content="${cleanDescription}" />
  <link rel="canonical" href="${cleanUrl}" />
  ${meta.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(meta.googleSiteVerification)}" />` : ""}
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${meta.type}" />
  <meta property="og:url" content="${cleanUrl}" />
  <meta property="og:title" content="${cleanTitle}" />
  <meta property="og:description" content="${cleanDescription}" />
  <meta property="og:image" content="${cleanImage}" />
  <meta property="og:site_name" content="BitLance" />
  ${meta.publishedTime ? `<meta property="article:published_time" content="${meta.publishedTime}" />` : ""}
  ${meta.authorName ? `<meta property="article:author" content="${cleanAuthor}" />` : ""}
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${cleanUrl}" />
  <meta name="twitter:title" content="${cleanTitle}" />
  <meta name="twitter:description" content="${cleanDescription}" />
  <meta name="twitter:image" content="${cleanImage}" />
  
  <!-- Custom Structured Schema (JSON-LD) -->
  ${meta.schemaData ? `
  <script type="application/ld+json">
    ${meta.schemaData}
  </script>` : ""}
  
  <!-- Dynamic FAQ Schema (JSON-LD) -->
  ${meta.faqs && Array.isArray(meta.faqs) && meta.faqs.length > 0 ? `
  <script type="application/ld+json">
    ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": meta.faqs.map((f: any) => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer
      }
    }))
  }, null, 2)}
  </script>` : ""}
  `;

  let cleanedHtml = html.replace(/<title>.*?<\/title>/gi, "");
  cleanedHtml = cleanedHtml.replace(/<link rel="canonical".*?\/>/gi, "");

  return cleanedHtml.replace("</head>", `${metaTags}\n</head>`);
}

// ---------------------------------------------------------------------------
// Server Bootstrap & Static Routing Handler
// ---------------------------------------------------------------------------
let vite: any = null;

if (!process.env.VERCEL) {
  const runLocal = async () => {
    if (process.env.NODE_ENV !== "production") {
      const viteModule = await Function('return import("vite")')();
      const createViteServer = viteModule.createServer;
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "custom",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath, { index: false }));
    }

    // Fallback handler serving hydrated pages
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl || req.url;

      if (
        url.startsWith("/api/") ||
        url.includes(".") ||
        url.startsWith("/@") ||
        url.startsWith("/node_modules/")
      ) {
        return next();
      }

      try {
        let template = "";
        if (process.env.NODE_ENV !== "production") {
          const templatePath = path.resolve(process.cwd(), "index.html");
          if (fs.existsSync(templatePath)) {
            template = fs.readFileSync(templatePath, "utf-8");
          } else {
            return next();
          }
          template = await vite.transformIndexHtml(url, template);
        } else {
          const templatePath = path.resolve(process.cwd(), "dist", "index.html");
          if (fs.existsSync(templatePath)) {
            template = fs.readFileSync(templatePath, "utf-8");
          } else {
            return next();
          }
        }

        const meta: any = await getMetadataForPath(url);

        let gsv = "";
        try {
          const docSnap = await getDoc(doc(db, "settings", "google_search_console"));
          if (docSnap.exists()) {
            gsv = docSnap.data().google_site_verification || "";
          }
        } catch (_) { }
        meta.googleSiteVerification = gsv;

        const html = injectMetaTags(template, meta);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        if (process.env.NODE_ENV !== "production" && vite) {
          vite.ssrFixStacktrace(e as Error);
        }
        next(e);
      }
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`BitLance Blog Engine running on port ${PORT}`);
    });
  };

  runLocal();
}

export default app;
