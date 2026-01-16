import { VoiceOutput } from '../voice/VoiceOutput.js';

export class Outbox {
  constructor(voiceOutput, executor) {
    this.voiceOutput = voiceOutput;
    this.executor = executor;

    this.queue = [];
    this.holdTime = 3000;     // ms, for mouse/keyboard commands

    // Communications components (set by main.js)
    this.commsLog = null;
    this.subtitles = null;

    // Simulation reference for flight lookup (set by main.js)
    this.simulation = null;
  }

  add(command, immediate = false) {
    const entry = {
      id: command.id || Date.now(),
      command: command,
      addedAt: Date.now(),
      immediate: immediate,
      sent: false
    };

    if (immediate) {
      this.transmit(entry);
    } else {
      this.queue.push(entry);
    }
  }

  cancel(commandId) {
    const index = this.queue.findIndex(e => e.id === commandId);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  cancelLast() {
    if (this.queue.length > 0) {
      this.queue.pop();
    }
  }

  clearAll() {
    this.queue = [];
  }

  sendNow(commandId) {
    const entry = this.queue.find(e => e.id === commandId);
    if (entry) {
      this.transmit(entry);
      this.cancel(commandId);
    }
  }

  update(delta) {
    const now = Date.now();

    // Process queue - send commands that have waited long enough
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const entry = this.queue[i];
      if (!entry.sent && (now - entry.addedAt) >= this.holdTime) {
        this.transmit(entry);
        this.queue.splice(i, 1);
      }
    }
  }

  transmit(entry) {
    if (entry.sent) return;

    entry.sent = true;
    entry.command.timestamp = Date.now();

    const command = entry.command;

    // Get flight for context
    const flight = this.simulation?.getFlightByCallsign(command.callsign);

    // Generate GCI command message for logging
    const gciMessage = this.generateGciMessage(command);

    // Log player command to comms log
    if (this.commsLog && gciMessage) {
      this.commsLog.logGciCommand(command.callsign, gciMessage);
    }

    // Speak GCI command (only for non-voice commands, i.e., from command bar)
    // Voice commands are immediate=true, command bar commands are immediate=false
    const shouldSpeakGci = !entry.immediate && this.voiceOutput && gciMessage;
    const skipVoice = this.subtitles ? this.subtitles.shouldSkipVoice() : false;
    if (shouldSpeakGci && !skipVoice) {
      // Format the full GCI transmission: "[Callsign], [command]"
      const gciTransmission = `${command.callsign}, ${gciMessage}`;
      this.voiceOutput.speakAsGCI(gciTransmission);
    }

    // Execute the command
    const success = this.executor.execute(command);

    // Generate and play pilot acknowledgment
    if (success && flight) {
      const pilotCallsign = flight.lead?.callsign || `${flight.callsign}-1`;
      const ackMessage = VoiceOutput.generateAcknowledgment(command, pilotCallsign);

      // Log pilot response to comms log
      if (this.commsLog) {
        this.commsLog.logPilotResponse(pilotCallsign, ackMessage);
      }

      // Show subtitle
      if (this.subtitles) {
        this.subtitles.show(pilotCallsign, ackMessage);
      }

      // Speak acknowledgment (skip at high time scale)
      const shouldSpeak = this.subtitles ? !this.subtitles.shouldSkipVoice() : true;
      if (this.voiceOutput && shouldSpeak) {
        this.voiceOutput.speakAsPilot(pilotCallsign, ackMessage);
      }
    }
  }

  /**
   * Generate GCI command message for logging
   * @param {Object} command
   * @returns {string}
   */
  generateGciMessage(command) {
    switch (command.type) {
      case 'SNAP':
        return `snap ${command.params.heading}`;
      case 'VECTOR':
        return `vector ${command.params.heading}`;
      case 'ANGELS':
        return `angels ${Math.round(command.params.altitude / 1000)}`;
      case 'BUSTER':
        return 'buster';
      case 'GATE':
        return 'gate';
      case 'RTB':
        return 'RTB';
      case 'ENGAGE':
        return `engage ${command.params.target}`;
      case 'DEFENSIVE':
        return 'defensive';
      case 'WEAPONS_FREE':
        return 'weapons free';
      case 'WEAPONS_HOLD':
        return 'weapons hold';
      case 'WEAPONS_TIGHT':
        return 'weapons tight';
      default:
        return command.type.toLowerCase();
    }
  }

  getQueue() {
    return [...this.queue];
  }

  getPending() {
    return this.queue.filter(e => !e.sent);
  }
}