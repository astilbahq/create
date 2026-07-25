export const configureColorEnvironment = (
  environment: NodeJS.ProcessEnv
): void => {
  if (
    environment.NO_COLOR !== undefined &&
    environment.FORCE_COLOR === undefined
  ) {
    environment.FORCE_COLOR = "0";
  }
};
