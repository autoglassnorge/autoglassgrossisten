/**
 * Set Worker secrets via Cloudflare API
 */
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const WORKER_NAME = "autoglass-glass-sok";

async function setSecret(name: string, value: string) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/secrets`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, text: value, type: "secret_text" }),
  });
  const data = await res.json();
  if (!data.success) {
    console.error(`❌ Failed to set ${name}:`, JSON.stringify(data.errors));
    return false;
  }
  console.log(`✅ Secret ${name} set`);
  return true;
}

async function main() {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    console.error("❌ Missing CF_ACCOUNT_ID or CF_API_TOKEN");
    process.exit(1);
  }

  // Set SVV API Key (open API, NOT Maskinporten)
  // Key: a578e3c7-f27b-4b73-8938-af26edd89d68
  await setSecret("SVV_API_KEY", "a578e3c7-f27b-4b73-8938-af26edd89d68");
}

main().catch(console.error);
