/**
 * Recolours a Lottie JSON at runtime so any animation matches BiteLog,
 * without needing to know its layer names.
 *
 * Every fill / stroke / gradient colour is classified by hue and mapped onto
 * a BiteLog ramp (lime, sun, peach) while keeping its original lightness, so
 * the shading and depth of the animation survive. Greys, whites and blacks
 * are left alone.
 */
type RGB = [number, number, number];

const hexToRgb = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

// Each ramp is [dark, base, light]
const RAMPS: Record<"lime" | "sun" | "peach", RGB[]> = {
  lime: ["#3F7A0F", "#B6F36B", "#EBFFCC"].map(hexToRgb),
  sun: ["#D99A00", "#FFD166", "#FFF3C9"].map(hexToRgb),
  peach: ["#E0603A", "#FF9A76", "#FFE3D6"].map(hexToRgb),
};

const lerp = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function mapColor(rgb: RGB): RGB {
  const [h, s, l] = rgbToHsl(rgb);
  if (s < 0.18) return rgb; // neutrals stay neutral

  const ramp =
    h < 20 || h >= 340 ? RAMPS.peach : h < 70 ? RAMPS.sun : RAMPS.lime;

  const t = Math.min(Math.max(l, 0), 1);
  return t < 0.55
    ? lerp(ramp[0], ramp[1], t / 0.55)
    : lerp(ramp[1], ramp[2], (t - 0.55) / 0.45);
}

function mapArray(arr: number[], offset: number): void {
  if (arr.length < offset + 3) return;
  const scale =
    Math.max(arr[offset], arr[offset + 1], arr[offset + 2]) > 1.0001 ? 255 : 1;
  const out = mapColor([
    arr[offset] / scale,
    arr[offset + 1] / scale,
    arr[offset + 2] / scale,
  ]);
  arr[offset] = out[0] * scale;
  arr[offset + 1] = out[1] * scale;
  arr[offset + 2] = out[2] * scale;
}

/**
 * Static colour:   k = [r, g, b, a]
 * Animated colour: k = [{ s: [r, g, b, a], e: [...] }, ...]
 * Gradients store `count` stops as [offset, r, g, b] groups.
 */
function mapColorProp(prop: any, gradientStops = 0): void {
  if (!prop || !Array.isArray(prop.k)) return;

  const apply = (arr: number[]) => {
    if (gradientStops === 0) mapArray(arr, 0);
    else for (let i = 0; i < gradientStops; i++) mapArray(arr, i * 4 + 1);
  };

  if (typeof prop.k[0] === "number") {
    apply(prop.k);
    return;
  }

  for (const frame of prop.k) {
    for (const key of ["s", "e"] as const) {
      if (Array.isArray(frame?.[key])) apply(frame[key]);
    }
  }
}

function walk(node: any): void {
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  if (!node || typeof node !== "object") return;

  if (node.ty === "fl" || node.ty === "st") mapColorProp(node.c);

  if ((node.ty === "gf" || node.ty === "gs") && node.g) {
    mapColorProp(node.g.k, Number(node.g.p ?? 0));
  }

  // Solid-colour layers store a hex string.
  if (
    node.ty === 1 &&
    typeof node.sc === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(node.sc)
  ) {
    const [r, g, b] = mapColor(hexToRgb(node.sc));
    const h = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");
    node.sc = `#${h(r)}${h(g)}${h(b)}`;
  }

  for (const key of Object.keys(node)) walk(node[key]);
}

const cache = new WeakMap<object, object>();

export function recolorLottie<T extends object>(source: T): T {
  const hit = cache.get(source);
  if (hit) return hit as T;

  const clone = JSON.parse(JSON.stringify(source));
  walk(clone);
  cache.set(source, clone);
  return clone as T;
}
