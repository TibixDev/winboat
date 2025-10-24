import axios from 'axios';
import { WINBOAT_DIR } from './constants';

const fs: typeof import('fs/promises') = require('fs/promises');
const path: typeof import('path') = require('path');
const process: typeof import('process') = require('process');

// Window metadata from Guest Agent
export interface GuestWindowInfo {
  hwnd: number;
  title: string;
  className: string;
  processId: number;
  processName: string;
  processPath: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: string;
}

// Host-side window state with FreeRDP mapping
export interface WindowState {
  appName: string;
  appPath: string;
  freerdpPid: number | null;
  freerdpStartTime: number;
  guestWindowInfo: GuestWindowInfo | null;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastSeen: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  wmClass: string; // The winboat-{appName} identifier
}

export class WindowStateManager {
  private static instance: WindowStateManager;
  private stateFile: string;
  private states: Map<string, WindowState> = new Map(); // Key: wmClass (winboat-{appName})
  private saveTimer: NodeJS.Timeout | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.stateFile = path.join(WINBOAT_DIR, 'window-states.json');
    this.loadStates();
    this.startMonitoring();
  }

  static getInstance(): WindowStateManager {
    if (!WindowStateManager.instance) {
      WindowStateManager.instance = new WindowStateManager();
    }
    return WindowStateManager.instance;
  }

  /**
   * Register a new RemoteApp launch
   */
  registerApp(appName: string, appPath: string, freerdpPid: number): string {
    const wmClass = `winboat-${appName}`;

    const state: WindowState = {
      appName,
      appPath,
      freerdpPid,
      freerdpStartTime: Date.now(),
      guestWindowInfo: null,
      connectionState: 'connecting',
      lastSeen: Date.now(),
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
      wmClass
    };

    this.states.set(wmClass, state);
    this.scheduleSave();

    console.log(`[WindowStateManager] Registered app: ${wmClass}, PID: ${freerdpPid}`);
    return wmClass;
  }

  /**
   * Update window state with guest-side information
   */
  updateGuestInfo(wmClass: string, guestInfo: GuestWindowInfo): void {
    const state = this.states.get(wmClass);
    if (!state) return;

    state.guestWindowInfo = guestInfo;
    state.lastSeen = Date.now();

    if (state.connectionState === 'connecting') {
      state.connectionState = 'connected';
      console.log(`[WindowStateManager] Window connected: ${wmClass}`);
    }

    this.scheduleSave();
  }

  /**
   * Mark a window as disconnected (FreeRDP process died or network lost)
   */
  markDisconnected(wmClass: string): void {
    const state = this.states.get(wmClass);
    if (!state) return;

    console.log(`[WindowStateManager] Window disconnected: ${wmClass}`);
    state.connectionState = 'disconnected';
    state.freerdpPid = null;
    this.scheduleSave();
  }

  /**
   * Check if a process is still running
   */
  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      // On Unix systems, sending signal 0 checks if process exists
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Fetch current window list from Guest Agent
   */
  async fetchGuestWindows(apiPort: number): Promise<GuestWindowInfo[]> {
    try {
      const response = await axios.get(`http://localhost:${apiPort}/windows`, {
        timeout: 3000
      });

      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('[WindowStateManager] Failed to fetch guest windows:', error);
      return [];
    }
  }

  /**
   * Monitor active windows and detect disconnections
   */
  private startMonitoring(): void {
    // Check every 2 seconds for dead processes and update guest info
    this.monitoringInterval = setInterval(async () => {
      for (const [wmClass, state] of this.states.entries()) {
        // Check if FreeRDP process is still alive
        if (state.freerdpPid && !(await this.isProcessAlive(state.freerdpPid))) {
          console.log(`[WindowStateManager] FreeRDP process ${state.freerdpPid} died for ${wmClass}`);
          this.markDisconnected(wmClass);
        }

        // Remove stale disconnected entries after 5 minutes
        if (state.connectionState === 'disconnected' &&
            Date.now() - state.lastSeen > 5 * 60 * 1000) {
          console.log(`[WindowStateManager] Removing stale window: ${wmClass}`);
          this.states.delete(wmClass);
          this.scheduleSave();
        }
      }
    }, 2000);
  }

  /**
   * Get all windows that need reconnection
   */
  getDisconnectedWindows(): WindowState[] {
    return Array.from(this.states.values()).filter(
      s => s.connectionState === 'disconnected' &&
           s.reconnectAttempts < s.maxReconnectAttempts
    );
  }

  /**
   * Attempt to reconnect a disconnected window
   */
  attemptReconnect(wmClass: string, newFreerdpPid: number): void {
    const state = this.states.get(wmClass);
    if (!state) return;

    state.connectionState = 'reconnecting';
    state.freerdpPid = newFreerdpPid;
    state.reconnectAttempts++;
    state.lastSeen = Date.now();

    console.log(`[WindowStateManager] Reconnect attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts} for ${wmClass}`);
    this.scheduleSave();
  }

  /**
   * Get state for a specific window
   */
  getState(wmClass: string): WindowState | undefined {
    return this.states.get(wmClass);
  }


  getAllStates(): WindowState[] {
    return Array.from(this.states.values());
  }

  removeWindow(wmClass: string): void {
    this.states.delete(wmClass);
    this.scheduleSave();
    console.log(`[WindowStateManager] Removed window: ${wmClass}`);
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => this.saveStates(), 1000);
  }

  /**
   * Save states to disk
   */
  private async saveStates(): Promise<void> {
    try {
      const data = JSON.stringify(
        Array.from(this.states.entries()),
        null,
        2
      );
      await fs.writeFile(this.stateFile, data, 'utf-8');
    } catch (error) {
      console.error('[WindowStateManager] Failed to save states:', error);
    }
  }

  /**
   * Load states from disk
   */
  private async loadStates(): Promise<void> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      const entries = JSON.parse(data);

      // Restore Map from saved entries
      this.states = new Map(entries);

      // Mark all loaded states as disconnected (since we just started)
      for (const state of this.states.values()) {
        state.connectionState = 'disconnected';
        state.freerdpPid = null;
      }

      console.log(`[WindowStateManager] Loaded ${this.states.size} window states`);
    } catch (error) {
      // File doesn't exist yet or parse error - start fresh
      console.log('[WindowStateManager] No previous states found, starting fresh');
    }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await this.saveStates();
    console.log('[WindowStateManager] Shutdown complete');
  }
}
