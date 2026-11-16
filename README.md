# Bar dos Amigos — V5.1

A V5.1 mantém o catálogo V4.4 e melhora a experiência no celular, a edição administrativa e a apresentação pública dos produtos. O Google Sheets guarda os dados editáveis; o GitHub Pages hospeda as páginas públicas. O Google Apps Script faz a ponte privada entre os dois.

## O que está incluído

- Cardápio V4.4, ilustrações SVG, catálogo e preços existentes preservados.
- Login validado no Apps Script, com troca obrigatória da senha provisória no primeiro acesso.
- Cadastro e edição de várias apresentações dentro de um único produto, com embalagem, tamanho, preço e disponibilidade próprios.
- Sugestões de embalagens e tamanhos por categoria, com opção personalizada.
- Formulário administrativo adaptado ao iPhone, com rolagem interna, ações fixas embaixo e proteção contra descarte acidental.
- Cards públicos mais enxutos, sem descrições genéricas repetidas; tamanhos e apresentações aparecem no produto.
- Salvamento em lote no Google Sheets, atualizando apenas os registros editados e arquivando apresentações removidas.
- Arquivamento e restauração de produtos; categorias podem ser renomeadas, reordenadas, desativadas e excluídas quando não contêm produtos.
- Filtro por categoria, busca, resumo de disponibilidade e paginação em telas pequenas.
- Histórico simples das alterações administrativas.
- Catálogo local V4.4 como referência até que o endereço do Apps Script seja configurado.

## Atualização de uma instalação V5 existente

1. Mantenha a mesma planilha Google e os registros que já existem nela.
2. Atualize no Apps Script os arquivos `Code.gs` e `Bridge.html` incluídos neste pacote. Não execute `setupV5()` novamente: a atualização não precisa recriar nem importar os dados.
3. Implante uma nova versão do aplicativo da Web no Apps Script e mantenha o endereço `/exec` já configurado em `js/dados.js`.
4. Publique os arquivos deste pacote no mesmo GitHub Pages usado pela V5, substituindo os arquivos do site.

Os campos `grupo`, `tamanho` e `embalagem` já fazem parte da planilha V5. Cada apresentação continua sendo uma linha própria; o cadastro em lote não apaga produtos existentes. Ao remover uma apresentação pelo formulário, o sistema a arquiva em vez de excluir a linha.

## Configuração do Google Sheets e Apps Script

1. Crie ou abra uma planilha Google que será a base do catálogo.
2. Na planilha, escolha **Extensões → Apps Script**.
3. Copie `apps-script/Code.gs` para o arquivo `Code.gs` do projeto Apps Script.
4. Crie um arquivo HTML chamado `Bridge` e copie `apps-script/Bridge.html`.
5. Crie outro arquivo de script chamado `CatalogoV44` e copie `apps-script/CatalogoV44.gs`.
6. Em `Code.gs`, substitua `https://SEU-USUARIO.github.io` em `V5_ALLOWED_ORIGINS` pela origem do seu GitHub Pages (ou domínio próprio), sem incluir caminho de página. Exemplo: `https://meuusuario.github.io`.
7. Salve o projeto e execute `setupV5()` uma vez. Autorize o acesso à planilha e, quando a planilha solicitar, digite a senha provisória definida para este projeto. O código é transformado em hash e guardado nas propriedades privadas do Apps Script; a senha provisória não aparece nos arquivos públicos.
8. Verifique se foram criadas as abas `Produtos`, `Categorias`, `Configuracoes` e `Historico`. A configuração adiciona o catálogo V4.4 apenas quando as abas de produtos e categorias estão vazias; não substitui registros existentes.
9. No Apps Script, escolha **Implantar → Nova implantação → Aplicativo da Web**. Execute como sua conta e selecione acesso para qualquer pessoa, inclusive sem login Google, para que o cardápio público consiga carregar. A planilha continua privada; a página pública só recebe os dados ativos do cardápio, e as alterações exigem uma sessão administrativa.
10. Copie o endereço do aplicativo implantado, que termina em `/exec`, e cole no campo `appsScriptUrl` do objeto `BAR_CONFIG` no início de `js/dados.js`.
11. Publique o conteúdo desta pasta no repositório do GitHub Pages. Se alterar a origem permitida ou o código do Apps Script depois da implantação, crie uma nova versão da implantação.

> O Apps Script deve permanecer vinculado à planilha. O arquivo de catálogo (`CatalogoV44.gs`) leva o catálogo inicial para a função de configuração; as edições seguintes são gravadas no Sheets.

## Primeiro acesso

Abra `admin.html` pelo site publicado. Entre com a senha provisória configurada durante `setupV5()`. O painel solicitará imediatamente uma nova senha de pelo menos 12 caracteres. A senha provisória não pode ser usada como senha definitiva.

A autenticação aplica limite de cinco tentativas incorretas em 15 minutos. Após o bloqueio, novas tentativas ficam indisponíveis por 15 minutos. As sessões expiram em até seis horas e a troca da senha encerra as outras sessões ativas. O token fica em `sessionStorage` e é enviado ao Apps Script pela conexão incorporada; não é colocado na URL.

## Estrutura

- `index.html`: cardápio público baseado na V4.4.
- `admin.html`: entrada e painel administrativo.
- `css/`, `js/`, `assets/`: interface, lógica e ilustrações.
- `apps-script/`: ponte segura e semente de dados para o projeto Apps Script.
- `dados/`: CSVs de referência da V4.4.

## Publicação e uso

O GitHub Pages não executa autenticação no servidor. Por isso, login e gravação no Sheets passam pelo Apps Script; não coloque senhas, tokens privados ou credenciais Google no JavaScript da página. Sem a URL implantada em `js/dados.js`, o cardápio mostra uma indicação de modo local e o painel permanece bloqueado.

As categorias e produtos já existentes foram preservados, inclusive preços e estados de disponibilidade da V4.4. Antes de publicar o novo endereço do cardápio, confira os valores e itens sinalizados como demonstrativos na versão anterior.


