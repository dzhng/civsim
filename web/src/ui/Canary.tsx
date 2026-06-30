/* S0 stack-setup canary — a throwaway smoke test that the React + JSX +
 * Tailwind toolchain is wired end-to-end. It renders only under the `?canary`
 * query flag (see root.tsx), so the screenshot scenes — which never set the
 * flag — see nothing and no baseline moves. Removed once a real surface (S2
 * menu) mounts here. The Tailwind utility classes below prove the v4 pipeline
 * actually generates CSS, not just that the plugin loaded. */
export function Canary() {
  return (
    <div className="fixed bottom-3 right-3 z-50 rounded px-3 py-1 text-sm font-semibold">
      React + Tailwind ✓
    </div>
  );
}
