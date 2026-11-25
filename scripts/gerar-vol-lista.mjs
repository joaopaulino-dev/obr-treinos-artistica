// Gera o valor da variável VOL_LISTA (Vercel) para a área dos voluntários.
// Uso: node scripts/gerar-vol-lista.mjs entrada.json > vol-lista.json
// entrada.json (NUNCA no repositório: tem CPF):
//   { "pessoas": [{ "nome": "Nome Completo", "senha": "123456", "categoria": "Artística", "admin": true }],
//     "contatos": [{ "categoria": "Artística", "nome": "Fulano", "telefone": "5583999999999" }] }
// Saída: login = primeironomeultimonome (sem acento, minúsculo, sem espaço); nome exibido = primeiro + último; senha só como hash scrypt.
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

const entrada = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ids = new Set();
const voluntarios = entrada.pessoas.map((p) => {
  const partes = p.nome.trim().split(/\s+/);
  const nome = partes.length > 1 ? `${cap(partes[0])} ${cap(partes[partes.length - 1])}` : cap(partes[0]);
  let id = norm(p.nome).replace(/ /g, "-").slice(0, 40), n = 2;
  while (ids.has(id)) id = `${id}-${n++}`;
  ids.add(id);
  const senha = String(p.senha).replace(/\D/g, "");
  if (senha.length !== 6) throw new Error(`Senha de ${p.nome} não tem 6 dígitos.`);
  const sal = randomBytes(12).toString("hex");
  const v = { id, nome, login: (norm(partes[0]) + norm(partes[partes.length - 1])).replace(/[^a-z0-9]/g, ""), sal, hash: scryptSync(senha, sal, 32).toString("hex") };
  if (p.categoria) v.categoria = p.categoria;
  if (p.admin) v.admin = true;
  return v;
});
process.stdout.write(JSON.stringify({ voluntarios, contatos: entrada.contatos || [] }));
