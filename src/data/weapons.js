export const WEAPONS = {
  'AIM-120C': {
    name: 'AMRAAM',
    category: 'fox3',
    range: { min: 2, max: 45 },
    speed: 2500,
    duration: 60,
    pk: { base: 0.7, active: 10 }   // Goes active at 10nm
  },
  'AIM-7M': {
    name: 'Sparrow',
    category: 'fox1',
    range: { min: 3, max: 35 },
    speed: 2200,
    duration: 50,
    pk: { base: 0.6 },
    needsIllumination: true
  },
  'AIM-9M': {
    name: 'Sidewinder',
    category: 'fox2',
    range: { min: 0.5, max: 10 },
    speed: 1800,
    duration: 30,
    pk: { base: 0.65 }
  },
  'R-77': { /* ... */ },
  'R-27R': { /* ... */ },
  'R-73': { /* ... */ }
};