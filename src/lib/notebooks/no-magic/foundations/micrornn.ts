import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/micrornn.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microRNNCells: CellData[] = [
    {
        id: "nm-rnn-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Vanilla RNN vs. GRU

Before attention conquered everything — sequences were modeled with **recurrence**:
processing tokens one at a time, threading a **hidden state** from step to step as
the network's running memory of everything it has seen so far.

The concept is elegant — at each timestep the network takes two inputs (the current
token and the previous hidden state) and produces two outputs (a prediction and a new
hidden state). In theory, the hidden state can carry information arbitrarily far into
the future.

In practice, training breaks down because of the **vanishing gradient problem**.
During backpropagation, the gradient must flow backward through every timestep.
At each step it gets multiplied by the same weight matrix W_hh — when the spectral
radius of W_hh is less than 1, gradients shrink exponentially. After 10–20 steps
they are effectively zero, so the network can never learn long-range dependencies.

**Gating** is the fix. Instead of always overwriting the hidden state, a gated
architecture like GRU (or LSTM) learns *when* to update it. The **update gate** z_t
outputs a value in [0, 1]: when z_t ≈ 0 the hidden state is simply copied forward
unchanged, creating a "gradient highway" where ∂h_t/∂h_{t−1} = 1. This prevents
the exponential shrinkage that kills vanilla RNNs.

This notebook trains both a vanilla RNN and a GRU side-by-side on the same
character-level name-generation task so you can see the difference directly.

**Reference:** \`01-foundations/micrornn.py\` — no-magic collection

---`
    },
    {
        id: "nm-rnn-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
from pyodide.http import open_url

random.seed(42)`
    },
    {
        id: "nm-rnn-003",
        type: "markdown",
        content: `## Constants

~800 parameters per model (vanilla RNN and GRU have similar sizes). Production RNNs
had millions. The architecture is correct; this is a toy scale for pedagogical clarity.

SGD learning rate is 10× higher than microgpt's Adam because plain SGD needs much
larger steps to compensate for lack of adaptive rates.`
    },
    {
        id: "nm-rnn-004",
        type: "code",
        content: `N_HIDDEN = 32       # hidden state dimension
SEQ_LEN = 16        # maximum sequence length
LEARNING_RATE = 0.1 # SGD learning rate
NUM_STEPS = 500     # training steps per model (browser-tuned; CLI original: 3000)
TRAIN_SIZE = 200    # small training subset so each name is seen ~15x

DATA_URL = "https://raw.githubusercontent.com/karpathy/makemore/master/names.txt"`
    },
    {
        id: "nm-rnn-005",
        type: "markdown",
        content: `## Data Loading`
    },
    {
        id: "nm-rnn-006",
        type: "code",
        content: `def load_data(url: str) -> list[str]:
    """Download and parse the training corpus."""
    print("Downloading data...")
    text = open_url(url).read()
    return [line.strip() for line in text.split('\\n') if line.strip()]`
    },
    {
        id: "nm-rnn-007",
        type: "markdown",
        content: `## Scalar Autograd Engine

Same autograd engine as microgpt, with the addition of \`sigmoid()\` for GRU gating.
Sigmoid values in [0,1] act as "forget" and "update" weights — when sigmoid(x) ≈ 0
the gate blocks information; when ≈ 1 it passes information through.`
    },
    {
        id: "nm-rnn-008",
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

    def sigmoid(self):
        # Gating activation for GRU: values in [0,1]
        s = 1.0 / (1.0 + math.exp(-self.data))
        return Value(s, (self,), (s * (1 - s),))

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
        id: "nm-rnn-009",
        type: "markdown",
        content: `## Parameter Initialization

### Vanilla RNN Parameters

Vanilla RNN update rule:
- h_t = tanh(W_xh @ x_t + W_hh @ h_{t−1} + b_h)
- y_t = W_hy @ h_t + b_y`
    },
    {
        id: "nm-rnn-010",
        type: "code",
        content: `def make_matrix(nrows: int, ncols: int, std: float = 0.08) -> list[list[Value]]:
    """Initialize a weight matrix with Gaussian noise."""
    return [[Value(random.gauss(0, std)) for _ in range(ncols)] for _ in range(nrows)]


def init_vanilla_rnn_params():
    """Initialize vanilla RNN parameters."""
    params = {}
    params['W_xh'] = make_matrix(N_HIDDEN, VOCAB_SIZE)  # input-to-hidden
    params['W_hh'] = make_matrix(N_HIDDEN, N_HIDDEN)    # hidden-to-hidden (recurrent)
    params['b_h'] = [Value(0.0) for _ in range(N_HIDDEN)]

    params['W_hy'] = make_matrix(VOCAB_SIZE, N_HIDDEN)  # hidden-to-output
    params['b_y'] = [Value(0.0) for _ in range(VOCAB_SIZE)]
    return params`
    },
    {
        id: "nm-rnn-011",
        type: "markdown",
        content: `### GRU Parameters

GRU update rules:
- z_t = σ(W_xz @ x_t + W_hz @ h_{t−1}) — **update gate**
- r_t = σ(W_xr @ x_t + W_hr @ h_{t−1}) — **reset gate**
- h̃ = tanh(W_xh @ x_t + W_hh @ (r_t ⊙ h_{t−1})) — **candidate**
- h_t = (1 − z_t) ⊙ h_{t−1} + z_t ⊙ h̃ — **interpolate**

The GRU uses 3 weight matrix pairs (z, r, h), roughly doubling parameter count
vs vanilla RNN, but the gating mechanism is what makes the difference, not the count.`
    },
    {
        id: "nm-rnn-012",
        type: "code",
        content: `def init_gru_params():
    """Initialize GRU parameters."""
    params = {}
    # Update gate
    params['W_xz'] = make_matrix(N_HIDDEN, VOCAB_SIZE)
    params['W_hz'] = make_matrix(N_HIDDEN, N_HIDDEN)

    # Reset gate
    params['W_xr'] = make_matrix(N_HIDDEN, VOCAB_SIZE)
    params['W_hr'] = make_matrix(N_HIDDEN, N_HIDDEN)

    # Candidate hidden state
    params['W_xh'] = make_matrix(N_HIDDEN, VOCAB_SIZE)
    params['W_hh'] = make_matrix(N_HIDDEN, N_HIDDEN)

    # Output projection
    params['W_hy'] = make_matrix(VOCAB_SIZE, N_HIDDEN)
    params['b_y'] = [Value(0.0) for _ in range(VOCAB_SIZE)]
    return params`
    },
    {
        id: "nm-rnn-013",
        type: "markdown",
        content: `## Core Operations`
    },
    {
        id: "nm-rnn-014",
        type: "code",
        content: `def linear(x: list[Value], w: list[list[Value]], b: list[Value] = None) -> list[Value]:
    """Matrix-vector multiplication: y = W @ x + b (bias optional)."""
    y = [sum(w_row[j] * x[j] for j in range(len(x))) for w_row in w]
    if b is not None:
        y = [y_i + b_i for y_i, b_i in zip(y, b)]
    return y


def softmax(logits: list[Value]) -> list[Value]:
    """Numerically stable softmax: logits → probabilities."""
    max_val = max(v.data for v in logits)
    exp_vals = [(v - max_val).exp() for v in logits]
    total = sum(exp_vals)
    return [e / total for e in exp_vals]


def safe_log(prob: Value) -> Value:
    """Clipped log preserving gradient flow."""
    clamped = max(prob.data, 1e-10)
    return Value(math.log(clamped), (prob,), (1.0 / clamped,))`
    },
    {
        id: "nm-rnn-015",
        type: "markdown",
        content: `## Vanilla RNN Forward Pass

The recurrent connection (W_hh @ h_{t−1}) is what makes this "recurrent" — the hidden
state carries information from previous timesteps. However, backpropagating through this
recurrence causes gradients to be repeatedly multiplied by W_hh, which leads to
exponential decay (vanishing gradients) or explosion depending on the spectral radius of W_hh.`
    },
    {
        id: "nm-rnn-016",
        type: "code",
        content: `def vanilla_rnn_forward(
    x: list[Value], h_prev: list[Value], params: dict
) -> tuple[list[Value], list[Value]]:
    """Single-step vanilla RNN: h_t = tanh(W_xh@x + W_hh@h + b), y = W_hy@h + b."""
    h_input = linear(x, params['W_xh'])
    h_recurrent = linear(h_prev, params['W_hh'])
    h_combined = [h_i + h_r + params['b_h'][i]
                  for i, (h_i, h_r) in enumerate(zip(h_input, h_recurrent))]
    h = [h_i.tanh() for h_i in h_combined]
    logits = linear(h, params['W_hy'], params['b_y'])
    return logits, h`
    },
    {
        id: "nm-rnn-017",
        type: "markdown",
        content: `## GRU Forward Pass

The update gate z_t acts as a **gradient highway**: when z_t ≈ 0, h_t = h_{t−1}
(we keep the old hidden state), so ∂h_t/∂h_{t−1} = 1. This identity gradient
flow prevents vanishing gradients — the derivative doesn't get multiplied by
weight matrices, it just passes through. This is the core insight of gating.

The reset gate r_t controls how much past information is used when computing
the candidate hidden state. When r_t ≈ 0, the network ignores h_{t−1} and
starts fresh from the input x_t.`
    },
    {
        id: "nm-rnn-018",
        type: "code",
        content: `def gru_forward(
    x: list[Value], h_prev: list[Value], params: dict
) -> tuple[list[Value], list[Value]]:
    """Single-step GRU with update and reset gates."""
    # Update gate
    z_input = linear(x, params['W_xz'])
    z_recurrent = linear(h_prev, params['W_hz'])
    z = [(z_i + z_r).sigmoid() for z_i, z_r in zip(z_input, z_recurrent)]

    # Reset gate
    r_input = linear(x, params['W_xr'])
    r_recurrent = linear(h_prev, params['W_hr'])
    r = [(r_i + r_r).sigmoid() for r_i, r_r in zip(r_input, r_recurrent)]

    # Candidate hidden state with reset-gated previous state
    h_input = linear(x, params['W_xh'])
    h_reset = [r_i * h_i for r_i, h_i in zip(r, h_prev)]
    h_recurrent = linear(h_reset, params['W_hh'])
    h_candidate = [(h_i + h_r).tanh() for h_i, h_r in zip(h_input, h_recurrent)]

    # Interpolate: z=0 keeps old, z=1 fully updates
    h = [(1 - z_i) * h_prev_i + z_i * h_cand_i
         for z_i, h_prev_i, h_cand_i in zip(z, h_prev, h_candidate)]

    logits = linear(h, params['W_hy'], params['b_y'])
    return logits, h`
    },
    {
        id: "nm-rnn-019",
        type: "markdown",
        content: `## Training Function

Trains either vanilla RNN or GRU, then measures gradient norms across a long
sequence to demonstrate the vanishing gradient problem.

**Gradient norm tracking:** we compute loss only at the final timestep so the
gradient must flow ALL the way back through \`seq_len\` timesteps. For vanilla RNN,
expect exponential decay as t decreases (further from loss). For GRU, expect more
uniform norms due to gradient highways through the gates.`
    },
    {
        id: "nm-rnn-020",
        type: "code",
        content: `def train_rnn(
    docs: list[str],
    unique_chars: list[str],
    forward_fn,
    params: dict,
    model_name: str
) -> tuple[float, list[float], list[dict]]:
    """Train an RNN model, track gradient norms, and return loss history."""
    BOS = len(unique_chars)
    VOCAB_SIZE_LOCAL = len(unique_chars) + 1

    # Flatten all parameters for optimizer
    param_list = []
    for key, val in params.items():
        if isinstance(val, list) and isinstance(val[0], Value):
            param_list.extend(val)
        elif isinstance(val, list) and isinstance(val[0], list):
            for row in val:
                param_list.extend(row)

    print(f"Training {model_name}...")
    print(f"Parameters: {len(param_list):,}")

    final_loss_value = 0.0
    loss_history = []

    for step in range(NUM_STEPS):
        doc = docs[step % len(docs)]
        tokens = [BOS] + [unique_chars.index(ch) for ch in doc] + [BOS]
        seq_len = min(SEQ_LEN, len(tokens) - 1)

        h = [Value(0.0) for _ in range(N_HIDDEN)]

        losses = []
        for pos in range(seq_len):
            x_onehot = [Value(1.0 if i == tokens[pos] else 0.0) for i in range(VOCAB_SIZE_LOCAL)]
            logits, h = forward_fn(x_onehot, h, params)
            probs = softmax(logits)
            loss_t = -safe_log(probs[tokens[pos + 1]])
            losses.append(loss_t)

        loss = (1.0 / seq_len) * sum(losses)
        loss.backward()

        # SGD update
        for param in param_list:
            param.data -= LEARNING_RATE * param.grad
            param.grad = 0.0

        final_loss_value = loss.data

        if step % 10 == 0:
            loss_history.append({"step": step + 1, "loss": round(loss.data, 4)})

        if (step + 1) % 200 == 0 or step == 0:
            print(f"  step {step + 1:>4}/{NUM_STEPS} | loss: {loss.data:.4f}")

    print(f"{model_name} training complete. Final loss: {final_loss_value:.4f}\\n")

    # --- Gradient norm measurement across a long sequence ---
    print(f"Measuring gradient norms for {model_name}...")

    # Concatenate names to create a long sequence
    long_tokens = [BOS]
    for doc in docs:
        long_tokens.extend([unique_chars.index(ch) for ch in doc])
        long_tokens.append(BOS)
        if len(long_tokens) > SEQ_LEN:
            break
    seq_len = min(SEQ_LEN, len(long_tokens) - 1)

    h = [Value(0.0) for _ in range(N_HIDDEN)]
    hidden_states = []

    for pos in range(seq_len):
        x_onehot = [Value(1.0 if i == long_tokens[pos] else 0.0) for i in range(VOCAB_SIZE_LOCAL)]
        logits, h = forward_fn(x_onehot, h, params)
        hidden_states.append(h)

    # Loss at final timestep only — gradient must flow all the way back
    probs = softmax(logits)
    loss = -safe_log(probs[long_tokens[seq_len]])
    loss.backward()

    # ||dL/dh_t|| = sqrt(Σᵢ (dL/dh_t[i])²)
    gradient_norms = []
    for h_t in hidden_states:
        norm = math.sqrt(sum(h_i.grad ** 2 for h_i in h_t))
        gradient_norms.append(norm)

    print(f"Gradient norms per timestep (sequence length {seq_len}):")
    for t, norm in enumerate(gradient_norms):
        bar = "#" * min(50, int(norm * 100))
        print(f"  t={t:>2}: ||dL/dh_t|| = {norm:.6f}  {bar}")

    if gradient_norms[-1] > 1e-10:
        ratio = gradient_norms[0] / gradient_norms[-1]
    else:
        ratio = 0.0
    print(f"Gradient norm ratio (first/last): {ratio:.6f}")
    print(f"  (< 0.01 = severe vanishing, > 0.1 = gradient highway active)\\n")

    return final_loss_value, gradient_norms, loss_history`
    },
    {
        id: "nm-rnn-021",
        type: "markdown",
        content: `## Inference`
    },
    {
        id: "nm-rnn-022",
        type: "code",
        content: `def generate_names(
    params: dict,
    forward_fn,
    unique_chars: list[str],
    num_samples: int = 10,
    model_name: str = "Model"
) -> list[str]:
    """Generate names from a trained RNN model."""
    BOS = len(unique_chars)
    VOCAB_SIZE_LOCAL = len(unique_chars) + 1

    print(f"Generating {num_samples} samples from {model_name}:")

    samples = []
    for _ in range(num_samples):
        h = [Value(0.0) for _ in range(N_HIDDEN)]
        token_id = BOS
        generated = []

        for pos in range(SEQ_LEN):
            x_onehot = [Value(1.0 if i == token_id else 0.0) for i in range(VOCAB_SIZE_LOCAL)]
            logits, h = forward_fn(x_onehot, h, params)
            probs = softmax(logits)
            token_id = random.choices(
                range(VOCAB_SIZE_LOCAL),
                weights=[p.data for p in probs]
            )[0]

            if token_id == BOS:
                break
            generated.append(unique_chars[token_id])

        name = ''.join(generated)
        samples.append(name)
        print(f"  {name}")

    print()
    return samples`
    },
    {
        id: "nm-rnn-023",
        type: "markdown",
        content: `## Run: Load Data and Prepare Vocabulary`
    },
    {
        id: "nm-rnn-024",
        type: "code",
        content: `print("Loading data...")
all_docs = load_data(DATA_URL)
random.shuffle(all_docs)

docs = all_docs[:TRAIN_SIZE]

unique_chars = sorted(set(''.join(all_docs)))
BOS = len(unique_chars)
VOCAB_SIZE = len(unique_chars) + 1

print(f"Loaded {len(all_docs)} documents, training on {len(docs)}")
print(f"Vocabulary size: {VOCAB_SIZE} (characters + BOS token)")`
    },
    {
        id: "nm-rnn-025",
        type: "markdown",
        content: `## Train Vanilla RNN`
    },
    {
        id: "nm-rnn-026",
        type: "code",
        content: `vanilla_params = init_vanilla_rnn_params()
vanilla_loss, vanilla_grad_norms, vanilla_history = train_rnn(
    docs, unique_chars, vanilla_rnn_forward, vanilla_params, "Vanilla RNN"
)`
    },
    {
        id: "nm-rnn-027",
        type: "markdown",
        content: `## Train GRU`
    },
    {
        id: "nm-rnn-028",
        type: "code",
        content: `gru_params = init_gru_params()
gru_loss, gru_grad_norms, gru_history = train_rnn(
    docs, unique_chars, gru_forward, gru_params, "GRU"
)`
    },
    {
        id: "nm-rnn-028b",
        type: "markdown",
        content: `## Training Loss: Vanilla RNN vs GRU

Both models see the same data in the same order. The chart below overlays their
loss curves so you can compare convergence speed — the GRU's gating mechanism
typically leads to faster, more stable descent.`
    },
    {
        id: "nm-rnn-028c",
        type: "code",
        content: `import pynote_ui

combined = [{"step": d["step"], "loss": d["loss"], "model": "Vanilla RNN"} for d in vanilla_history]
combined += [{"step": d["step"], "loss": d["loss"], "model": "GRU"} for d in gru_history]

pynote_ui.oplot.line(
    combined,
    x="step",
    y="loss",
    stroke="model",
    height=340,
    title="Training Loss — Vanilla RNN vs GRU"
)`
    },
    {
        id: "nm-rnn-029",
        type: "markdown",
        content: `## Comparison: Vanilla RNN vs GRU

**Why the gradient norm ratio matters:**
- **Vanilla RNN:** Gradient norms decay exponentially due to repeated multiplication
  by W_hh. Spectral radius < 1 causes gradients to vanish as they propagate backward.
- **GRU:** Update gate creates "gradient highways" where ∂h_t/∂h_{t−1} ≈ 1 when z_t ≈ 0.
  This identity connection bypasses weight matrices, preserving gradient magnitude.`
    },
    {
        id: "nm-rnn-030",
        type: "code",
        content: `print("=" * 70)
print("COMPARISON: Vanilla RNN vs GRU")
print("=" * 70)
print(f"{'Metric':<30} | {'Vanilla RNN':<15} | {'GRU':<15}")
print("-" * 70)
print(f"{'Final Loss':<30} | {vanilla_loss:<15.4f} | {gru_loss:<15.4f}")

vanilla_ratio = vanilla_grad_norms[0] / vanilla_grad_norms[-1] if vanilla_grad_norms[-1] > 1e-10 else 0.0
gru_ratio = gru_grad_norms[0] / gru_grad_norms[-1] if gru_grad_norms[-1] > 1e-10 else 0.0

print(f"{'Gradient Norm Ratio':<30} | {vanilla_ratio:<15.6f} | {gru_ratio:<15.6f}")
print(f"{'(first/last, higher=better)':<30} |                 |                ")
print("-" * 70)`
    },
    {
        id: "nm-rnn-030b",
        type: "markdown",
        content: `### Gradient Norm per Timestep

Each bar shows ‖∂L/∂hₜ‖ at a single timestep. The vanilla RNN's bars shrink
exponentially toward earlier timesteps — the vanishing gradient in action.
The GRU's bars stay roughly level, evidence of the gradient highway
created by the update gate.`
    },
    {
        id: "nm-rnn-030c",
        type: "code",
        content: `grad_data = [{"timestep": t, "norm": round(n, 6), "model": "Vanilla RNN"} for t, n in enumerate(vanilla_grad_norms)]
grad_data += [{"timestep": t, "norm": round(n, 6), "model": "GRU"} for t, n in enumerate(gru_grad_norms)]

pynote_ui.oplot.bar(
    grad_data,
    x="timestep",
    y="norm",
    fill="model",
    height=340,
    title="Gradient Norm ‖∂L/∂hₜ‖ per Timestep"
)`
    },
    {
        id: "nm-rnn-031",
        type: "markdown",
        content: `## Generated Samples`
    },
    {
        id: "nm-rnn-032",
        type: "code",
        content: `print("=" * 70)
print("GENERATED SAMPLES")
print("=" * 70)
print()

vanilla_samples = generate_names(
    vanilla_params, vanilla_rnn_forward, unique_chars, num_samples=10, model_name="Vanilla RNN"
)

gru_samples = generate_names(
    gru_params, gru_forward, unique_chars, num_samples=10, model_name="GRU"
)`
    },
    {
        id: "nm-rnn-033",
        type: "markdown",
        content: `## Historical Arc

- **1990s:** Vanilla RNNs introduced — theoretically powerful, but gradients vanish
  in practice, limiting them to short sequences (~10 steps).
- **1997:** LSTM introduced gating to solve vanishing gradients. Became the standard.
- **2014:** GRU simplified LSTM's 3 gates to 2, achieving similar performance with
  fewer parameters and faster training.
- **2017:** Transformers replaced recurrence entirely, using attention for O(1) path
  length between any two positions.
- **Today:** RNNs are largely historical, but the gating principle (learned routing of
  gradients) lives on in modern architectures like state-space models.`
    },
    {
        id: "nm-rnn-footer",
        type: "markdown",
        content: `---

[← Autoregressive Transformer (GPT)](?open=nm_microgpt) · [Convolutional Neural Network →](?open=nm_microconv)`
    },
];
