import { action, makeObservable, observable, computed } from 'mobx';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nextAnimationFrame() {
  return new Promise(requestAnimationFrame);
}

export class Timer {
  tStart: number = 0;
  tLapStart: number = 0;
  tEnd: number = 0;

  constructor(start = false) {
    makeObservable(this, {
      tStart: observable,
      tLapStart: observable,
      tEnd: observable,
    });

    if (start) {
      this.start();
    }
  }

  get current() {
    return performance.now();
  }

  start() {
    this.tStart = this.tLapStart = this.current;
  }

  lap() {
    const elapsed = this.current - this.tLapStart;
    this.tLapStart = this.current;
    return elapsed;
  }

  stop() {
    this.tEnd = this.current;
  }

  get elapsed() {
    return this.current - this.tLapStart;
  }

  get elapsedTotal() {
    return this.current - this.tStart;
  }

  get elapsedSeconds() {
    return Math.round(this.elapsed / 1000);
  }

  get elapsedSecondsTotal() {
    return Math.round(this.elapsedTotal / 1000);
  }

  speed(numItems: number) {
    return (numItems * 1000) / this.elapsedTotal;
  }
}
