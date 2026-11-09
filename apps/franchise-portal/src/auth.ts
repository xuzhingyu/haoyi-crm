import { UserManager, WebStorageStateStore } from "oidc-client-ts";

const authority = import.meta.env.VITE_OIDC_AUTHORITY as string | undefined;
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined;

export const userManager = authority && clientId
  ? new UserManager({
      authority,
      client_id: clientId,
      redirect_uri: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`,
      post_logout_redirect_uri: `${window.location.origin}${import.meta.env.BASE_URL}`,
      response_type: "code",
      scope: "openid profile email",
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    })
  : null;

export async function accessToken(): Promise<string | null> {
  const user = await userManager?.getUser();
  return user && !user.expired ? user.access_token : null;
}

export function signIn() {
  return userManager?.signinRedirect({ state: { returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}` } });
}

export function developmentHeaders(): Record<string, string> | undefined {
  if (!import.meta.env.DEV || authority) return undefined;
  return {
    "X-User-Id": import.meta.env.VITE_DEV_USER_ID ?? "demo-member",
    "X-Org-Id": import.meta.env.VITE_DEV_ORG_ID ?? "demo-franchise",
    "X-Roles": import.meta.env.VITE_DEV_ROLES ?? "franchise_member",
  };
}
