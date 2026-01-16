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
  'R-77': {
    name: 'Adder',
    category: 'fox3',
    range: { min: 2, max: 40 },
    speed: 2300,
    duration: 55,
    pk: { base: 0.65, active: 8 }
  },
  'R-27R': {
    name: 'Alamo-A',
    category: 'fox1',
    range: { min: 3, max: 30 },
    speed: 2000,
    duration: 45,
    pk: { base: 0.55 },
    needsIllumination: true
  },
  'R-73': {
    name: 'Archer',
    category: 'fox2',
    range: { min: 0.3, max: 12 },
    speed: 1600,
    duration: 25,
    pk: { base: 0.7 }
  },
  'AIM-54C': {
    name: 'Phoenix',
    category: 'fox3',
    range: { min: 5, max: 100 },
    speed: 3000,
    duration: 80,
    pk: { base: 0.6, active: 15 }
  }
};