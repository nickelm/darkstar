# Darkstar - Claude Code Guide

## Project Overview

Darkstar is a voice-controlled GCI/AWACS tactical air combat game. The player acts as a strike controller, commanding simulated aircraft against hostile forces using voice commands and a tactical radar display.

**Core design principle:** The player sees the big picture but cannot fly the aircraft. Friction between commands and pilot execution creates gameplay.

## Tech Stack

- **Vanilla JS** (no React, no heavy frameworks)
- **Leaflet.js** for map display with OSM tiles
- **Canvas 2D** overlay for tracks, missiles, UI elements
- **Web Speech API** for voice recognition and synthesis
- **Vite** for build/dev server
- **GitHub Pages** for deployment

## Architecture
```
src/
├── simulation/   # Core game state, physics, combat
├── ai/           # Pilot behavior, enemy tactics, advisor
├── command/      # Parser and executor for voice/text commands
├── voice/        # Speech recognition, TTS, radio audio filters
├── ui/           # Leaflet map, command bar, panels, subtitles
├── scenario/     # JSON scenario loading, waves, victory conditions
├── data/         # Static data: aircraft stats, weapons, brevity codes
└── util/         # Math (BRAA, vectors), PID controllers, audio helpers
```

## Key Design Decisions

### Simulation
- **Coordinate system:** Lat/lon for OSM compatibility; convert to local tangent plane (meters) centered on bullseye for physics
- **Flight model:** PID controllers for heading, altitude, speed—smooth transitions, not instant snapping
- **Aircraft:** 4th-gen fighters only (F-15C, F-16C, F/A-18C, F-14D, MiG-29, Su-27)
- **Combat:** Abstracted. BVR missiles shown as tracks; merge abstracted to "furball" icon with probabilistic outcomes

### Flight AI States
```
IDLE → VECTORING → INTERCEPT → ENGAGE → DEFENSIVE → RTB → REJOINING → PATROL
```

### Commands
Voice commands are immediate. Mouse/keyboard commands have 3-second hold (cancellable).

Core vocabulary: SNAP, VECTOR, ENGAGE, BUSTER, GATE, RTB, BOGEY DOPE, PICTURE, ANGELS, WEAPONS FREE/HOLD/TIGHT, DEFENSIVE, RECOMMIT, RESUME, DISREGARD

Multi-command syntax:
- `"Viper 1-1, snap 270, break, buster"` — chain commands
- `"Correction, 280"` — disregard + new command

### Radio Audio
- Web Speech API with pitch/rate variation per pilot
- Radio filter chain: bandpass (300-3400Hz), compression, distortion, static bursts

### Time Control
- 1x (normal), 2x, 4x with auto-pause on: new contact, missile launch, merge, bingo fuel
- Voice only plays at 1x; subtitles at higher speeds

## Coding Conventions

- Simple ES6 classes, no TypeScript
- No Redux or state management libraries—use simple class properties
- Minimal dependencies (currently just Leaflet)
- Keep modules focused: one class per file
- Use JSDoc comments for public methods

## File Naming

- Classes: PascalCase (`Aircraft.js`, `CommandParser.js`)
- Data/utils: camelCase (`aircraft.js`, `math.js`)
- Scenarios: kebab-case JSON (`strait-of-hormuz.json`)

## Common Tasks

### Adding a new command
1. Add to `data/brevity.js`
2. Add parser pattern in `command/CommandParser.js`
3. Add executor method in `command/CommandExecutor.js`
4. Add to `command/Commands.js` definition

### Adding an aircraft type
1. Add performance data to `data/aircraft.js`
2. Ensure flight model constants are reasonable

### Adding a scenario
1. Create JSON in `scenarios/`
2. Define: map center, bullseye, friendly flights, enemy waves, victory conditions

## Testing Locally
```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/`

## Build for Production
```bash
npm run build
```

Output in `dist/`. Deploy to GitHub Pages.

## Reference Material

- Design document: `darkstar-design.md` (in project root or Claude Project files)
- Prior art: `riojs` by nickelm (F-14 RIO simulator)—reuse PID controller, BRAA calculation, unit conversions

## What NOT to Do

- Don't add React, Vue, or Angular
- Don't use WebGL unless Canvas performance is proven insufficient
- Don't model stealth or 5th-gen aircraft (v1 scope)
- Don't make AWACS vulnerable or moveable (v2 feature)
- Don't add multiplayer infrastructure (v2 feature)
- Don't use paid APIs (ElevenLabs, Whisper API) by default—keep as optional upgrades