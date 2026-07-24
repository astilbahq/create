import type { Profile } from "../generator/types.js";
import { file, projectProfileConflicts } from "./shared.js";

export const reactProfile: Profile = {
  conflicts: projectProfileConflicts("react"),
  files: [
    file(
      "index.html",
      `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{foundation:projectName}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    ),
    file(
      "knip.json",
      `
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["tests/**/*.test.ts!"],
  "project": ["src/**/*.{ts,tsx}!", "tests/**/*.ts!", "*.config.ts!"]
}
`
    ),
    file(
      "src/app.tsx",
      `
import project from "./project.json";

export const App = () => (
  <main>
    <h1>{{foundation:projectName}}</h1>
    <p>{project.description}</p>
  </main>
);
`
    ),
    file(
      "src/project.json",
      `
{
  "description": {{foundation:descriptionJson}}
}
`
    ),
    file(
      "src/main.tsx",
      `
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`
    ),
    file(
      "tests/project.test.ts",
      `
import { describe, expect, it } from "vitest";

describe("project", () => {
  it("has a name", () => {
    expect("{{foundation:projectName}}").not.toHaveLength(0);
  });
});
`
    ),
    file(
      "tsconfig.json",
      `
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "resolveJsonModule": true,
    "strict": true,
    "target": "ES2023",
    "types": ["vite/client"],
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "*.config.ts"]
}
`
    ),
    file(
      "vite.config.ts",
      `
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
`
    ),
    file(
      "vitest.config.ts",
      `
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
`
    ),
  ],
  name: "react",
  packageJson: {
    dependencies: {
      react: "19.2.7",
      "react-dom": "19.2.7",
    },
    devDependencies: {
      "@types/node": "24.13.3",
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
      "@vitejs/plugin-react": "6.0.2",
      vite: "8.1.3",
    },
    fields: {
      private: true,
    },
    scripts: {
      build: "tsc --noEmit && vite build",
      dev: "vite",
      knip: "knip",
      preview: "vite preview",
      test: "vitest run",
      "test:watch": "vitest",
      typecheck: "tsc --noEmit",
      verify:
        "pnpm check && pnpm typecheck && pnpm test && pnpm knip && pnpm build",
    },
  },
  requires: ["base"],
};
