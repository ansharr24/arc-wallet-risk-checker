import {
  createPublicClient,
  http,
  decodeFunctionData,
  parseAbi,
  hexToBigInt,
  getAddress,
  type Hex,
} from "viem";

const RPC = process.env.ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.network";

const SUBMIT_BATCH_ABI = parseAbi([
  "function submitBatch(bytes calldataBytes, bytes signature)",
]);

export type BatchEntry = {
  address: `0x${string}`;
  delta: bigint;
  usdc: string;
};

export type NetTransfer = {
  from: `0x${string}`;
  to: `0x${string}`;
  usdc: string;
};

export type DecodedBatch = {
  txHash: `0x${string}`;
  blockNumber: bigint;
  relayer: `0x${string}`;
  contract: `0x${string}`;
  batchId: `0x${string}`;
  domain: number;
  token: `0x${string}`;
  innerContract: `0x${string}`;
  entries: BatchEntry[];
  netTransfers: NetTransfer[];
};

export async function decodeBatch(
  txHash: `0x${string}`,
): Promise<DecodedBatch> {
  const client = createPublicClient({ transport: http(RPC) });
  const tx = await client.getTransaction({ hash: txHash });
  if (!tx.to) throw new Error("contract creation, not a submitBatch");

  const decoded = decodeFunctionData({
    abi: SUBMIT_BATCH_ABI,
    data: tx.input,
  });
  if (decoded.functionName !== "submitBatch") {
    throw new Error(`not submitBatch (got ${decoded.functionName})`);
  }
  const [calldataBytesHex] = decoded.args;
  const calldata = (calldataBytesHex as Hex).slice(2);

  const word = (i: number) => calldata.slice(i * 64, (i + 1) * 64);
  const addrFromWord = (i: number) =>
    getAddress(("0x" + word(i).slice(24)) as `0x${string}`);
  const intFromWord = (i: number, signed = false) =>
    hexToBigInt(("0x" + word(i)) as Hex, { signed });

  // calldataBytes layout (per onchain inspection):
  //   word 0: offset pointer to entries (typically 0xa0)
  //   word 1: batchId (bytes32)
  //   word 2: gateway domain (uint32, last byte populated)
  //   word 3: token address
  //   word 4: gateway-wallet contract address
  //   word 5: entries length
  //   words 6..: (address, int256 delta) pairs
  const batchId = ("0x" + word(1)) as Hex;
  const domain = Number(intFromWord(2));
  const token = addrFromWord(3);
  const innerContract = addrFromWord(4);
  const count = Number(intFromWord(5));

  const entries: BatchEntry[] = [];
  for (let i = 0; i < count; i++) {
    const address = addrFromWord(6 + i * 2);
    const delta = intFromWord(7 + i * 2, true);
    entries.push({ address, delta, usdc: formatSignedUsdc(delta) });
  }

  // Net transfers: pair each negative with an exact-opposite positive
  const negatives = entries.filter((e) => e.delta < 0n);
  const positives = [...entries.filter((e) => e.delta > 0n)];
  const netTransfers: NetTransfer[] = [];
  for (const n of negatives) {
    const idx = positives.findIndex((p) => p.delta === -n.delta);
    if (idx >= 0) {
      netTransfers.push({
        from: n.address,
        to: positives[idx].address,
        usdc: formatSignedUsdc(-n.delta),
      });
      positives.splice(idx, 1);
    }
  }

  return {
    txHash,
    blockNumber: tx.blockNumber ?? 0n,
    relayer: tx.from,
    contract: tx.to,
    batchId,
    domain,
    token,
    innerContract,
    entries,
    netTransfers,
  };
}

function formatSignedUsdc(v: bigint): string {
  const sign = v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0");
  return `${sign}${whole}.${frac}`;
}

// CLI
const invokedDirectly = process.argv[1]?.endsWith("decode-batch.ts");
if (invokedDirectly) {
  const txHash = process.argv[2] as `0x${string}` | undefined;
  if (!txHash || !txHash.startsWith("0x")) {
    console.error("usage: tsx decode-batch.ts <tx-hash>");
    process.exit(1);
  }
  decodeBatch(txHash)
    .then((b) => {
      const pad = (s: string, n = 18) => s.padEnd(n);
      console.log(`${pad("tx")}${b.txHash}`);
      console.log(`${pad("block")}${b.blockNumber}`);
      console.log(`${pad("relayer (from)")}${b.relayer}`);
      console.log(`${pad("contract (to)")}${b.contract}`);
      console.log(`${pad("batch id")}${b.batchId}`);
      console.log(
        `${pad("domain")}${b.domain}${b.domain === 26 ? " (Arc)" : ""}`,
      );
      console.log(`${pad("token")}${b.token}`);
      console.log(`${pad("inner contract")}${b.innerContract}`);
      console.log(`\nentries (${b.entries.length}):`);
      for (const e of b.entries) {
        const v = e.usdc.startsWith("-") ? e.usdc : "+" + e.usdc;
        console.log(`  ${v.padStart(14)} USDC  ${e.address}`);
      }
      console.log(`\nnet transfers (${b.netTransfers.length}):`);
      for (const t of b.netTransfers) {
        console.log(`  ${t.from} -> ${t.to}  ${t.usdc} USDC`);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
