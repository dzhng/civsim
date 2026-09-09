/** Scene-owned loading cover; the HUD cannot issue orders before the first frame. */
export function mountBattleLoading(onExit: () => void, signal: AbortSignal) {
  const cover = document.createElement("div");
  cover.id = "battle-loading";
  cover.innerHTML = `<section class="hud-chassis" aria-labelledby="battle-loading-title">
    <p class="battle-loading-eyebrow">BATTLE</p>
    <h1 id="battle-loading-title">Preparing the battlefield</h1>
    <p role="status">Loading the terrain and armies…</p>
    <div class="battle-loading-progress" role="progressbar" aria-label="Loading battle"></div>
    <p class="battle-loading-hint">Your armies will wait until everything is ready.<br>The first visit takes longer; downloaded models are cached.</p>
    <button type="button">Back to menu</button>
  </section>`;
  cover.querySelector("button")!.addEventListener("click", onExit, { signal });
  document.getElementById("battle-ui")!.append(cover);
  const remove = () => cover.remove();
  signal.addEventListener("abort", remove, { once: true });
  return { remove };
}
