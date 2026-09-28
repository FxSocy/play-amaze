/**
 * Portal mode: several mazes, each cut into walled-off sections, joined only by
 * portals.
 *
 * All the mazes of a game live side by side in one wide grid, and the walls
 * between them are never carved. That keeps a cell a single number everywhere:
 * the route planner, keys and gates, the trail and the session all work on the
 * whole world at once, and only the renderer needs to know that the player sees
 * one maze at a time. Maze `k` is the columns `[k * paneWidth, (k + 1) * paneWidth)`.
 *
 * How a world is built:
 *
 * 1. Each maze is carved as an ordinary perfect maze, then **cut into sections**
 *    by walling up a few of its passages. A section is a real stretch of the
 *    maze; there is just no walking from one section to another.
 * 2. The sections are joined by **portal pairs**, always between two different
 *    mazes. A randomly chosen **chain** of sections runs from the start (in
 *    maze 1) to the exit (in the last maze), switching maze at every link, so
 *    the way through bounces between mazes — 1 → 2 → 1 → 2, or 1 → 3 → 2 → 4.
 * 3. The sections left off the chain hang off it as **side branches**: dead-end
 *    sections that hold keys and boxes but lead nowhere. A few **extra links**
 *    make loops, but only where they do not shorten the chain, so there is no
 *    shortcut to the exit.
 * 4. Keys, gates, one-way doors and boxes go on top (`placeFeatures`), and the
 *    whole world is checked to be finishable from anywhere the player can reach.
 *
 * Like `daily.ts`, this decides what a seed means: changing it changes past
 * Portal mazes for every player. Treat the numbers as frozen.
 */

import {
  emptyFeatures,
  isEscapable,
  placeFeatures,
  planRoute,
  EMPTY_RUN_STATE,
  type FeatureSpec,
  type MazeFeatures
} from './arcade'
import { generateMaze, type AlgorithmId } from './generators'
import { cellCount, createGrid, DIRECTIONS, neighbor, openNeighbors, type Direction, type Maze } from './maze'
import { createRng, type Rng } from './rng'

/** How many mazes a Portal game links; 0 in settings means a plain maze. */
export type PortalCount = 2 | 3 | 4
export const PORTAL_COUNTS: readonly PortalCount[] = [2, 3, 4]

/** The shape of a Portal game: how many mazes, how big, and what is on them. */
export interface PortalLayout extends FeatureSpec {
  panes: PortalCount
  paneWidth: number
  paneHeight: number
  /** Walled-off sections each maze is cut into. */
  sections: number
  /** Portal pairs added beyond the chain and its branches, as loops. */
  extraLinks: number
}

/**
 * The more mazes, the smaller each one, so a four-maze game is not four times
 * the walk of a two-maze one. The two-maze layout is the Daily Portal's.
 */
export const PORTAL_LAYOUTS: Record<PortalCount, PortalLayout> = {
  2: { panes: 2, paneWidth: 34, paneHeight: 22, sections: 3, gates: 3, oneWays: 4, boxes: 5, extraLinks: 1 },
  3: { panes: 3, paneWidth: 28, paneHeight: 18, sections: 3, gates: 3, oneWays: 5, boxes: 6, extraLinks: 2 },
  4: { panes: 4, paneWidth: 24, paneHeight: 16, sections: 3, gates: 3, oneWays: 6, boxes: 6, extraLinks: 2 }
}

/** Which maze of the game `cell` is in, from 0. */
export function paneOf(layout: PortalLayout, cell: number): number {
  return Math.floor((cell % (layout.panes * layout.paneWidth)) / layout.paneWidth)
}

/** A section is never smaller than this share of an even split of its maze. */
const MIN_SECTION_SHARE = 0.6
/** Portals in the same section keep at least this many steps apart. */
const MIN_PORTAL_GAP = 6
/** Layouts are retried with a salted seed when one cannot be built. */
const MAX_ATTEMPTS = 40

export interface PortalWorld {
  maze: Maze
  features: MazeFeatures
}

/**
 * Builds the linked mazes for `seed`. Deterministic: the same seed, algorithm
 * and layout always produce the same world.
 */
export function generatePortalWorld(seed: string, algorithm: AlgorithmId, layout: PortalLayout): PortalWorld {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const world = tryWorld(attempt === 0 ? seed : `${seed}#${attempt}`, algorithm, layout)
    if (world) return world
  }
  throw new Error(`Could not build a Portal world for ${seed}`)
}

interface Section {
  pane: number
  cells: number[]
}

function tryWorld(seed: string, algorithm: AlgorithmId, layout: PortalLayout): PortalWorld | null {
  const { panes, paneWidth: w, paneHeight: h } = layout
  const width = panes * w
  const maze = createGrid(width, h)
  for (let k = 0; k < panes; k++) {
    const sub = generateMaze({ width: w, height: h, algorithm, seed: `${seed}:maze${k + 1}` })
    const toWorld = (cell: number): number => Math.floor(cell / w) * width + k * w + (cell % w)
    for (let cell = 0; cell < w * h; cell++) maze.walls[toWorld(cell)] = sub.walls[cell]
    if (k === 0) maze.start = toWorld(sub.start)
    if (k === panes - 1) maze.end = toWorld(sub.end)
  }

  const rng = createRng(`${seed}:portal`)
  for (let k = 0; k < panes; k++) {
    if (!cutPane(maze, layout, k, rng)) return null
  }

  const { sections, sectionOf } = labelSections(maze, layout)
  const from = sectionOf[maze.start]
  const to = sectionOf[maze.end]

  const links = linkSections(sections, from, to, layout, rng)
  if (!links) return null

  const features = emptyFeatures(maze)
  const taken = new Uint8Array(cellCount(maze))
  taken[maze.start] = 1
  taken[maze.end] = 1
  const anchors: number[][] = sections.map(() => [])
  anchors[from].push(maze.start)
  anchors[to].push(maze.end)

  for (const link of links) {
    const a = pickPortalCell(maze, sections[link.a], anchors[link.a], taken, link.far === 'a' || link.far === 'both', rng)
    const b = pickPortalCell(maze, sections[link.b], anchors[link.b], taken, link.far === 'b' || link.far === 'both', rng)
    if (a < 0 || b < 0) return null
    for (const [cell, section] of [
      [a, link.a],
      [b, link.b]
    ]) {
      taken[cell] = 1
      anchors[section].push(cell)
    }
    features.portals[a] = b
    features.portals[b] = a
    features.portalPairs.push([a, b])
  }

  placeFeatures(maze, features, taken, layout, rng)

  // Anything short of the full layout, or a world that can strand a player, is
  // thrown away and built again from a salted seed.
  if (features.gateCells.length !== layout.gates || features.keyCells.length !== layout.gates) return null
  if (features.boxCells.length !== layout.boxes) return null
  if (!planRoute(maze, features, EMPTY_RUN_STATE, maze.start, maze.end)) return null
  if (!isEscapable(maze, features)) return null
  return { maze, features }
}

/** Puts back the wall between `cell` and its neighbour in `dir`. */
function wallUp(maze: Maze, cell: number, dir: Direction): void {
  const other = neighbor(maze, cell, dir)
  maze.walls[cell] |= DIRECTIONS[dir].wall
  maze.walls[other] |= DIRECTIONS[DIRECTIONS[dir].opposite].wall
}

/** Cells of maze `k`, in reading order. */
function paneCells(maze: Maze, layout: PortalLayout, k: number): number[] {
  const cells: number[] = []
  for (let y = 0; y < layout.paneHeight; y++) {
    for (let x = 0; x < layout.paneWidth; x++) cells.push(y * maze.width + k * layout.paneWidth + x)
  }
  return cells
}

/** Flood-fills from `cell` along open passages; walls between mazes keep it in one. */
function flood(maze: Maze, cell: number, label: Int32Array, value: number): number[] {
  const cells = [cell]
  label[cell] = value
  for (let i = 0; i < cells.length; i++) {
    for (const next of openNeighbors(maze, cells[i])) {
      if (label[next] !== -1) continue
      label[next] = value
      cells.push(next)
    }
  }
  return cells
}

/**
 * Cuts maze `k` into `layout.sections` pieces by walling up passages.
 *
 * A perfect maze is a tree, so every passage walled up splits one piece into
 * two. A cut is only kept if no piece ends up too small to be worth a portal
 * trip; the start and exit get no say, so where they land is up to the seed.
 */
function cutPane(maze: Maze, layout: PortalLayout, k: number, rng: Rng): boolean {
  const cells = paneCells(maze, layout, k)
  const minSize = Math.floor((cells.length / layout.sections) * MIN_SECTION_SHARE)
  const passages: [number, Direction][] = []
  for (const cell of cells) {
    for (const dir of ['right', 'down'] as const) {
      const other = neighbor(maze, cell, dir)
      if (other >= 0 && openNeighbors(maze, cell).includes(other)) passages.push([cell, dir])
    }
  }
  rng.shuffle(passages)

  let pieces = 1
  const label = new Int32Array(cellCount(maze))
  for (const [cell, dir] of passages) {
    if (pieces >= layout.sections) break
    wallUp(maze, cell, dir)
    label.fill(-1)
    const small =
      flood(maze, cell, label, 0).length < minSize || flood(maze, neighbor(maze, cell, dir), label, 1).length < minSize
    if (small) {
      // Undo: carve the passage back open.
      maze.walls[cell] &= ~DIRECTIONS[dir].wall
      maze.walls[neighbor(maze, cell, dir)] &= ~DIRECTIONS[DIRECTIONS[dir].opposite].wall
      continue
    }
    pieces++
  }
  return pieces === layout.sections
}

function labelSections(maze: Maze, layout: PortalLayout): { sections: Section[]; sectionOf: Int32Array } {
  const sectionOf = new Int32Array(cellCount(maze)).fill(-1)
  const sections: Section[] = []
  for (let k = 0; k < layout.panes; k++) {
    for (const cell of paneCells(maze, layout, k)) {
      if (sectionOf[cell] !== -1) continue
      sections.push({ pane: k, cells: flood(maze, cell, sectionOf, sections.length) })
    }
  }
  return { sections, sectionOf }
}

interface Link {
  a: number
  b: number
  /**
   * Which end should sit far from what is already in its section: on the chain,
   * the way out of a section is placed far from the way in, so every section on
   * the route is a real walk rather than a step between two portals.
   */
  far: 'a' | 'b' | 'both' | 'none'
}

/**
 * Decides which sections the portals join: a chain from the start's section to
 * the exit's, side branches for the sections left over, and loops that never
 * make the chain shorter.
 */
function linkSections(sections: Section[], from: number, to: number, layout: PortalLayout, rng: Rng): Link[] | null {
  const count = sections.length
  const branches = Math.max(1, Math.round(count / 5))
  let chain: number[] | null = null
  for (let length = count - branches; length >= 4 && !chain; length--) {
    chain = findChain(sections, from, to, length, layout.panes, rng)
  }
  if (!chain) return null

  const links: Link[] = []
  const adjacent: Set<number>[] = sections.map(() => new Set())
  const join = (a: number, b: number, far: Link['far']): void => {
    links.push({ a, b, far })
    adjacent[a].add(b)
    adjacent[b].add(a)
  }
  for (let i = 0; i + 1 < chain.length; i++) {
    // The exit's section is entered far from the exit, like every other one.
    join(chain[i], chain[i + 1], chain[i + 1] === to ? 'both' : 'a')
  }

  const onChain = new Set(chain)
  for (let section = 0; section < count; section++) {
    if (onChain.has(section)) continue
    // Never off the exit's section: a branch there would be a detour after
    // the finish line.
    const hosts = chain.filter((c) => c !== to && sections[c].pane !== sections[section].pane)
    if (hosts.length === 0) return null
    join(rng.pick(hosts), section, 'none')
  }

  const hops = chain.length - 1
  for (let tries = 0, added = 0; added < layout.extraLinks && tries < 60; tries++) {
    const a = rng.int(count)
    const b = rng.int(count)
    if (sections[a].pane === sections[b].pane || adjacent[a].has(b)) continue
    adjacent[a].add(b)
    adjacent[b].add(a)
    if (distance(adjacent, from, to) < hops) {
      adjacent[a].delete(b)
      adjacent[b].delete(a)
      continue
    }
    links.push({ a, b, far: 'none' })
    added++
  }
  return links
}

/**
 * A chain of `length` distinct sections from `from` to `to`, changing maze at
 * every step and visiting every maze at least once, or null. Sections are few,
 * so a randomised depth-first search is plenty.
 */
function findChain(
  sections: Section[],
  from: number,
  to: number,
  length: number,
  panes: number,
  rng: Rng
): number[] | null {
  const path = [from]
  const used = new Set(path)
  let budget = 20000
  const search = (): boolean => {
    if (--budget < 0) return false
    const last = path[path.length - 1]
    if (path.length === length) {
      return last === to && new Set(path.map((s) => sections[s].pane)).size === panes
    }
    const options = rng.shuffle(sections.map((_, i) => i)).filter((s) => {
      if (used.has(s) || sections[s].pane === sections[last].pane) return false
      // The exit's section only ever comes last.
      return s !== to || path.length === length - 1
    })
    for (const next of options) {
      path.push(next)
      used.add(next)
      if (search()) return true
      path.pop()
      used.delete(next)
    }
    return false
  }
  return search() ? path : null
}

/** Fewest portal trips from section `from` to section `to`. */
function distance(adjacent: Set<number>[], from: number, to: number): number {
  const dist = new Map([[from, 0]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacent[queue[i]]) {
      if (dist.has(next)) continue
      dist.set(next, dist.get(queue[i])! + 1)
      queue.push(next)
    }
  }
  return dist.get(to) ?? Infinity
}

/**
 * Where in `section` a portal goes. Dead ends are preferred — a portal at the
 * end of a branch is somewhere you choose to go, while one in a corridor
 * swallows anyone walking past — and every portal keeps its distance from what
 * is already in the section.
 */
function pickPortalCell(
  maze: Maze,
  section: Section,
  anchors: number[],
  taken: Uint8Array,
  far: boolean,
  rng: Rng
): number {
  const dist = new Map<number, number>()
  const queue = [...anchors]
  for (const cell of anchors) dist.set(cell, 0)
  for (let i = 0; i < queue.length; i++) {
    for (const next of openNeighbors(maze, queue[i])) {
      if (dist.has(next)) continue
      dist.set(next, dist.get(queue[i])! + 1)
      queue.push(next)
    }
  }
  const free = section.cells.filter((cell) => !taken[cell])
  if (free.length === 0) return -1
  // With nothing in the section yet, everywhere is equally far.
  const away = (cell: number): number => (anchors.length === 0 ? Infinity : (dist.get(cell) ?? Infinity))
  const farthest = Math.max(...free.map(away))
  const threshold = far ? farthest * 0.7 : Math.min(MIN_PORTAL_GAP, farthest)
  const pool = free.filter((cell) => away(cell) >= threshold)
  const deadEnds = pool.filter((cell) => openNeighbors(maze, cell).length === 1)
  return rng.pick(deadEnds.length > 0 ? deadEnds : pool)
}
