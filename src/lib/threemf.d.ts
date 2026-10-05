export type Spec = { key: string; label: string; group: string; type: string; unit?: string; min?: number; max?: number; list?: string[] }
export type Change = {
  key: string
  spec?: Spec
  reason: string
  before: unknown
  after: unknown
  status: "change" | "same" | "bad"
  msg: string
  conflicts: string[]
}
export type FormData3mf = { printer: string; nozzle: string; ams: string; filType: string; brand: string; use: string; prio: string; notes: string }
export type Project = {
  zip: unknown
  cfg: Record<string, unknown>
  modelXml: string
  app: string
  objects: { name: string; overrides: string[] }[]
  plates: number
  sliced: boolean
}
export function openProject(buf: ArrayBuffer | Uint8Array): Promise<Project>
export function detect(p: Project): { printer: string; nozzle: string; types: string[]; names: string[]; colours: string[] }
export function buildSummary(p: Project, f: FormData3mf, fileName: string): string
export function extractJson(text: string): unknown
export function evaluateChanges(p: Project, data: unknown): Change[]
export function buildModified(p: Project, accepted: Change[], opts?: { removeOverrides?: boolean }): Promise<Blob>
export function changesText(p: Project, f: FormData3mf, fileName: string, accepted: Change[]): string
export function makeExample(): Promise<ArrayBuffer>
export function fmtVal(spec: Spec | undefined, v: unknown): string
export const GROUPS: string[]
