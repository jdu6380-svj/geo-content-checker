import { isLightweightDevelopmentMode } from "./development-runtime.ts";

export type WarmupModelInvoker = () => Promise<unknown>;

export async function runWarmupModel(
  environment: { NODE_ENV?: string; EVIDRA_DEV_MODEL?: string },
  invoke: WarmupModelInvoker,
): Promise<boolean> {
  if (isLightweightDevelopmentMode(environment)) return false;

  try {
    await invoke();
    return true;
  } catch {
    return false;
  }
}
