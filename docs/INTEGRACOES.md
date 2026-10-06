# Integrações

[← Documentação](../README.md)

## Google Login

O navegador recebe um token de identidade do Google Identity Services e o envia a `POST /api/auth/google`. O servidor valida esse token com `google-auth-library`, confere o Client ID esperado e cria uma sessão própria em cookie `HttpOnly`. O navegador não armazena o token de sessão em `localStorage`.

1. No Google Cloud, crie ou selecione um projeto e configure o Google Auth Platform.
2. Crie um **OAuth Client ID do tipo Aplicativo da Web**.
3. Cadastre as origens JavaScript exatas em que o site abrirá, por exemplo `http://localhost:3000` e a futura origem HTTPS. Se usar `http://127.0.0.1:3000`, cadastre-a separadamente.
4. Copie apenas o **Client ID** para `GOOGLE_CLIENT_ID` no ambiente do servidor. O fluxo atual não usa Client Secret.
5. Enquanto o app estiver no modo de teste do Google, adicione cada conta permitida como usuário de teste. Para aceitar usuários em geral, conclua os requisitos de publicação do Google Auth Platform.
6. Reinicie o servidor e verifique `/api/config`: `googleConfigured` e `databaseConfigured` precisam estar `true`.

O cadastro do Google e os dados do Entre Nós são separados. Alterar a origem do site exige atualizar também a lista de origens autorizadas no Google Cloud.

## Banco de dados

`DATABASE_URL` aponta para PostgreSQL. `schema.sql` é aplicado na inicialização e usa instruções que podem ser executadas novamente para criar as estruturas ausentes. Para ambiente de produção, use banco persistente com backups e acesso restrito. Não use o PGlite local como banco de um site público.

O projeto contém `docker-compose.yml` para desenvolvimento e `render.yaml` como proposta de implantação. A disponibilidade, limites e preço do provedor devem ser conferidos no momento da contratação. O arquivo de hospedagem não configura backup nem importa automaticamente dados do PC.

## WhatsApp Business Cloud API

O WhatsApp exige uma conta e um app Meta com número empresarial, permissões e webhook em URL pública HTTPS. Preencha no ambiente do servidor:

| Variável | Finalidade |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Token escolhido para verificar o webhook |
| `WHATSAPP_APP_SECRET` | Conferir a assinatura das notificações recebidas |
| `WHATSAPP_ACCESS_TOKEN` | Enviar respostas pela API Graph |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número empresarial |
| `WHATSAPP_BUSINESS_NUMBER` | Número público em formato internacional |
| `WHATSAPP_GRAPH_API_VERSION` | Versão Graph API habilitada |

Cadastre `https://seu-dominio/api/webhooks/whatsapp` como callback e assine o evento `messages`. O `GET` do webhook responde ao desafio de verificação; o `POST` exige assinatura válida antes de processar a mensagem. A rota de vínculo gera um código com validade de dez minutos. Depois do vínculo, o parser aceita gastos por texto e os comandos `RELATÓRIO`, `METAS` e `DESFAZER`. O ID de mensagem recebido é usado para evitar gravação duplicada quando a Meta reenviar um evento.

**Estado atual:** as rotas existem, mas a integração não funciona sem essas credenciais e o número real. Não publique tokens ou segredos no GitHub. Verifique também as regras, custos e limites da Meta antes de ativar o canal.

## Open Finance e pagamentos

Não há provedor Open Finance conectado nem rotina de sincronização bancária. A interface informa que a conexão está em desenvolvimento. Não peça credenciais bancárias pelo site.

Não há gateway de pagamento nem webhook de assinatura. A existência do plano `premium` no banco e das restrições na API não significa que usuários possam contratar esse plano. Para comercializá-lo, será necessário implementar checkout, confirmação de pagamento, atualização segura da assinatura, cancelamento e tratamento de falhas.
