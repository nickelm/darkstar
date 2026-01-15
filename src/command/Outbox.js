export class Outbox {
  constructor(voiceOutput, executor) {
    this.voiceOutput = voiceOutput;
    this.executor = executor;

    this.queue = [];
    this.holdTime = 3000;     // ms, for mouse/keyboard commands
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

    // Execute the command
    this.executor.execute(entry.command);

    // Voice output would go here in Phase 3+
  }

  getQueue() {
    return [...this.queue];
  }

  getPending() {
    return this.queue.filter(e => !e.sent);
  }
}