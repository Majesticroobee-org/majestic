// The sign-up offer: two free perfumes with the next order, and first access
// to every promo.
//
// The pop-up on the storefront collects a name, an email, a phone number and —
// on its own, unticked by default — consent to promotional email. That is a row
// in `leads`, carrying the perk it earned. The perk is not a code to remember:
// the next order placed with the same email or phone simply carries it, marked
// on the order ("Sign-up gift: 2 free perfumes") so the store packs them.
//
// Three rules keep it honest:
//   · one perk per sign-up, used by one order — signing up again does not
//     hand out a second one;
//   · an order that never happens (cancelled, or an unpaid card order that
//     expired) gives the perk back for the next order;
//   · consent to email is recorded as given, never assumed — the perk does not
//     depend on it.

const lc = (s) => String(s || "").trim().toLowerCase();
const clip = (s, n) => String(s || "").trim().slice(0, n);

/** A phone number as digits only, which is how it is stored and compared. */
export function phoneDigits(s) {
  return String(s || "").replace(/\D+/g, "").slice(0, 16);
}

/** The last ten digits — the part of a Nigerian number that never varies (0803… / 234803…). */
export const phoneKey = (s) => phoneDigits(s).slice(-10);

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

/** What a sign-up earns today, from Settings. Empty when the offer is off. */
export function perkFor(settings = {}) {
  if (settings.signupPerkOn === false) return "";
  return clip(settings.signupPerk, 80) || "2 free perfumes";
}

/**
 * Add someone to the list, or update them.
 *
 * `perk` is only ever granted to a row that has never had one, so a second
 * sign-up with the same address cannot earn a second gift. Name and phone fill
 * in what was blank and otherwise take the latest; email consent takes the
 * latest explicit answer.
 */
export async function joinList(db, { email, name = "", phone = "", optIn, source = "popup", perk = "" }) {
  const addr = lc(email);
  if (!isEmail(addr)) return { ok: false, error: "Enter a valid email address." };
  const row = await db.prepare("SELECT * FROM leads WHERE email=?").bind(addr).first();
  const consent = optIn === undefined ? null : optIn ? 1 : 0;
  if (!row) {
    await db.prepare(
      "INSERT INTO leads (email, source, name, phone, marketing_opt_in, perk, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    ).bind(addr, clip(source, 40) || "popup", clip(name, 80), phoneDigits(phone), consent === null ? 1 : consent, perk).run();
    return { ok: true, perk, isNew: true };
  }
  const givePerk = perk && !row.perk;
  await db.prepare(
    `UPDATE leads SET name = COALESCE(NULLIF(?, ''), name), phone = COALESCE(NULLIF(?, ''), phone),
       marketing_opt_in = COALESCE(?, marketing_opt_in), perk = CASE WHEN ? THEN ? ELSE perk END,
       updated_at = datetime('now') WHERE id = ?`
  ).bind(clip(name, 80), phoneDigits(phone), consent, givePerk ? 1 : 0, perk, row.id).run();
  return { ok: true, perk: givePerk ? perk : row.perk_order_no ? "" : row.perk, isNew: false };
}

/**
 * Attach an unused sign-up perk to a newly placed order, if its buyer has one
 * waiting — matched on email, or on the phone number's last ten digits.
 * Returns the note written on the order, or "".
 */
export async function applySignupPerk(db, { no, email, phone }) {
  const addr = lc(email);
  const key = phoneKey(phone);
  if (!isEmail(addr) && key.length < 7) return "";
  const lead = await db.prepare(
    `SELECT * FROM leads WHERE perk <> '' AND perk_order_no IS NULL
       AND (email = ? OR (length(?) >= 7 AND substr(phone, -10) = ?))
     ORDER BY created_at LIMIT 1`
  ).bind(addr, key, key).first();
  if (!lead) return "";
  // Conditional, so two orders placed at once cannot both take it.
  const r = await db.prepare("UPDATE leads SET perk_order_no=?, updated_at=datetime('now') WHERE id=? AND perk_order_no IS NULL").bind(no, lead.id).run();
  if (!r.meta || !r.meta.changes) return "";
  const note = `Sign-up gift: ${lead.perk}`;
  await db.prepare("UPDATE orders SET gift_note=? WHERE no=?").bind(note, no).run();
  return note;
}

/** An order that will never be fulfilled hands its perk back. */
export async function releaseSignupPerk(db, no) {
  await db.prepare("UPDATE leads SET perk_order_no=NULL, updated_at=datetime('now') WHERE perk_order_no=?").bind(no).run();
  await db.prepare("UPDATE orders SET gift_note='' WHERE no=? AND gift_note LIKE 'Sign-up gift:%'").bind(no).run();
}

/** The perk waiting for (or already used by) a customer, for their account page. */
export async function perkOf(db, email) {
  const row = await db.prepare("SELECT perk, perk_order_no FROM leads WHERE email=? AND perk <> ''").bind(lc(email)).first();
  return row ? { perk: row.perk, used: !!row.perk_order_no, orderNo: row.perk_order_no || "" } : null;
}
