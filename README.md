# getAddressesFromBIP39

BIP39 mnemonics → EVM addresses → comparison against Safe owners.

Derives the first account (`m/44'/60'/0'/0/0`) of each 24-word mnemonic and checks that the
resulting addresses are exactly the owners of a given Safe.

## Install

Requires Node.js 18+.

```bash
npm install
```

## Generate addresses

Create `in.txt` with one 24-word mnemonic per line (blank lines are ignored), then:

```bash
node getAddresses.js
```

Result: `out.txt`, one address per line, in the same order as the mnemonics in `in.txt`.

## Compare with a Safe

```bash
node safeCompare.js 0xSAFE_ADDRESS --rpc RPC_URL
# or
RPC_URL=https://... node safeCompare.js 0xSAFE_ADDRESS
```

Reads owners and threshold directly from the Safe contract, writes them to `safe.txt` and
compares them (order and case ignored) against `out.txt`.
Prints `SAFE MATCH: YES` (exit 0) or `SAFE MATCH: NO` with the differences (exit 1). Errors exit with 2.

## Delete input

```bash
node deleteInput.js
```

## Tests

```bash
npm test           # unit tests
npm run test:e2e   # end-to-end with Anvil (Foundry) and the official Safe v1.5.0 contracts
```

## Security

- `in.txt`, `out.txt` and `safe.txt` are ignored by Git. Never share `in.txt`.
- Mnemonics and private keys are never printed or written to disk.
- `getAddresses.js` works offline; `safeCompare.js` only talks to the RPC you provide.
- `deleteInput.js` overwrites and deletes `in.txt` on a best-effort basis. It cannot guarantee
  physical erasure on SSDs or modern filesystems (journaling, snapshots, backups).
  For highly sensitive material, work on encrypted storage.
