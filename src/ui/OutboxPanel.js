/**
 * Panel showing pending mouse/keyboard commands with countdown timers
 * Displays in the right panel area, collapses when empty
 */
export class OutboxPanel {
  constructor(container, outbox) {
    this.container = container;
    this.outbox = outbox;

    // DOM element references
    this.header = null;
    this.entriesContainer = null;
    this.clearAllBtn = null;

    // Track if panel is expanded
    this.expanded = true;
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="outbox-header">
        <span class="outbox-title">OUTBOX</span>
        <button class="outbox-clear-all" title="Clear all pending commands">Clear All</button>
      </div>
      <div class="outbox-entries"></div>
    `;

    // Cache element references
    this.header = this.container.querySelector('.outbox-header');
    this.entriesContainer = this.container.querySelector('.outbox-entries');
    this.clearAllBtn = this.container.querySelector('.outbox-clear-all');

    // Initial state
    this.updateVisibility();
  }

  bindEvents() {
    // Clear all button
    this.clearAllBtn.addEventListener('click', () => {
      this.onClearAll();
    });

    // Toggle expand/collapse on header click
    this.header.addEventListener('click', (e) => {
      if (e.target !== this.clearAllBtn) {
        this.toggleExpand();
      }
    });
  }

  /**
   * Update the panel display (called from game loop)
   * @param {number} delta - Time since last update in seconds
   */
  update(delta) {
    const queue = this.outbox.getQueue();
    this.renderEntries(queue);
    this.updateVisibility();
  }

  /**
   * Render all pending command entries
   * @param {Array} queue
   */
  renderEntries(queue) {
    if (queue.length === 0) {
      this.entriesContainer.innerHTML = '';
      return;
    }

    const now = Date.now();
    const holdTime = this.outbox.holdTime;

    let html = '';
    for (const entry of queue) {
      if (entry.sent) continue;

      const elapsed = now - entry.addedAt;
      const remaining = Math.max(0, holdTime - elapsed);
      const progress = Math.min(100, (elapsed / holdTime) * 100);

      const cmd = entry.command;
      const paramStr = this.formatParams(cmd);

      html += `
        <div class="outbox-entry" data-id="${entry.id}">
          <div class="outbox-entry-info">
            <span class="outbox-callsign">${cmd.callsign}</span>
            <span class="outbox-command">${cmd.type}${paramStr}</span>
          </div>
          <div class="outbox-countdown">
            <div class="outbox-progress" style="width: ${progress}%"></div>
            <span class="outbox-time">${(remaining / 1000).toFixed(1)}s</span>
          </div>
          <div class="outbox-actions">
            <button class="outbox-send-now" title="Send immediately">▶</button>
            <button class="outbox-cancel" title="Cancel command">✕</button>
          </div>
        </div>
      `;
    }

    this.entriesContainer.innerHTML = html;

    // Bind action buttons
    this.entriesContainer.querySelectorAll('.outbox-entry').forEach(entryEl => {
      const id = parseInt(entryEl.dataset.id, 10);

      entryEl.querySelector('.outbox-send-now').addEventListener('click', () => {
        this.onSendNow(id);
      });

      entryEl.querySelector('.outbox-cancel').addEventListener('click', () => {
        this.onCancel(id);
      });
    });
  }

  /**
   * Format command parameters for display
   * @param {Object} cmd
   * @returns {string}
   */
  formatParams(cmd) {
    if (!cmd.params) return '';

    const parts = [];
    if (cmd.params.heading !== undefined) {
      parts.push(cmd.params.heading + '°');
    }
    if (cmd.params.altitude !== undefined) {
      parts.push('A' + Math.round(cmd.params.altitude / 1000));
    }
    if (cmd.params.target !== undefined) {
      parts.push(cmd.params.target);
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : '';
  }

  /**
   * Update panel visibility based on queue state
   */
  updateVisibility() {
    const queue = this.outbox.getQueue();
    const hasEntries = queue.some(e => !e.sent);

    // Show/hide panel based on content
    this.container.classList.toggle('empty', !hasEntries);
    this.container.classList.toggle('collapsed', !this.expanded && hasEntries);
  }

  /**
   * Toggle panel expand/collapse
   */
  toggleExpand() {
    this.expanded = !this.expanded;
    this.updateVisibility();
  }

  /**
   * Cancel a specific command
   * @param {number} commandId
   */
  onCancel(commandId) {
    this.outbox.cancel(commandId);
  }

  /**
   * Clear all pending commands
   */
  onClearAll() {
    this.outbox.clearAll();
  }

  /**
   * Send a command immediately
   * @param {number} commandId
   */
  onSendNow(commandId) {
    this.outbox.sendNow(commandId);
  }

  /**
   * Show the panel
   */
  show() {
    this.container.classList.remove('hidden');
  }

  /**
   * Hide the panel
   */
  hide() {
    this.container.classList.add('hidden');
  }
}
