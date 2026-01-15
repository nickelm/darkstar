{
  "id": "tutorial-basic",
  "name": "Tutorial: Basic Intercept",
  "description": "Learn the fundamentals of vectoring fighters to intercept a single bogey.",
  "map": {
    "center": [36.0, -120.0],
    "zoom": 8,
    "bullseye": [36.0, -120.0]
  },
  "airbases": [],
  "initialFlights": [
    {
      "callsign": "Viper 1",
      "type": "F-16C",
      "count": 2,
      "position": [36.2, -120.5],
      "heading": 90,
      "altitude": 25000,
      "speed": 350
    }
  ],
  "waves": [
    {
      "time": 0,
      "groups": [
        {
          "type": "fighter",
          "aircraft": "MiG-29",
          "count": 1,
          "spawn": [36.0, -118.5],
          "heading": 270,
          "altitude": 25000,
          "speed": 400,
          "behavior": "ingress"
        }
      ]
    }
  ],
  "victory": {
    "eliminate": "all"
  },
  "defeat": {
    "lossRatio": 1.0
  },
  "tutorial": {
    "steps": [
      { "trigger": "start", "message": "Welcome to Darkstar. You are the GCI controller." },
      { "trigger": "contact", "message": "New contact detected. Select Viper 1 and issue a SNAP command toward the bogey." }
    ]
  }
}