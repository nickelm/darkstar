export class Flight {
  constructor(config) {
    this.id = config.id;
    this.callsign = config.callsign;   // 'Viper 1'
    this.aircraft = [];                 // Aircraft in this flight
    this.lead = null;
    
    this.assignedPatrol = null;
    this.homeBase = null;
    
    this.commandHistory = [];
  }

  addAircraft(aircraft) {}
  removeAircraft(aircraft) {}
  
  getLead() {}
  getMembers() {}
  
  isAlive() {}           // At least one aircraft alive
  getAveragePosition() {}
  getAverageFuel() {}
  
  assignPatrol(pattern) {}
  clearPatrol() {}
  
  addCommand(command) {}
  getCurrentCommand() {}
}