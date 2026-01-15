export class RadioFilter {
  constructor(audioContext) {
    this.audioContext = audioContext;
    
    this.bandpass = null;
    this.compressor = null;
    this.distortion = null;
    this.noiseSource = null;
  }

  init() {}
  
  createFilterChain() {}
  
  process(audioSource) {}       // Returns processed audio node
  
  playClickIn() {}              // Squelch sound
  playClickOut() {}
  
  setIntensity(level) {}        // 'clean', 'normal', 'heavy'
  
  makeDistortionCurve(amount) {}
}