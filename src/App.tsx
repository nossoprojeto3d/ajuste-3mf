import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  Cube,
  DownloadSimple,
  FileArrowUp,
  InstagramLogo,
  UploadSimple,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { Faq, Footer } from "@/components/faq"
import { cn } from "@/lib/utils"
import { track } from "@/lib/analytics"
import { ConsentBanner } from "@/components/consent-banner"
import {
  buildModified,
  buildSummary,
  detect,
  evaluateChanges,
  extractJson,
  fmtVal,
  makeExample,
  openProject,
  type Change,
  type FormData3mf,
  type Project,
} from "@/lib/threemf"

// A cena 3D é pesada (Three.js): carrega à parte, depois do resto da página.
const PrintScene = lazy(() => import("@/components/print-scene"))

// Logo da marca em cor única, no laranja da página (gerado a partir do logo do catálogo).
const LOGO = import.meta.env.BASE_URL + "logo.png"
const INSTAGRAM = "https://instagram.com/nossoprojeto3d"

const OPT = {
  printer: ["Bambu Lab A1", "Bambu Lab A1 mini", "Bambu Lab P1S", "Bambu Lab P1P", "Bambu Lab X1 Carbon", "Bambu Lab X1E", "Bambu Lab H2D"],
  nozzle: ["0.2", "0.4", "0.6", "0.8"],
  ams: ["AMS lite (4 cores)", "AMS (4 cores)", "Mais de um AMS", "Sem AMS (1 cor)"],
  type: ["PLA", "PLA Silk", "PLA Matte", "PLA-CF", "PETG", "ABS", "ASA", "TPU", "PC", "PA"],
  use: ["Decorativa ou visual", "Funcional, uso leve", "Funcional, com esforço mecânico", "Protótipo rápido", "Miniatura com muitos detalhes", "Para vender, acabamento caprichado"],
  prio: ["Equilibrada", "Qualidade visual", "Resistência", "Velocidade", "Menos material"],
}
const BRANDS = ["Multifila", "Volt3D", "Bambu Lab", "3D Lab", "Polymaker", "eSun", "Sunlu", "Creality", "Elegoo", "Overture", "Hatchbox", "Prusament", "Anycubic", "Outros"]
const DEFAULT_FORM: FormData3mf = {
  printer: "Bambu Lab A1",
  nozzle: "0.4",
  ams: "AMS lite (4 cores)",
  filType: "PLA",
  brand: "Multifila",
  use: "Decorativa ou visual",
  prio: "Equilibrada",
  notes: "",
}
const PREFS_KEY = "ajuste3mf.prefs"

type View = 1 | 2 | 3

const STEPS: { n: View; title: string; hint: string }[] = [
  { n: 1, title: "Arquivo", hint: "Envie o projeto e confira a impressão" },
  { n: 2, title: "Claude", hint: "Copie o resumo e peça os ajustes" },
  { n: 3, title: "Aplicar", hint: "Confira as mudanças e baixe" },
]

const STATUS_LABEL = { change: "Muda", same: "Já está assim", bad: "Ignorada" } as const
const STATUS_VARIANT = { change: "default", same: "secondary", bad: "destructive" } as const

const EASE = [0.22, 1, 0.36, 1] as const

function loadForm(): FormData3mf {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")
    const f = { ...DEFAULT_FORM, ...saved } as FormData3mf
    if (!OPT.printer.includes(f.printer)) f.printer = DEFAULT_FORM.printer
    if (!OPT.nozzle.includes(f.nozzle)) f.nozzle = DEFAULT_FORM.nozzle
    if (!OPT.ams.includes(f.ams)) f.ams = DEFAULT_FORM.ams
    if (!OPT.type.includes(f.filType)) f.filType = DEFAULT_FORM.filType
    if (!BRANDS.includes(f.brand)) f.brand = DEFAULT_FORM.brand
    if (!OPT.use.includes(f.use)) f.use = DEFAULT_FORM.use
    if (!OPT.prio.includes(f.prio)) f.prio = DEFAULT_FORM.prio
    return f
  } catch {
    return DEFAULT_FORM
  }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Atualiza a posição do brilho da borda (.spotlight) sem re-renderizar o React. */
function trackSpot(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty("--mx", `${e.clientX - r.left}px`)
  el.style.setProperty("--my", `${e.clientY - r.top}px`)
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Field className={cn("gap-2", className)}>
      <Label htmlFor={id} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      <NativeSelect id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 bg-background/60 dark:bg-background/60">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    </Field>
  )
}

/** Título de cada etapa. Recebe o foco quando a etapa muda, para leitores de tela e teclado. */
function StepHeading({ id, title, children, headingRef }: { id: string; title: string; children: ReactNode; headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <div className="grid gap-1.5">
      <h2 id={id} ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-[-0.03em] outline-none sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="max-w-[60ch] text-muted-foreground">{children}</p>
    </div>
  )
}

function Stepper({
  view,
  onSelect,
  reachable,
  done,
}: {
  view: View
  onSelect: (v: View) => void
  reachable: (v: View) => boolean
  done: (v: View) => boolean
}) {
  return (
    <nav aria-label="Etapas" className="relative">
      <ol className="relative grid grid-cols-3 gap-2">
        {/* Trilho e preenchimento até a etapa atual */}
        <span aria-hidden="true" className="absolute top-[19px] right-[16.66%] left-[16.66%] h-px bg-border" />
        <m.span
          aria-hidden="true"
          className="absolute top-[19px] left-[16.66%] h-px w-[66.66%] origin-left bg-primary"
          initial={false}
          animate={{ scaleX: (view - 1) / 2 }}
          transition={{ duration: 0.7, ease: EASE }}
        />
        {STEPS.map((s) => {
          const active = view === s.n
          const ok = done(s.n)
          const can = reachable(s.n)
          return (
            <li key={s.n} className="relative flex justify-center">
              <button
                type="button"
                disabled={!can}
                onClick={() => onSelect(s.n)}
                aria-current={active ? "step" : undefined}
                className="group flex flex-col items-center gap-2 rounded-lg px-2 py-0 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    "relative grid size-10 place-items-center rounded-full border font-mono text-sm transition-[background-color,border-color,color,box-shadow] duration-300",
                    active && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_18%,transparent),0_0_24px_-4px_var(--primary)]",
                    !active && ok && "border-primary/60 bg-background text-primary-ink",
                    !active && !ok && "border-border bg-background text-muted-foreground",
                    can && !active && "group-hover:border-primary/80"
                  )}
                >
                  {ok && !active ? <Check weight="bold" className="size-4" /> : s.n}
                </span>
                <span className={cn("text-sm font-medium transition-colors", active ? "text-foreground" : "text-muted-foreground", can && "group-hover:text-foreground")}>
                  {s.title}
                </span>
                <span className="hidden max-w-[22ch] text-xs text-muted-foreground/80 md:block">{s.hint}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function HeroTitle() {
  const words = "Seu 3MF configurado por IA.".split(" ")
  return (
    <h1 id="hero-title" className="text-[clamp(2.6rem,7.2vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.045em]">
      <span className="sr-only">Seu 3MF configurado por IA.</span>
      {/* O reflexo (.shine) fica em cada palavra, por dentro da animação: no Safari, o texto recortado
          num pai some quando os filhos animam numa camada própria. */}
      <span aria-hidden="true">
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-top">
            <m.span
              className="inline-block"
              initial={{ y: "105%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, delay: 0.08 + i * 0.07, ease: EASE }}
            >
              <span className="shine" style={{ animationDelay: `${0.9 + i * 0.12}s` }}>
                {w}
              </span>
              {i < words.length - 1 && " "}
            </m.span>
          </span>
        ))}
      </span>
    </h1>
  )
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [fileName, setFileName] = useState("")
  const [isExample, setIsExample] = useState(false)
  const [fileError, setFileError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [form, setForm] = useState<FormData3mf>(loadForm)
  const [paste, setPaste] = useState("")
  const [items, setItems] = useState<Change[]>([])
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [applied, setApplied] = useState(false)
  const [applyError, setApplyError] = useState("")
  const [removeOv, setRemoveOv] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState("resumo")
  const [view, setView] = useState<View>(1)
  const [copied, setCopied] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const toolRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusOnEnter = useRef(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const reduce = useReducedMotion()

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(form))
    } catch {
      /* sem armazenamento */
    }
  }, [form])

  // Arrastar um .3mf para qualquer lugar da página abre o arquivo.
  const onFileRef = useRef<(f?: File) => Promise<void>>(async () => {})
  onFileRef.current = onFile
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragOver(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragOver(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragOver(false)
      void onFileRef.current(e.dataTransfer?.files[0])
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  }, [])

  const set = <K extends keyof FormData3mf>(k: K, v: FormData3mf[K]) => setForm((f) => ({ ...f, [k]: v }))

  const summary = useMemo(() => (project ? buildSummary(project, form, fileName) : ""), [project, form, fileName])
  const info = useMemo(() => {
    if (!project) return []
    const d = detect(project)
    const rows: [string, string][] = [
      ["Impressora", d.printer || "não informada"],
      ["Bico", d.nozzle ? d.nozzle + " mm" : "não informado"],
      ["Filamentos", d.types.length ? d.types.length + ": " + [...new Set(d.types)].join(", ") : "não informado"],
      [
        "Objetos",
        project.objects.length
          ? project.objects.length + ": " + project.objects.slice(0, 3).map((o) => o.name).join(", ") + (project.objects.length > 3 ? "…" : "")
          : "não informado",
      ],
      ["Placas", String(project.plates || 1)],
    ]
    if (project.app) rows.push(["Salvo por", project.app])
    return rows
  }, [project])

  const selected = items.filter((it, i) => it.status === "change" && checked[i])
  const conflictItems = selected.filter((it) => it.conflicts.length > 0)
  const counts = { change: 0, same: 0, bad: 0 }
  items.forEach((it) => counts[it.status]++)

  const reachable = (v: View) => v === 1 || !!project
  const done = (v: View) => (v === 1 ? !!project : v === 2 ? applied : downloaded)

  function scrollToTool() {
    const el = toolRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 0 || top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }

  function goTo(v: View) {
    if (!reachable(v) || v === view) return
    focusOnEnter.current = true
    setView(v)
    scrollToTool()
  }

  async function handleBuffer(buf: ArrayBuffer, name: string, example: boolean) {
    setFileError("")
    try {
      const p = await openProject(buf)
      const d = detect(p)
      const low = d.printer.toLowerCase()
      const match = OPT.printer.filter((o) => low.startsWith(o.toLowerCase())).sort((a, b) => b.length - a.length)[0]
      setForm((f) => ({
        ...f,
        printer: match ?? f.printer,
        nozzle: OPT.nozzle.includes(d.nozzle) ? d.nozzle : f.nozzle,
        filType: d.types[0] && OPT.type.includes(d.types[0]) ? d.types[0] : f.filType,
      }))
      setProject(p)
      setFileName(name)
      setIsExample(example)
      setItems([])
      setChecked({})
      setApplied(false)
      setApplyError("")
      setDownloaded(false)
      setPaste("")
      setTab("resumo")
      setView(1)
      track("arquivo_lido", { exemplo: example })
      toast.success("Arquivo lido: " + name)
      requestAnimationFrame(scrollToTool)
    } catch (e) {
      setProject(null)
      setApplied(false)
      setView(1)
      setFileError((e as Error).message)
      toast.error("Arquivo não aceito.")
      requestAnimationFrame(scrollToTool)
    }
  }

  async function onFile(file?: File) {
    if (!file) return
    if (!/\.3mf$/i.test(file.name)) {
      setFileError("Este não é um arquivo .3mf. Salve a peça como projeto no Bambu Studio e envie o .3mf.")
      setView(1)
      toast.error("Arquivo não aceito.")
      requestAnimationFrame(scrollToTool)
      return
    }
    let buf: ArrayBuffer
    try {
      buf = await file.arrayBuffer()
    } catch {
      setFileError("Não consegui ler o arquivo no navegador. Tente escolher de novo.")
      setView(1)
      toast.error("Arquivo não aceito.")
      return
    }
    await handleBuffer(buf, file.name, false)
  }

  async function loadExample() {
    await handleBuffer(await makeExample(), "projeto-exemplo.3mf", true)
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      track("resumo_copiado")
      setCopied(true)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2200)
      toast.success("Resumo copiado. Cole no Claude.")
    } catch {
      const ta = document.getElementById("summary") as HTMLTextAreaElement | null
      ta?.focus()
      ta?.select()
      toast.info("Selecionei o texto. Use Ctrl+C para copiar.")
    }
  }

  function applyResponse() {
    setApplyError("")
    if (!project) return
    try {
      const result = evaluateChanges(project, extractJson(paste))
      setItems(result)
      setChecked(Object.fromEntries(result.map((it, i) => [i, it.status === "change"])))
      setApplied(true)
      setDownloaded(false)
      const n = result.filter((it) => it.status === "change").length
      track("resposta_conferida", { alteracoes: n })
      if (n) toast.success(n + (n === 1 ? " alteração pronta para conferir." : " alterações prontas para conferir."))
      else toast.info("Nenhuma alteração aplicável nesta resposta.")
    } catch (e) {
      setApplyError((e as Error).message)
      setApplied(false)
    }
  }

  async function download() {
    if (!project || !selected.length) return
    setBusy(true)
    try {
      const blob = await buildModified(project, selected, { removeOverrides: removeOv && conflictItems.length > 0 })
      const name = fileName.replace(/\.3mf$/i, "") + "-ajustado.3mf"
      saveBlob(blob, name)
      setDownloaded(true)
      track("3mf_baixado", { alteracoes: selected.length })
      toast.success(`${name} gerado com ${selected.length} ${selected.length === 1 ? "alteração" : "alterações"}. Abra no Bambu Studio e fatie de novo.`)
    } catch (e) {
      toast.error("Não consegui gerar o arquivo: " + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Volta à etapa 1 para ajustar outro arquivo; mantém impressora e filamento, limpa as observações da peça
  function restart() {
    setProject(null)
    setFileName("")
    setIsExample(false)
    setFileError("")
    setItems([])
    setChecked({})
    setApplied(false)
    setApplyError("")
    setRemoveOv(false)
    setDownloaded(false)
    setPaste("")
    setTab("resumo")
    set("notes", "")
    track("recomecar")
    focusOnEnter.current = true
    setView(1)
    requestAnimationFrame(scrollToTool)
  }

  const statusText = !project
    ? "Etapa 1 de 3: escolha o arquivo .3mf"
    : downloaded
      ? "Pronto: abra no Bambu Studio e fatie de novo"
      : `Etapa ${view} de 3: ${STEPS[view - 1].hint.toLowerCase()}`

  const panel = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(4px)" },
    transition: { duration: 0.45, ease: EASE },
  }

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <a
          href="#ferramenta"
          className="fixed top-3 left-3 z-[70] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:translate-y-0"
        >
          Pular para a ferramenta
        </a>

        <input
          ref={fileInput}
          id="file"
          name="file"
          type="file"
          accept=".3mf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />

        <div className="grain relative min-h-dvh overflow-x-clip">
          {/* Navegação flutuante */}
          <header className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-2xl border border-hairline-strong bg-background/70 px-3 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:px-4">
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <img src={LOGO} alt="" width={32} height={32} className="size-8 object-contain" />
                <span className="truncate text-[15px] font-semibold tracking-tight">
                  Nosso Projeto 3D <span className="font-normal text-muted-foreground">/ Ajuste 3MF</span>
                </span>
              </a>
              <nav aria-label="Atalhos" className="flex items-center gap-1">
                <a href="#ferramenta" className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:block">
                  Ferramenta
                </a>
                <a href="#duvidas" className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:block">
                  Dúvidas
                </a>
                <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" onClick={() => track("instagram_clique")} aria-label="Abrir o Instagram @nossoprojeto3d (abre em outra aba)">
                    <InstagramLogo className="size-5" />
                  </a>
                </Button>
              </nav>
            </div>
          </header>

          {/* Hero */}
          <section aria-labelledby="hero-title" className="relative isolate">
            <div aria-hidden="true" className="bed-grid pointer-events-none absolute inset-0 -z-10" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-[18%] right-[-10%] -z-10 size-[min(70vw,640px)] rounded-full opacity-40 blur-3xl max-lg:top-[48%] max-lg:right-[-30%]"
              style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent), transparent 65%)" }}
            />
            <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-28 pb-10 sm:px-6 sm:pt-32 lg:min-h-[min(100dvh,820px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:pt-24 lg:pb-16">
              <div className="grid gap-6">
                <m.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="flex w-fit items-center gap-2 rounded-full border border-hairline-strong bg-card/60 px-3 py-1 text-[13px] text-muted-foreground"
                >
                  <Cube weight="duotone" className="size-4 text-primary-ink" />
                  Para projetos do Bambu Studio
                </m.p>
                <HeroTitle />
                <m.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.45, ease: EASE }}
                  className="max-w-[44ch] text-lg leading-relaxed text-muted-foreground"
                >
                  Envie o projeto do Bambu Studio, peça ajustes ao Claude e baixe pronto. Seu arquivo nunca sai do navegador.
                </m.p>
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.55, ease: EASE }}
                  className="flex flex-wrap items-center gap-3"
                >
                  <Button size="lg" className="btn-hot h-12 rounded-xl px-5 text-[15px] max-sm:flex-1" onClick={() => fileInput.current?.click()}>
                    <UploadSimple weight="bold" />
                    Escolher arquivo .3mf
                  </Button>
                  <Button size="lg" variant="ghost" className="h-12 rounded-xl px-4 text-[15px] text-muted-foreground hover:text-foreground max-sm:flex-1" onClick={loadExample}>
                    Ver um exemplo
                    <ArrowRight />
                  </Button>
                </m.div>
              </div>

              <m.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
                className="relative h-[300px] sm:h-[380px] lg:h-[540px]"
              >
                <Suspense fallback={null}>
                  <PrintScene className="absolute inset-0" />
                </Suspense>
              </m.div>
            </div>
          </section>

          {/* Ferramenta: uma etapa em foco por vez */}
          <main id="ferramenta" ref={toolRef} aria-label="Ferramenta" className="relative mx-auto max-w-6xl scroll-mt-28 px-4 pb-24 sm:px-6">
            <div className="grid gap-8">
              <Stepper view={view} onSelect={goTo} reachable={reachable} done={done} />
              <p role="status" aria-live="polite" className="sr-only">
                {statusText}
              </p>

              {/* Moldura dupla: casca fina por fora, núcleo por dentro */}
              <div onPointerMove={trackSpot} className="spotlight rounded-[1.6rem] border border-hairline bg-white/[0.015] p-1.5 sm:p-2">
                <div className="relative overflow-hidden rounded-[calc(1.6rem-0.5rem)] border border-hairline-strong bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <AnimatePresence
                    mode="wait"
                    initial={false}
                    onExitComplete={() => {
                      if (focusOnEnter.current) {
                        focusOnEnter.current = false
                        requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
                      }
                    }}
                  >
                    {view === 1 && (
                      <m.section key="v1" aria-labelledby="s1" {...panel} className="grid gap-8 p-4 sm:p-8 lg:p-10">
                        <StepHeading id="s1" title={project ? "Arquivo lido" : "Escolha o arquivo"} headingRef={headingRef}>
                          {project
                            ? "Confira se impressora e filamento estão certos. O app preencheu o que encontrou no projeto."
                            : "Precisa ser um projeto salvo pelo Bambu Studio (Arquivo, Salvar projeto como)."}
                        </StepHeading>

                        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
                          <div className="grid content-start gap-4">
                            <button
                              type="button"
                              onClick={() => fileInput.current?.click()}
                              className={cn(
                                "group relative grid w-full place-items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-input bg-background/50 px-6 text-center outline-none transition-[border-color,background-color] duration-300 hover:border-primary/70 hover:bg-primary/[0.04] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                project ? "py-6" : "py-12 sm:py-16",
                                dragOver && "border-primary bg-primary/[0.06]"
                              )}
                            >
                              <span className="grid size-12 place-items-center rounded-xl border border-hairline-strong bg-card text-primary-ink transition-transform duration-500 group-hover:-translate-y-0.5">
                                {project ? <FileArrowUp weight="duotone" className="size-6" /> : <UploadSimple weight="bold" className="size-6" />}
                              </span>
                              <span className="grid gap-1">
                                <span className="font-medium break-all">
                                  {project ? fileName + (isExample ? " (exemplo)" : "") : "Escolher arquivo .3mf"}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {project ? "Clique ou solte outro arquivo para trocar." : "ou arraste o arquivo para qualquer lugar da página"}
                                </span>
                              </span>
                            </button>

                            {fileError && (
                              <Alert variant="destructive">
                                <WarningOctagon weight="duotone" />
                                <AlertTitle>Não consegui usar este arquivo</AlertTitle>
                                <AlertDescription>{fileError}</AlertDescription>
                              </Alert>
                            )}

                            {project && (
                              <dl className="grid overflow-hidden rounded-xl border border-hairline-strong text-sm">
                                {info.map(([k, v], i) => (
                                  <m.div
                                    key={k}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.4, delay: 0.05 * i, ease: EASE }}
                                    className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0"
                                  >
                                    <dt className="text-muted-foreground">{k}</dt>
                                    <dd className="font-mono text-[13px] break-words">{v}</dd>
                                  </m.div>
                                ))}
                              </dl>
                            )}

                            {project?.sliced && (
                              <Alert className="border-warn/30 bg-warn-bg text-warn">
                                <Warning weight="duotone" />
                                <AlertTitle>Este arquivo já foi fatiado</AlertTitle>
                                <AlertDescription className="text-inherit">
                                  Depois de abrir o arquivo ajustado, fatie de novo no Bambu Studio para valer as novas configurações.
                                </AlertDescription>
                              </Alert>
                            )}

                            {!project && (
                              <p className="text-sm text-muted-foreground">
                                Sem um arquivo agora?{" "}
                                <button type="button" onClick={loadExample} className="rounded font-medium text-primary-ink underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
                                  Ver um exemplo
                                </button>
                              </p>
                            )}
                          </div>

                          <div className="grid content-start gap-5">
                            <h3 className="text-base font-semibold">Impressora e filamento</h3>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                              <SelectField id="fPrinter" label="Impressora" value={form.printer} options={OPT.printer} onChange={(v) => set("printer", v)} className="col-span-2 sm:col-span-1" />
                              <SelectField id="fNozzle" label="Bico (mm)" value={form.nozzle} options={OPT.nozzle} onChange={(v) => set("nozzle", v)} />
                              <SelectField id="fAms" label="AMS" value={form.ams} options={OPT.ams} onChange={(v) => set("ams", v)} />
                              <SelectField id="fType" label="Tipo de filamento" value={form.filType} options={OPT.type} onChange={(v) => set("filType", v)} />
                              <SelectField id="fBrand" label="Marca" value={form.brand} options={BRANDS} onChange={(v) => set("brand", v)} />
                              <SelectField id="fPrio" label="Prioridade" value={form.prio} options={OPT.prio} onChange={(v) => set("prio", v)} className="col-span-2 sm:col-span-1" />
                              <SelectField id="fUse" label="Uso da peça" value={form.use} options={OPT.use} onChange={(v) => set("use", v)} className="col-span-2" />
                              <Field className="col-span-2 gap-2">
                                <Label htmlFor="fNotes" className="text-[13px] font-normal text-muted-foreground">
                                  Observações (opcional)
                                </Label>
                                <Input
                                  id="fNotes"
                                  name="notes"
                                  autoComplete="off"
                                  className="h-10 bg-background/60 dark:bg-background/60"
                                  placeholder="Ex.: encaixe justo, vai ficar ao sol, peça de 30 cm…"
                                  value={form.notes}
                                  onChange={(e) => set("notes", e.target.value)}
                                />
                                <FieldDescription>Quanto mais contexto, mais certeiras as sugestões.</FieldDescription>
                              </Field>
                            </div>
                          </div>
                        </div>

                        {project && (
                          <div className="flex justify-end border-t border-hairline pt-6">
                            <Button size="lg" className="btn-hot h-12 rounded-xl px-5 max-sm:w-full" onClick={() => goTo(2)}>
                              Continuar para o Claude
                              <ArrowRight weight="bold" />
                            </Button>
                          </div>
                        )}
                      </m.section>
                    )}

                    {view === 2 && project && (
                      <m.section key="v2" aria-labelledby="s2" {...panel} className="grid gap-8 p-4 sm:p-8 lg:p-10">
                        <StepHeading id="s2" title="Peça as sugestões ao Claude" headingRef={headingRef}>
                          O resumo traz os dados do projeto e já pede a resposta no formato certo. O Claude devolve só o que vale mudar nessa peça, com o motivo.
                        </StepHeading>

                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
                          <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-3">
                            <TabsList className="max-sm:w-full">
                              <TabsTrigger value="resumo">Resumo</TabsTrigger>
                              <TabsTrigger value="formato">Formato da resposta</TabsTrigger>
                            </TabsList>
                            <TabsContent value="resumo">
                              <div className="overflow-hidden rounded-xl border border-hairline-strong bg-background/70">
                                <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2">
                                  <span className="flex items-center gap-1.5" aria-hidden="true">
                                    <span className="size-2.5 rounded-full bg-white/10" />
                                    <span className="size-2.5 rounded-full bg-white/10" />
                                    <span className="size-2.5 rounded-full bg-white/10" />
                                  </span>
                                  <span className="truncate font-mono text-xs text-muted-foreground" translate="no">
                                    resumo · {fileName}
                                  </span>
                                </div>
                                <textarea
                                  id="summary"
                                  readOnly
                                  value={summary}
                                  aria-label="Resumo do projeto para o Claude"
                                  spellCheck={false}
                                  className="block h-72 w-full resize-none bg-transparent p-4 font-mono text-[12.5px] leading-relaxed text-foreground/90 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset sm:h-80"
                                />
                              </div>
                            </TabsContent>
                            <TabsContent value="formato">
                              <div className="grid gap-3">
                                <p className="text-sm text-muted-foreground">
                                  O resumo já pede este formato ao Claude. Cada item traz a chave da configuração, o novo valor e o motivo.
                                </p>
                                <pre className="overflow-x-auto rounded-xl border border-hairline-strong bg-background/70 p-4 font-mono text-[12.5px] leading-relaxed">{`{
  "resumo": "Peça decorativa com curvas, priorizando acabamento",
  "alteracoes": [
    { "chave": "layer_height", "valor": "0.16", "motivo": "mais detalhe nas curvas" },
    { "chave": "wall_loops", "valor": 3, "motivo": "superfície mais firme" }
  ]
}`}</pre>
                              </div>
                            </TabsContent>
                          </Tabs>

                          <div className="grid content-start gap-5">
                            <ol className="grid gap-4 text-sm">
                              {[
                                ["Copie o resumo", "Um clique leva o texto inteiro."],
                                ["Cole numa conversa nova", "No Claude, sem precisar explicar nada."],
                                ["Traga a resposta", "Cole o JSON na próxima etapa."],
                              ].map(([t, d], i) => (
                                <li key={t} className="grid grid-cols-[1.75rem_1fr] gap-3">
                                  <span className="grid size-7 place-items-center rounded-lg border border-hairline-strong font-mono text-xs text-primary-ink">{i + 1}</span>
                                  <span>
                                    <span className="block font-medium">{t}</span>
                                    <span className="text-muted-foreground">{d}</span>
                                  </span>
                                </li>
                              ))}
                            </ol>
                            <div className="grid gap-2.5">
                              <Button size="lg" className="btn-hot h-12 rounded-xl" onClick={copySummary}>
                                {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
                                {copied ? "Copiado" : "Copiar resumo"}
                              </Button>
                              <Button size="lg" variant="outline" className="h-12 rounded-xl" asChild>
                                <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
                                  Abrir o Claude
                                  <ArrowUpRight />
                                </a>
                              </Button>
                              <span className="hidden items-center justify-center gap-1 pt-1 text-xs text-muted-foreground sm:flex">
                                ou selecione o texto e use <Kbd>Ctrl</Kbd>
                                <Kbd>C</Kbd>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-6">
                          <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => goTo(1)}>
                            <ArrowLeft />
                            Arquivo
                          </Button>
                          <Button size="lg" variant="secondary" className="h-12 rounded-xl px-5 max-sm:w-full" onClick={() => goTo(3)}>
                            Já tenho a resposta
                            <ArrowRight weight="bold" />
                          </Button>
                        </div>
                      </m.section>
                    )}

                    {view === 3 && project && (
                      <m.section key="v3" aria-labelledby="s3" {...panel} className="grid gap-8 p-4 sm:p-8 lg:p-10">
                        <StepHeading id="s3" title="Aplique e baixe" headingRef={headingRef}>
                          Cole a resposta do Claude. Você vê o valor de antes e o de depois de cada mudança e desmarca o que não quiser.
                        </StepHeading>

                        <div className={cn("grid gap-8", applied && "lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-10")}>
                          <div className="grid content-start gap-3">
                            <Label htmlFor="paste" className="text-[13px] font-normal text-muted-foreground">
                              Resposta do Claude
                            </Label>
                            <Textarea
                              id="paste"
                              name="paste"
                              value={paste}
                              spellCheck={false}
                              autoComplete="off"
                              onChange={(e) => setPaste(e.target.value)}
                              className={cn("field-sizing-fixed resize-none bg-background/60 font-mono text-[12.5px] dark:bg-background/60", applied ? "h-32 lg:h-56" : "h-48")}
                              placeholder={'Cole aqui a resposta inteira, por exemplo:\n{"alteracoes":[{"chave":"layer_height","valor":"0.16","motivo":"mais detalhe nas curvas"}]}'}
                            />
                            <Button size="lg" variant={applied ? "outline" : "default"} className={cn("h-11 rounded-xl", !applied && "btn-hot")} onClick={applyResponse} disabled={!paste.trim()}>
                              {applied ? "Conferir de novo" : "Conferir alterações"}
                            </Button>
                            {applyError && (
                              <Alert variant="destructive">
                                <WarningOctagon weight="duotone" />
                                <AlertTitle>Não consegui ler a resposta</AlertTitle>
                                <AlertDescription>{applyError} Copie a resposta inteira do Claude e tente de novo.</AlertDescription>
                              </Alert>
                            )}
                          </div>

                          {applied && (
                            <div className="grid min-w-0 content-start gap-5">
                              {downloaded && (
                                <m.div
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.5, ease: EASE }}
                                  className="flex items-start gap-3 rounded-xl border border-add/30 bg-add-bg px-4 py-3 text-sm text-add"
                                >
                                  <CheckCircle weight="duotone" className="mt-0.5 size-5 shrink-0" />
                                  <p>Arquivo gerado. Abra no Bambu Studio, confira no preview e fatie de novo para valer as mudanças.</p>
                                </m.div>
                              )}

                              <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
                                <Badge className="tabular-nums">{counts.change + (counts.change === 1 ? " pronta para aplicar" : " prontas para aplicar")}</Badge>
                                {counts.same > 0 && <Badge variant="secondary" className="tabular-nums">{counts.same + (counts.same === 1 ? " já estava assim" : " já estavam assim")}</Badge>}
                                {counts.bad > 0 && <Badge variant="destructive" className="tabular-nums">{counts.bad + (counts.bad === 1 ? " ignorada" : " ignoradas")}</Badge>}
                              </div>

                              <ul className="grid gap-2">
                                {items.map((it, i) => (
                                  <m.li
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.45, delay: Math.min(i, 12) * 0.045, ease: EASE }}
                                  >
                                    <label
                                      htmlFor={"chk" + i}
                                      className={cn(
                                        "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border px-4 py-3 transition-[border-color,background-color,opacity] duration-200",
                                        it.status === "change" ? "border-hairline-strong bg-background/50 hover:border-primary/50" : "cursor-default border-hairline bg-transparent",
                                        it.status === "change" && !checked[i] && "opacity-60"
                                      )}
                                    >
                                      <Checkbox
                                        id={"chk" + i}
                                        className="mt-0.5"
                                        checked={!!checked[i]}
                                        disabled={it.status !== "change"}
                                        aria-label={"Aplicar " + (it.spec ? it.spec.label : it.key)}
                                        onCheckedChange={(v) => setChecked((c) => ({ ...c, [i]: v === true }))}
                                      />
                                      <span className="grid min-w-0 gap-1.5">
                                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                          <span className={cn("font-medium", !it.spec && "font-mono text-sm")} translate={it.spec ? undefined : "no"}>{it.spec ? it.spec.label : it.key}</span>
                                          {it.spec && (
                                            <span className="font-mono text-xs text-muted-foreground" translate="no">
                                              {it.key}
                                            </span>
                                          )}
                                        </span>
                                        {it.status === "change" && (
                                          <span className="flex flex-wrap items-center gap-2 font-mono text-[13px] tabular-nums">
                                            <span className="rounded-md bg-del-bg px-1.5 py-0.5 text-del line-through decoration-del/60">{fmtVal(it.spec, it.before)}</span>
                                            <ArrowRight aria-label="para" className="size-3.5 text-muted-foreground" />
                                            <span className="rounded-md bg-add-bg px-1.5 py-0.5 font-semibold text-add">{fmtVal(it.spec, it.after)}</span>
                                          </span>
                                        )}
                                        {it.status === "same" && <span className="font-mono text-[13px] text-muted-foreground tabular-nums">{fmtVal(it.spec, it.before)}</span>}
                                        {it.msg && <span className="text-[13px] text-destructive">{it.msg}</span>}
                                        {it.reason && <span className="max-w-[70ch] text-sm text-muted-foreground">{it.reason}</span>}
                                        {it.conflicts.length > 0 && (
                                          <span className="text-[13px] text-warn">Ajuste próprio em: {it.conflicts.join(", ")}. Nesses objetos o valor global é ignorado.</span>
                                        )}
                                      </span>
                                      <Badge variant={STATUS_VARIANT[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                                    </label>
                                  </m.li>
                                ))}
                              </ul>

                              {conflictItems.length > 0 && (
                                <div className="grid gap-4">
                                  <Alert className="border-warn/30 bg-warn-bg text-warn">
                                    <Warning weight="duotone" />
                                    <AlertTitle>Ajustes próprios nos objetos</AlertTitle>
                                    <AlertDescription className="text-inherit">
                                      Alguns objetos têm ajuste próprio que vence o valor global:{" "}
                                      {[...new Set(conflictItems.flatMap((it) => it.conflicts.map((c) => `${c} (${it.key})`)))].join(", ")}.
                                    </AlertDescription>
                                  </Alert>
                                  <Field orientation="horizontal">
                                    <Checkbox id="rmOv" checked={removeOv} onCheckedChange={(v) => setRemoveOv(v === true)} />
                                    <FieldContent>
                                      <FieldLabel htmlFor="rmOv">Remover esses ajustes dos objetos</FieldLabel>
                                      <FieldDescription>Assim o valor novo vale para a peça inteira.</FieldDescription>
                                    </FieldContent>
                                  </Field>
                                </div>
                              )}

                              <div className="sticky bottom-3 z-10 -mx-1 grid gap-2 rounded-2xl border border-hairline-strong bg-popover/85 p-2 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:flex sm:flex-wrap">
                                <Button size="lg" className="btn-hot h-12 rounded-xl px-5 sm:flex-1" onClick={download} disabled={!selected.length || isExample || busy}>
                                  {busy ? <CircleNotch weight="bold" className="animate-spin" /> : <DownloadSimple weight="bold" />}
                                  {busy ? "Gerando…" : selected.length ? `Baixar 3MF ajustado (${selected.length})` : "Baixar 3MF ajustado"}
                                </Button>
                                <Button size="lg" variant="outline" className="h-12 rounded-xl px-5" onClick={restart}>
                                  <ArrowCounterClockwise weight="bold" />
                                  {isExample ? "Começar com meu arquivo" : "Ajustar outro arquivo"}
                                </Button>
                              </div>
                              {isExample && selected.length > 0 && (
                                <p className="text-sm text-muted-foreground">Este é um exemplo de demonstração. O download libera quando você usar um arquivo seu.</p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex border-t border-hairline pt-6">
                          <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => goTo(2)}>
                            <ArrowLeft />
                            Resumo
                          </Button>
                        </div>
                      </m.section>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </main>

          <Faq />
          <Footer logo={LOGO} instagram={INSTAGRAM} />
        </div>

        {/* Aviso ao arrastar um arquivo sobre a página */}
        <AnimatePresence>
          {dragOver && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 p-6 backdrop-blur-md"
            >
              <m.div
                initial={{ scale: 0.94, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="grid place-items-center gap-3 rounded-3xl border-2 border-dashed border-primary/70 bg-card/80 px-14 py-12 text-center"
              >
                <UploadSimple weight="bold" className="size-9 text-primary-ink" />
                <p className="text-lg font-medium">Solte o arquivo .3mf</p>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        <ConsentBanner />
        <Toaster position="bottom-center" />
      </LazyMotion>
    </MotionConfig>
  )
}
