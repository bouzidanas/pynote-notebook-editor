import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microgpt.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microGPTCells: CellData[] = [
    {
        id: "nm-gpt-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Autoregressive Transformer (GPT)

The autoregressive language model from first principles: GPT learns to predict the next
character in a sequence using nothing but matrix multiplication, attention, and gradient descent.

Breaking this down further:

**Autoregressive** means the model generates one token at a time, left to right.
Each prediction is conditioned on all previous tokens. To generate "hello", it
predicts \`h\`, then \`e\` given \`h\`, then \`l\` given \`he\`, and so on.
This left-to-right constraint is enforced by **causal masking** — each position
can only attend to itself and earlier positions, never future ones.

**Attention** is the mechanism that lets the model decide which previous tokens
matter for predicting the next one. For each position, it computes a **query**
("what am I looking for?"), compares it against **keys** from all visible positions
("what do I contain?"), and uses the resulting scores to weight **values**
("what information do I carry?"). This is the \`Q · Kᵀ / √d\` operation.

**Multi-head attention** runs several independent attention computations in parallel,
each with its own Q/K/V projections. Different heads can learn to attend to
different types of relationships (e.g., one head tracks nearby characters,
another tracks repeated patterns).

This implementation follows the GPT-2 architecture (Radford et al., 2019) with pedagogical
simplifications: RMSNorm instead of LayerNorm, ReLU instead of GELU, no bias terms.

**Reference:** \`01-foundations/microgpt.py\` — no-magic collection

---`
    },
    {
        id: "nm-gpt-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
from pyodide.http import open_url

random.seed(42)`
    },
    {
        id: "nm-gpt-003",
        type: "markdown",
        content: `## Constants and Hyperparameters

~4,200 parameters total. Production GPTs have billions. The architecture is identical
(attention is attention), but this toy scale lets us train on CPU in minutes rather
than weeks on GPU clusters.`
    },
    {
        id: "nm-gpt-004",
        type: "code",
        content: `# Model architecture
N_EMBD = 16         # embedding dimension (d_model in Transformer papers)
N_HEAD = 4           # number of attention heads
N_LAYER = 1          # number of transformer blocks
BLOCK_SIZE = 16      # context window size (maximum sequence length)
HEAD_DIM = N_EMBD // N_HEAD  # dimension per attention head (16/4 = 4)

# Training parameters
LEARNING_RATE = 0.01
BETA1 = 0.85         # Adam first moment decay
BETA2 = 0.99         # Adam second moment decay
EPS_ADAM = 1e-8       # Adam epsilon (prevents division by zero)
NUM_STEPS = 300      # browser-tuned; CLI original: 1000

DATA_URL = "https://raw.githubusercontent.com/karpathy/makemore/master/names.txt"`
    },
    {
        id: "nm-gpt-005",
        type: "markdown",
        content: `## Data Loading`
    },
    {
        id: "nm-gpt-006",
        type: "code",
        content: `def load_data(url: str) -> list[str]:
    """Download and parse the training corpus."""
    print("Downloading data...")
    text = open_url(url).read()
    docs = [line.strip() for line in text.split('\\n') if line.strip()]
    return docs`
    },
    {
        id: "nm-gpt-007",
        type: "markdown",
        content: `## Scalar Autograd Engine

A scalar value with reverse-mode automatic differentiation. Tracks computational
history via \`._children\` and \`._local_grads\`, enabling gradient computation
through the chain rule. Every forward operation stores its local derivative
(∂out/∂input) as a closure, then \`backward()\` replays the computation graph
in reverse topological order, accumulating gradients.`
    },
    {
        id: "nm-gpt-008",
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
        # max(0, x). Modern transformers often use GELU, but ReLU is simpler
        # and produces qualitatively similar results.
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
        id: "nm-gpt-009",
        type: "markdown",
        content: `## Parameter Initialization

Standard deviation of 0.08 is chosen empirically for this tiny model — larger models
typically use std = 1/√(d_in) (Xavier/Glorot initialization) to keep activations from
exploding or vanishing through deep layers. With only 1 layer, the choice is less critical.`
    },
    {
        id: "nm-gpt-010",
        type: "code",
        content: `def make_matrix(nrows: int, ncols: int, std: float = 0.08) -> list[list[Value]]:
    """Initialize a weight matrix with Gaussian noise."""
    return [[Value(random.gauss(0, std)) for _ in range(ncols)] for _ in range(nrows)]


def init_parameters():
    """Initialize all model parameters: embeddings, attention, and MLP weights.

    Returns a dict keyed by human-readable names — the complete 'state_dict'.
    """
    params = {}

    # Token and position embeddings
    # wte: [vocab_size, n_embd] maps token IDs to vectors
    # wpe: [block_size, n_embd] maps positions to vectors
    params['wte'] = make_matrix(VOCAB_SIZE, N_EMBD)
    params['wpe'] = make_matrix(BLOCK_SIZE, N_EMBD)

    for layer_idx in range(N_LAYER):
        # Attention weights (Q, K, V projections and output projection)
        params[f'layer{layer_idx}.attn_wq'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.attn_wk'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.attn_wv'] = make_matrix(N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.attn_wo'] = make_matrix(N_EMBD, N_EMBD)

        # MLP: 2-layer feedforward with 4x expansion factor (GPT convention)
        params[f'layer{layer_idx}.mlp_fc1'] = make_matrix(4 * N_EMBD, N_EMBD)
        params[f'layer{layer_idx}.mlp_fc2'] = make_matrix(N_EMBD, 4 * N_EMBD)

    # Language model head: projects hidden states to vocabulary logits
    params['lm_head'] = make_matrix(VOCAB_SIZE, N_EMBD)

    return params`
    },
    {
        id: "nm-gpt-011",
        type: "markdown",
        content: `## Core Operations

### Linear (Matrix-Vector Multiply)

For weight matrix W with shape [n_out, n_in] and input vector x with shape [n_in],
computes y[i] = Σⱼ W[i,j] · x[j]. This is the fundamental operation of neural networks:
every layer is just \`linear()\` followed by a nonlinearity.`
    },
    {
        id: "nm-gpt-012",
        type: "code",
        content: `def linear(x: list[Value], w: list[list[Value]]) -> list[Value]:
    """Matrix-vector multiplication: y = W @ x (no bias)."""
    return [sum(w_row[j] * x[j] for j in range(len(x))) for w_row in w]`
    },
    {
        id: "nm-gpt-013",
        type: "markdown",
        content: `### Softmax

Converts logits to probabilities. Softmax is translation-invariant: softmax(x) = softmax(x − c)
for any c. We subtract max(x) before exp() to prevent overflow — without this, large logits
(>700) cause exp() to return inf, breaking the computation.

$$\\text{softmax}(x_i) = \\frac{e^{x_i - \\max(x)}}{\\sum_j e^{x_j - \\max(x)}}$$`
    },
    {
        id: "nm-gpt-014",
        type: "code",
        content: `def softmax(logits: list[Value]) -> list[Value]:
    """Numerically stable softmax: logits → probabilities."""
    max_val = max(v.data for v in logits)
    exp_vals = [(v - max_val).exp() for v in logits]
    total = sum(exp_vals)
    return [e / total for e in exp_vals]`
    },
    {
        id: "nm-gpt-015",
        type: "markdown",
        content: `### RMSNorm

Root Mean Square normalization — LayerNorm without mean centering or learned affine
parameters. Fewer ops, fewer parameters, and empirically works just as well. Used in
LLaMA, Gemma, and other recent architectures.

$$\\text{RMSNorm}(x) = \\frac{x}{\\sqrt{\\text{mean}(x^2) + \\epsilon}}$$`
    },
    {
        id: "nm-gpt-016",
        type: "code",
        content: `def rmsnorm(x: list[Value]) -> list[Value]:
    """Scale vector to unit RMS magnitude."""
    mean_sq = sum(xi * xi for xi in x) / len(x)
    scale = (mean_sq + 1e-5) ** -0.5
    return [xi * scale for xi in x]`
    },
    {
        id: "nm-gpt-017",
        type: "markdown",
        content: `### Safe Log

Clipped logarithm for numerical stability in loss computation. Prevents log(0) which
returns -inf and breaks gradient backpropagation. We must keep \`prob\` as a child node
so gradients flow back through the computation graph — creating a disconnected
\`Value(clamped)\` would sever the gradient path.`
    },
    {
        id: "nm-gpt-018",
        type: "code",
        content: `def safe_log(prob: Value) -> Value:
    """Clipped log — prevents log(0) while preserving gradient flow."""
    clamped = max(prob.data, 1e-10)
    return Value(math.log(clamped), (prob,), (1.0 / clamped,))`
    },
    {
        id: "nm-gpt-019",
        type: "markdown",
        content: `## GPT Forward Pass

Single-token forward pass through the GPT model. Processes ONE token at a position
and returns logits over the vocabulary. The keys/values lists accumulate the KV cache —
a running history of all past tokens' key/value projections.

**Input representation:** \`tok_emb\` encodes "what" (the token), \`pos_emb\` encodes
"where" (position in sequence). Their sum is the full input to the transformer.

**Residual connections:** The pattern \`x_new = x + f(x)\` creates a "highway" that
lets gradients flow directly backward without passing through attention or MLP,
preventing vanishing gradients.

**Why KV caching provides causal masking without an explicit mask:** at position t,
\`keys[layer]\` only contains keys for positions 0..t, so the attention loop naturally
excludes future tokens. This incremental construction is equivalent to applying a
lower-triangular mask in a batch setting, but more efficient for autoregressive generation.`
    },
    {
        id: "nm-gpt-020",
        type: "code",
        content: `def gpt_forward(
    token_id: int,
    pos_id: int,
    keys: list[list[list[Value]]],
    values: list[list[list[Value]]],
    params: dict,
) -> list[Value]:
    """Single-token forward pass returning vocabulary logits."""
    # Embedding layer: token + position
    tok_emb = params['wte'][token_id]
    pos_emb = params['wpe'][pos_id]
    x = [t + p for t, p in zip(tok_emb, pos_emb)]
    x = rmsnorm(x)

    for layer_idx in range(N_LAYER):
        x_residual = x
        x = rmsnorm(x)  # pre-norm (modern convention)

        # Multi-head self-attention
        q = linear(x, params[f'layer{layer_idx}.attn_wq'])
        k = linear(x, params[f'layer{layer_idx}.attn_wk'])
        v = linear(x, params[f'layer{layer_idx}.attn_wv'])

        keys[layer_idx].append(k)
        values[layer_idx].append(v)

        x_attn = []
        for head in range(N_HEAD):
            head_start = head * HEAD_DIM
            q_head = q[head_start : head_start + HEAD_DIM]
            k_head = [k_t[head_start : head_start + HEAD_DIM] for k_t in keys[layer_idx]]
            v_head = [v_t[head_start : head_start + HEAD_DIM] for v_t in values[layer_idx]]

            # Scaled dot-product attention: score = (q · k) / √d_head
            attn_logits = [
                sum(q_head[j] * k_head[t][j] for j in range(HEAD_DIM)) / (HEAD_DIM ** 0.5)
                for t in range(len(k_head))
            ]
            attn_weights = softmax(attn_logits)

            # Weighted sum of values
            head_output = [
                sum(attn_weights[t] * v_head[t][j] for t in range(len(v_head)))
                for j in range(HEAD_DIM)
            ]
            x_attn.extend(head_output)

        # Output projection + residual
        x = linear(x_attn, params[f'layer{layer_idx}.attn_wo'])
        x = [a + b for a, b in zip(x, x_residual)]
        x_residual = x

        # MLP: expand → ReLU → contract + residual
        x = rmsnorm(x)
        x = linear(x, params[f'layer{layer_idx}.mlp_fc1'])
        x = [xi.relu() for xi in x]
        x = linear(x, params[f'layer{layer_idx}.mlp_fc2'])
        x = [a + b for a, b in zip(x, x_residual)]

    logits = linear(x, params['lm_head'])
    return logits`
    },
    {
        id: "nm-gpt-021",
        type: "markdown",
        content: `## Training

### Prepare Vocabulary and Data`
    },
    {
        id: "nm-gpt-022",
        type: "code",
        content: `print("Loading data...")
docs = load_data(DATA_URL)
random.shuffle(docs)

# Build vocabulary from unique characters in the corpus
unique_chars = sorted(set(''.join(docs)))
BOS = len(unique_chars)  # beginning-of-sequence token
VOCAB_SIZE = len(unique_chars) + 1

print(f"Loaded {len(docs)} documents")
print(f"Vocabulary size: {VOCAB_SIZE} (characters + BOS token)")

params = init_parameters()

# Flatten all parameters for optimizer bookkeeping
param_list = [p for matrix in params.values() for row in matrix for p in row]
print(f"Parameters: {len(param_list):,}")`
    },
    {
        id: "nm-gpt-023",
        type: "markdown",
        content: `### Training Loop

The training objective is next-token prediction via cross-entropy loss: at each
position, the model outputs a probability distribution over the vocabulary, and
we penalize it with −log(p(target)).

**Adam optimizer** maintains per-parameter running averages of gradient (momentum \`m\`)
and squared gradient (variance \`v\`), adapting the learning rate individually for each
weight. Bias correction compensates for the zero-initialization of \`m\` and \`v\`,
which would otherwise suppress early updates.

**Linear learning rate decay** (\`lr_t = lr₀ · (1 − t/T)\`) prevents overshooting as
the loss landscape sharpens near the optimum.

> The implementation below also collects per-step loss for the training visualization
> that follows.`
    },
    {
        id: "nm-gpt-024",
        type: "code",
        content: `# Adam optimizer state: per-parameter momentum and variance
m = [0.0] * len(param_list)
v = [0.0] * len(param_list)

loss_history = []

print("Training...")
for step in range(NUM_STEPS):
    doc = docs[step % len(docs)]

    # Tokenize: [BOS, char_0, char_1, ..., char_n, BOS]
    tokens = [BOS] + [unique_chars.index(ch) for ch in doc] + [BOS]
    seq_len = min(BLOCK_SIZE, len(tokens) - 1)

    # Fresh KV cache for each document
    keys = [[] for _ in range(N_LAYER)]
    values = [[] for _ in range(N_LAYER)]

    losses = []
    for pos in range(seq_len):
        input_token = tokens[pos]
        target_token = tokens[pos + 1]

        logits = gpt_forward(input_token, pos, keys, values, params)
        probs = softmax(logits)

        # Cross-entropy: -log(p(target))
        loss_t = -safe_log(probs[target_token])
        losses.append(loss_t)

    loss = (1.0 / seq_len) * sum(losses)
    loss.backward()

    # Adam update with linear LR decay
    lr_t = LEARNING_RATE * (1 - step / NUM_STEPS)

    for i, param in enumerate(param_list):
        m[i] = BETA1 * m[i] + (1 - BETA1) * param.grad
        v[i] = BETA2 * v[i] + (1 - BETA2) * param.grad ** 2

        # Bias correction
        m_hat = m[i] / (1 - BETA1 ** (step + 1))
        v_hat = v[i] / (1 - BETA2 ** (step + 1))

        param.data -= lr_t * m_hat / (v_hat ** 0.5 + EPS_ADAM)
        param.grad = 0.0

    loss_history.append({"step": step + 1, "loss": loss.data})

    if (step + 1) % 100 == 0 or step == 0:
        print(f"  step {step + 1:>4}/{NUM_STEPS:>4} | loss: {loss.data:.4f}")

print(f"\\nTraining complete. Final loss: {loss.data:.4f}")`
    },
    {
        id: "nm-gpt-024b",
        type: "markdown",
        content: `### Training Visualization\n\nThe loss curve shows how the model improves at next-token prediction over training.\nA declining cross-entropy loss means the model assigns increasingly higher probability\nto the correct next character — it's learning the statistical patterns of names.`
    },
    {
        id: "nm-gpt-024c",
        type: "code",
        content: `from pynote_ui.oplot import line\n\nline(loss_history, x="step", y="loss",\n     stroke="#f59e0b", stroke_width=2,\n     title="GPT Training Loss (Cross-Entropy)",\n     x_label="Training step", y_label="Loss",\n     grid="both")`
    },
    {
        id: "nm-gpt-025",
        type: "markdown",
        content: `## Inference

Generate new names from the trained model using temperature-scaled sampling.
Temperature controls randomness: divide logits by T before softmax, which
sharpens (T < 1) or flattens (T > 1) the probability distribution. Lower
temperature makes the model more confident (picks high-probability tokens),
higher temperature makes it more exploratory.`
    },
    {
        id: "nm-gpt-026",
        type: "code",
        content: `TEMPERATURE = 0.5
NUM_SAMPLES = 20

print(f"Generating {NUM_SAMPLES} samples (temperature={TEMPERATURE}):\\n")

for sample_idx in range(NUM_SAMPLES):
    keys = [[] for _ in range(N_LAYER)]
    values = [[] for _ in range(N_LAYER)]

    token_id = BOS
    generated = []

    for pos in range(BLOCK_SIZE):
        logits = gpt_forward(token_id, pos, keys, values, params)
        scaled_logits = [logit / TEMPERATURE for logit in logits]
        probs = softmax(scaled_logits)

        token_id = random.choices(
            range(VOCAB_SIZE),
            weights=[p.data for p in probs]
        )[0]

        if token_id == BOS:
            break
        generated.append(unique_chars[token_id])

    print(f"  {sample_idx + 1:>2}. {''.join(generated)}")`
    },
    {
        id: "nm-gpt-footer",
        type: "markdown",
        content: `[Vanilla RNN vs. GRU →](?open=nm_micrornn)`
    },
];
