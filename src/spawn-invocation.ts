const WINDOWS_COMMAND_TOKEN_PATTERN = /^[a-z\d@._/:=\\-]+$/iu;

export interface SpawnInvocation {
  readonly arguments_: readonly string[];
  readonly command: string;
}

export const createSpawnInvocation = (
  command: string,
  arguments_: readonly string[],
  {
    comSpec = process.env.ComSpec ?? "cmd.exe",
    platform = process.platform,
  }: {
    readonly comSpec?: string;
    readonly platform?: NodeJS.Platform;
  } = {}
): SpawnInvocation => {
  if (platform !== "win32") {
    return { arguments_, command };
  }

  const tokens = [command, ...arguments_];

  if (tokens.some((token) => !WINDOWS_COMMAND_TOKEN_PATTERN.test(token))) {
    throw new Error(
      "Refusing to pass an unsafe package-manager token to cmd.exe."
    );
  }

  return {
    arguments_: ["/d", "/s", "/c", tokens.join(" ")],
    command: comSpec,
  };
};
