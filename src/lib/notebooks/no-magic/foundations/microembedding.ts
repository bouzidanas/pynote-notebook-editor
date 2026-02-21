import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microembedding.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microEmbeddingCells: CellData[] = [
    {
        id: "nm-emb-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Contrastive Learning (InfoNCE) Embeddings

How meaning becomes geometry — training vectors where distance equals similarity,
using only character n-grams and contrastive loss.

Breaking this down further:

An **embedding** is a dense vector (a list of numbers) that represents some input —
a word, a name, a sentence — in a way that preserves meaningful relationships.
If two names sound alike, their embedding vectors should point in similar directions;
if they're unrelated, the vectors should be far apart.

**Contrastive learning** is how we train these embeddings without any labels.
The idea: take an input (the **anchor**), create a slightly modified version
(the **positive** — e.g., a name with a character swapped), and treat all other
inputs in the batch as **negatives**. The training objective (InfoNCE loss) pushes
the anchor closer to its positive and further from the negatives in embedding space.

**Character n-grams** are the features we start from. Instead of treating each
character independently, we extract overlapping 2- and 3-character sequences
(bigrams and trigrams). "anna" → \`["^a", "an", "nn", "na", "a$", "^an", "ann", "nna", "na$"]\`.
Names that share n-grams end up with similar feature vectors before any learning happens.

The full pipeline: **n-gram features → linear projection → L2 normalization → contrastive loss**.
The linear projection is the only learned component — a single matrix \`W\` that maps
sparse n-gram counts to dense embedding vectors. No deep network needed.

> Inspired by SimCLR (Chen et al., 2020) and sentence-transformers, simplified to a
> linear projection without the deep network machinery.

**Reference:** \`01-foundations/microembedding.py\` — no-magic collection

---`
    },
    {
        id: "nm-emb-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
from collections import Counter

random.seed(42)`
    },
    {
        id: "nm-emb-003",
        type: "markdown",
        content: `## Constants

Production embedding models (sentence-transformers, CLIP) use deep transformer
encoders with 12+ layers. This linear projection demonstrates the core contrastive
learning mechanism without the architectural complexity.`
    },
    {
        id: "nm-emb-004",
        type: "code",
        content: `EMBEDDING_DIM = 32  # Target embedding dimension (sparse n-grams → dense vectors)
LEARNING_RATE = 0.05  # SGD learning rate (Adam adds overhead without much benefit here)
TEMPERATURE = 0.1  # InfoNCE temperature: lower = sharper similarity distribution
NUM_EPOCHS = 30  # Enough to see clear separation between positive/random pairs
BATCH_SIZE = 64
MAX_VOCAB = 500  # Cap n-gram vocabulary to most frequent entries for speed
TRAIN_SIZE = 5000  # Subset of names for training (full set is 32K — too slow for demo)

DATA_URL = "https://raw.githubusercontent.com/karpathy/makemore/master/names.txt"`
    },
    {
        id: "nm-emb-005",
        type: "markdown",
        content: `## Data Loading`
    },
    {
        id: "nm-emb-006",
        type: "code",
        content: `from pyodide.http import open_url

def load_data(url: str) -> list[str]:
    """Download dataset, return list of names."""
    text = open_url(url).read()
    return [line.strip().lower() for line in text.split('\\n') if line.strip()]`
    },
    {
        id: "nm-emb-007",
        type: "markdown",
        content: `## Feature Extraction

### Character N-Grams

Why n-grams: they capture local phonetic patterns better than individual
characters. "anna" and "anne" share bigrams "an", "nn" and trigram "ann",
so their n-gram vectors will have high overlap even though they differ by
one character. This is what makes n-grams sensitive to pronunciation similarity.`
    },
    {
        id: "nm-emb-008",
        type: "code",
        content: `def extract_ngrams(text: str) -> list[str]:
    """Extract character bigrams and trigrams from text."""
    # Pad with boundary markers to capture start/end patterns
    padded = f"^{text}$"
    bigrams = [padded[i:i+2] for i in range(len(padded) - 1)]
    trigrams = [padded[i:i+3] for i in range(len(padded) - 2)]
    return bigrams + trigrams`
    },
    {
        id: "nm-emb-009",
        type: "markdown",
        content: `### N-Gram Vocabulary

Capping the vocabulary serves two purposes: (1) performance — the gradient
loop is O(non_zero_ngrams × embedding_dim), and (2) quality — rare n-grams
seen once or twice add noise without learning useful patterns.`
    },
    {
        id: "nm-emb-010",
        type: "code",
        content: `def build_ngram_vocab(names: list[str], max_vocab: int) -> dict[str, int]:
    """Build vocabulary mapping most frequent n-grams to indices."""
    counts: Counter[str] = Counter()
    for name in names:
        counts.update(extract_ngrams(name))

    # Keep the top max_vocab most frequent n-grams
    most_common = counts.most_common(max_vocab)
    return {ngram: idx for idx, (ngram, _) in enumerate(most_common)}`
    },
    {
        id: "nm-emb-011",
        type: "markdown",
        content: `### Sparse N-Gram Encoding

Convert text to a sparse n-gram count dictionary (index → count). Returns only
non-zero entries. This is critical for performance: names have ~10-15 n-grams out
of a vocab of 500, so sparse representation skips 97% of the computation in
gradient and encoder loops.`
    },
    {
        id: "nm-emb-012",
        type: "code",
        content: `def encode_ngrams_sparse(text: str, vocab: dict[str, int]) -> dict[int, float]:
    """Convert text to sparse n-gram count dict (index → count)."""
    sparse: dict[int, float] = {}
    for ngram in extract_ngrams(text):
        if ngram in vocab:
            idx = vocab[ngram]
            sparse[idx] = sparse.get(idx, 0.0) + 1.0
    return sparse`
    },
    {
        id: "nm-emb-013",
        type: "markdown",
        content: `## Augmentation

Why augmentation: forces the encoder to learn invariances to small changes.
If "anna" and "ana" map to similar embeddings, the model has learned that
character deletion preserves identity — this is the contrastive learning
principle that similar inputs should have similar representations.`
    },
    {
        id: "nm-emb-014",
        type: "code",
        content: `def augment(name: str) -> str:
    """Create positive pair by random character deletion or swap."""
    if len(name) <= 2:
        return name  # too short to augment safely

    if random.random() < 0.5:
        # Delete one random character
        idx = random.randint(0, len(name) - 1)
        return name[:idx] + name[idx + 1:]
    else:
        # Swap two adjacent characters
        idx = random.randint(0, len(name) - 2)
        chars = list(name)
        chars[idx], chars[idx + 1] = chars[idx + 1], chars[idx]
        return "".join(chars)`
    },
    {
        id: "nm-emb-015",
        type: "markdown",
        content: `## Encoder

### L2 Normalization

Why L2 normalization: constrains embeddings to the unit hypersphere. After
normalization, cosine similarity = dot product, which simplifies the math
and makes the embedding space isotropic (all directions have equal variance).
This is standard practice in contrastive learning (SimCLR, CLIP).

### Sparse Projection

\`encode_sparse_raw\`: computes z = W @ x (raw, unnormalized embedding).
Used in training where we need to backpropagate through normalization.

\`encode_sparse\`: computes emb = normalize(W @ x). Sparse version: only sums
over non-zero entries in x, which is 10-15 n-grams instead of the full 500-entry
vocabulary.`
    },
    {
        id: "nm-emb-016",
        type: "code",
        content: `def l2_normalize(vec: list[float]) -> list[float]:
    """Normalize vector to unit length."""
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-10:
        return vec
    return [x / norm for x in vec]


def encode_sparse_raw(
    sparse_ngrams: dict[int, float], W: list[list[float]]
) -> list[float]:
    """Project sparse n-gram features to embedding space WITHOUT normalization."""
    embedding = [0.0] * len(W)
    for i in range(len(W)):
        total = 0.0
        for j, count in sparse_ngrams.items():
            total += W[i][j] * count
        embedding[i] = total
    return embedding


def encode_sparse(
    sparse_ngrams: dict[int, float], W: list[list[float]]
) -> list[float]:
    """Project sparse n-gram features to embedding space and normalize."""
    return l2_normalize(encode_sparse_raw(sparse_ngrams, W))`
    },
    {
        id: "nm-emb-017",
        type: "markdown",
        content: `### Gradient Through Normalization

If z = raw embedding and e = z/||z|| (the normalized embedding), then:

    d(L)/d(z_i) = (g_i - e_i * dot(g, e)) / ||z||

The normalization Jacobian projects out the radial component of the gradient,
leaving only the tangential direction on the unit sphere. Without this projection,
gradients can push all embeddings in the same radial direction, causing
"representation collapse" — the most common failure mode in contrastive learning.`
    },
    {
        id: "nm-emb-018",
        type: "code",
        content: `def grad_through_norm(
    raw_emb: list[float], grad_normalized: list[float]
) -> list[float]:
    """Backpropagate gradient through L2 normalization."""
    norm = math.sqrt(sum(x * x for x in raw_emb))
    if norm < 1e-10:
        return list(grad_normalized)
    e = [x / norm for x in raw_emb]
    g_dot_e = sum(g * ei for g, ei in zip(grad_normalized, e))
    return [(g - ei * g_dot_e) / norm for g, ei in zip(grad_normalized, e)]`
    },
    {
        id: "nm-emb-019",
        type: "markdown",
        content: `## Similarity & InfoNCE Loss

Cosine similarity between two L2-normalized vectors is just the dot product.
Range: [-1, 1] where 1 = identical direction, -1 = opposite, 0 = orthogonal.

### InfoNCE (NT-Xent) Loss

For each (anchor, positive) pair in the batch, the loss encourages high
similarity to the positive and low similarity to all negatives (other
samples in the batch).

Math (for anchor i):

    sim_pos = cos(anchor_i, positive_i) / tau
    sim_neg_j = cos(anchor_i, anchor_j) / tau   for j != i
    loss_i = -log(exp(sim_pos) / (exp(sim_pos) + sum_j exp(sim_neg_j)))

Why temperature: controls sharpness of the similarity distribution. Low tau
(e.g. 0.1) makes the loss focus on hard negatives. tau=0.1 is standard in SimCLR.`
    },
    {
        id: "nm-emb-020",
        type: "code",
        content: `def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two L2-normalized vectors."""
    return sum(a[i] * b[i] for i in range(len(a)))


def infonce_loss_and_grads(
    anchor_embs: list[list[float]],
    positive_embs: list[list[float]],
    temperature: float,
) -> tuple[float, list[list[float]], list[list[float]]]:
    """Compute InfoNCE (NT-Xent) loss and embedding-space gradients.

    Returns: (avg_loss, anchor_grads, positive_grads)
    """
    bs = len(anchor_embs)
    total_loss = 0.0

    anchor_grads = [[0.0] * EMBEDDING_DIM for _ in range(bs)]
    positive_grads = [[0.0] * EMBEDDING_DIM for _ in range(bs)]

    for i in range(bs):
        # Similarity to positive pair
        sim_pos = cosine_similarity(anchor_embs[i], positive_embs[i]) / temperature

        # Similarities to all negatives (other anchors in batch)
        sim_negs = []
        for j in range(bs):
            if j != i:
                sim_negs.append(
                    cosine_similarity(anchor_embs[i], anchor_embs[j]) / temperature
                )

        # Log-sum-exp trick for numerical stability (subtract max before exp)
        max_sim = max([sim_pos] + sim_negs)
        exp_pos = math.exp(sim_pos - max_sim)
        exp_negs = [math.exp(s - max_sim) for s in sim_negs]
        denom = exp_pos + sum(exp_negs)

        # Loss: -log(softmax probability of positive pair)
        total_loss += -math.log(max(exp_pos / denom, 1e-10))

        # Gradient of loss w.r.t. anchor embedding:
        # d(loss)/d(anchor_i) = (1/tau) * (sum_j p_j * anchor_j - positive_i)
        # where p_j = exp(sim_neg_j) / denom is the softmax probability

        # Positive contribution: pushes anchor toward positive
        p_pos = exp_pos / denom
        for d in range(EMBEDDING_DIM):
            anchor_grads[i][d] += (p_pos - 1.0) / temperature * positive_embs[i][d]
            positive_grads[i][d] += (p_pos - 1.0) / temperature * anchor_embs[i][d]

        # Negative contributions: pushes anchor away from negatives
        neg_idx = 0
        for j in range(bs):
            if j == i:
                continue
            p_neg = exp_negs[neg_idx] / denom
            for d in range(EMBEDDING_DIM):
                anchor_grads[i][d] += p_neg / temperature * anchor_embs[j][d]
            neg_idx += 1

    return total_loss / bs, anchor_grads, positive_grads`
    },
    {
        id: "nm-emb-021",
        type: "markdown",
        content: `## Training

Production systems use Adam with learning rate warmup. SGD is sufficient here
because the model is a single linear layer — there's no depth to cause gradient
scale issues across layers.

> The implementation below also collects per-epoch loss for the training
> visualization that follows.`
    },
    {
        id: "nm-emb-022",
        type: "code",
        content: `def train(
    names: list[str],
    vocab: dict[str, int],
    W: list[list[float]],
    num_epochs: int,
    batch_size: int,
    learning_rate: float,
) -> list[dict]:
    """Train embedding model with SGD. Returns per-epoch loss history."""
    vocab_size = len(vocab)
    loss_history: list[dict] = []

    for epoch in range(num_epochs):
        epoch_names = names[:]
        random.shuffle(epoch_names)

        epoch_loss = 0.0
        num_batches = 0

        for batch_start in range(0, len(epoch_names), batch_size):
            batch = epoch_names[batch_start:batch_start + batch_size]
            if len(batch) < 2:
                continue

            # Encode anchors and positives (sparse n-grams → dense embeddings)
            # Store both raw (pre-normalization) and normalized embeddings:
            # raw embeddings are needed for the normalization Jacobian in backprop
            anchor_sparse = []
            positive_sparse = []
            anchor_raw = []
            positive_raw = []
            anchor_embs = []
            positive_embs = []

            for name in batch:
                a_sp = encode_ngrams_sparse(name, vocab)
                anchor_sparse.append(a_sp)
                a_raw = encode_sparse_raw(a_sp, W)
                anchor_raw.append(a_raw)
                anchor_embs.append(l2_normalize(a_raw))

                p_sp = encode_ngrams_sparse(augment(name), vocab)
                positive_sparse.append(p_sp)
                p_raw = encode_sparse_raw(p_sp, W)
                positive_raw.append(p_raw)
                positive_embs.append(l2_normalize(p_raw))

            # Compute loss and gradients w.r.t. NORMALIZED embeddings
            loss, a_grads, p_grads = infonce_loss_and_grads(
                anchor_embs, positive_embs, TEMPERATURE
            )
            epoch_loss += loss
            num_batches += 1

            # Backpropagate gradients to W using SPARSE computation.
            # Chain rule: d(L)/d(W) = d(L)/d(emb_norm) * d(emb_norm)/d(emb_raw) * d(emb_raw)/d(W)
            # The normalization Jacobian (middle term) projects out the radial
            # gradient component, preventing representation collapse.
            grad_W = [[0.0] * vocab_size for _ in range(EMBEDDING_DIM)]

            for b_idx in range(len(batch)):
                # Transform gradients through normalization Jacobian
                a_grad_raw = grad_through_norm(anchor_raw[b_idx], a_grads[b_idx])
                p_grad_raw = grad_through_norm(positive_raw[b_idx], p_grads[b_idx])

                for j, count in anchor_sparse[b_idx].items():
                    for i in range(EMBEDDING_DIM):
                        grad_W[i][j] += a_grad_raw[i] * count

                for j, count in positive_sparse[b_idx].items():
                    for i in range(EMBEDDING_DIM):
                        grad_W[i][j] += p_grad_raw[i] * count

            # SGD update (only for entries with non-zero gradients)
            scale = learning_rate / len(batch)
            for i in range(EMBEDDING_DIM):
                for j in range(vocab_size):
                    if grad_W[i][j] != 0.0:
                        W[i][j] -= scale * grad_W[i][j]

        avg_loss = epoch_loss / max(num_batches, 1)
        loss_history.append({"epoch": epoch + 1, "loss": avg_loss})
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  epoch {epoch + 1:>3}/{num_epochs}  loss={avg_loss:.4f}")

    return loss_history`
    },
    {
        id: "nm-emb-023",
        type: "markdown",
        content: `## Inference`
    },
    {
        id: "nm-emb-024",
        type: "code",
        content: `def find_nearest_neighbors(
    query: str,
    candidates: list[str],
    vocab: dict[str, int],
    W: list[list[float]],
    k: int = 5,
) -> list[tuple[str, float]]:
    """Find k nearest neighbors by cosine similarity in embedding space."""
    q_emb = encode_sparse(encode_ngrams_sparse(query, vocab), W)

    similarities = []
    for candidate in candidates:
        if candidate == query:
            continue
        c_emb = encode_sparse(encode_ngrams_sparse(candidate, vocab), W)
        sim = cosine_similarity(q_emb, c_emb)
        similarities.append((candidate, sim))

    similarities.sort(key=lambda x: x[1], reverse=True)
    return similarities[:k]`
    },
    {
        id: "nm-emb-025",
        type: "markdown",
        content: `## Running the Model

Load the dataset, build the n-gram vocabulary, and initialize the projection matrix.`
    },
    {
        id: "nm-emb-026",
        type: "code",
        content: `# Load data
all_names = load_data(DATA_URL)
print(f"Loaded {len(all_names):,} names")

# Use a training subset for speed; keep all names for nearest-neighbor search
train_names = all_names[:TRAIN_SIZE]
print(f"Training on {len(train_names):,} names\\n")

# Build n-gram vocabulary from training set (capped at MAX_VOCAB)
print("Building n-gram vocabulary...")
vocab = build_ngram_vocab(train_names, MAX_VOCAB)
print(f"Vocabulary: {len(vocab)} n-grams (top {MAX_VOCAB} most frequent)\\n")

# Initialize projection matrix W: [embedding_dim × vocab_size]
W = [
    [random.gauss(0, 0.01) for _ in range(len(vocab))]
    for _ in range(EMBEDDING_DIM)
]
num_params = EMBEDDING_DIM * len(vocab)
print(f"Model: linear projection ({EMBEDDING_DIM} x {len(vocab)} = {num_params:,} params)")`
    },
    {
        id: "nm-emb-027",
        type: "code",
        content: `print(f"Training (epochs={NUM_EPOCHS}, batch={BATCH_SIZE}, temp={TEMPERATURE})...")
loss_history = train(train_names, vocab, W, NUM_EPOCHS, BATCH_SIZE, LEARNING_RATE)
print("\\nTraining complete.")`
    },
    {
        id: "nm-emb-027b",
        type: "markdown",
        content: `### Training Visualization\n\nThe loss curve shows how the contrastive objective (InfoNCE) decreases over training.\nA declining loss means the model is learning to push positive pairs (similar names)\ncloser together and negative pairs further apart in embedding space.`
    },
    {
        id: "nm-emb-027c",
        type: "code",
        content: `from pynote_ui.oplot import line\n\nline(loss_history, x="epoch", y="loss",\n     stroke="#8b5cf6", stroke_width=2,\n     title="InfoNCE Loss During Training",\n     x_label="Epoch", y_label="Loss",\n     grid="both")`
    },
    {
        id: "nm-emb-028",
        type: "markdown",
        content: `## Evaluation

Positive pairs: similar-sounding names (should have high similarity).
Random pairs: dissimilar names (should have low similarity).`
    },
    {
        id: "nm-emb-029",
        type: "code",
        content: `positive_pairs = [
    ("anna", "anne"), ("john", "jon"), ("elizabeth", "elisabeth"),
    ("michael", "michelle"), ("alexander", "alexandra"),
]

random_pairs = [
    ("anna", "zachary"), ("john", "penelope"), ("elizabeth", "bob"),
    ("michael", "quinn"), ("alexander", "ivy"),
]

print("Positive pairs (should be similar):")
pos_sims = []
for name1, name2 in positive_pairs:
    e1 = encode_sparse(encode_ngrams_sparse(name1, vocab), W)
    e2 = encode_sparse(encode_ngrams_sparse(name2, vocab), W)
    sim = cosine_similarity(e1, e2)
    pos_sims.append(sim)
    print(f"  {name1:<12} <-> {name2:<12}  sim={sim:>6.3f}")

print("\\nRandom pairs (should be dissimilar):")
rand_sims = []
for name1, name2 in random_pairs:
    e1 = encode_sparse(encode_ngrams_sparse(name1, vocab), W)
    e2 = encode_sparse(encode_ngrams_sparse(name2, vocab), W)
    sim = cosine_similarity(e1, e2)
    rand_sims.append(sim)
    print(f"  {name1:<12} <-> {name2:<12}  sim={sim:>6.3f}")

avg_pos = sum(pos_sims) / len(pos_sims)
avg_rand = sum(rand_sims) / len(rand_sims)
print(f"\\nAverage positive pair similarity: {avg_pos:.3f}")
print(f"Average random pair similarity:   {avg_rand:.3f}")`
    },
    {
        id: "nm-emb-029b",
        type: "markdown",
        content: `### Similarity Distribution\n\nThe bar chart below compares cosine similarities for positive pairs (similar names)\nvs. random pairs (dissimilar names). A well-trained embedding model should show\nclear separation: positive pairs clustered near 1.0, random pairs near 0.0.`
    },
    {
        id: "nm-emb-029c",
        type: "code",
        content: `from pynote_ui.oplot import bar\n\nsim_data = []\nfor (n1, n2), sim in zip(positive_pairs, pos_sims):\n    sim_data.append({"pair": f"{n1}/{n2}", "similarity": sim, "type": "Positive"})\nfor (n1, n2), sim in zip(random_pairs, rand_sims):\n    sim_data.append({"pair": f"{n1}/{n2}", "similarity": sim, "type": "Random"})\n\nbar(sim_data, x="pair", y="similarity", fill="type",\n    title="Cosine Similarity: Positive vs Random Pairs",\n    x_label="Name pair", y_label="Cosine similarity",\n    color_scheme="Observable10")`
    },
    {
        id: "nm-emb-030",
        type: "markdown",
        content: `### Nearest Neighbor Retrieval

Search over a larger pool for more interesting results.`
    },
    {
        id: "nm-emb-031",
        type: "code",
        content: `search_pool = all_names[:10000]
query_names = ["anna", "john", "elizabeth", "michael"]
print("Nearest neighbor retrieval:")
for query in query_names:
    neighbors = find_nearest_neighbors(query, search_pool, vocab, W, k=5)
    neighbor_str = ", ".join(f"{n} ({s:.2f})" for n, s in neighbors)
    print(f"  {query:<12} -> {neighbor_str}")`
    },
    {
        id: "nm-emb-footer",
        type: "markdown",
        content: `[Autoregressive Transformer (GPT) →](?open=nm_microgpt)`
    },
];
