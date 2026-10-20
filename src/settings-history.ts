import type { Settings } from './config.ts';

export class SettingsHistory {
  private baseline: string;
  private current: string;
  private steps: string[] = [];
  private start: string | null = null;

  constructor(settings: Settings) {
    this.baseline = this.current = JSON.stringify(settings);
  }
  get dirty() { return this.current !== this.baseline; }
  get canUndo() { return this.steps.length > 0 || (this.start !== null && this.start !== this.current); }
  begin() { this.start ??= this.current; }
  record(settings: Settings) {
    const next = JSON.stringify(settings);
    if (next === this.current) return;
    if (this.start === null) this.steps.push(this.current);
    this.current = next;
  }
  end() {
    if (this.start !== null && this.start !== this.current) this.steps.push(this.start);
    this.start = null;
  }
  undo(): Settings {
    this.end();
    this.current = this.steps.pop() ?? this.current;
    return JSON.parse(this.current);
  }
  undoAll(): Settings {
    this.current = this.baseline;
    this.steps = []; this.start = null;
    return JSON.parse(this.current);
  }
  saved(snapshot: Settings) {
    this.baseline = JSON.stringify(snapshot);
    this.steps = [];
    // A save can finish midway through a drag. Never undo across the new boundary.
    if (this.start !== null) this.start = this.current;
  }
}
