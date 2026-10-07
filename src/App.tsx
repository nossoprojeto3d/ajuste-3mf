import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Check, Copy, Download, Instagram, Lock, OctagonX, RotateCcw, TriangleAlert, Upload } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
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

const STAGES = [
  { v: 0, label: "Etapa 1 de 3", text: "Escolha o arquivo .3mf" },
  { v: 33, label: "Etapa 2 de 3", text: "Copie o resumo e peça ao Claude" },
  { v: 66, label: "Etapa 3 de 3", text: "Confira as alterações e baixe" },
  { v: 100, label: "Pronto", text: "Abra no Bambu Studio e fatie de novo" },
]

const STATUS_LABEL = { change: "Muda", same: "Já está assim", bad: "Ignorada" } as const
const STATUS_VARIANT = { change: "default", same: "secondary", bad: "destructive" } as const

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

type StepState = "done" | "active" | "wait"

function StepMark({ n, state, className }: { n: number; state: StepState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors",
        state === "done" && "border-primary bg-primary text-primary-foreground",
        state === "active" && "border-primary-ink bg-background text-primary-ink ring-4 ring-primary/25",
        state === "wait" && "border-border bg-muted text-muted-foreground",
        className
      )}
    >
      {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
    </span>
  )
}

/* No celular, cada etapa é um item de linha do tempo (trilho à esquerda). No desktop, vira uma coluna com altura fixa e rolagem própria. */
function Step({
  n,
  state,
  title,
  description,
  last,
  className,
  children,
}: {
  n: number
  state: StepState
  title: string
  description: string
  last?: boolean
  className?: string
  children?: ReactNode
}) {
  const id = "t" + n
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "relative grid grid-cols-[2rem_1fr] gap-x-4 sm:gap-x-5 lg:flex lg:h-[var(--col-h)] lg:flex-col lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:border lg:bg-card lg:p-5",
        className
      )}
    >
      <div className="flex flex-col items-center lg:hidden">
        <StepMark n={n} state={state} />
        {!last && <span aria-hidden="true" className={cn("mt-1 w-px flex-1", state === "done" ? "bg-primary-ink/50" : "bg-border")} />}
      </div>
      <div className={cn("min-w-0 pb-10 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:pb-0", last && "pb-0")}>
        <div className={cn("grid gap-1 pt-0.5 lg:grid-cols-[2rem_1fr] lg:gap-x-3 lg:pt-0", children && "mb-4")}>
          <StepMark n={n} state={state} className="hidden lg:row-span-2 lg:grid" />
          <h2 id={id} className="text-lg leading-tight font-semibold tracking-tight">
            {title}
            <span className="sr-only">
              {" "}
              ({state === "done" ? "concluída" : state === "active" ? "em andamento" : "aguardando"})
            </span>
          </h2>
          <p className="max-w-[62ch] text-sm text-muted-foreground">{description}</p>
        </div>
        {children && <div className="min-h-0 lg:-mx-1 lg:flex-1 lg:overflow-y-auto lg:px-1 lg:pb-1">{children}</div>}
      </div>
    </section>
  )
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
    <Field className={className}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    </Field>
  )
}

function LockedEmpty({ title, text, skeleton }: { title: string; text: string; skeleton?: boolean }) {
  return (
    <Empty className="border md:p-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
      {skeleton && (
        <div className="grid w-full max-w-xs gap-2" aria-hidden="true">
          <Skeleton className="h-3" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      )}
    </Empty>
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

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(form))
    } catch {
      /* sem armazenamento */
    }
  }, [form])

  const set = <K extends keyof FormData3mf>(k: K, v: FormData3mf[K]) => setForm((f) => ({ ...f, [k]: v }))

  const summary = useMemo(() => (project ? buildSummary(project, form, fileName) : ""), [project, form, fileName])
  const info = useMemo(() => {
    if (!project) return []
    const d = detect(project)
    const rows: [string, string][] = [
      ["Impressora no arquivo", d.printer || "não informada"],
      ["Bico no arquivo", d.nozzle ? d.nozzle + " mm" : "não informado"],
      ["Filamentos", d.types.length ? d.types.length + ": " + [...new Set(d.types)].join(", ") : "não informado"],
      [
        "Objetos",
        project.objects.length
          ? project.objects.length + ": " + project.objects.slice(0, 3).map((o) => o.name).join(", ") + (project.objects.length > 3 ? "..." : "")
          : "não informado",
      ],
      ["Placas", String(project.plates || 1)],
    ]
    if (project.app) rows.push(["Salvo por", project.app])
    return rows
  }, [project])

  const selected = items.filter((it, i) => it.status === "change" && checked[i])
  const conflictItems = selected.filter((it) => it.conflicts.length > 0)
  const stage = downloaded ? 3 : applied ? 2 : project ? 1 : 0
  const counts = { change: 0, same: 0, bad: 0 }
  items.forEach((it) => counts[it.status]++)

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
      track("arquivo_lido", { exemplo: example })
      toast.success("Arquivo lido: " + name)
    } catch (e) {
      setProject(null)
      setApplied(false)
      setFileError((e as Error).message)
      toast.error("Arquivo não aceito.")
    }
  }

  async function onFile(file?: File) {
    if (!file) return
    if (!/\.3mf$/i.test(file.name)) {
      setFileError("Este não é um arquivo .3mf. Salve a peça como projeto no Bambu Studio e envie o .3mf.")
      toast.error("Arquivo não aceito.")
      return
    }
    await handleBuffer(await file.arrayBuffer(), file.name, false)
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      track("resumo_copiado")
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

  // Volta ao passo 1 para ajustar outro arquivo; mantém impressora e filamento, limpa as observações da peça
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
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const st = (n: number): StepState => (stage >= n ? "done" : stage === n - 1 ? "active" : "wait")
  const s = STAGES[stage]

  return (
    <>
      <div className="mx-auto w-full max-w-[1680px] px-4 pt-6 pb-20 sm:px-6 lg:px-10 lg:pt-6">
        <nav aria-label="Nosso Projeto 3D" className="mb-8 flex items-center justify-between gap-4 border-b pb-4 lg:mb-6">
          <a href="https://instagram.com/nossoprojeto3d" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <img src="https://nossoprojeto3d.github.io/catalogo/logo.png" alt="" className="h-9 w-auto" />
            <span className="font-serif text-base whitespace-nowrap sm:text-lg">Nosso Projeto 3D</span>
          </a>
          <Button asChild variant="outline" size="sm">
            <a href="https://instagram.com/nossoprojeto3d" target="_blank" rel="noopener noreferrer" onClick={() => track("instagram_clique")} aria-label="Abrir o Instagram @nossoprojeto3d (abre em outra aba)">
              <Instagram />
              @nossoprojeto3d
            </a>
          </Button>
        </nav>

        <header
          className={cn(
            "grid gap-5 pb-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end lg:gap-x-14 lg:gap-y-4 lg:pb-8",
            /* Com um arquivo aberto, o texto de apresentação sai e as colunas ganham a altura toda. */
            project && "lg:grid-cols-[1fr_auto] lg:items-center lg:pb-4"
          )}
        >
          <h1
            className={cn(
              "title-layers w-fit max-w-[16ch] px-1 pt-[0.05em] pb-[0.2em] text-[clamp(2.75rem,8.5vw,5.25rem)] leading-[1.05] font-bold tracking-[-0.025em] text-balance lg:row-span-2 lg:text-[clamp(3rem,5vw,5.25rem)]",
              project && "lg:row-span-1 lg:max-w-none lg:text-[clamp(1.75rem,2.6vw,2.5rem)]"
            )}
          >
            Seu 3MF configurado pela IA.
          </h1>
          <div className={cn("grid max-w-[60ch] gap-3 text-lg text-muted-foreground lg:text-base", project && "lg:hidden")}>
            <p>
              Envie seu arquivo 3MF, escolha o que deseja ajustar e deixe a IA cuidar do resto. Ela analisa sua peça, impressora, filamento e
              objetivo da impressão, sugere as melhores configurações e explica cada alteração.
            </p>
            <p>Você aprova o que quiser, o app aplica as mudanças e devolve o 3MF pronto para baixar e importar no Bambu Studio.</p>
          </div>
          <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("h-1.5 w-8 rounded-full transition-colors", stage > i ? "bg-primary" : "bg-border")} />
              ))}
            </span>
            <span className="font-medium whitespace-nowrap">{s.label}</span>
            <span className="text-muted-foreground">{s.text}</span>
          </div>
        </header>

        <main
          className={cn(
            "grid items-start gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-5 xl:gap-6 [--col-h:max(34rem,calc(100dvh-21rem))]",
            project && "lg:[--col-h:max(34rem,calc(100dvh-11rem))]"
          )}
        >
          {/* Bancada: arquivo e impressão */}
          <aside
            aria-label="Arquivo e impressão"
            className="grid content-start gap-5 lg:h-[var(--col-h)] lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-card lg:p-5"
          >
            <div className="hidden lg:grid lg:grid-cols-[2rem_1fr] lg:gap-x-3">
              <StepMark n={1} state={st(1)} className="row-span-2" />
              <h2 className="text-lg leading-tight font-semibold tracking-tight">Arquivo e impressão</h2>
              <p className="text-sm text-muted-foreground">Envie o .3mf e confira os dados da impressora e do filamento.</p>
            </div>
            <label
              htmlFor="file"
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFile(e.dataTransfer.files[0]) }}
              className={cn(
                "cursor-pointer rounded-xl border border-dashed border-input bg-card transition-colors hover:border-primary-ink hover:bg-primary/10 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
                project && "border-solid border-primary-ink/60",
                dragOver && "border-primary-ink bg-primary/10"
              )}
            >
              <input
                id="file"
                type="file"
                accept=".3mf"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
              <Empty className={cn("border-0 md:p-8 lg:p-5", project && "lg:p-3")}>
                <EmptyHeader>
                  <EmptyMedia variant="icon" className={cn(project && "lg:hidden")}>
                    <Upload />
                  </EmptyMedia>
                  <EmptyTitle className="break-all">{project ? fileName + (isExample ? " (exemplo)" : "") : "Escolha o arquivo .3mf"}</EmptyTitle>
                  <EmptyDescription>
                    {project
                      ? "Clique ou solte outro arquivo para trocar."
                      : "ou solte aqui. Precisa ser um projeto salvo pelo Bambu Studio (Arquivo, Salvar projeto como)."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </label>

            {fileError && (
              <Alert variant="destructive">
                <OctagonX />
                <AlertTitle>Não consegui usar este arquivo</AlertTitle>
                <AlertDescription>{fileError}</AlertDescription>
              </Alert>
            )}

            {project && (
              <div className="overflow-hidden rounded-xl border bg-card">
                <Table aria-label="Dados lidos do arquivo" className="lg:[&_td]:py-1.5">
                  <TableBody>
                    {info.map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell className="w-[38%] text-muted-foreground">{k}</TableCell>
                        <TableCell className="font-mono text-[13px] whitespace-normal break-words">{v}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {project?.sliced && (
              <Alert className="border-warn/30 bg-warn-bg text-warn">
                <TriangleAlert />
                <AlertTitle>Este arquivo já foi fatiado</AlertTitle>
                <AlertDescription className="text-inherit">
                  Depois de abrir o arquivo ajustado, fatie de novo no Bambu Studio para valer as novas configurações.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-xl border bg-card p-5 lg:border-0 lg:bg-transparent lg:p-0">
              <h2 className="mb-4 text-base font-semibold tracking-tight lg:sr-only">Impressora e filamento</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-3 gap-y-3.5">
                <SelectField id="fPrinter" label="Impressora" value={form.printer} options={OPT.printer} onChange={(v) => set("printer", v)} />
                <SelectField id="fNozzle" label="Bico (mm)" value={form.nozzle} options={OPT.nozzle} onChange={(v) => set("nozzle", v)} />
                <SelectField id="fAms" label="AMS" value={form.ams} options={OPT.ams} onChange={(v) => set("ams", v)} />
                <SelectField id="fType" label="Tipo de filamento" value={form.filType} options={OPT.type} onChange={(v) => set("filType", v)} />
                <SelectField id="fBrand" label="Marca" value={form.brand} options={BRANDS} onChange={(v) => set("brand", v)} />
                <SelectField id="fPrio" label="Prioridade" value={form.prio} options={OPT.prio} onChange={(v) => set("prio", v)} />
                <SelectField id="fUse" label="Uso da peça" value={form.use} options={OPT.use} onChange={(v) => set("use", v)} className="col-span-full" />
                <Field className="col-span-full">
                  <Label htmlFor="fNotes">Observações (opcional)</Label>
                  <Input
                    id="fNotes"
                    autoComplete="off"
                    placeholder="Ex.: encaixe justo, vai ficar ao sol, peça de 30 cm"
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                  <FieldDescription>Quanto mais contexto, mais certeiras as sugestões.</FieldDescription>
                </Field>
              </div>
            </div>

            {!project && (
              <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                Sem um arquivo agora?
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-primary-ink"
                  onClick={async () => handleBuffer(await makeExample(), "projeto-exemplo.3mf", true)}
                >
                  Ver com um projeto de exemplo
                </Button>
              </div>
            )}
          </aside>

          {/* Linha do tempo: passos do Claude ao download */}
          <div className="min-w-0 lg:contents">
            <Step
              n={1}
              className="lg:hidden"
              state={st(1)}
              title={project ? "Arquivo lido" : "Escolha o arquivo"}
              description={project ? "O projeto foi aberto. Confira à esquerda se impressora e filamento estão certos." : "Envie o projeto .3mf na coluna ao lado para começar."}
            >
              {project ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="font-mono">{fileName}</Badge>
                  <span className="text-muted-foreground">
                    {project.objects.length} {project.objects.length === 1 ? "objeto" : "objetos"}, {project.plates || 1} {(project.plates || 1) === 1 ? "placa" : "placas"}
                  </span>
                </div>
              ) : null}
            </Step>

            <Step
              n={2}
              state={st(2)}
              title="Peça as sugestões ao Claude"
              description="Copie o resumo do projeto e cole numa conversa com o Claude. Ele responde com as configurações que valem a pena mudar nessa peça, cada uma com o motivo."
            >
              {!project ? (
                <LockedEmpty title="Resumo ainda não gerado" text="Ele aparece aqui assim que você escolher o arquivo." skeleton />
              ) : (
                <Tabs value={tab} onValueChange={setTab} className="lg:h-full">
                  <TabsList className="max-sm:w-full">
                    <TabsTrigger value="resumo">Resumo</TabsTrigger>
                    <TabsTrigger value="formato">Formato da resposta</TabsTrigger>
                  </TabsList>
                  <TabsContent value="resumo" className="lg:min-h-0 lg:flex-1">
                    <InputGroup className="lg:h-full lg:has-[>textarea]:h-full">
                      <InputGroupTextarea
                        id="summary"
                        readOnly
                        value={summary}
                        aria-label="Resumo do projeto para o Claude"
                        className="field-sizing-fixed h-64 font-mono text-[13px] leading-relaxed lg:h-[max(12rem,calc(var(--col-h)-18.5rem))] lg:flex-none"
                      />
                      <InputGroupAddon align="block-end" className="flex-wrap">
                        <Button size="sm" onClick={copySummary}>
                          <Copy />
                          Copiar resumo
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
                            Abrir o Claude
                          </a>
                        </Button>
                        <span className="ml-auto flex items-center gap-1 text-xs font-normal">
                          Copiar manualmente: <Kbd>Ctrl</Kbd>
                          <Kbd>C</Kbd>
                        </span>
                      </InputGroupAddon>
                    </InputGroup>
                  </TabsContent>
                  <TabsContent value="formato">
                    <div className="flex flex-col gap-3">
                      <FieldDescription>
                        O resumo já pede este formato ao Claude. Cada item traz a chave da configuração, o novo valor e o motivo.
                      </FieldDescription>
                      <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-[13px] leading-relaxed">{`{
  "resumo": "Peça decorativa com curvas, priorizando acabamento",
  "alteracoes": [
    { "chave": "layer_height", "valor": "0.16", "motivo": "mais detalhe nas curvas" },
    { "chave": "wall_loops", "valor": 3, "motivo": "superfície mais firme" }
  ]
}`}</pre>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </Step>

            <Step
              n={3}
              state={st(3)}
              last
              title="Aplique e baixe"
              description="Cole a resposta do Claude. O app mostra o valor de antes e o de depois de cada mudança, e você desmarca o que não quiser antes de baixar."
            >
              {!project ? (
                <LockedEmpty title="Nada para aplicar ainda" text="Escolha o arquivo para liberar esta etapa." />
              ) : (
                <div className="flex flex-col gap-4">
                  <Field>
                    <Label htmlFor="paste">Resposta do Claude</Label>
                    <Textarea
                      id="paste"
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                      className={cn("field-sizing-fixed h-40 font-mono text-[13px] lg:h-44", applied && "lg:h-24")}
                      placeholder={'Cole aqui a resposta inteira. Exemplo:\n{"alteracoes":[{"chave":"layer_height","valor":"0.16","motivo":"mais detalhe nas curvas"}]}'}
                    />
                  </Field>
                  <div>
                    <Button onClick={applyResponse}>Conferir alterações</Button>
                  </div>

                  {applyError && (
                    <Alert variant="destructive">
                      <OctagonX />
                      <AlertTitle>Não consegui ler a resposta</AlertTitle>
                      <AlertDescription>{applyError}</AlertDescription>
                    </Alert>
                  )}

                  {applied && (
                    <div className="flex flex-col gap-4">
                      <Separator />
                      <div role="status" className="flex flex-wrap items-center gap-2">
                        <Badge>{counts.change + (counts.change === 1 ? " pronta para aplicar" : " prontas para aplicar")}</Badge>
                        {counts.same > 0 && <Badge variant="secondary">{counts.same + (counts.same === 1 ? " já estava assim" : " já estavam assim")}</Badge>}
                        {counts.bad > 0 && <Badge variant="destructive">{counts.bad + (counts.bad === 1 ? " ignorada" : " ignoradas")}</Badge>}
                        <span className="text-sm text-muted-foreground">Desmarque o que não quiser.</span>
                      </div>

                      <ItemGroup className="gap-2">
                        {items.map((it, i) => (
                          <Item key={i} asChild variant={it.status === "change" ? "outline" : "muted"} size="sm" className="items-start bg-card">
                            <label htmlFor={"chk" + i}>
                              <ItemMedia className="pt-0.5">
                                <Checkbox
                                  id={"chk" + i}
                                  checked={!!checked[i]}
                                  disabled={it.status !== "change"}
                                  aria-label={"Aplicar " + (it.spec ? it.spec.label : it.key)}
                                  onCheckedChange={(v) => setChecked((c) => ({ ...c, [i]: v === true }))}
                                />
                              </ItemMedia>
                              <ItemContent className="min-w-0">
                                <ItemTitle className="flex-wrap items-baseline gap-x-2 gap-y-0">
                                  <span>{it.spec ? it.spec.label : it.key || "Sem chave"}</span>
                                  {it.spec && <span className="font-mono text-xs font-normal break-all text-muted-foreground">{it.key}</span>}
                                </ItemTitle>
                                {it.status === "change" && (
                                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[13px] break-words">
                                    <span className="rounded bg-del-bg px-1.5 py-0.5 text-del line-through decoration-del/60">{fmtVal(it.spec, it.before)}</span>
                                    <span aria-hidden="true" className="text-muted-foreground">→</span>
                                    <span className="sr-only">para</span>
                                    <span className="rounded bg-add-bg px-1.5 py-0.5 font-semibold text-add">{fmtVal(it.spec, it.after)}</span>
                                  </div>
                                )}
                                {it.status === "same" && <div className="font-mono text-[13px]">{fmtVal(it.spec, it.before)}</div>}
                                {it.msg && <p className="text-[13px] text-destructive">{it.msg}</p>}
                                {it.reason && <ItemDescription className="line-clamp-none max-w-[70ch] text-pretty">{it.reason}</ItemDescription>}
                                {it.conflicts.length > 0 && (
                                  <p className="text-[13px] text-warn">
                                    Ajuste próprio em: {it.conflicts.join(", ")}. Nesses objetos o valor global é ignorado.
                                  </p>
                                )}
                              </ItemContent>
                              <ItemActions>
                                <Badge variant={STATUS_VARIANT[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                              </ItemActions>
                            </label>
                          </Item>
                        ))}
                      </ItemGroup>

                      {conflictItems.length > 0 && (
                        <div className="flex flex-col gap-4">
                          <Alert className="border-warn/30 bg-warn-bg text-warn">
                            <TriangleAlert />
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

                      <ButtonGroup className="flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1 lg:sticky lg:bottom-0 lg:z-10 lg:w-full lg:bg-card lg:py-3">
                        <Button onClick={download} disabled={!selected.length || isExample || busy}>
                          {busy ? <Spinner /> : <Download />}
                          {selected.length ? `Baixar 3MF ajustado (${selected.length})` : "Baixar 3MF ajustado"}
                        </Button>
                        <Button variant="outline" onClick={restart}>
                          <RotateCcw />
                          {isExample ? "Começar com meu arquivo" : "Ajustar outro arquivo"}
                        </Button>
                      </ButtonGroup>
                      {isExample && selected.length > 0 && (
                        <p className="text-sm text-muted-foreground">Este é um exemplo de demonstração. O download libera quando você usar um arquivo seu.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Step>
          </div>
        </main>
      <section aria-labelledby="faq" className="mt-14 grid gap-6 border-t pt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,2.1fr)] lg:gap-5 xl:gap-6">
        <div className="grid content-start gap-2">
          <h2 id="faq" className="text-xl font-semibold tracking-tight">Dúvidas comuns</h2>
          <p className="max-w-[40ch] text-sm text-muted-foreground">Por que usar o Claude, o que o app altera, privacidade e custo.</p>
        </div>
        <div className="min-w-0 max-w-3xl">
        <Accordion type="single" collapsible>
          <AccordionItem value="porque">
            <AccordionTrigger>Por que pedir ao Claude em vez de usar regras prontas?</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-muted-foreground">
              O ajuste certo depende da peça, da impressora e do filamento. O Claude lê os dados do seu projeto e sugere valores para esse caso,
              em vez de aplicar uma tabela fixa. Quando as boas práticas de impressão mudam, as sugestões mudam junto, sem precisar atualizar o
              app.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="custo">
            <AccordionTrigger>Tem custo ou precisa de chave de API?</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-muted-foreground">
              O app não cobra nada e não usa chave de API. As sugestões vêm da conversa que você abre no Claude e cola de volta aqui.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="privacidade">
            <AccordionTrigger>Meu arquivo vai para algum servidor?</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-muted-foreground">
              Não. O 3MF é lido e regravado dentro do navegador. Só o texto do resumo sai daqui, e apenas quando você o copia e cola no Claude.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="alteracoes">
            <AccordionTrigger>O que o app consegue alterar?</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-muted-foreground">
              Cerca de 55 configurações do Bambu Studio: qualidade e camadas, paredes e preenchimento, suportes e brim, velocidades e
              temperaturas, ventoinha e torre de limpeza do multicolor. Valores fora de limites seguros e chaves desconhecidas são ignorados e
              aparecem na lista.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="fatiar">
            <AccordionTrigger>Por que fatiar de novo no Bambu Studio?</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-muted-foreground">
              O app muda as configurações do projeto, mas não gera o G-code. Abra o arquivo ajustado, confira no preview e fatie para valer as
              alterações.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="formato">
            <AccordionTrigger>O 3MF não abriu ou faltou configuração.</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-muted-foreground">
              O app só aceita projetos salvos pelo Bambu Studio (Arquivo, Salvar projeto como), porque é lá que ficam as configurações. Um 3MF
              exportado só com a malha não serve.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        </div>
      </section>
      </div>
      <ConsentBanner />
      <Toaster position="bottom-center" />
    </>
  )
}
