import { createFrameShell, type FrameGraphCommands } from "@packages/renderer-core/src/frameShell";
import { requestGpuDevice } from "@packages/renderer-core/src/device";
import { compileShader, setShaderErrorHandler, shaderCompilationMessages, type ShaderCompilationMessage } from "@packages/renderer-core/src/compileShader";
import { fatalSurfaceFor, showFatalErrorSurface } from "../../../../web/src/shared/fatalError";
import { generatedCrowd } from "../labFixtures";
import { type LabContext, LabGroundPass, chartSnapshot, createSkinnedPipeline, el, labGroundFramePass, publish, reportTable, skinnedCrowdPass } from "../labShell";
import { CAMPAIGN_ENVIRONMENT } from "@packages/game-renderer/src/campaign/environment";

const BAD_SHADER_WGSL = `
@vertex
fn vs() -> @builtin(position) vec4f {
  return notAFunction(1.0);  // undeclared identifier — must surface a compile error
}`;

interface FaultInjectionState {
  route: "fault-injection";
  initialFrameRendered: boolean;
  badShader: {
    triggered: boolean;
    errorCount: number;
    firstError: ShaderCompilationMessage | null;
    handlerFired: boolean;
  } | null;
  rejectedSubmission: { triggered: boolean; captured: boolean; message: string } | null;
  deviceLoss: { triggered: boolean; reason: string; fatalSurface: boolean } | null;
  health: { fatal: boolean; deviceLost: boolean };
}

interface FaultInjectionApi {
  injectBadShader(): Promise<FaultInjectionState>;
  rejectSubmission(): Promise<FaultInjectionState>;
  forceDeviceLoss(): Promise<FaultInjectionState>;
}

export async function route(ctx: LabContext) {
  const state: FaultInjectionState = {
    route: "fault-injection",
    initialFrameRendered: false,
    badShader: null,
    rejectedSubmission: null,
    deviceLoss: null,
    health: { fatal: false, deviceLost: false },
  };
  let handlerFired = false;
  setShaderErrorHandler(() => {
    handlerFired = true;
  });

  const shell = await createFrameShell(ctx.canvas, {
    sun: CAMPAIGN_ENVIRONMENT,
    onFatalError: (report) =>
      showFatalErrorSurface(
        ctx.canvas,
        fatalSurfaceFor(
          report.phase === "device-lost" ? "device-lost" : "submission",
          report.message,
        ),
      ),
  });
  shell.setCamera(chartSnapshot({ x: 0, y: 0, zoom: 10, pitch: 0.25, yaw: 0 }, shell));
  const markers = generatedCrowd(18, -8, -4, 0).concat(generatedCrowd(18, 8, 2, 1));
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88]);
  pipeline.upload(markers);
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  const draw = (): FrameGraphCommands => ({
    passes: [
      labGroundFramePass(ground, "fault-injection-ground"),
      skinnedCrowdPass(pipeline, "fault-injection-crowd"),
    ],
  });
  shell.drawFrame(draw());
  state.initialFrameRendered = true;

  const sync = () => {
    state.health = { fatal: shell.health().fatal, deviceLost: shell.health().deviceLost };
    publish("fault-injection", true, state);
    renderPanel();
  };

  const injectBadShader = async () => {
    handlerFired = false;
    // Compile on a throwaway device so the bad shader's uncaptured error does
    // not mark the live shell fatal — each fault here is demonstrated in
    // isolation. The compile-error surfacing path is identical to production.
    const scratch = await requestGpuDevice();
    const module = compileShader(scratch.device, BAD_SHADER_WGSL, "fault-bad-shader");
    const messages = await shaderCompilationMessages(module, "fault-bad-shader");
    const errors = messages.filter((m) => m.type === "error");
    state.badShader = {
      triggered: true,
      errorCount: errors.length,
      firstError: errors[0] ?? null,
      handlerFired,
    };
    (scratch.device as unknown as { destroy(): void }).destroy();
    sync();
    return state;
  };

  const rejectSubmission = async () => {
    let captured = false;
    let message = "";
    try {
      // Submitting a non-command-buffer is a synchronous validation/type error:
      // the diagnostic must surface, not vanish into a blank frame.
      (shell.device.queue as unknown as { submit(c: unknown[]): void }).submit([{ invalid: true }]);
    } catch (error) {
      captured = true;
      message = error instanceof Error ? error.message : String(error);
      console.error(`rejected submission: ${message}`);
    }
    state.rejectedSubmission = { triggered: true, captured, message };
    sync();
    return state;
  };

  const forceDeviceLoss = async () => {
    const lost = new Promise<void>((resolve) => {
      const prev = shell.health();
      if (prev.deviceLost) {
        resolve();
        return;
      }
      const start = performance.now();
      const poll = () => {
        if (shell.health().deviceLost || performance.now() - start > 3000) resolve();
        else requestAnimationFrame(poll);
      };
      poll();
    });
    (shell.device as unknown as { destroy(): void }).destroy();
    await lost;
    // A defined post-loss state: the renderer shows the reload panel rather than
    // hanging. (Default policy: surface, do not silently auto-reinit.)
    shell.drawFrame(draw()); // no-op while fatal
    state.deviceLoss = {
      triggered: true,
      reason: shell.health().lastError?.message ?? "",
      fatalSurface: Boolean(window.__gpuFatal),
    };
    sync();
    return state;
  };

  const api: FaultInjectionApi = { injectBadShader, rejectSubmission, forceDeviceLoss };
  (window as unknown as { __faultInjection?: FaultInjectionApi }).__faultInjection = api;

  function renderPanel() {
    ctx.status.innerHTML = "";
    const intro = el("p", "fault-intro");
    intro.textContent =
      "Force each GPU fault and confirm a visible, correct outcome — never a silent blank canvas.";
    ctx.status.appendChild(intro);
    const controls = el("div", "fault-controls");
    controls.append(
      faultButton("Inject bad shader", () => void injectBadShader()),
      faultButton("Reject submission", () => void rejectSubmission()),
      faultButton("Force device loss", () => void forceDeviceLoss()),
    );
    ctx.status.appendChild(controls);
    ctx.status.insertAdjacentHTML(
      "beforeend",
      reportTable({
        "initial frame": state.initialFrameRendered,
        "bad shader errors": state.badShader ? state.badShader.errorCount : "—",
        "bad shader first": state.badShader?.firstError
          ? `${state.badShader.firstError.line}:${state.badShader.firstError.column} ${state.badShader.firstError.message}`
          : "—",
        "rejected submission": state.rejectedSubmission
          ? `captured=${state.rejectedSubmission.captured}`
          : "—",
        "device loss": state.deviceLoss ? `reason=${state.deviceLoss.reason || "destroyed"}` : "—",
        "fatal surface": state.deviceLoss?.fatalSurface ?? false,
        "shell fatal": state.health.fatal,
      }),
    );
  }

  function faultButton(label: string, onClick: () => void) {
    const button = document.createElement("button");
    button.className = "fault-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  sync();
}
