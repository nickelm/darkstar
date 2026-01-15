export class OutboxPanel {
  constructor(container, outbox) {
    this.container = container;
    this.outbox = outbox;
  }

  init() {}
  
  render() {}
  renderEntry(entry) {}
  renderCountdown(entry) {}
  
  onCancel(commandId) {}
  onClearAll() {}
  onSendNow() {}
}