const BASE = "https://irleaguemanager.net/api";
const USERNAME = process.env.IRLM_USERNAME!;
const PASSWORD = process.env.IRLM_PASSWORD!;

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.error("Set IRLM_USERNAME and IRLM_PASSWORD in .env");
    process.exit(1);
  }
  const leagueName = process.env.LEAGUE_NAME!;
  const eventId = process.env.EVENT_ID!;

  // 1. Login
  const loginRes = await fetch(`${BASE}/Authenticate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error("Login failed:", loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const loginJson = (await loginRes.json()) as Record<string, unknown>;
  const token =
    (loginJson["token"] as string) ||
    (loginJson["accessToken"] as string) ||
    (loginJson["jwt"] as string) ||
    (loginJson["idToken"] as string);
  if (!token) {
    console.error("No token in login response. Keys:", Object.keys(loginJson));
    process.exit(1);
  }
  console.log("Logged in. Token length:", token.length);

  const auth = { Authorization: `Bearer ${token}` };

  // 2. Dump one result row
  const evRes = await fetch(`${BASE}/${leagueName}/Events/${eventId}/Results`, {
    headers: auth,
  });
  console.log(
    "\nGET",
    `${BASE}/${leagueName}/Events/${eventId}/Results`,
    "->",
    evRes.status
  );
  if (evRes.ok) {
    const evJson = (await evRes.json()) as unknown;
    const arr = Array.isArray(evJson) ? evJson : [evJson];
    const firstRow =
      (arr[0] as { sessionResults?: { resultRows?: unknown[] }[] })
        ?.sessionResults?.[0]?.resultRows?.[0];
    console.log("Sample result row keys:");
    if (firstRow && typeof firstRow === "object") {
      console.log(Object.keys(firstRow as object));
      console.log(JSON.stringify(firstRow, null, 2));
    } else {
      console.log("(no row found)");
    }
  } else {
    console.log(await evRes.text());
  }

  // 3. Try the Members endpoint candidates
  const memberPaths = [
    `${BASE}/${leagueName}/Members`,
    `${BASE}/${leagueName}/LeagueMembers`,
    `${BASE}/${leagueName}/Members/Get`,
  ];
  for (const path of memberPaths) {
    const r = await fetch(path, { headers: auth });
    console.log("\nGET", path, "->", r.status);
    if (r.ok) {
      const j = (await r.json()) as unknown;
      const list = Array.isArray(j) ? j : [j];
      console.log("Members count:", list.length);
      if (list.length > 0 && typeof list[0] === "object") {
        console.log("Sample member keys:", Object.keys(list[0] as object));
        console.log(JSON.stringify(list[0], null, 2));
      }
      break;
    } else {
      const txt = (await r.text()).slice(0, 200);
      console.log("Body:", txt);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
