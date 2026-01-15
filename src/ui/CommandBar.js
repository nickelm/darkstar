export class CommandBar {
  constructor(container, parser, outbox) {
    this.container = container;
    this.parser = parser;
    this.outbox = outbox;
    
    this.state = 'idle';  // 'idle', 'callsign', 'command', 'param', 'ready'
    
    this.selectedCallsign = null;
    this.selectedCommand = null;
    this.selectedParams = {};
  }

  init() {}
  
  // State transitions
  openCallsignMenu(sortByPosition = null) {}
  openCommandMenu() {}
  openParamInput(paramType) {}
  
  selectCallsign(callsign) {}
  selectCommand(command) {}
  setParam(name, value) {}
  
  send() {}
  clear() {}
  
  // Rendering
  render() {}
  renderCallsignSlot() {}
  renderCommandSlot() {}
  renderParamSlot() {}
  renderSendButton() {}
  
  // Dropdown menus
  showDropdown(slot, options) {}
  hideDropdown() {}
  
  // Keyboard
  handleKeydown(event) {}
}