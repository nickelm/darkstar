import { RadioFilter } from './RadioFilter.js';
import { resumeAudioContext } from '../util/audio.js';

/**
 * VoiceOutput - Text-to-speech for pilot responses
 *
 * Uses Web Speech API synthesis with per-pilot voice variation.
 * Audio is processed through RadioFilter for radio effect.
 */
export class VoiceOutput {
  constructor(options = {}) {
    this.useElevenLabs = options.useElevenLabs || false;
    this.elevenLabsKey = options.elevenLabsKey || null;

    this.radioFilter = null;
    this.audioContext = null;

    // Per-pilot voice settings
    // Key: callsign, Value: { pitch, rate, voiceIndex }
    this.voiceProfiles = {};

    // GCI (player) voice settings
    this.gciVoice = {
      pitch: 1.0,
      rate: 1.0
    };

    // Available voices (populated on init)
    this.voices = [];

    // Speech queue for sequential playback
    this.speechQueue = [];
    this.isSpeaking = false;

    // Current utterance (for cancellation)
    this.currentUtterance = null;

    // Volume
    this.volume = 1.0;

    // Callbacks
    this.onSpeechStart = null;   // (speaker, message) => void
    this.onSpeechEnd = null;     // (speaker, message) => void

    this.initialized = false;
  }

  /**
   * Initialize voice output system
   * @param {AudioContext} audioContext
   */
  async init(audioContext) {
    if (this.initialized) return;

    this.audioContext = audioContext;

    // Initialize radio filter
    this.radioFilter = new RadioFilter(audioContext);
    this.radioFilter.init();
    this.radioFilter.getOutput().connect(audioContext.destination);

    // Load available voices
    await this.loadVoices();

    this.initialized = true;
  }

  /**
   * Load available TTS voices
   */
  async loadVoices() {
    return new Promise((resolve) => {
      const loadVoiceList = () => {
        this.voices = speechSynthesis.getVoices();

        // Prefer English voices
        this.voices = this.voices.filter(v =>
          v.lang.startsWith('en')
        );

        if (this.voices.length === 0) {
          // Fallback to all voices
          this.voices = speechSynthesis.getVoices();
        }

        resolve();
      };

      // Voices may load asynchronously
      if (speechSynthesis.getVoices().length > 0) {
        loadVoiceList();
      } else {
        speechSynthesis.onvoiceschanged = loadVoiceList;
        // Timeout fallback
        setTimeout(loadVoiceList, 1000);
      }
    });
  }

  /**
   * Speak a message
   * @param {string} speaker - Speaker identifier (callsign or 'GCI')
   * @param {string} message - Text to speak
   * @param {Object} options - { intensity: 'clean'|'normal'|'heavy', immediate: false }
   */
  async speak(speaker, message, options = {}) {
    const entry = {
      speaker,
      message,
      intensity: options.intensity || 'normal',
      immediate: options.immediate || false
    };

    if (entry.immediate && this.isSpeaking) {
      // Cancel current speech and queue this at front
      this.stop();
      this.speechQueue.unshift(entry);
    } else {
      this.speechQueue.push(entry);
    }

    this.processQueue();
  }

  /**
   * Process speech queue
   */
  async processQueue() {
    if (this.isSpeaking || this.speechQueue.length === 0) return;

    this.isSpeaking = true;
    const entry = this.speechQueue.shift();

    try {
      await this.speakEntry(entry);
    } catch (e) {
      console.warn('VoiceOutput: Speech error', e);
    }

    this.isSpeaking = false;
    this.processQueue();
  }

  /**
   * Speak a single queue entry
   * @param {Object} entry
   */
  async speakEntry(entry) {
    // Ensure audio context is active
    if (this.audioContext) {
      await resumeAudioContext(this.audioContext);
    }

    // Set radio filter intensity
    this.radioFilter.setIntensity(entry.intensity);

    // Notify speech start
    if (this.onSpeechStart) {
      this.onSpeechStart(entry.speaker, entry.message);
    }

    // Play click-in
    this.radioFilter.playClickIn();

    // Wait for click
    await this.delay(50);

    // Start noise
    this.radioFilter.startNoise();

    // Speak with Web Speech API
    await this.speakWebSpeech(entry.speaker, entry.message);

    // Stop noise
    this.radioFilter.stopNoise();

    // Play click-out
    this.radioFilter.playClickOut();

    // Notify speech end
    if (this.onSpeechEnd) {
      this.onSpeechEnd(entry.speaker, entry.message);
    }
  }

  /**
   * Speak using Web Speech API
   * @param {string} speaker
   * @param {string} message
   */
  speakWebSpeech(speaker, message) {
    return new Promise((resolve) => {
      // Convert callsigns for proper TTS pronunciation
      // "Viper 1-1" -> "Viper one one" (not "one to one")
      const spokenMessage = this.formatForSpeech(message);
      const utterance = new SpeechSynthesisUtterance(spokenMessage);

      // Get or generate voice profile
      const profile = this.getVoiceProfile(speaker);

      utterance.pitch = profile.pitch;
      utterance.rate = profile.rate;
      utterance.volume = this.volume;

      if (this.voices.length > 0) {
        utterance.voice = this.voices[profile.voiceIndex % this.voices.length];
      }

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (e) => {
        this.currentUtterance = null;
        // Cancelled is expected when stop() is called
        if (e.error !== 'canceled') {
          console.warn('VoiceOutput: Utterance error', e.error);
        }
        resolve();
      };

      this.currentUtterance = utterance;
      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Get or generate voice profile for a speaker
   * @param {string} speaker
   * @returns {Object} { pitch, rate, voiceIndex }
   */
  getVoiceProfile(speaker) {
    if (speaker === 'GCI' || speaker === 'Darkstar') {
      return {
        pitch: this.gciVoice.pitch,
        rate: this.gciVoice.rate,
        voiceIndex: 0
      };
    }

    if (!this.voiceProfiles[speaker]) {
      this.voiceProfiles[speaker] = this.generateVoiceProfile(speaker);
    }

    return this.voiceProfiles[speaker];
  }

  /**
   * Generate a consistent voice profile from callsign
   * Uses hash of callsign to create reproducible variation
   * @param {string} callsign
   * @returns {Object}
   */
  generateVoiceProfile(callsign) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < callsign.length; i++) {
      const char = callsign.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Use hash to generate values in range
    const hashAbs = Math.abs(hash);

    // Pitch: 0.85 to 1.15
    const pitch = 0.85 + (hashAbs % 100) / 333;

    // Rate: 0.9 to 1.1
    const rate = 0.9 + ((hashAbs >> 8) % 100) / 500;

    // Voice index: pick from available voices
    const voiceIndex = (hashAbs >> 16) % Math.max(1, this.voices.length);

    return { pitch, rate, voiceIndex };
  }

  /**
   * Set voice profile for a specific speaker
   * @param {string} speakerId
   * @param {Object} profile - { pitch, rate, voiceIndex }
   */
  setVoiceProfile(speakerId, profile) {
    this.voiceProfiles[speakerId] = {
      pitch: profile.pitch ?? 1.0,
      rate: profile.rate ?? 1.0,
      voiceIndex: profile.voiceIndex ?? 0
    };
  }

  /**
   * Speak as GCI (player voice, clean filter)
   * @param {string} message
   */
  speakAsGCI(message) {
    return this.speak('GCI', message, { intensity: 'clean' });
  }

  /**
   * Speak as pilot (with radio filter)
   * @param {string} callsign
   * @param {string} message
   */
  speakAsPilot(callsign, message) {
    return this.speak(callsign, message, { intensity: 'normal' });
  }

  /**
   * Stop current and clear queue
   */
  stop() {
    this.speechQueue = [];

    if (this.currentUtterance) {
      speechSynthesis.cancel();
      this.currentUtterance = null;
    }

    this.radioFilter.stopNoise();
    this.isSpeaking = false;
  }

  /**
   * Set output volume
   * @param {number} volume - 0.0 to 1.0
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.radioFilter.setVolume(this.volume);
  }

  /**
   * Delay helper
   * @param {number} ms
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format text for proper TTS pronunciation
   * Converts callsigns like "Viper 1-1" to "Viper one one"
   * @param {string} text
   * @returns {string}
   */
  formatForSpeech(text) {
    // Replace hyphens in callsigns with spaces
    // "Viper 1-1" -> "Viper 1 1" -> then numbers are spoken individually
    let result = text.replace(/(\d)-(\d)/g, '$1 $2');

    // Also handle numbers that should be spoken digit-by-digit
    // "270" is fine as "two seventy", but callsign numbers should be individual
    // This is handled by the hyphen replacement above

    return result;
  }

  /**
   * Generate acknowledgment message for a command
   * @param {Object} command - { type, params, callsign }
   * @param {string} pilotCallsign - Speaking pilot's callsign
   * @returns {string}
   */
  static generateAcknowledgment(command, pilotCallsign) {
    let readback = '';

    switch (command.type) {
      case 'SNAP':
        readback = `Snap ${command.params.heading}`;
        break;
      case 'VECTOR':
        readback = `Vector ${command.params.heading}`;
        break;
      case 'ANGELS':
        readback = `Angels ${Math.round(command.params.altitude / 1000)}`;
        break;
      case 'BUSTER':
        readback = 'Buster';
        break;
      case 'GATE':
        readback = 'Gate';
        break;
      case 'RTB':
        readback = 'RTB';
        break;
      case 'ENGAGE':
        readback = `Engaging ${command.params.target}`;
        break;
      case 'DEFENSIVE':
        readback = 'Defensive';
        break;
      case 'WEAPONS_FREE':
        readback = 'Weapons free';
        break;
      case 'WEAPONS_HOLD':
        readback = 'Weapons hold';
        break;
      case 'WEAPONS_TIGHT':
        readback = 'Weapons tight';
        break;
      default:
        readback = 'Roger';
    }

    return `${readback}, ${pilotCallsign}`;
  }

  // ElevenLabs methods (optional premium TTS)

  /**
   * Speak using ElevenLabs API
   * @param {string} speaker
   * @param {string} message
   */
  async speakElevenLabs(speaker, message) {
    if (!this.elevenLabsKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    // This would use the ElevenLabs API
    // Implementation left as stub for optional upgrade
    console.warn('ElevenLabs TTS not implemented');
  }
}
