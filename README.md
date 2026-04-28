# W — Command Center

Desktop-native habit enforcement system. Tauri v2 shell with Firebase backbone, embedded Windows desktop widget, and Rust-native window management.

## Documentation

| File | Purpose |
|---|---|
| [`DESIGN.md`](./DESIGN.md) | Technical source of truth — architecture, design tokens, feature specs |
| [`agent.md`](./agent.md) | AI agent handoff document — current state, file map, build history |
| [`task.md`](./task.md) | Full 18-batch build task list (320 tasks, all complete) |

## Quick Start

```bash
npm install
npm run tauri dev     # Full native (widget, alarms, sticky notes)
npx vite dev          # Browser-only (no Tauri features)
```

## Stack

Tauri v2 (Rust) · React 18 (TypeScript) · Vite · Firebase · Departure Mono · Vanilla CSS
