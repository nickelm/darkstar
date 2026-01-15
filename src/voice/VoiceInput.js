/**
 * VoiceInput - Push-to-Talk voice recognition
 *
 * Uses Web Speech API for voice recognition with PTT activation.
 * Falls back to Whisper API if configured.
 *
 * States:
 * - IDLE: Not listening, ready to start
 * - LISTENING: Actively recording/recognizing
 * - PROCESSING: Processing final result
 * - ABORTED: No speech detected
 */
export class VoiceInput {
  constructor(options = {}) {
    this.recognition = null;
    this.useWhisper = options.useWhisper || false;
    this.whisperApiKey = options.whisperApiKey || null;

    // Callbacks
    this.onResult = null;        // (text) => void - called with final transcript
    this.onError = null;         // (error) => void
    this.onStateChange = null;   // (state) => void

    // State
    this.state = 'idle';         // 'idle', 'listening', 'processing', 'aborted'
    this.isListening = false;

    // Configuration
    this.language = options.language || 'en-US';
    this.silenceTimeout = options.silenceTimeout || 5000; // Auto-abort after silence
    this.continuous = false;      // Single utterance mode

    // Timeout handle
    this.timeoutHandle = null;

    // PTT timing
    this.pttStartTime = null;

    // Browser support
    this.supported = false;
  }

  /**
   * Initialize voice input system
   * @returns {boolean} True if supported
   */
  init() {
    // Check for Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    console.log('VoiceInput: Initializing...');
    console.log('VoiceInput: SpeechRecognition available:', !!SpeechRecognition);

    if (SpeechRecognition) {
      this.initWebSpeech(SpeechRecognition);
      this.supported = true;
      console.log('VoiceInput: Web Speech API initialized successfully');
      return true;
    } else if (this.useWhisper && this.whisperApiKey) {
      // Whisper fallback
      this.supported = true;
      console.log('VoiceInput: Using Whisper API fallback');
      return true;
    }

    console.warn('VoiceInput: Web Speech API not supported in this browser');
    this.supported = false;
    return false;
  }

  /**
   * Initialize Web Speech API
   * @param {function} SpeechRecognition
   */
  initWebSpeech(SpeechRecognition) {
    this.recognition = new SpeechRecognition();

    // Configure recognition
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = true;   // Enable for debugging
    this.recognition.lang = this.language;
    this.recognition.maxAlternatives = 1;

    // Log configuration
    console.log('VoiceInput: Config - continuous:', this.recognition.continuous,
      ', interimResults:', this.recognition.interimResults,
      ', lang:', this.recognition.lang,
      ', maxAlternatives:', this.recognition.maxAlternatives);

    // Event handlers
    this.recognition.onresult = (event) => this.handleWebSpeechResult(event);
    this.recognition.onerror = (event) => this.handleWebSpeechError(event);
    this.recognition.onend = () => this.handleWebSpeechEnd();
    this.recognition.onspeechstart = () => this.handleSpeechStart();
    this.recognition.onspeechend = () => this.handleSpeechEnd();
    this.recognition.onnomatch = () => this.handleNoMatch();

    console.log('VoiceInput: All handlers bound (onresult, onerror, onend, onspeechstart, onspeechend, onnomatch)');
  }

  /**
   * Start listening (PTT press)
   */
  start() {
    if (!this.supported) {
      console.warn('VoiceInput: Not supported - Web Speech API unavailable');
      return false;
    }

    if (this.isListening) {
      console.log('VoiceInput: Already listening');
      return false;
    }

    this.pttStartTime = performance.now();
    console.log('VoiceInput: Starting recognition... [PTT pressed at', new Date().toISOString() + ']');
    this.setState('listening');
    this.isListening = true;

    // Clear any existing timeout
    this.clearTimeout();

    // Start silence timeout
    this.timeoutHandle = setTimeout(() => {
      if (this.isListening) {
        console.log('VoiceInput: Silence timeout, aborting');
        this.abort();
      }
    }, this.silenceTimeout);

    if (this.recognition) {
      try {
        this.recognition.start();
        console.log('VoiceInput: Recognition started successfully');
      } catch (e) {
        // Already started or other error
        console.warn('VoiceInput: Could not start recognition', e);
        this.setState('idle');
        this.isListening = false;
        return false;
      }
    } else {
      console.warn('VoiceInput: No recognition object available');
    }

    return true;
  }

  /**
   * Stop listening (PTT release)
   */
  stop() {
    if (!this.isListening) return;

    const duration = this.pttStartTime ? ((performance.now() - this.pttStartTime) / 1000).toFixed(2) : 'N/A';
    console.log('VoiceInput: Stopping recognition... [PTT released after', duration + 's]');

    this.clearTimeout();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Already stopped
      }
    }

    // State will be updated in handleWebSpeechEnd
  }

  /**
   * Toggle listening state
   */
  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * Abort listening without processing
   */
  abort() {
    this.clearTimeout();
    this.setState('aborted');

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {
        // Already aborted
      }
    }

    this.isListening = false;

    // Return to idle after brief delay
    setTimeout(() => {
      if (this.state === 'aborted') {
        this.setState('idle');
      }
    }, 500);
  }

  /**
   * Handle Web Speech result
   * @param {SpeechRecognitionEvent} event
   */
  handleWebSpeechResult(event) {
    this.clearTimeout();
    console.log('VoiceInput: Got result event with', event.results.length, 'result(s)');

    const results = event.results;
    if (results.length === 0) {
      console.log('VoiceInput: No results in event');
      this.abort();
      return;
    }

    // Log all results with confidence scores
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      console.log(`VoiceInput: Result[${i}] isFinal:`, result.isFinal,
        '| transcript:', JSON.stringify(transcript),
        '| confidence:', confidence ? confidence.toFixed(3) : 'N/A');
    }

    // Get the latest result
    const result = results[results.length - 1];

    if (result.isFinal) {
      const transcript = result[0].transcript.trim();
      const confidence = result[0].confidence;
      console.log('VoiceInput: Final transcript:', JSON.stringify(transcript),
        '| confidence:', confidence ? confidence.toFixed(3) : 'N/A');

      if (transcript) {
        this.setState('processing');

        // Call result callback
        if (this.onResult) {
          console.log('VoiceInput: Calling onResult callback');
          this.onResult(transcript);
        } else {
          console.warn('VoiceInput: No onResult callback set');
        }

        // Return to idle
        setTimeout(() => {
          this.setState('idle');
        }, 100);
      } else {
        console.log('VoiceInput: Empty transcript, aborting');
        this.abort();
      }
    }
  }

  /**
   * Handle Web Speech error
   * @param {SpeechRecognitionErrorEvent} event
   */
  handleWebSpeechError(event) {
    this.clearTimeout();

    const errorType = event.error;
    console.log('VoiceInput: Error event:', errorType, event.message);

    // Some errors are expected
    if (errorType === 'no-speech' || errorType === 'aborted') {
      console.log('VoiceInput: Expected error (no-speech/aborted), aborting');
      this.abort();
      return;
    }

    console.warn('VoiceInput: Unexpected error:', errorType, event.message);

    if (this.onError) {
      this.onError({
        type: errorType,
        message: event.message || errorType
      });
    }

    this.setState('idle');
    this.isListening = false;
  }

  /**
   * Handle Web Speech end
   */
  handleWebSpeechEnd() {
    console.log('VoiceInput: onend fired (state was:', this.state + ')');
    this.clearTimeout();
    this.isListening = false;

    // If still in listening state, no result was received
    if (this.state === 'listening') {
      console.log('VoiceInput: No result received before end, aborting');
      this.abort();
    }
  }

  /**
   * Handle speech start detection
   */
  handleSpeechStart() {
    console.log('VoiceInput: onspeechstart fired - browser detected speech');
    // Speech detected, clear timeout
    this.clearTimeout();
  }

  /**
   * Handle speech end detection
   */
  handleSpeechEnd() {
    console.log('VoiceInput: onspeechend fired - browser detected end of speech');
    // Speech ended, processing will follow
  }

  /**
   * Handle no match (speech but not understood)
   */
  handleNoMatch() {
    console.log('VoiceInput: onnomatch fired - speech heard but not recognized');
    this.abort();
  }

  /**
   * Set state and notify
   * @param {string} newState
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;

    if (oldState !== newState && this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  /**
   * Clear silence timeout
   */
  clearTimeout() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Set result callback
   * @param {function} callback - (text) => void
   */
  setCallback(callback) {
    this.onResult = callback;
  }

  /**
   * Check if voice input is supported
   * @returns {boolean}
   */
  isSupported() {
    return this.supported;
  }

  /**
   * Get current state
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  // Whisper API methods (optional fallback)

  /**
   * Initialize Whisper API
   */
  async initWhisper() {
    // Whisper requires MediaRecorder for audio capture
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('VoiceInput: MediaDevices not supported for Whisper');
      return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (e) {
      console.warn('VoiceInput: Could not get microphone access', e);
      return false;
    }
  }

  /**
   * Transcribe audio with Whisper API
   * @param {Blob} audioBlob
   */
  async transcribeWithWhisper(audioBlob) {
    if (!this.whisperApiKey) {
      throw new Error('Whisper API key not configured');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.whisperApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text;
  }
}
