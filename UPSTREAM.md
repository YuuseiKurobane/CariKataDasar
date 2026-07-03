# Yomitan upstream snapshot

The minimal runtime in `src/yomitan` was copied from:

- Repository: `https://github.com/yomidevs/yomitan`
- Local source branch: `CariKataDasar`
- Commit: `b8856e2517e8107a64718f57ea827f4558761565`
- License: GPL-3.0-or-later

## Vendored files

| Local path | SHA-256 at import |
| --- | --- |
| `src/yomitan/core/event-dispatcher.js` | `fb486d2026dbf9da7a05073b86892f485de72e60dbe4a5b0912dc48a6bf44afb` |
| `src/yomitan/core/extension-error.js` | `89360fb6b5a9dcc12102ee4b080ee79dc15861fce8eea843c1b16b10b89cf8f5` |
| `src/yomitan/core/log.js` | `81fd33bdf3441c4cfde702a36338ea2c639ee96724b2487d6883b5aa99e4d930` |
| `src/yomitan/language/language-transformer.js` | `f45db85ae6c5628b65ef0c45d48a47f6091f43109d723f81826dc4a1ce3ae198` |
| `src/yomitan/language/language-transforms.js` | `e454f0a7333170aa1e96e42e546a316aee9c31b8b1d8056d45c034e1470c8a14` |
| `src/yomitan/language/text-processors.js` | `a5b244b8995fda8c7603358fc0ea517f57eb0e7966e586a518b5cb3fd3224ab1` |
| `src/yomitan/language/id/indonesian-transforms.js` | `596ba125c29eBDABF70D111C436385FAEC4A240E0708A7E8401FAFE1CB0751D7` |

`src/yomitan/language/id/indonesian-transforms.js` is the project's main
editable parser definition. Changes to it are expected and are therefore not
checked by `npm run check:upstream`.

The other files are compatibility infrastructure. Refresh them from one
upstream commit as a unit, update their hashes here and in
`scripts/check-upstream.mjs`, and run the complete test suite.

