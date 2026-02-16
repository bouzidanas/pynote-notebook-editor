import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microtokenizer.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microTokenizerCells: CellData[] = [
    {
        id: "nm-tok-header",
        type: "markdown",
        content: `# Byte-Pair Encoding (BPE) Tokenizer

How text becomes numbers — the compression algorithm hiding inside every LLM.

Byte-Pair Encoding learns a vocabulary by iteratively merging the most frequent
adjacent token pairs, then encodes new text by replaying those merges in priority order.

> Philip Gage, *"A New Algorithm for Data Compression"* (1994).
> GPT-2's byte-level BPE variant (Radford et al., 2019) starts from raw bytes
> rather than characters — that's the version implemented here.

**Reference:** \`01-foundations/microtokenizer.py\` — no-magic collection

[← Back to No-Magic Index](?open=no-magic)

---`
    },
    {
        id: "nm-tok-imports",
        type: "code",
        content: `from __future__ import annotations

import random
from collections import Counter
from pyodide.http import open_url

random.seed(42)  # repo convention; BPE itself is fully deterministic`
    },
    {
        id: "nm-tok-constants-md",
        type: "markdown",
        content: `## Constants

Production tokenizers (GPT-2, GPT-4) use 50K+ merges trained on hundreds of gigabytes. 256 merges on 18KB is a toy, but **the algorithm is identical**.`
    },
    {
        id: "nm-tok-constants",
        type: "code",
        content: `NUM_MERGES = 256  # Final vocab = 256 byte tokens + 256 merges = 512 tokens.

DATA_URL = "https://raw.githubusercontent.com/karpathy/makemore/master/names.txt"`
    },
    {
        id: "nm-tok-data-md",
        type: "markdown",
        content: `## Data Loading`
    },
    {
        id: "nm-tok-data",
        type: "code",
        content: `def load_data(url: str) -> bytes:
    """Download dataset, return raw bytes."""
    print("Downloading data...")
    text = open_url(url).read()
    return text.encode("utf-8")

raw = load_data(DATA_URL)
corpus_ids = list(raw)`
    },
    {
        id: "nm-tok-rawbytes-md",
        type: "markdown",
        content: `Starting from raw bytes means every possible input is representable — there are no "unknown token" problems. This is the key insight of byte-level BPE: the base vocabulary covers all of Unicode (via UTF-8 byte sequences) without needing a character-level vocabulary for every writing system.`
    },
    {
        id: "nm-tok-stats",
        type: "code",
        content: `print(f"Corpus: {len(raw):,} bytes, base vocab: 256 byte tokens")
print(f"Will train {NUM_MERGES} merges (final vocab: {256 + NUM_MERGES} tokens)")`
    },
    {
        id: "nm-tok-training-md",
        type: "markdown",
        content: `## BPE Training

The algorithm has three core parts:

1. **Count pairs** — find the most frequent adjacent token pair
2. **Merge** — replace every occurrence with a new token ID
3. **Repeat** — greedily compress the corpus`
    },
    {
        id: "nm-tok-pairs-md",
        type: "markdown",
        content: `### Counting Pairs

For sequence s = [s_0, s_1, ..., s_n], we count all (s_i, s_{i+1}) pairs.
Example: \`[a, b, c, b, c]\` → \`{(a,b): 1, (b,c): 2, (c,b): 1}\`.
This is the core statistic BPE uses to decide what to merge next.`
    },
    {
        id: "nm-tok-pair-counts",
        type: "code",
        content: `def get_pair_counts(token_ids: list[int]) -> Counter:
    """Count frequency of every adjacent token pair."""
    # zip(ids, ids[1:]) pairs each element with its right neighbor -- O(n).
    return Counter(zip(token_ids, token_ids[1:]))`
    },
    {
        id: "nm-tok-merge-md",
        type: "markdown",
        content: `### Applying Merges

Replace every occurrence of a token pair with a new token ID in a single left-to-right pass.

Overlapping pairs resolve left-to-right: in \`[a, a, a]\` merging \`(a,a)\` produces
\`[new, a]\`, not \`[a, new]\`. This matches the standard BPE convention and ensures
the merge operation is deterministic regardless of pair overlap patterns.

> **Signpost:** this O(n) scan runs once per merge, giving O(n × M) total training
> cost for M merges. Production implementations (SentencePiece, tiktoken) use
> priority queues for O(n log n) total, but the output is identical.`
    },
    {
        id: "nm-tok-apply-merge",
        type: "code",
        content: `def apply_merge(token_ids: list[int], pair: tuple[int, int], new_id: int) -> list[int]:
    """Replace every occurrence of \`pair\` with \`new_id\` in a single left-to-right pass."""
    merged = []
    i = 0
    while i < len(token_ids):
        if i < len(token_ids) - 1 and (token_ids[i], token_ids[i + 1]) == pair:
            merged.append(new_id)
            i += 2  # consumed both tokens in the pair
        else:
            merged.append(token_ids[i])
            i += 1
    return merged`
    },
    {
        id: "nm-tok-trainbpe-md",
        type: "markdown",
        content: `### The Training Loop

Each merge absorbs the single most redundant pair in the corpus — a greedy
compression step that naturally discovers morphological units (\`"an" + "a"\`,
\`"el" + "la"\`) without any linguistic rules.

The merge table is ordered by priority: merge 0 was most frequent in the original
corpus, merge 1 most frequent after merge 0, and so on. This ordering is critical
for encoding.`
    },
    {
        id: "nm-tok-train-fn",
        type: "code",
        content: `def train_bpe(
    token_ids: list[int], num_merges: int
) -> list[tuple[tuple[int, int], int]]:
    """Learn BPE merge rules by greedily merging the most frequent adjacent pair.

    Returns: ordered list of (pair, new_id) tuples where new_id = 256 + merge_index.
    """
    ids = list(token_ids)  # work on a copy
    merges: list[tuple[tuple[int, int], int]] = []

    for i in range(num_merges):
        counts = get_pair_counts(ids)
        if not counts:
            # Entire corpus collapsed to a single token (or is empty). Rare in
            # practice, but correct to handle: no more pairs means no more merges.
            break

        # The pair with the highest count gets merged next.
        pair = max(counts, key=counts.get)  # type: ignore[arg-type]
        new_id = 256 + i  # byte IDs 0-255 reserved; merges start at 256

        ids = apply_merge(ids, pair, new_id)
        merges.append((pair, new_id))

        if (i + 1) % 32 == 0 or i == 0:
            a, b = pair
            print(
                f"  merge {i + 1:>3}/{num_merges}: "
                f"({a:>3}, {b:>3}) -> {new_id:>3}  "
                f"freq={counts[pair]:>5}  corpus_len={len(ids)}"
            )

    return merges`
    },
    {
        id: "nm-tok-runtrain-md",
        type: "markdown",
        content: `### Run Training

Watch how the corpus length shrinks with each merge — that's compression happening in real time.`
    },
    {
        id: "nm-tok-train-run",
        type: "code",
        content: `print("Training BPE...")
merges = train_bpe(corpus_ids, NUM_MERGES)
print(f"\\nTraining complete: {len(merges)} merges learned")`
    },
    {
        id: "nm-tok-encdec-md",
        type: "markdown",
        content: `## Encoding & Decoding

Once training is done, we can encode any text by replaying merges in priority order, and decode by looking up each token ID in the vocabulary table.`
    },
    {
        id: "nm-tok-vocab-md",
        type: "markdown",
        content: `### Vocabulary Table

Base vocabulary: 256 entries mapping each byte value to its single-byte string.
Each merge extends the table: \`vocab[new_id] = vocab[a] + vocab[b]\`.
This recursive expansion means decoding is just a table lookup — no merge
replay needed, and round-trip correctness is guaranteed by construction.`
    },
    {
        id: "nm-tok-vocab",
        type: "code",
        content: `def build_vocab(merges: list[tuple[tuple[int, int], int]]) -> dict[int, bytes]:
    """Build token ID -> bytes lookup table."""
    vocab: dict[int, bytes] = {i: bytes([i]) for i in range(256)}
    for (a, b), new_id in merges:
        vocab[new_id] = vocab[a] + vocab[b]
    return vocab

vocab = build_vocab(merges)
print(f"Vocabulary size: {len(vocab)} tokens")`
    },
    {
        id: "nm-tok-encode-md",
        type: "markdown",
        content: `### Encode & Decode

**Encoding:** merges are applied in the order they were learned (priority order),
NOT by re-counting frequencies on the new text. Priority order ensures
deterministic tokenization — the same string always produces the same token
sequence, regardless of what other text the tokenizer was trained on.
Re-counting frequencies would make the output dependent on the input batch,
breaking the contract that tokenization is a pure function of the input string.

> **Signpost:** this O(n × M) naive encoding checks every merge against the full
> sequence. Production tokenizers (tiktoken, HuggingFace) use trie structures
> for O(n) encoding, but produce identical output.

**Decoding:** every token maps to a definite byte sequence through the vocab table, so
\`decode(encode(text)) == text\` is guaranteed for any valid UTF-8 input.
Decoding is trivially simple by design — all the complexity lives in encoding.`
    },
    {
        id: "nm-tok-encode-decode",
        type: "code",
        content: `def encode(text: str, merges: list[tuple[tuple[int, int], int]]) -> list[int]:
    """Encode a string to BPE token IDs by replaying merges in priority order."""
    token_ids = list(text.encode("utf-8"))
    for pair, new_id in merges:
        token_ids = apply_merge(token_ids, pair, new_id)
    return token_ids


def decode(token_ids: list[int], vocab: dict[int, bytes]) -> str:
    """Decode token IDs back to a string via byte lookup and UTF-8 decoding."""
    raw_bytes = b"".join(vocab[tid] for tid in token_ids)
    return raw_bytes.decode("utf-8")`
    },
    {
        id: "nm-tok-roundtrip-md",
        type: "markdown",
        content: `## Round-Trip Tests

Verify encode-decode identity on diverse inputs: common name, uncommon name,
hyphenated, apostrophe, empty string, single character.`
    },
    {
        id: "nm-tok-roundtrip",
        type: "code",
        content: `test_strings = ["Emma", "Xiomara", "Mary-Jane", "O'Brien", "", "Z"]
print("Round-trip tests:")
all_pass = True
for s in test_strings:
    encoded = encode(s, merges)
    decoded = decode(encoded, vocab)
    status = "PASS" if decoded == s else "FAIL"
    if status == "FAIL":
        all_pass = False
    display = f'"{s}"' if s else '""'
    print(f"  [{status}] {display:<14} -> {len(encoded):>2} tokens -> {decoded!r}")

print(f"\\nAll tests passed: {all_pass}")`
    },
    {
        id: "nm-tok-compression-md",
        type: "markdown",
        content: `## Compression Ratio

\`compression_ratio = len(original_bytes) / len(bpe_tokens)\`

Each BPE token represents \`ratio\` bytes on average. Higher is better —
it means the tokenizer discovered more compressible structure.`
    },
    {
        id: "nm-tok-compression",
        type: "code",
        content: `corpus_text = raw.decode("utf-8")
corpus_encoded = encode(corpus_text, merges)
ratio = len(raw) / len(corpus_encoded)
print(
    f"Compression: {len(raw):,} bytes -> {len(corpus_encoded):,} tokens "
    f"(ratio: {ratio:.2f}x)"
)`
    },
    {
        id: "nm-tok-merges-md",
        type: "markdown",
        content: `## Inspecting Learned Merges

The earliest merges are the highest-priority — they capture the most common patterns in the corpus.`
    },
    {
        id: "nm-tok-merges",
        type: "code",
        content: `print("Top 20 merges (earliest = highest priority):")
for i, ((a, b), new_id) in enumerate(merges[:20]):
    a_str = vocab[a].decode("utf-8", errors="replace")
    b_str = vocab[b].decode("utf-8", errors="replace")
    merged_str = vocab[new_id].decode("utf-8", errors="replace")
    print(f"  {i + 1:>2}. {a_str!r:>6} + {b_str!r:<6} -> {merged_str!r}")`
    },
    {
        id: "nm-tok-example-md",
        type: "markdown",
        content: `## Tokenization Example

See how a word gets broken down into subword pieces.`
    },
    {
        id: "nm-tok-example",
        type: "code",
        content: `example = "Elizabeth"
example_tokens = encode(example, merges)
pieces = [vocab[tid].decode("utf-8", errors="replace") for tid in example_tokens]
print(f'Tokenization example: "{example}"')
print(f"  Bytes:  {list(example.encode('utf-8'))}")
print(f"  Tokens: {example_tokens}")
print(f"  Pieces: {pieces}")`
    }
];
