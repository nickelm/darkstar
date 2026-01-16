import { CommunicationEvent, COMM_EVENT_TYPES } from './CommunicationEvent.js';
import { BVR_STATES } from '../simulation/Aircraft.js';
import { m2nm } from '../util/math.js';

/**
 * FlightCoordinator - Manages flight-level BVR coordination
 *
 * Responsibilities:
 * - Track flight's overall engagement state
 * - Coordinate target sorting across members
 * - Generate CommunicationEvents (prompts to player)
 * - Handle WEAPONS TIGHT authorization requests
 */
export class FlightCoordinator {
  constructor(flight, simulation) {
    this.flight = flight;
    this.simulation = simulation;

    // Flight-level engagement tracking
    this.detectedContacts = new Map();  // contactId -> { aircraft, firstDetected, reported }
    this.pendingRequests = [];          // Queued communication events

    // Request cooldowns (prevent spam)
    this.lastContactReport = 0;
    this.lastDeclareRequest = 0;
    this.lastCommitRequest = 0;
    this.contactReportCooldown = 10;    // seconds
    this.declareRequestCooldown = 30;   // seconds
    this.commitRequestCooldown = 20;    // seconds

    // Sorting state
    this.sortingComplete = false;
    this.lastSortTime = 0;

    // Detection parameters
    this.detectionRange = 92600;  // 50nm in meters
  }

  /**
   * Update coordinator state
   * @param {number} delta - Time delta in seconds
   */
  update(delta) {
    // Scan for new contacts
    this.detectContacts();

    // Handle sorting if needed
    this.updateSorting();

    // Process pending communication requests
    this.processPendingRequests();
  }

  /**
   * Detect hostile contacts in range
   */
  detectContacts() {
    const now = this.simulation.time;
    const flightPos = this.flight.getAveragePosition();

    for (const hostileFlight of this.simulation.hostiles) {
      for (const hostile of hostileFlight.aircraft) {
        if (!hostile.isAlive()) continue;

        // Check range
        const dx = hostile.position.x - flightPos.x;
        const dy = hostile.position.y - flightPos.y;
        const range = Math.sqrt(dx * dx + dy * dy);

        if (range > this.detectionRange) continue;

        // Check if already tracked
        if (!this.detectedContacts.has(hostile.id)) {
          this.detectedContacts.set(hostile.id, {
            aircraft: hostile,
            firstDetected: now,
            reported: false,
            range: range
          });

          // Transition flight members from PATROL to DETECTED
          this.onNewContactDetected(hostile, range);
        } else {
          // Update range
          const contact = this.detectedContacts.get(hostile.id);
          contact.range = range;
        }
      }
    }

    // Clean up dead contacts
    for (const [id, contact] of this.detectedContacts) {
      if (!contact.aircraft.isAlive()) {
        this.detectedContacts.delete(id);
      }
    }
  }

  /**
   * Handle new contact detection
   * @param {Aircraft} hostile - Detected hostile
   * @param {number} range - Range in meters
   */
  onNewContactDetected(hostile, range) {
    const now = this.simulation.time;

    // Transition flight members to DETECTED state
    for (const aircraft of this.flight.aircraft) {
      if (aircraft.isAlive() && aircraft.engagementState === BVR_STATES.PATROL) {
        aircraft.engagementState = BVR_STATES.DETECTED;
      }
    }

    // Emit CONTACT report (with cooldown)
    if (now - this.lastContactReport > this.contactReportCooldown) {
      this.emitContact(hostile, range);
      this.lastContactReport = now;
    }
  }

  /**
   * Update target sorting state
   */
  updateSorting() {
    // Check if we need to sort (multiple contacts, not yet sorted)
    const hostileCount = this.detectedContacts.size;

    if (hostileCount > 1 && !this.sortingComplete) {
      // Transition to SORTING state
      for (const aircraft of this.flight.aircraft) {
        if (aircraft.isAlive() && aircraft.engagementState === BVR_STATES.DETECTED) {
          aircraft.engagementState = BVR_STATES.SORTING;
        }
      }

      // Perform sorting
      const hostiles = Array.from(this.detectedContacts.values()).map(c => c.aircraft);
      const assignments = this.flight.sortTargets(hostiles);

      // Apply assignments
      for (const [aircraft, target] of assignments) {
        if (aircraft.ai) {
          aircraft.ai.target = target;
        }
      }

      this.sortingComplete = true;
      this.lastSortTime = this.simulation.time;

      // Emit SORTED
      this.emitSorted();
    }
  }

  /**
   * Process pending communication requests
   */
  processPendingRequests() {
    // For now, requests are emitted immediately
    // Could add queuing/batching logic here
  }

  /**
   * Called when pilot receives COMMIT authorization from player
   */
  onCommitAuthorized() {
    for (const aircraft of this.flight.aircraft) {
      if (aircraft.isAlive()) {
        if (aircraft.engagementState === BVR_STATES.DETECTED ||
            aircraft.engagementState === BVR_STATES.SORTING) {
          aircraft.engagementState = BVR_STATES.COMMIT;
        }
      }
    }

    // Reset sorting for potential re-sort
    this.sortingComplete = false;
  }

  /**
   * Called when an aircraft acquires STT lock
   * @param {Aircraft} aircraft
   * @param {Aircraft} target
   */
  onLockAcquired(aircraft, target) {
    if (aircraft.engagementState === BVR_STATES.COMMIT) {
      aircraft.engagementState = BVR_STATES.TARGET;
      this.emitTargeted(aircraft, target);
    }
  }

  /**
   * Called when an aircraft launches a missile
   * @param {Aircraft} aircraft
   * @param {string} foxType - 'fox1', 'fox2', 'fox3'
   * @param {Aircraft} target
   */
  onMissileLaunched(aircraft, foxType, target) {
    aircraft.engagementState = BVR_STATES.LAUNCH;

    // Emit FOX call
    this.emitFox(aircraft, foxType, target);

    // Transition to GUIDE
    aircraft.engagementState = BVR_STATES.GUIDE;
  }

  /**
   * Called when missile enters crank phase (fox3 active)
   * @param {Aircraft} aircraft
   */
  onCrankStart(aircraft) {
    aircraft.engagementState = BVR_STATES.CRANK;
  }

  /**
   * Called when missile impacts target (hit or miss)
   * @param {Aircraft} aircraft
   * @param {boolean} hit
   * @param {Aircraft} target
   */
  onMissileResolution(aircraft, hit, target) {
    if (hit) {
      this.emitSplash(aircraft, target);
    } else {
      this.emitTimeout(aircraft);
    }

    aircraft.engagementState = BVR_STATES.RECOMMIT;
  }

  /**
   * Called when aircraft goes defensive
   * @param {Aircraft} aircraft
   * @param {Object} threat
   */
  onDefensive(aircraft, threat) {
    this.emitDefensive(aircraft, threat);
  }

  // Communication event emitters

  /**
   * Emit CONTACT report
   * @param {Aircraft} hostile
   * @param {number} range
   */
  emitContact(hostile, range) {
    const lead = this.flight.getLead();
    if (!lead) return;

    // Calculate bearing from flight to hostile
    const flightPos = this.flight.getAveragePosition();
    const dx = hostile.position.x - flightPos.x;
    const dy = hostile.position.y - flightPos.y;
    const bearing = Math.atan2(dx, dy) * 180 / Math.PI;

    // Count hostiles in this group (simplified - same flight)
    const count = hostile.flight?.aircraft.filter(a => a.isAlive()).length || 1;

    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.CONTACT,
      speaker: lead.callsign,
      flight: this.flight,
      target: hostile,
      data: {
        bearing: bearing,
        range: m2nm(range),
        altitude: hostile.altitude,
        count: count
      }
    });

    this.simulation.events.emit('comm:event', event);

    // Mark contact as reported
    const contact = this.detectedContacts.get(hostile.id);
    if (contact) contact.reported = true;
  }

  /**
   * Emit DECLARE request
   * @param {Aircraft} contact
   */
  emitDeclare(contact) {
    const now = this.simulation.time;
    if (now - this.lastDeclareRequest < this.declareRequestCooldown) return;

    const lead = this.flight.getLead();
    if (!lead) return;

    const flightPos = this.flight.getAveragePosition();
    const dx = contact.position.x - flightPos.x;
    const dy = contact.position.y - flightPos.y;
    const bearing = Math.atan2(dx, dy) * 180 / Math.PI;
    const range = m2nm(Math.sqrt(dx * dx + dy * dy));

    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.DECLARE,
      speaker: lead.callsign,
      flight: this.flight,
      target: contact,
      data: { bearing, range }
    });

    this.simulation.events.emit('comm:event', event);
    this.lastDeclareRequest = now;
  }

  /**
   * Emit COMMIT request
   */
  emitCommitRequest() {
    const now = this.simulation.time;
    if (now - this.lastCommitRequest < this.commitRequestCooldown) return;

    const lead = this.flight.getLead();
    if (!lead) return;

    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.COMMIT,
      speaker: lead.callsign,
      flight: this.flight,
      priority: 'high'
    });

    this.simulation.events.emit('comm:event', event);
    this.lastCommitRequest = now;
  }

  /**
   * Emit SORTED report
   */
  emitSorted() {
    const lead = this.flight.getLead();
    if (!lead) return;

    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.SORTED,
      speaker: lead.callsign,
      flight: this.flight
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit TARGETED report
   * @param {Aircraft} aircraft
   * @param {Aircraft} target
   */
  emitTargeted(aircraft, target) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.TARGETED,
      speaker: aircraft.callsign,
      flight: this.flight,
      target: target
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit FOX call
   * @param {Aircraft} aircraft
   * @param {string} foxType
   * @param {Aircraft} target
   */
  emitFox(aircraft, foxType, target) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.FOX,
      speaker: aircraft.callsign,
      flight: this.flight,
      target: target,
      priority: 'high',
      data: {
        foxType: foxType,
        targetCallsign: target?.callsign
      }
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit TIMEOUT report
   * @param {Aircraft} aircraft
   */
  emitTimeout(aircraft) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.TIMEOUT,
      speaker: aircraft.callsign,
      flight: this.flight
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit SPLASH report
   * @param {Aircraft} aircraft
   * @param {Aircraft} target
   */
  emitSplash(aircraft, target) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.SPLASH,
      speaker: aircraft.callsign,
      flight: this.flight,
      target: target,
      priority: 'high',
      data: { count: 1 }
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit DEFENSIVE report
   * @param {Aircraft} aircraft
   * @param {Object} threat
   */
  emitDefensive(aircraft, threat) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.DEFENSIVE,
      speaker: aircraft.callsign,
      flight: this.flight,
      target: threat,
      priority: 'critical'
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit BINGO report
   * @param {Aircraft} aircraft
   */
  emitBingo(aircraft) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.BINGO,
      speaker: aircraft.callsign,
      flight: this.flight,
      priority: 'high'
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit WINCHESTER report
   * @param {Aircraft} aircraft
   */
  emitWinchester(aircraft) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.WINCHESTER,
      speaker: aircraft.callsign,
      flight: this.flight,
      priority: 'high'
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit CRANK report - pilot cranking to gimbal limit
   * @param {Aircraft} aircraft
   * @param {string} direction - 'left' or 'right'
   */
  emitCrank(aircraft, direction) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.CRANK,
      speaker: aircraft.callsign,
      flight: this.flight,
      priority: 'normal',
      data: { direction }
    });

    this.simulation.events.emit('comm:event', event);
  }

  /**
   * Emit MERGED report - WVR with hostile
   * @param {Aircraft} aircraft
   */
  emitMerged(aircraft) {
    const event = new CommunicationEvent({
      type: COMM_EVENT_TYPES.MERGED,
      speaker: aircraft.callsign,
      flight: this.flight,
      priority: 'high'
    });

    this.simulation.events.emit('comm:event', event);
  }
}
