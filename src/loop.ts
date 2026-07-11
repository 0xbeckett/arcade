/**
 * A fixed-timestep loop. update() is called with a constant dt (60Hz) as many
 * times as needed to catch up to real time; render() is called once per
 * animation frame. This keeps game logic deterministic and frame-rate
 * independent while rendering as smoothly as the device allows.
 */
export interface LoopCallbacks {
  /** Advance simulation by exactly `step` ms. */
  update(dtMs: number): void;
  /** Draw the current frame. */
  render(): void;
}

export class GameLoop {
  /** Fixed simulation step, in ms (60Hz). Games receive exactly this dt. */
  readonly step = 1000 / 60;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private readonly maxSteps = 5; // guard against the spiral of death

  constructor(private cb: LoopCallbacks) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (t: number): void => {
    if (!this.running) return;
    let delta = t - this.last;
    this.last = t;
    // If the tab was backgrounded, don't try to replay minutes of ticks.
    if (delta > 250) delta = 250;
    this.acc += delta;

    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.cb.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    if (steps >= this.maxSteps) this.acc = 0; // drop any remaining backlog

    this.cb.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
