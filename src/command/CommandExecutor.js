export class CommandExecutor {
  constructor(simulation, comms) {
    this.simulation = simulation;
    this.comms = comms;
  }

  execute(command) {}
  
  executeSnap(flight, params) {}
  executeVector(flight, params) {}
  executeBuster(flight) {}
  executeGate(flight) {}
  executeEngage(flight, params) {}
  executeWeaponsFree(flight) {}
  executeWeaponsHold(flight) {}
  executeDefensive(flight) {}
  executeRecommit(flight) {}
  executeRTB(flight) {}
  executeAngels(flight, params) {}
  executeResume(flight) {}
  executeDisregard(flight) {}
  executeScramble(airbase, params) {}
  
  // Queries (GCI provides info)
  executeBogeyDope(flight) {}
  executePicture() {}
}