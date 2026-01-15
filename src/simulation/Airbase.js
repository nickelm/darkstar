export class Airbase {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.position = { lat: 0, lon: 0 };
    
    this.readyFlights = [];       // { flight, alertLevel, readyTime }
    this.regeneratingFlights = [];
  }

  addFlight(flightConfig, alertLevel) {}
  
  scramble(flightId) {}           // Returns Flight or null
  
  getReadyFlights() {}
  getRegeneratingFlights() {}
  
  update(delta) {}                // Tick regeneration timers
  
  receiveFlight(flight) {}        // RTB'd flight returns
}