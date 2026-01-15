export const AIRCRAFT = {
  'F-15C': {
    name: 'Eagle',
    side: 'blue',
    role: 'fighter',
    speed: { cruise: 450, max: 1400 },
    ceiling: 55000,
    range: 800,
    radar: { range: 100, gimbal: 60 },
    weapons: {
      fox3: { type: 'AIM-120C', count: 4 },
      fox1: { type: 'AIM-7M', count: 4 },
      fox2: { type: 'AIM-9M', count: 2 },
      gun: true
    },
    mergeRating: 0.9
  },
  'F-16C': { /* ... */ },
  'F-14D': { /* ... */ },
  'F/A-18C': { /* ... */ },
  'MiG-29': { /* ... */ },
  'Su-27': { /* ... */ },
  'Su-24': { /* ... */ },
  'MiG-21': { /* ... */ }
};