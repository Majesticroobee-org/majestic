// Product ratings: who is asked, what they can rate, and how the stars add up.
//
// The flow, in the order a shopper meets it:
//
//   1. An order is delivered (or collected). A few days later the cron finds it
//      and sends the buyer one email — "How did we do? Rate your order" — with
//      every product in the order listed and five tappable stars beside each.
//      Orders nobody ever marks delivered are still asked, a little later,
//      once they have been paid for long enough to have arrived.
//   2. A star opens /review/<token> with that rating already chosen. The token
//      is the buyer's permission to review what was in that order and nothing
//      else, so there is no sign-in and nobody can rate what they did not buy.
//   3. The review is published straight away (the house can hide one, or hold
//      every review for approval with one setting) and the product's stars on
//      every card, the product page and the "Top Rated" shelf move with it.
//
// The arithmetic is here as pure functions so the tests can hold it to account
// without a database.

import { Hono } from "hono";
import { getSettings } from "./util.js";
import { firstName } from "./merch.js";

/** Average and count per product, from published reviews. */
export function summarise(rows = []) {
  const by = {};
  for (const r of rows) {
    const id = r.product_id ?? r.productId;
    const n = Number(r.n ?? 1);
    const sum = Number(r.sum ?? r.rating ?? 0);
    if (!id || !n) continue;
    const cur = by[id] || { sum: 0, count: 0 };
    cur.sum += sum;
    cur.count += n;
    by[id] = cur;
  }
  const out = {};
  for (const [id, { sum, count }] of Object.entries(by)) {
    out[id] = { avg: Math.round((sum / count) * 10) / 10, count };
  }
  return out;
}

/**
 * The order the "Top Rated" shelf runs in.
 *
 * A raw average lets one five-star review outrank forty reviews averaging 4.9,
 * which is not what "top rated" means to anyone reading it. So each product's
 * average is pulled towards the shop's overall average by a few imaginary
 * reviews (a Bayesian average): a handful of ratings counts for a little, a
 * lot of ratings counts for a lot.
 *
 * Only products somebody has actually rated are on the shelf, and it is never
 * topped up — a "Top Rated" heading over bottles nobody has rated would be a
 * claim the shop cannot back.
 */
export function topRated(ratings = {}, order = [], { prior = 3, minAvg = 3.5 } = {}) {
  const rank = new Map(order.map((id, i) => [id, i]));
  const rated = order.filter((id) => ratings[id] && ratings[id].count > 0);
  if (!rated.length) return [];
  const total = rated.reduce((n, id) => n + ratings[id].count, 0);
  const mean = rated.reduce((n, id) => n + ratings[id].avg * ratings[id].count, 0) / total;
  const score = (id) => (prior * mean + ratings[id].avg * ratings[id].count) / (prior + ratings[id].count);
  return rated
    .filter((id) => ratings[id].avg >= minAvg)
    .sort((a, b) => score(b) - score(a) || ratings[b].count - ratings[a].count || rank.get(a) - rank.get(b));
}

/** How many reviews sit at each star, five down to one. */
export function distribution(rows = []) {
  const d = [0, 0, 0, 0, 0];
  for (const r of rows) {
    const s = Math.max(1, Math.min(5, parseInt(r.rating, 10) || 0));
    if (r.rating) d[5 - s] += Number(r.n ?? 1);
  }
  return d;
}

/** A rating the shopper sent, or null when it is not one. */
export function cleanRating(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 5 ? n : null;
}

const clip = (s, n) => String(s == null ? "" : s).replace(/\s+\n/g, "\n").trim().slice(0, n);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** A token nobody can guess: 18 random bytes, URL-safe. */
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The email body. Plain text, as every automation here is written: the
 * letterhead (worker/email.js) turns each `★ name: link` line into a row of
 * five stars that each open the review page with that rating chosen, and the
 * final `label: link` line into a button.
 */
export function requestBody({ intro, name, items, url, orderNo }) {
  const hi = firstName(name) ? `Hi ${firstName(name)},` : "Hello,";
  const lines = items.map((it) => `★ ${it.name}${it.size ? ` ${it.size}` : ""}: ${url}?p=${encodeURIComponent(it.productId)}`);
  return [
    hi,
    intro,
    lines.join("\n\n"),
    `Write a review: ${url}`,
    `Order: ${orderNo}`,
  ].filter(Boolean).join("\n\n");
}

// ---- Who is asked -----------------------------------------------------------

/**
 * The orders that are due an email right now.
 *
 * Delivered or collected `reviewRequestDays` ago; or, for an order nobody ever
 * marked as delivered, paid for `reviewFallbackDays` ago. Never an order older
 * than `reviewMaxAgeDays` — a request about something bought two months ago is
 * noise, and this is also what stops the first run after deploy from writing
 * to every customer the shop has ever had. Never a cancelled order, never one
 * without an email address, never twice.
 */
export async function dueOrders(db, settings, limit = 25) {
  const days = (k, d) => Math.max(0, Math.min(120, parseInt(settings[k], 10) || d));
  const after = days("reviewRequestDays", 3);
  const fallback = Math.max(after, days("reviewFallbackDays", 10));
  const maxAge = Math.max(fallback + 1, days("reviewMaxAgeDays", 45));
  return (await db.prepare(
    `SELECT o.no, o.customer, o.email, o.city
       FROM orders o
      WHERE o.status <> 'Cancelled'
        AND COALESCE(o.seeded, 0) = 0
        AND o.email LIKE '%_@_%._%'
        AND o.placed_at >= datetime('now', ?)
        AND NOT EXISTS (SELECT 1 FROM review_requests r WHERE r.order_no = o.no)
        AND (
          (o.status IN ('Delivered', 'Collected') AND COALESCE(o.delivered_at, o.placed_at) <= datetime('now', ?))
          OR (o.pay_status = 'paid' AND COALESCE(o.paid_at, o.placed_at) <= datetime('now', ?))
        )
      ORDER BY o.placed_at
      LIMIT ?`
  ).bind(`-${maxAge} days`, `-${after} days`, `-${fallback} days`, limit).all()).results;
}

/** What an order can be reviewed for: each product once, with its size. */
async function orderItems(db, orderNo) {
  const rows = (await db.prepare(
    `SELECT i.product_id, i.variant_id, i.name, i.size,
            COALESCE(v.image_url, p.image_url) AS image_url, p.live AS live
       FROM order_items i
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN variants v ON v.id = i.variant_id
      WHERE i.order_no = ?
      ORDER BY i.id`
  ).bind(orderNo).all()).results;
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    // A product since deleted from the catalogue cannot carry a review.
    if (seen.has(r.product_id) || r.live === null || r.live === undefined) continue;
    seen.add(r.product_id);
    out.push({ productId: r.product_id, variantId: r.variant_id || null, name: r.name, size: r.size || "", imageUrl: r.image_url || null });
  }
  return out;
}

/**
 * The cron's part: write the request emails that are due into the outbox,
 * where they are sent like every other automation (and simply wait there,
 * readable in Admin → Integrations, while no email provider is connected).
 */
export async function queueReviewRequests(env, { limit = 25 } = {}) {
  const db = env.DB;
  const auto = await db.prepare("SELECT * FROM automations WHERE id='review_request' AND enabled=1").first();
  if (!auto) return { queued: 0 };
  const settings = await getSettings(db);
  if (settings.reviewsOn === false) return { queued: 0 };
  // The link has to point somewhere a phone can open; with no address for the
  // shop there is nothing to send, so nothing is claimed.
  const site = String(settings.siteUrl || env.SITE_URL || "").replace(/\/$/, "");
  if (!site) return { queued: 0, detail: "no site address" };
  let queued = 0;
  for (const o of await dueOrders(db, settings, limit)) {
    const items = await orderItems(db, o.no);
    const token = newToken();
    // Recorded first, and unconditionally, so an order with nothing left to
    // review is not looked at again on every run.
    await db.prepare("INSERT OR IGNORE INTO review_requests (order_no, token, email, name) VALUES (?, ?, ?, ?)")
      .bind(o.no, token, o.email, o.customer || "").run();
    if (!items.length) continue;
    const body = requestBody({ intro: auto.template_body, name: o.customer, items, url: `${site}/review/${token}`, orderNo: o.no });
    await db.prepare(
      "INSERT INTO automation_runs (automation_id, recipient, subject, body, status) VALUES ('review_request', ?, ?, ?, 'pending')"
    ).bind(o.email, auto.template_title || "How did we do? Rate your order", body).run();
    await db.prepare("UPDATE automations SET runs = runs + 1 WHERE id='review_request'").run();
    queued++;
  }
  return { queued };
}

// ---- What the shop reads -----------------------------------------------------

/** Average and count for every product with a published review. */
export async function loadRatings(db) {
  const rows = (await db.prepare(
    "SELECT product_id, COUNT(*) AS n, SUM(rating) AS sum FROM product_reviews WHERE status='published' GROUP BY product_id"
  ).all()).results;
  return summarise(rows);
}

const reviewOut = (r) => ({
  id: r.id, rating: r.rating, title: r.title, body: r.body,
  author: r.author || "A shopper", city: r.city, verified: !!r.verified,
  size: r.size || "", reply: r.reply || "",
  date: String(r.created_at || "").slice(0, 10),
});

// ---- Routes -------------------------------------------------------------------

export const reviews = new Hono();

// A product's reviews, newest first, with the summary the product page draws
// its bars from. Paged, because the catalogue payload carries only the average.
reviews.get("/products/:id/reviews", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const limit = Math.max(1, Math.min(50, parseInt(c.req.query("limit"), 10) || 6));
  const offset = Math.max(0, parseInt(c.req.query("offset"), 10) || 0);
  const sort = c.req.query("sort") === "low" ? "rating ASC, created_at DESC" : c.req.query("sort") === "high" ? "rating DESC, created_at DESC" : "created_at DESC";
  const dist = (await db.prepare(
    "SELECT rating, COUNT(*) AS n FROM product_reviews WHERE product_id=? AND status='published' GROUP BY rating"
  ).bind(id).all()).results;
  const count = dist.reduce((n, r) => n + r.n, 0);
  const avg = count ? Math.round((dist.reduce((n, r) => n + r.rating * r.n, 0) / count) * 10) / 10 : 0;
  const rows = (await db.prepare(
    `SELECT * FROM product_reviews WHERE product_id=? AND status='published' ORDER BY ${sort}, id DESC LIMIT ? OFFSET ?`
  ).bind(id, limit, offset).all()).results;
  return c.json({ summary: { avg, count, dist: distribution(dist) }, reviews: rows.map(reviewOut), more: offset + rows.length < count });
});

async function requestFor(db, token) {
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null;
  return db.prepare("SELECT * FROM review_requests WHERE token=?").bind(t).first();
}

// The review page: what was in the order, and anything already said about it.
reviews.get("/reviews/request/:token", async (c) => {
  const db = c.env.DB;
  const req = await requestFor(db, c.req.param("token"));
  if (!req) return c.json({ error: "This review link isn't valid. It may have been mistyped." }, 404);
  const items = await orderItems(db, req.order_no);
  const mine = (await db.prepare("SELECT * FROM product_reviews WHERE order_no=?").bind(req.order_no).all()).results;
  if (!req.opened_at) await db.prepare("UPDATE review_requests SET opened_at=datetime('now') WHERE order_no=?").bind(req.order_no).run();
  return c.json({
    order: { no: req.order_no, firstName: firstName(req.name) },
    items: items.map((it) => {
      const r = mine.find((x) => x.product_id === it.productId);
      return { ...it, review: r ? { rating: r.rating, title: r.title, body: r.body, status: r.status } : null };
    }),
  });
});

reviews.post("/reviews/request/:token", async (c) => {
  const db = c.env.DB;
  const req = await requestFor(db, c.req.param("token"));
  if (!req) return c.json({ error: "This review link isn't valid." }, 404);
  const b = await c.req.json().catch(() => ({}));
  const rating = cleanRating(b.rating);
  if (!rating) return c.json({ error: "Choose from one to five stars." }, 400);
  const items = await orderItems(db, req.order_no);
  const it = items.find((x) => x.productId === String(b.productId || ""));
  if (!it) return c.json({ error: "That product wasn't in this order." }, 400);
  const settings = await getSettings(db);
  const order = await db.prepare("SELECT customer, city FROM orders WHERE no=?").bind(req.order_no).first();
  const title = clip(b.title, 120);
  const body = clip(b.body, 2000);
  // Stars alone always publish. Words publish too unless the house has asked to
  // read them first.
  const status = settings.reviewsModerate && (title || body) ? "pending" : "published";
  const existing = await db.prepare("SELECT id, status FROM product_reviews WHERE order_no=? AND product_id=?").bind(req.order_no, it.productId).first();
  if (existing) {
    // A review the house hid stays hidden when its writer edits it.
    await db.prepare("UPDATE product_reviews SET rating=?, title=?, body=?, status=?, updated_at=datetime('now') WHERE id=?")
      .bind(rating, title, body, existing.status === "hidden" ? "hidden" : status, existing.id).run();
  } else {
    await db.prepare(
      `INSERT INTO product_reviews (product_id, variant_id, size, order_no, rating, title, body, author, city, verified, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'order', ?)`
    ).bind(it.productId, it.variantId, it.size, req.order_no, rating, title, body,
      firstName(order && order.customer) || firstName(req.name), cap(String((order && order.city) || "")), status).run();
  }
  await db.prepare("UPDATE review_requests SET reviewed_at=datetime('now') WHERE order_no=?").bind(req.order_no).run();
  return c.json({ ok: true, status });
});

// ---- Admin ------------------------------------------------------------------

/** Mounted by worker/admin.js, behind its sign-in. */
export function mountAdminReviews(admin) {
  admin.get("/product-reviews", async (c) => {
    const db = c.env.DB;
    const rows = (await db.prepare(
      `SELECT r.*, p.name AS product_name FROM product_reviews r LEFT JOIN products p ON p.id = r.product_id
        ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC LIMIT 300`
    ).all()).results;
    const stats = await db.prepare(
      `SELECT COUNT(*) AS sent, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
              SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed FROM review_requests`
    ).first();
    return c.json({
      reviews: rows.map((r) => ({ ...reviewOut(r), productId: r.product_id, productName: r.product_name || r.product_id, orderNo: r.order_no || "", status: r.status, source: r.source })),
      requests: { sent: stats.sent || 0, opened: stats.opened || 0, reviewed: stats.reviewed || 0 },
    });
  });

  admin.patch("/product-reviews/:id", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const id = parseInt(c.req.param("id"), 10);
    const sets = [], vals = [];
    if (b.status !== undefined) {
      if (!["published", "pending", "hidden"].includes(b.status)) return c.json({ error: "Bad status." }, 400);
      sets.push("status=?"); vals.push(b.status);
    }
    if (b.reply !== undefined) { sets.push("reply=?"); vals.push(clip(b.reply, 1000)); }
    if (!sets.length) return c.json({ ok: true });
    vals.push(id);
    await c.env.DB.prepare(`UPDATE product_reviews SET ${sets.join(", ")}, updated_at=datetime('now') WHERE id=?`).bind(...vals).run();
    return c.json({ ok: true });
  });

  admin.delete("/product-reviews/:id", async (c) => {
    await c.env.DB.prepare("DELETE FROM product_reviews WHERE id=?").bind(parseInt(c.req.param("id"), 10)).run();
    return c.json({ ok: true });
  });

  // Feedback the house received another way — a WhatsApp message, a word in
  // store — typed in by hand. It counts towards the stars, but is never shown
  // as a verified purchase.
  admin.post("/product-reviews", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const db = c.env.DB;
    const rating = cleanRating(b.rating);
    if (!rating) return c.json({ error: "Choose from one to five stars." }, 400);
    const p = await db.prepare("SELECT id FROM products WHERE id=?").bind(String(b.productId || "")).first();
    if (!p) return c.json({ error: "Choose the product this review is about." }, 400);
    const author = clip(b.author, 40);
    if (!author) return c.json({ error: "Add the reviewer's first name." }, 400);
    const r = await db.prepare(
      `INSERT INTO product_reviews (product_id, rating, title, body, author, city, verified, source, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'admin', 'published')`
    ).bind(p.id, rating, clip(b.title, 120), clip(b.body, 2000), author, clip(b.city, 40)).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  });
}
