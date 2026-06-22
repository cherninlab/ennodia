import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outFile = fileURLToPath(new URL("../public/lottie/ennodia-peer-review.json", import.meta.url));

const width = 800;
const height = 520;
const frames = 300;
let nextLayerIndex = 1;

type LottieValue = number | number[];

type Keyframe = {
  t: number;
  s: LottieValue;
  e?: LottieValue;
};

const colors = {
  ink: "#111111",
  muted: "#696b72",
  faint: "#cfd0d3",
  line: "#e6e6e2",
  surface: "#fbfbfa",
  soft: "#f2f2ef"
};

function rgb(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    1
  ];
}

function prop(k: LottieValue | [number, number, number, number]) {
  return { a: 0, k };
}

function easeFor(value: LottieValue) {
  const length = Array.isArray(value) ? value.length : 1;
  return {
    i: { x: Array(length).fill(0.667), y: Array(length).fill(1) },
    o: { x: Array(length).fill(0.333), y: Array(length).fill(0) }
  };
}

function animated(keyframes: Keyframe[]) {
  return {
    a: 1,
    k: keyframes.map((frame, index) => {
      const next = keyframes[index + 1];
      if (!next) {
        return { t: frame.t, s: frame.s };
      }

      return {
        t: frame.t,
        s: frame.s,
        e: frame.e ?? next.s,
        ...easeFor(frame.s)
      };
    })
  };
}

function transform({
  x = 0,
  y = 0,
  scale = [100, 100, 100],
  opacity = 100,
  rotation = 0
}: {
  x?: number;
  y?: number;
  scale?: LottieValue;
  opacity?: LottieValue;
  rotation?: number;
}) {
  return {
    o: typeof opacity === "number" ? prop(opacity) : animated(opacity as unknown as Keyframe[]),
    r: prop(rotation),
    p: prop([x, y, 0]),
    a: prop([0, 0, 0]),
    s: Array.isArray(scale) && typeof scale[0] === "object"
      ? animated(scale as unknown as Keyframe[])
      : prop(scale as number[])
  };
}

function layer(name: string, shapes: unknown[], options: { x?: number; y?: number; opacity?: number | Keyframe[]; scale?: number[] | Keyframe[]; rotation?: number } = {}) {
  return {
    ddd: 0,
    ind: nextLayerIndex++,
    ty: 4,
    nm: name,
    sr: 1,
    ks: transform({
      x: options.x ?? 0,
      y: options.y ?? 0,
      opacity: (options.opacity ?? 100) as LottieValue,
      scale: (options.scale ?? [100, 100, 100]) as LottieValue,
      rotation: options.rotation ?? 0
    }),
    ao: 0,
    shapes,
    ip: 0,
    op: frames,
    st: 0,
    bm: 0
  };
}

function group(name: string, items: unknown[]) {
  return {
    ty: "gr",
    nm: name,
    it: [
      ...items,
      {
        ty: "tr",
        p: prop([0, 0]),
        a: prop([0, 0]),
        s: prop([100, 100]),
        r: prop(0),
        o: prop(100),
        sk: prop(0),
        sa: prop(0)
      }
    ]
  };
}

function ellipse(size: number) {
  return {
    ty: "el",
    nm: "Circle",
    p: prop([0, 0]),
    s: prop([size, size]),
    d: 1
  };
}

function roundedRect(width: number, height: number, radius: number) {
  return {
    ty: "rc",
    nm: "Rounded rectangle",
    p: prop([0, 0]),
    s: prop([width, height]),
    r: prop(radius),
    d: 1
  };
}

function pathShape(points: [number, number][], closed = false) {
  return {
    ty: "sh",
    nm: "Path",
    ks: {
      a: 0,
      k: {
        c: closed,
        i: points.map(() => [0, 0]),
        o: points.map(() => [0, 0]),
        v: points
      }
    }
  };
}

function stroke(color: string, width: number, opacity = 100) {
  return {
    ty: "st",
    nm: "Stroke",
    c: prop(rgb(color)),
    o: prop(opacity),
    w: prop(width),
    lc: 2,
    lj: 2,
    ml: 4,
    bm: 0
  };
}

function fill(color: string, opacity = 100) {
  return {
    ty: "fl",
    nm: "Fill",
    c: prop(rgb(color)),
    o: prop(opacity),
    r: 1,
    bm: 0
  };
}

function trim(start: number, end: number) {
  return {
    ty: "tm",
    nm: "Trace reveal",
    s: prop(0),
    e: animated([
      { t: start, s: [0] },
      { t: end, s: [100] },
      { t: frames, s: [100] }
    ]),
    o: prop(0),
    m: 1
  };
}

function node(name: string, x: number, y: number, size: number, start: number, variant: "circle" | "hub" | "diamond" | "rect" = "circle") {
  const scaleFrames: Keyframe[] = [
    { t: Math.max(0, start - 8), s: [84, 84, 100] },
    { t: start + 12, s: [100, 100, 100] },
    { t: start + 170, s: [100, 100, 100] },
    { t: start + 196, s: [106, 106, 100] },
    { t: frames, s: [100, 100, 100] }
  ];

  const opacityFrames: Keyframe[] = [
    { t: Math.max(0, start - 10), s: [0] },
    { t: start + 10, s: [100] },
    { t: frames, s: [100] }
  ];

  const shape =
    variant === "diamond"
      ? pathShape([[0, -size * 0.58], [size * 0.58, 0], [0, size * 0.58], [-size * 0.58, 0]], true)
      : variant === "rect"
        ? roundedRect(size * 1.18, size * 0.84, 10)
        : ellipse(size);

  return layer(
    name,
    [
      group(`${name} body`, [
        shape,
        fill(variant === "hub" ? colors.ink : colors.surface, variant === "hub" ? 100 : 94),
        stroke(variant === "hub" ? colors.ink : colors.ink, variant === "hub" ? 2.4 : 2)
      ]),
      group(`${name} inner`, [
        ellipse(size * 0.28),
        fill(variant === "hub" ? colors.surface : colors.ink, 100)
      ])
    ],
    { x, y, scale: scaleFrames, opacity: opacityFrames }
  );
}

function line(name: string, points: [number, number][], start: number, end: number, width = 2) {
  return layer(name, [
    group(name, [
      pathShape(points),
      trim(start, end),
      stroke(colors.muted, width, 86)
    ])
  ]);
}

function pulse(name: string, x: number, y: number, size: number, start: number) {
  return layer(
    name,
    [
      group(name, [
        ellipse(size),
        stroke(colors.ink, 1.4, 72)
      ])
    ],
    {
      x,
      y,
      scale: [
        { t: start, s: [60, 60, 100] },
        { t: start + 42, s: [138, 138, 100] },
        { t: frames, s: [138, 138, 100] }
      ],
      opacity: [
        { t: start, s: [0] },
        { t: start + 8, s: [48] },
        { t: start + 42, s: [0] },
        { t: frames, s: [0] }
      ]
    }
  );
}

function tick(x: number, y: number, start: number) {
  return layer(
    `Trace tick ${start}`,
    [
      group("tick", [
        pathShape([[0, -8], [0, 8]]),
        trim(start, start + 16),
        stroke(colors.ink, 2.2, 92)
      ])
    ],
    { x, y }
  );
}

const agentY = [110, 200, 300, 390];
const layers = [
  layer("Soft background plate", [
    group("plate", [
      roundedRect(720, 430, 28),
      fill(colors.surface, 76),
      stroke(colors.line, 1.2, 100)
    ])
  ], { x: 400, y: 260 }),

  line("Input to Ennodia", [[92, 250], [244, 250]], 8, 46, 2.6),
  ...agentY.map((y, index) => line(`Ennodia route ${index + 1}`, [[292, 250], [356, 250], [418, y]], 48 + index * 12, 96 + index * 12, 2.2)),
  ...agentY.map((y, index) => line(`Agent to judge ${index + 1}`, [[456, y], [540, y], [596, 200]], 110 + index * 10, 158 + index * 10, 1.8)),
  line("Judge to synthesis", [[626, 210], [674, 270], [706, 300]], 170, 212, 2.3),
  line("Run trace", [[126, 450], [238, 450], [350, 450], [462, 450], [574, 450], [686, 450]], 34, 230, 2),

  node("Request", 92, 250, 42, 0, "rect"),
  pulse("Request pulse", 92, 250, 58, 12),
  node("Ennodia hub", 272, 250, 68, 42, "hub"),
  pulse("Hub pulse", 272, 250, 86, 62),
  ...agentY.map((y, index) => node(`Peer agent ${index + 1}`, 436, y, 42, 82 + index * 12)),
  node("Judge", 610, 200, 56, 158, "diamond"),
  pulse("Judge pulse", 610, 200, 72, 176),
  node("Synthesizer", 710, 300, 58, 212, "circle"),
  pulse("Synthesizer pulse", 710, 300, 76, 228),
  tick(238, 450, 68),
  tick(350, 450, 112),
  tick(462, 450, 156),
  tick(574, 450, 198),
  tick(686, 450, 232),

  layer("Trace label marks", [
    group("small trace dots", [
      ellipse(8),
      fill(colors.ink, 100)
    ])
  ], {
    x: 126,
    y: 450,
    opacity: [
      { t: 30, s: [0] },
      { t: 46, s: [100] },
      { t: frames, s: [100] }
    ]
  })
];

const lottie = {
  v: "5.7.5",
  fr: 60,
  ip: 0,
  op: frames,
  w: width,
  h: height,
  nm: "Ennodia peer review explainer",
  ddd: 0,
  assets: [],
  layers
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(lottie)}\n`);
