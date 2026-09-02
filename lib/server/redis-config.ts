type Environment = Record<string, string | undefined>;

export interface UpstashRedisRestConfig {
  url: string;
  token: string;
}

function read(environment: Environment, name: string): string {
  return environment[name]?.trim() || "";
}

/** Supports direct application variables and Vercel's Upstash KV integration aliases. */
export function getUpstashRedisRestConfig(
  environment: Environment = process.env,
): UpstashRedisRestConfig {
  return {
    url: read(environment, "UPSTASH_REDIS_REST_URL") || read(environment, "UPSTASH_REDIS_REST_KV_REST_API_URL"),
    token: read(environment, "UPSTASH_REDIS_REST_TOKEN") || read(environment, "UPSTASH_REDIS_REST_KV_REST_API_TOKEN"),
  };
}
