import type { WorkforceDay, WorkforcePayload } from "./workforce";
type Snapshot = { date: string; revision: number; payload: WorkforcePayload };
type Callbacks = {
  persist: (snapshot: Snapshot) => Promise<WorkforceDay>;
  saved: (result: WorkforceDay, current: WorkforcePayload) => void;
  failed: (error: Error) => void;
  saving: (value: boolean) => void;
};
/** Serialize autosaves and keep edits made while a request is in flight. */
export class WorkforceSaveQueue {
  private current: Snapshot | null = null;
  private baseline = "";
  private generation = 0;
  private pending: Promise<boolean> | null = null;
  private stopped = false;
  constructor(private callbacks: Callbacks) {}
  reset(date: string, revision: number, payload: WorkforcePayload) {
    this.generation++;
    this.current = { date, revision, payload: structuredClone(payload) };
    this.baseline = JSON.stringify(payload);
    this.stopped = false;
  }
  update(payload: WorkforcePayload) {
    if (this.current) this.current.payload = structuredClone(payload);
  }
  get dirty() { return !!this.current && JSON.stringify(this.current.payload) !== this.baseline; }
  get blocked() { return this.stopped; }
  flush(retry = false): Promise<boolean> {
    if (this.pending) return this.pending;
    if (retry) this.stopped = false;
    if (this.stopped) return Promise.resolve(false);
    if (!this.dirty) return Promise.resolve(true);
    const generation = this.generation;
    this.callbacks.saving(true);
    this.pending = this.run(generation).finally(() => {
      this.pending = null;
      this.callbacks.saving(false);
    });
    return this.pending;
  }
  private async run(generation: number): Promise<boolean> {
    try {
      while (generation === this.generation && this.current && this.dirty) {
        const snapshot = structuredClone(this.current);
        const sent = JSON.stringify(snapshot.payload);
        const result = await this.callbacks.persist(snapshot);
        if (generation !== this.generation || !this.current) return false;
        this.current.revision = result.revision;
        this.baseline = JSON.stringify(result.payload);
        if (JSON.stringify(this.current.payload) === sent) this.current.payload = structuredClone(result.payload);
        this.callbacks.saved(result, structuredClone(this.current.payload));
      }
      return generation === this.generation;
    } catch (e) {
      if (generation === this.generation) {
        this.stopped = true;
        this.callbacks.failed(e instanceof Error ? e : new Error("Unable to save."));
      }
      return false;
    }
  }
}
