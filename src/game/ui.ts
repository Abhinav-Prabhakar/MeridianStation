import * as THREE from "three";

/** All DOM overlay work in one place: toast, prompt, notebook, inspect. */
export class Ui {
  private toastEl = document.getElementById("toast")!;
  private promptEl = document.getElementById("prompt")!;
  private reticle = document.getElementById("reticle")!;
  private notebook = document.getElementById("notebook")!;
  private noteBody = document.getElementById("noteBody")!;
  private inspectEl = document.getElementById("inspect")!;
  private inspectImg = document.getElementById("inspectimg") as HTMLImageElement;
  private inspectCap = document.getElementById("inspectcap")!;

  private timer = 0;
  inspecting = false;
  onInspectClose: (() => void) | null = null;

  constructor() {
    this.inspectEl.addEventListener("click", () => this.closeInspect());
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.inspecting) this.closeInspect();
    });
  }

  toast(msg: string, ms = 4200) {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.add("on");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.toastEl.classList.remove("on"), ms);
  }

  setPrompt(html: string | null) {
    if (!html) {
      this.promptEl.classList.remove("on");
      this.reticle.classList.remove("hot");
    } else {
      this.promptEl.innerHTML = html;
      this.promptEl.classList.add("on");
      this.reticle.classList.add("hot");
    }
  }

  inspect(url: string, caption: string) {
    this.inspectImg.src = url;
    this.inspectCap.textContent = caption;
    this.inspectEl.classList.add("on");
    this.inspecting = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.setPrompt(null);
  }

  closeInspect() {
    this.inspectEl.classList.remove("on");
    this.inspecting = false;
    this.onInspectClose?.();
  }

  toggleNotebook() {
    this.notebook.classList.toggle("on");
  }

  get notebookOpen() {
    return this.notebook.classList.contains("on");
  }

  renderNotebook(html: string) {
    this.noteBody.innerHTML = html;
    document.getElementById("hintbtn")?.addEventListener("click", () => {
      this.onHint?.();
    });
  }

  onHint: (() => void) | null = null;
}

/**
 * A canvas-backed texture for live readouts (frequency counters, number
 * windows). Redraw only when the value changes.
 */
export class LiveText {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;

  constructor(
    public w: number,
    public h: number,
    private fill = "#0b0d0a"
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const g = this.ctx;
    g.fillStyle = this.fill;
    g.fillRect(0, 0, this.w, this.h);
    fn(g, this.w, this.h);
    this.texture.needsUpdate = true;
  }
}
