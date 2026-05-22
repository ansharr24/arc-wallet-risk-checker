import { GatewayClient } from "@circle-fin/x402-batching/client";

const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error("set PRIVATE_KEY to your MetaMask Arc-testnet wallet's key");
  console.error('  export PRIVATE_KEY=0x...');
  console.error('  tsx buyer.ts');
  process.exit(1);
}

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: pk as `0x${string}`,
});

const url = process.argv[2] ?? "http://localhost:3000/hello-world";
console.log(`paying ${url}`);

const { status, data } = await client.pay(url);
console.log(`status: ${status}`);
console.log("data:", data);
