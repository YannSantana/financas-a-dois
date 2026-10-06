# Solução de problemas

[← Documentação](../README.md)

## A página abre, mas não consigo entrar

Confirme que o endereço é `http://localhost:3000` ou a URL HTTPS do serviço. Abrir `index.html` diretamente pelo computador mostra a apresentação, mas não conecta à API. Abra `/api/health`: se responder `503`, o banco não está disponível. Abra `/api/config`: `googleConfigured` e `databaseConfigured` precisam ser `true`.

Se o botão Google carregar mas a autorização falhar, confira a origem exata no OAuth Client ID Web e a lista de usuários de teste no Google Auth Platform. Um domínio publicado precisa ser cadastrado separadamente do `localhost`.

## Login Google exibe erro genérico após escolher a conta

Veja o terminal do servidor. Um `timeout exceeded when trying to connect` indica saturação ou indisponibilidade do banco. No modo PGlite local, use `PG_POOL_MAX=1` e inicie com `npm run dev:local`. Se usar PostgreSQL hospedado, confira a URL, limites de conexões e estado do serviço. A correção atual do login reutiliza a conexão durante a conclusão da sessão; reinicie o servidor após atualizar o código.

## Alterações desaparecem ao fechar a demonstração

A demonstração usa dados fictícios. Para persistir, entre com Google no servidor e confirme a sessão. O banco local está em `data/entre-nos`; reinstalar ou apagar esse diretório elimina os dados locais.

## Não consigo criar outra meta ou orçamento

O plano gratuito aceita uma meta ativa. Conclua ou arquive a atual antes de criar outra. Orçamentos por categoria exigem `premium` no banco; a contratação comercial ainda não foi implementada.

## WhatsApp não gera código ou não registra mensagens

Confira as seis variáveis `WHATSAPP_*`, o número empresarial, o webhook HTTPS e a assinatura do evento `messages` na Meta. Sem a configuração completa, `/api/whatsapp/link` responde `503`. O código de vínculo expira em dez minutos. Somente texto é interpretado nesta versão.

## Deploy parece saudável, mas o login falha

Confirme que `PUBLIC_APP_ORIGIN` corresponde exatamente à URL HTTPS acessada, que `NODE_ENV=production`, que `DATABASE_URL` alcança um banco persistente e que a origem foi adicionada no Google Cloud. Não use uma URL de `localhost` como origem de produção.

## Preciso de mais detalhes

Consulte [Instalação local](INSTALACAO.md), [Integrações](INTEGRACOES.md) e [Referência técnica](REFERENCIA.md). Para relatar um defeito, informe a tela, o horário, a ação realizada, a resposta HTTP e uma mensagem de erro sem incluir cookies, tokens, senha do banco ou conteúdo de `.env`.
