import { m } from "motion/react"
import { InstagramLogo, ShieldCheck } from "@phosphor-icons/react"

import { track } from "@/lib/analytics"

const EASE = [0.22, 1, 0.36, 1] as const

const QA: [string, string][] = [
  [
    "Por que pedir ao Claude em vez de usar regras prontas?",
    "O ajuste certo depende da peça, da impressora e do filamento. O Claude lê os dados do seu projeto e sugere valores para esse caso, em vez de aplicar uma tabela fixa. Quando as boas práticas de impressão mudam, as sugestões mudam junto, sem precisar atualizar o app.",
  ],
  ["Tem custo ou precisa de chave de API?", "O app não cobra nada e não usa chave de API. As sugestões vêm da conversa que você abre no Claude e cola de volta aqui."],
  [
    "Meu arquivo vai para algum servidor?",
    "Não. O 3MF é lido e regravado dentro do navegador. Só o texto do resumo sai daqui, e apenas quando você o copia e cola no Claude.",
  ],
  [
    "O que o app consegue alterar?",
    "Cerca de 55 configurações do Bambu Studio: qualidade e camadas, paredes e preenchimento, suportes e brim, velocidades e temperaturas, ventoinha e torre de limpeza do multicolor. Valores fora de limites seguros e chaves desconhecidas são ignorados e aparecem na lista.",
  ],
  [
    "Por que fatiar de novo no Bambu Studio?",
    "O app muda as configurações do projeto, mas não gera o G-code. Abra o arquivo ajustado, confira no preview e fatie para valer as alterações.",
  ],
  [
    "O 3MF não abriu ou faltou configuração.",
    "O app só aceita projetos salvos pelo Bambu Studio (Arquivo, Salvar projeto como), porque é lá que ficam as configurações. Um 3MF exportado só com a malha não serve.",
  ],
]

/** Dúvidas abertas lado a lado, sem sanfona: o título fica preso à esquerda enquanto as respostas rolam. */
export function Faq() {
  return (
    <section id="duvidas" aria-labelledby="faq-title" className="border-t border-hairline">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16 lg:py-28">
        <div className="grid content-start gap-4 lg:sticky lg:top-28">
          <h2 id="faq-title" className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Dúvidas comuns
          </h2>
          <p className="max-w-[36ch] text-muted-foreground">Por que usar o Claude, o que o app altera, privacidade e custo.</p>
          <p className="mt-2 flex max-w-[36ch] items-start gap-2.5 rounded-xl border border-hairline-strong bg-card/60 p-4 text-sm text-muted-foreground">
            <ShieldCheck weight="duotone" className="mt-0.5 size-5 shrink-0 text-primary-ink" />
            Tudo roda no seu navegador. O arquivo, o nome dele e a resposta do Claude não são enviados para lugar nenhum.
          </p>
        </div>
        <dl className="grid">
          {QA.map(([q, a], i) => (
            <m.div
              key={q}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: (i % 2) * 0.06, ease: EASE }}
              className="grid gap-2 border-b border-hairline py-6 first:pt-0 last:border-b-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] sm:gap-8"
            >
              <dt className="font-medium">{q}</dt>
              <dd className="text-muted-foreground">{a}</dd>
            </m.div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export function Footer({ logo, instagram }: { logo: string; instagram: string }) {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" width={28} height={28} loading="lazy" className="size-7 object-contain" />
          <span>
            <span className="font-medium text-foreground">Nosso Projeto 3D</span> · Ajuste 3MF
          </span>
        </div>
        <a
          href={instagram}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("instagram_clique")}
          className="flex w-fit items-center gap-2 rounded-md transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <InstagramLogo className="size-5" />
          @nossoprojeto3d
        </a>
      </div>
    </footer>
  )
}
