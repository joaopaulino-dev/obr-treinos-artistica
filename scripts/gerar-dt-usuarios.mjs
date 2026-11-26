// Gera o valor da variável DT_USUARIOS (Vercel) do Desafio Técnico · Resgate.
// Uso: node scripts/gerar-dt-usuarios.mjs entrada.json > dt-usuarios.json
// entrada.json (NUNCA no repositório: tem senhas):
//   [{ "login": "joaocosta", "nome": "João Costa", "senha": "...", "papel": "juiz" },
//    { "login": "joaocostaadmin", "nome": "João Costa (admin)", "senha": "...", "papel": "admin" }]
// Os demais juízes podem ser cadastrados pelo admin na própria página (ficam no banco, também só com hash).
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";

const entrada = JSON.parse(readFileSync(process.argv[2], "utf8"));
const saida = entrada.map((u) => {
  const sal = randomBytes(12).toString("hex");
  return {
    login: String(u.login).toLowerCase().trim(),
    nome: u.nome || u.login,
    papel: u.papel === "admin" ? "admin" : "juiz",
    sal,
    hash: scryptSync(String(u.senha), sal, 32).toString("hex"),
  };
});
process.stdout.write(JSON.stringify(saida));
