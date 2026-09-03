import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { loadPlaceholderKit, loadPlaceholderVat, placeholderClipNames } from "@packages/soldier-assets/src/placeholders";
import { badArtistPackFixture, validateSoldierKit, type ValidationReport } from "@packages/soldier-assets/src/validate";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, escapeHtml, issueList, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const [kit, vat] = await Promise.all([loadPlaceholderKit(), loadPlaceholderVat()]);
  const good = validateSoldierKit(kit);
  const bad = validateSoldierKit(badArtistPackFixture());
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 72,
    pitch: 0.18,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
  const soldier = generatedFormation(1, { frame: 1, spacing: 1, faction: 0 });
  animateSkinned(shell, pipeline, () => soldier, { phaseSpeed: 0.35 });
  const placeholderStats = {
    route: "assets",
    report: good,
    badErrors: bad.errors.length,
    clips: placeholderClipNames(kit),
    vat: { width: vat.width, height: vat.height, bones: vat.bones, clips: vat.clips.length },
    importUi: { paste: true, file: true, drop: true },
    imported: null as null | {
      source: string;
      ok: boolean;
      errors: number;
      warnings: number;
      issues: number;
    },
  };
  const publishAssets = (ok: boolean, imported = placeholderStats.imported) => {
    publish("assets", ok, { ...placeholderStats, imported });
  };
  const renderImportResult = (source: string, report: ValidationReport) => {
    const result = ctx.status.querySelector<HTMLElement>("#asset-import-result");
    if (!result) return;
    result.classList.toggle("bad", !report.ok);
    result.innerHTML =
      reportTable({
        imported: source,
        status: report.ok ? "passes manifest contract" : "fails manifest contract",
        errors: report.errors.length,
        warnings: report.warnings.length,
        issues: report.issues.length,
      }) + issueList(report.issues.slice(0, 10));
    publishAssets(report.ok, {
      source,
      ok: report.ok,
      errors: report.errors.length,
      warnings: report.warnings.length,
      issues: report.issues.length,
    });
  };
  const validateText = (source: string, text: string) => {
    try {
      renderImportResult(source, validateSoldierKit(JSON.parse(text)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderImportResult(source, {
        ok: false,
        errors: [{ level: "error", code: "manifest.json", path: "manifest", message }],
        warnings: [],
        issues: [{ level: "error", code: "manifest.json", path: "manifest", message }],
      });
    }
  };
  const badSample = JSON.stringify(badArtistPackFixture(), null, 2);
  ctx.status.innerHTML =
    reportTable({
      route: "assets",
      validation: good.ok ? "placeholder kit passes" : "placeholder kit fails",
      placeholderIssues: good.issues.length,
      badPackErrors: bad.errors.length,
      skeletons: Object.keys(kit.skeletons).length,
      archetypes: Object.keys(kit.archetypes).length,
      clips: placeholderClipNames(kit).join(", "),
      vat: `${vat.width}x${vat.height}`,
    }) +
    `
    <div class="asset-workbench" id="asset-drop-zone">
      <label for="asset-manifest-json">manifest.json</label>
      <textarea id="asset-manifest-json" spellcheck="false">${escapeHtml(badSample)}</textarea>
      <div class="asset-actions">
        <button id="asset-validate-json" type="button">Validate</button>
        <label class="asset-file">Open JSON<input id="asset-file-input" type="file" accept=".json,application/json"></label>
      </div>
      <p>Drop a soldier-pack manifest here to validate it against the renderer contract.</p>
      <div id="asset-import-result"></div>
    </div>
  ` +
    issueList(bad.errors.slice(0, 7));
  const textarea = ctx.status.querySelector<HTMLTextAreaElement>("#asset-manifest-json");
  const validateButton = ctx.status.querySelector<HTMLButtonElement>("#asset-validate-json");
  const fileInput = ctx.status.querySelector<HTMLInputElement>("#asset-file-input");
  const dropZone = ctx.status.querySelector<HTMLElement>("#asset-drop-zone");
  validateButton?.addEventListener("click", () =>
    validateText("pasted manifest", textarea?.value ?? ""),
  );
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    validateText(file.name, await file.text());
  });
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    validateText(file.name, await file.text());
  });
  (
    window as unknown as {
      __gpuAssetWorkbench?: { validateManifest: (text: string, source?: string) => void };
    }
  ).__gpuAssetWorkbench = {
    validateManifest: (text, source = "debug manifest") => validateText(source, text),
  };
  publishAssets(good.ok);
}
