import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS reservas (
    id         BIGSERIAL PRIMARY KEY,
    nivel      SMALLINT    NOT NULL CHECK (nivel IN (1, 2)),
    dia        DATE        NOT NULL,
    slot       SMALLINT    NOT NULL CHECK (slot BETWEEN 0 AND 39),
    equipe     TEXT        NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nivel, dia, slot, equipe)
  );
  CREATE INDEX IF NOT EXISTS reservas_nivel_dia ON reservas (nivel, dia);
`;

let esquemaPronto = false;

// Abre um pool por requisição (recomendado pela Neon para funções serverless),
// garante a tabela e fecha tudo no fim.
export async function comBanco(fn) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (!esquemaPronto) {
      await pool.query(ESQUEMA);
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

// Transação com trava por nível+dia: duas reservas simultâneas nunca furam as regras.
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
