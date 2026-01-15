/**
 * Audio utilities for Darkstar
 * Web Audio API helpers for radio effects and sound management
 */

let sharedAudioContext = null;

/**
 * Create or return a shared AudioContext
 * @returns {AudioContext}
 */
export function createAudioContext() {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext;
  }
  sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  return sharedAudioContext;
}

/**
 * Resume audio context (required after user interaction)
 * @param {AudioContext} audioContext
 */
export async function resumeAudioContext(audioContext) {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
}

/**
 * Load an audio file as an AudioBuffer
 * @param {AudioContext} audioContext
 * @param {string} url
 * @returns {Promise<AudioBuffer>}
 */
export async function loadAudioFile(audioContext, url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Play an AudioBuffer
 * @param {AudioContext} audioContext
 * @param {AudioBuffer} buffer
 * @param {Object} options
 * @returns {AudioBufferSourceNode}
 */
export function playSound(audioContext, buffer, options = {}) {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = options.volume ?? 1.0;

  source.connect(gainNode);
  gainNode.connect(options.destination || audioContext.destination);

  source.start(options.startTime || 0);
  return source;
}

/**
 * Create a white noise source for radio static
 * @param {AudioContext} audioContext
 * @param {number} duration - Duration in seconds
 * @returns {AudioBufferSourceNode}
 */
export function createNoiseSource(audioContext, duration = 1) {
  const sampleRate = audioContext.sampleRate;
  const bufferSize = sampleRate * duration;
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  // Fill with white noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  return source;
}

/**
 * Create a short click/burst sound for squelch effect
 * @param {AudioContext} audioContext
 * @param {number} duration - Duration in seconds (default 0.05)
 * @returns {AudioBuffer}
 */
export function createClickBuffer(audioContext, duration = 0.05) {
  const sampleRate = audioContext.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  // Create a burst of noise with quick attack and decay
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    // Envelope: quick attack, exponential decay
    const envelope = t < 0.1 ? t * 10 : Math.exp(-5 * (t - 0.1));
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  return buffer;
}

/**
 * Create a distortion curve for wave shaper
 * @param {number} amount - Distortion amount (0-100)
 * @returns {Float32Array}
 */
export function makeDistortionCurve(amount = 50) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const k = amount;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Soft clipping curve
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }

  return curve;
}
