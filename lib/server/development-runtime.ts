type DevelopmentRuntimeEnvironment = {
  NODE_ENV?: string;
  EVIDRA_DEV_MODEL?: string;
};

export function isLightweightDevelopmentMode(
  environment: DevelopmentRuntimeEnvironment = process.env,
): boolean {
  return (
    environment.NODE_ENV === "development" &&
    environment.EVIDRA_DEV_MODEL?.trim().toLowerCase() !== "true"
  );
}
