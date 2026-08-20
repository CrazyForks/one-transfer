// The status line on both tool pages doubles as the idle prompt and the live
// readout, so a failure has to LOOK different, not just read differently —
// `✗ camera: …` in the same muted grey is easy to miss entirely. The `.error`
// class is what makes it unmistakable (see .status-line.error in style.css),
// and sharing the toggle here keeps the two pages' error affordances from
// drifting apart.

export interface StatusLine {
  setStatus(message: string): void;
  showLoading(message: string): void;
  showError(message: string): void;
}

export function statusLine(el: HTMLElement): StatusLine {
  return {
    setStatus(message: string): void {
      el.classList.remove("error", "sweep-shine");
      el.textContent = message;
    },
    showLoading(message: string): void {
      el.classList.remove("error");
      el.classList.add("sweep-shine");
      el.textContent = message;
    },
    showError(message: string): void {
      el.classList.remove("sweep-shine");
      el.classList.add("error");
      el.textContent = `✗ ${message}`;
    },
  };
}
