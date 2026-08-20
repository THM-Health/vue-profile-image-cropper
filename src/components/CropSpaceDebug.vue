<script setup lang="ts">
import { computed } from 'vue';

export interface CropSpaceSnapshot {
  imageX: number;
  imageY: number;
  anchorSourceX: number;
  anchorSourceY: number;
  cropSize: number;
  displayW: number;
  displayH: number;
  displayScale: number;
  zoom: number;
  sourceW: number;
  sourceH: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const props = defineProps<{
  state: CropSpaceSnapshot | null;
}>();

const PAD_RATIO = 0.15;

const mapped = computed(() => {
  const s = props.state;
  if (!s || !s.cropSize) return null;

  const half = s.cropSize / 2;
  const imageCenter = { x: s.imageX, y: s.imageY };
  const imageTL = {
    x: s.imageX - s.displayW / 2,
    y: s.imageY + s.displayH / 2,
  };
  const anchor = {
    x: imageTL.x + s.anchorSourceX * s.displayScale,
    y: imageTL.y - s.anchorSourceY * s.displayScale,
  };

  // Content radius, then pad so axes read as “infinite” past the scene
  const content = Math.max(
    half,
    Math.hypot(s.displayW / 2, s.displayH / 2) + Math.hypot(Math.abs(s.maxX), Math.abs(s.maxY)),
  );
  const extent = content * (1 + PAD_RATIO);

  const tickStep = niceStep(extent / 4);
  const ticks: number[] = [];
  for (let t = tickStep; t < extent - tickStep * 0.25; t += tickStep) {
    ticks.push(t);
    ticks.push(-t);
  }

  // Scale UI chrome with the viewBox so labels stay readable
  const stroke = extent * 0.004;
  const font = extent * 0.045;
  const tickLen = extent * 0.025;
  const dot = extent * 0.018;

  return {
    half,
    imageCenter,
    imageTL,
    anchor,
    extent,
    ticks,
    tickStep,
    stroke,
    font,
    tickLen,
    dot,
  };
});

const viewBox = computed(() => {
  const m = mapped.value;
  if (!m) return '-150 -150 300 300';
  const e = m.extent;
  return `${-e} ${-e} ${e * 2} ${e * 2}`;
});

/** Round step to 1 / 2 / 5 × 10^n. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * exp;
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

function tickLabel(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(n < 10 ? 1 : 0);
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Coordinate system (full width, large) -->
    <div class="flex min-w-0 flex-col gap-2">
      <h3 class="m-0 text-sm font-semibold text-slate-800">Coordinate system</h3>
      <p class="m-0 max-w-3xl text-sm leading-snug text-slate-500">
        Math crop space:
        <strong class="text-slate-800">(0, 0) = crop center</strong>,
        <span class="font-semibold text-teal-700">+x → right</span>,
        <span class="font-semibold text-rose-700">+y → up</span>. Teal = displayed image; blue =
        crop square; green point = image center (<code class="rounded bg-slate-100 px-1"
          >imageX</code
        >, <code class="rounded bg-slate-100 px-1">imageY</code>); orange = source anchor under the
        crop center.
      </p>

      <div
        v-if="!state || !mapped"
        class="grid min-h-[28rem] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500"
      >
        Load an image to see the coordinate system.
      </div>

      <svg
        v-else
        class="min-h-[28rem] w-full rounded-lg border border-slate-200 bg-white lg:min-h-[36rem]"
        :viewBox="viewBox"
        role="img"
        aria-label="Crop-space coordinate diagram with infinite axes"
      >
        <defs>
          <marker
            id="arrow-x"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            :markerWidth="mapped.extent * 0.045"
            :markerHeight="mapped.extent * 0.045"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f766e" />
          </marker>
          <marker
            id="arrow-y"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            :markerWidth="mapped.extent * 0.045"
            :markerHeight="mapped.extent * 0.045"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#be123c" />
          </marker>
        </defs>

        <!-- Math space: +y up -->
        <g transform="scale(1, -1)">
          <!-- Infinite axes: rays both ways with outward arrows -->
          <line
            x1="0"
            y1="0"
            :x2="mapped.extent"
            y2="0"
            stroke="#0f766e"
            :stroke-width="mapped.stroke * 1.2"
            marker-end="url(#arrow-x)"
          />
          <line
            x1="0"
            y1="0"
            :x2="-mapped.extent"
            y2="0"
            stroke="#0f766e"
            :stroke-width="mapped.stroke * 1.2"
            marker-end="url(#arrow-x)"
          />
          <line
            x1="0"
            y1="0"
            x2="0"
            :y2="mapped.extent"
            stroke="#be123c"
            :stroke-width="mapped.stroke * 1.2"
            marker-end="url(#arrow-y)"
          />
          <line
            x1="0"
            y1="0"
            x2="0"
            :y2="-mapped.extent"
            stroke="#be123c"
            :stroke-width="mapped.stroke * 1.2"
            marker-end="url(#arrow-y)"
          />

          <!-- Axis ticks -->
          <g v-for="t in mapped.ticks" :key="'tx-' + t">
            <line
              :x1="t"
              :y1="-mapped.tickLen / 2"
              :x2="t"
              :y2="mapped.tickLen / 2"
              stroke="#0f766e"
              :stroke-width="mapped.stroke"
            />
          </g>
          <g v-for="t in mapped.ticks" :key="'ty-' + t">
            <line
              :x1="-mapped.tickLen / 2"
              :y1="t"
              :x2="mapped.tickLen / 2"
              :y2="t"
              stroke="#be123c"
              :stroke-width="mapped.stroke"
            />
          </g>

          <!-- Image -->
          <rect
            :x="mapped.imageTL.x"
            :y="mapped.imageTL.y - state.displayH"
            :width="state.displayW"
            :height="state.displayH"
            fill="#99f6e4"
            fill-opacity="0.4"
            stroke="#0f766e"
            :stroke-width="mapped.stroke * 1.5"
          />

          <!-- Crop square -->
          <rect
            :x="-mapped.half"
            :y="-mapped.half"
            :width="state.cropSize"
            :height="state.cropSize"
            fill="#2563eb"
            fill-opacity="0.12"
            stroke="#1d4ed8"
            :stroke-width="mapped.stroke * 2"
          />

          <circle cx="0" cy="0" :r="mapped.dot" fill="#0f172a" />
          <circle
            :cx="mapped.imageCenter.x"
            :cy="mapped.imageCenter.y"
            :r="mapped.dot"
            fill="#0f766e"
          />
          <circle
            :cx="mapped.anchor.x"
            :cy="mapped.anchor.y"
            :r="mapped.dot * 0.85"
            fill="#c2410c"
          />
        </g>

        <!-- Labels (not y-flipped) -->
        <g
          :font-size="mapped.font"
          font-family="ui-sans-serif, system-ui, sans-serif"
          font-weight="700"
        >
          <text
            :x="mapped.extent - mapped.font * 1.2"
            :y="mapped.font * 0.35"
            fill="#0f766e"
            text-anchor="end"
          >
            +x
          </text>
          <text :x="-mapped.extent + mapped.font * 0.3" :y="mapped.font * 0.35" fill="#0f766e">
            −x
          </text>
          <text :x="mapped.font * 0.35" :y="-mapped.extent + mapped.font" fill="#be123c">+y</text>
          <text :x="mapped.font * 0.35" :y="mapped.extent - mapped.font * 0.3" fill="#be123c">
            −y
          </text>

          <text
            :x="mapped.font * 0.4"
            :y="-mapped.font * 0.45"
            fill="#0f172a"
            :font-size="mapped.font * 0.85"
          >
            (0, 0)
          </text>

          <text
            :x="mapped.imageCenter.x + mapped.font * 0.4"
            :y="-mapped.imageCenter.y - mapped.font * 0.35"
            fill="#0f766e"
            :font-size="mapped.font * 0.8"
          >
            image ({{ fmt(mapped.imageCenter.x) }}, {{ fmt(mapped.imageCenter.y) }})
          </text>

          <!-- Tick labels (screen y = −math y) -->
          <text
            v-for="t in mapped.ticks"
            :key="'lx-' + t"
            :x="t"
            :y="mapped.font * 1.1"
            fill="#64748b"
            :font-size="mapped.font * 0.65"
            text-anchor="middle"
            font-weight="500"
            font-family="ui-monospace, monospace"
          >
            {{ tickLabel(t) }}
          </text>
          <text
            v-for="t in mapped.ticks"
            :key="'ly-' + t"
            :x="-mapped.font * 0.35"
            :y="-t + mapped.font * 0.25"
            fill="#64748b"
            :font-size="mapped.font * 0.65"
            text-anchor="end"
            font-weight="500"
            font-family="ui-monospace, monospace"
          >
            {{ tickLabel(t) }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Values -->
    <div class="flex min-w-0 flex-col gap-2">
      <h3 class="m-0 text-sm font-semibold text-slate-800">Values</h3>

      <div
        v-if="!state"
        class="grid h-32 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500"
      >
        No crop state yet.
      </div>

      <template v-else>
        <dl class="m-0 grid grid-cols-2 gap-2 text-xs tabular-nums text-slate-700 sm:grid-cols-4">
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">image center (imageX, imageY)</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              ({{ fmt(state.imageX) }}, {{ fmt(state.imageY) }})
            </dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">anchor (source px)</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              ({{ fmt(state.anchorSourceX) }}, {{ fmt(state.anchorSourceY) }})
            </dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">bounds X</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              [{{ fmt(state.minX) }}, {{ fmt(state.maxX) }}]
            </dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">bounds Y</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              [{{ fmt(state.minY) }}, {{ fmt(state.maxY) }}]
            </dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">crop size</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">{{ fmt(state.cropSize) }}</dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">display size</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              {{ fmt(state.displayW) }}×{{ fmt(state.displayH) }}
            </dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">zoom / scale</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              {{ fmt(state.zoom) }}× · {{ fmt(state.displayScale) }}
            </dd>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <dt class="text-slate-500">source</dt>
            <dd class="m-0 mt-0.5 text-sm font-semibold">
              {{ state.sourceW }}×{{ state.sourceH }}
            </dd>
          </div>
        </dl>

        <pre
          class="m-0 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[0.7rem] leading-relaxed text-slate-700"
          >{{ state }}</pre>
      </template>
    </div>
  </div>
</template>
