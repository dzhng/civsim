// Loads @testing-library/jest-dom's matcher augmentation (toBeInTheDocument,
// etc.) into vitest's Assertion type for `tsc --noEmit`. The runtime wiring
// lives in setup-tests.ts; this file exists only so the .test.tsx assertions
// typecheck (setup-tests.ts sits outside tsconfig's `src` include).
import "@testing-library/jest-dom/vitest";
