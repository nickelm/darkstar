let mergeIdCounter = 0;

/**
 * Merge (furball) - represents a close-range dogfight between aircraft
 * When aircraft enter merge range (<5nm with high closure), they are
 * abstracted to a merge icon and resolved with probabilistic rounds
 */
export class Merge {
  constructor(config) {
    this.id = `merge_${++mergeIdCounter}`;
    this.simulation = config.simulation;

    // Participants
    this.participants = {
      blue: [],  // Friendly aircraft
      red: []    // Hostile aircraft
    };

    // Position (centroid of all participants)
    this.position = { x: 0, y: 0 };

    // Timing
    this.startTime = config.startTime || 0;
    this.lastRoundTime = 0;
    this.roundInterval = 10;  // Seconds between resolution rounds

    // State
    this.state = 'active';  // 'active', 'resolved'
    this.roundsElapsed = 0;
    this.maxRounds = 10;

    // Player modifiers (from PRESS/EXTEND commands)
    this.pressModifier = {
      blue: 0,  // Positive = more aggressive
      red: 0
    };
    this.extendModifier = {
      blue: 0,  // Positive = more likely to disengage
      red: 0
    };

    // Track kills and disengages
    this.kills = [];      // { killer, victim, time }
    this.disengages = []; // { aircraft, time }
  }

  /**
   * Add an aircraft to the merge
   */
  addParticipant(aircraft) {
    const side = aircraft.side === 'blue' ? 'blue' : 'red';

    if (!this.participants[side].includes(aircraft)) {
      this.participants[side].push(aircraft);
      aircraft.engagementPhase = 'merged';

      // Set AI state to merged (stops normal behavior)
      if (aircraft.ai) {
        aircraft.ai.state = 'MERGED';
      }
    }

    this.updatePosition();
  }

  /**
   * Remove an aircraft from the merge (killed or disengaged)
   */
  removeParticipant(aircraft) {
    const side = aircraft.side === 'blue' ? 'blue' : 'red';
    const index = this.participants[side].indexOf(aircraft);

    if (index !== -1) {
      this.participants[side].splice(index, 1);
      aircraft.engagementPhase = 'none';
    }

    this.updatePosition();
    this.checkResolved();
  }

  /**
   * Update merge position (centroid of all participants)
   */
  updatePosition() {
    const allAircraft = [...this.participants.blue, ...this.participants.red];
    if (allAircraft.length === 0) return;

    let sumX = 0, sumY = 0;
    for (const ac of allAircraft) {
      sumX += ac.position.x;
      sumY += ac.position.y;
    }

    this.position.x = sumX / allAircraft.length;
    this.position.y = sumY / allAircraft.length;
  }

  /**
   * Update the merge state
   * @param {number} delta - Time step in seconds
   */
  update(delta) {
    if (this.state === 'resolved') return;

    // Update position based on aircraft movement
    this.updatePosition();

    // Check if it's time for a resolution round
    const timeSinceLastRound = this.simulation.time - this.lastRoundTime;
    if (timeSinceLastRound >= this.roundInterval) {
      this.resolveRound();
      this.lastRoundTime = this.simulation.time;
    }
  }

  /**
   * Resolve one round of the merge
   * Each aircraft has chances to: score a kill, be killed, or disengage
   */
  resolveRound() {
    this.roundsElapsed++;

    const blueStrength = this.calculateSideStrength('blue');
    const redStrength = this.calculateSideStrength('red');
    const totalStrength = blueStrength + redStrength;

    if (totalStrength === 0) {
      this.state = 'resolved';
      return;
    }

    // Process each aircraft
    const allAircraft = [...this.participants.blue, ...this.participants.red];

    for (const aircraft of allAircraft) {
      if (!aircraft.isAlive()) continue;

      const isBlue = aircraft.side === 'blue';
      const myStrength = isBlue ? blueStrength : redStrength;
      const enemyStrength = isBlue ? redStrength : blueStrength;
      const myPress = isBlue ? this.pressModifier.blue : this.pressModifier.red;
      const myExtend = isBlue ? this.extendModifier.blue : this.extendModifier.red;

      // Calculate chances based on strength ratio
      const ratio = myStrength / totalStrength;
      const mergeRating = aircraft.performance?.mergeRating || 0.5;

      // Base chances per round
      let killChance = 0.08 * ratio * mergeRating;           // ~8% base, modified by ratio and skill
      let deathChance = 0.08 * (1 - ratio) / mergeRating;   // ~8% base, inverse
      let disengageChance = 0.12;                            // ~12% base disengage

      // Apply PRESS modifier (more kills, more deaths)
      killChance *= (1 + myPress * 0.3);
      deathChance *= (1 + myPress * 0.2);
      disengageChance *= (1 - myPress * 0.5);  // Less likely to disengage when pressing

      // Apply EXTEND modifier (fewer kills, more disengages)
      killChance *= (1 - myExtend * 0.5);
      disengageChance *= (1 + myExtend * 0.5);

      // Fuel and weapons modifiers
      if (aircraft.fuel < 30) disengageChance *= 1.5;
      if (aircraft.isWinchester()) {
        killChance *= 0.3;  // Gun only
        disengageChance *= 1.5;
      }

      // Roll for outcome
      const roll = Math.random();

      if (roll < killChance) {
        // Score a kill
        const victim = this.selectVictim(aircraft);
        if (victim) {
          this.scoreKill(aircraft, victim);
        }
      } else if (roll < killChance + deathChance) {
        // This aircraft is killed
        const killer = this.selectKiller(aircraft);
        if (killer) {
          this.scoreKill(killer, aircraft);
        }
      } else if (roll < killChance + deathChance + disengageChance) {
        // Aircraft disengages
        this.handleDisengage(aircraft);
      }
    }

    // Clean up dead aircraft from participants
    this.participants.blue = this.participants.blue.filter(ac => ac.isAlive());
    this.participants.red = this.participants.red.filter(ac => ac.isAlive());

    this.checkResolved();
  }

  /**
   * Calculate combined strength of one side
   */
  calculateSideStrength(side) {
    return this.participants[side].reduce((sum, ac) => {
      if (!ac.isAlive()) return sum;

      let strength = ac.performance?.mergeRating || 0.5;

      // Fuel affects performance
      strength *= Math.max(0.5, ac.fuel / 100);

      // Winchester reduces effectiveness significantly
      if (ac.isWinchester()) strength *= 0.5;

      return sum + strength;
    }, 0);
  }

  /**
   * Select a victim for a kill (random enemy aircraft)
   */
  selectVictim(killer) {
    const enemySide = killer.side === 'blue' ? 'red' : 'blue';
    const enemies = this.participants[enemySide].filter(ac => ac.isAlive());

    if (enemies.length === 0) return null;

    // Random selection weighted by inverse merge rating (worse pilots more likely to die)
    const weights = enemies.map(ac => 1 / (ac.performance?.mergeRating || 0.5));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * totalWeight;

    for (let i = 0; i < enemies.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return enemies[i];
    }

    return enemies[enemies.length - 1];
  }

  /**
   * Select a killer for a death (random enemy aircraft)
   */
  selectKiller(victim) {
    const enemySide = victim.side === 'blue' ? 'red' : 'blue';
    const enemies = this.participants[enemySide].filter(ac => ac.isAlive());

    if (enemies.length === 0) return null;

    // Random selection weighted by merge rating (better pilots more likely to score)
    const weights = enemies.map(ac => ac.performance?.mergeRating || 0.5);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * totalWeight;

    for (let i = 0; i < enemies.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return enemies[i];
    }

    return enemies[enemies.length - 1];
  }

  /**
   * Process a kill
   */
  scoreKill(killer, victim) {
    // Mark victim as dead
    victim.fuel = 0;

    // Record the kill
    this.kills.push({
      killer,
      victim,
      time: this.simulation.time
    });

    // Remove victim from participants
    this.removeParticipant(victim);

    // Emit event
    this.simulation.events.emit('merge:kill', {
      merge: this,
      killer,
      victim
    });

    console.log(`MERGE KILL: ${killer.callsign} killed ${victim.callsign}`);
  }

  /**
   * Handle aircraft disengaging from merge
   */
  handleDisengage(aircraft) {
    // Record the disengage
    this.disengages.push({
      aircraft,
      time: this.simulation.time
    });

    // Remove from participants
    this.removeParticipant(aircraft);

    // Reset AI state
    if (aircraft.ai) {
      if (aircraft.side === 'blue') {
        // Friendly aircraft returns to idle/RTB
        aircraft.ai.state = 'IDLE';
        aircraft.aiState = 'idle';
      } else {
        // Enemy aircraft egresses
        aircraft.ai.state = 'EGRESS';
        aircraft.aiState = 'egress';
      }
    }

    // Emit event
    this.simulation.events.emit('merge:disengage', {
      merge: this,
      aircraft
    });

    console.log(`MERGE DISENGAGE: ${aircraft.callsign}`);
  }

  /**
   * Check if merge should be resolved
   */
  checkResolved() {
    // Merge ends when one side has no aircraft or max rounds reached
    if (this.participants.blue.length === 0 ||
        this.participants.red.length === 0 ||
        this.roundsElapsed >= this.maxRounds) {

      this.state = 'resolved';

      // Determine outcome
      let outcome = 'stalemate';
      if (this.participants.blue.length === 0 && this.participants.red.length > 0) {
        outcome = 'red_victory';
      } else if (this.participants.red.length === 0 && this.participants.blue.length > 0) {
        outcome = 'blue_victory';
      }

      // Reset remaining participants to normal state
      for (const ac of [...this.participants.blue, ...this.participants.red]) {
        ac.engagementPhase = 'none';
        if (ac.ai) {
          if (ac.side === 'blue') {
            ac.ai.state = 'IDLE';
            ac.aiState = 'idle';
          } else {
            ac.ai.state = 'EGRESS';
            ac.aiState = 'egress';
          }
        }
      }

      // Emit resolved event
      this.simulation.events.emit('merge:resolved', {
        merge: this,
        outcome,
        kills: this.kills,
        disengages: this.disengages
      });

      console.log(`MERGE RESOLVED: ${outcome}`);
    }
  }

  /**
   * Apply PRESS modifier (for player command)
   */
  applyPress(side) {
    this.pressModifier[side] = Math.min(1, this.pressModifier[side] + 0.5);
    this.extendModifier[side] = 0;  // Cancel any extend
  }

  /**
   * Apply EXTEND modifier (for player command)
   */
  applyExtend(side) {
    this.extendModifier[side] = Math.min(1, this.extendModifier[side] + 0.5);
    this.pressModifier[side] = 0;  // Cancel any press
  }

  /**
   * Get all participants
   */
  getAllParticipants() {
    return [...this.participants.blue, ...this.participants.red];
  }

  /**
   * Check if an aircraft is in this merge
   */
  hasParticipant(aircraft) {
    return this.participants.blue.includes(aircraft) ||
           this.participants.red.includes(aircraft);
  }
}
