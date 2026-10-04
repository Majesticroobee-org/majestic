// The sign-up offer and customer accounts, against the real schema.
//
// The pop-up promises two free perfumes with the next order. That promise is
// only worth making if the shop keeps it, and only once — so each rule gets an
// assertion:
//
//   · signing up records name, phone and the email-consent answer as given
//   · the next order with the same email *or* phone carries the gift, once
//   · signing up again never earns a second gift
//   · an order that is cancelled hands the gift back for the next one
//   · the details from the pop-up become an account with one password, which
//     can sign in, read its profile and see the gift waiting
//
// Every migration is applied to an in-memory SQLite database behind a small
// D1-shaped wrapper, and the real Hono routes are called, so what is tested is
// what ships.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { joinList, applySignupPerk, releaseSignupPerk, perkFor, phoneDigits, phoneKey } from "../worker/signup.js";
import { shop } from "../worker/shop.js";
import { account } from "../worker/customers.js";

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

console.log("\nThe small rules");
check("phone numbers are kept as digits", phoneDigits("+234 803-123 4567"), "2348031234567");
check("0803… and +234803… are the same number", phoneKey("0803 123 4567") === phoneKey("+234 803 123 4567"), true);
check("the gift is two free perfumes unless the house says otherwise", [perkFor({}), perkFor({ signupPerk: "a free mist" }), perkFor({ signupPerkOn: false })], ["2 free perfumes", "a free mist", ""]);

const sqlite = new DatabaseSync(":memory:");
for (const f of readdirSync("migrations").filter((x) => x.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`migrations/${f}`, "utf8"));
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
  async batch(list) { for (const s of list) await s.run(); return []; },
};
const env = { DB, ADMIN_TOKEN_SECRET: "test-secret" };
const ctxStub = { waitUntil() {}, passThroughOnException() {} };
const call = (app, path, { method = "GET", body, token } = {}) => app.request(`http://x${path}`, {
  method,
  headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}, env, ctxStub);
const row = (sql, ...a) => sqlite.prepare(sql).get(...a);

console.log("\nThe migration");
// The pop-up reads a live "Popup" campaign when there is one, and its built-in
// words otherwise — which is what the live shop has been showing.
check("no pop-up campaign still promises 10% off",
  row("SELECT COUNT(*) AS n FROM campaigns WHERE kind='Popup' AND title LIKE '%10%%off%'").n, 0);
const offerSrc = readFileSync("src/storefront/signup-offer.jsx", "utf8");
check("the built-in pop-up offers the two free perfumes, with a better button than \"Get my code\"",
  [/Get Two FREE Perfumes and First Access to Every Promo We Run!/.test(offerSrc), /cta: "Claim My Free Perfumes"/.test(offerSrc), /Get my code/.test(offerSrc)],
  [true, true, false]);
check("its email box starts unticked", /optIn: false/.test(offerSrc), true);
check("the three home-page wordings the house asked for",
  [row("SELECT sub FROM home_blocks WHERE id='shelf-most-shopped'").sub, row("SELECT cta_label FROM home_blocks WHERE id='story'").cta_label,
    JSON.parse(row("SELECT value FROM settings WHERE key='site'").value).reviewsHeadline],
  ["Our most shopped scents", "Read the full story", "Reviews"]);

console.log("\nSigning up");
let r = await call(shop, "/leads", { method: "POST", body: { source: "popup", name: "Ada Okafor", email: "Ada@Example.com", phone: "0803 123 4567", marketingOptIn: false } });
check("the pop-up answers with the gift earned", await r.json(), { ok: true, perk: "2 free perfumes" });
check("name, phone and the unticked email box are kept as given",
  row("SELECT email, name, phone, marketing_opt_in AS optIn, perk FROM leads WHERE email='ada@example.com'"),
  { email: "ada@example.com", name: "Ada Okafor", phone: "08031234567", optIn: 0, perk: "2 free perfumes" });
check("a name is required on the pop-up", (await call(shop, "/leads", { method: "POST", body: { source: "popup", email: "x@example.com" } })).status, 400);
check("a bad email is refused", (await call(shop, "/leads", { method: "POST", body: { source: "popup", name: "X", email: "nope" } })).status, 400);
await call(shop, "/leads", { method: "POST", body: { source: "newsletter", email: "news@example.com" } });
check("the newsletter box earns no gift, and is a yes to emails",
  row("SELECT perk, marketing_opt_in AS optIn FROM leads WHERE email='news@example.com'"), { perk: "", optIn: 1 });

console.log("\nThe gift on the next order");
const loc = row("SELECT id FROM locations LIMIT 1").id;
const order = (no, email, phone) => sqlite.exec(`INSERT INTO orders (no, customer, phone, email, city, fulfilled_from, method, pay, status, subtotal, total)
  VALUES ('${no}', 'Ada', '${phone}', '${email}', '${loc}', '${loc}', 'Delivery', 'Paystack', 'Processing', 1, 1)`);
order("MR-1", "", "+234 803 123 4567");
check("an order matched on the phone alone carries the gift", await applySignupPerk(DB, { no: "MR-1", email: "", phone: "+234 803 123 4567" }), "Sign-up gift: 2 free perfumes");
check("...and the order says so for the store", row("SELECT gift_note FROM orders WHERE no='MR-1'").gift_note, "Sign-up gift: 2 free perfumes");
order("MR-2", "ada@example.com", "");
check("a second order gets nothing more", await applySignupPerk(DB, { no: "MR-2", email: "ada@example.com", phone: "" }), "");
check("signing up again does not earn a second gift",
  (await (await call(shop, "/leads", { method: "POST", body: { source: "popup", name: "Ada", email: "ada@example.com" } })).json()).perk, "");
await releaseSignupPerk(DB, "MR-1");
check("a cancelled order hands the gift back...", [row("SELECT perk_order_no AS o FROM leads WHERE email='ada@example.com'").o, row("SELECT gift_note FROM orders WHERE no='MR-1'").gift_note], [null, ""]);
check("...so the next order carries it", await applySignupPerk(DB, { no: "MR-2", email: "ADA@example.com", phone: "" }), "Sign-up gift: 2 free perfumes");
check("a stranger's order carries nothing", await applySignupPerk(DB, { no: "MR-3", email: "someone@else.com", phone: "0700 000 0000" }), "");

console.log("\nThe account");
await joinList(DB, { email: "chi@example.com", name: "Chi Eze", phone: "0805 555 1212", optIn: true, perk: "2 free perfumes" });
r = await call(account, "/register", { method: "POST", body: { email: "chi@example.com", password: "short", name: "Chi Eze" } });
check("a short password is refused", r.status, 400);
r = await call(account, "/register", { method: "POST", body: { email: "Chi@Example.com", password: "perfume-lover-1", name: "Chi Eze", phone: "0805 555 1212", marketingOptIn: true } });
const reg = await r.json();
check("the pop-up's details become an account", [r.status, reg.customer.email, reg.customer.name, reg.customer.marketingOptIn, !!reg.token], [200, "chi@example.com", "Chi Eze", true, true]);
check("registering the same email twice says to sign in instead",
  (await call(account, "/register", { method: "POST", body: { email: "chi@example.com", password: "another-pass-1" } })).status, 409);
check("a wrong password doesn't sign in", (await call(account, "/login", { method: "POST", body: { email: "chi@example.com", password: "wrong-password" } })).status, 401);
const login = await (await call(account, "/login", { method: "POST", body: { email: "chi@example.com", password: "perfume-lover-1" } })).json();
check("the right one does", !!login.token, true);
const me = await (await call(account, "/me", { token: login.token })).json();
check("the account page sees the profile and the gift waiting",
  [me.customer.name, me.customer.phone, me.perk], ["Chi Eze", "0805 555 1212", { perk: "2 free perfumes", used: false, orderNo: "" }]);
check("and without a token there is no account page", (await call(account, "/me")).status, 401);

console.log(failures ? `\n${failures} failing` : "\nAll sign-up checks pass.");
process.exit(failures ? 1 : 0);
