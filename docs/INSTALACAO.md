# Instalação local

[← Documentação](../README.md)

## Opção mais simples: Windows sem Docker

1. Instale Node.js 22 ou superior e confirme que `node` e `npm` abrem no terminal.
2. Abra a pasta do projeto e execute `npm install` uma vez.
3. Copie `.env.example` para `.env` e preencha `GOOGLE_CLIENT_ID` com o ID Web criado no Google Cloud. O arquivo `.env` é privado e já está no `.gitignore`.
4. Execute `INICIAR.cmd` ou `npm run dev:local`.
5. Abra **http://localhost:3000**. O banco PGlite fica em `data/entre-nos` e persiste entre reinicializações.

O comando `dev:local` inicia o banco local e o servidor juntos. Ele fornece `DATABASE_URL` ao processo do servidor. Mantenha o terminal aberto enquanto usar a aplicação. Não abra `index.html` pelo explorador de arquivos para tentar fazer login: no modo `file://`, a API e o banco não estão acessíveis.

## PostgreSQL próprio ou Docker

O projeto também aceita PostgreSQL convencional. Para desenvolvimento com Docker:

```powershell
docker compose up -d db
Copy-Item .env.example .env
npm install
npm start
```

O exemplo de `.env` aponta para o banco definido em `docker-compose.yml`. Ajuste a senha e a URL se usar outro banco. Na inicialização, `server.mjs` aplica `schema.sql` e verifica a conexão. O endpoint `GET /api/health` responde `200` quando o banco está acessível e `503` quando não está.

## Variáveis de ambiente

| Variável | Uso | Obrigatória para quê? |
| --- | --- | --- |
| `PORT` | Porta HTTP; padrão `3000` | Opcional localmente |
| `PUBLIC_APP_ORIGIN` | Origem pública exata, sem barra final | Links de convite e produção |
| `DATABASE_URL` | Conexão PostgreSQL | Cadastro e dados persistentes; no `dev:local` é fornecida pelo PGlite |
| `PG_POOL_MAX` | Limite de conexões do servidor | Use `1` com PGlite local; ajuste conforme o banco hospedado |
| `GOOGLE_CLIENT_ID` | OAuth Client ID Web | Login Google |
| `NODE_ENV` | `development` ou `production` | Cookie `Secure` em produção |
| `WHATSAPP_*` | Credenciais e número da Meta | Integração WhatsApp; veja [Integrações](INTEGRACOES.md) |

Não compartilhe o conteúdo de `.env`. O Client ID pode aparecer na resposta pública `/api/config`; tokens, segredos e senha de banco não devem aparecer nela.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala dependências |
| `npm run dev:local` | Inicia PGlite e servidor local |
| `npm start` | Inicia somente o servidor; exige PostgreSQL em `DATABASE_URL` |
| `npm run dev` | Inicia o servidor com recarga automática; exige banco separado |

## Onde os dados ficam

No modo PGlite, os dados ficam em `data/entre-nos`. Em Docker, ficam no volume `entre_nos_db`. Em hospedagem, ficam no banco PostgreSQL contratado/configurado. Esses três ambientes não sincronizam dados automaticamente. Planeje uma migração explícita se quiser levar seus dados locais para a nuvem.
