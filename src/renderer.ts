import { DOT_COLS, DOT_ROWS } from './screen';
import type { Palette, RGB } from './palette';

/**
 * Turns the logical DOT_COLS x DOT_ROWS RGBA dot buffer into the gorgeous
 * on-screen LCD: rounded dot-matrix cells sitting in a dark grid, scanlines,
 * bloom/glow around lit dots, palette panel tint, and a soft vignette.
 *
 * Primary path is a single WebGL fragment shader (all the pretty per-pixel work
 * happens on the GPU, so it stays smooth at 60fps on a phone). If WebGL is
 * unavailable we fall back to a 2D upscale plus overlay so it still looks like
 * a dot-matrix screen, just cheaper.
 */
export interface Renderer {
  resize(cssW: number, cssH: number, dpr: number): void;
  render(rgba: Uint8ClampedArray, palette: Palette): void;
  readonly kind: 'webgl' | 'canvas2d';
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uGrid;    // dots across, down
uniform vec2 uRes;     // output resolution in device px
uniform vec3 uGlow;    // bloom tint
varying vec2 vUv;

vec3 samp(vec2 cell) {
  vec2 uv = (cell + 0.5) / uGrid;
  return texture2D(uTex, uv).rgb;
}

void main() {
  vec2 g = vUv * uGrid;
  vec2 cell = floor(g);
  vec2 local = fract(g);

  vec3 col = samp(cell);

  // Rounded-square LCD pixel with a thin gap. The gap is a darker shade of the
  // pixel's OWN color (like a real dot-matrix grid line) so light pixels stay
  // light and dark pixels stay dark — high, readable contrast either way.
  vec2 d2 = abs(local - 0.5);
  float dist = max(d2.x, d2.y) * 1.02 + length(d2) * 0.30;
  float mask = smoothstep(0.52, 0.40, dist);
  vec3 lcd = mix(col * 0.55, col, mask);

  // Glow scales with a pixel's OWN brightness, so lit dots bloom softly while
  // dark text is never washed out. Bleeds a touch into its gap for a subtle halo.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  lcd += uGlow * lum * lum * (0.14 + 0.10 * mask);

  // Subtle scanlines tied to output rows.
  float scan = 0.94 + 0.06 * sin(vUv.y * uRes.y * 3.14159);

  // Gentle vignette.
  float vig = smoothstep(1.05, 0.32, length(vUv - 0.5) * 1.1);

  vec3 outc = lcd * scan * (0.85 + 0.15 * vig);
  gl_FragColor = vec4(outc, 1.0);
}`;

function norm(rgb: RGB): [number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader compile failed: ' + log);
  }
  return sh;
}

class WebGLRenderer implements Renderer {
  readonly kind = 'webgl' as const;
  private gl: WebGLRenderingContext;
  private uGrid: WebGLUniformLocation | null;
  private uRes: WebGLUniformLocation | null;
  private uGlow: WebGLUniformLocation | null;
  private tex: WebGLTexture;
  private texView = new Uint8Array(DOT_COLS * DOT_ROWS * 4);

  constructor(private canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.gl = gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    // Fullscreen quad (two triangles).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uGrid = gl.getUniformLocation(prog, 'uGrid');
    this.uRes = gl.getUniformLocation(prog, 'uRes');
    this.uGlow = gl.getUniformLocation(prog, 'uGlow');
    gl.uniform2f(this.uGrid, DOT_COLS, DOT_ROWS);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    if (this.uRes) this.gl.uniform2f(this.uRes, w, h);
  }

  render(rgba: Uint8ClampedArray, palette: Palette): void {
    const gl = this.gl;
    this.texView.set(rgba);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      DOT_COLS,
      DOT_ROWS,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.texView,
    );
    if (this.uGlow) gl.uniform3fv(this.uGlow, norm(palette.glow));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private w = 1;
  private h = 1;

  constructor(private canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.off = document.createElement('canvas');
    this.off.width = DOT_COLS;
    this.off.height = DOT_ROWS;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(DOT_COLS, DOT_ROWS);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.w = Math.max(1, Math.round(cssW * dpr));
    this.h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== this.w || this.canvas.height !== this.h) {
      this.canvas.width = this.w;
      this.canvas.height = this.h;
    }
  }

  render(rgba: Uint8ClampedArray, palette: Palette): void {
    this.img.data.set(rgba);
    this.offCtx.putImageData(this.img, 0, 0);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const [pr, pg, pb] = palette.tones[3];
    ctx.fillStyle = `rgb(${pr * 0.35},${pg * 0.35},${pb * 0.35})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.drawImage(this.off, 0, 0, this.w, this.h);

    // Scanline overlay.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.round(this.h / DOT_ROWS));
    for (let y = 0; y < this.h; y += step) ctx.fillRect(0, y, this.w, 1);
    ctx.globalAlpha = 1;
  }
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  try {
    const attrs: WebGLContextAttributes = {
      antialias: false,
      alpha: false,
      // Keeps the LCD buffer readable for screenshots / share features / tests.
      preserveDrawingBuffer: true,
    };
    const gl =
      (canvas.getContext('webgl', attrs) as WebGLRenderingContext) ||
      (canvas.getContext('experimental-webgl', attrs) as WebGLRenderingContext);
    if (gl) return new WebGLRenderer(canvas, gl);
  } catch {
    /* fall through */
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context available');
  return new Canvas2DRenderer(canvas, ctx);
}
