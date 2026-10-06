import { PlayerAnimation, type PlayerObject } from 'skinview3d'
import type { Material, Mesh, MeshStandardMaterial } from 'three'

/** What the bot is doing right now, written by the panel on every state update. */
export interface Pose {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  sprint: boolean
  sneak: boolean
  shield: boolean
  onGround: boolean
  eating: boolean
  pitch: number
  /** performance.now() of the last swing and of the last damage taken, as seen by this page. */
  swingAt: number
  hurtAt: number
  reducedMotion: boolean
}

export function idlePose (): Pose {
  return {
    forward: false, back: false, left: false, right: false, sprint: false, sneak: false, shield: false,
    onGround: true, eating: false, pitch: 0, swingAt: -1e9, hurtAt: -1e9, reducedMotion: false
  }
}

const SWING_MS = 280
const HURT_MS = 300

function approach (current: number, target: number, rate: number, delta: number): number {
  return current + (target - current) * Math.min(1, rate * delta)
}

/**
 * The bot's real controls played on the model: gait from its keys (walk, sprint, strafe), the jump
 * when it leaves the ground, the arm swing on each attack, the raised shield, the head following
 * its pitch, and a red flash when it takes damage.
 */
export class LiveAnimation extends PlayerAnimation {
  pose: Pose = idlePose()
  private phase = 0
  private amplitude = 0
  private lift = 0
  private lean = 0
  private materials: MeshStandardMaterial[] | null = null

  protected animate (player: PlayerObject, delta: number): void {
    const p = this.pose
    const now = performance.now()
    const skin = player.skin
    const moving = p.forward || p.back || p.left || p.right
    // Mirroring the bot is the data this model shows, so it always moves; "reduce motion" (Windows
    // with animation effects off reports it) only drops the decoration: the idle breathing
    const reduced = p.reducedMotion

    // Gait: the legs and arms swing faster and wider when sprinting
    const targetAmp = !moving ? 0 : p.sprint ? 1.05 : 0.55
    this.amplitude = approach(this.amplitude, targetAmp, 10, delta)
    this.phase += delta * (p.sprint ? 14 : 8) * (p.back && !p.forward ? -1 : 1)
    const swing = Math.sin(this.phase) * this.amplitude

    skin.leftLeg.rotation.x = swing
    skin.rightLeg.rotation.x = -swing
    skin.leftArm.rotation.x = -swing * 0.9
    skin.rightArm.rotation.x = swing * 0.9
    const breath = reduced ? 0 : Math.sin(now / 900) * 0.03
    skin.leftArm.rotation.z = Math.PI * 0.02 + breath
    skin.rightArm.rotation.z = -Math.PI * 0.02 - breath
    skin.leftArm.rotation.y = 0
    skin.rightArm.rotation.y = 0

    // Strafing leans the body into the side step
    const targetLean = p.left && !p.right ? 0.08 : p.right && !p.left ? -0.08 : 0
    this.lean = approach(this.lean, targetLean, 8, delta)
    player.rotation.z = this.lean

    // Off the ground: lifted, legs tucked a little
    const targetLift = p.onGround ? 0 : 3.2
    this.lift = approach(this.lift, targetLift, 14, delta)
    player.position.y = this.lift
    if (!p.onGround) {
      skin.leftLeg.rotation.x += -0.25
      skin.rightLeg.rotation.x += 0.15
    }

    // Sneaking bends the body forward
    skin.body.rotation.x = p.sneak ? 0.45 : 0

    // Shield up: the left arm across the front
    if (p.shield) {
      skin.leftArm.rotation.x = -1.15
      skin.leftArm.rotation.y = 0.45
      skin.leftArm.rotation.z = 0.05
    }

    // Eating: the right hand at the mouth, chewing
    if (p.eating) {
      skin.rightArm.rotation.x = -1.25 + (reduced ? 0 : Math.sin(now / 70) * 0.08)
      skin.rightArm.rotation.y = -0.45
    }

    // Attack: a fast swing of the right arm with a twist of the body
    const sinceSwing = now - p.swingAt
    if (sinceSwing >= 0 && sinceSwing < SWING_MS && !p.eating) {
      const t = sinceSwing / SWING_MS
      const arc = Math.sin(t * Math.PI)
      skin.rightArm.rotation.x = -0.4 - arc * 1.7
      skin.rightArm.rotation.y = -arc * 0.35
      skin.body.rotation.y = arc * 0.25
    } else {
      skin.body.rotation.y = 0
    }

    // The head follows the bot's pitch (mineflayer: positive looks up)
    skin.head.rotation.x = Math.max(-1.2, Math.min(1.2, -p.pitch))
    skin.head.rotation.y = 0

    this.tint(player, now - p.hurtAt < HURT_MS)
  }

  /** Damage taken: the whole model flashes red, like Minecraft's hurt tint. */
  private tint (player: PlayerObject, hurt: boolean) {
    if (!this.materials) {
      const found = new Set<MeshStandardMaterial>()
      player.skin.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material as Material]
        for (const material of list) if ('color' in material) found.add(material as MeshStandardMaterial)
      })
      this.materials = [...found]
    }
    for (const material of this.materials) {
      if (hurt) material.color.setRGB(1, 0.42, 0.45)
      else material.color.setRGB(1, 1, 1)
    }
  }

  /** A new skin builds new materials. */
  resetMaterials () {
    this.materials = null
  }
}
