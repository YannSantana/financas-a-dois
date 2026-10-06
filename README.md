# Entre Nós — Finanças a Dois

Aplicação web para organizar finanças em casal. Cada pessoa entra com Google, registra movimentações compartilhadas ou pessoais, acompanha o resumo mensal e contribui para metas. O projeto inclui uma apresentação pública e uma demonstração com dados fictícios.

> **Estado do projeto:** versão de desenvolvimento. O código está no GitHub; a publicação do aplicativo, a cobrança Premium, o Open Finance e o WhatsApp real dependem das etapas descritas em [Preparar o lançamento](docs/LANCAMENTO.md). O preço mostrado na interface é uma proposta, não uma cobrança ativa.

## Comece aqui

| Preciso de... | Leia |
| --- | --- |
| Instalar e iniciar no Windows | [Instalação local](docs/INSTALACAO.md) |
| Entender as telas e os planos | [Guia de uso](docs/USO.md) |
| Configurar Google, banco e WhatsApp | [Integrações](docs/INTEGRACOES.md) |
| Publicar sem deixar o computador ligado | [Preparar o lançamento](docs/LANCAMENTO.md) |
| Consultar rotas e estrutura técnica | [Referência técnica](docs/REFERENCIA.md) |
| Resolver problemas comuns | [Solução de problemas](docs/PROBLEMAS.md) |

## O que funciona hoje

- Apresentação do produto e demonstração visual sem cadastro; os números da demonstração são fictícios.
- Login com Google Identity Services, validação do token no servidor e sessão por cookie `HttpOnly`, quando `GOOGLE_CLIENT_ID` e PostgreSQL estão configurados.
- Ficha inicial e edição do perfil; renda opcional e escolha do escopo padrão dos lançamentos.
- Convite privado para conectar duas pessoas ao mesmo espaço.
- Entradas e despesas manuais, com escopo compartilhado ou pessoal; edição e exclusão dos próprios registros.
- Resumo mensal, evolução diária e totais por categoria. A lista da API mostra até 80 lançamentos por mês; os totais consideram todos os registros visíveis à pessoa.
- Metas compartilhadas, edição, contribuição e arquivamento. O plano gratuito permite uma meta ativa.
- API e tela para orçamentos por categoria, disponíveis somente quando o espaço tem plano `premium`; não há fluxo de pagamento ou ativação comercial do Premium.
- Código do webhook WhatsApp, vínculo de número e comandos de texto. Só ficam utilizáveis após configurar a conta Meta, credenciais, número empresarial e HTTPS.

## O que ainda não está disponível

- Login por e-mail.
- Cobrança e contratação do Premium.
- Conexão bancária por Open Finance.
- WhatsApp sem configurar a plataforma empresarial da Meta.
- Notificações externas automáticas; a preferência do perfil é armazenada, mas não há serviço de envio.

## Visão técnica

O navegador usa `index.html` e os arquivos em `assets/`. `server.mjs` serve a página, valida o login e expõe a API. Os dados ficam em PostgreSQL, com tabelas definidas em `schema.sql`. O modo local sem Docker usa PGlite em `data/entre-nos`; esse diretório não é enviado ao GitHub. O arquivo `render.yaml` descreve uma opção de hospedagem, mas não publica nada sozinho.

**Requisitos locais:** Node.js compatível com o projeto (recomendado: 22 ou superior), npm e acesso à internet para o login Google. Para começar sem Docker, execute `INICIAR.cmd` no Windows ou `npm run dev:local` no terminal, depois abra **http://localhost:3000**. Confira o preparo do `.env` em [Instalação local](docs/INSTALACAO.md).

## Segurança e privacidade

O servidor só entrega `index.html` e arquivos permitidos em `assets/`; não publica `.env`, banco local ou código de servidor. As variáveis sensíveis pertencem ao ambiente do servidor, nunca ao HTML ou ao repositório. Despesas pessoais só aparecem para quem as criou; despesas compartilhadas aparecem para os membros do espaço. O cadastro não solicita senha bancária.

Antes de receber pessoas reais, revise acesso, política de privacidade, backups, retenção de dados, observabilidade e as integrações externas em [Preparar o lançamento](docs/LANCAMENTO.md). Não use a demonstração como prova de dados persistidos.
