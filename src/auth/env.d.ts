import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
declare global {
  interface Env {
    COOKIE_ENCRYPTION_KEY: string;
    AUTH_PASSWORD_PEPPER: string;
    DEMO_EMAIL: string;
    DEMO_PASSWORD_SALT: string;
    DEMO_PASSWORD_HASH: string;
    OAUTH_PROVIDER: OAuthHelpers;
  }
}
export {};
