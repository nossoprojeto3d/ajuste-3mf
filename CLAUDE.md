# Ajuste 3MF

App web que deixa a IA configurar projetos do Bambu Studio: lê o `.3mf`, monta um resumo para o Claude, aplica o JSON de resposta e devolve um `-ajustado.3mf`. Tudo no navegador, sem servidor e sem chave de API.
Publicado em https://nossoprojeto3d.github.io/ajuste-3mf/. O README.md explica o fluxo completo.

## Stack

React 19, Vite 6, TypeScript, Tailwind v4 e shadcn/ui (new-york v4). É o único projeto com build. Animações com Motion (`motion/react`), cena 3D com Three.js (carregada à parte) e ícones do Phosphor.

Visual "oficina técnica": sempre escuro, grafite quase preto, um único acento dourado (`--primary`, o mesmo do catálogo), Geist no texto e Geist Mono nos dados (fontes do `@fontsource-variable`, sem Google Fonts). O logo continua o da marca.

```bash
npm run dev        # http://localhost:5173
npm test           # lógica do 3MF
npm run typecheck
npm run build
```

Antes de cada commit, rode `npm test` e `npm run typecheck`. A publicação roda os testes e não sobe se falharem.

## Publicação

Todo push na `main` dispara o `.github/workflows/deploy.yml`, que roda os testes e o build e publica no GitHub Pages pelo Actions. A pasta `dist/` não é versionada. O `base: './'` do Vite precisa continuar assim.

## Arquivos

- `src/App.tsx`: a tela. Hero com a cena 3D, depois a ferramenta com uma etapa em foco por vez (Arquivo, Claude, Aplicar) e a barra de etapas clicável no topo. O mesmo layout serve celular e desktop.
- `src/components/print-scene.tsx`: vaso sendo impresso camada por camada (Three.js). Pausa fora da tela e fica parado com movimento reduzido.
- `src/components/faq.tsx`: dúvidas e rodapé.
- `src/lib/threemf.js`: leitura, validação e gravação do 3MF, **sem dependências** (ZIP próprio). Toda mudança aqui precisa de teste em `tests/threemf.test.mjs`.
- `src/lib/analytics.ts` + `src/components/consent-banner.tsx`: medição com consentimento.
- `src/components/ui/`: componentes do shadcn. Só `native-select.tsx` e `sonner.tsx` foram modificados (ícones do Phosphor); não edite os outros, prefira compor por fora.
- `src/index.css`: tokens de cor, fontes, grão do fundo, borda que acende sob o cursor e brilho do título.

## Regras

- O arquivo do usuário nunca sai do navegador. Não adicione chamada a servidor nem envie o 3MF, o nome dele, o resumo ou a resposta para a medição.
- Só entram ajustes da lista de chaves conhecidas, dentro de faixas seguras (~55 chaves). Ao adicionar uma chave, defina a faixa e escreva o teste.
- O `.env` vai para o repositório de propósito, porque o ID do Analytics é público. Segredo de verdade vai em `.env.local`.
- Componente novo do shadcn: `npx shadcn@latest add <nome>` (o MCP do shadcn está instalado). Ainda não existe `components.json`; se o CLI pedir, crie com estilo new-york, Tailwind v4 e alias `@`.
- Mantenha o projeto fora de pastas sincronizadas (iCloud, Dropbox), porque travam o servidor de desenvolvimento.

## Imagens

A logo e o favicon vêm do site do catálogo (limitação conhecida). O app não usa fotos: o visual do topo é a cena 3D. Imagens próprias vão em `public/`.

## Roteiro de teste

Usado pelo `/conferir-site` com `npm run dev`, no celular (390px) e no desktop (1366px):

1. O app abre sem erros no console.
2. Enviar um `.3mf` de teste. Se não houver na máquina, pergunte ao usuário qual usar. Impressora, bico, filamentos e objetos são preenchidos.
3. Copiar o resumo: o texto sai com os dados do formulário.
4. Colar um JSON de ajustes, incluindo uma chave fora da faixa: as mudanças aparecem com valor de antes e depois, e a chave fora da faixa aparece como ignorada.
5. Desmarcar um ajuste e baixar o `-ajustado.3mf`. "Ajustar outro arquivo" volta para a etapa 1 sem perder impressora e filamento.
6. A barra de etapas leva e volta entre as etapas liberadas, e a cena 3D do topo anima sem erro no console.
