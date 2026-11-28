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

  CREATE TABLE IF NOT EXISTS cancelamentos (
    id              BIGSERIAL   PRIMARY KEY,
    nivel           SMALLINT    NOT NULL,
    dia             DATE        NOT NULL,
    slot            SMALLINT    NOT NULL,
    equipe          TEXT        NOT NULL,
    origem          TEXT,
    origem_reserva  TEXT,
    reservada_em    TIMESTAMPTZ,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS cancelamentos_nivel_dia ON cancelamentos (nivel, dia);

  CREATE TABLE IF NOT EXISTS superteams (
    equipe       TEXT        PRIMARY KEY,
    nivel        SMALLINT    NOT NULL CHECK (nivel IN (1, 2)),
    integrantes  SMALLINT    NOT NULL CHECK (integrantes BETWEEN 1 AND 15),
    origem       TEXT,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS superteams_resgate (
    equipe       TEXT        PRIMARY KEY,
    nivel        SMALLINT    NOT NULL CHECK (nivel IN (1, 2)),
    integrantes  SMALLINT    NOT NULL CHECK (integrantes BETWEEN 1 AND 15),
    origem       TEXT,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sugestoes (
    id          BIGSERIAL   PRIMARY KEY,
    titulo      TEXT        NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 80),
    descricao   TEXT        NOT NULL CHECK (char_length(descricao) <= 300),
    categoria   TEXT        NOT NULL CHECK (categoria IN ('sugestao', 'elogio')),
    modalidade  TEXT        NOT NULL,
    equipe      TEXT        NOT NULL,
    oculta      BOOLEAN     NOT NULL DEFAULT false,
    origem      TEXT,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sugestoes_votos (
    sugestao_id  BIGINT      NOT NULL REFERENCES sugestoes (id) ON DELETE CASCADE,
    modalidade   TEXT        NOT NULL,
    equipe       TEXT        NOT NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (sugestao_id, modalidade, equipe)
  );
  ALTER TABLE sugestoes ADD COLUMN IF NOT EXISTS implementada BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE sugestoes ADD COLUMN IF NOT EXISTS resposta TEXT;
  ALTER TABLE sugestoes ADD COLUMN IF NOT EXISTS votos_extra INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sugestoes ADD COLUMN IF NOT EXISTS fixada BOOLEAN NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS sugestoes_votos_equipe ON sugestoes_votos (modalidade, equipe);

  CREATE TABLE IF NOT EXISTS vol_checkins (
    voluntario   TEXT        NOT NULL,
    dia          DATE        NOT NULL,
    distancia_m  INTEGER     NOT NULL,
    precisao_m   INTEGER     NOT NULL,
    origem       TEXT,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (voluntario, dia)
  );

  CREATE TABLE IF NOT EXISTS dt_rounds (
    id         BIGSERIAL   PRIMARY KEY,
    equipe     TEXT        NOT NULL,
    nivel      SMALLINT    NOT NULL CHECK (nivel IN (1, 2)),
    round      SMALLINT    NOT NULL CHECK (round IN (1, 2)),
    arena      SMALLINT    NOT NULL CHECK (arena BETWEEN 1 AND 6),
    no_show    BOOLEAN     NOT NULL DEFAULT false,
    dados      JSONB       NOT NULL,
    pontos     NUMERIC(8,2) NOT NULL,
    tempo_seg  INTEGER     NOT NULL DEFAULT 0,
    juiz       TEXT        NOT NULL,
    juiz_nome  TEXT,
    origem     TEXT,
    envio      TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (equipe, round)
  );

  CREATE TABLE IF NOT EXISTS dt_juizes (
    login      TEXT        PRIMARY KEY,
    nome       TEXT        NOT NULL,
    sal        TEXT        NOT NULL,
    hash       TEXT        NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS vol_vales (
    voluntario  TEXT        NOT NULL,
    dia         DATE        NOT NULL,
    origem      TEXT,
    usado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (voluntario, dia)
  );
`;

// v1: slot 0..39 a partir das 08:00 (15 min).
// v2: slot contado da meia-noite em blocos de 15 min (08:00 = 32).
// v3: blocos de 10 min (08:00 = 48) e 1 equipe por slot. Antes do lançamento só havia
//     reservas de teste, que não cabem na grade nova; a v3 zera reservas, grades e extras.
// v4: coluna origem (hash anônimo do aparelho/rede, ou 'coordenacao') para auditoria.
// v8: sugestão da CYBERZUKAS YELLOW (Resgate) sobre vender ladrilhos/itens da arena, com 10 votos da organização e fixada no topo.
// v7: une as duas sugestões "Ventiladores" da Alfa Robóticos (fica a 11).
// v6: nota da organização na sugestão do filtro de linha (Orion_Bernoulli), marcada como implementada.
// v5: cancelamento pela equipe no ar; marca a sugestão que pediu isso (Millennium Bots) como implementada.
async function migrar(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724100)");
    const { rows } = await client.query("SELECT valor FROM meta WHERE chave = 'versao'");
    let versao = rows.length ? Number(rows[0].valor) : 1;
    if (versao < 2) {
      await client.query("ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_slot_check");
      await client.query("UPDATE reservas SET slot = slot + 32");
      versao = 2;
    }
    if (versao < 3) {
      await client.query("DELETE FROM reservas");
      await client.query("DELETE FROM grade");
      await client.query("DELETE FROM creditos_extra");
      await client.query("ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_slot_check");
      await client.query("ALTER TABLE reservas ADD CONSTRAINT reservas_slot_check CHECK (slot BETWEEN 0 AND 143)");
      versao = 3;
    }
    if (versao < 4) {
      await client.query("ALTER TABLE reservas ADD COLUMN IF NOT EXISTS origem TEXT");
      versao = 4;
    }
    if (versao < 5) {
      await client.query("UPDATE sugestoes SET implementada = true WHERE id = 8 AND titulo = 'Escolha de horários de treinos'");
      versao = 5;
    }
    if (versao < 6) {
      await client.query(
        "UPDATE sugestoes SET implementada = true, resposta = $1 WHERE id = 14 AND titulo = 'Correção do filtro de linha'",
        ["Testamos às 18h13 do dia 25/11 e o filtro de linha está funcionando. Se o problema persistir, procure a coordenação."],
      );
      versao = 6;
    }
    if (versao < 7) {
      // Alfa Robóticos enviou "Ventiladores" duas vezes: os votos da 10 passam para a 11 e a 10 é apagada.
      const dup = "id = 10 AND titulo = 'Ventiladores' AND equipe = 'Alfa Robóticos - Artística'";
      const { rowCount } = await client.query(`SELECT 1 FROM sugestoes WHERE ${dup}`);
      const { rowCount: alvo } = await client.query("SELECT 1 FROM sugestoes WHERE id = 11 AND titulo = 'Ventiladores'");
      if (rowCount && alvo) {
        await client.query(
          `INSERT INTO sugestoes_votos (sugestao_id, modalidade, equipe, criado_em)
           SELECT 11, modalidade, equipe, criado_em FROM sugestoes_votos WHERE sugestao_id = 10
           ON CONFLICT DO NOTHING`,
        );
        await client.query(`DELETE FROM sugestoes WHERE ${dup}`);
      }
      versao = 7;
    }
    if (versao < 8) {
      const titulo = "Ladrilhos e itens da arena para comprar";
      const { rowCount } = await client.query("SELECT 1 FROM sugestoes WHERE titulo = $1 AND equipe = 'CYBERZUKAS YELLOW'", [titulo]);
      if (!rowCount) {
        await client.query(
          `INSERT INTO sugestoes (titulo, descricao, categoria, modalidade, equipe, origem, votos_extra, fixada)
           VALUES ($1, $2, 'sugestao', 'Resgate', 'CYBERZUKAS YELLOW', 'coordenacao', 10, true)`,
          [titulo, "Seria legal ter os ladrilhos e itens da arena para comprar"],
        );
      }
      versao = 8;
    }
    await client.query(
      "INSERT INTO meta (chave, valor) VALUES ('versao', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
      [String(versao)],
    );
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

export async function listarAuditoria(q, nivel, dia) {
  const { rows } = await q.query(
    "SELECT slot, equipe, criado_em, origem FROM reservas WHERE nivel = $1 AND dia = $2 ORDER BY criado_em",
    [nivel, dia],
  );
  return rows.map((r) => ({ slot: Number(r.slot), equipe: r.equipe, criadoEm: r.criado_em, origem: r.origem || "" }));
}

export async function listarCancelamentos(q, nivel, dia) {
  const { rows } = await q.query(
    "SELECT slot, equipe, origem, origem_reserva, criado_em FROM cancelamentos WHERE nivel = $1 AND dia = $2 ORDER BY criado_em",
    [nivel, dia],
  );
  return rows.map((r) => ({ slot: Number(r.slot), equipe: r.equipe, origem: r.origem || "", origemReserva: r.origem_reserva || "", criadoEm: r.criado_em }));
}

export async function listarReservas(q, nivel, dia) {
  const { rows } = await q.query(
    "SELECT slot, equipe FROM reservas WHERE nivel = $1 AND dia = $2 ORDER BY slot, criado_em",
    [nivel, dia],
  );
  return rows.map((r) => ({ slot: Number(r.slot), equipe: r.equipe }));
}

// Transação com trava por nível+dia: duas operações simultâneas nunca furam as regras.
export function emTransacao(pool, nivel, dia, fn) {
  return emTransacaoChave(pool, `${nivel}:${dia}`, fn);
}

// Transação com trava por uma chave livre (ex.: 'superteams').
export async function emTransacaoChave(pool, chave, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [chave]);
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
