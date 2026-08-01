import { auth } from "./firebase";

export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = (options.headers || {}) as Record<string, string>;
  const user = auth.currentUser;
  
  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  } else if (import.meta.env.VITE_BYPASS_AUTH === "true" || localStorage.getItem("bypass_auth") === "true") {
    headers["Authorization"] = `Bearer mock-admin-token`;
  }
  
  return fetch(url, {
    ...options,
    headers
  });
}
