// Medição de uso. Só liga quando há um ID configurado em .env (veja README).
// Nunca enviamos o arquivo, o nome dele, o resumo nem a resposta do Claude: só o nome do evento
// e contagens simples (ex.: quantas alterações foram baixadas).

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined

type Params = Record<string, string | number | boolean>

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

function addScript(src: string) {
  const s = document.createElement("script")
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

const KEY = "nossoprojeto3d-medicao"
export type Consent = "granted" | "denied" | null

/** Só há o que perguntar se existe algum ID configurado e o navegador não pediu "Não rastrear". */
export function analyticsEnabled() {
  return Boolean(GA_ID || PIXEL_ID) && navigator.doNotTrack !== "1"
}

export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(KEY)
    return v === "granted" || v === "denied" ? v : null
  } catch {
    return null
  }
}

export function setConsent(value: "granted" | "denied") {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* sem armazenamento: a escolha vale só nesta visita */
  }
  if (value === "granted") initAnalytics()
}

let started = false

/** Só carrega os scripts depois que a pessoa aceitou. */
export function initAnalytics() {
  if (started || typeof window === "undefined") return
  if (!analyticsEnabled() || getConsent() !== "granted") return
  started = true

  if (GA_ID) {
    window.dataLayer = window.dataLayer || []
    window.gtag = function () {
      // gtag exige o objeto arguments, não um array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments)
    }
    window.gtag("js", new Date())
    window.gtag("config", GA_ID, { anonymize_ip: true })
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`)
  }

  if (PIXEL_ID) {
    // Snippet oficial do Meta Pixel, em forma compacta.
    const q: unknown[] = []
    const fbq = function (...args: unknown[]) {
      q.push(args)
    }
    ;(fbq as unknown as { queue: unknown[] }).queue = q
    window.fbq = fbq
    addScript("https://connect.facebook.net/en_US/fbevents.js")
    window.fbq("init", PIXEL_ID)
    window.fbq("track", "PageView")
  }
}

export function track(event: string, params: Params = {}) {
  window.gtag?.("event", event, params)
  window.fbq?.("trackCustom", event, params)
}
