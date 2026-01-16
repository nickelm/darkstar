import { AIRCRAFT_ICONS, GENERAL_ICONS } from '../data/aircraft.js';

// Color constants for tinting
const SIDE_COLORS = {
  blue: '#00BFFF',
  red: '#FF4444'
};

// Get the base URL from Vite (handles /darkstar/ subpath)
const BASE_URL = import.meta.env.BASE_URL || '/';

/**
 * Icon loader and cache for aircraft silhouettes
 * Preloads SVG icons and creates tinted versions for efficient canvas rendering
 */
export class IconLoader {
  constructor() {
    this.rawImages = new Map();      // iconKey -> HTMLImageElement (original)
    this.tintedCache = new Map();    // 'iconKey-side' -> HTMLImageElement (tinted)
    this.loadPromises = new Map();   // Track pending loads
    this.loaded = false;
  }

  /**
   * Preload all aircraft icons and create tinted versions
   * @returns {Promise<void>}
   */
  async preloadAll() {
    if (this.loaded) return;

    const allIcons = { ...AIRCRAFT_ICONS, ...GENERAL_ICONS };
    const loadPromises = [];

    for (const [iconKey, path] of Object.entries(allIcons)) {
      // Prepend base URL, removing leading slash from path to avoid double slash
      const fullPath = BASE_URL + path.replace(/^\//, '');
      loadPromises.push(this.loadIcon(iconKey, fullPath));
    }

    await Promise.all(loadPromises);

    // Create tinted versions for both sides
    for (const iconKey of this.rawImages.keys()) {
      this.createTintedIcon(iconKey, 'blue');
      this.createTintedIcon(iconKey, 'red');
    }

    this.loaded = true;
    console.log(`IconLoader: Loaded ${this.rawImages.size} icons`);
  }

  /**
   * Load a single SVG as an Image
   * @param {string} iconKey
   * @param {string} path
   * @returns {Promise<HTMLImageElement|null>}
   */
  async loadIcon(iconKey, path) {
    if (this.loadPromises.has(iconKey)) {
      return this.loadPromises.get(iconKey);
    }

    const promise = new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        this.rawImages.set(iconKey, img);
        resolve(img);
      };

      img.onerror = () => {
        console.warn(`IconLoader: Failed to load icon ${iconKey} from ${path}`);
        resolve(null);
      };

      img.src = path;
    });

    this.loadPromises.set(iconKey, promise);
    return promise;
  }

  /**
   * Create a tinted version of an icon using offscreen canvas
   * @param {string} iconKey
   * @param {string} side - 'blue' or 'red'
   * @returns {HTMLImageElement|null}
   */
  createTintedIcon(iconKey, side) {
    const original = this.rawImages.get(iconKey);
    if (!original) return null;

    const color = SIDE_COLORS[side];
    if (!color) return null;

    const cacheKey = `${iconKey}-${side}`;
    if (this.tintedCache.has(cacheKey)) {
      return this.tintedCache.get(cacheKey);
    }

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    const size = 64; // Fixed size for cache
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw original icon scaled to fixed size
    ctx.drawImage(original, 0, 0, size, size);

    // Apply tint using source-in composite operation
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    // Convert canvas to Image for efficient reuse
    const tinted = new Image();
    tinted.src = canvas.toDataURL();

    this.tintedCache.set(cacheKey, tinted);
    return tinted;
  }

  /**
   * Get a tinted icon for rendering
   * @param {string} iconKey
   * @param {string} side - 'blue' or 'red'
   * @returns {HTMLImageElement|null}
   */
  getIcon(iconKey, side) {
    const cacheKey = `${iconKey}-${side}`;
    return this.tintedCache.get(cacheKey) || null;
  }

  /**
   * Check if an icon exists for a given key
   * @param {string} iconKey
   * @returns {boolean}
   */
  hasIcon(iconKey) {
    return this.rawImages.has(iconKey);
  }

  /**
   * Get a raw (untinted) icon
   * @param {string} iconKey
   * @returns {HTMLImageElement|null}
   */
  getRawIcon(iconKey) {
    return this.rawImages.get(iconKey) || null;
  }
}

// Export singleton instance
export const iconLoader = new IconLoader();
