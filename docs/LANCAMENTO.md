# Preparar o lançamento

[← Documentação](../README.md)

Este guia descreve as etapas para colocar o **aplicativo** online. Um repositório público no GitHub já permite ver o código, mas não hospeda automaticamente o servidor e o banco. Até concluir as etapas abaixo, o site continua local.

## 1. Defina o escopo da primeira versão

Uma primeira versão coerente pode oferecer login Google, perfil, convites, lançamentos manuais, resumo e uma meta gratuita. Informe claramente que WhatsApp, Open Finance, cobrança Premium e notificações externas ainda não estão ativos se não forem configurados. Retire ou ajuste qualquer promessa da página comercial antes de receber usuários reais.

## 2. Escolha hospedagem e banco

O aplicativo precisa de um serviço Node.js e um PostgreSQL persistente. `render.yaml` descreve um Blueprint para Render com serviço web, banco, verificação de saúde e atualização automática a partir do GitHub. Antes de criar os recursos, confira os planos e os custos atuais na própria plataforma. Se escolher outro provedor, use `npm ci` para instalar, `npm start` para iniciar e configure as mesmas variáveis.

O serviço deve ter uma URL HTTPS pública. Defina `PUBLIC_APP_ORIGIN` como essa origem exata, por exemplo `https://seu-servico.exemplo`, sem barra final. O serviço web e o banco devem ter credenciais separadas por ambiente. Nunca copie `.env` para o repositório.

## 3. Configure o Google para a URL definitiva

No OAuth Client ID Web do Google Cloud, adicione a origem HTTPS real às **Origens JavaScript autorizadas**. Enquanto o Google Auth Platform estiver em teste, só os usuários adicionados à lista de teste conseguirão entrar. Revise nome, suporte, política de privacidade e demais requisitos do Google antes de liberar o acesso geral.

## 4. Valide a publicação

Depois do deploy:

1. Abra `/api/health` na URL pública. `200` indica banco conectado; `503` exige revisar o banco e as variáveis.
2. Abra `/api/config` e confirme que Google e banco aparecem como configurados. Essa resposta não deve conter segredos.
3. Entre com uma conta de teste autorizada, conclua a ficha e reinicie o navegador para verificar persistência.
4. Crie, edite e exclua um lançamento; crie, edite e conclua uma meta.
5. Convide uma segunda conta de teste e confira que dados pessoais permanecem visíveis apenas ao autor.
6. Verifique em dispositivo móvel e faça uma cópia de segurança do banco antes de convidar o público.

Os dados do `data/entre-nos` local não migram sozinhos para o banco hospedado. Planeje exportação/importação se houver registros reais no PC.

## 5. Operação contínua

- Mantenha backups recuperáveis e teste a restauração.
- Monitore disponibilidade, logs e falhas de login. `/api/health` pode ser usado como checagem de saúde.
- Atualize dependências e configure uma rotina de revisão de segurança.
- Defina política de privacidade, contato de suporte, retenção e exclusão de dados antes de coletar informações financeiras de outras pessoas.
- Proteja contas do GitHub, Google Cloud, banco e hospedagem com autenticação forte. Guarde segredos apenas no gerenciador do provedor.
- Habilite cobrança ou WhatsApp somente depois de validar os fluxos e custos correspondentes.

## Limites conhecidos para decisão de lançamento

O código ainda não tem checkout Premium, sincronização bancária, envio de notificações externas nem migração automática de dados locais. O histórico de lançamentos da API mostra até 80 itens por mês, embora os totais considerem todos. Não há interface de restauração de metas arquivadas. Esses pontos precisam ser considerados no escopo e nos textos públicos da primeira versão.
