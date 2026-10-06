// Delivery zones: reading them for the checkout, and writing them for the admin.
// The pricing rules themselves live in src/lib/delivery.js, shared with the
// storefront.

const rowToZone = (z) => ({
  id: z.id, locationId: z.location_id, name: z.name, fee: z.fee_ngn, eta: z.eta || "",
  freeOver: z.free_over_ngn === null || z.free_over_ngn === undefined ? null : z.free_over_ngn,
  active: !!z.active, sort: z.sort,
});

// Every zone with its areas, for the admin. Areas alphabetical, so a long list
// reads like a list.
export async function loadZones(db) {
  const zones = (await db.prepare("SELECT * FROM delivery_zones ORDER BY location_id, sort, id").all()).results.map(rowToZone);
  const areas = (await db.prepare("SELECT id, zone_id, name FROM delivery_areas ORDER BY name COLLATE NOCASE").all()).results;
  for (const z of zones) z.areas = areas.filter((a) => a.zone_id === z.id).map((a) => ({ id: a.id, name: a.name }));
  return zones;
}

// The areas a shopper can pick, per city: only live zones, flattened to one
// row per area carrying its zone's terms — the shopper picks a place, not a
// band. `{ [locationId]: [{ id, name, zone, fee, eta, freeOver }] }`.
export async function loadDeliveryAreas(db) {
  const rows = (await db.prepare(
    `SELECT a.id, a.name, a.location_id, z.name AS zone, z.fee_ngn, z.eta, z.free_over_ngn
       FROM delivery_areas a JOIN delivery_zones z ON z.id = a.zone_id
      WHERE z.active = 1
      ORDER BY a.name COLLATE NOCASE`
  ).all()).results;
  const out = {};
  for (const r of rows) {
    (out[r.location_id] ||= []).push({
      id: r.id, name: r.name, zone: r.zone, fee: r.fee_ngn, eta: r.eta || "",
      freeOver: r.free_over_ngn === null || r.free_over_ngn === undefined ? null : r.free_over_ngn,
    });
  }
  return out;
}

// ---- Writing ----------------------------------------------------------------

const MAX_AREAS = 300;

// "Karu, Nyanya\nKubwa" → ["Karu", "Nyanya", "Kubwa"]: trimmed, spaces
// collapsed, and each name once whatever its capitals.
export function cleanAreaNames(input) {
  const list = Array.isArray(input) ? input : String(input ?? "").split(/[\n,;]+/);
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// A zone's terms from what the admin sent, or a sentence saying what is wrong.
// `partial` allows an update that only names some fields.
export function cleanZone(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) return { error: "Give the zone a name — \"Central\", \"Outskirts\"." };
    out.name = name;
  }
  if (!partial || b.fee !== undefined) {
    const fee = Number(String(b.fee ?? "").replace(/[₦,\s]/g, ""));
    if (!Number.isFinite(fee) || fee < 0 || String(b.fee ?? "").trim() === "") return { error: "Enter the delivery fee in naira (0 for free)." };
    out.fee = Math.round(fee);
  }
  if (!partial || b.eta !== undefined) out.eta = String(b.eta ?? "").trim().slice(0, 40);
  if (!partial || b.freeOver !== undefined) {
    if (b.freeOver === null || b.freeOver === undefined || b.freeOver === "") out.freeOver = null;
    else {
      const v = Number(String(b.freeOver).replace(/[₦,\s]/g, ""));
      if (!Number.isFinite(v) || v < 0) return { error: "The free-delivery amount must be a number of naira." };
      out.freeOver = Math.round(v);
    }
  }
  if (b.active !== undefined) out.active = b.active ? 1 : 0;
  if (b.areas !== undefined) {
    out.areas = cleanAreaNames(b.areas);
    if (out.areas.length > MAX_AREAS) return { error: `A zone can hold up to ${MAX_AREAS} areas.` };
  }
  return { zone: out };
}

// Make `names` exactly the areas of zone `zoneId`.
//
// An area keeps its id for as long as it exists — a shopper half-way through
// checkout holds that id — so names already in this zone stay put, names that
// are in another zone of the same city are *moved* here (an area is in one zone
// at a time), and only names that are new are inserted. Returns the names that
// moved, and where from, so the admin can be told.
export async function setZoneAreas(db, zoneId, locationId, names) {
  const current = (await db.prepare("SELECT a.id, a.name, a.zone_id, z.name AS zone FROM delivery_areas a JOIN delivery_zones z ON z.id = a.zone_id WHERE a.location_id=?")
    .bind(locationId).all()).results;
  const byKey = new Map(current.map((a) => [a.name.toLowerCase(), a]));
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const statements = [];
  const moved = [];
  for (const a of current) {
    if (a.zone_id === zoneId && !wanted.has(a.name.toLowerCase())) {
      statements.push(db.prepare("DELETE FROM delivery_areas WHERE id=?").bind(a.id));
    }
  }
  for (const name of names) {
    const have = byKey.get(name.toLowerCase());
    if (!have) {
      statements.push(db.prepare("INSERT INTO delivery_areas (zone_id, location_id, name) VALUES (?, ?, ?)").bind(zoneId, locationId, name));
    } else if (have.zone_id !== zoneId) {
      moved.push({ name: have.name, from: have.zone });
      statements.push(db.prepare("UPDATE delivery_areas SET zone_id=?, name=? WHERE id=?").bind(zoneId, name, have.id));
    } else if (have.name !== name) {
      // The same place with its spelling tidied — keep the row, take the new text.
      statements.push(db.prepare("UPDATE delivery_areas SET name=? WHERE id=?").bind(name, have.id));
    }
  }
  if (statements.length) await db.batch(statements);
  return moved;
}
