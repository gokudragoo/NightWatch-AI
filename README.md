# NightWatch AI

Your AI crypto guardian while you sleep.

NightWatch AI is an autonomous overnight risk manager for crypto traders. It watches live market intelligence, turns that data into a Market Danger Score, explains the risk in plain language with OpenAI, and prepares wallet-approved SoDEX protection orders on ValueChain testnet.

The core promise is simple: activate Sleep Mode before going offline, let NightWatch monitor the market, then wake up to a clear report of what changed and what protection was prepared.

## Project Goal

Crypto markets run 24/7, but traders do not. NightWatch AI solves the overnight risk problem by combining:

- SoSoValue as the intelligence layer for market snapshots, news, ETF flow pressure, and sector rotation.
- OpenAI as the reasoning and explanation layer for concise risk briefs.
- SoDEX as the execution layer for signed protection orders.
- ValueChain as the on-chain wallet and settlement environment.

Wave 1 is designed to be demoable end-to-end: live data comes in, the dashboard computes risk, the AI brief explains what to do, and the user can sign a SoDEX testnet order.

## Live User Flow

1. User opens the dashboard at `/dashboard` or scrolls to the console on the homepage.
2. NightWatch loads SoSoValue intelligence for tracked assets and SoDEX testnet market routes.
3. The risk engine computes a Market Danger Score and explains which signals are driving it.
4. OpenAI creates a trader-friendly risk brief when `OPENAI_API_KEY` is configured. If no key is present, the app uses a deterministic fallback brief so the demo still works.
5. User picks a protection mode: Safe, Balanced, or Aggressive.
6. User connects an EVM wallet and switches/adds ValueChain testnet.
7. NightWatch prepares a SoDEX spot `batchNewOrder` payload.
8. User signs the EIP-712 `ExchangeAction`.
9. The server submits the signed testnet order to SoDEX.

NightWatch never silently trades. Every Wave 1 protection order requires wallet approval.

## Tech Stack

- Next.js 14 App Router, React, TypeScript
- Tailwind CSS with the original v0 animation, layout, motion, image, and color system preserved
- Framer Motion, lucide-react, shadcn-style UI components
- SoSoValue OpenAPI for market snapshots, hot news, ETF history, and sector spotlight
- OpenAI Responses API for the dashboard risk brief
- SoDEX REST API on ValueChain testnet for symbols, tickers, account state, and signed spot orders
- ValueChain testnet EIP-712 wallet signatures
- viem for payload hashing

## Environment

Create `.env.local` from `.env.example`:

```bash
SOSOVALUE_API_KEY=your_sosovalue_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.4-mini
```

`SOSOVALUE_API_KEY` and `OPENAI_API_KEY` are only read server-side. `OPENAI_API_KEY` is optional for Wave 1 because the app includes a fallback risk brief.

## Run Locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open:

- Homepage: `http://localhost:3000`
- Dashboard: `http://localhost:3000/dashboard`

## Wave 1: Shipped Now

- NightWatch landing experience adapted from the v0 template while keeping the existing visual flow, animations, colors, rounded glass navigation, carousel motion, and section rhythm.
- Dedicated `/dashboard` route for the live Wave 1 console.
- Live NightWatch Console with portfolio value controls and Safe, Balanced, and Aggressive protection modes.
- SoSoValue-backed intelligence route for BTC, ETH, SOL, LINK, hot news, ETF flow pressure, and sector rotation.
- Deterministic Market Danger Score with explainable signals and recommended protection actions.
- OpenAI risk brief route using the Responses API, plus deterministic fallback when no OpenAI key is configured.
- SoDEX ValueChain testnet market route using live testnet symbols and tickers.
- Wallet connection, ValueChain testnet network switch/add flow, and SoDEX account-state lookup.
- EIP-712 signing path for a SoDEX spot `batchNewOrder` protection payload.
- Server route to submit the signed SoDEX testnet protection order after wallet approval.
- Protection simulator for overnight drawdown and estimated loss reduction.
- Legacy template route redirects to NightWatch so the old dealership page is no longer exposed.

## Wave 2 Goals

- Persist user portfolios, positions, risk profiles, and Sleep Mode sessions.
- Add Telegram, email, and push notifications for overnight alerts.
- Add SoDEX perps protection: hedge sizing, leverage reduction, TP/SL modification, and position monitoring.
- Store signed action history, order outcomes, and AI-generated morning reports.
- Add richer OpenAI explanations with cited source snippets from SoSoValue news, ETF flows, sectors, and market snapshots.
- Add strategy templates: capital preservation, profit lock, volatility hedge, and narrative rotation.
- Add a wallet-safe dry-run mode that previews every order before signing.

## Wave 3 Goals

- Permissioned autonomous agents with configurable spend, asset, slippage, and time limits.
- Multi-wallet and multi-account support.
- Backtesting and replay mode for risk policies.
- Copy-protection strategies from trusted risk managers.
- Voice assistant and mobile-first Sleep Mode.
- Production execution guardrails, audit logs, anomaly detection, and emergency pause controls.
- Mainnet-readiness review for security, compliance, monitoring, and rollback paths.

## Demo Script

1. Open `/dashboard`.
2. Confirm the source badges show live SoSoValue and live SoDEX when credentials/network are available.
3. Read the Market Danger Score and OpenAI risk brief.
4. Toggle Sleep Mode and switch between Safe, Balanced, and Aggressive.
5. Connect wallet, add/switch to ValueChain testnet, enter or load a SoDEX account ID.
6. Choose a SoDEX market and sign the testnet protection order.
7. Show that the app refuses to submit if wallet or account context is missing.

## On-chain Execution Notes

NightWatch prepares a SoDEX ValueChain testnet payload, computes the SoDEX EIP-712 `ExchangeAction`, asks the wallet to sign it, prefixes the signature for SoDEX, and submits through the server route. This keeps Wave 1 real and on-chain while preserving user approval.

## Documentation References

- SoSoValue API: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- SoDEX docs: https://sodex.com/documentation
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI text generation guide: https://platform.openai.com/docs/guides/text
