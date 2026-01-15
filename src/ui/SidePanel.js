export class SidePanel {
  constructor(container) {
    this.container = container;
    this.selectedFlight = null;
    this.pinnedFlights = [];
  }

  init() {}
  
  showFlight(flight) {}
  hideFlight() {}
  
  pinFlight(flight) {}
  unpinFlight(flightId) {}
  
  showAirbase(airbase) {}
  
  render() {}
  renderFlightDetail(flight) {}
  renderPinnedList() {}
  renderAirbaseDetail(airbase) {}
  
  // Flight info sections
  renderWeapons(aircraft) {}
  renderFuel(aircraft) {}
  renderCommandHistory(flight) {}
  renderCurrentTask(flight) {}
}