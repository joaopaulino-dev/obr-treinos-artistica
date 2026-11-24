# OBR 2026 · Mapa das mesas e ensaios da Artística

Portal público com três entradas no menu principal (`/`):

- **Mapa da OBR** (`/mapa`): as 152 mesas (Artística e Resgate), palcos e arenas. Tem busca por equipe ou número da mesa, zoom com pinça e arrastar, atalhos para os palcos e o PDF A4. O link `/mapa#mesa-23` (ou `#palco-a`) abre direto no local, útil para QR codes.
- Ao escolher uma mesa, palco ou arena, o mapa anima o **caminho a partir da entrada** (entre o Palco principal e o Palco de ensaio A) e mostra o passo a passo.
- **Material e informações das categorias** (`/materiais`): cronogramas (Artística N1 e N2), manuais e regras oficiais da etapa Nacional 2026 de Artística e Resgate, com links para o site da OBR.
- **Ensaios Nível 1** e **Ensaios Nível 2**: agendamento dos palcos de ensaio da Artística.

## Agendamento de ensaios

| Endereço | Nível | Palco | Mesas |
|---|---|---|---|
| `/n1` | Nível 1 | Palco de ensaio A | 1 a 36 |
| `/n2` | Nível 2 | Palco de ensaio B | 37 a 72 |

Cada slot dura 10 minutos, das 08:00 às 18:00, e uma equipe por vez usa o palco (a coordenação pode mudar a quantidade por slot).

## Regras (aplicadas no servidor)

- **Créditos por dia:** `floor(slots × equipes por slot ÷ 36 equipes)`. Na grade padrão (60 slots × 1 equipe) dá 1 crédito por equipe. As vagas que sobram ficam livres. A coordenação pode fixar outro valor para todas as equipes e dar créditos extras a uma equipe.
- **Lotação:** no máximo N equipes por slot (padrão 1), e a mesma equipe não pode aparecer duas vezes no mesmo slot.
- **Slots seguidos:** a equipe não pode reservar um slot colado em outro que já tem.
- **Sem remarcação:** a equipe não consegue cancelar. Trocas são combinadas entre as equipes, e a coordenação libera as vagas.

Cada reserva roda numa transação com uma trava por nível e dia (`pg_advisory_xact_lock`). Assim, duas pessoas clicando ao mesmo tempo não conseguem passar dos limites. O navegador repete a mesma checagem só para mostrar o que está bloqueado; quem decide é o servidor.

## Aviso de desclassificação

Ao abrir `/n1` ou `/n2`, uma janela mostra as regras e o aviso: reservar somente para a própria equipe; reservar por outra equipe pode resultar em desclassificação. Ela aparece uma vez por sessão do navegador e pode ser reaberta em **Ver regras**. A confirmação de cada reserva repete o aviso.

## Registro para a coordenação

Cada reserva guarda data e hora e um identificador anônimo de origem: os 10 primeiros caracteres de `sha256(sal | IP | navegador)`. O IP não é guardado. O sal vem de `HASH_SALT` ou, se ela não existir, de `ADMIN_PASSWORD`. Reservas feitas pela coordenação ficam marcadas como `coordenacao`. Só o modo coordenação vê esses dados: na vaga ocupada ("Reservada em … · aparelho …") e no bloco **Aparelhos com mais de uma equipe**.

Apague esses registros depois do evento (por exemplo, `UPDATE reservas SET origem = NULL;` no SQL Editor da Neon).

## Estrutura

```
api/estado.js       GET  grade, equipes e reservas de um nível/dia
api/reservar.js     POST cria uma reserva, se as regras permitirem
api/admin.js        POST ações da coordenação (exige senha): reservar, mover, liberar, extra, grade
lib/config.js       dias liberados, equipes, palcos e grade padrão
lib/grade.js        grade de cada nível/dia, créditos e montagem do estado
lib/regras.js       regras de reserva e validação
lib/db.js           conexão com o Neon e criação da tabela
public/             páginas estáticas: menu (index), agendamento (app), mapa/ e assets/
fontes/             originais: mapa-mesas.svg e equipes.csv (152 equipes)
scripts/            preparar-mapa.py gera public/mapa/mapa.svg e equipes.json a partir de fontes/
test/               testes das regras (node --test)
```

As tabelas (`reservas`, `grade`, `creditos_extra`, `meta`) são criadas sozinhas na primeira requisição. Os slots são contados a partir da meia-noite em blocos de 10 minutos (08:00 = slot 48). A duração fica em `DURACAO_MIN`, em `lib/config.js`; mudá-la depois de haver reservas exige migração.

## Deploy na Vercel com Neon

1. Importe este repositório na Vercel (Add New, Project). Pode deixar o framework como **Other**: não há etapa de build.
2. Na aba **Storage** do projeto, adicione um banco **Neon** na região **São Paulo (aws sa-east-1)**, a mesma das funções (`gru1`, definida no `vercel.json`). A integração cria a variável `DATABASE_URL` sozinha. Se preferir usar um banco Neon que já existe, cadastre `DATABASE_URL` à mão com a connection string em modo pooled.
3. Em **Settings > Environment Variables**, cadastre `ADMIN_PASSWORD` (senha da coordenação). `MASTER_PASSWORD` é opcional: se existir, passa a ser a senha exigida para zerar reservas.
4. Faça o deploy. Depois abra `/n1` e `/n2` para conferir.

## Coordenação

Abra `/n1?coordenacao` ou `/n2?coordenacao` e digite a senha (`ADMIN_PASSWORD`). No modo coordenação:

- **Vaga ocupada:** mover a equipe para outro horário (ignora créditos e slots seguidos) ou liberar a vaga.
- **Vaga livre:** reservar por qualquer equipe, com a opção de ignorar créditos e slots seguidos.
- **Grade deste dia:** equipes por slot, créditos por equipe (em branco = automático), início e fim. Não deixa encolher a grade se houver reservas fora dela ou acima da nova lotação.
- **Créditos extras:** soma créditos a uma equipe naquele dia (0 remove).

## Folha A4 de QR codes

`divulgacao/qr-codes-A4.pdf` traz o logo da OBR 2026 e QR codes para agendar ensaio (N1 e N2), mapa, cronograma, material e o portal, além do aviso de desclassificação e da regra das 18h. Para gerar de novo: `python3 scripts/gerar-qr-a4.py` (precisa de `reportlab`; a versão 4.0.9 roda no Python 3.9).

## Atualizar o mapa ou as equipes

Edite `fontes/mapa-mesas.svg` ou `fontes/equipes.csv` e rode `python3 scripts/preparar-mapa.py`. O script confere que existem as 152 mesas e os palcos antes de gravar.

## Dia das reservas (qualquer dia)

Não há lista fixa de dias. O dia é calculado no horário local do evento (João Pessoa/PB, UTC−3) (`FUSO` e `HORA_ABERTURA` em `lib/config.js`):

- até as 18h, as equipes reservam para **hoje**, e os horários que já começaram ficam bloqueados;
- a partir das 18h, as equipes passam a reservar para **amanhã**.

A coordenação alterna entre Hoje e Amanhã no topo da grade e pode reservar em qualquer horário.

## Zerar as reservas do dia

No modo coordenação, o bloco **Zerar reservas do dia** apaga todas as reservas do nível no dia selecionado (por exemplo, ao fim do dia). Para confirmar, a coordenação digita a senha de novo: vale a `ADMIN_PASSWORD` ou, se existir, uma senha separada em `MASTER_PASSWORD`.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL e ADMIN_PASSWORD
npx vercel dev
npm test
```
