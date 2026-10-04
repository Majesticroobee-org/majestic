// Admin — product ratings.
//
// The stars on the storefront come from buyers: a few days after an order
// arrives, the buyer is emailed a link to rate what they bought (worker/
// reviews.js). This page is where the house reads what came back, hides
// anything that shouldn't be public, answers a review in public, types in
// feedback it received another way, and decides when buyers are asked.
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Button, Input, Select, Switch, Textarea } from "../ds/components.jsx";
import { ProductPicker } from "./pages-content.jsx";

const card = { background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" };
const linkBtn = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--mr-purple-700)", padding: 0 };
const STATUS = {
  published: { label: "Live", bg: "#e4efe4", fg: "#3f6b45" },
  pending: { label: "Waiting for approval", bg: "var(--mr-gold-200)", fg: "var(--mr-gold-600)" },
  hidden: { label: "Hidden", bg: "var(--surface-sunken)", fg: "var(--mr-purple-800)" },
};
const stars = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export function ProductReviewsPage({ ctx }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [replying, setReplying] = useState(null);
  const [reply, setReply] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ productId: "", rating: 5, title: "", body: "", author: "", city: "" });
  const [err, setErr] = useState("");
  const st = (ctx.settingsData && ctx.settingsData.settings) || {};
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    if (!ctx.settingsData) return;
    setCfg({
      reviewsOn: st.reviewsOn !== false,
      reviewsModerate: !!st.reviewsModerate,
      reviewRequestDays: st.reviewRequestDays ?? 3,
      reviewFallbackDays: st.reviewFallbackDays ?? 10,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.settingsData]);

  const load = useCallback(() => {
    api.get("/api/admin/product-reviews", ctx.token).then(setData).catch(ctx.authFail);
  }, [ctx.token, ctx.authFail]);
  useEffect(() => { load(); }, [load]);

  const patch = async (r, body, msg) => {
    try {
      await api.patch(`/api/admin/product-reviews/${r.id}`, body, ctx.token);
      load();
      if (msg) ctx.flash(msg);
    } catch (e) { ctx.authFail(e); ctx.flash(e.message); }
  };
  const remove = async (r) => {
    if (!window.confirm("Delete this review for good? Hiding it keeps it on record.")) return;
    try { await api.del(`/api/admin/product-reviews/${r.id}`, ctx.token); load(); ctx.flash("Review deleted"); } catch (e) { ctx.authFail(e); ctx.flash(e.message); }
  };
  const add = async () => {
    setErr("");
    try {
      await api.post("/api/admin/product-reviews", f, ctx.token);
      setAdding(false);
      setF({ productId: "", rating: 5, title: "", body: "", author: "", city: "" });
      load();
      ctx.flash("Review added");
    } catch (e) { ctx.authFail(e); setErr(e.message); }
  };
  const saveCfg = async () => {
    try {
      await api.put("/api/admin/settings", { settings: {
        ...cfg,
        reviewRequestDays: Math.max(0, parseInt(cfg.reviewRequestDays, 10) || 0),
        reviewFallbackDays: Math.max(1, parseInt(cfg.reviewFallbackDays, 10) || 10),
      } }, ctx.token);
      ctx.loadSettings();
      ctx.flash("Saved");
    } catch (e) { ctx.authFail(e); ctx.flash(e.message); }
  };

  const list = data ? data.reviews.filter((r) => filter === "all" || r.status === filter) : [];
  const pending = data ? data.reviews.filter((r) => r.status === "pending").length : 0;
  const live = data ? data.reviews.filter((r) => r.status === "published") : [];
  const avg = live.length ? (live.reduce((n, r) => n + r.rating, 0) / live.length).toFixed(1) : "—";
  const req = data ? data.requests : { sent: 0, opened: 0, reviewed: 0 };

  return (
    <main style={{ padding: "26px 28px 48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)", padding: "2px 2px 0" }}>Product ratings</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {[["Live reviews", live.length], ["Average", avg], ["Emails sent", req.sent], ["Rated", req.sent ? `${Math.round((req.reviewed / req.sent) * 100)}%` : "—"]].map(([k, v]) => (
            <div key={k} style={{ ...card, padding: "14px 14px" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{k}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-strong)", marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["all", "All"], ["pending", `Waiting${pending ? ` (${pending})` : ""}`], ["published", "Live"], ["hidden", "Hidden"]].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "7px 14px", borderRadius: "var(--radius-pill)", border: `1px solid ${filter === id ? "var(--mr-purple-900)" : "var(--border-hairline)"}`, background: filter === id ? "var(--mr-purple-900)" : "var(--surface-card)", color: filter === id ? "var(--mr-cream)" : "var(--mr-purple-800)" }}>{label}</button>
          ))}
        </div>
        {data && !list.length && (
          <div style={{ ...card, padding: 24, textAlign: "center", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
            {data.reviews.length ? "Nothing here." : "No reviews yet. Buyers are emailed a link to rate their order a few days after it arrives — mark orders Delivered or Collected and the first ones will follow."}
          </div>
        )}
        {list.map((r) => {
          const tone = STATUS[r.status] || STATUS.hidden;
          return (
            <div key={r.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 8, opacity: r.status === "hidden" ? 0.7 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: "var(--mr-gold-500)", fontSize: 16, letterSpacing: 1 }} aria-label={`${r.rating} stars`}>{stars(r.rating)}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-strong)" }}>{r.productName}</span>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: "var(--radius-pill)", background: tone.bg, color: tone.fg, marginLeft: "auto" }}>{tone.label}</span>
              </div>
              {r.title && <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-strong)" }}>{r.title}</div>}
              {r.body && <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-body)", whiteSpace: "pre-line" }}>{r.body}</div>}
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {r.author}{r.city ? `, ${r.city}` : ""} · {r.date}{r.size ? ` · ${r.size}` : ""} · {r.source === "admin" ? "Added by the store" : r.orderNo ? `Verified buyer · ${r.orderNo}` : "Verified buyer"}
              </div>
              {r.reply && replying !== r.id && <div style={{ fontSize: 12.5, background: "var(--mr-lavender-200)", borderRadius: "var(--radius-sm)", padding: "8px 10px", color: "var(--mr-purple-900)" }}>Your reply: {r.reply}</div>}
              {replying === r.id && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Textarea label="Public reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} hint="Shown under the review on the product page." />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" onClick={() => { patch(r, { reply }, "Reply saved"); setReplying(null); }}>Save reply</Button>
                    <Button size="sm" variant="secondary" onClick={() => setReplying(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", paddingTop: 2 }}>
                {r.status !== "published" && <button onClick={() => patch(r, { status: "published" }, "Review is live")} style={{ ...linkBtn, fontWeight: 600 }}>{r.status === "pending" ? "Approve" : "Show"}</button>}
                {r.status !== "hidden" && <button onClick={() => patch(r, { status: "hidden" }, "Review hidden")} style={linkBtn}>Hide</button>}
                <button onClick={() => { setReplying(r.id); setReply(r.reply || ""); }} style={linkBtn}>{r.reply ? "Edit reply" : "Reply"}</button>
                <button onClick={() => remove(r)} style={{ ...linkBtn, color: "#c0587a", marginLeft: "auto" }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 84 }}>
        {cfg && (
          <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>How ratings work</div>
            <Switch label="Show stars and reviews on the shop" checked={cfg.reviewsOn} onChange={(e) => setCfg({ ...cfg, reviewsOn: e.target.checked })} />
            <Switch label="Approve written reviews before they show" checked={cfg.reviewsModerate} onChange={(e) => setCfg({ ...cfg, reviewsModerate: e.target.checked })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Ask after delivery (days)" type="number" min="0" value={cfg.reviewRequestDays} onChange={(e) => setCfg({ ...cfg, reviewRequestDays: e.target.value })} />
              <Input label="…or after payment, if never marked delivered (days)" type="number" min="1" value={cfg.reviewFallbackDays} onChange={(e) => setCfg({ ...cfg, reviewFallbackDays: e.target.value })} />
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>
              Each buyer gets one email per order with five tappable stars beside every item. Stars on their own always show straight away. The email&apos;s words are under Integrations → Automations (&ldquo;Ask buyers to rate their order&rdquo;), and it needs the shop&apos;s web address set in Settings.
            </div>
            <Button variant="primary" onClick={saveCfg}>Save</Button>
          </div>
        )}
        <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>Add feedback you received</div>
          {!adding ? (
            <>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-muted)" }}>For a review a customer sent on WhatsApp or gave in store. It counts towards the product&apos;s stars and shows as &ldquo;added by the store&rdquo;, never as a verified buyer.</div>
              <Button variant="secondary" onClick={() => setAdding(true)}>Add a review</Button>
            </>
          ) : (
            <>
              <ProductPicker products={ctx.products} value={f.productId} onChange={(id) => setF({ ...f, productId: id })} label="Product" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="Customer's first name" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
                <Input label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
              </div>
              <Select label="Rating" value={String(f.rating)} onChange={(e) => setF({ ...f, rating: parseInt(e.target.value, 10) })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{stars(n)}</option>)}
              </Select>
              <Input label="Headline (optional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <Textarea label="What they said (optional)" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={3} />
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={add}>Add review</Button>
                <Button variant="secondary" onClick={() => { setAdding(false); setErr(""); }}>Cancel</Button>
              </div>
              {err && <div style={{ fontSize: 12, color: "#c0587a" }}>{err}</div>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
