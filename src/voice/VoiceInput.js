export class VoiceInput {
  constructor(options = {}) {
    this.recognition = null;
    this.useWhisper = options.useWhisper || false;
    this.whisperApiKey = options.whisperApiKey || null;
    
    this.onResult = null;     // Callback
    this.onError = null;
    
    this.isListening = false;
  }

  init() {}
  
  start() {}
  stop() {}
  toggle() {}
  
  // Web Speech API
  initWebSpeech() {}
  handleWebSpeechResult(event) {}
  
  // Whisper API
  async initWhisper() {}
  async transcribeWithWhisper(audioBlob) {}
  
  setCallback(onResult) {}
}