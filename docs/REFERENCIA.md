# Referência técnica

[← Documentação](../README.md)

## Estrutura do projeto

| Caminho | Responsabilidade |
| --- | --- |
| `index.html` | Apresentação, demonstração e interface autenticada |
| `assets/` | Ilustrações SVG |
| `server.mjs` | Servidor HTTP, autenticação, API, webhook e arquivos públicos |
| `schema.sql` | Tabelas, índices e relações do PostgreSQL |
| `scripts/prepare-local-data.mjs` | Prepara o diretório do PGlite local |
| `INICIAR.cmd` | Atalho Windows para `npm run dev:local` |
| `docker-compose.yml` | PostgreSQL para desenvolvimento |
| `render.yaml` | Modelo de serviço web e banco para Render |
| `.env.example` | Exemplo de configuração; `.env` real é privado |

## Modelo de dados

`users` guarda a identidade Google e dados básicos. `profiles` guarda respostas e preferências. `couples` e `couple_members` formam o espaço compartilhado. `subscriptions` guarda o plano do espaço. `sessions` mantém hashes de tokens e expiração. `transactions`, `goals` e `budgets` guardam lançamentos, metas e limites. `couple_invitations` guarda convites. `whatsapp_link_codes` e `whatsapp_events` apoiam a integração Meta; `bank_accounts` reserva a estrutura para a futura conexão bancária. Consulte `schema.sql` para tipos, chaves e índices exatos.

## Convenções da API

- Respostas de API são JSON com `Cache-Control: no-store`.
- O login usa token de identidade Google; as rotas protegidas usam o cookie de sessão `entre_nos_session` com `HttpOnly` e `SameSite=Lax`.
- Requisições com `Origin` são aceitas somente das origens configuradas/localmente permitidas. Em produção, use HTTPS e `NODE_ENV=production` para o cookie `Secure`.
- Erros retornam `{ "error": "mensagem", "code": "codigo_opcional" }`. Entre os estados comuns estão `401` (sessão ou token), `403` (recurso indisponível no plano), `404` (registro ausente) e `503` (banco ou integração indisponível).
- IDs dos registros são UUIDs. Valores monetários no JSON são números; a interface formata em reais.

## Rotas públicas

| Método e rota | Resultado |
| --- | --- |
| `GET /api/config` | Disponibilidade do Google, banco, WhatsApp, pagamentos e Open Finance; inclui Client ID público quando válido |
| `GET /api/health` | `200` com banco conectado; `503` caso contrário |
| `POST /api/auth/google` | Recebe `{ "credential": "token Google" }`, valida o token e cria sessão |
| `POST /api/auth/logout` | Revoga sessão atual e limpa cookie |
| `GET /api/webhooks/whatsapp` | Verificação da Meta, quando configurada |
| `POST /api/webhooks/whatsapp` | Eventos assinados da Meta, quando configurada |

## Rotas que exigem sessão

| Método e rota | Função |
| --- | --- |
| `GET /api/session` | Usuário, perfil e espaço atuais |
| `PUT /api/profile` | Salvar ficha e preferências |
| `GET /api/dashboard?month=AAAA-MM` | Totais, até 80 movimentações, categorias, metas e limites do mês |
| `POST /api/transactions` | Criar entrada ou despesa |
| `PUT /api/transactions/:id` | Editar lançamento próprio |
| `DELETE /api/transactions/:id` | Marcar lançamento próprio como excluído |
| `POST /api/goals` | Criar meta; uma ativa no plano grátis |
| `PUT /api/goals/:id` | Editar meta ativa ou concluída |
| `DELETE /api/goals/:id` | Arquivar meta |
| `POST /api/goals/:id/contributions` | Contribuir para meta ativa |
| `POST /api/budgets` | Criar/atualizar limite mensal; exige Premium |
| `PUT /api/budgets/:id` | Editar limite; exige Premium |
| `DELETE /api/budgets/:id` | Remover limite; exige Premium |
| `POST /api/couples/invite` | Gerar convite de uso único, válido por sete dias |
| `POST /api/couples/join` | Aceitar convite com `{ "code": "..." }` |
| `POST /api/whatsapp/link` | Gerar código de vínculo; exige integração Meta configurada |
| `POST /api/assistant/query` | Somar lançamentos para perguntas simples |

### Exemplos de corpo

```json
{"amount":48.90,"direction":"expense","description":"Mercado","category":"Alimentação","visibility":"shared","date":"2026-10-06"}
```

O corpo acima serve para `POST /api/transactions`. Para criar meta: `{ "title": "Viagem", "targetAmount": 7500, "deadline": "2027-01-31" }`. Para contribuir: `{ "amount": 100 }`. Para limite Premium: `{ "category": "Alimentação", "monthlyLimit": 1200 }`.

## Restrições importantes

O servidor entrega apenas `/`, `/index.html` e extensões permitidas dentro de `/assets/`. O endpoint de dashboard filtra lançamentos pessoais pelo autor; membros do casal veem os compartilhados. Um lançamento só pode ser editado ou excluído por quem o criou. Convites não substituem um espaço já compartilhado ou com atividade. Metas concluídas e arquivadas não aceitam contribuições.
