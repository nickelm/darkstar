export class Subtitles {
  constructor(container) {
    this.container = container;
    this.activeSubtitles = [];
    this.duration = 3000;    // ms
  }

  init() {}
  
  show(speaker, message, position = null) {}
  
  update(delta) {}          // Remove expired
  
  render() {}
  
  clear() {}
}