import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import mapUrl from '../assets/maps/china-provinces.svg?url'
import prefectureMapUrl from '../assets/maps/china-prefectures.svg?url'
import type { Region } from '../services/api'
import type { MapPosition, MapViewState, NetworkMapEdge, NetworkMapHub, NetworkMapNode } from './networkMapModel'

export type ProjectedNodePosition = { key: string; left: number; top: number }

type Props = {
  nodes: NetworkMapNode[]
  hubs: NetworkMapHub[]
  edges: NetworkMapEdge[]
  zoom: number
  view?: MapViewState
  hoveredKey?: string | null
  selectedKey?: string | null
  onPick?: (region: Region) => void
  onClear?: () => void
  onHover?: (key: string | null) => void
  onProjectionChange: (positions: ProjectedNodePosition[]) => void
  onError: () => void
}

const MAP_WIDTH = 75
const MAP_HEIGHT = 51
const SURFACE_Z = 7.4
const BOUNDARY_Z = SURFACE_Z + 0.7
const PROVINCE_FILLS = [0xf4f6f8, 0xe8edf0, 0xf0eee9, 0xe7eef3, 0xeeeae6, 0xebf0ea]
const NODE_COLORS: Record<string, number> = { signed: 0x3b82f6, focus: 0x22c55e, standard: 0xf59e0b, risk: 0xef4444 }

const mapToWorld = ([left, top]: MapPosition, elevation = 0) => new THREE.Vector3(
  (left / 100 - 0.5) * MAP_WIDTH,
  (0.5 - top / 100) * MAP_HEIGHT,
  elevation,
)

function cameraPoseForView(view: MapViewState | undefined, zoom: number) {
  const lookAt = new THREE.Vector3(0, 3.2, 0)
  if (!view || view.level === 'national') return { position: new THREE.Vector3(10, -46, 86), lookAt, zoom }
  const nodeZoom = view.level === 'city' ? Math.min(zoom * 1.16, 1.24) : Math.min(zoom * 1.08, 1.24)
  return {
    position: new THREE.Vector3(6, view.level === 'city' ? -22 : -34, view.level === 'city' ? 54 : 68),
    lookAt,
    zoom: nodeZoom,
  }
}

function createDotGridTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#eef1f5'
  context.fillRect(0, 0, 128, 128)
  context.fillStyle = 'rgba(148, 163, 184, 0.42)'
  for (let y = 8; y < 128; y += 11) {
    for (let x = 8; x < 128; x += 11) {
      context.beginPath()
      context.arc(x, y, 1.15, 0, Math.PI * 2)
      context.fill()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(0.016, 0.024)
  texture.anisotropy = 4
  return texture
}

function nodeScale(node: NetworkMapNode) {
  const volume = Math.max(1, node.region.lead_total + (node.region.franchise_total ?? 0) * 2)
  if (node.activityTier === 'signed') return 1.15 + Math.min(1.35, volume / 6)
  if (node.activityTier === 'focus') return 0.92 + Math.min(0.9, volume / 8)
  return 0.72 + Math.min(0.55, volume / 12)
}

function neighborLinks(nodes: NetworkMapNode[]) {
  const located = nodes.filter((node) => node.position)
  const links: Array<[MapPosition, MapPosition]> = []
  const seen = new Set<string>()
  located.forEach((node) => {
    const nearby = located
      .filter((other) => other.key !== node.key)
      .sort((left, right) => {
        const leftDelta = Math.hypot(left.position![0] - node.position![0], left.position![1] - node.position![1])
        const rightDelta = Math.hypot(right.position![0] - node.position![0], right.position![1] - node.position![1])
        const leftBias = left.businessArea === node.businessArea ? 0 : 10
        const rightBias = right.businessArea === node.businessArea ? 0 : 10
        return leftDelta + leftBias - (rightDelta + rightBias)
      })
      .slice(0, 2)
    nearby.forEach((other) => {
      const key = [node.key, other.key].sort().join(':')
      if (seen.has(key)) return
      seen.add(key)
      links.push([node.position!, other.position!])
    })
  })
  return links
}

function addBoundaryLines(paths: Array<{ subPaths: Array<{ getPoints: (divisions?: number) => Array<{ x: number; y: number }> }> }>, z: number, material: THREE.LineBasicMaterial, group: THREE.Group) {
  paths.forEach((path) => {
    path.subPaths.forEach((subPath) => {
      const pts = subPath.getPoints()
      if (pts.length < 2) return
      const points = pts.map((point) => new THREE.Vector3(point.x, point.y, z))
      const first = points[0]
      const last = points[points.length - 1]
      if (first.distanceToSquared(last) > 0.01) points.push(first.clone())
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material))
    })
  })
}

function provinceFill(name: string) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0)
  return PROVINCE_FILLS[hash % PROVINCE_FILLS.length]
}

function createGlowMaterial(hex: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return new THREE.SpriteMaterial({ color: hex, transparent: true, opacity: 0.35, depthWrite: false })
  const red = (hex >> 16) & 255
  const green = (hex >> 8) & 255
  const blue = hex & 255
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.18, `rgba(${red},${green},${blue},0.78)`)
  gradient.addColorStop(0.48, `rgba(${red},${green},${blue},0.22)`)
  gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
}

const disposeMaterial = (material: THREE.Material) => {
  const mapped = material as THREE.MeshStandardMaterial
  mapped.map?.dispose()
  material.dispose()
}

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()
    const sprite = child as THREE.Sprite
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : sprite.material ? [sprite.material] : []
    materials.forEach(disposeMaterial)
  })
}

export default function ChinaMap3D({ nodes, edges, zoom, view, hoveredKey, selectedKey, onPick, onClear, onHover, onProjectionChange, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const markerGroupRef = useRef<THREE.Group | null>(null)
  const nodeIndexRef = useRef<NetworkMapNode[]>([])
  const renderRef = useRef<(() => void) | null>(null)
  const projectionCallbackRef = useRef(onProjectionChange)
  const errorCallbackRef = useRef(onError)
  const pickRef = useRef(onPick)
  const clearRef = useRef(onClear)
  const hoverRef = useRef(onHover)
  projectionCallbackRef.current = onProjectionChange
  errorCallbackRef.current = onError
  pickRef.current = onPick
  clearRef.current = onClear
  hoverRef.current = onHover

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let disposed = false
    let frame = 0
    let isVisible = !document.hidden
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xf3f4f6, 180, 320)
    sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 360)
    camera.up.set(0, 0, 1)
    const initialPose = cameraPoseForView(undefined, 1)
    camera.position.copy(initialPose.position)
    camera.lookAt(initialPose.lookAt)
    cameraRef.current = camera
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      errorCallbackRef.current()
      return undefined
    }
    rendererRef.current = renderer
    renderer.setClearColor(0xf3f5f7, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.className = 'map-webgl-canvas'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.82))
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd5dbe3, 1.05))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.65)
    keyLight.position.set(-16, -42, 96)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.radius = 5
    keyLight.shadow.bias = -0.00018
    keyLight.shadow.camera.left = -70
    keyLight.shadow.camera.right = 70
    keyLight.shadow.camera.top = 55
    keyLight.shadow.camera.bottom = -55
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xf8fafc, 0.55)
    fillLight.position.set(36, 18, 48)
    scene.add(fillLight)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 1, metalness: 0 }))
    floor.position.z = -0.45
    floor.receiveShadow = true
    scene.add(floor)
    const mapGroup = new THREE.Group()
    mapGroup.position.set(-MAP_WIDTH / 2, MAP_HEIGHT / 2, 0)
    mapGroup.scale.set(MAP_WIDTH / 1000, -MAP_HEIGHT / 680, 1)
    scene.add(mapGroup)
    const markerGroup = new THREE.Group()
    markerGroupRef.current = markerGroup
    scene.add(markerGroup)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minDistance = 48
    controls.maxDistance = 140
    controls.minPolarAngle = 0.38
    controls.maxPolarAngle = 1.28
    controls.enableDamping = true
    controls.target.copy(initialPose.lookAt)
    controls.update()
    controlsRef.current = controls

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const updateProjection = () => {
      const positions = nodeIndexRef.current.filter((node) => node.position).map((node) => {
        const projected = mapToWorld(node.position!, BOUNDARY_Z + 1.2).project(camera)
        return { key: node.key, left: (projected.x + 1) * 50, top: (1 - projected.y) * 50 }
      })
      projectionCallbackRef.current(positions)
    }
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      updateProjection()
    }
    renderRef.current = render
    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      // Preserve the desktop horizontal field of view on portrait screens.
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(26 / 2)) * Math.max(1, 1.8 / camera.aspect)))
      camera.updateProjectionMatrix()
      render()
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const animate = (time: number) => {
      if (disposed || !isVisible) return
      markerGroup.traverse((child) => {
        if (child.userData.pulse) {
          const ring = child as THREE.Mesh
          const phase = ((time / 1650) + Number(ring.userData.phase || 0)) % 1
          ring.scale.setScalar(1 + phase * 1.35)
          ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - phase)
        }
      })
      render()
      frame = requestAnimationFrame(animate)
    }
    const startAnimation = () => { if (isVisible && !frame) frame = requestAnimationFrame(animate) }
    const pickFromEvent = (event: MouseEvent, kind: 'hover' | 'click') => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(markerGroup.children, true)
      const hit = hits.find((item) => item.object.userData.key)
      if (!hit) {
        if (kind === 'hover') hoverRef.current?.(null)
        if (kind === 'click') clearRef.current?.()
        return
      }
      const key = String(hit.object.userData.key)
      const node = nodeIndexRef.current.find((item) => item.key === key)
      if (kind === 'hover') hoverRef.current?.(key)
      if (kind === 'click' && node) pickRef.current?.(node.region)
    }
    const onPointerMove = (event: MouseEvent) => pickFromEvent(event, 'hover')
    const onPointerClick = (event: MouseEvent) => pickFromEvent(event, 'click')
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('click', onPointerClick)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(host)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden
      if (!isVisible && frame) { cancelAnimationFrame(frame); frame = 0 }
      else { render(); startAnimation() }
    })
    resize()
    Promise.all([
      new SVGLoader().loadAsync(mapUrl),
      new SVGLoader().loadAsync(prefectureMapUrl).catch(() => null),
    ]).then(([data, prefectureData]) => {
      if (disposed) return
      const gridTexture = createDotGridTexture()
      if (gridTexture) gridTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xb7c0ca, roughness: 0.88, metalness: 0.04 })
      data.paths.forEach((path) => {
        const node = (path.userData as { node?: Element } | undefined)?.node
        const fill = provinceFill(node?.getAttribute('data-province') ?? '')
        const topMaterial = new THREE.MeshStandardMaterial({
          color: fill,
          map: gridTexture ?? undefined,
          roughness: 0.92,
          metalness: 0.02,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
        path.toShapes().forEach((shape) => {
          const geometry = new THREE.ExtrudeGeometry(shape, { depth: SURFACE_Z, steps: 1, bevelEnabled: true, bevelSize: 0.55, bevelThickness: 0.4, bevelSegments: 1 })
          const mesh = new THREE.Mesh(geometry, [sideMaterial, topMaterial])
          mesh.castShadow = true
          mesh.receiveShadow = true
          mapGroup.add(mesh)
        })
      })
      if (prefectureData) {
        addBoundaryLines(prefectureData.paths, BOUNDARY_Z - 0.08, new THREE.LineBasicMaterial({ color: 0xc5ced6, transparent: true, opacity: 0.9 }), mapGroup)
      }
      addBoundaryLines(data.paths, BOUNDARY_Z, new THREE.LineBasicMaterial({ color: 0x7d8896, transparent: true, opacity: 0.95 }), mapGroup)
      render()
      if (!reducedMotion) startAnimation()
    }).catch(() => { if (!disposed) errorCallbackRef.current() })
    return () => {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('click', onPointerClick)
      window.removeEventListener('resize', resize)
      disposeObject(scene)
      controls.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      cameraRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      markerGroupRef.current = null
      controlsRef.current = null
      renderRef.current = null
    }
  }, [])

  useEffect(() => {
    const markerGroup = markerGroupRef.current
    if (!markerGroup) return
    disposeObject(markerGroup)
    markerGroup.clear()
    nodeIndexRef.current = nodes
    const located = nodes.filter((node) => node.position)
    const glowMaterials: Record<string, THREE.SpriteMaterial> = {}
    const glowFor = (tier: string) => {
      const hex = NODE_COLORS[tier] ?? NODE_COLORS.standard
      glowMaterials[tier] ??= createGlowMaterial(hex)
      return glowMaterials[tier]
    }
    const meshLinks = neighborLinks(located)
    const links = meshLinks.length ? meshLinks : edges.map((edge) => [edge.from, edge.to] as [MapPosition, MapPosition])
    links.forEach(([from, to]) => {
      const start = mapToWorld(from, BOUNDARY_Z + 0.35)
      const end = mapToWorld(to, BOUNDARY_Z + 0.35)
      const midpoint = start.clone().lerp(end, 0.5)
      midpoint.z += Math.max(0.35, start.distanceTo(end) * 0.028)
      const geometry = new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(start, midpoint, end).getPoints(18))
      markerGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x9aa7b4, transparent: true, opacity: 0.78 })))
    })
    located.forEach((node, index) => {
      const scale = nodeScale(node)
      const hex = NODE_COLORS[node.activityTier] ?? NODE_COLORS.standard
      const height = BOUNDARY_Z + 0.55 * scale
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.38 * scale, 24, 16),
        new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.48, roughness: 0.28, metalness: 0.08 }),
      )
      core.position.copy(mapToWorld(node.position!, height))
      core.castShadow = true
      core.userData.key = node.key
      markerGroup.add(core)
      const halo = new THREE.Sprite(glowFor(node.activityTier))
      halo.position.copy(core.position)
      halo.scale.setScalar(2.35 * scale)
      halo.userData.key = node.key
      markerGroup.add(halo)
      const active = selectedKey === node.key || hoveredKey === node.key || node.activityTier === 'risk'
      if (active) {
        const phases = selectedKey === node.key ? [0, 0.48] : [index * 0.37]
        phases.forEach((phase) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.52 * scale, 0.68 * scale, 48),
            new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
          )
          ring.position.copy(mapToWorld(node.position!, BOUNDARY_Z + 0.18))
          ring.userData = { key: node.key, pulse: true, phase }
          markerGroup.add(ring)
        })
      }
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.95 * scale, 8, 8), new THREE.MeshBasicMaterial({ visible: false }))
      proxy.position.copy(core.position)
      proxy.userData.key = node.key
      markerGroup.add(proxy)
    })
    renderRef.current?.()
  }, [nodes, edges, hoveredKey, selectedKey])

  useEffect(() => {
    const camera = cameraRef.current
    if (!camera) return
    const pose = cameraPoseForView(view, zoom)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    camera.zoom = pose.zoom
    const applyLook = () => {
      camera.lookAt(pose.lookAt)
      controlsRef.current?.target.copy(pose.lookAt)
      camera.updateProjectionMatrix()
    }
    if (reducedMotion) {
      camera.position.copy(pose.position)
      applyLook()
      renderRef.current?.()
      return
    }
    const start = camera.position.clone()
    const startTime = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / 420)
      camera.position.lerpVectors(start, pose.position, t)
      applyLook()
      renderRef.current?.()
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [view, zoom])

  return <div className="map-webgl-host" ref={hostRef} aria-hidden="true" data-testid="three-map-host" />
}
