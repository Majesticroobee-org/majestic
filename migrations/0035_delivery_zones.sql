-- Delivery priced by area.
--
-- Until now a city had one delivery fee: the store's own, whether the parcel was
-- going round the corner or to the far edge of town. A rider to Karu costs more
-- than one to Wuse, so the house can now group a city's areas into zones — fee
-- bands — and the shopper picks their area at checkout:
--
--   Central    ₦2,500   Wuse, Garki, Maitama, Asokoro
--   Outskirts  ₦4,000   Karu, Nyanya, Kubwa, Lugbe
--
-- The area decides the zone; the zone decides the fee, how long delivery takes,
-- and when it is free. A city with no live zones is priced exactly as before,
-- by the store's standard fee, and shows no area picker — so nothing changes for
-- shoppers until the house has set its zones up. See src/lib/delivery.js.

CREATE TABLE delivery_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fee_ngn INTEGER NOT NULL DEFAULT 0,
  -- Empty means "the store's own delivery time".
  eta TEXT NOT NULL DEFAULT '',
  -- NULL follows the house-wide free-delivery rule; 0 means never free; a
  -- positive value is the order total at which delivery to this zone is free.
  free_over_ngn INTEGER,
  -- A paused zone's areas leave the checkout's list until it is switched back.
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX idx_delivery_zones_location ON delivery_zones(location_id, sort);

-- The areas a zone covers. An area is in one zone at a time — "Karu" priced
-- twice in one city would leave the shopper choosing their own fee — so the
-- city is carried here too, to make that a constraint rather than a hope.
CREATE TABLE delivery_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_delivery_areas_name ON delivery_areas(location_id, name COLLATE NOCASE);
CREATE INDEX idx_delivery_areas_zone ON delivery_areas(zone_id);

-- Whether a shopper whose area isn't listed may still order delivery, at the
-- store's standard fee. On by default, so a list that is still being built
-- never turns a buyer away.
ALTER TABLE locations ADD COLUMN unlisted_area INTEGER NOT NULL DEFAULT 1;

-- Where the order is going, as it was priced: the area the shopper picked and
-- the zone it was in at the time. Text, not a reference — renaming or removing
-- a zone later must not rewrite what an old order was charged for.
ALTER TABLE orders ADD COLUMN delivery_area TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN delivery_zone TEXT NOT NULL DEFAULT '';
