# Amaze

Play it: **https://fxsocy.github.io/play-amaze/**

A pseudorandom maze game. Solve a new maze whenever you like, or take on the **daily maze** — the
same maze for everyone, seeded from the date, rolling over at your local midnight — and the
**Daily Doozie**, a much larger foggy
maze that unlocks once you've solved the day's standard one. Its fog hides the exit, so the Doozie
flashes the exit for three seconds when you start, to point you in roughly the right direction.
Only your first attempt each day is scored (time × moves, lower is better), and the score copies to
your clipboard as shareable text, with a link so whoever you send it to can play the same maze.

There are three dailies and a mode of your own: the **Daily**, the **Doozie** (hard mode, unlocked by
solving the Daily), the **Arcade** — a smaller maze strewn with portals, keys, locked gates, one-way
doors and ? boxes that spin for a prize or a punishment — and **Custom**, your own size, algorithm, fog, hints — and Arcade features, if you want portals in
a maze of your own.
Pick one in the header; everything else is behind **Menu**.

A daily maze stays hidden until you press **Start** (or Enter / Space), which starts the clock.
Arrow keys, WASD or vim keys (HJKL) move. Drag from the dot to trace a route; clicking walks back
over cells you've already visited, so the mouse can backtrack but can't solve the maze for you.
`F` fits the maze to the window, `T` toggles breadcrumbs, `G` gives up, `N` starts a new maze, `R`
retries the same one, `B` shows best times, `P` opens Appearance and `Esc` opens Settings.

On a phone or tablet: drag anywhere to steer, tap a cell to walk back over ground you've covered,
use two fingers to pan and pinch to zoom. Prefer buttons? Turn on the direction pad from the menu or
from Appearance. You can add it to your home screen.

Progress (best times, daily results, theme) is stored in your browser's local storage, so it stays
on the device you play on and a private window starts fresh.

## This repository

This is the **web release** of Amaze, published from a private repository where the game is
developed as an Electron desktop app. The two share `src/core` (maze generation, solving, scoring,
settings) and `src/renderer` (the React UI and canvas); the difference is only how they store
progress — files on disk in the desktop app, local storage here.

- `src/` — the game's source, as released.
- `docs/` — the built static site that GitHub Pages serves.
- `release.json` — the version and source commit each release was built from.

Releases are pushed here as complete snapshots, so history on this repo is one commit per release
rather than per change.

## Building it yourself

```bash
yarn install
yarn dev        # dev server
yarn test       # unit tests for the core game logic
yarn typecheck
yarn build      # typecheck + build the site into docs/
```

Requires Node 22.12 or newer.
