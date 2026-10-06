// Delivery priced by area, against the real schema and the real routes.
//
// The house groups a city's areas into zones — "Central ₦2,000: Wuse, Garki",
// "Outskirts ₦4,000: Karu, Nyanya" — and the shopper picks their area at
// checkout. What has to hold:
//
//   · a city with no zones is priced exactly as before, and asks for no area
//   · once zoned, a delivery needs an area, and the area's zone sets the fee —
//     on the quote and on the order alike, never the browser's number
//   · an area is in one zone at a time; moving it keeps its id
//   · each zone's free-delivery line: the house rule, never, or its own amount
//   · "somewhere else" pays the standard fee, and only where the house allows it
//   · a paused zone leaves the list; a parcel from another city pays the
//     cross-city rate wherever it is going
//   · a store manager prices their own city and nobody else's
//   · the order keeps the area and zone it was priced at, as text
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { shop } from "../worker/shop.js";
import { admin } from "../worker/admin.js";
import { issueToken } from "../worker/util.js";
import { cleanAreaNames, cleanZone } from "../worker/delivery.js";
import { OTHER_AREA, shopWideFreeOver, localRate, feeFor, pickArea, cheapestFee, cityFreeOver } from "../src/lib/delivery.js";

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

console.log("\nThe rules on their own");
check("free delivery is the house's one city, over its threshold",
  [shopWideFreeOver("abuja", {}), shopWideFreeOver("lagos", {}), shopWideFreeOver("lagos", { freeShipCity: "lagos", freeShipAbujaOver: 80000 })],
  [100000, 0, 80000]);
check("a threshold of 0 switches free delivery off rather than making everything free",
  shopWideFreeOver("abuja", { freeShipAbujaOver: 0 }), 0);
const zoneArea = (freeOver) => ({ id: 1, name: "Karu", fee: 4000, eta: "Same day", freeOver });
check("no area: the store's standard fee and time",
  localRate({ cityId: "abuja", standardFee: 2500, standardEta: "1–2 days" }), { fee: 2500, eta: "1–2 days", freeOver: 100000 });
check("an area: its zone's fee and time, the house's free line",
  localRate({ cityId: "abuja", standardFee: 2500, standardEta: "1–2 days", area: zoneArea(null) }), { fee: 4000, eta: "Same day", freeOver: 100000 });
check("a zone that is never free", localRate({ cityId: "abuja", standardFee: 2500, area: zoneArea(0) }).freeOver, 0);
check("a zone with its own free line", localRate({ cityId: "lagos", standardFee: 3000, area: zoneArea(60000) }).freeOver, 60000);
check("a zone with no time of its own takes the store's",
  localRate({ cityId: "abuja", standardFee: 2500, standardEta: "1–2 days", area: { ...zoneArea(null), eta: "" } }).eta, "1–2 days");
check("the fee falls to nothing at the free line, not a naira before",
  [feeFor({ fee: 4000, freeOver: 50000 }, 49999), feeFor({ fee: 4000, freeOver: 50000 }, 50000), feeFor({ fee: 4000, freeOver: 0 }, 1e9)], [4000, 0, 4000]);
const areas = [{ id: 7, name: "Karu" }, { id: 8, name: "Wuse" }];
check("an unzoned city needs no area", pickArea({ areaId: "", areas: [] }), { area: null, label: "", required: false, error: null });
check("a zoned city does", pickArea({ areaId: "", areas }).error, "Choose your delivery area.");
check("the area is matched by id", pickArea({ areaId: "8", areas }).label, "Wuse");
check("an id from somewhere else is refused", pickArea({ areaId: "99", areas }).error, "Choose your delivery area.");
check("\"somewhere else\" when allowed", pickArea({ areaId: OTHER_AREA, areas }).label, "Other area");
check("…and refused when not", pickArea({ areaId: OTHER_AREA, areas, allowUnlisted: false }).error, "Choose your delivery area.");
const zoned = { id: "abuja", shipNGN: 2500, unlistedArea: true, areas: [{ fee: 2000, freeOver: null }, { fee: 4000, freeOver: null }] };
check("\"from\" is the cheapest area, or the standard fee when that is cheaper and on offer",
  [cheapestFee({ shipNGN: 3000, areas: [] }), cheapestFee(zoned), cheapestFee({ ...zoned, shipNGN: 1500 }), cheapestFee({ ...zoned, shipNGN: 1500, unlistedArea: false })],
  [3000, 2000, 1500, 2000]);
check("the city's free line holds only when every area shares it",
  [cityFreeOver(zoned, {}), cityFreeOver({ ...zoned, areas: [{ fee: 1, freeOver: null }, { fee: 1, freeOver: 0 }] }, {}),
    cityFreeOver({ ...zoned, unlistedArea: false, areas: [{ fee: 1, freeOver: 50000 }] }, {}), cityFreeOver({ id: "lagos", areas: [] }, {})],
  [100000, 0, 50000, 0]);
check("area names: split on commas and lines, tidied, each once",
  cleanAreaNames("Karu,  nyanya\n karu ;Kubwa  Phase 2\n\n"), ["Karu", "nyanya", "Kubwa Phase 2"]);
check("a zone needs a name and a fee", [cleanZone({ fee: 1 }).error, cleanZone({ name: "X" }).error, cleanZone({ name: "X", fee: "-5" }).error],
  ["Give the zone a name — \"Central\", \"Outskirts\".", "Enter the delivery fee in naira (0 for free).", "Enter the delivery fee in naira (0 for free)."]);
check("a fee typed with ₦ and commas is read", cleanZone({ name: "X", fee: "₦4,000", freeOver: "" }).zone, { name: "X", fee: 4000, eta: "", freeOver: null });

// ---- The schema and the routes ----------------------------------------------
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
const call = async (app, path, { method = "GET", body, token } = {}) => {
  const r = await app.request(`http://x${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }, env, ctxStub);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const row = (sql, ...a) => sqlite.prepare(sql).get(...a);
const superT = await issueToken("test-secret", { typ: "admin", uid: 0, role: "super", scope: null });
const lagosT = await issueToken("test-secret", { typ: "admin", uid: 41, role: "manager", scope: "lagos" });

// One fragrance with plenty everywhere, and one only Lagos holds.
// Prices pinned, and no daily deal to move them, so the free-delivery lines
// below are crossed exactly where the test says.
const site = JSON.parse(row("SELECT value FROM settings WHERE key='site'").value);
sqlite.prepare("UPDATE settings SET value=? WHERE key='site'").run(JSON.stringify({ ...site, dailyDealOn: false }));
const dyn = row("SELECT id FROM variants WHERE product_id='dynasty' AND size='50ml'").id;
const far = row("SELECT v.id, v.product_id FROM variants v JOIN products p ON p.id = v.product_id WHERE p.live=1 AND v.product_id<>'dynasty' ORDER BY v.id LIMIT 1");
sqlite.prepare("UPDATE variants SET price_ngn=50000 WHERE id IN (?, ?)").run(dyn, far.id);
sqlite.prepare("UPDATE stock SET qty=50 WHERE variant_id=?").run(dyn);
sqlite.prepare("UPDATE stock SET qty = CASE WHEN location_id='lagos' THEN 50 ELSE 0 END WHERE variant_id=?").run(far.id);
const cart = (qty = 1) => [{ productId: "dynasty", variantId: dyn, qty }];
const quote = (body) => call(shop, "/fulfilment/quote", { method: "POST", body: { city: "abuja", fulfill: "delivery", items: cart(), ...body } });
let n = 0;
const order = (body = {}) => call(shop, "/orders", {
  method: "POST",
  body: {
    customer: { name: "Ada Okafor", phone: `0803000${String(++n).padStart(4, "0")}`, address: "12 Palm Close" },
    city: "abuja", fulfill: "delivery", pay: "transfer", items: cart(), ...body,
  },
});
const placed = (no) => row("SELECT shipping, delivery_area AS area, delivery_zone AS zone FROM orders WHERE no=?", no);
const storeAreas = async (city = "abuja") => (await call(shop, "/store")).body.locations.find((l) => l.id === city);

console.log("\nBefore any zones");
check("nothing is zoned by the migration", row("SELECT COUNT(*) AS n FROM delivery_zones").n, 0);
check("the storefront is told there is nothing to pick", (await storeAreas()).areas, []);
let q = await quote({});
check("a delivery is quoted at the store's standard fee, with no area asked for", [q.body.plan.shipTotal, q.body.plan.areaNeeded], [2500, false]);
let o = await order();
check("…and ordered at it", [o.status, placed(o.body.order.no)], [200, { shipping: 2500, area: "", zone: "" }]);

console.log("\nZoning Abuja");
let r = await call(admin, "/delivery/zones", { method: "POST", token: superT, body: { locationId: "abuja", name: "Outskirts", fee: "4,000", eta: "2–3 days", areas: "Karu, Nyanya\nkaru" } });
check("a zone is created with its areas, each once", [r.status, r.body.moved], [200, []]);
const outskirts = r.body.id;
r = await call(admin, "/delivery/zones", { method: "POST", token: superT, body: { locationId: "abuja", name: "Central", fee: 2000, areas: ["Wuse", "Garki"] } });
const central = r.body.id;
check("a second zone", r.status, 200);
check("two zones can't share a name", (await call(admin, "/delivery/zones", { method: "POST", token: superT, body: { locationId: "abuja", name: "central", fee: 1 } })).status, 400);
const abuja = await storeAreas();
check("the storefront gets the areas alphabetically, each with its zone's terms",
  abuja.areas.map((a) => `${a.name}:${a.fee}:${a.eta}`), ["Garki:2000:", "Karu:4000:2–3 days", "Nyanya:4000:2–3 days", "Wuse:2000:"]);
check("Lagos is still unzoned", (await storeAreas("lagos")).areas, []);
const karu = abuja.areas.find((a) => a.name === "Karu").id;
const wuse = abuja.areas.find((a) => a.name === "Wuse").id;

q = await quote({});
check("now a quote without an area asks for one", q.body.plan.areaNeeded, true);
q = await quote({ area: karu });
check("Karu is quoted at the Outskirts fee and time", [q.body.plan.shipTotal, q.body.plan.areaNeeded, q.body.plan.deliveries[0].eta], [4000, false, "2–3 days"]);
q = await quote({ area: wuse });
check("Wuse at Central's, with the store's own time", [q.body.plan.shipTotal, q.body.plan.deliveries[0].eta], [2000, "1–2 days"]);

o = await order();
check("an order without an area is refused, and says why", [o.status, o.body.error, o.body.areaNeeded], [400, "Choose your delivery area.", true]);
o = await order({ area: 999999 });
check("an area that doesn't exist is refused", o.status, 400);
o = await order({ area: karu });
check("an order to Karu is charged the Outskirts fee, and remembers where it went",
  [o.status, placed(o.body.order.no)], [200, { shipping: 4000, area: "Karu", zone: "Outskirts" }]);
check("the confirmation names the area with the address", o.body.order.deliverTo, "12 Palm Close, Karu");
check("its parcel is recorded at that fee", row("SELECT ship_ngn FROM order_shipments WHERE order_no=?", o.body.order.no).ship_ngn, 4000);
const karuOrder = o.body.order.no;
o = await order({ fulfill: "collect" });
check("click & collect needs no area and costs nothing", [o.status, placed(o.body.order.no)], [200, { shipping: 0, area: "", zone: "" }]);

console.log("\nAn area that isn't listed");
o = await order({ area: OTHER_AREA });
check("\"somewhere else\" pays the standard fee", [o.status, placed(o.body.order.no)], [200, { shipping: 2500, area: "Other area", zone: "" }]);
check("…and the confirmation doesn't pretend to know the area", o.body.order.deliverTo, "12 Palm Close");
r = await call(admin, "/delivery/locations/abuja", { method: "PATCH", token: superT, body: { unlistedArea: false } });
check("the house can require a listed area", [r.status, (await storeAreas()).unlistedArea], [200, false]);
check("…after which \"somewhere else\" is refused", (await order({ area: OTHER_AREA })).status, 400);
await call(admin, "/delivery/locations/abuja", { method: "PATCH", token: superT, body: { unlistedArea: true, shipNGN: "3,000" } });
check("the standard fee is the store's own, and can be changed here", placed((await order({ area: OTHER_AREA })).body.order.no).shipping, 3000);

console.log("\nMoving an area between zones");
r = await call(admin, `/delivery/zones/${central}`, { method: "PATCH", token: superT, body: { areas: "Wuse, Garki, KARU" } });
check("adding Karu to Central moves it, and says from where", r.body.moved, [{ name: "Karu", from: "Outskirts" }]);
check("Karu keeps its id, so a checkout holding it still works", row("SELECT id, zone_id FROM delivery_areas WHERE id=?", karu), { id: karu, zone_id: central });
check("Outskirts is left with Nyanya", (await call(admin, "/delivery", { token: superT })).body.locations.find((l) => l.id === "abuja").zones.find((z) => z.id === outskirts).areas.map((a) => a.name), ["Nyanya"]);
check("Karu is now quoted at Central's fee", (await quote({ area: karu })).body.plan.shipTotal, 2000);
check("the earlier Karu order still says what it was charged for", placed(karuOrder), { shipping: 4000, area: "Karu", zone: "Outskirts" });
await call(admin, `/delivery/zones/${central}`, { method: "PATCH", token: superT, body: { areas: ["Wuse", "Garki"] } });
await call(admin, `/delivery/zones/${outskirts}`, { method: "PATCH", token: superT, body: { areas: ["Karu", "Nyanya"] } });
check("taken out of Central and put back, Karu is a new row in Outskirts", row("SELECT zone_id FROM delivery_areas WHERE name='Karu'").zone_id, outskirts);
const karu2 = row("SELECT id FROM delivery_areas WHERE name='Karu'").id;

console.log("\nWhen delivery is free");
check("over the house's ₦100,000 a zone that follows the house rule is free",
  (await quote({ area: karu2, items: cart(3) })).body.plan.shipTotal, 0);
await call(admin, `/delivery/zones/${outskirts}`, { method: "PATCH", token: superT, body: { freeOver: 0 } });
check("a zone set to never free still charges", (await quote({ area: karu2, items: cart(3) })).body.plan.shipTotal, 4000);
await call(admin, `/delivery/zones/${outskirts}`, { method: "PATCH", token: superT, body: { freeOver: "50,000" } });
check("a zone with its own line is free from it", [(await quote({ area: karu2, items: cart(1) })).body.plan.shipTotal], [0]);
o = await order({ area: karu2 });
check("…on the order too", placed(o.body.order.no).shipping, 0);
await call(admin, `/delivery/zones/${outskirts}`, { method: "PATCH", token: superT, body: { freeOver: null } });
check("back to the house rule", (await quote({ area: karu2, items: cart(1) })).body.plan.shipTotal, 4000);

console.log("\nA parcel from another city");
q = await quote({ area: karu2, items: [{ productId: far.product_id, variantId: far.id, qty: 1 }] });
check("only Lagos has it: the cross-city rate, whatever the area", [q.body.plan.mode, q.body.plan.shipTotal], ["single", 4500]);
check("…but the area is still asked for, so the rider knows where to go", (await quote({ items: [{ productId: far.product_id, variantId: far.id, qty: 1 }] })).body.plan.areaNeeded, true);

console.log("\nPausing and removing");
await call(admin, `/delivery/zones/${outskirts}`, { method: "PATCH", token: superT, body: { active: false } });
check("a paused zone's areas leave the list", (await storeAreas()).areas.map((a) => a.name), ["Garki", "Wuse"]);
check("…and can't be ordered to", (await order({ area: karu2 })).status, 400);
await call(admin, `/delivery/zones/${outskirts}`, { method: "PATCH", token: superT, body: { active: true } });
check("switched back on, they return", (await storeAreas()).areas.length, 4);
r = await call(admin, `/delivery/zones/${outskirts}`, { method: "DELETE", token: superT });
check("a zone can be removed, its areas with it", [r.status, row("SELECT COUNT(*) AS n FROM delivery_areas WHERE zone_id=?", outskirts).n], [200, 0]);
check("orders priced in it keep their record", placed(karuOrder).zone, "Outskirts");

console.log("\nWho may price what");
check("a Lagos manager can't price Abuja",
  (await call(admin, `/delivery/zones/${central}`, { method: "PATCH", token: lagosT, body: { fee: 1 } })).status, 403);
check("…or open a zone there",
  (await call(admin, "/delivery/zones", { method: "POST", token: lagosT, body: { locationId: "abuja", name: "Mine", fee: 1 } })).status, 403);
r = await call(admin, "/delivery/zones", { method: "POST", token: lagosT, body: { locationId: "lagos", name: "Island", fee: 3500, areas: "Lekki Phase 1, Victoria Island, Ikoyi" } });
check("…but prices Lagos", [r.status, (await storeAreas("lagos")).areas.map((a) => a.name)], [200, ["Ikoyi", "Lekki Phase 1", "Victoria Island"]]);
check("the same area name can exist in two cities",
  (await call(admin, "/delivery/zones", { method: "POST", token: superT, body: { locationId: "ibadan", name: "Town", fee: 3000, areas: "Ikoyi" } })).status, 200);

console.log("\nThe admin's view of an order");
const ov = await call(admin, "/overview?scope=all", { token: superT });
const recent = ov.body.orders.find((x) => x.area === "Karu");
check("recent orders show the area and the address", recent && { area: recent.area, address: recent.address }, { area: "Karu", address: "12 Palm Close" });

console.log(failures ? `\n${failures} delivery check(s) failed` : "\nAll delivery checks passed");
process.exit(failures ? 1 : 0);
