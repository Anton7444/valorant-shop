import { useEffect, useRef } from 'react';
import { BLUR_FRAGMENT, CARD_FRAGMENT, VERTEX } from './shaders';
import { drawEnvironment, ENV_SIZE, uploadTiles } from './environment';

const STIFFNESS = 120;
const DAMPING = 16;
const MAX_TILT_DEG = 12;
const BLUR_SPREAD = 4;

let webgl2Supported: boolean | null = null;
function hasWebGL2(): boolean {
  if (webgl2Supported === null) {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    webgl2Supported = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return webgl2Supported;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

function makeTarget(gl: WebGL2RenderingContext) {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ENV_SIZE, ENV_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  setSampling(gl);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, fbo };
}

function setSampling(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

interface ReflectiveLayerProps {
  /** Corner radius in CSS px (matches the parent's border-radius). */
  radius?: number;
  /** Also tilt the parent element with CSS, using the same spring angles as the normal. */
  tiltParent?: boolean;
  className?: string;
}

/**
 * Metal reflection drawn with WebGL2 that fills its parent. Pointer movement over the
 * parent drives a spring (k=120, c=16, +-12deg); the same angles tilt the surface normal
 * and, with `tiltParent`, the parent's CSS transform. Leaving the parent springs back to flat.
 */
export default function ReflectiveLayer({ radius = 24, tiltParent = false, className = '' }: ReflectiveLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const supported = hasWebGL2();

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || !supported) return;

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return;

    let programs: WebGLProgram[] = [];
    let textures: WebGLTexture[] = [];
    let fbos: WebGLFramebuffer[] = [];
    let buffer: WebGLBuffer | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let raf = 0;
    let lost = false;

    function cleanup() {
      cancelAnimationFrame(raf);
      parent!.removeEventListener('pointermove', onMove);
      parent!.removeEventListener('pointerleave', onLeave);
      canvas!.removeEventListener('webglcontextlost', onLost);
      if (!lost) {
        programs.forEach((p) => gl!.deleteProgram(p));
        textures.forEach((t) => gl!.deleteTexture(t));
        fbos.forEach((f) => gl!.deleteFramebuffer(f));
        if (buffer) gl!.deleteBuffer(buffer);
        if (vao) gl!.deleteVertexArray(vao);
      }
      programs = [];
      textures = [];
      fbos = [];
      gl!.getExtension('WEBGL_lose_context')?.loseContext();
      if (tiltParent) parent!.style.transform = '';
    }

    function onLost(event: Event) {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
    }
    canvas.addEventListener('webglcontextlost', onLost);

    // Spring state, degrees. x = rotateX, y = rotateY.
    const pos = { x: 0, y: 0 };
    const vel = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    function onMove(event: PointerEvent) {
      const rect = parent!.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      target.y = Math.max(-1, Math.min(1, nx)) * MAX_TILT_DEG;
      target.x = -Math.max(-1, Math.min(1, ny)) * MAX_TILT_DEG;
    }
    function onLeave() {
      target.x = 0;
      target.y = 0;
    }
    parent.addEventListener('pointermove', onMove);
    parent.addEventListener('pointerleave', onLeave);

    try {
      // Environment -> texture, uploaded cell by cell
      const envTex = gl.createTexture()!;
      textures.push(envTex);
      uploadTiles(gl, envTex, drawEnvironment());
      setSampling(gl);

      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const blurProgram = link(gl, BLUR_FRAGMENT);
      const cardProgram = link(gl, CARD_FRAGMENT);
      programs.push(blurProgram, cardProgram);

      // Horizontal blur then vertical blur, once: the environment never changes.
      const a = makeTarget(gl);
      const b = makeTarget(gl);
      textures.push(a.texture, b.texture);
      fbos.push(a.fbo, b.fbo);

      gl.viewport(0, 0, ENV_SIZE, ENV_SIZE);
      gl.useProgram(blurProgram);
      gl.uniform1i(gl.getUniformLocation(blurProgram, 'uTex'), 0);
      const uStep = gl.getUniformLocation(blurProgram, 'uStep');
      gl.activeTexture(gl.TEXTURE0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.bindTexture(gl.TEXTURE_2D, envTex);
      gl.uniform2f(uStep, BLUR_SPREAD / ENV_SIZE, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.bindTexture(gl.TEXTURE_2D, a.texture);
      gl.uniform2f(uStep, 0, BLUR_SPREAD / ENV_SIZE);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(cardProgram);
      gl.uniform1i(gl.getUniformLocation(cardProgram, 'uEnv'), 0);
      gl.bindTexture(gl.TEXTURE_2D, b.texture);
      const uRes = gl.getUniformLocation(cardProgram, 'uRes');
      const uRadius = gl.getUniformLocation(cardProgram, 'uRadius');
      const uBevel = gl.getUniformLocation(cardProgram, 'uBevel');
      const uTilt = gl.getUniformLocation(cardProgram, 'uTilt');

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      let lastDpr = 0;
      let lastW = 0;
      let lastH = 0;
      let lastTime = performance.now();
      let dirty = true;

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);

        // DPR / size are checked every frame; the buffer and viewport are only touched on change.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (dpr !== lastDpr || w !== lastW || h !== lastH) {
          lastDpr = dpr;
          lastW = w;
          lastH = h;
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
          gl.uniform2f(uRes, w, h);
          gl.uniform1f(uRadius, radius * dpr);
          gl.uniform1f(uBevel, 18 * dpr);
          dirty = true;
        }

        // Critically-damped-ish spring, semi-implicit Euler in small steps.
        const dt = Math.min((now - lastTime) / 1000, 1 / 20);
        lastTime = now;
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h2 = dt / steps;
        for (let i = 0; i < steps; i++) {
          for (const k of ['x', 'y'] as const) {
            vel[k] += (-STIFFNESS * (pos[k] - target[k]) - DAMPING * vel[k]) * h2;
            pos[k] += vel[k] * h2;
          }
        }
        const moving =
          Math.abs(vel.x) + Math.abs(vel.y) > 0.01 || Math.abs(pos.x - target.x) + Math.abs(pos.y - target.y) > 0.01;
        if (!moving) {
          pos.x = target.x;
          pos.y = target.y;
          vel.x = vel.y = 0;
        }

        if (moving || dirty) {
          const rx = (pos.x * Math.PI) / 180;
          const ry = (pos.y * Math.PI) / 180;
          if (tiltParent) {
            parent.style.transform = `perspective(900px) rotateX(${pos.x.toFixed(3)}deg) rotateY(${pos.y.toFixed(3)}deg)`;
          }
          // Same angles feed the normal: sin(angle) is the slope of the tilted plane.
          gl.uniform2f(uTilt, Math.sin(ry), Math.sin(rx));
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          dirty = false;
        }
      };
      raf = requestAnimationFrame(frame);
    } catch (err) {
      console.warn('Reflective layer disabled:', err);
    }

    return cleanup;
  }, [supported, radius, tiltParent]);

  if (!supported) {
    // No WebGL2: a static brushed-steel gradient instead.
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{
          background:
            'linear-gradient(135deg, #3a4150 0%, #aeb6c4 28%, #4a5262 46%, #d9dfea 62%, #596173 100%)',
          borderRadius: radius,
        }}
      />
    );
  }
  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ borderRadius: radius }} />;
}
