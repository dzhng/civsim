import {
  AmbientAudioDirector,
  AmbientAudioEngine,
  WIND_BED_DIRECTOR_MAPPING,
} from "../../../packages/ambient-audio/src";

interface MeadowAudioContext {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  status: HTMLElement;
}

type RendererAudioStats = {
  rms: number;
  activeNodes: number;
  ctxState: AudioContextState | "unsupported";
};

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
  __rendererLabReady?: boolean;
  __rendererLabStats?: RendererAudioStats;
};

export async function routeMeadowAudio(ctx: MeadowAudioContext): Promise<void> {
  ctx.root.classList.add("meadow-audio-lab");
  ctx.canvas.setAttribute("aria-label", "Ambient audio waveform");
  installRouteStyles();

  const w = window as WindowWithWebkitAudio;
  const AudioContextCtor = window.AudioContext ?? w.webkitAudioContext;
  if (!AudioContextCtor) {
    publishStats({ rms: 0, activeNodes: 0, ctxState: "unsupported" });
    ctx.status.textContent = "Web Audio is unavailable in this browser.";
    return;
  }

  const engine = AmbientAudioEngine.create({
    AudioContext: AudioContextCtor,
    settings: { masterVolume: 0.7 },
  });
  const director = new AmbientAudioDirector(engine.windBed);
  const analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  engine.monitorNode.connect(analyser);

  const controls = document.createElement("div");
  controls.className = "meadow-audio-controls";

  const startButton = button("Start");
  const pokeButton = button("Poke");
  const volume = document.createElement("input");
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.01";
  volume.value = String(engine.mixer.masterVolume);
  const windSpeed = document.createElement("input");
  windSpeed.type = "range";
  windSpeed.min = "0";
  windSpeed.max = String(WIND_BED_DIRECTOR_MAPPING.maxWindSpeed);
  windSpeed.step = "0.1";
  windSpeed.value = "4";
  const windGust = document.createElement("input");
  windGust.type = "range";
  windGust.min = "0";
  windGust.max = String(WIND_BED_DIRECTOR_MAPPING.maxWindGust);
  windGust.step = "0.01";
  windGust.value = "0.35";

  const muteLabel = document.createElement("label");
  muteLabel.className = "meadow-audio-toggle";
  const mute = document.createElement("input");
  mute.type = "checkbox";
  mute.checked = engine.mixer.isMuted;
  muteLabel.append(mute, "Mute");

  controls.append(
    startButton,
    label("Volume", volume),
    label("Wind speed (m/s)", windSpeed),
    label("Gust", windGust),
    muteLabel,
    pokeButton,
  );
  ctx.panel.insertBefore(controls, ctx.status);

  let lastRms = 0;
  const updateSoundscape = () => {
    director.update({
      windSpeed: Number(windSpeed.value),
      windGust: Number(windGust.value),
      waterProximity: 0,
      waterPan: 0,
      grassNear: 1,
      listenerXY: [0, 0],
      dtSeconds: 1 / 60,
    });
    renderStatus(ctx, engine, lastRms, Number(windSpeed.value), Number(windGust.value));
  };
  updateSoundscape();

  startButton.addEventListener("click", async () => {
    engine.windBed.start();
    await engine.resume();
    renderStatus(ctx, engine, lastRms, Number(windSpeed.value), Number(windGust.value));
  });
  pokeButton.addEventListener("click", async () => {
    await engine.resume();
    engine.playTestTone();
    renderStatus(ctx, engine, lastRms, Number(windSpeed.value), Number(windGust.value));
  });
  volume.addEventListener("input", () => {
    engine.mixer.setMasterVolume(Number(volume.value));
    renderStatus(ctx, engine, lastRms, Number(windSpeed.value), Number(windGust.value));
  });
  windSpeed.addEventListener("input", updateSoundscape);
  windGust.addEventListener("input", updateSoundscape);
  mute.addEventListener("change", () => {
    engine.mixer.setMuted(mute.checked);
    renderStatus(ctx, engine, lastRms, Number(windSpeed.value), Number(windGust.value));
  });

  const waveform = new Float32Array(analyser.fftSize);
  const draw = () => {
    sizeCanvasToCss(ctx.canvas);
    analyser.getFloatTimeDomainData(waveform);
    lastRms = rms(waveform);
    drawWaveform(ctx.canvas, waveform, lastRms);
    renderStatus(ctx, engine, lastRms, Number(windSpeed.value), Number(windGust.value));
    publishStats({
      rms: lastRms,
      activeNodes: engine.activeNodes,
      ctxState: engine.ctx.state,
    });
    requestAnimationFrame(draw);
  };
  publishStats({ rms: 0, activeNodes: 0, ctxState: engine.ctx.state });
  requestAnimationFrame(draw);
}

function button(text: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  return el;
}

function label(text: string, control: HTMLElement): HTMLLabelElement {
  const el = document.createElement("label");
  el.append(text, control);
  return el;
}

function renderStatus(
  ctx: MeadowAudioContext,
  engine: AmbientAudioEngine,
  rmsValue: number,
  windSpeed: number,
  windGust: number,
): void {
  ctx.status.innerHTML = table({
    route: "meadow-audio",
    ctxState: engine.ctx.state,
    rms: rmsValue.toFixed(5),
    activeNodes: engine.activeNodes,
    masterTarget: engine.mixer.targetMasterGain.toFixed(3),
    windSpeed: windSpeed.toFixed(1),
    windGust: windGust.toFixed(2),
    mounted: engine.mounted,
  });
}

function table(values: Record<string, unknown>): string {
  return `<table>${Object.entries(values)
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value))}</td></tr>`)
    .join("")}</table>`;
}

function publishStats(stats: RendererAudioStats): void {
  const w = window as WindowWithWebkitAudio;
  w.__rendererLabReady = true;
  w.__rendererLabStats = stats;
}

function rms(values: Float32Array): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / values.length);
}

function sizeCanvasToCss(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor((canvas.clientWidth || 900) * dpr));
  const height = Math.max(1, Math.floor((canvas.clientHeight || 520) * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawWaveform(canvas: HTMLCanvasElement, values: Float32Array, rmsValue: number): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const width = canvas.width;
  const height = canvas.height;
  g.fillStyle = "#15161a";
  g.fillRect(0, 0, width, height);

  const mid = height * 0.5;
  g.strokeStyle = "#4f5c64";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, mid);
  g.lineTo(width, mid);
  g.stroke();

  g.strokeStyle = rmsValue > 0.002 ? "#d8b65f" : "#8f917d";
  g.lineWidth = Math.max(1, Math.floor(width / 900));
  g.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * width;
    const y = mid - values[i] * height * 0.42;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

function installRouteStyles(): void {
  if (document.getElementById("meadow-audio-lab-style")) return;
  const style = document.createElement("style");
  style.id = "meadow-audio-lab-style";
  style.textContent = `
    .meadow-audio-lab #renderer-canvas { background: #15161a; }
    .meadow-audio-controls { display: grid; gap: 10px; margin-bottom: 14px; }
    .meadow-audio-controls button {
      border: 1px solid #78613d;
      border-radius: 5px;
      background: #2c261c;
      color: #f0dfb8;
      padding: 8px 10px;
      cursor: pointer;
      font: 12px ui-sans-serif, system-ui, sans-serif;
    }
    .meadow-audio-controls button:hover { background: #40351f; }
    .meadow-audio-controls label {
      display: grid;
      gap: 5px;
      color: #cdbf9f;
      font-size: 12px;
    }
    .meadow-audio-controls input[type="range"] { width: 100%; }
    .meadow-audio-controls .meadow-audio-toggle {
      display: flex;
      align-items: center;
      gap: 7px;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
