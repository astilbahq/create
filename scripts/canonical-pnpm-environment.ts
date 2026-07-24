import path from "node:path";

const PASSTHROUGH_ENVIRONMENT_KEYS = [
  "COMSPEC",
  "ComSpec",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "PATH",
  "PATHEXT",
  "Path",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMROOT",
  "SystemRoot",
  "TMP",
  "TMPDIR",
  "TEMP",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;

export const CANONICAL_PNPM_CONFIG = `registry=https://registry.npmjs.org/
auto-install-peers=true
dedupe-peer-dependents=true
exclude-links-from-lockfile=false
lockfile-include-tarball-url=false
resolution-mode=highest
shared-workspace-lockfile=true
`;

export const createCanonicalPnpmEnvironment = (
  temporaryRoot: string,
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};

  for (const key of PASSTHROUGH_ENVIRONMENT_KEYS) {
    const value = source[key];

    if (value !== undefined) {
      environment[key] = value;
    }
  }

  return {
    ...environment,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    HOME: temporaryRoot,
    USERPROFILE: temporaryRoot,
    XDG_CONFIG_HOME: path.join(temporaryRoot, ".config"),
    npm_config_userconfig: path.join(temporaryRoot, ".npmrc"),
  };
};
