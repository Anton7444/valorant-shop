export const VERTEX = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// One 13-tap gaussian pass; run once along x and once along y.
export const BLUR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uStep; // one texel along the blur direction, times the spread
void main() {
  float w[7] = float[7](0.1964, 0.1745, 0.1210, 0.0657, 0.0279, 0.0093, 0.0024);
  vec4 sum = texture(uTex, vUv) * w[0];
  for (int i = 1; i < 7; i++) {
    vec2 o = uStep * float(i);
    sum += texture(uTex, vUv + o) * w[i];
    sum += texture(uTex, vUv - o) * w[i];
  }
  outColor = sum / (w[0] + 2.0 * (w[1] + w[2] + w[3] + w[4] + w[5] + w[6]));
}`;

export const CARD_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uEnv;   // blurred flat environment map
uniform vec2 uRes;        // drawing buffer size, device px
uniform float uRadius;    // corner radius, device px
uniform float uBevel;     // bevel width, device px
uniform vec2 uTilt;       // (rotateY, rotateX) in radians, same values as the CSS transform

float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 p = (vUv - 0.5) * uRes;
  float d = sdRoundBox(p, uRes * 0.5, uRadius);

  // Bevelled edge: the normal leans outwards, more so closer to the rim.
  float e = clamp(-d / uBevel, 0.0, 1.0);
  float slope = pow(1.0 - e, 2.0);
  vec2 g = vec2(dFdx(d), dFdy(d));
  g = length(g) > 0.0001 ? normalize(g) : vec2(0.0);
  vec2 bevel = g * slope * 1.1;

  // Fine brushed-metal grain in the normal.
  vec2 gp = p * 0.6;
  vec2 grain = vec2(vnoise(gp) - 0.5, vnoise(gp + 17.3) - 0.5) * 0.03;

  vec3 N = normalize(vec3(bevel + grain + uTilt * vec2(3.2, -3.2), 1.0));
  vec3 I = vec3(0.0, 0.0, -1.0);       // camera -> surface
  vec3 R = reflect(I, N);
  vec2 q = R.xy / max(R.z, 0.2);
  vec2 uv = vUv + 0.12 * q;

  vec3 env = texture(uEnv, clamp(uv, 0.0, 1.0)).rgb;
  float lum = dot(env, vec3(0.299, 0.587, 0.114));   // desaturate: steel, not a photo
  float metal = clamp(pow(lum, 0.85) * 1.35, 0.0, 1.0);
  vec3 col = vec3(metal) * vec3(0.90, 0.94, 1.0) + slope * 0.16;

  float coverage = 1.0 - smoothstep(-1.0, 1.0, d);
  outColor = vec4(col * coverage, coverage);
}`;
