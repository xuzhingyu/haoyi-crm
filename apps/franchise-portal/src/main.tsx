import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { ApiClient } from "./api/client";
import { accessToken, developmentHeaders, signIn, userManager } from "./auth";

async function start() {
  if (userManager && window.location.pathname === `${import.meta.env.BASE_URL}auth/callback`) {
    const loggedIn = await userManager.signinRedirectCallback();
    const returnTo = (loggedIn.state as { returnTo?: string } | undefined)?.returnTo;
    window.history.replaceState({}, "", returnTo?.startsWith(import.meta.env.BASE_URL) && !returnTo.startsWith("//") ? returnTo : import.meta.env.BASE_URL);
  }
  if (userManager && (!(await userManager.getUser()) || (await userManager.getUser())?.expired)) {
    await signIn();
    return;
  }
  const api = new ApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
    getAccessToken: accessToken,
    developmentHeaders: developmentHeaders(),
  });
  if (userManager) {
    userManager.events.addAccessTokenExpired(() => { window.dispatchEvent(new Event("haoyi:session-expired")); });
  }
  createRoot(document.getElementById("root")!).render(<StrictMode><App api={api} onLogout={userManager ? () => { void userManager?.signoutRedirect(); } : undefined} onReauthenticate={userManager ? () => { void signIn(); } : undefined} /></StrictMode>);
}

void start().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<main className="boot-screen"><h1>暂时无法登录</h1><p>{error instanceof Error ? error.message : "认证服务连接失败"}</p><button className="button primary" onClick={() => window.location.reload()}>重新连接</button></main>);
});
