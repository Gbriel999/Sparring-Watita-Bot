'use strict'

// Deterministic pseudo-random numbers for the duel simulator (mulberry32).
// Nothing in sim/ may touch Math.random or Date.now: a seed fully decides a run.

/** Returns a function that yields numbers in [0, 1); the same seed gives the same sequence. */
function seeded (seed) {
  let state = seed >>> 0
  return function next () {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Mixes a seed with a salt (murmur3 finalizer) so two streams built from the same user seed are
 * unrelated: mulberry32 streams of nearby seeds would otherwise be shifted copies of each other.
 */
function deriveSeed (seed, salt) {
  let h = ((seed >>> 0) ^ Math.imul(salt >>> 0, 0x9E3779B1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return (h ^ (h >>> 16)) >>> 0
}

module.exports = { seeded, deriveSeed }
