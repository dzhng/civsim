import { runWaterControl } from "../waterControl";
runWaterControl(new URL(location.href).searchParams.get("backend") === "vgpu" ? "vgpu" : "typegpu")
  .then((result) => Object.assign(window, { __waterPortsCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __waterPortsCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
