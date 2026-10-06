# Guia de uso

[← Documentação](../README.md)

## Antes de entrar

A página inicial apresenta o produto, recursos e planos. **Explorar a demonstração sem conta** abre um painel ilustrativo; seus dados são fictícios e alterações ali não representam um cadastro salvo. Para usar dados persistentes, abra o endereço do servidor e entre com Google.

## Primeiro acesso

1. Clique em **Entrar** ou **Começar grátis** e use o botão Google.
2. Preencha a ficha de perfil. É possível informar tipo de relação, prioridades, objetivo, desafio financeiro, divisão de despesas e privacidade padrão.
3. A faixa de renda é opcional. A opção de compartilhá-la com o par fica desmarcada até você escolher.
4. Salve o perfil. Depois, use **Editar meu perfil** para alterar respostas.

O perfil pessoal e o espaço do casal são criados no primeiro login. A mesma conta Google retoma a sessão e os dados associados a ela.

## Movimentações e painel

Adicione uma **entrada** ou **despesa** com descrição, categoria, valor e data. Escolha **Do casal** para compartilhá-la ou **Pessoal** para deixá-la visível apenas para você. O escopo inicial vem da ficha e pode ser alterado em cada lançamento.

O painel permite escolher o mês e mostra entradas, despesas compartilhadas, despesas pessoais, gráfico diário e categorias. Você pode editar ou excluir lançamentos criados por você. O total mensal inclui todos os registros visíveis, mesmo se a lista do mês atingir o limite de 80 itens.

## Metas e convite

Crie uma meta com nome, valor alvo e data opcional. Adicione contribuições, ajuste nome/valor/data e arquive metas antigas. Ao atingir o alvo, a meta é marcada como concluída. O plano gratuito aceita **uma meta ativa**; uma meta concluída ou arquivada deixa de ocupar essa vaga. Uma meta arquivada sai da lista normal; não há tela de restauração nesta versão.

Em **Convidar meu par**, gere um link privado que vence em sete dias e só pode ser usado uma vez. A pessoa convidada abre o link e entra com a própria conta Google. Um espaço comporta até duas pessoas. Se a conta convidada já estiver em um espaço compartilhado ou tiver dados no espaço individual atual, a aceitação é recusada para evitar perda de dados.

## Planos

| Recurso | Grátis | Premium no código |
| --- | --- | --- |
| Lançamentos manuais e resumo mensal | Disponível | Disponível |
| Metas ativas | 1 | Sem o limite de 1 |
| Orçamentos por categoria | Bloqueado pela API | API e interface implementadas |
| Contratação e cobrança | Não se aplica | Ainda não implementadas |
| Open Finance | Ainda não implementado | Ainda não implementado |
| WhatsApp | Requer configuração Meta | Não há cobrança/controle comercial implementado |

O preço e os recursos futuros mostrados na página de planos são uma **proposta de produto**. Não há pagamento ativo nem um botão que conceda Premium ao público.

## WhatsApp e assistente

A opção de vínculo só funciona quando as credenciais da Meta estiverem configuradas. Depois de vincular o número, o webhook reconhece mensagens de texto como `gastei 48,90 no mercado`, `RELATÓRIO`, `METAS` e `DESFAZER`. Áudio e anexos não são interpretados. O assistente do painel consulta somas de lançamentos por período e alguns termos conhecidos; não é uma análise financeira automática baseada em IA.
