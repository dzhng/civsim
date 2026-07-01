// Wires @testing-library/jest-dom matchers (toBeInTheDocument, etc.) into
// vitest's expect. Imported once via vitest.config.ts setupFiles.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals:false means testing-library can't register its own afterEach, so
// unmount between tests ourselves — otherwise renders pile up in one jsdom DOM.
afterEach(() => cleanup());
