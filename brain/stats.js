'use strict'

// Small statistics shared by the learning models (brain/opponent.js, brain/inputs.js). Sample counts are plain
// integer counters; the arrays only keep the latest MAX_SAMPLES values for the medians, so confidence and the
// minimums keep working after a halved reload (fromJSON as a prior).

// Latest values kept per array
const MAX_SAMPLES = 60
// confidence = min(1, samples / (CONFIDENCE_FACTOR * minimum))
const CONFIDENCE_FACTOR = 5

function isNum (v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function pushBounded (arr, value) {
  arr.push(value)
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES)
}

function clamp (v, min, max) {
  return Math.min(max, Math.max(min, v))
}

// Median: sorted[floor(n / 2)] (upper middle for even n); null when empty.
function median (values) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// 90th percentile: sorted[min(n - 1, floor(0.9 * n))]; null when empty.
function p90 (values) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))]
}

// Ratio of two counters, capped at 1 in case a hand-edited file holds inconsistent counters.
function rate (part, total) {
  return Math.min(1, part / total)
}

function confidence (samples, minimum) {
  return Math.min(1, samples / (CONFIDENCE_FACTOR * minimum))
}

// --- JSON sanitizers (the memory file may be edited by hand or corrupted) ---

// Half of n with Math.floor. A trait that had reached its minimum sample count keeps at least that
// minimum, so a prior that was valid stays valid after the reload (minKeep 0 = plain halving).
// prior false keeps n whole (a read-only look at the remembered model).
function halve (n, minKeep = 0, prior = true) {
  if (!prior) return n
  const half = Math.floor(n / 2)
  return n >= minKeep ? Math.max(half, minKeep) : half
}

// Latest numbers of a saved array (only its most recent half, see halve).
function readArray (value, minKeep = 0, prior = true) {
  if (!Array.isArray(value)) return []
  const nums = value.filter(isNum).slice(-MAX_SAMPLES)
  return nums.slice(nums.length - halve(nums.length, minKeep, prior))
}

// Non-negative integer from the file, or 0.
function readInt (value) {
  return isNum(value) && value > 0 ? Math.floor(value) : 0
}

// Part of a halved total (crits of hitsTaken...): halved the same way, so the rate survives.
function halvePart (part, total, newTotal) {
  if (total <= 0) return 0
  const scaled = newTotal === Math.floor(total / 2) ? Math.floor(part / 2) : Math.floor(part * newTotal / total)
  return Math.min(newTotal, scaled)
}

module.exports = { MAX_SAMPLES, CONFIDENCE_FACTOR, isNum, pushBounded, clamp, median, p90, rate, confidence, halve, readArray, readInt, halvePart }
