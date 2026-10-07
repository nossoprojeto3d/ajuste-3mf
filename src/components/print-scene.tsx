import { useEffect, useRef } from "react"
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from "three"

/* Vaso torcido impresso camada por camada. Cada camada é um anel de segmentos; o bico percorre o anel
   atual e as últimas camadas ficam quentes (douradas) e esfriam até o cinza. Leve: só linhas, sem luz. */

const LAYERS = 120
const POINTS = 168
const HEIGHT = 2.9
const PRINT_SECONDS = 16
const HOLD_SECONDS = 2.8
const FADE_SECONDS = 1.2

const HOT = new Color("#e2b93b")
const WARM = new Color("#f3dc95")
const COLD_LOW = new Color("#3a3d44")
const COLD_HIGH = new Color("#a9adb6")

function radius(theta: number, h: number) {
  // Perfil de vaso: base firme, barriga, pescoço e boca abrindo. Lóbulos torcendo com a altura.
  const t = h / HEIGHT
  const belly = 0.34 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05))
  const flare = 0.2 * Math.pow(Math.max(0, t - 0.78) / 0.22, 2)
  const profile = 0.42 + belly + flare
  const lobes = 1 + 0.07 * Math.cos(7 * theta + t * 5.2)
  return profile * lobes
}

function buildGeometry() {
  const positions = new Float32Array(LAYERS * POINTS * 2 * 3)
  const ring: [number, number, number][] = []
  let o = 0
  for (let l = 0; l < LAYERS; l++) {
    const h = (l / (LAYERS - 1)) * HEIGHT
    ring.length = 0
    for (let p = 0; p <= POINTS; p++) {
      const th = (p / POINTS) * Math.PI * 2
      const r = radius(th, h)
      ring.push([Math.cos(th) * r, h, Math.sin(th) * r])
    }
    for (let p = 0; p < POINTS; p++) {
      const a = ring[p]
      const b = ring[p + 1]
      positions[o++] = a[0]; positions[o++] = a[1]; positions[o++] = a[2]
      positions[o++] = b[0]; positions[o++] = b[1]; positions[o++] = b[2]
    }
  }
  const g = new BufferGeometry()
  g.setAttribute("position", new BufferAttribute(positions, 3))
  g.setAttribute("color", new BufferAttribute(new Float32Array(positions.length), 3))
  return g
}

/** Pinta as camadas: as recém-impressas quentes, as antigas no cinza de altura. */
function paint(colors: BufferAttribute, current: number) {
  const arr = colors.array as Float32Array
  const c = new Color()
  for (let l = 0; l < LAYERS; l++) {
    const age = current - l
    const t = l / (LAYERS - 1)
    c.copy(COLD_LOW).lerp(COLD_HIGH, 0.35 + t * 0.65)
    if (age >= 0 && age < 9) {
      const heat = 1 - age / 9
      c.lerp(age < 1.5 ? HOT : WARM, heat * heat)
      if (age < 1.5) c.copy(HOT)
    }
    const start = l * POINTS * 2 * 3
    const end = start + POINTS * 2 * 3
    for (let i = start; i < end; i += 3) {
      arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b
    }
  }
  colors.needsUpdate = true
}

export default function PrintScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
    } catch {
      return // sem WebGL: o fundo da seção já basta
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.setAttribute("aria-hidden", "true")
    renderer.domElement.style.display = "block"
    el.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 3.1, 7.4)
    camera.lookAt(0, 1.3, 0)

    const piece = new Group()
    scene.add(piece)

    const geo = buildGeometry()
    const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 })
    const lines = new LineSegments(geo, mat)
    piece.add(lines)
    const colors = geo.getAttribute("color") as BufferAttribute

    // Mesa: pontos em grade, como a placa texturizada.
    const bedPts: number[] = []
    for (let x = -14; x <= 14; x++)
      for (let z = -14; z <= 14; z++) {
        const d = Math.hypot(x, z)
        if (d <= 14) bedPts.push(x * 0.15, -0.02, z * 0.15)
      }
    const bedGeo = new BufferGeometry()
    bedGeo.setAttribute("position", new BufferAttribute(new Float32Array(bedPts), 3))
    const bed = new Points(bedGeo, new PointsMaterial({ color: 0x4a4d55, size: 0.025, transparent: true, opacity: 0.8 }))
    scene.add(bed)

    // Bico e o brilho do filamento saindo.
    const nozzle = new Mesh(new ConeGeometry(0.07, 0.22, 20), new MeshBasicMaterial({ color: 0xd8dade }))
    nozzle.rotation.x = Math.PI
    const glowGeo = new BufferGeometry()
    glowGeo.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0]), 3))
    const glow = new Points(
      glowGeo,
      new PointsMaterial({ color: HOT, size: 0.35, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false })
    )
    piece.add(nozzle, glow)

    let pointerX = 0
    let pointerY = 0
    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointerX = ((e.clientX - r.left) / r.width - 0.5) * 2
      pointerY = ((e.clientY - r.top) / r.height - 0.5) * 2
    }
    window.addEventListener("pointermove", onPointer, { passive: true })

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = w + "px"
      renderer.domElement.style.height = h + "px"
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const segsPerLayer = POINTS * 2
    const posArr = geo.getAttribute("position").array as Float32Array

    function setProgress(p: number) {
      // p em camadas (0..LAYERS). A parte fracionária é o quanto do anel atual já saiu.
      const layer = Math.min(LAYERS - 1, Math.floor(p))
      const frac = p >= LAYERS ? 1 : p - layer
      const verts = layer * segsPerLayer + Math.floor(frac * POINTS) * 2
      geo.setDrawRange(0, p >= LAYERS ? LAYERS * segsPerLayer : verts)
      const idx = Math.min(LAYERS * segsPerLayer - 1, Math.max(0, verts - 1)) * 3
      const x = posArr[idx], y = posArr[idx + 1], z = posArr[idx + 2]
      nozzle.position.set(x, y + 0.14, z)
      glowGeo.attributes.position.setXYZ(0, x, y, z)
      glowGeo.attributes.position.needsUpdate = true
      const showHead = p < LAYERS
      nozzle.visible = showHead
      glow.visible = showHead
    }

    let lastPainted = -1
    let rotY = 0
    let start = performance.now()
    let raf = 0
    let running = false

    function frame(now: number) {
      const t = (now - start) / 1000
      const cycle = PRINT_SECONDS + HOLD_SECONDS + FADE_SECONDS
      const ct = t % cycle
      let p: number
      let opacity = 1
      if (ct < PRINT_SECONDS) {
        // Começa mais rápido nas camadas largas de baixo e desacelera um pouco no topo.
        const k = ct / PRINT_SECONDS
        p = (1 - Math.pow(1 - k, 1.35)) * LAYERS
      } else if (ct < PRINT_SECONDS + HOLD_SECONDS) {
        p = LAYERS
      } else {
        p = LAYERS
        opacity = 1 - (ct - PRINT_SECONDS - HOLD_SECONDS) / FADE_SECONDS
      }
      const layer = Math.floor(p)
      if (layer !== lastPainted) {
        paint(colors, p >= LAYERS ? LAYERS + 20 : layer)
        lastPainted = layer
      }
      setProgress(p)
      mat.opacity = opacity

      rotY += 0.0028
      piece.rotation.y = rotY + pointerX * 0.25
      piece.rotation.x += (pointerY * 0.06 - piece.rotation.x) * 0.05
      bed.rotation.y = piece.rotation.y

      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }

    function play() {
      if (running || reduce) return
      running = true
      raf = requestAnimationFrame(frame)
    }
    function pause() {
      running = false
      cancelAnimationFrame(raf)
    }

    if (reduce) {
      // Sem animação: peça pronta, parada, num ângulo bonito.
      paint(colors, LAYERS + 20)
      setProgress(LAYERS)
      piece.rotation.y = 0.6
      renderer.render(scene, camera)
    }

    // Só anima quando está na tela e a aba está visível.
    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !document.hidden) play()
      else pause()
    })
    io.observe(el)
    const onVis = () => (document.hidden || !visible ? pause() : play())
    document.addEventListener("visibilitychange", onVis)
    start = performance.now()

    return () => {
      pause()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("pointermove", onPointer)
      geo.dispose()
      mat.dispose()
      bedGeo.dispose()
      glowGeo.dispose()
      nozzle.geometry.dispose()
      ;(nozzle.material as MeshBasicMaterial).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={host} className={className} />
}
