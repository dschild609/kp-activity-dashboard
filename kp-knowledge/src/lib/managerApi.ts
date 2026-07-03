import { auth } from "./firebase";

const BASE = "https://us-central1-client-health-dashboard-4826e.cloudfunctions.net";

/* Call a manager-gated KP Knowledge Cloud Function with the signed-in
 * user's ID token and unwrap the {ok, ...} / {ok:false, error} envelope
 * every endpoint returns. Shared by the roster + reminder calls. */
export async function callManagerFn<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const resp = await fetch(`${BASE}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) throw new Error(data.error ?? `${name} failed (HTTP ${resp.status})`);
  return data as T;
}
