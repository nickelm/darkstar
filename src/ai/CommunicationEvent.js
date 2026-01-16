/**
 * CommunicationEvent - Structured pilot-to-player communication
 *
 * Types:
 * - CONTACT: New group detected
 * - DECLARE: Request identification on ambiguous contact
 * - COMMIT: Request engagement authorization
 * - SORTED: Target assignments complete
 * - TARGETED: Locked and in envelope
 * - FOX: Weapon away
 * - TIMEOUT: Missile should have impacted, no result
 * - SPLASH: Kill confirmed
 * - DEFENSIVE: Threat, maneuvering
 * - BINGO: Minimum fuel
 * - WINCHESTER: Out of weapons
 */

export const COMM_EVENT_TYPES = {
  CONTACT: 'CONTACT',
  DECLARE: 'DECLARE',
  COMMIT: 'COMMIT',
  SORTED: 'SORTED',
  TARGETED: 'TARGETED',
  FOX: 'FOX',
  TIMEOUT: 'TIMEOUT',
  SPLASH: 'SPLASH',
  DEFENSIVE: 'DEFENSIVE',
  BINGO: 'BINGO',
  WINCHESTER: 'WINCHESTER',
  CRANK: 'CRANK',
  MERGED: 'MERGED'
};

export class CommunicationEvent {
  /**
   * @param {Object} config
   * @param {string} config.type - Event type from COMM_EVENT_TYPES
   * @param {string} config.speaker - Aircraft callsign
   * @param {Object} config.flight - Flight reference
   * @param {Object} [config.target] - Target reference (if applicable)
   * @param {string} [config.priority='normal'] - 'normal', 'high', 'critical'
   * @param {Object} [config.data={}] - Additional data for specific event types
   */
  constructor(config) {
    this.type = config.type;
    this.speaker = config.speaker;
    this.flight = config.flight;
    this.target = config.target || null;
    this.priority = config.priority || 'normal';
    this.timestamp = Date.now();
    this.data = config.data || {};
  }

  /**
   * Generate spoken message for this event
   * @returns {string}
   */
  getMessage() {
    switch (this.type) {
      case COMM_EVENT_TYPES.CONTACT:
        return this.formatContact();

      case COMM_EVENT_TYPES.DECLARE:
        return this.formatDeclare();

      case COMM_EVENT_TYPES.COMMIT:
        return `${this.speaker}, request commit`;

      case COMM_EVENT_TYPES.SORTED:
        return `${this.flight?.callsign || this.speaker}, sorted`;

      case COMM_EVENT_TYPES.TARGETED:
        return `${this.speaker}, targeted`;

      case COMM_EVENT_TYPES.FOX:
        return this.formatFox();

      case COMM_EVENT_TYPES.TIMEOUT:
        return `${this.speaker}, timeout`;

      case COMM_EVENT_TYPES.SPLASH:
        return this.formatSplash();

      case COMM_EVENT_TYPES.DEFENSIVE:
        return `${this.speaker}, defensive`;

      case COMM_EVENT_TYPES.BINGO:
        return `${this.speaker}, bingo fuel`;

      case COMM_EVENT_TYPES.WINCHESTER:
        return `${this.speaker}, winchester`;

      case COMM_EVENT_TYPES.CRANK:
        return this.formatCrank();

      case COMM_EVENT_TYPES.MERGED:
        return `${this.speaker}, merged`;

      default:
        return `${this.speaker}, ${this.type.toLowerCase()}`;
    }
  }

  /**
   * Format CONTACT message with BRAA or bullseye
   * @returns {string}
   */
  formatContact() {
    const { bearing, range, altitude, count } = this.data;

    let msg = `${this.speaker}, contact`;

    if (bearing !== undefined && range !== undefined) {
      msg += `, ${this.formatBearing(bearing)} for ${Math.round(range)}`;
    }

    if (altitude !== undefined) {
      const angels = Math.round(altitude / 1000);
      msg += `, angels ${angels}`;
    }

    if (count && count > 1) {
      msg += `, ${this.formatGroupSize(count)}`;
    }

    return msg;
  }

  /**
   * Format DECLARE request
   * @returns {string}
   */
  formatDeclare() {
    const { bearing, range } = this.data;

    let msg = `${this.speaker}, declare`;

    if (bearing !== undefined && range !== undefined) {
      msg += ` ${this.formatBearing(bearing)} for ${Math.round(range)}`;
    }

    return msg;
  }

  /**
   * Format FOX call
   * @returns {string}
   */
  formatFox() {
    const { foxType, targetCallsign } = this.data;

    let foxCall = 'fox';
    switch (foxType) {
      case 'fox1':
        foxCall = 'fox one';
        break;
      case 'fox2':
        foxCall = 'fox two';
        break;
      case 'fox3':
        foxCall = 'fox three';
        break;
    }

    let msg = `${this.speaker}, ${foxCall}`;

    if (targetCallsign) {
      msg += `, ${targetCallsign}`;
    }

    return msg;
  }

  /**
   * Format SPLASH message
   * @returns {string}
   */
  formatSplash() {
    const { count } = this.data;

    if (count && count > 1) {
      return `${this.speaker}, splash ${count}`;
    }

    return `${this.speaker}, splash one`;
  }

  /**
   * Format CRANK message
   * @returns {string}
   */
  formatCrank() {
    const direction = this.data.direction || 'left';
    return `${this.speaker}, cranking ${direction}`;
  }

  /**
   * Format bearing as three-digit heading
   * @param {number} bearing
   * @returns {string}
   */
  formatBearing(bearing) {
    const normalized = ((bearing % 360) + 360) % 360;
    return String(Math.round(normalized)).padStart(3, '0');
  }

  /**
   * Format group size
   * @param {number} count
   * @returns {string}
   */
  formatGroupSize(count) {
    const sizes = {
      2: 'two ship',
      3: 'three ship',
      4: 'four ship',
      5: 'five plus'
    };
    return sizes[count] || `${count} contacts`;
  }

  /**
   * Get priority level for UI styling
   * @returns {string}
   */
  getPriorityClass() {
    switch (this.priority) {
      case 'critical':
        return 'threat';
      case 'high':
        return 'warning';
      default:
        return 'normal';
    }
  }

  /**
   * Check if this is a request that expects player response
   * @returns {boolean}
   */
  requiresResponse() {
    return [
      COMM_EVENT_TYPES.COMMIT,
      COMM_EVENT_TYPES.DECLARE
    ].includes(this.type);
  }
}
