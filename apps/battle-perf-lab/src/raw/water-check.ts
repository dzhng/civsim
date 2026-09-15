import { runWaterControl } from "../waterControl";
runWaterControl("raw")
  .then((result) => Object.assign(window, { __waterCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __waterCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
