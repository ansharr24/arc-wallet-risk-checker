# circle-agent

A minimal x402 paid-API demo using Circle's Gateway batching facilitator on Arc Testnet. The server exposes a `$0.01` paywalled `/hello-world` endpoint plus helpers for inspecting settlements and decoding on-chain batches. The buyer is a CLI that pays the endpoint with USDC from a private key.

## Prerequisites

- Node.js 20+
- An Arc Testnet wallet funded with testnet USDC (MetaMask for the browser buyer, or a raw private key for the CLI buyer)

## Installation

```bash
npm install
```

## Running the server

```bash
npm start
```

This runs `tsx server.ts` and listens on `http://localhost:3000`.

Endpoints:
- `GET /hello-world` — paywalled at `$0.01` USDC via the Gateway middleware
- `GET /api/settlement/:id` — proxies the Gateway settlement lookup
- `GET /api/decode-batch/:hash` — decodes a `submitBatch` transaction
- `GET /api/batch-tx/:id` — resolves a settlement id to its on-chain batch tx
- `/` — serves `public/buyer.html` (browser-based buyer UI)

## Running the buyer (browser — recommended)

With the server running, open `http://localhost:3000/` in a browser. The page (`public/buyer.html`) connects to MetaMask, prompts you to switch to Arc Testnet, and signs the EIP-712 payment authorization in the wallet. No env vars or private keys required.

## Running the buyer (CLI — optional)

Only use this if you want to pay from a raw private key instead of MetaMask. In a separate terminal, with the server running:

```bash
export PRIVATE_KEY=0x...   # Arc Testnet wallet private key
npm run buyer              # pays http://localhost:3000/hello-world
```

To pay a different URL:

```bash
npx tsx buyer.ts http://localhost:3000/hello-world
```

## Configuration

The seller address, facilitator URL, and Arc Testnet network id are hardcoded near the top of `server.ts`. Edit those constants to point at a different seller wallet or network.
