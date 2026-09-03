import {
  AmbientAudioDirector,
  AmbientAudioEngine,
  WIND_BED_DIRECTOR_MAPPING,
} from "@packages/ambient-audio/src";
import { sampleBattleWind } from "@packages/game-renderer/src/battle/windSignal";

interface MeadowAudioContext {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  status: HTMLElement;
}

type RendererAudioStats = {
  rms: number;
  activeNodes: number;
  activeVoices: number;
  waterProximity: number;
  waterPan: number;
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
    publishStats({
      rms: 0,
      activeNodes: 0,
      activeVoices: 0,
      waterProximity: 0,
      waterPan: 0,
      ctxState: "unsupported",
    });
    ctx.status.textContent = "Web Audio is unavailable in this browser.";
    return;
  }

  const engine = AmbientAudioEngine.create({
    AudioContext: AudioContextCtor,
    settings: { masterVolume: 0.7 },
  });
  const director = new AmbientAudioDirector(engine.windBed, engine.waterBed, engine.birdScheduler);
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
  const waterProximity = document.createElement("input");
  waterProximity.type = "range";
  waterProximity.min = "0";
  waterProximity.max = "1";
  waterProximity.step = "0.01";
  waterProximity.value = "0";
  const waterPan = document.createElement("input");
  waterPan.type = "range";
  waterPan.min = "-1";
  waterPan.max = "1";
  waterPan.step = "0.01";
  waterPan.value = "0";
  const liveWindLabel = document.createElement("label");
  liveWindLabel.className = "meadow-audio-toggle";
  const liveWind = document.createElement("input");
  liveWind.type = "checkbox";
  liveWind.checked = true;
  liveWindLabel.append(liveWind, "Live wind");
  const listenerX = numberInput("-900", "900", "10", "0");
  const listenerY = numberInput("-900", "900", "10", "-650");
  const reverbSend = document.createElement("input");
  reverbSend.type = "range";
  reverbSend.min = "0";
  reverbSend.max = "1";
  reverbSend.step = "0.01";
  reverbSend.value = String(engine.mixer.sendLevel("wind"));

  const muteLabel = document.createElement("label");
  muteLabel.className = "meadow-audio-toggle";
  const mute = document.createElement("input");
  mute.type = "checkbox";
  mute.checked = engine.mixer.isMuted;
  muteLabel.append(mute, "Mute");
  const birdsLabel = document.createElement("label");
  birdsLabel.className = "meadow-audio-toggle";
  const birds = document.createElement("input");
  birds.type = "checkbox";
  birds.checked = true;
  birdsLabel.append(birds, "Birds");

  controls.append(
    startButton,
    liveWindLabel,
    birdsLabel,
    fieldPair("Listener XY", listenerX, listenerY),
    label("Volume", volume),
    label("Wind speed (m/s)", windSpeed),
    label("Gust", windGust),
    label("Water proximity", waterProximity),
    label("Water pan", waterPan),
    label("Reverb send", reverbSend),
    muteLabel,
    pokeButton,
  );
  ctx.panel.insertBefore(controls, ctx.status);

  let lastRms = 0;
  let lastAppliedWind = { speed: Number(windSpeed.value), gust: Number(windGust.value) };
  let lastLiveWind = sampleBattleWind(Number(listenerX.value), Number(listenerY.value), 0);
  const routeStartedAtMs = performance.now();

  const routeTimeSeconds = () => Math.max(0, (performance.now() - routeStartedAtMs) / 1000);

  const listenerXY = (): [number, number] => [
    finiteNumber(listenerX.value, 0),
    finiteNumber(listenerY.value, -650),
  ];

  const syncWindControlState = () => {
    windSpeed.disabled = liveWind.checked;
    windGust.disabled = liveWind.checked;
  };

  const updateSoundscape = () => {
    const [x, y] = listenerXY();
    lastLiveWind = sampleBattleWind(x, y, routeTimeSeconds());
    lastAppliedWind = liveWind.checked
      ? { speed: lastLiveWind.speed, gust: lastLiveWind.gust }
      : { speed: Number(windSpeed.value), gust: Number(windGust.value) };
    const water = {
      proximity: Number(waterProximity.value),
      pan: Number(waterPan.value),
    };
    director.update({
      windSpeed: lastAppliedWind.speed,
      windGust: lastAppliedWind.gust,
      waterProximity: water.proximity,
      waterPan: water.pan,
      grassNear: 1,
      birds: birds.checked,
      birdIntensity: 1,
      listenerXY: [x, y],
      dtSeconds: 1 / 60,
    });
    renderStatus(
      ctx,
      engine,
      lastRms,
      lastAppliedWind.speed,
      lastAppliedWind.gust,
      lastLiveWind.speed,
      lastLiveWind.gust,
      [x, y],
      liveWind.checked,
      birds.checked,
      Number(reverbSend.value),
      water.proximity,
      water.pan,
    );
  };
  syncWindControlState();
  updateSoundscape();

  startButton.addEventListener("click", async () => {
    engine.windBed.start();
    engine.waterBed.start();
    await engine.resume();
    updateSoundscape();
  });
  pokeButton.addEventListener("click", async () => {
    await engine.resume();
    engine.playTestTone();
    updateSoundscape();
  });
  volume.addEventListener("input", () => {
    engine.mixer.setMasterVolume(Number(volume.value));
    updateSoundscape();
  });
  windSpeed.addEventListener("input", updateSoundscape);
  windGust.addEventListener("input", updateSoundscape);
  waterProximity.addEventListener("input", updateSoundscape);
  waterPan.addEventListener("input", updateSoundscape);
  liveWind.addEventListener("change", () => {
    syncWindControlState();
    updateSoundscape();
  });
  listenerX.addEventListener("input", updateSoundscape);
  listenerY.addEventListener("input", updateSoundscape);
  birds.addEventListener("change", updateSoundscape);
  reverbSend.addEventListener("input", () => {
    engine.mixer.setSendLevel("wind", Number(reverbSend.value));
    updateSoundscape();
  });
  mute.addEventListener("change", () => {
    engine.mixer.setMuted(mute.checked);
    updateSoundscape();
  });

  const waveform = new Float32Array(analyser.fftSize);
  const draw = () => {
    sizeCanvasToCss(ctx.canvas);
    analyser.getFloatTimeDomainData(waveform);
    lastRms = rms(waveform);
    drawWaveform(ctx.canvas, waveform, lastRms);
    updateSoundscape();
    publishStats({
      rms: lastRms,
      activeNodes: engine.activeNodes,
      activeVoices: engine.activeVoices,
      waterProximity: Number(waterProximity.value),
      waterPan: Number(waterPan.value),
      ctxState: engine.ctx.state,
    });
    requestAnimationFrame(draw);
  };
  publishStats({
    rms: 0,
    activeNodes: 0,
    activeVoices: 0,
    waterProximity: Number(waterProximity.value),
    waterPan: Number(waterPan.value),
    ctxState: engine.ctx.state,
  });
  requestAnimationFrame(draw);
}

function button(text: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  return el;
}

function numberInput(min: string, max: string, step: string, value: string): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "number";
  el.min = min;
  el.max = max;
  el.step = step;
  el.value = value;
  return el;
}

function label(text: string, control: HTMLElement): HTMLLabelElement {
  const el = document.createElement("label");
  el.append(text, control);
  return el;
}

function fieldPair(text: string, left: HTMLElement, right: HTMLElement): HTMLLabelElement {
  const el = document.createElement("label");
  const row = document.createElement("span");
  row.className = "meadow-audio-field-pair";
  row.append(left, right);
  el.append(text, row);
  return el;
}

function renderStatus(
  ctx: MeadowAudioContext,
  engine: AmbientAudioEngine,
  rmsValue: number,
  appliedWindSpeed: number,
  appliedWindGust: number,
  liveWindSpeed: number,
  liveWindGust: number,
  listenerXY: [number, number],
  liveWindEnabled: boolean,
  birdsEnabled: boolean,
  reverbSend: number,
  waterProximity: number,
  waterPan: number,
): void {
  ctx.status.innerHTML = table({
    route: "meadow-audio",
    ctxState: engine.ctx.state,
    rms: rmsValue.toFixed(5),
    activeNodes: engine.activeNodes,
    activeVoices: engine.activeVoices,
    masterTarget: engine.mixer.targetMasterGain.toFixed(3),
    windMode: liveWindEnabled ? "live" : "manual",
    birds: birdsEnabled ? "on" : "off",
    windSpeed: appliedWindSpeed.toFixed(1),
    windGust: appliedWindGust.toFixed(2),
    waterProximity: waterProximity.toFixed(2),
    waterPan: waterPan.toFixed(2),
    liveSpeed: liveWindSpeed.toFixed(1),
    liveGust: liveWindGust.toFixed(2),
    listenerX: listenerXY[0].toFixed(0),
    listenerY: listenerXY[1].toFixed(0),
    reverbSend: reverbSend.toFixed(2),
    mounted: engine.mounted,
  });
}

function table(values: Record<string, unknown>): string {
  return `<table>${Object.entries(values)
    .map(
      ([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value))}</td></tr>`,
    )
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

function finiteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    .meadow-audio-controls input[type="number"] {
      min-width: 0;
      width: 100%;
      border: 1px solid #4e4432;
      border-radius: 4px;
      background: #191813;
      color: #ead8ad;
      padding: 6px 7px;
      font: 12px ui-sans-serif, system-ui, sans-serif;
    }
    .meadow-audio-controls input:disabled { opacity: 0.55; }
    .meadow-audio-controls .meadow-audio-toggle {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .meadow-audio-field-pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
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
