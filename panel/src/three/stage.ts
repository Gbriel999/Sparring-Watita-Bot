// The 3D stage of the Combate block, loaded on demand (three.js is most of its weight): the bot's
// player model on a transparent canvas, animated by LiveAnimation from its real state.
import { SkinViewer } from 'skinview3d'
import { BufferGeometry, Group, LineBasicMaterial, LineDashedMaterial, LineLoop, Vector3 } from 'three'
import { LiveAnimation, type Pose } from './liveAnimation'
import { dummySkin } from './dummySkin'

// Model units: the skin sits 8 above the player origin, so the feet are at y = -16 (head top 16)
const FEET_Y = -16
const LIVE = 0x3ddc97
const IDLE = 0x4a4f6a

function circle (radius: number): BufferGeometry {
  const points: Vector3[] = []
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2
    points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }
  return new BufferGeometry().setFromPoints(points)
}

/** The training-floor ring the model stands on; it stays put when the model jumps. */
function floorRing () {
  const outer = new LineLoop(circle(15), new LineBasicMaterial({ color: LIVE, transparent: true, opacity: 0.7 }))
  const innerMaterial = new LineDashedMaterial({ color: IDLE, dashSize: 1.2, gapSize: 1, transparent: true, opacity: 0.8 })
  const inner = new LineLoop(circle(9.5), innerMaterial)
  inner.computeLineDistances()
  const group = new Group()
  group.add(outer, inner)
  group.position.y = FEET_Y - 0.05
  return { group, outer: outer.material as LineBasicMaterial }
}

export interface Stage {
  setPose: (pose: Pose) => void
  setLive: (live: boolean) => void
  /** null loads the training-dummy skin. */
  setSkin: (url: string | null, model: 'default' | 'slim') => Promise<void>
  resize: (width: number, height: number) => void
  setPaused: (paused: boolean) => void
  dispose: () => void
}

export function createStage (canvas: HTMLCanvasElement, width: number, height: number): Stage {
  const animation = new LiveAnimation()
  const viewer = new SkinViewer({
    canvas,
    width,
    height,
    pixelRatio: 'match-device',
    fov: 34,
    zoom: 0.82,
    animation
  })
  viewer.background = null
  viewer.globalLight.intensity = 1.5
  viewer.cameraLight.intensity = 2.6
  viewer.controls.enableZoom = false
  viewer.controls.enablePan = false
  // Three-quarter view, like a character select screen; drag to turn it
  viewer.playerObject.rotation.y = -0.5
  viewer.playerObject.cape.visible = false
  const ring = floorRing()
  viewer.scene.add(ring.group)

  return {
    setPose (pose) {
      animation.pose = pose
    },
    setLive (live) {
      ring.outer.color.setHex(live ? LIVE : IDLE)
    },
    async setSkin (url, model) {
      if (url) {
        await viewer.loadSkin(url, { model, ears: false })
      } else {
        viewer.loadSkin(dummySkin(), { model: 'default', ears: false })
      }
      animation.resetMaterials()
    },
    resize (w, h) {
      viewer.setSize(w, h)
    },
    setPaused (paused) {
      viewer.renderPaused = paused
    },
    dispose () {
      viewer.dispose()
    }
  }
}
