// Stars: the rating a product's buyers gave it, as every card, the product
// page and the review page draw it. The numbers come from worker/reviews.js —
// only real reviews, so a product nobody has rated shows no stars at all rather
// than five empty ones that read as "rated badly".
import React from "react";

const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

/** Five stars filled to `value` (halves and all), read out as a number. */
export function Stars({ value = 0, size = 14, gap = 1, color = "var(--mr-gold-500)", empty = "var(--border-strong)", label }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span role="img" aria-label={label || `Rated ${v} out of 5`} style={{ display: "inline-flex", gap, lineHeight: 0, flex: "none" }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", inset: 0 }}><path d={STAR} fill={empty} /></svg>
            {fill > 0 && (
              <span style={{ position: "absolute", inset: 0, width: `${fill * 100}%`, overflow: "hidden" }}>
                <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={color} /></svg>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** "★★★★½ 4.7 (12)" — the line under a product's name. Nothing when unrated. */
export function RatingLine({ rating, size = 13, fontSize = 12, onClick, showAvg = true }) {
  if (!rating || !rating.count) return null;
  const inner = (
    <>
      <Stars value={rating.avg} size={size} label={`Rated ${rating.avg} out of 5 by ${rating.count} ${rating.count === 1 ? "customer" : "customers"}`} />
      {showAvg && <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{rating.avg.toFixed(1)}</span>}
      <span style={{ color: "var(--text-muted)" }}>({rating.count})</span>
    </>
  );
  const style = { display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize, lineHeight: 1 };
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...style, background: "none", border: "none", padding: 0, cursor: "pointer" }}>{inner}</button>
    : <span style={style}>{inner}</span>;
}

export const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** Five big tappable stars, for choosing a rating. */
export function StarPicker({ value = 0, onChange, size = 36, label = "Your rating" }) {
  return (
    <span role="radiogroup" aria-label={label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""} — ${RATING_WORDS[n]}`} onClick={() => onChange(n)}
          style={{ width: size + 6, height: size + 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={n <= value ? "var(--mr-gold-500)" : "none"} stroke={n <= value ? "var(--mr-gold-500)" : "var(--border-strong)"} strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </button>
      ))}
    </span>
  );
}

