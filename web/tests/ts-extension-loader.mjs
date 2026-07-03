// Bare npm deps live in web/node_modules only (packages/* are source-only, per
// repo convention), so a package file importing e.g. 'three' cannot resolve it
// by directory walk-up; retry such failures anchored at web/.
const WEB_ANCHOR = new URL("../package.json", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      if (
        !specifier.startsWith(".") &&
        !specifier.startsWith("/") &&
        !specifier.startsWith("file:")
      ) {
        return nextResolve(specifier, { ...context, parentURL: WEB_ANCHOR });
      }
    }
    throw error;
  }
}
