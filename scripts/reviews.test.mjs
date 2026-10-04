// Product ratings, exercised directly.
//
// Stars on a product card are a claim the shop makes on its customers' behalf,
// so the rules that keep them honest each get an assertion:
//
//   · only a buyer can rate, and only what was in their order
//   · the email goes out once per order, a few days after it arrived — never
//     for a cancelled order, never for one bought months ago
//   · "Top Rated" is ordered by a fair average and never padded
//   · a review the house hid stays hidden when its writer edits it
//
// The arithmetic runs against plain objects. The SQL runs against the real
// migrations, applied to an in-memory SQLite database behind a small D1-shaped
// wrapper, so the queries tested are the queries that ship.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { summarise, topRated, distribution, cleanRating, requestBody, dueOrders, queueReviewRequests, reviews, loadRatings } from "../worker/reviews.js";
import { computeSegments } from "../worker/merch.js";
import { renderEmail } from "../worker/email.js";
import { CLAIM_SEGMENTS } from "../worker/home.js";

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

// ---- 1. The arithmetic --------------------------------------------------------
console.log("\nAdding up the stars");

check("an average is rounded to one place, with its count",
  summarise([{ product_id: "a", n: 3, sum: 13 }]), { a: { avg: 4.3, count: 3 } });
check("single rows add up per product",
  summarise([{ productId: "a", rating: 5 }, { productId: "a", rating: 4 }, { productId: "b", rating: 2 }]),
  { a: { avg: 4.5, count: 2 }, b: { avg: 2, count: 1 } });
check("the bars run five stars down to one",
  distribution([{ rating: 5, n: 7 }, { rating: 1, n: 2 }, { rating: 4, n: 1 }]), [7, 1, 0, 0, 2]);
check("a rating outside one to five is not a rating",
  [cleanRating(0), cleanRating(6), cleanRating("4"), cleanRating("x")], [null, null, 4, null]);

console.log("\nTop Rated");
const order = ["lone", "many", "mid", "unrated", "poor"];
const ratings = {
  lone: { avg: 5, count: 1 },     // one five-star review
  many: { avg: 4.9, count: 40 },  // forty reviews, nearly all five
  mid: { avg: 4.4, count: 6 },
  poor: { avg: 2.1, count: 9 },
};
check("forty reviews at 4.9 outrank one review at 5.0, and an unrated or poorly rated bottle is not on it",
  topRated(ratings, order), ["many", "lone", "mid"]);
check("with no ratings at all the shelf is empty, not padded", topRated({}, order), []);
check("the shop's segments carry it, and the home page treats it as a claim",
  [computeSegments({ products: order.map((id) => ({ id, variants: [] })), ratings })["top-rated"], CLAIM_SEGMENTS.has("top-rated")],
  [["many", "lone", "mid"], true]);

console.log("\nThe email");
const body = requestBody({
  intro: "How are you enjoying your order?", name: "ada okafor",
  items: [{ productId: "osk", name: "Osk", size: "30ml" }], url: "https://shop.test/review/TOKEN", orderNo: "MR-1",
});
check("it greets the buyer by first name and lists each item as a line of stars", body.split("\n\n").slice(0, 3),
  ["Hi Ada,", "How are you enjoying your order?", "★ Osk 30ml: https://shop.test/review/TOKEN?p=osk"]);
const html = renderEmail({ subject: "Rate your order", text: body, brand: { siteUrl: "https://shop.test" } }).html;
check("each star in the email opens the review page with that rating chosen",
  [1, 2, 3, 4, 5].every((n) => html.includes(`https://shop.test/review/TOKEN?p=osk&amp;r=${n}`)), true);
check("and the last line is a button", html.includes(">Write a review</a>"), true);

// ---- 2. Against the real schema -------------------------------------------------
//
// Every migration, in order, into an in-memory database.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
for (const f of readdirSync("migrations").filter((x) => x.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(`migrations/${f}`, "utf8"));
}
// D1's prepare → bind → all/first/run, over node:sqlite.
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => sqlite.prepare(sql);
    return {
      bind(...a) { args = a; return this; },
      async all() { return { results: st().all(...args) }; },
      async first() { return st().get(...args) ?? null; },
      async run() { const r = st().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    };
  },
};
const env = { DB, SITE_URL: "https://shop.test" };
const exec = (sql) => sqlite.exec(sql);

console.log("\nWho is asked");
exec("UPDATE settings SET value = json_set(value, '$.siteUrl', 'https://shop.test') WHERE key='site'");
const pid = sqlite.prepare("SELECT id FROM products WHERE live=1 ORDER BY rowid LIMIT 1").get().id;
const pid2 = sqlite.prepare("SELECT id FROM products WHERE live=1 AND id<>? ORDER BY rowid LIMIT 1").get(pid).id;
const loc = sqlite.prepare("SELECT id FROM locations LIMIT 1").get().id;
const mkOrder = (no, { status = "Processing", pay = "paid", email = "ada@example.com", placed = "-5 days", delivered = null, paid = null } = {}) => {
  exec(`INSERT INTO orders (no, customer, phone, email, city, fulfilled_from, method, pay, pay_status, status, subtotal, total, placed_at, delivered_at, paid_at)
        VALUES ('${no}', 'Ada Okafor', '080', '${email}', '${loc}', '${loc}', 'Delivery', 'Paystack', '${pay}', '${status}', 1000, 1000,
                datetime('now', '${placed}'), ${delivered ? `datetime('now', '${delivered}')` : "NULL"}, ${paid ? `datetime('now', '${paid}')` : "NULL"})`);
  exec(`INSERT INTO order_items (order_no, product_id, name, size, qty, unit_ngn) VALUES ('${no}', '${pid}', 'First', '30ml', 1, 1000), ('${no}', '${pid2}', 'Second', '', 1, 500), ('${no}', '${pid}', 'First', '50ml', 1, 1500)`);
};
mkOrder("MR-DELIVERED", { status: "Delivered", delivered: "-4 days", placed: "-6 days" });
mkOrder("MR-JUST-ARRIVED", { status: "Delivered", delivered: "-1 days", placed: "-3 days" });
mkOrder("MR-NEVER-MARKED", { status: "Processing", paid: "-12 days", placed: "-12 days" });
mkOrder("MR-RECENT-PAID", { status: "Processing", paid: "-4 days", placed: "-4 days" });
mkOrder("MR-CANCELLED", { status: "Cancelled", delivered: "-5 days", placed: "-6 days" });
mkOrder("MR-NO-EMAIL", { status: "Delivered", delivered: "-5 days", placed: "-6 days", email: "" });
mkOrder("MR-ANCIENT", { status: "Delivered", delivered: "-80 days", placed: "-90 days" });
mkOrder("MR-UNPAID", { status: "Processing", pay: "pending", placed: "-20 days" });
const settings = JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key='site'").get().value);
check("the migration's defaults are in place", [settings.reviewsOn, settings.reviewRequestDays, settings.reviewFallbackDays], [true, 3, 10]);
check("delivered a few days ago, or paid long enough ago — and nothing else",
  (await dueOrders(DB, settings)).map((o) => o.no).sort(), ["MR-DELIVERED", "MR-NEVER-MARKED"]);

const q1 = await queueReviewRequests(env);
const runs = sqlite.prepare("SELECT * FROM automation_runs WHERE automation_id='review_request'").all();
check("one email per due order goes into the outbox", [q1.queued, runs.length], [2, 2]);
check("each product appears once in it, however many sizes were bought",
  (runs[0].body.match(/^★ /gm) || []).length, 2);
check("a second run asks nobody twice", (await queueReviewRequests(env)).queued, 0);

console.log("\nThe review page");
const token = sqlite.prepare("SELECT token FROM review_requests WHERE order_no='MR-DELIVERED'").get().token;
const call = (path, init) => reviews.request(`http://x/api${path}`.replace("/api/", "/"), init, env);
const json = (r) => r.json();
const page = await call(`/reviews/request/${token}`).then(json);
check("the link shows the order's products to rate", page.items.map((i) => i.productId), [pid, pid2]);
check("a guessed token is refused", (await call("/reviews/request/not-a-real-token-at-all")).status, 404);
const post = (b) => call(`/reviews/request/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
check("a product that wasn't in the order can't be rated", (await post({ productId: "something-else", rating: 5 })).status, 400);
check("zero stars isn't a rating", (await post({ productId: pid, rating: 0 })).status, 400);
check("stars alone are published straight away", (await post({ productId: pid, rating: 4 }).then(json)).status, "published");
await post({ productId: pid, rating: 5, title: "Lasts all day", body: "Compliments everywhere." });
check("a second visit edits the review rather than adding one",
  sqlite.prepare("SELECT COUNT(*) AS n, MAX(rating) AS r FROM product_reviews WHERE order_no='MR-DELIVERED'").get(), { n: 1, r: 5 });
const rv = sqlite.prepare("SELECT * FROM product_reviews WHERE order_no='MR-DELIVERED'").get();
check("it is marked a verified purchase, under the buyer's first name", [rv.verified, rv.author, rv.source], [1, "Ada", "order"]);
check("the product's stars move with it", (await loadRatings(DB))[pid], { avg: 5, count: 1 });

exec(`UPDATE product_reviews SET status='hidden' WHERE id=${rv.id}`);
await post({ productId: pid, rating: 1, body: "edited" });
check("a review the house hid stays hidden when it is edited",
  sqlite.prepare(`SELECT status FROM product_reviews WHERE id=${rv.id}`).get().status, "hidden");
check("and a hidden review counts for nothing", (await loadRatings(DB))[pid], undefined);

exec(`UPDATE settings SET value = json_set(value, '$.reviewsModerate', json('true')) WHERE key='site'`);
check("with moderation on, words wait for the house", (await post({ productId: pid2, rating: 3, body: "Okay" }).then(json)).status, "pending");
check("but stars alone never wait", (await post({ productId: pid2, rating: 3, body: "" }).then(json)).status, "published");

console.log("\nThe product page");
exec(`UPDATE product_reviews SET status='published' WHERE id=${rv.id}`);
const pr = await call(`/products/${pid}/reviews`).then(json);
check("the summary and the reviews come back together",
  [pr.summary.count, pr.summary.dist, pr.reviews[0].author, pr.reviews[0].verified], [1, [0, 0, 0, 0, 1], "Ada", true]);

console.log(failures ? `\n${failures} failing` : "\nAll review checks pass.");
process.exit(failures ? 1 : 0);
