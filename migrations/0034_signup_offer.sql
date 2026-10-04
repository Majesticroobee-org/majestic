-- The sign-up offer, and three home-page wordings the house asked for.
--
-- The first-visit pop-up used to promise "10% off your first order" and hand
-- over a code. It now says what the shop actually offers a new subscriber:
-- two free perfumes with their next order, and first access to every promo.
-- It asks for a name, an email and a phone number, and — separately, unticked
-- until the shopper ticks it — whether they want promotional emails. Anyone
-- who signs up can turn the same details into a Majestic account with one
-- password, right there in the pop-up.
--
-- The two free perfumes are a perk on the *next order*: when somebody who
-- signed up places an order with the same email or phone, the order is marked
-- "Sign-up gift: 2 free perfumes" so the store packs them, and the shopper's
-- timeline says so. One order gets it, once; a cancelled or unpaid-and-expired
-- order hands it back so the next one can carry it (worker/signup.js).

-- ---- Who signed up, and how to reach them ------------------------------------
ALTER TABLE leads ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN phone TEXT NOT NULL DEFAULT '';
-- Everyone on the list before this joined it to hear about offers, so they
-- count as opted in. New pop-up sign-ups say so themselves.
ALTER TABLE leads ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 1;
-- The gift this sign-up earned (empty for a plain newsletter join), and the
-- order that used it.
ALTER TABLE leads ADD COLUMN perk TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN perk_order_no TEXT;
ALTER TABLE leads ADD COLUMN updated_at TEXT;
CREATE INDEX idx_leads_perk ON leads(perk, perk_order_no);

-- What the store should put in the bag with an order, beyond what was bought.
ALTER TABLE orders ADD COLUMN gift_note TEXT NOT NULL DEFAULT '';

-- ---- The pop-up's words ------------------------------------------------------
-- The pop-up reads the live "Popup" campaign when there is one. Only the
-- seeded 10%-off wording is replaced; a campaign the house wrote itself stays.
UPDATE campaigns
   SET title = 'Get Two FREE Perfumes and First Access to Every Promo We Run!',
       message = 'Sign up to get two extra free perfumes with your next order! You''ll also get FIRST ACCESS to all other promos that we run.',
       cta = 'Claim My Free Perfumes'
 WHERE kind = 'Popup' AND title = '10% off your first order';

-- ---- Home page wording ----------------------------------------------------------
UPDATE home_blocks SET sub = 'Our most shopped scents', updated_at = datetime('now')
 WHERE id = 'shelf-most-shopped' AND sub = 'Our most-shopped scents — the ones customers buy again and again.';

UPDATE home_blocks SET cta_label = 'Read the full story', updated_at = datetime('now')
 WHERE id = 'story' AND cta_label = 'Read Her Full Story';

UPDATE settings SET value = json_set(value, '$.reviewsHeadline', 'Reviews')
 WHERE key = 'site' AND json_extract(value, '$.reviewsHeadline') IN ('What Our Customers Say', 'Don''t just take our word for it');
