-- The storefront polish: a breathable phone layout, ratings-led merchandising,
-- and shopping copy written the way the big fragrance retailers write theirs.
--
-- What changes on the home page:
--
--   · "Best Sellers" — a new shelf near the top, fed by what shoppers have
--     actually bought most (the best-sellers reading of paid orders). On a phone
--     it takes the place "Recently viewed" held.
--   · "The fragrance everyone is talking about" becomes "Top Rated", and is fed
--     by buyers' star ratings (migration 0032) instead of sales. Until the
--     first ratings arrive the shelf simply doesn't show.
--   · The founder's story gets a heading of its own: "Message from our Founder".
--   · The 2Sexy2Resist feature band is switched off. It is still there in
--     Admin → Home page, one toggle away, like every section before it.
--   · Headings, lines and buttons are shorter and benefit-led: "Shop by
--     Category", "Feminine Care", "Home Fragrance", "See All", "Shop Now".
--
-- As before, every change is guarded on the row still holding the words this
-- project seeded, so anything the house has since rewritten in the admin is
-- left exactly as the house has it.

-- ---- Best Sellers (what shoppers buy most) ----------------------------------
INSERT INTO home_blocks (id, kind, layout, source, ref_id, count, eyebrow, title, sub, lines, cta_label, cta_target, dark, sort, live)
SELECT 'shelf-most-shopped', 'shelf', 'product-band', 'segment', 'best-sellers', 8, '', 'Best Sellers',
       'Our most-shopped scents — the ones customers buy again and again.', '', 'See All', '/best-sellers', 1, 50, 1
 WHERE NOT EXISTS (SELECT 1 FROM home_blocks WHERE id = 'shelf-most-shopped');

-- ---- Top Rated (what shoppers rate highest) ---------------------------------
UPDATE home_blocks
   SET source = 'segment', ref_id = 'top-rated', eyebrow = '', title = 'Top Rated',
       sub = 'Rated highest by the customers who bought them.',
       cta_label = 'See All', cta_target = '/top-rated', updated_at = datetime('now')
 WHERE id = 'shelf-best' AND title IN ('The fragrance everyone is talking about', 'Best sellers');

-- ---- The founder's story ------------------------------------------------------
UPDATE home_blocks
   SET title = 'Message from our Founder', cta_label = 'Read Her Full Story', updated_at = datetime('now')
 WHERE id = 'story' AND title = '' AND cta_label IN ('Read the full story', 'Read our story');

-- ---- 2Sexy2Resist off ------------------------------------------------------------
UPDATE home_blocks SET live = 0, updated_at = datetime('now')
 WHERE id = 'featured' AND title = '2Sexy2Resist';

-- ---- Shorter, shop-first words ---------------------------------------------------
UPDATE home_blocks SET title = 'Shop by Category', sub = '', updated_at = datetime('now')
 WHERE id = 'categories' AND title IN ('Find your fragrance', 'Find Your Fragrance');

UPDATE home_blocks
   SET title = 'Feminine Care',
       lines = 'Plant-based, non-toxic intimate care you can trust every day.',
       cta_label = 'Shop Feminine Care', updated_at = datetime('now')
 WHERE id = 'band-care' AND title IN ('The products your intimate area needs', 'Feminine care');

UPDATE home_blocks SET cta_label = 'See All', updated_at = datetime('now')
 WHERE id IN ('shelf-deals', 'reviews', 'blog') AND cta_label IN ('See all', 'See all deals', 'Read all reviews', 'Read the blog');

UPDATE home_blocks
   SET title = 'Find Your Signature Scent',
       lines = 'Soft and feminine, warm and sensual, fresh and effortless, or bold and commanding — there''s a fragrance for every version of you.',
       cta_label = 'Shop Perfumes', updated_at = datetime('now')
 WHERE id = 'cta-personality' AND title = 'What''s your fragrance personality?';

UPDATE home_blocks
   SET title = 'Home Fragrance',
       lines = 'Candles, diffusers and room sprays that make every room smell inviting.',
       cta_label = 'Shop Home Fragrance', updated_at = datetime('now')
 WHERE id = 'band-home' AND title IN ('Your home deserves a signature scent too', 'Home fragrance');

UPDATE home_blocks
   SET title = 'Earn Rewards on Every Order',
       sub = 'Every qualifying purchase earns you a reward to spend on your next order.',
       cta_label = 'Start Earning', updated_at = datetime('now')
 WHERE id = 'rewards' AND title = 'The more you shop, the more you earn';

UPDATE home_blocks
   SET title = 'Be the First to Know',
       sub = 'New arrivals, restocks and subscriber-only offers, straight to your inbox.',
       updated_at = datetime('now')
 WHERE id = 'newsletter' AND title = ''
   AND sub = 'Be the first to know about new scents, restocks, special offers and everything happening at Majestic Roobee.';

UPDATE home_blocks
   SET title = 'Follow Us on Instagram',
       sub = 'New launches, behind-the-scenes moments and how our customers wear their scents.',
       cta_label = 'Follow Us', updated_at = datetime('now')
 WHERE id = 'instagram' AND title = 'Follow the fragrance';

-- ---- Settings ------------------------------------------------------------------
UPDATE settings SET value = json_set(value, '$.heroSub',
  'Non-toxic perfumes, perfume oils, body mists and home fragrance — made to be worn every day.')
 WHERE key = 'site' AND json_extract(value, '$.heroSub') =
  'Discover beautifully crafted non-toxic perfumes, perfume oils, body mists and home fragrances made for men and women who want to smell as good as they feel.';

UPDATE settings SET value = json_set(value, '$.reviewsHeadline', 'What Our Customers Say')
 WHERE key = 'site' AND json_extract(value, '$.reviewsHeadline') IN ('Don''t just take our word for it', 'Reviews');
