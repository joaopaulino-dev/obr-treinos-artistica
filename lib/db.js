import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS reservas (
    id         BIGSERIAL PRIMARY KEY,
    nivel      SMALLINT    NOT NULL CHECK (nivel IN (1, 2)),
    dia        DATE        NOT NULL,
    slot       SMALLINT    NOT NULL,
    equipe     TEXT        NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nivel, dia, slot, equipe)
  );
  CREATE INDEX IF NOT EXISTS reservas_nivel_dia ON reservas (nivel, dia);

  CREATE TABLE IF NOT EXISTS grade (
    nivel          SMALLINT NOT NULL,
    dia            DATE     NOT NULL,
    por_slot       SMALLINT NOT NULL,
    creditos_base  SMALLINT,
    inicio_min     SMALLINT NOT NULL,
    fim_min        SMALLINT NOT NULL,
    PRIMARY KEY (nivel, dia)
  );

  CREATE TABLE IF NOT EXISTS creditos_extra (
    nivel   SMALLINT NOT NULL,
    dia     DATE     NOT NULL,
    equipe  TEXT     NOT NULL,
    extra   SMALLINT NOT NULL,
    PRIMARY KEY (nivel, dia, equipe)
  );

  CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
`;

// v1 guardava o slot como 0..39 a partir das 08:00; v2 conta a partir da meia-noite (08:00 = 32).
async function migrar(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724100)");
    const { rows } = await client.query("SELECT valor FROM meta WHERE chave = 'versao'");
    if (!rows.length) {
      await client.query("ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_slot_check");
      await client.query("UPDATE reservas SET slot = slot + 32");
      await client.query("ALTER TABLE reservas ADD CONSTRAINT reservas_slot_check CHECK (slot BETWEEN 0 AND 95)");
      await client.query("INSERT INTO meta (chave, valor) VALUES ('versao', '2')");
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

let esquemaPronto = false;

// Abre um pool por requisição (recomendado pela Neon para funções serverless),
// garante as tabelas e fecha tudo no fim.
export async function comBanco(fn) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (!esquemaPronto) {
      await pool.query(ESQUEMA);
      await migrar(pool);
      esquemaPronto = true;
    }
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export async function listarReservas(q, nivel, dia) {
  const { rows } = await q.query(
    "SELECT slot, equipe FROM reservas WHERE nivel = $1 AND dia = $2 ORDER BY slot, criado_em",
    [nivel, dia],
  );
  return rows.map((r) => ({ slot: Number(r.slot), equipe: r.equipe }));
}

// Transação com trava por nível+dia: duas operações simultâneas nunca furam as regras.
export async function emTransacao(pool, nivel, dia, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${nivel}:${dia}`]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
