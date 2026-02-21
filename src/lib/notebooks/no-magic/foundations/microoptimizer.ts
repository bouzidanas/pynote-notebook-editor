import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microoptimizer.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microOptimizerCells: CellData[] = [
    {
        id: "nm-opt-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Optimizer Comparison

Why Adam converges when SGD stalls — momentum, adaptive learning rates, and the
geometry of **loss landscapes**, demonstrated head-to-head on the same model.

Every neural network is trained by gradient descent: compute the gradient of the
loss with respect to each parameter, then nudge each parameter in the direction
that reduces loss. The **learning rate** controls how big a step you take.

Vanilla SGD applies the same step size to every parameter. This fails in practice
because different parameters live in regions of the loss landscape with very
different curvatures — a step size that’s just right for one parameter can
overshoot another.

**Momentum** adds a velocity term: instead of stepping purely in the current
gradient direction, the optimizer accumulates an exponential moving average of
past gradients. This smooths noisy gradients and carries the optimizer through
flat regions (saddle points) where vanilla SGD stalls.

**Adaptive learning rates** (RMSProp, Adam) go further: they maintain a
per-parameter running average of squared gradients. Parameters that have
consistently large gradients get smaller effective learning rates, while
parameters with small gradients get larger ones. Adam combines momentum *and*
adaptive rates with bias correction, which is why it dominates in practice.

**Reference:** \`01-foundations/microoptimizer.py\` — no-magic collection

---`
    },
    {
        id: "nm-opt-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
import time
from pyodide.http import open_url

random.seed(42)`
    },
    {
        id: "nm-opt-003",
        type: "markdown",
        content: `## Constants and Hyperparameters

Model architecture is deliberately simple so optimizer differences are visible.`
    },
    {
        id: "nm-opt-004",
        type: "code",
        content: `# Model architecture
N_EMBD = 8           # embedding dimension (small to keep scalar autograd tractable)
VOCAB_SIZE = 0       # set after loading data (number of unique characters + BOS)

# Training parameters — shared across all optimizer runs
NUM_STEPS = 300      # training iterations per optimizer
BATCH_SIZE = 4       # names sampled per step — small because scalar autograd builds a
                     # full computation graph per Value operation

# Optimizer-specific hyperparameters
SGD_LR = 0.05
MOMENTUM_LR = 0.05
MOMENTUM_BETA = 0.9        # exponential decay rate for velocity
RMSPROP_LR = 0.01
RMSPROP_BETA = 0.99        # decay rate for squared gradient average
RMSPROP_EPS = 1e-8
ADAM_LR = 0.01
ADAM_BETA1 = 0.9            # first moment decay (momentum component)
ADAM_BETA2 = 0.999          # second moment decay (RMSProp component)
ADAM_EPS = 1e-8

# Extension parameters — warmup + cosine decay applied to Adam
WARMUP_STEPS = 20
COSINE_LR = 0.01           # peak learning rate after warmup

# Data URL
DATA_URL = "https://raw.githubusercontent.com/karpathy/makemore/master/names.txt"`
    },
    {
        id: "nm-opt-005",
        type: "markdown",
        content: `## Data Loading`
    },
    {
        id: "nm-opt-006",
        type: "code",
        content: `def load_data(url: str) -> list[str]:
    """Download and parse the training corpus."""
    text = open_url(url).read()
    docs = [line.strip() for line in text.splitlines() if line.strip()]
    return docs`
    },
    {
        id: "nm-opt-007",
        type: "markdown",
        content: `## Scalar Autograd Engine

A scalar value with reverse-mode automatic differentiation. Tracks computational history
via \`_children\` and \`_local_grads\`, enabling gradient computation through the chain rule.
Every forward operation stores its local derivative (∂out/∂input) as a closure, then
\`backward()\` replays the computation graph in reverse topological order, accumulating
gradients.`
    },
    {
        id: "nm-opt-008",
        type: "code",
        content: `class Value:
    __slots__ = ('data', 'grad', '_children', '_local_grads')

    def __init__(self, data: float, children: tuple = (), local_grads: tuple = ()):
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

    def exp(self):
        e = math.exp(self.data)
        return Value(e, (self,), (e,))

    def log(self):
        return Value(math.log(self.data), (self,), (1 / self.data,))

    def backward(self):
        """Compute gradients via reverse-mode automatic differentiation."""
        topo: list[Value] = []
        visited: set[int] = set()

        def build_topo(v: Value) -> None:
            vid = id(v)
            if vid not in visited:
                visited.add(vid)
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
        id: "nm-opt-009",
        type: "markdown",
        content: `## Bigram Model

A character bigram predicts the next character given only the current character.
Architecture: embed(char) → linear → softmax → next char distribution.
This is deliberately simple — the optimizer comparison is the focus, not model
sophistication. All four optimizers train this exact same architecture.`
    },
    {
        id: "nm-opt-010",
        type: "code",
        content: `def make_params(vocab_size: int, embd_dim: int) -> list[list[Value]]:
    """Initialize model parameters: embedding matrix [vocab_size, embd_dim] and
    output projection [vocab_size, embd_dim].

    Weight initialization uses Gaussian noise scaled by 1/sqrt(embd_dim) — the
    Xavier/Glorot heuristic that keeps activation variance roughly constant
    across layers.
    """
    std = 1.0 / math.sqrt(embd_dim)
    embedding = [[Value(random.gauss(0, std)) for _ in range(embd_dim)]
                 for _ in range(vocab_size)]
    projection = [[Value(random.gauss(0, std)) for _ in range(embd_dim)]
                  for _ in range(vocab_size)]
    return [embedding, projection]


def clone_params(params: list[list[list[Value]]]) -> list[list[list[Value]]]:
    """Deep copy model parameters so each optimizer starts from identical weights."""
    return [
        [[Value(v.data) for v in row] for row in matrix]
        for matrix in params
    ]


def flatten_params(params: list[list[list[Value]]]) -> list[Value]:
    """Flatten nested parameter structure into a single list for optimizer bookkeeping."""
    return [v for matrix in params for row in matrix for v in row]`
    },
    {
        id: "nm-opt-011",
        type: "code",
        content: `def softmax(logits: list[Value]) -> list[Value]:
    """Numerically stable softmax: subtract max(logits) before exp() to prevent overflow."""
    max_val = max(v.data for v in logits)
    exp_vals = [(v - max_val).exp() for v in logits]
    total = sum(exp_vals)
    return [e / total for e in exp_vals]


def safe_log(prob: Value) -> Value:
    """Clamped logarithm to prevent log(0) = -inf."""
    clamped = max(prob.data, 1e-10)
    return Value(math.log(clamped), (prob,), (1.0 / clamped,))`
    },
    {
        id: "nm-opt-012",
        type: "markdown",
        content: `### Bigram Loss

For each consecutive character pair (context → target), the model:
1. Looks up the context character's embedding vector
2. Projects it to vocabulary-sized logits via dot product with projection matrix
3. Applies softmax to get a probability distribution
4. Computes -log(p(target)) as the loss for this pair

The total loss is averaged over all bigrams in the batch.`
    },
    {
        id: "nm-opt-013",
        type: "code",
        content: `def bigram_loss(params: list[list[list[Value]]], data: list[list[int]]) -> Value:
    """Compute cross-entropy loss over a mini-batch of tokenized names."""
    embedding, projection = params
    total_loss = Value(0.0)
    count = 0

    for token_seq in data:
        for i in range(len(token_seq) - 1):
            context = token_seq[i]
            target = token_seq[i + 1]

            # Forward pass: embed → project → softmax → loss
            emb = embedding[context]
            logits = [sum(projection[j][k] * emb[k] for k in range(len(emb)))
                      for j in range(len(projection))]
            probs = softmax(logits)

            # Cross-entropy: -log(p(target))
            total_loss = total_loss + (-safe_log(probs[target]))
            count += 1

    return total_loss / count`
    },
    {
        id: "nm-opt-014",
        type: "markdown",
        content: `## Optimizer Implementations

Each optimizer takes the same interface: a list of Value parameters and their gradients.
The key insight is that they all compute parameter updates using the same gradient
information, but accumulate and scale it differently.

---

### Vanilla SGD

Update rule: θ = θ - lr * ∇L

The simplest possible optimizer: move each parameter in the direction opposite
to its gradient, scaled by the learning rate. No memory of past gradients.

Problem: all parameters get the same learning rate regardless of gradient
history. Parameters with consistently large gradients may overshoot, while
those with small gradients barely move. Also, SGD gets stuck in saddle points
because it has no momentum to carry it through flat regions.`
    },
    {
        id: "nm-opt-015",
        type: "code",
        content: `def step_sgd(param_list: list[Value], learning_rate: float, state: dict) -> None:
    """Vanilla stochastic gradient descent."""
    for param in param_list:
        param.data -= learning_rate * param.grad
        param.grad = 0.0`
    },
    {
        id: "nm-opt-016",
        type: "markdown",
        content: `### SGD with Momentum

Update rule:
- v = β·v + ∇L (accumulate velocity)
- θ = θ - lr · v (update parameters using velocity)

Momentum acts like a ball rolling downhill: it accelerates through consistent
gradient directions and dampens oscillation in directions where gradients
alternate sign. β controls how much past gradients influence the current step.
At β=0.9, the effective window is ~10 past gradients (1/(1-β)).

This helps escape saddle points and shallow local minima where vanilla SGD stalls.`
    },
    {
        id: "nm-opt-017",
        type: "code",
        content: `def step_momentum(param_list: list[Value], learning_rate: float, state: dict) -> None:
    """SGD with momentum — adds a velocity term that accumulates past gradients."""
    if 'velocity' not in state:
        state['velocity'] = [0.0] * len(param_list)

    velocity = state['velocity']
    for i, param in enumerate(param_list):
        velocity[i] = MOMENTUM_BETA * velocity[i] + param.grad
        param.data -= learning_rate * velocity[i]
        param.grad = 0.0`
    },
    {
        id: "nm-opt-018",
        type: "markdown",
        content: `### RMSProp

Update rule:
- s = β·s + (1-β)·∇L² (running average of squared gradients)
- θ = θ - lr · ∇L / √(s + ε) (scale update by inverse RMS of gradient history)

The key insight: dividing by √s normalizes each parameter's update by the
typical magnitude of its gradient. Parameters with historically large gradients
get smaller effective learning rates (preventing overshooting), while parameters
with small gradients get larger effective rates (accelerating learning).

RMSProp was proposed by Hinton in an unpublished lecture. It fixes AdaGrad's
problem of monotonically decreasing learning rates by using an exponential
moving average instead of a cumulative sum.`
    },
    {
        id: "nm-opt-019",
        type: "code",
        content: `def step_rmsprop(param_list: list[Value], learning_rate: float, state: dict) -> None:
    """RMSProp — adapts the learning rate per-parameter using squared gradient history."""
    if 'sq_avg' not in state:
        state['sq_avg'] = [0.0] * len(param_list)

    sq_avg = state['sq_avg']
    for i, param in enumerate(param_list):
        sq_avg[i] = RMSPROP_BETA * sq_avg[i] + (1 - RMSPROP_BETA) * param.grad ** 2
        param.data -= learning_rate * param.grad / (math.sqrt(sq_avg[i]) + RMSPROP_EPS)
        param.grad = 0.0`
    },
    {
        id: "nm-opt-020",
        type: "markdown",
        content: `### Adam

Combines momentum (first moment) with RMSProp (second moment) plus bias correction.

Update rule:
- m = β1·m + (1-β1)·∇L (first moment: momentum/mean of gradients)
- v = β2·v + (1-β2)·∇L² (second moment: uncentered variance of gradients)
- m̂ = m / (1 - β1^t) (bias correction for first moment)
- v̂ = v / (1 - β2^t) (bias correction for second moment)
- θ = θ - lr · m̂ / √(v̂ + ε) (parameter update)

**Why bias correction matters:** m and v are initialized to 0. In early steps,
they're biased toward zero because the exponential moving average hasn't
had time to "warm up". Without correction, early updates would be much
too small (m ≈ 0) or misgauged (v ≈ 0). The correction factor 1/(1-β^t)
compensates — it's large when t is small and approaches 1 as t grows.

Adam's dominance in practice comes from combining the best of both worlds:
momentum provides noise-averaged gradient direction, while adaptive scaling
provides per-parameter step sizes.`
    },
    {
        id: "nm-opt-021",
        type: "code",
        content: `def step_adam(param_list: list[Value], learning_rate: float, state: dict) -> None:
    """Adam — combines momentum with adaptive scaling plus bias correction."""
    if 'step_count' not in state:
        state['step_count'] = 0
        state['m'] = [0.0] * len(param_list)
        state['v'] = [0.0] * len(param_list)

    state['step_count'] += 1
    t = state['step_count']
    m_state = state['m']
    v_state = state['v']

    for i, param in enumerate(param_list):
        m_state[i] = ADAM_BETA1 * m_state[i] + (1 - ADAM_BETA1) * param.grad
        v_state[i] = ADAM_BETA2 * v_state[i] + (1 - ADAM_BETA2) * param.grad ** 2

        # Bias correction
        m_hat = m_state[i] / (1 - ADAM_BETA1 ** t)
        v_hat = v_state[i] / (1 - ADAM_BETA2 ** t)

        param.data -= learning_rate * m_hat / (math.sqrt(v_hat) + ADAM_EPS)
        param.grad = 0.0`
    },
    {
        id: "nm-opt-022",
        type: "markdown",
        content: `## Training Loop

Train the same bigram model architecture with each optimizer independently.
Each run starts from identical initial weights (via \`clone_params\`) so differences
in convergence are purely due to the optimizer, not initialization luck.`
    },
    {
        id: "nm-opt-023",
        type: "code",
        content: `def train_optimizer(
    optimizer_name: str,
    step_fn,
    learning_rate: float,
    params: list[list[list[Value]]],
    batches: list[list[list[int]]],
    num_steps: int,
    lr_schedule_fn=None,
) -> tuple[list[float], float]:
    """Train a bigram model using a specific optimizer and return loss history."""
    param_list = flatten_params(params)
    state: dict = {}
    loss_history: list[float] = []

    start_time = time.time()

    for step in range(num_steps):
        batch = batches[step % len(batches)]

        # Compute loss and gradients
        loss = bigram_loss(params, batch)
        loss.backward()

        # Determine effective learning rate (with optional schedule)
        effective_lr = learning_rate
        if lr_schedule_fn is not None:
            effective_lr = lr_schedule_fn(step, num_steps)

        # Apply optimizer step
        step_fn(param_list, effective_lr, state)

        loss_history.append(loss.data)

        if (step + 1) % 100 == 0 or step == 0:
            print(f"  [{optimizer_name:>20s}] step {step + 1:>4}/{num_steps} | "
                  f"loss: {loss.data:.4f} | lr: {effective_lr:.6f}")

    elapsed = time.time() - start_time
    return loss_history, elapsed`
    },
    {
        id: "nm-opt-024",
        type: "markdown",
        content: `## Learning Rate Scheduling: Warmup + Cosine Decay

Warmup + cosine decay is the standard schedule in modern deep learning (GPT, LLaMA,
BERT all use variants of this).

**Warmup phase** (first N steps): linearly ramp lr from 0 to peak. Early in training,
the loss landscape is chaotic and gradients are unreliable. Large learning rates
cause divergence. Warmup lets the optimizer "feel out" the landscape before
committing to large steps.

**Cosine decay phase** (remaining steps): smoothly anneal lr following a cosine curve
from peak to 0. As the model converges, the loss landscape becomes more curved
(higher curvature near minima). Smaller learning rates prevent overshooting the
narrow valley of the minimum.

Math:
- If step < warmup\\_steps: lr = peak\\_lr × step / warmup\\_steps (linear warmup)
- Else: progress = (step - warmup\\_steps) / (total - warmup\\_steps); lr = peak\\_lr × 0.5 × (1 + cos(π × progress)) (cosine decay)`
    },
    {
        id: "nm-opt-025",
        type: "code",
        content: `def cosine_schedule(step: int, num_steps: int) -> float:
    """Compute learning rate with linear warmup followed by cosine decay."""
    if step < WARMUP_STEPS:
        # Linear warmup: lr grows from 0 to COSINE_LR over WARMUP_STEPS
        return COSINE_LR * (step + 1) / WARMUP_STEPS
    else:
        # Cosine decay: lr decreases from COSINE_LR to 0 following cos curve
        progress = (step - WARMUP_STEPS) / max(1, num_steps - WARMUP_STEPS)
        return COSINE_LR * 0.5 * (1 + math.cos(math.pi * progress))`
    },
    {
        id: "nm-opt-026",
        type: "markdown",
        content: `## Load and Prepare Data`
    },
    {
        id: "nm-opt-027",
        type: "code",
        content: `print("Loading data...")
docs = load_data(DATA_URL)
random.shuffle(docs)

# Build vocabulary from unique characters
unique_chars = sorted(set(''.join(docs)))
BOS = len(unique_chars)
VOCAB_SIZE = len(unique_chars) + 1

print(f"Loaded {len(docs)} names")
print(f"Vocabulary: {VOCAB_SIZE} tokens ({len(unique_chars)} chars + BOS)")

# Tokenize: [BOS, char_0, char_1, ..., char_n, BOS]
tokenized = [[BOS] + [unique_chars.index(ch) for ch in name] + [BOS] for name in docs]

# Pre-generate mini-batches so all optimizers see the same data in the same order.
# This eliminates data ordering as a confound.
num_batches = (NUM_STEPS // 1) + 1
batches: list[list[list[int]]] = []
for b in range(num_batches):
    start = (b * BATCH_SIZE) % len(tokenized)
    batch = [tokenized[(start + j) % len(tokenized)] for j in range(BATCH_SIZE)]
    batches.append(batch)

# Initialize base model parameters (shared starting point via cloning)
random.seed(42)
base_params = make_params(VOCAB_SIZE, N_EMBD)

param_count = sum(len(row) for matrix in base_params for row in matrix)
print(f"Model parameters: {param_count:,}")
print(f"Training: {NUM_STEPS} steps, batch size {BATCH_SIZE}")`
    },
    {
        id: "nm-opt-028",
        type: "markdown",
        content: `## Head-to-Head Optimizer Comparison

Train with each optimizer independently, starting from identical initial weights.
All optimizers see the same data in the same order — differences are purely
due to the optimization algorithm.`
    },
    {
        id: "nm-opt-029",
        type: "code",
        content: `optimizers = [
    ("SGD",             step_sgd,      SGD_LR,      None),
    ("SGD + Momentum",  step_momentum, MOMENTUM_LR, None),
    ("RMSProp",         step_rmsprop,  RMSPROP_LR,  None),
    ("Adam",            step_adam,      ADAM_LR,     None),
    ("Adam + Schedule", step_adam,      COSINE_LR,   cosine_schedule),
]

results: list[tuple[str, list[float], float]] = []

for name, step_fn, lr, schedule_fn in optimizers:
    print(f"--- {name} (lr={lr}) ---")

    random.seed(42)
    params_copy = clone_params(base_params)

    loss_history, elapsed = train_optimizer(
        name, step_fn, lr, params_copy, batches, NUM_STEPS,
        lr_schedule_fn=schedule_fn,
    )
    results.append((name, loss_history, elapsed))
    print(f"  Final loss: {loss_history[-1]:.4f} | Time: {elapsed:.1f}s\\n")`
    },
    {
        id: "nm-opt-030",
        type: "markdown",
        content: `## Comparison Table

Find the step where each optimizer first drops below a loss threshold.
This measures convergence speed: fewer steps = faster convergence.`
    },
    {
        id: "nm-opt-031",
        type: "code",
        content: `loss_threshold = 3.0

print("=" * 76)
print(f"{'Optimizer':<20s} {'Final Loss':>12s} {'Steps to <' + str(loss_threshold):>16s} "
      f"{'Time (s)':>10s} {'Best Loss':>12s}")
print("-" * 76)

for name, loss_history, elapsed in results:
    final_loss = loss_history[-1]
    best_loss = min(loss_history)

    steps_to_threshold = "never"
    for step_idx, loss_val in enumerate(loss_history):
        if loss_val < loss_threshold:
            steps_to_threshold = str(step_idx + 1)
            break

    print(f"{name:<20s} {final_loss:>12.4f} {steps_to_threshold:>16s} "
          f"{elapsed:>10.1f} {best_loss:>12.4f}")

print("=" * 76)`
    },
    {
        id: "nm-opt-031b",
        type: "markdown",
        content: `## Loss Curves

All five optimizers on the same chart. Adaptive methods (RMSProp, Adam) converge
faster because they scale each parameter’s update by its gradient history, while
SGD applies a uniform step size that can’t adapt to different curvatures.`
    },
    {
        id: "nm-opt-031c",
        type: "code",
        content: `import pynote_ui

combined = []
for name, loss_history, elapsed in results:
    for step, loss in enumerate(loss_history):
        if step % 5 == 0:
            combined.append({"step": step + 1, "loss": round(loss, 4), "optimizer": name})

pynote_ui.oplot.line(
    combined,
    x="step",
    y="loss",
    stroke="optimizer",
    height=400,
    title="Training Loss — All Optimizers"
)`
    },
    {
        id: "nm-opt-031d",
        type: "markdown",
        content: `### Learning Rate Schedule: Warmup + Cosine Decay

The warmup phase linearly ramps the learning rate from 0 to peak over the first
20 steps, then cosine decay smoothly anneals it back to 0. This prevents
divergence in early training (when the landscape is chaotic) and reduces
overshooting near convergence (when the minimum is narrow).`
    },
    {
        id: "nm-opt-031e",
        type: "code",
        content: `schedule_data = [{"step": s + 1, "lr": round(cosine_schedule(s, NUM_STEPS), 6)} for s in range(NUM_STEPS) if s % 3 == 0]

pynote_ui.oplot.line(
    schedule_data,
    x="step",
    y="lr",
    stroke="#f59e0b",
    height=280,
    title="Learning Rate Schedule (Warmup + Cosine Decay)"
)`
    },
    {
        id: "nm-opt-032",
        type: "markdown",
        content: `## Key Observations

- **SGD** converges slowly and may stall at a higher loss plateau
- **Momentum** accelerates convergence by accumulating gradient direction
- **RMSProp** adapts per-parameter rates, handling uneven gradient scales
- **Adam** combines both benefits with bias correction for stable early training
- **LR scheduling** (warmup + cosine decay) further improves Adam's convergence`
    },
    {
        id: "nm-opt-033",
        type: "markdown",
        content: `## Inference: Generate Names with the Best Model

Use Adam + Schedule (the best-performing optimizer) to retrain the model
and generate character-level names via autoregressive sampling.`
    },
    {
        id: "nm-opt-034",
        type: "code",
        content: `# Retrain with Adam + Schedule to get final parameters
random.seed(42)
best_params = clone_params(base_params)
best_param_list = flatten_params(best_params)
adam_state: dict = {}

for step in range(NUM_STEPS):
    batch = batches[step % len(batches)]
    loss = bigram_loss(best_params, batch)
    loss.backward()
    lr_val = cosine_schedule(step, NUM_STEPS)
    step_adam(best_param_list, lr_val, adam_state)

# Generate 10 names via autoregressive sampling
embedding, projection = best_params
temperature = 0.8

print("Generated names (Adam + Schedule):\\n")
for sample_idx in range(10):
    token_id = BOS
    generated: list[str] = []

    for _ in range(20):  # max name length
        emb = embedding[token_id]
        logits_data = [
            sum(projection[j][k].data * emb[k].data for k in range(N_EMBD))
            for j in range(VOCAB_SIZE)
        ]

        # Temperature-scaled softmax (forward-only, no autograd needed for inference)
        max_logit = max(logits_data)
        exp_vals = [math.exp((v - max_logit) / temperature) for v in logits_data]
        total = sum(exp_vals)
        probs = [e / total for e in exp_vals]

        token_id = random.choices(range(VOCAB_SIZE), weights=probs)[0]

        if token_id == BOS:
            break
        generated.append(unique_chars[token_id])

    print(f"  {sample_idx + 1:>2}. {''.join(generated)}")`
    },
    {
        id: "nm-opt-footer",
        type: "markdown",
        content: `---

[\u2190 Retrieval-Augmented Generation](?open=nm_microrag) \u00b7 [Generative Adversarial Network \u2192](?open=nm_microgan)`
    },
];
