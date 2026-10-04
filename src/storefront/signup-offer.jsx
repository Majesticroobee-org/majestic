// The sign-up pop-up's body, shared by the phone's sheet and the desktop's box.
//
// Two steps. First the offer and the form — name, email, phone, and a separate
// tick-box for promotional email that starts unticked, because consent is given
// rather than assumed. Then, once they are on the list, the same details become
// a Majestic account with one password: their orders, their wishlist and the
// gift waiting on their next order, in one place. Both steps can be left at
// any point; the gift does not depend on making an account or on the tick-box.
//
// The words come from the live "Popup" campaign when the house has written one
// (Admin → Notifications), and from OFFER below when it hasn't.
import React, { useState } from "react";

export const OFFER = {
  title: "Get Two FREE Perfumes and First Access to Every Promo We Run!",
  message: "Sign up to get two extra free perfumes with your next order! You'll also get FIRST ACCESS to all other promos that we run.",
  cta: "Claim My Free Perfumes",
};

const firstOf = (name) => String(name || "").trim().split(/\s+/)[0] || "";

export function SignupOffer({ ctx, mobile = false, onDone }) {
  const camp = ctx.D && ctx.D.popup ? ctx.D.popup : null;
  const title = (camp && camp.title) || OFFER.title;
  const message = (camp && camp.message) || OFFER.message;
  const cta = (camp && camp.cta) || OFFER.cta;
  const me = ctx.cust || {};
  const [f, setF] = useState({ name: me.name || "", email: me.email || "", phone: me.phone || "", optIn: false });
  const [step, setStep] = useState("form"); // form | joined | account-done
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pw, setPw] = useState("");
  const [hasAccount, setHasAccount] = useState(false);

  const field = {
    width: "100%", boxSizing: "border-box", height: mobile ? 50 : 46, padding: "0 14px",
    fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text-strong)",
    background: "var(--surface-card)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-md)", outline: "none",
  };
  const primary = {
    width: "100%", height: mobile ? 52 : 48, border: "none", borderRadius: "var(--radius-pill)", cursor: "pointer",
    background: "var(--accent-gold)", color: "var(--mr-purple-950)", fontFamily: "var(--font-sans)", fontSize: 15.5, fontWeight: 600,
    boxShadow: "var(--shadow-gold)",
  };
  const quiet = { background: "none", border: "none", padding: 8, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13.5, color: "var(--mr-purple-700)", textDecoration: "underline", textUnderlineOffset: 3 };

  const join = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Enter a valid email address.");
    setErr(""); setBusy(true);
    try {
      await ctx.joinOffer({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), marketingOptIn: f.optIn });
      setStep("joined");
    } catch (x) {
      setErr(x.message || "Couldn't sign you up just now — please try again.");
    } finally { setBusy(false); }
  };

  const makeAccount = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setErr("Choose a password of at least 8 characters.");
    setErr(""); setBusy(true);
    try {
      await ctx.custRegister({ email: f.email.trim(), password: pw, name: f.name.trim(), phone: f.phone.trim(), marketingOptIn: f.optIn });
      setStep("account-done");
    } catch (x) {
      if (x.status === 409) setHasAccount(true);
      setErr(x.message || "Couldn't create your account just now.");
    } finally { setBusy(false); }
  };

  if (step === "form") {
    return (
      <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: mobile ? 26 : 28, lineHeight: 1.15, letterSpacing: "var(--ls-heading)", color: "var(--mr-purple-900)", margin: 0, textWrap: "balance" }}>{title}</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--text-body)", margin: "0 0 4px" }}>{message}</p>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" aria-label="Your name" autoComplete="name" style={field} />
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" aria-label="Your email address" autoComplete="email" style={field} />
        <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone (WhatsApp)" aria-label="Your phone number" autoComplete="tel" style={field} />
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "6px 2px 2px", cursor: "pointer" }}>
          <input type="checkbox" checked={f.optIn} onChange={(e) => setF({ ...f, optIn: e.target.checked })}
            style={{ width: 20, height: 20, margin: "1px 0 0", flex: "none", accentColor: "var(--mr-purple-900)", cursor: "pointer" }} />
          <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-body)" }}>
            <strong style={{ fontWeight: 600, color: "var(--text-strong)" }}>Email me promotions.</strong> Occasional emails about promotions, new products and important updates to keep you in the loop. Unsubscribe any time.
          </span>
        </label>
        {err && <div role="alert" style={{ fontSize: 13, color: "var(--mr-orchid-600)" }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? 0.7 : 1, marginTop: 4 }}>{busy ? "Signing you up…" : cta}</button>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--text-muted)", textAlign: "center" }}>
          One gift per customer, added to your next order. Use the same email or phone at checkout.
        </div>
      </form>
    );
  }

  const name = firstOf(f.name);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 46, height: 46, flex: "none", borderRadius: "50%", background: "var(--mr-gold-200)", color: "var(--mr-purple-900)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="13" rx="1" /><path d="M12 8v13M3 12h18M12 8S10 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
        </span>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 25, lineHeight: 1.15, color: "var(--mr-purple-900)", margin: 0 }}>
          {step === "account-done" ? `Welcome to Majestic${name ? `, ${name}` : ""}!` : `You're in${name ? `, ${name}` : ""}!`}
        </h2>
      </div>
      <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--text-body)", margin: 0 }}>
        Your <strong style={{ fontWeight: 600 }}>two free perfumes</strong> will be added to your next order — just check out with the same email or phone.
        {f.optIn ? " You'll be first to hear about every promo." : ""}
      </p>

      {step === "joined" && !ctx.cust && (
        <form onSubmit={makeAccount} style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)" }}>Create your Majestic account</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-body)" }}>Track your orders, save favourites and see your free gift — just add a password.</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Choose a password (8+ characters)" aria-label="Choose a password" autoComplete="new-password" style={field} />
          {err && (
            <div role="alert" style={{ fontSize: 13, color: "var(--mr-orchid-600)" }}>
              {err}{hasAccount && <> <button type="button" onClick={() => { onDone(); ctx.nav("account"); }} style={{ ...quiet, padding: 0 }}>Sign in</button></>}
            </div>
          )}
          <button type="submit" disabled={busy} style={{ ...primary, background: "var(--mr-purple-900)", color: "var(--mr-cream)", boxShadow: "var(--shadow-sm)", opacity: busy ? 0.7 : 1 }}>{busy ? "Creating…" : "Create My Account"}</button>
        </form>
      )}

      {step === "account-done" && (
        <div style={{ background: "#e4efe4", color: "#3f6b45", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 13.5 }}>
          Your account is ready and you&apos;re signed in.
        </div>
      )}

      <button type="button" onClick={onDone} style={step === "joined" && !ctx.cust ? quiet : primary}>
        {step === "joined" && !ctx.cust ? "No thanks — continue shopping" : "Start Shopping"}
      </button>
    </div>
  );
}
