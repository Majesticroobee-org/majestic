// Admin — delivery: what it costs to send an order, and where.
//
// Each city can be one flat fee (the store's standard fee, as it always was), or
// zoned: its areas grouped into fee bands — "Central ₦2,000: Wuse, Garki",
// "Outskirts ₦4,000: Karu, Nyanya" — and the shopper picks their area at
// checkout. The area decides the zone; the zone decides the fee, the delivery
// time and when it is free. The rules are src/lib/delivery.js, which the
// checkout and the server both read, so what is set here is what is charged.
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Button, Input, Select, Switch, Textarea } from "../ds/components.jsx";
import { fmtN } from "./App.jsx";

const card = { background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" };
const linkBtn = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--mr-purple-700)", padding: 0 };
const head = { fontSize: 14, fontWeight: 600, color: "var(--text-strong)" };
const muted = { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 };
const chip = { fontSize: 12, padding: "3px 10px", borderRadius: "var(--radius-pill)", background: "var(--mr-lavender-200)", color: "var(--mr-purple-900)" };
const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 12 };

// Areas people actually give as their address, to save typing the list from
// memory. Only suggestions: an area is priced once it is in a zone.
const COMMON_AREAS = {
  abuja: ["Maitama", "Asokoro", "Wuse", "Wuse 2", "Garki", "Central Area", "Utako", "Jabi", "Wuye", "Mabushi", "Katampe",
    "Jahi", "Kado", "Life Camp", "Gwarinpa", "Dawaki", "Gudu", "Durumi", "Apo", "Lokogoma", "Galadimawa", "Lugbe",
    "Airport Road", "Kubwa", "Dutse", "Bwari", "Karu", "Nyanya", "Mararaba", "Jikwoyi", "Kurudu", "Karmo", "Idu",
    "Dei-Dei", "Kuje", "Gwagwalada"],
  lagos: ["Lekki Phase 1", "Ajah", "Sangotedo", "Victoria Island", "Ikoyi", "Oniru", "Ikeja", "Ikeja GRA", "Maryland",
    "Magodo", "Ogudu", "Gbagada", "Yaba", "Surulere", "Ebute Metta", "Apapa", "Festac", "Isolo", "Oshodi", "Egbeda",
    "Ikotun", "Agege", "Ikorodu", "Ibeju-Lekki", "Ojo", "Badagry"],
  ibadan: ["Bodija", "Agodi", "Jericho", "Ring Road", "Challenge", "Dugbe", "Mokola", "Sango", "UI", "Agbowo", "Akobo",
    "Iyaganku", "Oluyole", "Samonda", "Ojoo", "Moniya", "Apete", "Eleyele", "Iwo Road", "Oke-Ado"],
};
const suggestionsFor = (loc) => COMMON_AREAS[loc.id] || COMMON_AREAS[String(loc.city || "").toLowerCase()] || [];

// A zone's free-delivery line, in the form's terms and back.
const freeModeOf = (z) => (z.freeOver === null || z.freeOver === undefined ? "inherit" : z.freeOver > 0 ? "over" : "never");

export function DeliveryPage({ ctx }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api.get("/api/admin/delivery", ctx.token)
      .then((r) => { setData(r); setErr(""); })
      .catch((e) => { ctx.authFail(e); setErr(e.message); });
  }, [ctx]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return <main style={{ padding: "26px 28px" }}><span style={{ fontSize: 13, color: err ? "#c0587a" : "var(--text-muted)" }}>{err || "Loading…"}</span></main>;
  }
  // A manager prices their own city; a super admin prices any of them.
  const mine = (id) => ctx.isSuper || (ctx.me && ctx.me.scope === id);
  const stores = data.locations.filter((l) => l.active && (ctx.isSuper || mine(l.id)));

  return (
    <main style={{ padding: "26px 28px 48px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 980 }}>
      <p style={{ ...muted, margin: 0, maxWidth: 680 }}>
        Charge by where an order is going. Group a city&apos;s areas into zones, give each zone a fee, and shoppers pick their
        area at checkout. A city with no zones charges its standard fee everywhere.
      </p>
      <RulesCard ctx={ctx} rules={data.rules} stores={data.locations.filter((l) => l.active)} onSaved={load} />
      {stores.map((l) => <CityCard key={l.id} ctx={ctx} loc={l} rules={data.rules} canEdit={mine(l.id)} reload={load} />)}
    </main>
  );
}

// The two rules that are not about one city: free delivery, and what a parcel
// from another city costs.
function RulesCard({ ctx, rules, stores, onSaved }) {
  const [f, setF] = useState(() => ({
    freeShipCity: rules.freeShipCity, freeShipAbujaOver: String(rules.freeShipAbujaOver || ""),
    crossCityShipNGN: String(rules.crossCityShipNGN), crossCityEta: rules.crossCityEta,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (v) => Math.max(0, Math.round(Number(String(v).replace(/[₦,\s]/g, "")) || 0));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/api/admin/settings", {
        settings: {
          freeShipCity: f.freeShipCity, freeShipAbujaOver: num(f.freeShipAbujaOver),
          crossCityShipNGN: num(f.crossCityShipNGN), crossCityEta: f.crossCityEta.trim() || "3–5 days",
        },
      }, ctx.token);
      ctx.flash("Delivery rules saved");
      ctx.loadSettings();
      onSaved();
    } catch (e) { ctx.authFail(e); ctx.flash(e.message); } finally { setBusy(false); }
  };
  const ro = !ctx.isSuper;
  return (
    <section style={{ ...card, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={head}>Shop-wide rules</div>
      <div style={grid2}>
        <Select label="Free delivery in" value={f.freeShipCity} onChange={set("freeShipCity")} disabled={ro}>
          {stores.map((l) => <option key={l.id} value={l.id}>{l.city}</option>)}
        </Select>
        <Input label="…on orders over (₦)" value={f.freeShipAbujaOver} onChange={set("freeShipAbujaOver")} disabled={ro}
          placeholder="100000" hint="Empty or 0: no free delivery. A zone can set its own." />
      </div>
      <div style={grid2}>
        <Input label="From another city (₦)" value={f.crossCityShipNGN} onChange={set("crossCityShipNGN")} disabled={ro}
          placeholder="4500" hint="When the order ships from another city's store" />
        <Input label="…arrives in" value={f.crossCityEta} onChange={set("crossCityEta")} disabled={ro} placeholder="3–5 days" />
      </div>
      {!ro && (
        <div>
          <Button variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </section>
  );
}

function CityCard({ ctx, loc, rules, canEdit, reload }) {
  const [std, setStd] = useState({ shipNGN: String(loc.shipNGN), eta: loc.eta });
  const [editing, setEditing] = useState(null); // a zone id, "new", or null
  const [busy, setBusy] = useState(false);
  const zones = loc.zones || [];
  const live = zones.filter((z) => z.active);
  const areaCount = live.reduce((n, z) => n + z.areas.length, 0);
  const houseFree = rules.freeShipCity === loc.id && rules.freeShipAbujaOver > 0 ? rules.freeShipAbujaOver : 0;
  const freeLabel = (z) => {
    const m = freeModeOf(z);
    if (m === "over") return `Free over ${fmtN(z.freeOver)}`;
    if (m === "never") return "Never free";
    return houseFree ? `Free over ${fmtN(houseFree)}` : "";
  };

  const patchStore = async (body, msg) => {
    setBusy(true);
    try {
      await api.patch(`/api/admin/delivery/locations/${encodeURIComponent(loc.id)}`, body, ctx.token);
      ctx.flash(msg);
      reload();
      ctx.loadLocations();
    } catch (e) { ctx.authFail(e); ctx.flash(e.message); } finally { setBusy(false); }
  };
  const toggleZone = async (z) => {
    try {
      await api.patch(`/api/admin/delivery/zones/${z.id}`, { active: !z.active }, ctx.token);
      ctx.flash(z.active ? `${z.name} paused` : `${z.name} live`);
      reload();
    } catch (e) { ctx.authFail(e); ctx.flash(e.message); }
  };
  const removeZone = async (z) => {
    if (!window.confirm(`Remove ${z.name} and its ${z.areas.length} area${z.areas.length === 1 ? "" : "s"}? Orders already placed keep their record.`)) return;
    try {
      await api.del(`/api/admin/delivery/zones/${z.id}`, ctx.token);
      ctx.flash(`${z.name} removed`);
      reload();
    } catch (e) { ctx.authFail(e); ctx.flash(e.message); }
  };

  // Every area named in this city, so suggestions skip what is already priced.
  const taken = new Set(zones.flatMap((z) => z.areas.map((a) => a.name.toLowerCase())));

  return (
    <section style={{ ...card, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-condensed)", fontSize: 11, letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase", color: "var(--accent-gold-ink)" }}>{loc.store}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-strong)", marginTop: 3 }}>{loc.city}</div>
          <div style={{ ...muted, marginTop: 4 }}>
            {live.length
              ? `${live.length} zone${live.length === 1 ? "" : "s"} · ${areaCount} area${areaCount === 1 ? "" : "s"} — shoppers pick their area at checkout`
              : `One fee for the whole city: ${fmtN(loc.shipNGN)}`}
          </div>
        </div>
        {canEdit && editing === null && <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>Add a zone</Button>}
      </div>

      <div style={{ ...grid2, alignItems: "end" }}>
        <Input id={`dl-${loc.id}-std-fee`} label="Standard fee (₦)" value={std.shipNGN} onChange={(e) => setStd({ ...std, shipNGN: e.target.value })} disabled={!canEdit}
          hint={live.length ? "For areas not on the list" : "Every delivery in this city"} />
        <Input id={`dl-${loc.id}-std-eta`} label="Delivery time" value={std.eta} onChange={(e) => setStd({ ...std, eta: e.target.value })} disabled={!canEdit}
          placeholder="1–2 days" hint="Unless a zone sets its own" />
      </div>
      {canEdit && (std.shipNGN !== String(loc.shipNGN) || std.eta !== loc.eta) && (
        <div><Button variant="primary" size="sm" disabled={busy} onClick={() => patchStore(std, `${loc.city} standard fee saved`)}>Save</Button></div>
      )}
      {live.length > 0 && (
        <Switch label={`Offer "Somewhere else in ${loc.city}" at the standard fee`} checked={loc.unlistedArea} disabled={!canEdit || busy}
          onChange={(e) => patchStore({ unlistedArea: e.target.checked }, e.target.checked ? "Unlisted areas allowed" : "A listed area is now required")} />
      )}

      {editing === "new" && (
        <ZoneForm ctx={ctx} loc={loc} zone={null} houseFree={houseFree} suggestions={suggestionsFor(loc).filter((n) => !taken.has(n.toLowerCase()))}
          onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
      )}

      {zones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {zones.map((z) => (editing === z.id ? (
            <ZoneForm key={z.id} ctx={ctx} loc={loc} zone={z} houseFree={houseFree}
              suggestions={suggestionsFor(loc).filter((n) => !taken.has(n.toLowerCase()))}
              onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
          ) : (
            <div key={z.id} style={{ border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, opacity: z.active ? 1 : 0.6 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)" }}>{z.name}{!z.active && " · paused"}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--mr-purple-900)" }}>{z.fee === 0 ? "Free" : fmtN(z.fee)}</span>
                <span style={muted}>{[z.eta || loc.eta, freeLabel(z)].filter(Boolean).join(" · ")}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {z.areas.length
                  ? z.areas.map((a) => <span key={a.id} style={chip}>{a.name}</span>)
                  : <span style={{ ...muted, color: "var(--mr-gold-600)" }}>No areas yet — shoppers can&apos;t pick this zone.</span>}
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <button style={linkBtn} onClick={() => setEditing(z.id)}>Edit</button>
                  <button style={linkBtn} onClick={() => toggleZone(z)}>{z.active ? "Pause" : "Switch on"}</button>
                  <button style={{ ...linkBtn, color: "#c0587a", marginLeft: "auto" }} onClick={() => removeZone(z)}>Remove</button>
                </div>
              )}
            </div>
          )))}
        </div>
      )}
    </section>
  );
}

function ZoneForm({ ctx, loc, zone, houseFree, suggestions, onDone, onCancel }) {
  const [f, setF] = useState(() => ({
    name: zone ? zone.name : "",
    fee: zone ? String(zone.fee) : "",
    eta: zone ? zone.eta : "",
    freeMode: zone ? freeModeOf(zone) : "inherit",
    freeOver: zone && zone.freeOver > 0 ? String(zone.freeOver) : "",
    areas: zone ? zone.areas.map((a) => a.name).join("\n") : "",
    active: zone ? zone.active : true,
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Several cities, and a form per zone, share these labels — ids keep each
  // label pointing at its own box.
  const fid = (k) => `dl-${loc.id}-${zone ? zone.id : "new"}-${k}`;
  const listed = new Set(f.areas.split(/[\n,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const add = (name) => setF((s) => ({ ...s, areas: s.areas.trim() ? `${s.areas.trim()}\n${name}` : name }));

  const save = async () => {
    if (f.freeMode === "over" && !(Number(String(f.freeOver).replace(/[₦,\s]/g, "")) > 0)) return setErr("Enter the order total that makes delivery free.");
    setBusy(true); setErr("");
    const body = {
      name: f.name, fee: f.fee, eta: f.eta, areas: f.areas, active: f.active,
      freeOver: f.freeMode === "inherit" ? null : f.freeMode === "never" ? 0 : f.freeOver,
    };
    try {
      const r = zone
        ? await api.patch(`/api/admin/delivery/zones/${zone.id}`, body, ctx.token)
        : await api.post("/api/admin/delivery/zones", { ...body, locationId: loc.id }, ctx.token);
      const moved = (r.moved || []).map((m) => `${m.name} (from ${m.from})`);
      ctx.flash(moved.length ? `Saved — moved ${moved.join(", ")}` : zone ? `${f.name} saved` : `${f.name} added`);
      onDone();
    } catch (e) { ctx.authFail(e); setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ border: "1px solid var(--mr-purple-600)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{zone ? `Edit ${zone.name}` : `New zone in ${loc.city}`}</div>
      <div style={grid2}>
        <Input id={fid("name")} label="Zone name" value={f.name} onChange={set("name")} placeholder="Outskirts" hint="For you — shoppers see the areas" />
        <Input id={fid("fee")} label="Delivery fee (₦)" value={f.fee} onChange={set("fee")} placeholder="4000" hint="0 for free" />
      </div>
      <div style={grid2}>
        <Input id={fid("eta")} label="Delivery time" value={f.eta} onChange={set("eta")} placeholder={loc.eta || "1–2 days"} hint="Empty: the store's own" />
        <Select id={fid("free")} label="Free delivery" value={f.freeMode} onChange={set("freeMode")}>
          <option value="inherit">{houseFree ? `Shop-wide rule (over ${fmtN(houseFree)})` : "Shop-wide rule (none here)"}</option>
          <option value="over">Free over an amount</option>
          <option value="never">Never free</option>
        </Select>
      </div>
      {f.freeMode === "over" && (
        <Input id={fid("free-over")} label="Free on orders over (₦)" value={f.freeOver} onChange={set("freeOver")} placeholder="80000" />
      )}
      <Textarea id={fid("areas")} label="Areas" value={f.areas} onChange={set("areas")} rows={4} placeholder={"Karu\nNyanya\nMararaba"}
        hint="One per line, or separated by commas. An area already in another zone moves here." />
      {suggestions.filter((n) => !listed.has(n.toLowerCase())).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: -4 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Tap to add</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestions.filter((n) => !listed.has(n.toLowerCase())).map((n) => (
              <button key={n} type="button" onClick={() => add(n)}
                style={{ ...chip, border: "1px dashed var(--mr-lavender-500)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)" }}>+ {n}</button>
            ))}
          </div>
        </div>
      )}
      {zone && <Switch label="Live at checkout" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? "Saving…" : zone ? "Save" : "Add zone"}</Button>
        <button style={{ ...linkBtn, color: "var(--text-muted)" }} onClick={onCancel}>Cancel</button>
      </div>
      {err && <div style={{ fontSize: 12, color: "#c0587a" }}>{err}</div>}
    </div>
  );
}
