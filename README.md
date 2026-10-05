# Ajuste 3MF

Versão 1.0 · Nosso Projeto 3D

App web que deixa a IA configurar o projeto do Bambu Studio. Você envia o `.3mf`, copia um resumo para o Claude, cola a resposta dele de volta, confere cada mudança (valor de antes e de depois) e baixa o 3MF ajustado. Sem chave de API e sem cadastro. O arquivo é processado no navegador e não é enviado para nenhum servidor.

## Como funciona

1. **Arquivo:** o app lê o `.3mf`, mostra impressora, bico, filamentos e objetos do projeto e preenche o formulário com o que encontrou.
2. **Resumo:** com impressora, bico, AMS, tipo e marca do filamento, uso da peça, prioridade e observações, o app monta um texto para você colar numa conversa com o Claude.
3. **Resposta:** o Claude responde com um JSON de ajustes. Você cola no app, desmarca o que não quiser e baixa o `-ajustado.3mf` (ou só a lista de alterações em `.txt`).

Só entram na lista as configurações conhecidas e dentro de faixas seguras (cerca de 55 chaves). O que estiver fora disso aparece como ignorado. Se um objeto tem ajuste próprio que vence o valor global, o app avisa e oferece remover esse ajuste.

Marcas de filamento disponíveis: Multifila, Volt3D, Bambu Lab, 3D Lab, Polymaker, eSun, Sunlu, Creality, Elegoo, Overture, Hatchbox, Prusament, Anycubic e Outros (o resumo pede ao Claude um perfil genérico e conservador).

## Layout

- **Celular e tablet (abaixo de 1024px):** linha do tempo vertical, uma etapa depois da outra, com rolagem normal.
- **Computador (1024px ou mais):** área de trabalho em três colunas que ocupa a largura da janela. Cada coluna rola por dentro, então a página não fica comprida.

## Stack

React 19, Vite 6, Tailwind v4 e componentes do shadcn/ui (new-york v4). Identidade visual da marca: fundo escuro, dourado, Fraunces nos títulos e Work Sans no texto. O app usa sempre o tema escuro.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
```

Mantenha o projeto fora de pastas sincronizadas (iCloud, Dropbox). Elas travam o servidor de desenvolvimento.

## Testes

```bash
npm test           # lógica do 3MF: leitura, validação e gravação
npm run typecheck
```

## Medição de uso

O ID do Google Analytics fica no arquivo `.env`, que vai junto com o código. Ele é público (aparece no site publicado), então não há problema em subir.

```
VITE_GA_ID=G-PNRZ6JQWLP
VITE_META_PIXEL_ID=
```

Para trocar o ID ou ligar o Meta Pixel, edite o `.env` e envie. A publicação automática já usa esse arquivo. Deixe os campos vazios para desligar a medição.

Segredos de verdade (senhas, chaves privadas), se um dia existirem, não vão no `.env`: use `.env.local`, que o `.gitignore` bloqueia.

Com ID configurado, aparece um aviso de cookies e os scripts só carregam depois do "Aceitar". Quem usa "Não rastrear" no navegador não é medido e não vê o aviso.

Eventos enviados: `arquivo_lido`, `resumo_copiado`, `resposta_conferida`, `3mf_baixado`, `lista_baixada` e `instagram_clique`. Nunca vão para a medição o arquivo, o nome dele, o resumo ou a resposta do Claude.

## Publicar (GitHub Pages)

A publicação é automática: a cada envio para a branch `main` (ou `master`), o GitHub roda os testes, faz o build e publica. O arquivo está em `.github/workflows/deploy.yml`.

Configuração, uma vez só: no repositório `ajuste-3mf`, vá em **Settings > Pages** e em **Source** escolha **GitHub Actions**. O site fica em `nossoprojeto3d.github.io/ajuste-3mf/`.

Para publicar na mão, rode `npm run build` e publique o conteúdo de `dist`. O `base: './'` do Vite faz o site funcionar em qualquer subcaminho.

## Estrutura

- `src/App.tsx`: a tela, com os dois layouts.
- `src/lib/threemf.js`: lógica do 3MF, sem dependências (leitor e gravador de ZIP próprios).
- `src/lib/analytics.ts`: medição com consentimento.
- `src/components/consent-banner.tsx`: aviso de cookies.
- `src/components/ui/`: componentes do shadcn. Só `native-select.tsx` e `sonner.tsx` têm mudanças.
- `src/index.css`: cores da marca, fontes e o traço de camadas do título.
- `tests/`: testes da lógica do 3MF.
- `.github/workflows/deploy.yml`: publicação automática.

## Limitações conhecidas

- A logo e o ícone da aba vêm do site do catálogo. Para não depender dele, coloque uma cópia da logo em `public/` e troque os endereços no `index.html`.
- A prévia do link no WhatsApp só aparece depois de publicado, e o WhatsApp guarda a prévia antiga (use `?v=2` no link para atualizar).
