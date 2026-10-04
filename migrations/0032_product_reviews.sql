-- Product ratings, from the people who bought the product.
--
-- The stars on a product card are only worth showing if they come from real
-- buyers, so a review is collected the way Temu and every large marketplace
-- collect them: a few days after an order is delivered (or collected), the
-- buyer gets one email listing what they bought, with five tappable stars
-- beside each item. A tap opens the shop's review page with that rating
-- already chosen; a written line is optional. See worker/reviews.js.
--
-- `review_requests` is the email, one per order, keyed by a random token —
-- the token is the buyer's permission to review what was in that order and
-- nothing else, so no sign-in is needed and nobody can rate a product they
-- did not buy. `product_reviews` is what came back.

CREATE TABLE review_requests (
  order_no    TEXT PRIMARY KEY REFERENCES orders(no) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  opened_at   TEXT,
  reviewed_at TEXT
);

CREATE TABLE product_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  INTEGER,
  size        TEXT NOT NULL DEFAULT '',
  -- NULL for a review the house typed in from feedback it received elsewhere
  -- (WhatsApp, in store); those are never marked as a verified purchase.
  order_no    TEXT REFERENCES orders(no) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  -- What the shop shows as the reviewer: a first name, and the city.
  author      TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  verified    INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'order',     -- order | admin
  status      TEXT NOT NULL DEFAULT 'published', -- published | pending | hidden
  reply       TEXT NOT NULL DEFAULT '',          -- the house's public answer
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- One review per product per order: a second visit to the same link edits it.
CREATE UNIQUE INDEX idx_reviews_order_product ON product_reviews(order_no, product_id) WHERE order_no IS NOT NULL;
CREATE INDEX idx_reviews_product ON product_reviews(product_id, status, created_at);

-- When an order reached the shopper. The review email waits a few days after
-- this, so it arrives once the bottle has actually been worn.
ALTER TABLE orders ADD COLUMN delivered_at TEXT;

-- Orders already marked delivered keep their place in the queue: their
-- delivery time is taken as the last time anything happened to them.
UPDATE orders SET delivered_at = COALESCE(paid_at, placed_at)
 WHERE status IN ('Delivered', 'Collected') AND delivered_at IS NULL;

-- The email itself. Editable, and switchable, from Admin → Integrations like
-- every other automation. It opens enabled: with no email provider connected it
-- queues rather than sends, as every automation here does.
INSERT OR IGNORE INTO automations (id, name, trigger, action, template_title, template_body, delay_minutes, enabled) VALUES
  ('review_request', 'Ask buyers to rate their order', 'review_request', 'email',
   'How did we do? Rate your order',
   'Thank you for shopping with Majestic Roobee. How are you enjoying your order? Tap a star to rate each item — it takes ten seconds and helps other shoppers find their scent.',
   0, 1);

-- How the ratings behave. Every key is only written where it is missing, so a
-- house that has already set one keeps it.
UPDATE settings SET value = json_set(value,
  '$.reviewsOn',            json('true'),
  '$.reviewsModerate',      json('false'),
  '$.reviewRequestDays',    3,
  '$.reviewFallbackDays',   10,
  '$.reviewMaxAgeDays',     45
) WHERE key = 'site' AND json_extract(value, '$.reviewsOn') IS NULL;
