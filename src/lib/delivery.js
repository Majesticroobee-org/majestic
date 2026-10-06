// What delivery inside the buyer's own city costs.
//
// A city can be priced two ways. With no zones set up, every address in it pays
// the store's standard fee. With zones, the house groups the city's areas into
// fee bands — "Central: Wuse, Garki, Maitama — ₦2,500", "Outskirts: Karu,
// Nyanya, Kubwa — ₦4,000" — and the shopper picks their area at checkout. The
// area decides the band; the band decides the fee, how long it takes, and when
// it is free.
//
// Shared by the worker (which charges) and the storefront (which previews), so
// the number in the dropdown is the number on the Paystack charge.

// The dropdown's last option, offered only where the house allows it: an area
// that isn't on the list pays the store's standard fee.
export const OTHER_AREA = "other";

// The house-wide free-delivery promise: one city, one threshold. Nothing else
// gets free delivery unless a zone says so itself. A threshold of 0 (or none)
// switches it off rather than making every order free.
export function shopWideFreeOver(cityId, settings = {}) {
  const city = settings.freeShipCity ?? "abuja";
  const over = Number(settings.freeShipAbujaOver ?? 100000);
  return cityId === city && over > 0 ? over : 0;
}

/**
 * The rate for a parcel sent from the buyer's own store.
 *
 * @param cityId       the buyer's city (a location id)
 * @param standardFee  the store's own flat fee — what an unzoned city, or an
 *                     unlisted area, pays
 * @param standardEta  the store's own delivery time
 * @param area         the area the shopper picked, carrying its zone's terms
 *                     ({ fee, eta, freeOver }), or null
 * @returns { fee, eta, freeOver } — freeOver 0 means never free
 *
 * A zone's `freeOver` is null to follow the house-wide rule, 0 for never free,
 * or the order value at which delivery to that zone becomes free.
 */
export function localRate({ cityId, standardFee, standardEta, area, settings = {} }) {
  const inherited = shopWideFreeOver(cityId, settings);
  if (!area) return { fee: Math.max(0, Number(standardFee) || 0), eta: standardEta || "", freeOver: inherited };
  const own = area.freeOver;
  return {
    fee: Math.max(0, Number(area.fee) || 0),
    eta: area.eta || standardEta || "",
    freeOver: own === null || own === undefined ? inherited : Math.max(0, Number(own) || 0),
  };
}

// What one parcel of this value pays at this rate.
export function feeFor(rate, value) {
  return rate.freeOver > 0 && value >= rate.freeOver ? 0 : rate.fee;
}

/**
 * Which of the city's areas the shopper chose.
 *
 * @param areaId         what the checkout sent: an area id, OTHER_AREA, or empty
 * @param areas          the city's live areas, each { id, name, zone, fee, eta, freeOver }
 * @param allowUnlisted  whether "somewhere else" is on offer
 * @returns { area, label, required, error }
 *   area      the matched area, or null (unzoned city, or "somewhere else")
 *   label     what to write on the order: the area's name, "Other area", or ""
 *   required  whether this city asks for an area at all
 *   error     set when an area is required and none valid was given
 */
export function pickArea({ areaId, areas = [], allowUnlisted = true }) {
  if (!areas.length) return { area: null, label: "", required: false, error: null };
  const id = String(areaId ?? "").trim();
  if (id === OTHER_AREA && allowUnlisted) return { area: null, label: "Other area", required: true, error: null };
  const hit = id && areas.find((a) => String(a.id) === id);
  if (hit) return { area: hit, label: hit.name, required: true, error: null };
  return { area: null, label: "", required: true, error: "Choose your delivery area." };
}

// ---- Before the shopper has said where ----------------------------------------
// The storefront's location rows: { id, shipNGN, areas, unlistedArea }.

// The cheapest delivery anywhere in the city — "from ₦2,000" on the city picker
// and the cart, until an area is chosen.
export function cheapestFee(loc) {
  const areas = (loc && loc.areas) || [];
  const standard = Number(loc && loc.shipNGN) || 0;
  if (!areas.length) return standard;
  const fees = areas.map((a) => Math.max(0, Number(a.fee) || 0));
  if (loc.unlistedArea !== false) fees.push(standard);
  return Math.min(...fees);
}

// The free-delivery line that holds wherever in the city the shopper is — or 0
// when the areas disagree, so "free over ₦100,000" is never promised to a
// shopper whose area turns out not to get it.
export function cityFreeOver(loc, settings = {}) {
  if (!loc) return 0;
  const inherited = shopWideFreeOver(loc.id, settings);
  const areas = loc.areas || [];
  if (!areas.length) return inherited;
  const lines = new Set(areas.map((a) => (a.freeOver === null || a.freeOver === undefined ? inherited : Math.max(0, Number(a.freeOver) || 0))));
  if (loc.unlistedArea !== false) lines.add(inherited);
  return lines.size === 1 ? [...lines][0] : 0;
}
