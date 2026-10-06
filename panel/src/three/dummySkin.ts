// A training-dummy skin drawn on a 64x64 canvas (the Minecraft skin layout), for a bot whose
// server gives it no texture: a padded practice mannequin in the panel's own tones.

const INK = '#1b1f33'
const PAD = '#5b6189'
const PAD_LIGHT = '#727aa8'
const SEAM = '#3d4264'
const PLATE = '#d9dbe6'
const TARGET = '#f2f2f2'

type Ctx = CanvasRenderingContext2D

/** Fills every face of one box in the skin layout: u,v is its corner, w,h,d its size. */
function box (ctx: Ctx, u: number, v: number, w: number, h: number, d: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(u + d, v, w * 2, d) // top and bottom
  ctx.fillRect(u, v + d, (w + d) * 2, h) // right, front, left, back
}

/** Horizontal padding seams across the sides of a box. */
function seams (ctx: Ctx, u: number, v: number, w: number, h: number, d: number, every: number) {
  ctx.fillStyle = SEAM
  for (let y = v + d + every; y < v + d + h; y += every) ctx.fillRect(u, y, (w + d) * 2, 1)
}

export function dummySkin (): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 64, 64)

  // Head: padded hood with a face plate and two slits
  box(ctx, 0, 0, 8, 8, 8, PAD)
  ctx.fillStyle = PLATE
  ctx.fillRect(9, 9, 6, 6)
  ctx.fillStyle = INK
  ctx.fillRect(10, 11, 1, 2)
  ctx.fillRect(13, 11, 1, 2)
  ctx.fillRect(11, 14, 2, 1)

  // Body: padding with a target on the chest
  box(ctx, 16, 16, 8, 12, 4, PAD_LIGHT)
  seams(ctx, 16, 16, 8, 12, 4, 4)
  ctx.fillStyle = TARGET
  ctx.fillRect(22, 22, 4, 4)
  ctx.fillStyle = PAD_LIGHT
  ctx.fillRect(23, 23, 2, 2)
  ctx.fillStyle = TARGET
  ctx.fillRect(23.5, 23.5, 1, 1)

  // Arms and legs (right at the classic spot, left in the 1.8 extra spots)
  box(ctx, 40, 16, 4, 12, 4, PAD)
  seams(ctx, 40, 16, 4, 12, 4, 3)
  box(ctx, 32, 48, 4, 12, 4, PAD)
  seams(ctx, 32, 48, 4, 12, 4, 3)
  box(ctx, 0, 16, 4, 12, 4, PAD_LIGHT)
  seams(ctx, 0, 16, 4, 12, 4, 4)
  box(ctx, 16, 48, 4, 12, 4, PAD_LIGHT)
  seams(ctx, 16, 48, 4, 12, 4, 4)

  // Boots
  ctx.fillStyle = INK
  ctx.fillRect(0, 29, 16, 3)
  ctx.fillRect(16, 61, 16, 3)
  return canvas
}
