# Entre Nós

Aplicação local para finanças de casal, com página de apresentação, cadastro Google, perfil inicial, lançamentos, metas e integração preparada para a WhatsApp Business Cloud API.

## Iniciar localmente

Requisitos: Node.js 20.6 ou mais recente. Para usar o PostgreSQL local completo, instale Docker Desktop ou forneça outro PostgreSQL acessível.

1. Abra esta pasta no terminal e instale as dependências:

   ```powershell
   npm install
   ```

2. Inicie o PostgreSQL local:

   ```powershell
   docker compose up -d db
   ```

3. Crie seu arquivo de configuração e preencha os dados:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Inicie o site:

   ```powershell
   npm start
   ```

5. Abra `http://localhost:3000`.

Na primeira inicialização, o servidor aplica `schema.sql` e cria as tabelas do produto. `GET /api/health` indica se o PostgreSQL está conectado.

### Atalho local sem Docker

As dependências do projeto incluem PGlite Socket, que mantém um banco PostgreSQL compatível em `data/entre-nos`. Para iniciar o banco e o site juntos, rode `npm run dev:local` e abra `http://localhost:3000`. O banco persiste nesse diretório entre inicializações. Esse modo é para desenvolvimento local; para produção, use um serviço PostgreSQL convencional e `npm start`.

## Entrar com Google

Crie um OAuth Client ID do tipo Web no Google Cloud Console. Adicione `http://localhost:3000` como origem JavaScript autorizada e, quando publicar o site, adicione também o domínio HTTPS de produção. Copie o Client ID para `GOOGLE_CLIENT_ID` no `.env` e reinicie o servidor.

O navegador envia o token de identidade Google ao servidor. O servidor valida emissor, público e validade do token com a biblioteca oficial `google-auth-library`, cria/atualiza o perfil e inicia uma sessão em cookie `HttpOnly`. Nenhum token de sessão é guardado no navegador.

## Cadastro e perfil

Depois da primeira entrada Google, a pessoa responde a uma ficha breve com contexto do relacionamento, organização das despesas, prioridades, objetivo financeiro e preferências de notificações. A faixa de renda é opcional e não é compartilhada com o par por padrão. O perfil e as escolhas de privacidade ficam no PostgreSQL.

Os lançamentos manuais e as metas também são persistidos. No painel, é possível editar ou arquivar metas, alterar os próprios lançamentos e ajustar ou remover limites mensais. Metas concluídas continuam visíveis no histórico do painel. O plano grátis permite até uma meta ativa. Limites por categoria ficam protegidos por plano Premium na API. A cobrança ainda não está conectada.

## WhatsApp

Esta versão implementa o recebimento e o processamento de mensagens por webhook. Para ativar o número real, configure um app Meta/WhatsApp Business e preencha no `.env`:

- `WHATSAPP_VERIFY_TOKEN`: segredo escolhido por você e cadastrado também nas configurações do webhook Meta.
- `WHATSAPP_APP_SECRET`: segredo do app Meta, usado para conferir `X-Hub-Signature-256` sobre o corpo original do webhook.
- `WHATSAPP_ACCESS_TOKEN`: token de acesso da WhatsApp Business Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador do número de negócio no Meta.
- `WHATSAPP_BUSINESS_NUMBER`: número público em formato internacional, com código do país.
- `WHATSAPP_GRAPH_API_VERSION`: versão Graph API ativa no seu app Meta.

Cadastre como callback a URL pública HTTPS `https://seu-dominio/api/webhooks/whatsapp` e assine o evento `messages`. O callback GET valida o token e devolve o desafio da Meta; o POST confere a assinatura antes de ler os dados. O endpoint precisa estar publicado em HTTPS para receber mensagens da Meta.

Na área do casal, escolha **Vincular número** e envie a mensagem `VINCULAR CODIGO` ao número empresarial. O código vence em 10 minutos. Depois do vínculo, são aceitos exemplos como:

- `gastei 48,90 no mercado`
- `paguei R$ 32,50 na farmácia /pessoal`
- `RELATÓRIO` para o resumo do mês
- `METAS` para ver o progresso
- `DESFAZER` para remover o último lançamento feito pelo WhatsApp

O escopo padrão (compartilhado ou pessoal) vem da ficha de perfil; `/pessoal` e `/casal` podem sobrescrevê-lo por mensagem. Cada evento tem um ID único para impedir gravações duplicadas quando a Meta repetir um webhook. O parser atual entende texto em português e categorias comuns; áudios, anexos e frases ambíguas pedem uma versão futura.

## Integrações ainda necessárias

O banco PostgreSQL, a validação de login Google e os endpoints de gravação estão implementados. Login e gravação ficam indisponíveis até configurar as variáveis correspondentes e executar o servidor.

Para produção, ainda é preciso hospedar em HTTPS, criar o projeto OAuth e o app WhatsApp Business, guardar os segredos no ambiente do servidor e configurar um agregador Open Finance. A tabela de contas bancárias já existe, mas a conexão com instituições financeiras não está habilitada. Pagamentos do plano Premium também aguardam um gateway.

Nunca coloque `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` ou credenciais do banco no HTML. Esses valores ficam somente no `.env` do servidor.
