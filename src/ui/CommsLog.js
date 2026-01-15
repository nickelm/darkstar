export class CommsLog {
  constructor(container) {
    this.container = container;
    this.entries = [];
    this.filter = 'all';   // 'all', 'strike', 'guard', or flight id
  }

  init() {}
  
  addEntry(entry) {}       // { time, channel, speaker, message, priority }
  
  setFilter(filter) {}
  
  render() {}
  renderEntry(entry) {}
  
  scrollToBottom() {}
  
  exportLog() {}           // For replay/debrief
}