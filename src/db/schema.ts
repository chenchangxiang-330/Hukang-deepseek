/**
 * SQLite 表结构（产品需求 §44 / §45 / §46 / §47）
 *
 * 三个概念必须分开、互不合并：
 *   Product        —— “这是什么商品”
 *   InventoryItem  —— “我家里有什么”
 *   NutritionLog   —— “我吃了什么”
 *
 * 数值字段一律允许 NULL。NULL 表示“包装上没写 / 没有记录”，
 * 与 0 是完全不同的含义（§10 / §28）。
 */

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
-- ---------------------------------------------------------------
-- Product：商品身份与营养事实
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                      TEXT PRIMARY KEY NOT NULL,
  barcode                 TEXT,
  brand                   TEXT,
  name                    TEXT NOT NULL,
  variant                 TEXT,
  quantity                TEXT,
  category                TEXT,
  image_uri               TEXT,

  -- 营养基准：每 100g / 每 100mL / 每份
  nutrition_basis_amount  REAL,
  nutrition_basis_unit    TEXT,

  energy_kcal             REAL,
  energy_kj               REAL,
  protein_g               REAL,
  fat_g                   REAL,
  carbohydrate_g          REAL,
  total_sugar_g           REAL,
  added_sugar_g           REAL,   -- 包装未标注时必须为 NULL，禁止由 carbohydrate 推导
  fiber_g                 REAL,
  sodium_mg               REAL,

  ingredients_raw_text    TEXT,
  ingredients_json        TEXT,   -- JSON array of string；未识别时为 NULL

  data_source             TEXT NOT NULL DEFAULT 'manual',
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  last_verified_at        TEXT
);

-- 条形码是商品标识符（§20），同一码只应指向一个本地商品
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode
  ON products (barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);

-- ---------------------------------------------------------------
-- InventoryItem：我家里有什么
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id                 TEXT PRIMARY KEY NOT NULL,
  product_id         TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,

  quantity           REAL,
  unit               TEXT,

  purchase_date      TEXT,   -- YYYY-MM-DD
  production_date    TEXT,   -- YYYY-MM-DD
  expiry_date        TEXT,   -- YYYY-MM-DD，临期/过期排序的依据
  shelf_life         TEXT,   -- 原始保质期文本，例如 “6个月”

  photo_uri          TEXT,
  storage_condition  TEXT,   -- 常温 / 冷藏 / 冷冻

  created_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory_items (expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_items (product_id);

-- ---------------------------------------------------------------
-- NutritionLog：我吃了什么
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id                  TEXT PRIMARY KEY NOT NULL,
  product_id          TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,

  date                TEXT NOT NULL,  -- YYYY-MM-DD，历史查询按此列
  time                TEXT NOT NULL,  -- HH:mm
  amount              REAL NOT NULL,
  unit                TEXT NOT NULL,

  -- 摄入当时的营养快照（JSON）。
  -- 用户以后修改商品营养数据，绝不能改写这里已经发生的历史（§13）。
  nutrition_snapshot  TEXT NOT NULL,

  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_date ON nutrition_logs (date);
CREATE INDEX IF NOT EXISTS idx_logs_product ON nutrition_logs (product_id);
`;

/**
 * 用户设置 / 开发模式开关等键值数据。
 * 商品与摄入数据不放这里，避免概念混淆。
 */
export const CREATE_META_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT
);
`;
