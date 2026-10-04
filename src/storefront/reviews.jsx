// Customer reviews on the storefront: the section on every product page, and
// the page a review email's stars open.
//
// Both draw from worker/reviews.js. The product page fetches its reviews when
// it is opened — the catalogue only carries each product's average and count,
// which is all a card needs — and the review page is reached only through the
// token in a buyer's email, so it never asks anyone to sign in.
import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { ImageSlot } from "../ds/components.jsx";
import { Stars, StarPicker, RATING_WORDS } from "./stars.jsx";

const fmtDate = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const btn = (primary) => ({
  height: 44, padding: "0 20px", borderRadius: "var(--radius-pill)", cursor: "pointer",
  fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500,
  background: primary ? "var(--mr-purple-900)" : "transparent",
  color: primary ? "var(--mr-cream)" : "var(--mr-purple-800)",
  border: primary ? "1px solid var(--mr-purple-900)" : "1px solid var(--border-strong)",
});

// ---- On the product page --------------------------------------------------------

/**
 * "Customer Reviews": the average, the bars, and the reviews themselves,
 * newest first. With no reviews yet it says so in one line — the stars are
 * earned by buyers, and the section explains how a buyer leaves one.
 */
export function ProductReviews({ ctx, productId, compact = false }) {
  const [data, setData] = useState(null);
  const [sort, setSort] = useState("new");
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    api.get(`/api/products/${encodeURIComponent(productId)}/reviews?limit=6&sort=${sort}`)
      .then((r) => { if (live) setData(r); })
      .catch(() => { if (live) setData({ summary: { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] }, reviews: [], more: false }); });
    return () => { live = false; };
  }, [productId, sort]);

  if (ctx.settings.reviewsOn === false) return null;
  const more = () => {
    setLoadingMore(true);
    api.get(`/api/products/${encodeURIComponent(productId)}/reviews?limit=10&offset=${data.reviews.length}&sort=${sort}`)
      .then((r) => setData((d) => ({ ...d, reviews: d.reviews.concat(r.reviews), more: r.more })))
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };
  const s = data ? data.summary : null;

  return (
    <section id="reviews" aria-labelledby="reviews-h" style={{ scrollMarginTop: 80 }}>
      <h2 id="reviews-h" style={{ fontFamily: "var(--font-display)", fontSize: compact ? 22 : "clamp(24px, 2.6vw, 30px)", color: "var(--text-strong)", letterSpacing: "var(--ls-heading)", margin: "0 0 16px" }}>Customer Reviews</h2>
      {!data ? (
        <div style={{ height: 80 }} aria-busy="true" />
      ) : !s.count ? (
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", padding: "18px 18px", display: "flex", alignItems: "center", gap: 14 }}>
          <Stars value={0} size={18} label="No reviews yet" />
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-body)" }}>
            <strong style={{ fontWeight: 600, color: "var(--text-strong)" }}>No reviews yet.</strong> Bought this? We&apos;ll email you a link to rate it once your order arrives.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(0, 240px) minmax(0, 1fr)", gap: compact ? 16 : 32, alignItems: "center", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", padding: compact ? 18 : 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 44, lineHeight: 1, color: "var(--text-strong)" }}>{s.avg.toFixed(1)}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Stars value={s.avg} size={18} />
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Based on {s.count} {s.count === 1 ? "review" : "reviews"}</span>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {s.dist.map((n, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr 28px", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-body)" }}>
                  <span>{5 - i} star</span>
                  <span style={{ height: 7, borderRadius: 4, background: "var(--surface-sunken)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${s.count ? (n / s.count) * 100 : 0}%`, background: "var(--mr-gold-500)" }} />
                  </span>
                  <span style={{ textAlign: "right", color: "var(--text-muted)" }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
          {s.count > 1 && (
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 0 2px" }}>
              <select aria-label="Sort reviews" value={sort} onChange={(e) => setSort(e.target.value)}
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", background: "var(--surface-card)", color: "var(--text-strong)" }}>
                <option value="new">Most Recent</option>
                <option value="high">Highest Rated</option>
                <option value="low">Lowest Rated</option>
              </select>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.reviews.map((r) => (
              <article key={r.id} style={{ padding: "18px 0", borderBottom: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Stars value={r.rating} size={15} />
                  {r.title && <strong style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-strong)" }}>{r.title}</strong>}
                </div>
                {r.body && <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-body)", margin: 0, whiteSpace: "pre-line" }}>{r.body}</p>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600, color: "var(--mr-purple-800)" }}>{r.author}{r.city ? `, ${r.city}` : ""}</span>
                  {r.verified && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#3f6b45", fontWeight: 500 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      Verified Buyer
                    </span>
                  )}
                  {r.size && <span>· {r.size}</span>}
                  {r.date && <span>· {fmtDate(r.date)}</span>}
                </div>
                {r.reply && (
                  <div style={{ marginTop: 6, background: "var(--mr-lavender-200)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 13, lineHeight: 1.55, color: "var(--mr-purple-900)" }}>
                    <strong style={{ fontWeight: 600 }}>Reply from Majestic Roobee: </strong>{r.reply}
                  </div>
                )}
              </article>
            ))}
          </div>
          {data.more && (
            <div style={{ paddingTop: 16, display: "flex", justifyContent: "center" }}>
              <button type="button" onClick={more} disabled={loadingMore} style={btn(false)}>{loadingMore ? "Loading…" : "Show More Reviews"}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---- The review page ------------------------------------------------------------

/** One item in the order, with its stars and an optional line. */
function ReviewItem({ token, item, initial, onSaved }) {
  const prior = item.review;
  const [rating, setRating] = useState((prior && prior.rating) || initial || 0);
  const [title, setTitle] = useState((prior && prior.title) || "");
  const [body, setBody] = useState((prior && prior.body) || "");
  const [state, setState] = useState(prior ? "saved" : "idle");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(!!initial && !prior);
  const field = { width: "100%", boxSizing: "border-box", fontFamily: "var(--font-sans)", fontSize: 16, padding: "12px 14px", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", background: "var(--mr-cream)", color: "var(--text-strong)", outline: "none" };

  const save = async (r = rating) => {
    if (!r) { setErr("Tap a star to rate it."); return; }
    setErr("");
    setState("saving");
    try {
      const res = await api.post(`/api/reviews/request/${encodeURIComponent(token)}`, { productId: item.productId, rating: r, title, body });
      setState(res.status === "pending" ? "pending" : "saved");
      onSaved();
    } catch (e) {
      setErr(e.message);
      setState("idle");
    }
  };

  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ width: 72, height: 72, borderRadius: "var(--radius-md)", overflow: "hidden", flex: "none", background: "var(--mr-lavender-200)" }}>
          <ImageSlot src={item.imageUrl} name={item.name} sizes="72px" monoSize={20} style={{ width: "100%", height: "100%" }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.25, color: "var(--text-strong)" }}>{item.name}</div>
          {item.size && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{item.size}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StarPicker value={rating} size={32} label={`Rate ${item.name}`} onChange={(n) => { setRating(n); setOpen(true); if (state === "saved" || state === "pending") setState("idle"); }} />
        <span style={{ fontSize: 13.5, fontWeight: 500, color: rating ? "var(--mr-purple-800)" : "var(--text-muted)" }}>{rating ? RATING_WORDS[rating] : "Tap to rate"}</span>
      </div>
      {open && state !== "saved" && state !== "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Headline (optional) — e.g. Lasts all day" aria-label="Review headline" style={{ ...field, height: 48, padding: "0 14px" }} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} placeholder="What did you love? How long does it last? (optional)" aria-label="Your review" style={{ ...field, resize: "vertical" }} />
          {err && <div role="alert" style={{ fontSize: 13, color: "var(--mr-orchid-600)" }}>{err}</div>}
          <button type="button" onClick={() => save()} disabled={state === "saving"} style={{ ...btn(true), height: 48, fontSize: 15 }}>{state === "saving" ? "Submitting…" : "Submit Review"}</button>
        </div>
      )}
      {state === "saved" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#e4efe4", color: "#3f6b45", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 13.5, fontWeight: 500 }}>
          <span>Thank you — your review is live.</span>
          <button type="button" onClick={() => { setState("idle"); setOpen(true); }} style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--font-sans)", fontSize: 13, color: "#3f6b45", textDecoration: "underline", cursor: "pointer" }}>Edit</button>
        </div>
      )}
      {state === "pending" && (
        <div style={{ background: "var(--mr-lavender-200)", color: "var(--mr-purple-900)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 13.5 }}>
          Thank you — your review will appear once we&apos;ve had a look.
        </div>
      )}
    </div>
  );
}

/**
 * /review/<token> — every product in the order, each with five stars.
 *
 * A star tapped in the email arrives as ?p=<product>&r=<n>, so that item opens
 * with its rating chosen and the words box ready; submitting is one more tap.
 */
export function ReviewPage({ ctx }) {
  const token = ctx.reviewToken;
  const [data, setData] = useState(null);
  const [done, setDone] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const preP = params.get("p");
  const preR = parseInt(params.get("r"), 10);

  useEffect(() => {
    let live = true;
    api.get(`/api/reviews/request/${encodeURIComponent(token || "")}`)
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) setData({ error: e.message }); });
    return () => { live = false; };
  }, [token]);

  const wrap = { maxWidth: 640, margin: "0 auto", padding: ctx.isMobile ? "24px 16px 40px" : "48px 24px 64px", display: "flex", flexDirection: "column", gap: 16 };
  if (!data) return <main style={wrap} aria-busy="true"><div style={{ height: 240 }} /></main>;
  if (data.error) {
    return (
      <main style={wrap}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--text-strong)", margin: 0 }}>Rate Your Order</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-body)", margin: 0 }}>{data.error} If you copied it from an email, try tapping the button in the email instead.</p>
        <div><button type="button" onClick={() => ctx.nav("shop")} style={btn(true)}>Continue Shopping</button></div>
      </main>
    );
  }
  const reviewed = data.items.filter((i) => i.review).length + done;
  return (
    <main style={wrap}>
      <div>
        <div style={{ fontFamily: "var(--font-condensed)", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent-gold-ink)" }}>Order {data.order.no}</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: ctx.isMobile ? 28 : 34, lineHeight: 1.15, color: "var(--text-strong)", margin: "6px 0 8px" }}>
          {data.order.firstName ? `How did we do, ${data.order.firstName}?` : "How did we do?"}
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text-body)", margin: 0 }}>
          Rate each item in your order. Your stars appear on the product for other shoppers — a few words about how it smells and how long it lasts helps them most.
        </p>
      </div>
      {data.items.length === 0 && <p style={{ fontSize: 14.5, color: "var(--text-body)" }}>There&apos;s nothing left in this order to review.</p>}
      {data.items.map((it) => (
        <ReviewItem key={it.productId} token={token} item={it} initial={it.productId === preP && preR >= 1 && preR <= 5 ? preR : 0} onSaved={() => setDone((n) => n + (it.review ? 0 : 1))} />
      ))}
      {reviewed > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 6 }}>
          <button type="button" onClick={() => ctx.nav("shop")} style={btn(true)}>Continue Shopping</button>
          <button type="button" onClick={() => ctx.nav("home")} style={btn(false)}>Back to Home</button>
        </div>
      )}
    </main>
  );
}
