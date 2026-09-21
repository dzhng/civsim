/** A replacement cannot configure a canvas while its previous native surface is
 * still draining. Cancelling a queued owner also waits for its predecessor. */
const owners = new WeakMap<object, Promise<void>>();
export function claimCanvas(canvas: object) {
  const ready = owners.get(canvas) ?? Promise.resolve();
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const drained = ready.then(() => released);
  owners.set(canvas, drained);
  void drained.then(() => {
    if (owners.get(canvas) === drained) owners.delete(canvas);
  });
  return { ready, release };
}
