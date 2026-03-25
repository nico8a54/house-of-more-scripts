/**
 * test-e-member-profile.js
 * Tests: E - Member - Bring Member Profile (Make scenario 4007408)
 *
 * Run:  node test-e-member-profile.js
 *
 * Calls the Cloudflare Worker proxy (key is stored server-side in the Worker).
 */

const WEBHOOK_URL = "https://houseofmore.nico-97c.workers.dev/member-profile";

// Replace with a real member ID from your Memberstack sandbox
const TEST_MEMBER_ID = "mem_sb_cmla331hr05l50sps7d2rhy5q";

async function run() {
  console.log("→ Calling webhook:", WEBHOOK_URL);
  console.log("→ Member ID:", TEST_MEMBER_ID);
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_id: TEST_MEMBER_ID })
  });

  console.log("\n← Status:", res.status);

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Request failed:", text);
    process.exit(1);
  }

  const data = await res.json();
  console.log("✅ Response:\n", JSON.stringify(data, null, 2));
}

run().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
