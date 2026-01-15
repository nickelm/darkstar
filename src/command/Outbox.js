export class Outbox {
  constructor(voiceOutput, executor) {
    this.voiceOutput = voiceOutput;
    this.executor = executor;
    
    this.queue = [];
    this.holdTime = 3000;     // ms, for mouse/keyboard commands
  }

  add(command, immediate = false) {}
  
  cancel(commandId) {}
  cancelLast() {}
  clearAll() {}
  sendNow(commandId) {}       // Skip hold time
  
  update(delta) {}
  
  transmit(entry) {}
  
  getQueue() {}               // For UI display
  getPending() {}             // Commands not yet sent
}