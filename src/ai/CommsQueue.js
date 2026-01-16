import { COMM_EVENT_TYPES } from './CommunicationEvent.js';

/**
 * Priority values for communication events
 * Higher values = higher priority
 */
export const COMM_PRIORITY = {
  DEFENSIVE: 100,   // Highest - immediate threat
  SPLASH: 90,
  FOX: 80,
  MERGED: 75,
  CRANK: 70,
  TIMEOUT: 60,
  CONTACT: 50,
  SORTED: 40,
  TARGETED: 40,
  COMMIT: 35,
  DECLARE: 30,
  BINGO: 25,
  WINCHESTER: 25,
  ROUTINE: 10       // Lowest
};

/**
 * Get priority value for a communication event type
 * @param {string} type - Event type from COMM_EVENT_TYPES
 * @returns {number}
 */
function getPriority(type) {
  switch (type) {
    case COMM_EVENT_TYPES.DEFENSIVE:
      return COMM_PRIORITY.DEFENSIVE;
    case COMM_EVENT_TYPES.SPLASH:
      return COMM_PRIORITY.SPLASH;
    case COMM_EVENT_TYPES.FOX:
      return COMM_PRIORITY.FOX;
    case COMM_EVENT_TYPES.MERGED:
      return COMM_PRIORITY.MERGED;
    case COMM_EVENT_TYPES.CRANK:
      return COMM_PRIORITY.CRANK;
    case COMM_EVENT_TYPES.TIMEOUT:
      return COMM_PRIORITY.TIMEOUT;
    case COMM_EVENT_TYPES.CONTACT:
      return COMM_PRIORITY.CONTACT;
    case COMM_EVENT_TYPES.SORTED:
      return COMM_PRIORITY.SORTED;
    case COMM_EVENT_TYPES.TARGETED:
      return COMM_PRIORITY.TARGETED;
    case COMM_EVENT_TYPES.COMMIT:
      return COMM_PRIORITY.COMMIT;
    case COMM_EVENT_TYPES.DECLARE:
      return COMM_PRIORITY.DECLARE;
    case COMM_EVENT_TYPES.BINGO:
      return COMM_PRIORITY.BINGO;
    case COMM_EVENT_TYPES.WINCHESTER:
      return COMM_PRIORITY.WINCHESTER;
    default:
      return COMM_PRIORITY.ROUTINE;
  }
}

/**
 * CommsQueue - Priority-based message queuing for radio communications
 *
 * Manages a queue of CommunicationEvents, handling:
 * - Priority-based ordering (DEFENSIVE > SPLASH > FOX > CONTACT > routine)
 * - Transmission delays between messages
 * - Speaker conflicts (one speaker at a time)
 * - Duplicate suppression for same speaker/type within window
 */
export class CommsQueue {
  constructor() {
    this.queue = [];
    this.currentSpeaker = null;
    this.lastTransmitTime = 0;
    this.transmitDelay = 0.5;        // seconds between transmissions
    this.duplicateWindow = 2.0;      // seconds to suppress duplicate messages
    this.recentMessages = [];        // Track recent messages for deduplication
  }

  /**
   * Add an event to the queue
   * @param {CommunicationEvent} event
   */
  add(event) {
    // Check for duplicates from same speaker
    if (this.isDuplicate(event)) {
      return;
    }

    // Calculate priority
    const priority = getPriority(event.type);

    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      const existingPriority = getPriority(this.queue[i].type);
      if (priority > existingPriority) {
        this.queue.splice(i, 0, event);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.queue.push(event);
    }

    // Track for duplicate suppression
    this.recentMessages.push({
      speaker: event.speaker,
      type: event.type,
      time: event.timestamp
    });
  }

  /**
   * Check if this is a duplicate of a recent message
   * @param {CommunicationEvent} event
   * @returns {boolean}
   */
  isDuplicate(event) {
    const now = Date.now();
    const windowMs = this.duplicateWindow * 1000;

    // Clean old entries
    this.recentMessages = this.recentMessages.filter(
      m => now - m.time < windowMs
    );

    // Check for duplicate
    return this.recentMessages.some(
      m => m.speaker === event.speaker && m.type === event.type
    );
  }

  /**
   * Update the queue and get next event to transmit
   * @param {number} currentTime - Current simulation time in seconds
   * @returns {CommunicationEvent|null}
   */
  update(currentTime) {
    // Check if enough time has passed since last transmission
    if (currentTime - this.lastTransmitTime < this.transmitDelay) {
      return null;
    }

    // Get next event
    const event = this.getNextEvent();
    if (event) {
      this.lastTransmitTime = currentTime;
      this.currentSpeaker = event.speaker;
    }

    return event;
  }

  /**
   * Get the next event to transmit
   * @returns {CommunicationEvent|null}
   */
  getNextEvent() {
    if (this.queue.length === 0) {
      return null;
    }

    // Pop the highest priority event (front of queue)
    return this.queue.shift();
  }

  /**
   * Check if queue has pending events
   * @returns {boolean}
   */
  hasPending() {
    return this.queue.length > 0;
  }

  /**
   * Get count of pending events
   * @returns {number}
   */
  getPendingCount() {
    return this.queue.length;
  }

  /**
   * Clear the queue (for time skip or scenario reset)
   */
  clear() {
    this.queue = [];
    this.currentSpeaker = null;
    this.lastTransmitTime = 0;
    this.recentMessages = [];
  }

  /**
   * Peek at the next event without removing it
   * @returns {CommunicationEvent|null}
   */
  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  /**
   * Interrupt current speaker with high-priority event
   * Used for critical events like DEFENSIVE
   * @param {CommunicationEvent} event
   */
  interrupt(event) {
    // Insert at front of queue
    this.queue.unshift(event);
    // Reset transmit delay to allow immediate transmission
    this.lastTransmitTime = 0;
  }
}
