import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { loadPlaceholderVat } from "@packages/soldier-assets/src/placeholders";
import { validateRig, type ImportedRig, type ValidationReport } from "@packages/soldier-assets/src/validate";
import { bakeGltf } from "@packages/soldier-assets/bake/gltf.mjs";
import { importedRigMesh } from "../importedRigMesh";
import { crowdInstance } from "../labFixtures";
import { type LabContext, createConfiguredShell, createSkinnedPipeline, el, issueList, publish, reportTable } from "../labShell";

interface WorkbenchImport {
  source: string;
  ok: boolean;
  bones: number;
  clips: string[];
  boneNames: string[];
  vat: string;
  report: ValidationReport;
  error: string | null;
}

export async function route(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 64,
    pitch: 0.16,
    yaw: 0,
  });
  const placeholderVat = await loadPlaceholderVat();
  const placeholderPipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], placeholderVat);
  const placeholderInstances = [crowdInstance(-3.2, 0, 0, "march")];

  let importedPipeline: SkinnedCrowdPipeline | null = null;
  let importedInstances: CrowdInstance[] = [];
  let imported: WorkbenchImport | null = null;

  const loadGlb = (buffer: ArrayBuffer, source: string) => {
    try {
      const { rig, bake, boneNames } = bakeGltf(buffer, {
        fps: placeholderVat.fps,
        skeleton: "imported",
      });
      const report = validateRig(rig as ImportedRig);
      importedPipeline = new SkinnedCrowdPipeline(shell, importedRigMesh(rig as ImportedRig), bake);
      const clip = bake.clips[0]?.name ?? "idle";
      importedInstances = [crowdInstance(2.6, 0, 1, clip)];
      imported = {
        source,
        ok: report.ok,
        bones: rig.bones.length,
        clips: bake.clips.map((c) => c.name),
        boneNames,
        vat: `${bake.width}x${bake.height}`,
        report,
        error: null,
      };
    } catch (error) {
      importedPipeline = null;
      importedInstances = [];
      const message = error instanceof Error ? error.message : String(error);
      imported = {
        source,
        ok: false,
        bones: 0,
        clips: [],
        boneNames: [],
        vat: "",
        report: {
          ok: false,
          errors: [{ level: "error", code: "import", path: source, message }],
          warnings: [],
          issues: [{ level: "error", code: "import", path: source, message }],
        },
        error: message,
      };
    }
    renderPanel();
    publishStats();
  };

  // The default render proves the placeholder path is intact even before any
  // asset is dropped; we then load the checked-in test fixture beside it.
  try {
    const res = await fetch("/assets/soldiers/test/two-bone.glb");
    if (res.ok) loadGlb(await res.arrayBuffer(), "two-bone.glb (default fixture)");
  } catch {
    // fixture optional — the workbench still renders the placeholder alone
  }

  (
    window as unknown as { __assetWorkbench?: { loadBase64Glb(b64: string, name: string): void } }
  ).__assetWorkbench = {
    loadBase64Glb: (b64, name) =>
      loadGlb(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, name),
  };

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.7;
    placeholderPipeline.upload(placeholderInstances, { forcedClip: "march", phaseOffset, size: 1 });
    importedPipeline?.upload(importedInstances, {
      forcedClip: importedInstances[0]?.clip,
      phaseOffset,
      size: 1.4,
    });
    shell.drawFrame({
      passes: [
        {
          id: "asset-workbench",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => {
            placeholderPipeline.draw(pass);
            importedPipeline?.draw(pass);
          },
        },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();

  function renderPanel() {
    ctx.status.innerHTML = "";
    const intro = el("p", "fault-intro");
    intro.textContent =
      "Left: placeholder soldier (default path). Right: imported .glb skeleton baked live to a VAT. Drop a .glb to replace it.";
    ctx.status.appendChild(intro);
    const drop = el("div", "asset-workbench");
    drop.innerHTML = "<label>Import a rigged .glb</label>";
    const fileLabel = el("label", "asset-file");
    fileLabel.textContent = "Choose .glb";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".glb,.gltf,model/gltf-binary";
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (f) loadGlb(await f.arrayBuffer(), f.name);
    });
    fileLabel.appendChild(file);
    drop.appendChild(fileLabel);
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      const f = e.dataTransfer?.files?.[0];
      if (f) loadGlb(await f.arrayBuffer(), f.name);
    });
    ctx.status.appendChild(drop);
    ctx.status.insertAdjacentHTML(
      "beforeend",
      reportTable({
        route: "asset-workbench",
        "placeholder soldier": "rendered (default intact)",
        "imported source": imported?.source ?? "none",
        "imported bones": imported?.bones ?? "—",
        "imported clips": imported?.clips.join(", ") || "—",
        "imported VAT": imported?.vat || "—",
        validation: imported
          ? imported.ok
            ? "OK"
            : `${imported.report.errors.length} error(s)`
          : "—",
      }),
    );
    if (imported && imported.report.issues.length > 0) {
      ctx.status.insertAdjacentHTML("beforeend", issueList(imported.report.issues));
    }
  }

  function publishStats() {
    publish("asset-workbench", true, {
      route: "asset-workbench",
      placeholderRendered: true,
      placeholderVat: `${placeholderVat.width}x${placeholderVat.height}`,
      imported: imported && {
        source: imported.source,
        ok: imported.ok,
        bones: imported.bones,
        clips: imported.clips,
        boneNames: imported.boneNames,
        vat: imported.vat,
        errors: imported.report.errors,
        error: imported.error,
      },
    });
  }
}
