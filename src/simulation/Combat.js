export class Combat {
  constructor(simulation) {
    this.simulation = simulation;
    this.activeMerges = [];
  }

  update(delta) {}
  
  checkForMerges() {}              // Detect new merges
  resolveMergeRound(merge) {}      // Roll for kills/disengages
  
  launchMissile(shooter, target, weaponType) {}
  updateMissiles(delta) {}
  
  calculatePk(missile, target, engagement) {}
  
  checkNotching(target, missile) {}
  
  getThreatsTo(aircraft) {}        // Missiles inbound to this aircraft
}