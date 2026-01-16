/**
 * Settings persistence wrapper using localStorage
 */

const STORAGE_KEY = 'darkstar_settings';

const DEFAULTS = {
  voiceInputEnabled: true,
  voiceInputSensitivity: 0.5,
  voiceOutputEnabled: true,
  voiceOutputVolume: 0.8,
  autoPauseNewContact: true,
  autoPauseMissileLaunch: true,
  autoPauseMerge: true,
  autoPauseBingo: false,
  difficulty: 'normal'  // 'easy', 'normal', 'hard'
};

export class Settings {
  constructor() {
    this.cache = null;
    this.listeners = new Map();
  }

  /**
   * Load all settings from localStorage
   * @returns {Object}
   */
  load() {
    if (this.cache) return this.cache;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.cache = { ...DEFAULTS, ...JSON.parse(stored) };
      } else {
        this.cache = { ...DEFAULTS };
      }
    } catch (e) {
      console.warn('Failed to load settings, using defaults:', e);
      this.cache = { ...DEFAULTS };
    }

    return this.cache;
  }

  /**
   * Get a single setting value
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    const settings = this.load();
    return key in settings ? settings[key] : DEFAULTS[key];
  }

  /**
   * Set a single setting value
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    const settings = this.load();
    const oldValue = settings[key];
    settings[key] = value;
    this.cache = settings;
    this.save();

    // Notify listeners
    if (this.listeners.has(key)) {
      for (const callback of this.listeners.get(key)) {
        callback(value, oldValue);
      }
    }
  }

  /**
   * Set multiple settings at once
   * @param {Object} values
   */
  setMultiple(values) {
    const settings = this.load();
    for (const [key, value] of Object.entries(values)) {
      const oldValue = settings[key];
      settings[key] = value;

      // Notify listeners
      if (this.listeners.has(key)) {
        for (const callback of this.listeners.get(key)) {
          callback(value, oldValue);
        }
      }
    }
    this.cache = settings;
    this.save();
  }

  /**
   * Get all settings
   * @returns {Object}
   */
  getAll() {
    return { ...this.load() };
  }

  /**
   * Save current cache to localStorage
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  /**
   * Reset all settings to defaults
   */
  reset() {
    this.cache = { ...DEFAULTS };
    this.save();

    // Notify all listeners
    for (const [key, callbacks] of this.listeners) {
      const value = this.cache[key];
      for (const callback of callbacks) {
        callback(value, undefined);
      }
    }
  }

  /**
   * Subscribe to changes for a specific setting
   * @param {string} key
   * @param {Function} callback - (newValue, oldValue) => void
   * @returns {Function} Unsubscribe function
   */
  onChange(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    return () => {
      this.listeners.get(key).delete(callback);
    };
  }

  /**
   * Get default value for a setting
   * @param {string} key
   * @returns {*}
   */
  getDefault(key) {
    return DEFAULTS[key];
  }

  /**
   * Check if a setting has been modified from default
   * @param {string} key
   * @returns {boolean}
   */
  isModified(key) {
    return this.get(key) !== DEFAULTS[key];
  }
}

// Export singleton instance
export const settings = new Settings();
