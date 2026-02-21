import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microbert.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microBERTCells: CellData[] = [
    {
        id: "nm-bert-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Bidirectional Transformer (BERT)

The other half of the transformer — how BERT learns representations by
predicting **masked** tokens, and why this simple change transforms a text
generator into a text *understander*.

**Bidirectional attention** is the key idea. In GPT, each token can only
attend to tokens that came before it (causal masking). In BERT, every token
attends to every other token — left context *and* right context. This means
when BERT processes the word "bank" it can use both "river" (left) and
"fishing" (right) to decide which meaning is intended.

**Masked Language Modeling (MLM)** is how BERT is trained. A fraction of input
tokens are randomly replaced with a special **[MASK]** token, and the model
must predict the original token from the surrounding context. Because the
masked token could be anywhere, the model is forced to build useful
representations for *every* position — not just the last one.

The trade-off: BERT can’t generate text left-to-right the way GPT can. It
needs a fixed input with specific [MASK] positions — it’s a "fill-in-the-blank"
model, not a "continue-the-sentence" model.

**Reference:** \`01-foundations/microbert.py\` — no-magic collection

---`
    },
    {
        id: "nm-bert-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
from pyodide.http import open_url

random.seed(42)`
    },
    {
        id: "nm-bert-003",
        type: "markdown",
        content: `## Constants

Architecture is deliberately identical to microgpt for controlled comparison. The ONLY
architectural difference is causal vs. bidirectional attention. Same ~4,200 parameters.

BERT needs more steps than microgpt because only ~25% of tokens contribute to
the loss per step. With names averaging ~6 chars, that's 1–2 masked tokens per example —
fewer gradient signals per step. (Step counts are browser-tuned for Pyodide/WASM.)

BERT's original uses 15% masking with an 80/10/10 split (80% [MASK], 10% random, 10% unchanged).
We use 25% pure [MASK] — higher than standard to give the tiny model more gradient signals.`
    },
    {
        id: "nm-bert-004",
        type: "code",
        content: `# Model architecture (identical to microgpt)
N_EMBD = 16
N_HEAD = 4
N_LAYER = 1
BLOCK_SIZE = 16
HEAD_DIM = N_EMBD // N_HEAD

# Training
LEARNING_RATE = 0.02
BETA1 = 0.85
BETA2 = 0.99
EPS_ADAM = 1e-8
NUM_STEPS = 500     # browser-tuned; CLI original: 3000

# MLM parameters
MASK_PROB = 0.25

DATA_URL = "https://raw.githubusercontent.com/karpathy/makemore/master/names.txt"`
    },
    {
        id: "nm-bert-005",
        type: "markdown",
        content: `## Data Loading`
    },
    {
        id: "nm-bert-006",
        type: "code",
        content: `def load_data(url: str) -> list[str]:
    """Download and parse the training corpus."""
    print("Downloading data...")
    text = open_url(url).read()
    return [line.strip() for line in text.split('\\n') if line.strip()]`
    },
    {
        id: "nm-bert-007",
        type: "markdown",
        content: `## Scalar Autograd Engine

Same autograd engine as microgpt — no per-script extensions needed. BERT uses the
same operations as GPT (attention, softmax, cross-entropy). The difference is
architectural (bidirectional attention), not operational.`
    },
    {
        id: "nm-bert-008",
        type: "code",
        content: `class Value:
    """Scalar with reverse-mode automatic differentiation."""
    __slots__ = ('data', 'grad', '_children', '_local_grads')

    def __init__(self, data, children=(), local_grads=()):
        self.data = data
        self.grad = 0.0
        self._children = children
        self._local_grads = local_grads

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data + other.data, (self, other), (1, 1))

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data * other.data, (self, other), (other.data, self.data))

    def __pow__(self, exponent):
        return Value(self.data ** exponent, (self,), (exponent * self.data ** (exponent - 1),))

    def __neg__(self):
        return self * -1

    def __radd__(self, other):
        return self + other

    def __sub__(self, other):
        return self + (-other)

    def __rsub__(self, other):
        return other + (-self)

    def __rmul__(self, other):
        return self * other

    def __truediv__(self, other):
        return self * (other ** -1)

    def __rtruediv__(self, other):
        return other * (self ** -1)

    def tanh(self):
        t = math.tanh(self.data)
        return Value(t, (self,), (1 - t ** 2,))

    def exp(self):
        e = math.exp(self.data)
        return Value(e, (self,), (e,))

    def log(self):
        return Value(math.log(self.data), (self,), (1 / self.data,))

    def relu(self):
        return Value(max(0, self.data), (self,), (float(self.data > 0),))

    def backward(self):
        """Reverse-mode AD via topological sort + chain rule."""
        topo = []
        visited = set()

        def build_topo(v):
            if v not in visited:
                visited.add(v)
                for child in v._children:
                    build_topo(child)
                topo.append(v)

        build_topo(self)
        self.grad = 1.0

        for v in reversed(topo):
            for child, local_grad in zip(v._children, v._local_grads):
                child.grad += local_grad * v.grad`
    },
    {
        id: "nm-bert-009",
        type: "markdown",
        content: `## Parameter Initialization

Identical to microgpt's parameter structure EXCEPT the MLM head replaces the
language model head. Same matrix shape — the difference is conceptual: microgpt
predicts the NEXT token, BERT predicts the MASKED token.`
    },
    {
        id: "nm-bert-010",
        type: "code",
        content: `def make_matrix(nrows: int, ncols: int, std: float = 0.08) -> list[list[Value]]:
    """Initialize a weight matrix with Gaussian noise."""
    return [[Value(random.gauss(0, std)) for _ in range(ncols)] for _ in range(nrows)]


def init_parameters(vocab_size: int) -> dict:
    """Initialize embeddings, attention, MLP, and MLM head."""
    params = {}
    params['wte'] = make_matrix(vocab_size, N_EMBD)
    params['wpe'] = make_matrix(BLOCK_SIZE, N_EMBD)

    for layer_idx in range(N_LAYER):
        params[f'layer{layer_idx}.attn_wq'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.attn_wk'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.attn_wv'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.attn_wo'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.mlp_fc1'] = make_matrix(4 * N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.mlp_fc2'] = make_matrix(N_EMBD, 4 * N_EMBD)

    params['mlm_head'] = make_matrix(vocab_size, N_EMBD)
    return params`
    },
    {
        id: "nm-bert-011",
        type: "markdown",
        content: `## Core Operations`
    },
    {
        id: "nm-bert-012",
        type: "code",
        content: `def linear(x: list[Value], w: list[list[Value]]) -> list[Value]:
    """Matrix-vector multiplication: y = W @ x."""
    return [sum(w_row[j] * x[j] for j in range(len(x))) for w_row in w]


def softmax(logits: list[Value]) -> list[Value]:
    """Numerically stable softmax."""
    max_val = max(v.data for v in logits)
    exp_vals = [(v - max_val).exp() for v in logits]
    total = sum(exp_vals)
    return [e / total for e in exp_vals]


def rmsnorm(x: list[Value]) -> list[Value]:
    """Root Mean Square normalization."""
    mean_sq = sum(xi * xi for xi in x) / len(x)
    scale = (mean_sq + 1e-5) ** -0.5
    return [xi * scale for xi in x]


def safe_log(prob: Value) -> Value:
    """Clipped log preserving gradient flow."""
    clamped = max(prob.data, 1e-10)
    return Value(math.log(clamped), (prob,), (1.0 / clamped,))`
    },
    {
        id: "nm-bert-013",
        type: "markdown",
        content: `## BERT Forward Pass

**THE CRITICAL DIFFERENCE FROM MICROGPT:**

microgpt processes tokens one-at-a-time with an incremental KV cache, building causal
attention implicitly (each token only sees past tokens because future keys don't exist yet).
BERT processes ALL tokens simultaneously and computes attention over the FULL sequence —
every token attends to every other token, including those that come after it.

This bidirectional attention is why BERT excels at understanding tasks (classification,
NER, question answering) — it can use full context to understand each token. But it can't
generate text autoregressively because seeing the full sequence during training means it
has no concept of "left-to-right" generation.`
    },
    {
        id: "nm-bert-014",
        type: "code",
        content: `def bert_forward(token_ids: list[int], params: dict) -> list[list[Value]]:
    """Full-sequence bidirectional forward pass. Returns hidden states for ALL positions."""
    seq_len = len(token_ids)

    # Embedding: token + position
    x_seq = []
    for pos, token_id in enumerate(token_ids):
        tok_emb = params['wte'][token_id]
        pos_emb = params['wpe'][pos]
        x_seq.append([t + p for t, p in zip(tok_emb, pos_emb)])

    x_seq = [rmsnorm(x) for x in x_seq]

    for layer_idx in range(N_LAYER):
        residuals = [list(x) for x in x_seq]
        x_normed = [rmsnorm(x) for x in x_seq]

        # Project ALL positions to Q, K, V simultaneously
        all_q = [linear(x, params[f'layer{layer_idx}.attn_wq']) for x in x_normed]
        all_k = [linear(x, params[f'layer{layer_idx}.attn_wk']) for x in x_normed]
        all_v = [linear(x, params[f'layer{layer_idx}.attn_wv']) for x in x_normed]

        # Bidirectional multi-head self-attention
        attn_output = []
        for pos_i in range(seq_len):
            head_outputs = []
            for head in range(N_HEAD):
                head_start = head * HEAD_DIM
                q_head = all_q[pos_i][head_start : head_start + HEAD_DIM]

                # ALL positions' keys and values — the bidirectional part
                k_heads = [all_k[pos_j][head_start : head_start + HEAD_DIM]
                           for pos_j in range(seq_len)]
                v_heads = [all_v[pos_j][head_start : head_start + HEAD_DIM]
                           for pos_j in range(seq_len)]

                # No masking of future positions
                attn_logits = [
                    sum(q_head[d] * k_heads[j][d] for d in range(HEAD_DIM))
                    / (HEAD_DIM ** 0.5)
                    for j in range(seq_len)
                ]
                attn_weights = softmax(attn_logits)

                head_out = [
                    sum(attn_weights[j] * v_heads[j][d] for j in range(seq_len))
                    for d in range(HEAD_DIM)
                ]
                head_outputs.extend(head_out)

            attn_output.append(head_outputs)

        # Attention output projection + residual
        x_seq = [
            [a + r for a, r in zip(
                linear(attn_out, params[f'layer{layer_idx}.attn_wo']), residual)]
            for attn_out, residual in zip(attn_output, residuals)
        ]

        # MLP + residual
        residuals = [list(x) for x in x_seq]
        x_seq_normed = [rmsnorm(x) for x in x_seq]
        x_seq = [
            [mlp_out + r for mlp_out, r in zip(
                linear([xi.relu() for xi in linear(x, params[f'layer{layer_idx}.mlp_fc1'])],
                       params[f'layer{layer_idx}.mlp_fc2']),
                residual)]
            for x, residual in zip(x_seq_normed, residuals)
        ]

    return x_seq`
    },
    {
        id: "nm-bert-015",
        type: "markdown",
        content: `## Masking Strategy

BERT's training signal comes ONLY from predicting original tokens at masked positions.
Unmasked positions contribute no loss — the model must learn good representations for
ALL tokens to predict the few that are masked.

By forcing the model to predict missing tokens using bidirectional context, BERT learns
contextual representations that capture meaning from both directions.`
    },
    {
        id: "nm-bert-016",
        type: "code",
        content: `def apply_masking(token_ids, mask_token_id, mask_prob):
    """Replace a fraction of tokens with [MASK], return masked positions."""
    masked_ids = list(token_ids)
    masked_positions = []

    # Only mask content tokens (not BOS delimiters)
    for i in range(1, len(token_ids) - 1):
        if random.random() < mask_prob:
            masked_ids[i] = mask_token_id
            masked_positions.append(i)

    # Ensure at least one position is masked
    if not masked_positions and len(token_ids) > 2:
        pos = random.randint(1, len(token_ids) - 2)
        masked_ids[pos] = mask_token_id
        masked_positions.append(pos)

    return masked_ids, masked_positions`
    },
    {
        id: "nm-bert-017",
        type: "markdown",
        content: `## Training

### Prepare Vocabulary and Data`
    },
    {
        id: "nm-bert-018",
        type: "code",
        content: `print("Loading data...")
docs = load_data(DATA_URL)
random.shuffle(docs)

unique_chars = sorted(set(''.join(docs)))
BOS = len(unique_chars)
MASK_TOKEN = len(unique_chars) + 1
VOCAB_SIZE = len(unique_chars) + 2  # chars + BOS + MASK

print(f"Loaded {len(docs)} documents")
print(f"Vocabulary: {VOCAB_SIZE} tokens ({len(unique_chars)} chars + [BOS] + [MASK])")

params = init_parameters(VOCAB_SIZE)
param_list = [p for matrix in params.values() for row in matrix for p in row]
print(f"Parameters: {len(param_list):,}")`
    },
    {
        id: "nm-bert-019",
        type: "markdown",
        content: `### Training Loop (Masked Language Modeling)

The MLM loss is computed ONLY at masked positions: −log P(original_token | masked_context).
Unmasked positions don't contribute to the loss but DO provide context for masked predictions.`
    },
    {
        id: "nm-bert-020",
        type: "code",
        content: `m_adam = [0.0] * len(param_list)
v_adam = [0.0] * len(param_list)

print("\\nTraining BERT (masked language modeling)...")
print("=" * 60)
loss_history = []
for step in range(NUM_STEPS):
    doc = docs[step % len(docs)]
    original_tokens = [BOS] + [unique_chars.index(ch) for ch in doc] + [BOS]
    if len(original_tokens) > BLOCK_SIZE:
        original_tokens = original_tokens[:BLOCK_SIZE]
    seq_len = len(original_tokens)

    masked_tokens, masked_positions = apply_masking(original_tokens, MASK_TOKEN, MASK_PROB)

    # Full bidirectional forward pass
    hidden_states = bert_forward(masked_tokens, params)

    # Loss only at masked positions
    losses = []
    for pos in masked_positions:
        logits = linear(hidden_states[pos], params['mlm_head'])
        probs = softmax(logits)
        loss_t = -safe_log(probs[original_tokens[pos]])
        losses.append(loss_t)

    if not losses:
        continue

    loss = (1.0 / len(losses)) * sum(losses)
    loss.backward()

    lr_t = LEARNING_RATE * (1 - step / NUM_STEPS)

    for i, param in enumerate(param_list):
        m_adam[i] = BETA1 * m_adam[i] + (1 - BETA1) * param.grad
        v_adam[i] = BETA2 * v_adam[i] + (1 - BETA2) * param.grad ** 2
        m_hat = m_adam[i] / (1 - BETA1 ** (step + 1))
        v_hat = v_adam[i] / (1 - BETA2 ** (step + 1))
        param.data -= lr_t * m_hat / (v_hat ** 0.5 + EPS_ADAM)
        param.grad = 0.0

    if (step + 1) % 100 == 0 or step == 0:
        print(f"  step {step + 1:>4}/{NUM_STEPS:>4} | loss: {loss.data:.4f}"
              f" | masked {len(masked_positions)}/{seq_len} tokens")

    if step % 10 == 0:
        loss_history.append({"step": step + 1, "loss": round(loss.data, 4)})

print(f"\\nTraining complete. Final loss: {loss.data:.4f}")`
    },
    {
        id: "nm-bert-020b",
        type: "markdown",
        content: `## MLM Training Loss

Because only ~25% of tokens are masked per step, each step provides fewer gradient
signals than GPT’s next-token objective. The loss curve tends to be noisier as a result.`
    },
    {
        id: "nm-bert-020c",
        type: "code",
        content: `import pynote_ui

pynote_ui.oplot.line(
    loss_history,
    x="step",
    y="loss",
    stroke="#ec4899",
    height=340,
    title="BERT MLM Training Loss"
)`
    },
    {
        id: "nm-bert-021",
        type: "markdown",
        content: `## Inference: Fill-in-the-Blank

BERT's natural inference mode: given a sequence with [MASK] tokens, predict what goes
in the blanks using full bidirectional context.

This is fundamentally different from microgpt's inference:
- microgpt generates LEFT-TO-RIGHT, one token at a time
- BERT fills in MASKED POSITIONS, using context from both sides

You can't do open-ended generation with BERT because it needs a fixed-length input
with specific [MASK] positions. It's a "fill-in-the-blank" model, not a
"continue-the-sentence" model.`
    },
    {
        id: "nm-bert-022",
        type: "code",
        content: `print("\\n" + "=" * 60)
print("INFERENCE: Fill-in-the-blank predictions")
print("=" * 60)

print("\\n--- Masked prediction on training data ---")

eval_correct = 0
eval_total = 0
eval_top3_correct = 0
num_eval = 50

for eval_idx in range(num_eval):
    name = docs[eval_idx]
    tokens = [BOS] + [unique_chars.index(ch) for ch in name] + [BOS]
    if len(tokens) > BLOCK_SIZE:
        tokens = tokens[:BLOCK_SIZE]
    if len(name) < 3:
        continue

    # Mask a middle character — requires bidirectional context
    mask_char_pos = len(name) // 2
    mask_seq_pos = mask_char_pos + 1
    original_token = tokens[mask_seq_pos]

    masked_tokens = list(tokens)
    masked_tokens[mask_seq_pos] = MASK_TOKEN

    hidden_states = bert_forward(masked_tokens, params)
    logits = linear(hidden_states[mask_seq_pos], params['mlm_head'])
    probs = softmax(logits)

    prob_data = [(i, p.data) for i, p in enumerate(probs) if i < len(unique_chars)]
    prob_data.sort(key=lambda x: x[1], reverse=True)

    if prob_data[0][0] == original_token:
        eval_correct += 1
    if original_token in [p[0] for p in prob_data[:3]]:
        eval_top3_correct += 1
    eval_total += 1

print(f"  Top-1 accuracy: {eval_correct}/{eval_total}"
      f" ({eval_correct / max(eval_total, 1):.1%})")
print(f"  Top-3 accuracy: {eval_top3_correct}/{eval_total}"
      f" ({eval_top3_correct / max(eval_total, 1):.1%})")`
    },
    {
        id: "nm-bert-023",
        type: "markdown",
        content: `### Bidirectional Context Demonstration

Changing surrounding characters changes the prediction — proof the model uses
context from BOTH sides, not just left context.`
    },
    {
        id: "nm-bert-024",
        type: "code",
        content: `print("\\n--- Bidirectional context demonstration ---")
print("  Same [MASK] position, different surrounding context:\\n")

context_pairs = [
    ("ma_y", "mary"),
    ("ma_k", "mark"),
    ("sa_a", "sara"),
    ("sa_m", "samm"),
    ("an_a", "anna"),
    ("an_e", "anee"),
]

for display, name in context_pairs:
    tokens = [BOS] + [unique_chars.index(ch) for ch in name] + [BOS]
    if len(tokens) > BLOCK_SIZE:
        tokens = tokens[:BLOCK_SIZE]

    mask_char_pos = display.index('_')
    mask_seq_pos = mask_char_pos + 1

    masked_tokens = list(tokens)
    masked_tokens[mask_seq_pos] = MASK_TOKEN

    hidden_states = bert_forward(masked_tokens, params)
    logits = linear(hidden_states[mask_seq_pos], params['mlm_head'])
    probs = softmax(logits)

    prob_data = [(i, p.data) for i, p in enumerate(probs) if i < len(unique_chars)]
    prob_data.sort(key=lambda x: x[1], reverse=True)
    top3 = prob_data[:3]

    top3_str = ", ".join(f"'{unique_chars[idx]}' ({prob:.3f})" for idx, prob in top3)
    print(f"  {display:>8} → top-3: {top3_str}")`
    },
    {
        id: "nm-bert-025",
        type: "markdown",
        content: `## BERT vs GPT Comparison

| Property | BERT (this notebook) | GPT (microgpt) |
|---|---|---|
| Attention direction | Bidirectional (full) | Unidirectional (causal) |
| Training objective | Masked LM (fill-blank) | Next-token prediction |
| Masking | 25% random [MASK] | Causal mask (future hidden) |
| Inference mode | Fill-in-the-blank | Left-to-right generation |
| Good at | Understanding, NLU | Generation, completion |
| Token processing | All tokens at once | One token at a time |
| KV cache needed? | No (full sequence) | Yes (incremental) |

**Key insight:** The ONLY difference is causal masking. Same attention mechanism,
same projections, same MLP — but removing the causal constraint transforms a
text generator into a text understander. This is why modern systems often use BOTH:
an encoder (BERT-like) for understanding and a decoder (GPT-like) for generation
(e.g., T5, the original Transformer).`
    },
    {
        id: "nm-bert-footer",
        type: "markdown",
        content: `---

[\u2190 Convolutional Neural Network](?open=nm_microconv) \u00b7 [Retrieval-Augmented Generation \u2192](?open=nm_microrag)`
    },
];
