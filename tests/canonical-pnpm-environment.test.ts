import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANONICAL_PNPM_CONFIG,
  createCanonicalPnpmEnvironment,
} from "../scripts/canonical-pnpm-environment.js";

describe("canonical pnpm environment", () => {
  it("isolates lockfile generation from maintainer pnpm configuration", () => {
    const root = path.resolve("/temporary/canonical-home");
    const environment = createCanonicalPnpmEnvironment(root, {
      PATH: "/bin",
      PNPM_CONFIG_LOCKFILE_INCLUDE_TARBALL_URL: "true",
      npm_config_registry: "https://registry.example.test/",
    });

    expect(environment).toMatchObject({
      HOME: root,
      PATH: "/bin",
      USERPROFILE: root,
      XDG_CONFIG_HOME: path.join(root, ".config"),
      npm_config_userconfig: path.join(root, ".npmrc"),
    });
    expect(environment).not.toHaveProperty(
      "PNPM_CONFIG_LOCKFILE_INCLUDE_TARBALL_URL"
    );
    expect(environment).not.toHaveProperty("npm_config_registry");
    expect(CANONICAL_PNPM_CONFIG).toContain(
      "registry=https://registry.npmjs.org/"
    );
    expect(CANONICAL_PNPM_CONFIG).toContain(
      "lockfile-include-tarball-url=false"
    );
  });
});
