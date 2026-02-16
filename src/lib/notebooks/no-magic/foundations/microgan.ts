import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microgan.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microGANCells: CellData[] = [
    {
        id: "nm-gan-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Micro GAN

Two networks at war — how a generator learns to fool a discriminator, and why the
equilibrium is so fragile.

This 2D implementation preserves the exact minimax game from Goodfellow et al.,
"Generative Adversarial Nets" (2014), scaled down from deep convolutional networks on
images to ~500-param MLPs on point clouds. Completes the "generative trilogy": diffusion
denoises, VAE decodes from latent, GAN fools a critic.

**Reference:** \`01-foundations/microgan.py\` — no-magic collection

---`
    },
    {
        id: "nm-gan-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random

random.seed(42)`
    },
    {
        id: "nm-gan-003",
        type: "markdown",
        content: `## Constants and Hyperparameters

~500 total parameters. Production GANs (StyleGAN, BigGAN) have millions.
The architecture is the same adversarial game; only the network capacity differs.`
    },
    {
        id: "nm-gan-004",
        type: "code",
        content: `# Data
NUM_POINTS = 800  # Training data size (2D spiral, matches microdiffusion.py)

# Generator architecture: noise_dim -> hidden -> 2D output
NOISE_DIM = 8
GEN_HIDDEN = 16

# Discriminator architecture: 2D input -> hidden -> 1 (real/fake probability)
DISC_HIDDEN = 16

# Training
NUM_STEPS = 400      # browser-tuned; CLI original: 1500
BATCH_SIZE = 16      # smaller than typical (32-64) to keep scalar autograd runtime tractable
LEARNING_RATE = 0.005
BETA1 = 0.5          # lower than typical 0.9 — GANs benefit from less momentum
BETA2 = 0.999
EPS_ADAM = 1e-8`
    },
    {
        id: "nm-gan-005",
        type: "markdown",
        content: `## Synthetic Data Generation

A 2D spiral point cloud — same spiral as microdiffusion.py for direct generative model
comparison. The spiral grows linearly in radius as angle increases, creating a non-trivial
distribution that tests whether the generator learns structure, not just a Gaussian blob.`
    },
    {
        id: "nm-gan-006",
        type: "code",
        content: `def generate_spiral(num_points: int) -> list[tuple[float, float]]:
    """Generate a 2D spiral point cloud for training."""
    points = []
    for i in range(num_points):
        theta = (i / num_points) * 4 * math.pi  # 2 full revolutions
        r = theta / (2 * math.pi)
        x = r * math.cos(theta) + random.gauss(0, 0.05)
        y = r * math.sin(theta) + random.gauss(0, 0.05)
        points.append((x, y))
    return points`
    },
    {
        id: "nm-gan-007",
        type: "markdown",
        content: `## Scalar Autograd Engine

Identical interface to microgpt.py's Value class, extended with \`sigmoid()\`
for the discriminator's output activation. Tracks computational history via
\`_children\` and \`_local_grads\`, enabling gradient computation through the chain rule.`
    },
    {
        id: "nm-gan-008",
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

    def relu(self):
        return Value(max(0, self.data), (self,), (float(self.data > 0),))

    def tanh(self):
        t = math.tanh(self.data)
        return Value(t, (self,), (1 - t ** 2,))

    def sigmoid(self):
        """Logistic sigmoid: sigma(x) = 1 / (1 + exp(-x)).
        Derivative: sigma(x) * (1 - sigma(x)).
        """
        clamped = max(-500, min(500, self.data))
        s = 1.0 / (1.0 + math.exp(-clamped))
        return Value(s, (self,), (s * (1 - s),))

    def log(self):
        return Value(math.log(self.data), (self,), (1 / self.data,))

    def backward(self):
        """Compute gradients via reverse-mode automatic differentiation."""
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
                child.grad += local_grad * v.grad


def safe_log(prob: Value) -> Value:
    """Clipped logarithm — prevents log(0) = -inf."""
    clamped = max(prob.data, 1e-10)
    return Value(math.log(clamped), (prob,), (1.0 / clamped,))`
    },
    {
        id: "nm-gan-009",
        type: "markdown",
        content: `## Network Definitions

### Helper Functions`
    },
    {
        id: "nm-gan-010",
        type: "code",
        content: `def make_weights(nrows: int, ncols: int) -> list[list[Value]]:
    """Xavier/Glorot initialization: std = sqrt(2 / (fan_in + fan_out))."""
    std = math.sqrt(2.0 / (nrows + ncols))
    return [[Value(random.gauss(0, std)) for _ in range(ncols)] for _ in range(nrows)]


def make_bias(n: int) -> list[Value]:
    """Zero-initialized bias vector."""
    return [Value(0.0) for _ in range(n)]


def linear(x: list[Value], w: list[list[Value]], b: list[Value]) -> list[Value]:
    """y = W @ x + b."""
    return [
        sum(w_row[j] * x[j] for j in range(len(x))) + b[i]
        for i, w_row in enumerate(w)
    ]`
    },
    {
        id: "nm-gan-011",
        type: "markdown",
        content: `### Generator

Maps random noise to 2D points. Architecture: noise\\_dim → hidden (ReLU) → hidden (ReLU) → 2D output (tanh).

Tanh output bounds generated points to [-1, 1] per coordinate, matching the
approximate range of the spiral data. Without bounding, the generator can
produce arbitrarily large values early in training, making the discriminator's
job trivially easy.`
    },
    {
        id: "nm-gan-012",
        type: "code",
        content: `class Generator:
    def __init__(self):
        self.w1 = make_weights(GEN_HIDDEN, NOISE_DIM)
        self.b1 = make_bias(GEN_HIDDEN)
        self.w2 = make_weights(GEN_HIDDEN, GEN_HIDDEN)
        self.b2 = make_bias(GEN_HIDDEN)
        self.w3 = make_weights(2, GEN_HIDDEN)
        self.b3 = make_bias(2)

    def forward(self, z: list[Value]) -> list[Value]:
        """Forward pass: noise vector z -> 2D point."""
        h = [v.relu() for v in linear(z, self.w1, self.b1)]
        h = [v.relu() for v in linear(h, self.w2, self.b2)]
        out = linear(h, self.w3, self.b3)
        return [v.tanh() for v in out]  # bound to [-1, 1]

    def parameters(self) -> list[Value]:
        params = []
        for matrix in [self.w1, self.w2, self.w3]:
            for row in matrix:
                params.extend(row)
        for bias in [self.b1, self.b2, self.b3]:
            params.extend(bias)
        return params`
    },
    {
        id: "nm-gan-013",
        type: "markdown",
        content: `### Discriminator

Classifies 2D points as real or generated. Architecture: 2D input → hidden (ReLU) → hidden (ReLU) → 1 (sigmoid).

Sigmoid output is interpreted as P(input is real). The discriminator is trained
to output 1 for real data and 0 for generated data — the generator is trained
to make the discriminator output 1 for generated data.`
    },
    {
        id: "nm-gan-014",
        type: "code",
        content: `class Discriminator:
    def __init__(self):
        self.w1 = make_weights(DISC_HIDDEN, 2)
        self.b1 = make_bias(DISC_HIDDEN)
        self.w2 = make_weights(DISC_HIDDEN, DISC_HIDDEN)
        self.b2 = make_bias(DISC_HIDDEN)
        self.w3 = make_weights(1, DISC_HIDDEN)
        self.b3 = make_bias(1)

    def forward(self, x: list[Value]) -> Value:
        """Forward pass: 2D point -> P(real)."""
        h = [v.relu() for v in linear(x, self.w1, self.b1)]
        h = [v.relu() for v in linear(h, self.w2, self.b2)]
        out = linear(h, self.w3, self.b3)
        return out[0].sigmoid()  # squash to (0, 1)

    def parameters(self) -> list[Value]:
        params = []
        for matrix in [self.w1, self.w2, self.w3]:
            for row in matrix:
                params.extend(row)
        for bias in [self.b1, self.b2, self.b3]:
            params.extend(bias)
        return params`
    },
    {
        id: "nm-gan-015",
        type: "markdown",
        content: `## Loss Functions

### Discriminator Loss

Minimax objective: maximize log(D(x)) + log(1 - D(G(z))). The discriminator
wants D(real) = 1 and D(fake) = 0. This is standard binary cross-entropy.

### Generator Loss (Non-Saturating)

The original minimax formulation has the generator minimize log(1 - D(G(z))),
but this **saturates** early in training: when D confidently rejects fake samples
(D(G(z)) ≈ 0), log(1 - 0) ≈ 0 and the gradient nearly vanishes.

The non-saturating variant flips the objective: maximize log(D(G(z))).
When D(G(z)) ≈ 0, log(0) → -∞ provides a strong gradient signal.
Same fixed point (Nash equilibrium at D = 0.5) but much better gradient dynamics.

From Goodfellow et al. (2014), Section 3: *"this alternative formulation provides
much stronger gradients early in learning."*`
    },
    {
        id: "nm-gan-016",
        type: "code",
        content: `def discriminator_loss(d_real_scores: list[Value], d_fake_scores: list[Value]) -> Value:
    """L_D = -[mean(log(D(x_real))) + mean(log(1 - D(G(z))))]"""
    real_loss = sum(safe_log(score) for score in d_real_scores) / len(d_real_scores)
    fake_loss = sum(safe_log(1 - score) for score in d_fake_scores) / len(d_fake_scores)
    return -(real_loss + fake_loss)


def generator_loss_nonsaturating(d_fake_scores: list[Value]) -> Value:
    """L_G = -mean(log(D(G(z))))"""
    return -(sum(safe_log(score) for score in d_fake_scores) / len(d_fake_scores))`
    },
    {
        id: "nm-gan-017",
        type: "markdown",
        content: `## Adam Optimizer`
    },
    {
        id: "nm-gan-018",
        type: "code",
        content: `class Adam:
    """Adam optimizer with per-parameter adaptive learning rates."""

    def __init__(self, params: list[Value], lr: float = 0.001,
                 beta1: float = 0.5, beta2: float = 0.999):
        self.params = params
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.m = [0.0] * len(params)
        self.v = [0.0] * len(params)
        self.t = 0

    def step(self):
        self.t += 1
        for i, param in enumerate(self.params):
            self.m[i] = self.beta1 * self.m[i] + (1 - self.beta1) * param.grad
            self.v[i] = self.beta2 * self.v[i] + (1 - self.beta2) * param.grad ** 2
            m_hat = self.m[i] / (1 - self.beta1 ** self.t)
            v_hat = self.v[i] / (1 - self.beta2 ** self.t)
            param.data -= self.lr * m_hat / (math.sqrt(v_hat) + EPS_ADAM)

    def zero_grad(self):
        for param in self.params:
            param.grad = 0.0`
    },
    {
        id: "nm-gan-019",
        type: "markdown",
        content: `## Mode Collapse Detection

Mode collapse is the most common GAN failure mode: the generator discovers one
point (or small region) that reliably fools the discriminator and stops exploring.
All generated samples cluster at that point, ignoring the rest of the data distribution.

Detection: if the standard deviation of generated points drops below a threshold
in either coordinate, the generator has likely collapsed.`
    },
    {
        id: "nm-gan-020",
        type: "code",
        content: `def detect_mode_collapse(
    generated_points: list[tuple[float, float]],
    threshold_std: float = 0.05,
) -> tuple[bool, float, float]:
    """Returns (collapsed, std_x, std_y)."""
    n = len(generated_points)
    if n < 2:
        return False, 0.0, 0.0

    mean_x = sum(p[0] for p in generated_points) / n
    mean_y = sum(p[1] for p in generated_points) / n

    var_x = sum((p[0] - mean_x) ** 2 for p in generated_points) / n
    var_y = sum((p[1] - mean_y) ** 2 for p in generated_points) / n

    std_x = math.sqrt(var_x)
    std_y = math.sqrt(var_y)

    collapsed = std_x < threshold_std or std_y < threshold_std
    return collapsed, std_x, std_y`
    },
    {
        id: "nm-gan-021",
        type: "markdown",
        content: `## Training Utilities`
    },
    {
        id: "nm-gan-022",
        type: "code",
        content: `def sample_noise(batch_size: int, noise_dim: int) -> list[list[Value]]:
    """Sample a batch of noise vectors z ~ N(0, I)."""
    return [
        [Value(random.gauss(0, 1)) for _ in range(noise_dim)]
        for _ in range(batch_size)
    ]


def scale_point(point: tuple[float, float]) -> list[Value]:
    """Scale a raw data point to roughly [-1, 1], matching generator's tanh range."""
    return [Value(point[0] / 2.0), Value(point[1] / 2.0)]`
    },
    {
        id: "nm-gan-023",
        type: "markdown",
        content: `## Generate Training Data and Initialize Networks`
    },
    {
        id: "nm-gan-024",
        type: "code",
        content: `print("=" * 70)
print("GENERATIVE ADVERSARIAL NETWORK ON 2D SPIRAL")
print("=" * 70)
print()

# Generate training data
print("Generating training data...")
data = generate_spiral(NUM_POINTS)

# Real data statistics (on scaled data)
scaled_data = [(p[0] / 2.0, p[1] / 2.0) for p in data]
n = len(scaled_data)
real_mean_x = sum(p[0] for p in scaled_data) / n
real_mean_y = sum(p[1] for p in scaled_data) / n
real_std_x = math.sqrt(sum((p[0] - real_mean_x) ** 2 for p in scaled_data) / n)
real_std_y = math.sqrt(sum((p[1] - real_mean_y) ** 2 for p in scaled_data) / n)

print(f"  Training set: {NUM_POINTS} points (2D spiral)")
print(f"  Scaled mean: ({real_mean_x:.4f}, {real_mean_y:.4f})")
print(f"  Scaled std:  ({real_std_x:.4f}, {real_std_y:.4f})")
print()

# Initialize networks
gen = Generator()
disc = Discriminator()

gen_params = gen.parameters()
disc_params = disc.parameters()

print(f"Generator:     {len(gen_params)} parameters")
print(f"  Architecture: {NOISE_DIM} -> {GEN_HIDDEN} (ReLU) -> {GEN_HIDDEN} (ReLU) -> 2 (tanh)")
print(f"Discriminator: {len(disc_params)} parameters")
print(f"  Architecture: 2 -> {DISC_HIDDEN} (ReLU) -> {DISC_HIDDEN} (ReLU) -> 1 (sigmoid)")
print()

# Separate optimizers — the two networks are adversaries, not collaborators
opt_gen = Adam(gen_params, lr=LEARNING_RATE, beta1=BETA1, beta2=BETA2)
opt_disc = Adam(disc_params, lr=LEARNING_RATE, beta1=BETA1, beta2=BETA2)`
    },
    {
        id: "nm-gan-025",
        type: "markdown",
        content: `## Training Loop

The GAN training loop alternates between two phases per step:
1. **Train discriminator** (freeze generator): D learns to output 1 for real, 0 for fake
2. **Train generator** (freeze discriminator): G learns to make D output 1 for fake

If both improve at comparable rates, they reach Nash equilibrium where
D(x) = 0.5 for all x (can't tell real from fake).

Production GANs often train D more steps per G step (e.g., 5:1)
to keep D ahead of G. We use 1:1 for simplicity.`
    },
    {
        id: "nm-gan-026",
        type: "code",
        content: `print(f"Training for {NUM_STEPS} steps (batch size {BATCH_SIZE})...")
print()

collapse_detected_at = -1

for step in range(NUM_STEPS):

    # --- Phase 1: Train Discriminator ---
    opt_disc.zero_grad()

    real_batch = random.choices(data, k=BATCH_SIZE)
    d_real_scores = [disc.forward(scale_point(point)) for point in real_batch]

    # Generate fake data (detached from generator graph — only want D gradients)
    noise_batch = sample_noise(BATCH_SIZE, NOISE_DIM)
    fake_points_raw = [gen.forward(z) for z in noise_batch]
    fake_points_detached = [
        [Value(p.data) for p in point] for point in fake_points_raw
    ]
    d_fake_scores = [disc.forward(point) for point in fake_points_detached]

    d_loss = discriminator_loss(d_real_scores, d_fake_scores)
    d_loss.backward()
    opt_disc.step()

    # --- Phase 2: Train Generator ---
    opt_gen.zero_grad()

    noise_batch = sample_noise(BATCH_SIZE, NOISE_DIM)
    fake_points = [gen.forward(z) for z in noise_batch]

    # Gradients flow through D back into G
    d_fake_scores_for_gen = [disc.forward(point) for point in fake_points]

    g_loss = generator_loss_nonsaturating(d_fake_scores_for_gen)
    g_loss.backward()
    opt_gen.step()

    # Clear stale D gradients from G's backward pass
    opt_disc.zero_grad()

    # --- Diagnostics ---
    if (step + 1) % 300 == 0 or step == 0:
        mean_d_real = sum(s.data for s in d_real_scores) / len(d_real_scores)
        mean_d_fake = sum(s.data for s in d_fake_scores) / len(d_fake_scores)

        print(f"  step {step + 1:>5}/{NUM_STEPS}  "
              f"D_loss: {d_loss.data:>7.4f}  G_loss: {g_loss.data:>7.4f}  "
              f"D(real): {mean_d_real:.3f}  D(fake): {mean_d_fake:.3f}")

        check_points = [(p[0].data, p[1].data) for p in fake_points]
        collapsed, std_x, std_y = detect_mode_collapse(check_points)

        if collapsed and collapse_detected_at < 0:
            collapse_detected_at = step + 1
            print(f"    WARNING: Mode collapse detected (std_x={std_x:.4f}, std_y={std_y:.4f})")

print()
print("Training complete.")`
    },
    {
        id: "nm-gan-027",
        type: "markdown",
        content: `## Evaluation and Results`
    },
    {
        id: "nm-gan-028",
        type: "code",
        content: `# Generate final batch for evaluation
print("Evaluating generator...")
num_eval = 200
eval_noise = sample_noise(num_eval, NOISE_DIM)
generated_points = [
    (gen.forward(z)[0].data, gen.forward(z)[1].data) for z in eval_noise
]

collapsed, gen_std_x, gen_std_y = detect_mode_collapse(generated_points)
gen_mean_x = sum(p[0] for p in generated_points) / num_eval
gen_mean_y = sum(p[1] for p in generated_points) / num_eval

print()
print("=" * 70)
print("RESULTS")
print("=" * 70)
print()

print("Distribution comparison (scaled to [-1, 1] range):")
print(f"                   Real              Generated")
print(f"  Mean X:     {real_mean_x:>10.4f}         {gen_mean_x:>10.4f}")
print(f"  Mean Y:     {real_mean_y:>10.4f}         {gen_mean_y:>10.4f}")
print(f"  Std  X:     {real_std_x:>10.4f}         {gen_std_x:>10.4f}")
print(f"  Std  Y:     {real_std_y:>10.4f}         {gen_std_y:>10.4f}")
print()

# Quality metrics
mean_x_zscore = abs(gen_mean_x - real_mean_x) / real_std_x if real_std_x > 0 else 0
mean_y_zscore = abs(gen_mean_y - real_mean_y) / real_std_y if real_std_y > 0 else 0
std_x_ratio = gen_std_x / real_std_x if real_std_x > 0 else 0
std_y_ratio = gen_std_y / real_std_y if real_std_y > 0 else 0

print("Quality metrics:")
print(f"  Mean shift (in std units):  X={mean_x_zscore:.2f}sigma  Y={mean_y_zscore:.2f}sigma")
print(f"  Std ratio (gen/real):       X={std_x_ratio:.2f}  Y={std_y_ratio:.2f}")
print()

if collapsed:
    print("STATUS: Mode collapse detected -- generator produces low-diversity output.")
    print(f"  Generated std ({gen_std_x:.4f}, {gen_std_y:.4f}) is below threshold (0.05).")
    if collapse_detected_at > 0:
        print(f"  First detected at step {collapse_detected_at}.")
else:
    good_mean = mean_x_zscore < 1.0 and mean_y_zscore < 1.0
    good_std = 0.3 < std_x_ratio < 3.0 and 0.3 < std_y_ratio < 3.0
    if good_mean and good_std:
        print("STATUS: Generated distribution approximately matches real data.")
    else:
        print("STATUS: Generated distribution differs from real data.")
        print("  GAN training is notoriously unstable -- results vary with")
        print("  hyperparameters, initialization, and training duration.")`
    },
    {
        id: "nm-gan-029",
        type: "markdown",
        content: `## Discriminator Equilibrium Check`
    },
    {
        id: "nm-gan-030",
        type: "code",
        content: `eval_real = random.choices(data, k=100)
d_real_final = [disc.forward(scale_point(p)).data for p in eval_real]
eval_fake_noise = sample_noise(100, NOISE_DIM)
d_fake_final = [disc.forward(gen.forward(z)).data for z in eval_fake_noise]
mean_d_real_final = sum(d_real_final) / len(d_real_final)
mean_d_fake_final = sum(d_fake_final) / len(d_fake_final)

print()
print("Discriminator equilibrium:")
print(f"  D(real) = {mean_d_real_final:.4f}  (ideal: 0.5 at Nash equilibrium)")
print(f"  D(fake) = {mean_d_fake_final:.4f}  (ideal: 0.5 at Nash equilibrium)")
if abs(mean_d_real_final - 0.5) < 0.2 and abs(mean_d_fake_final - 0.5) < 0.2:
    print("  Near equilibrium -- discriminator cannot reliably distinguish real from fake.")
elif mean_d_real_final > 0.8 and mean_d_fake_final < 0.2:
    print("  Discriminator winning -- generator has not converged.")
elif mean_d_fake_final > 0.8:
    print("  Generator dominant -- may indicate training instability.")`
    },
    {
        id: "nm-gan-031",
        type: "markdown",
        content: `## Summary

**What just happened:**
1. Generated a 2D spiral (same as microdiffusion.py)
2. Trained a generator to map random noise to 2D points
3. Trained a discriminator to distinguish real from generated points
4. The two networks played a minimax game until (ideally) equilibrium

**The generative model trilogy:**
- **Diffusion** (microdiffusion.py): learns to denoise — iterative refinement
- **VAE** (microvae.py): learns a latent space — encode then decode
- **GAN** (this file): learns by adversarial competition — fool the critic

**Mapping to production GANs** (StyleGAN, BigGAN):
- 2D coordinates → high-resolution images (1024×1024)
- ~500-param MLPs → millions of parameters with convolutions
- Vanilla minimax → Wasserstein loss, spectral normalization, progressive growing, style mixing, truncation trick
- The adversarial game is identical. The networks are bigger.`
    },
];
