# Treinos da Artística · OBR 2026

Página pública para as equipes da modalidade Artística reservarem horários de treino nos palcos:

| Endereço | Nível | Palco | Mesas |
|---|---|---|---|
| `/n1` | Nível 1 | Palco de treino A | 1 a 36 |
| `/n2` | Nível 2 | Palco de treino B | 37 a 72 |

Cada slot dura 15 minutos, das 08:00 às 18:00, e até 3 equipes dividem o palco por slot.

## Regras (aplicadas no servidor)

- **Créditos por dia:** `floor(40 slots × 3 vagas ÷ 36 equipes)`, ou seja, 3 créditos por equipe. As vagas que sobram ficam livres.
- **Lotação:** no máximo 3 equipes por slot, e a mesma equipe não pode aparecer duas vezes no mesmo slot.
- **Slots seguidos:** a equipe não pode reservar um slot colado em outro que já tem.
- **Sem remarcação:** a equipe não consegue cancelar. Trocas são combinadas entre as equipes, e a coordenação libera as vagas.

Cada reserva roda numa transação com uma trava por nível e dia (`pg_advisory_xact_lock`). Assim, duas pessoas clicando ao mesmo tempo não conseguem passar dos limites. O navegador repete a mesma checagem só para mostrar o que está bloqueado; quem decide é o servidor.

## Estrutura

```
api/estado.js       GET  grade, equipes e reservas de um nível/dia
api/reservar.js     POST cria uma reserva, se as regras permitirem
api/liberar.js      POST remove uma reserva (exige senha da coordenação)
api/coordenacao.js  POST confere a senha da coordenação
lib/config.js       dias liberados, equipes, palcos e horários
lib/regras.js       regras de reserva e validação
lib/db.js           conexão com o Neon e criação da tabela
public/             páginas estáticas (início, grade, estilo, script)
test/               testes das regras (node --test)
```

A tabela `reservas` é criada sozinha na primeira requisição.

## Deploy na Vercel com Neon

1. Importe este repositório na Vercel (Add New, Project). Pode deixar o framework como **Other**: não há etapa de build.
2. Na aba **Storage** do projeto, adicione um banco **Neon** na região **São Paulo (aws sa-east-1)**, a mesma das funções (`gru1`, definida no `vercel.json`). A integração cria a variável `DATABASE_URL` sozinha. Se preferir usar um banco Neon que já existe, cadastre `DATABASE_URL` à mão com a connection string em modo pooled.
3. Em **Settings > Environment Variables**, cadastre `ADMIN_PASSWORD` com a senha da coordenação.
4. Faça o deploy. Depois abra `/n1` e `/n2` para conferir.

## Coordenação

Abra `/n1?coordenacao` ou `/n2?coordenacao` e digite a senha. No modo coordenação, tocar numa vaga ocupada abre a opção de liberá-la (usada em trocas combinadas entre equipes ou para corrigir divergências).

## Liberar mais dias (25 a 28/11)

Em `lib/config.js`, descomente os dias desejados em `DIAS` e faça o push. Aparecem botões de dia no topo da grade, e cada dia tem seus próprios créditos.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL e ADMIN_PASSWORD
npx vercel dev
npm test
```
