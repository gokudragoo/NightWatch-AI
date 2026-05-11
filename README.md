# NightWatch AI

Your AI crypto guardian while you sleep.

NightWatch AI monitors crypto risk with SoSoValue intelligence and prepares wallet-approved SoDEX protection actions on ValueChain. The core user flow is simple: connect wallet, activate Sleep Mode, review the Market Danger Score, and sign a SoDEX testnet protection order when the policy calls for action.

## Tech Stack

- Next.js 14 App Router, React, TypeScript
- Tailwind CSS with the original v0 motion/layout system preserved
- Framer Motion, lucide-react, shadcn-style UI components
- SoSoValue OpenAPI for market snapshots, hot news, ETF flow history, and sector spotlight
- SoDEX REST API on ValueChain testnet for symbols, tickers, account state, and signed spot orders
- ValueChain testnet EIP-712 wallet signatures

## Environment

Create `.env.local` with:

```bash
SOSOVALUE_API_KEY=your_sosovalue_api_key_here
```

The key is only read server-side by the `/api/nightwatch/intel` route.

## Run Locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000`.

## What Wave 1 Ships Now

- NightWatch landing experience adapted from the v0 template while keeping the existing visual flow, animations, colors, rounded glass navigation, carousel motion, and section rhythm.
- Live NightWatch Console with portfolio protection modes: Safe, Balanced, and Aggressive.
- SoSoValue-backed intelligence route for BTC, ETH, SOL, LINK, hot news, ETF flow pressure, and sector rotation.
- Market Danger Score with explainable signals and protection actions.
- SoDEX ValueChain testnet market route using live testnet symbols and tickers.
- Wallet connection, ValueChain testnet network switch/add flow, and SoDEX account-state lookup.
- EIP-712 signing path for a SoDEX spot `batchNewOrder` protection payload.
- Server route to submit the signed SoDEX testnet protection order after wallet approval.
- Protection simulator for overnight drawdown and estimated loss reduction.
- Legacy template route redirects to the NightWatch app so the product no longer exposes the old dealership page.

## Wave 2 Roadmap

- Persist user portfolios, positions, risk profiles, and Sleep Mode sessions.
- Add notification delivery through Telegram, email, and push.
- Add SoDEX perps protection: hedge sizing, leverage reduction, TP/SL modification, and position monitoring.
- Store signed action history, order outcomes, and morning reports.
- Add richer AI explanations with source attribution across SoSoValue news, ETF flows, sectors, and market snapshots.
- Add strategy templates: capital preservation, profit lock, volatility hedge, and narrative rotation.

## Wave 3 Roadmap

- Permissioned autonomous agents with configurable spend, asset, slippage, and time limits.
- Multi-wallet and multi-account support.
- Backtesting and replay mode for risk policies.
- Copy-protection strategies from trusted risk managers.
- Voice assistant and mobile-first Sleep Mode.
- Production execution guardrails, audit logs, anomaly detection, and emergency pause controls.

## On-chain Execution Notes

NightWatch does not silently execute trades. The app prepares a SoDEX ValueChain testnet payload, computes the SoDEX EIP-712 `ExchangeAction`, asks the wallet to sign it, prefixes the signature for SoDEX, and then submits it through the server route. This keeps the Wave 1 demo real while preserving user approval.
