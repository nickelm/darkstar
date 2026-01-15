import { createNoiseSource, createClickBuffer, makeDistortionCurve } from '../util/audio.js';

/**
 * RadioFilter - Applies radio communication effects to audio
 *
 * Filter chain:
 * Input → Bandpass (300-3400Hz) → Compressor → Distortion → Noise Mix → Output
 *
 * Intensity levels:
 * - 'clean': Minimal filtering (GCI/AWACS voice)
 * - 'normal': Standard radio (pilot voices)
 * - 'heavy': Heavy static (interflight, distant contacts)
 */
export class RadioFilter {
  constructor(audioContext) {
    this.audioContext = audioContext;

    // Filter nodes
    this.inputGain = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.distortion = null;
    this.noiseGain = null;
    this.outputGain = null;

    // Noise source (runs continuously when needed)
    this.noiseSource = null;
    this.noiseBuffer = null;

    // Click buffers for squelch
    this.clickInBuffer = null;
    this.clickOutBuffer = null;

    // Current intensity
    this.intensity = 'normal';

    // Intensity presets
    this.presets = {
      clean: {
        highpassFreq: 200,
        lowpassFreq: 4000,
        distortionAmount: 10,
        noiseLevel: 0.01,
        compressionThreshold: -15,
        compressionRatio: 4
      },
      normal: {
        highpassFreq: 300,
        lowpassFreq: 3400,
        distortionAmount: 30,
        noiseLevel: 0.03,
        compressionThreshold: -20,
        compressionRatio: 8
      },
      heavy: {
        highpassFreq: 400,
        lowpassFreq: 3000,
        distortionAmount: 50,
        noiseLevel: 0.08,
        compressionThreshold: -25,
        compressionRatio: 12
      }
    };

    this.initialized = false;
  }

  /**
   * Initialize the filter chain
   */
  init() {
    if (this.initialized) return;

    const ctx = this.audioContext;

    // Input gain
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1.0;

    // Highpass filter (removes low rumble)
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = 300;
    this.highpass.Q.value = 0.7;

    // Lowpass filter (removes high frequencies)
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 3400;
    this.lowpass.Q.value = 0.7;

    // Compressor (dynamic range compression)
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.1;

    // Distortion (wave shaper)
    this.distortion = ctx.createWaveShaper();
    this.distortion.curve = makeDistortionCurve(30);
    this.distortion.oversample = '2x';

    // Noise gain (controls static level)
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.03;

    // Output gain
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1.0;

    // Create click buffers
    this.clickInBuffer = createClickBuffer(ctx, 0.04);
    this.clickOutBuffer = createClickBuffer(ctx, 0.03);

    // Connect the filter chain
    // Main signal path: input → highpass → lowpass → compressor → distortion → output
    this.inputGain.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.distortion);
    this.distortion.connect(this.outputGain);

    // Noise path: noise → noiseGain → output (mixed with signal)
    // Noise is added when needed via startNoise/stopNoise
    this.noiseGain.connect(this.outputGain);

    this.initialized = true;
    this.setIntensity(this.intensity);
  }

  /**
   * Get the input node for connecting audio sources
   * @returns {GainNode}
   */
  getInput() {
    return this.inputGain;
  }

  /**
   * Get the output node for connecting to destination
   * @returns {GainNode}
   */
  getOutput() {
    return this.outputGain;
  }

  /**
   * Process audio through the filter chain
   * Connect source to input, output to destination
   * @param {AudioNode} source - Audio source to process
   * @param {AudioNode} destination - Where to send processed audio
   */
  connect(source, destination) {
    source.connect(this.inputGain);
    this.outputGain.connect(destination);
  }

  /**
   * Disconnect from destination
   * @param {AudioNode} destination
   */
  disconnect(destination) {
    if (destination) {
      this.outputGain.disconnect(destination);
    } else {
      this.outputGain.disconnect();
    }
  }

  /**
   * Start background noise (static)
   */
  startNoise() {
    if (this.noiseSource) {
      this.stopNoise();
    }

    this.noiseSource = createNoiseSource(this.audioContext, 2);
    this.noiseSource.connect(this.noiseGain);
    this.noiseSource.start();
  }

  /**
   * Stop background noise
   */
  stopNoise() {
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.noiseSource.disconnect();
      this.noiseSource = null;
    }
  }

  /**
   * Play click-in sound (start of transmission)
   */
  playClickIn() {
    if (!this.clickInBuffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.clickInBuffer;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.3;

    source.connect(gain);
    gain.connect(this.outputGain);
    source.start();
  }

  /**
   * Play click-out sound (end of transmission)
   */
  playClickOut() {
    if (!this.clickOutBuffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.clickOutBuffer;

    const gain = this.audioContext.createGain();
    gain.gain.value = 0.2;

    source.connect(gain);
    gain.connect(this.outputGain);
    source.start();
  }

  /**
   * Set filter intensity level
   * @param {string} level - 'clean', 'normal', or 'heavy'
   */
  setIntensity(level) {
    if (!this.presets[level]) {
      console.warn(`Unknown intensity level: ${level}`);
      return;
    }

    this.intensity = level;
    const preset = this.presets[level];

    if (!this.initialized) return;

    // Apply preset values
    this.highpass.frequency.value = preset.highpassFreq;
    this.lowpass.frequency.value = preset.lowpassFreq;
    this.distortion.curve = makeDistortionCurve(preset.distortionAmount);
    this.noiseGain.gain.value = preset.noiseLevel;
    this.compressor.threshold.value = preset.compressionThreshold;
    this.compressor.ratio.value = preset.compressionRatio;
  }

  /**
   * Set output volume
   * @param {number} volume - 0.0 to 1.0
   */
  setVolume(volume) {
    if (this.outputGain) {
      this.outputGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}
