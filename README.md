# Darkstar

A voice-controlled GCI/AWACS tactical air combat game.

## Concept

You are a strike controller aboard an AWACS, commanding simulated aircraft against hostile forces using voice commands. You see the radar picture and make tactical calls, but you cannot fly the aircraft yourself. Pilots respond to your commands—or fail to.

**Target audience:** DCS players, semi-milsim enthusiasts.

## Features (Planned)

- Voice commands using standard brevity codes (SNAP, VECTOR, ENGAGE, RTB, etc.)
- Real-world maps via OpenStreetMap
- 4th-generation fighters (F-15C, F-16C, F/A-18C, MiG-29, Su-27)
- BVR and merge combat with abstracted missile modeling
- Multiple scenario types: point defense, attrition, sweep, survival
- Time acceleration with auto-pause on contact

## Tech Stack

- **Display:** Leaflet + Canvas overlay
- **Voice:** Web Speech API (recognition and synthesis)
- **Build:** Vite
- **Deploy:** GitHub Pages

## Getting Started
```bash
npm install
npm run dev
```

## Project Structure
```
src/
├── simulation/   # Aircraft, missiles, combat resolution
├── ai/           # Pilot and enemy behavior
├── command/      # Voice/text parsing and execution
├── voice/        # Speech I/O and radio filters
├── ui/           # Map, command bar, comms log
├── scenario/     # Mission loading and victory conditions
├── data/         # Aircraft stats, weapons, brevity codes
└── util/         # Math, PID controllers, audio helpers
```

## Status

Early development. Skeleton in place.

## License

MIT