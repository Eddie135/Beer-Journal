import { initializeDatabase } from "./database.js";

const monthKey = (value) => String(value || "").slice(0, 7);

export class StatsRepository {
  async getDashboard() {
    const { db } = await initializeDatabase();
    const activeBeer = "b.deleted_at IS NULL";
    const activeTasting = "t.deleted_at IS NULL";
    const [core, preference, tags, months, recent] = await Promise.all([
      db.query(`SELECT COUNT(DISTINCT b.id) AS beer_count,
        COUNT(DISTINCT CASE WHEN ${activeTasting} THEN t.id END) AS tasting_count,
        COALESCE(SUM(CASE WHEN ${activeTasting} THEN t.bottle_count END), 0) AS bottle_count,
        COALESCE(SUM(CASE WHEN ${activeTasting} THEN t.volume_ml * COALESCE(t.bottle_count, 0) END), 0) AS total_volume_ml,
        COUNT(DISTINCT CASE WHEN ${activeTasting} AND b.country_name <> '' THEN b.country_name END) AS country_count,
        COUNT(DISTINCT CASE WHEN b.brand <> '' THEN b.brand END) AS brand_count,
        COUNT(DISTINCT CASE WHEN b.brewery <> '' THEN b.brewery END) AS brewery_count,
        COUNT(DISTINCT CASE WHEN b.style <> '' THEN b.style END) AS style_count,
        AVG(CASE WHEN ${activeTasting} THEN t.rating_scaled END) AS average_tasting_rating_scaled,
        AVG(b.overall_rating_scaled) AS average_beer_rating_scaled,
        COALESCE(SUM(CASE WHEN ${activeTasting} THEN t.price_scaled END), 0) AS total_spend_scaled,
        AVG(CASE WHEN ${activeTasting} THEN t.price_scaled END) AS average_tasting_price_scaled,
        AVG(CASE WHEN ${activeTasting} AND t.bottle_count > 0 THEN t.price_scaled / t.bottle_count END) AS average_bottle_price_scaled,
        AVG(b.abv_scaled) AS average_abv_scaled, AVG(b.plato_scaled) AS average_plato_scaled
        FROM beers b LEFT JOIN tastings t ON t.beer_id = b.id WHERE ${activeBeer}`),
      db.query(`SELECT 'category' AS kind, b.category AS value, COUNT(t.id) AS count
        FROM beers b JOIN tastings t ON t.beer_id = b.id
        WHERE ${activeBeer} AND ${activeTasting} AND b.category <> '' GROUP BY b.category
        UNION ALL SELECT 'style', b.style, COUNT(t.id) FROM beers b JOIN tastings t ON t.beer_id = b.id
        WHERE ${activeBeer} AND ${activeTasting} AND b.style <> '' GROUP BY b.style
        UNION ALL SELECT 'country', b.country_name, COUNT(t.id) FROM beers b JOIN tastings t ON t.beer_id = b.id
        WHERE ${activeBeer} AND ${activeTasting} AND b.country_name <> '' GROUP BY b.country_name
        UNION ALL SELECT 'purchase_channel', t.purchase_channel, COUNT(t.id) FROM tastings t JOIN beers b ON b.id=t.beer_id
        WHERE ${activeBeer} AND ${activeTasting} AND t.purchase_channel <> '' GROUP BY t.purchase_channel
        ORDER BY count DESC`),
      db.query(`SELECT ft.name AS value, COUNT(DISTINCT t.id) AS count
        FROM flavor_tags ft JOIN beer_flavor_tags bft ON bft.tag_id=ft.id
        JOIN beers b ON b.id=bft.beer_id JOIN tastings t ON t.beer_id=b.id
        WHERE ${activeBeer} AND ${activeTasting} AND ft.deleted_at IS NULL AND bft.deleted_at IS NULL
        GROUP BY ft.id ORDER BY count DESC, ft.name`),
      db.query(`SELECT substr(t.consumed_at, 1, 7) AS month, COUNT(DISTINCT t.id) AS tasting_count,
        COUNT(DISTINCT b.id) AS beer_count, COALESCE(SUM(t.volume_ml * COALESCE(t.bottle_count, 0)), 0) AS volume_ml,
        COALESCE(SUM(t.price_scaled), 0) AS spend_scaled
        FROM tastings t JOIN beers b ON b.id=t.beer_id
        WHERE ${activeBeer} AND ${activeTasting} AND t.consumed_at >= date('now','-12 months')
        GROUP BY substr(t.consumed_at, 1, 7) ORDER BY month`),
      db.query(`SELECT t.*, b.name AS beer_name, b.country_name AS beer_country_name, b.category AS beer_category, b.style AS beer_style
        FROM tastings t JOIN beers b ON b.id=t.beer_id WHERE ${activeBeer} AND ${activeTasting}
        ORDER BY t.consumed_at DESC, t.created_at DESC LIMIT 5`),
    ]);
    const grouped = { category: [], style: [], country: [], purchase_channel: [] };
    for (const item of preference.values || []) if (grouped[item.kind]) grouped[item.kind].push({ value: item.value, count: Number(item.count) });
    const coreRow = core.values?.[0] || {};
    return {
      core: {
        ...coreRow,
        beer_count: Number(coreRow.beer_count || 0), tasting_count: Number(coreRow.tasting_count || 0),
        bottle_count: Number(coreRow.bottle_count || 0), total_volume_ml: Number(coreRow.total_volume_ml || 0),
        country_count: Number(coreRow.country_count || 0), brand_count: Number(coreRow.brand_count || 0),
        brewery_count: Number(coreRow.brewery_count || 0), style_count: Number(coreRow.style_count || 0),
      },
      preferences: grouped,
      flavor_tags: (tags.values || []).map((item) => ({ value: item.value, count: Number(item.count) })),
      monthly: (months.values || []).map((item) => ({ ...item, month: monthKey(item.month), tasting_count: Number(item.tasting_count), beer_count: Number(item.beer_count), volume_ml: Number(item.volume_ml), spend_scaled: Number(item.spend_scaled) })),
      recent_tastings: recent.values || [],
    };
  }
}

export const statsRepository = new StatsRepository();
