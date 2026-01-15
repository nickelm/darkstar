import { RadioFilter } from './RadioFilter.js';

export class VoiceOutput {
  constructor(options = {}) {
    this.useElevenLabs = false;
    this.elevenLabsKey = options.elevenLabsKey || null;
    
    this.radioFilter = null;
    this.audioContext = null;
    
    this.voiceProfiles = {};   // Per-pilot voice settings
    this.gciVoice = {};        // Your voice
  }

  async init() {}
  
  async speak(speaker, message, options = {}) {}
  
  // Web Speech
  speakWebSpeech(speaker, message) {}
  
  // ElevenLabs
  async speakElevenLabs(speaker, message) {}
  
  // GCI (player) voice
  speakAsGCI(message) {}
  
  setVoiceProfile(speakerId, profile) {}
  
  stop() {}               // Cancel current speech
  setVolume(volume) {}
}