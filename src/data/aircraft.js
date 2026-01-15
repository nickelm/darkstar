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
  'F-16C': {
    name: 'Viper',
    side: 'blue',
    role: 'fighter',
    speed: { cruise: 450, max: 1200 },
    ceiling: 50000,
    range: 500,
    radar: { range: 80, gimbal: 60 },
    weapons: {
      fox3: { type: 'AIM-120C', count: 4 },
      fox2: { type: 'AIM-9M', count: 2 },
      gun: true
    },
    mergeRating: 0.85
  },
  'F-14D': {
    name: 'Tomcat',
    side: 'blue',
    role: 'fighter',
    speed: { cruise: 400, max: 1300 },
    ceiling: 53000,
    range: 700,
    radar: { range: 120, gimbal: 70 },
    weapons: {
      fox3: { type: 'AIM-54C', count: 4 },
      fox1: { type: 'AIM-7M', count: 2 },
      fox2: { type: 'AIM-9M', count: 2 },
      gun: true
    },
    mergeRating: 0.8
  },
  'F/A-18C': {
    name: 'Hornet',
    side: 'blue',
    role: 'fighter',
    speed: { cruise: 400, max: 1050 },
    ceiling: 50000,
    range: 450,
    radar: { range: 70, gimbal: 60 },
    weapons: {
      fox3: { type: 'AIM-120C', count: 2 },
      fox1: { type: 'AIM-7M', count: 2 },
      fox2: { type: 'AIM-9M', count: 2 },
      gun: true
    },
    mergeRating: 0.85
  },
  'MiG-29': {
    name: 'Fulcrum',
    side: 'red',
    role: 'fighter',
    speed: { cruise: 400, max: 1300 },
    ceiling: 55000,
    range: 400,
    radar: { range: 50, gimbal: 50 },
    weapons: {
      fox3: { type: 'R-77', count: 2 },
      fox1: { type: 'R-27R', count: 2 },
      fox2: { type: 'R-73', count: 2 },
      gun: true
    },
    mergeRating: 0.85
  },
  'Su-27': {
    name: 'Flanker',
    side: 'red',
    role: 'fighter',
    speed: { cruise: 450, max: 1350 },
    ceiling: 58000,
    range: 800,
    radar: { range: 80, gimbal: 60 },
    weapons: {
      fox3: { type: 'R-77', count: 4 },
      fox1: { type: 'R-27R', count: 4 },
      fox2: { type: 'R-73', count: 2 },
      gun: true
    },
    mergeRating: 0.9
  },
  'Su-24': {
    name: 'Fencer',
    side: 'red',
    role: 'strike',
    speed: { cruise: 400, max: 1100 },
    ceiling: 35000,
    range: 600,
    radar: { range: 40, gimbal: 30 },
    weapons: {
      fox2: { type: 'R-73', count: 2 },
      gun: true
    },
    mergeRating: 0.4
  },
  'MiG-21': {
    name: 'Fishbed',
    side: 'red',
    role: 'fighter',
    speed: { cruise: 350, max: 1100 },
    ceiling: 50000,
    range: 300,
    radar: { range: 20, gimbal: 30 },
    weapons: {
      fox2: { type: 'R-73', count: 2 },
      gun: true
    },
    mergeRating: 0.6
  }
};