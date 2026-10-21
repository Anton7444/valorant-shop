export const ENV_SIZE = 512;
const TILE = 128;

/** Flat 2D "studio": a blue plate, warm orbs and white light strips. No panorama, no gradient stand-in. */
export function drawEnvironment(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ENV_SIZE;
  const ctx = canvas.getContext('2d')!;
  const S = ENV_SIZE;

  ctx.fillStyle = '#1e3f9c';
  ctx.fillRect(0, 0, S, S);

  // Warm orbs
  const orbs: [number, number, number, string][] = [
    [0.22, 0.28, 0.2, 'rgba(255,170,70,1)'],
    [0.78, 0.62, 0.26, 'rgba(255,120,60,1)'],
    [0.5, 0.88, 0.18, 'rgba(255,200,120,1)'],
  ];
  for (const [x, y, r, c] of orbs) {
    const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // White light strips
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 24;
  ctx.translate(S * 0.5, S * 0.5);
  ctx.rotate(-0.35);
  for (const [x, w] of [[-0.32, 0.03], [-0.05, 0.07], [0.3, 0.025]] as const) {
    ctx.fillRect(x * S, -S, w * S, S * 2);
  }
  ctx.restore();

  return canvas;
}

/** Upload the canvas one TILE x TILE cell at a time instead of in a single big call. */
export function uploadTiles(gl: WebGL2RenderingContext, texture: WebGLTexture, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ENV_SIZE, ENV_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (let y = 0; y < ENV_SIZE; y += TILE) {
    for (let x = 0; x < ENV_SIZE; x += TILE) {
      const tile = ctx.getImageData(x, y, TILE, TILE);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, TILE, TILE, gl.RGBA, gl.UNSIGNED_BYTE, tile.data);
    }
  }
}
