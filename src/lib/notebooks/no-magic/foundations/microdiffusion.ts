import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microdiffusion.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microDiffusionCells: CellData[] = [
    {
        id: "nm-dif-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Micro Diffusion

How images emerge from noise — the denoising diffusion algorithm behind Stable Diffusion,
demonstrated on a 2D spiral. Train a model to predict noise, then iteratively remove it to
generate new samples from pure randomness.

This 2D implementation preserves the exact DDPM algorithm used in Stable Diffusion,
scaled down from billion-param U-Nets on images to ~1000-param MLPs on point clouds.

**Reference:** \`01-foundations/microdiffusion.py\` — no-magic collection
(Ho et al., "Denoising Diffusion Probabilistic Models", 2020)

---`
    },
    {
        id: "nm-dif-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random

random.seed(42)`
    },
    {
        id: "nm-dif-003",
        type: "markdown",
        content: `## Constants`
    },
    {
        id: "nm-dif-004",
        type: "code",
        content: `# Diffusion process hyperparameters
T = 100            # Number of diffusion timesteps (production models use 1000)
BETA_START = 0.0001  # Initial noise level
BETA_END = 0.02      # Final noise level

# Model architecture
HIDDEN_DIM = 64      # MLP hidden layer size (~1000 total params)
TIME_EMB_DIM = 32    # Sinusoidal timestep embedding dimension

# Training
NUM_EPOCHS = 8000    # Training iterations
LEARNING_RATE = 0.001
NUM_SAMPLES = 800    # Number of training data points (2D spiral)

# Inference
NUM_GENERATED = 500  # Number of samples to generate`
    },
    {
        id: "nm-dif-005",
        type: "markdown",
        content: `## Synthetic Data Generation

A 2D spiral that grows linearly in radius as angle increases, creating a non-trivial
distribution that tests whether the model learns structure, not just a Gaussian blob.`
    },
    {
        id: "nm-dif-006",
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
        id: "nm-dif-007",
        type: "markdown",
        content: `## Noise Schedule

The forward diffusion process adds Gaussian noise at each timestep:

$$q(x_t | x_{t-1}) = \\mathcal{N}(x_t; \\sqrt{1 - \\beta_t} \\cdot x_{t-1},\\; \\beta_t \\cdot I)$$

We precompute $\\bar{\\alpha}_t = \\prod_{i=1}^{t}(1 - \\beta_i)$ to enable direct noising to
arbitrary timesteps without sequential application:

$$q(x_t | x_0) = \\mathcal{N}(x_t; \\sqrt{\\bar{\\alpha}_t} \\cdot x_0,\\; (1 - \\bar{\\alpha}_t) \\cdot I)$$

This closed-form jump is what makes diffusion models practical to train — we can sample
any timestep in O(1) rather than stepping through all t-1 prior timesteps.`
    },
    {
        id: "nm-dif-008",
        type: "code",
        content: `def compute_noise_schedule(t_steps: int, beta_start: float, beta_end: float):
    """Precompute noise schedule coefficients for all timesteps."""
    # Linear interpolation from beta_start to beta_end
    betas = [beta_start + (beta_end - beta_start) * t / (t_steps - 1)
             for t in range(t_steps)]

    alphas = [1.0 - b for b in betas]

    # Cumulative product: alpha_bar_t = alpha_1 * alpha_2 * ... * alpha_t
    alpha_bars = []
    product = 1.0
    for alpha in alphas:
        product *= alpha
        alpha_bars.append(product)

    sqrt_alpha_bars = [math.sqrt(ab) for ab in alpha_bars]
    sqrt_one_minus_alpha_bars = [math.sqrt(1.0 - ab) for ab in alpha_bars]

    return betas, alphas, alpha_bars, sqrt_alpha_bars, sqrt_one_minus_alpha_bars`
    },
    {
        id: "nm-dif-009",
        type: "markdown",
        content: `## Timestep Embedding

Sinusoidal positional encoding — same embedding used in Transformers (Vaswani et al., 2017).
Lower frequency components (early dims) change slowly with t, higher frequencies (later dims)
change rapidly — this multi-scale encoding helps the model distinguish nearby timesteps.`
    },
    {
        id: "nm-dif-010",
        type: "code",
        content: `def sinusoidal_embedding(t: int, dim: int) -> list[float]:
    """Encode timestep t as a vector using sinusoidal positional encoding."""
    embedding = []
    for i in range(dim // 2):
        freq = 1.0 / (10000.0 ** (2 * i / dim))
        embedding.append(math.sin(t * freq))
        embedding.append(math.cos(t * freq))
    return embedding`
    },
    {
        id: "nm-dif-011",
        type: "markdown",
        content: `## Denoising MLP

Architecture: [x\\_noisy (2D), t\\_embedding] → hidden (ReLU) → hidden (ReLU) → 2D predicted noise.

In production diffusion models (Stable Diffusion), this MLP is replaced by a
U-Net with billions of parameters, attention layers, and skip connections.
But the training objective is identical: given $x_t$ and $t$, predict $\\epsilon$.`
    },
    {
        id: "nm-dif-012",
        type: "code",
        content: `def relu(x: float) -> float:
    return max(0.0, x)


def initialize_weights(input_dim: int, output_dim: int) -> list[list[float]]:
    """Xavier/Glorot uniform initialization."""
    scale = math.sqrt(6.0 / (input_dim + output_dim))
    return [[random.uniform(-scale, scale) for _ in range(output_dim)]
            for _ in range(input_dim)]


def initialize_bias(dim: int) -> list[float]:
    return [0.0 for _ in range(dim)]


class DenoisingMLP:
    def __init__(self):
        input_dim = 2 + TIME_EMB_DIM

        self.w1 = initialize_weights(input_dim, HIDDEN_DIM)
        self.b1 = initialize_bias(HIDDEN_DIM)
        self.w2 = initialize_weights(HIDDEN_DIM, HIDDEN_DIM)
        self.b2 = initialize_bias(HIDDEN_DIM)
        self.w3 = initialize_weights(HIDDEN_DIM, 2)
        self.b3 = initialize_bias(2)

        # Adam optimizer state
        self.m = {'w1': [[0.0]*HIDDEN_DIM for _ in range(input_dim)],
                  'b1': [0.0]*HIDDEN_DIM,
                  'w2': [[0.0]*HIDDEN_DIM for _ in range(HIDDEN_DIM)],
                  'b2': [0.0]*HIDDEN_DIM,
                  'w3': [[0.0]*2 for _ in range(HIDDEN_DIM)],
                  'b3': [0.0]*2}

        self.v = {'w1': [[0.0]*HIDDEN_DIM for _ in range(input_dim)],
                  'b1': [0.0]*HIDDEN_DIM,
                  'w2': [[0.0]*HIDDEN_DIM for _ in range(HIDDEN_DIM)],
                  'b2': [0.0]*HIDDEN_DIM,
                  'w3': [[0.0]*2 for _ in range(HIDDEN_DIM)],
                  'b3': [0.0]*2}

        self.step = 0

    def forward(self, x_noisy: tuple[float, float], t: int) -> tuple[float, float]:
        """Forward pass: (noisy_point, timestep) -> predicted_noise."""
        t_emb = sinusoidal_embedding(t, TIME_EMB_DIM)
        input_vec = [x_noisy[0], x_noisy[1]] + t_emb

        # Layer 1
        h1 = [sum(input_vec[i] * self.w1[i][j] for i in range(len(input_vec))) + self.b1[j]
              for j in range(HIDDEN_DIM)]
        h1_relu = [relu(h) for h in h1]

        # Layer 2
        h2 = [sum(h1_relu[i] * self.w2[i][j] for i in range(HIDDEN_DIM)) + self.b2[j]
              for j in range(HIDDEN_DIM)]
        h2_relu = [relu(h) for h in h2]

        # Layer 3 (output, no activation)
        output = [sum(h2_relu[i] * self.w3[i][j] for i in range(HIDDEN_DIM)) + self.b3[j]
                  for j in range(2)]

        # Cache for backprop
        self.cache = {
            'input': input_vec,
            'h1': h1, 'h1_relu': h1_relu,
            'h2': h2, 'h2_relu': h2_relu,
            'output': output
        }

        return tuple(output)

    def backward_and_update(self, grad_output: tuple[float, float], lr: float):
        """Backpropagate MSE gradient and update weights with Adam."""
        grad_out = list(grad_output)

        # Backprop through layer 3
        grad_w3 = [[self.cache['h2_relu'][i] * grad_out[j] for j in range(2)]
                   for i in range(HIDDEN_DIM)]
        grad_b3 = grad_out
        grad_h2_relu = [sum(self.w3[i][j] * grad_out[j] for j in range(2))
                        for i in range(HIDDEN_DIM)]

        # Backprop through ReLU
        grad_h2 = [grad_h2_relu[i] if self.cache['h2'][i] > 0 else 0.0
                   for i in range(HIDDEN_DIM)]

        # Backprop through layer 2
        grad_w2 = [[self.cache['h1_relu'][i] * grad_h2[j] for j in range(HIDDEN_DIM)]
                   for i in range(HIDDEN_DIM)]
        grad_b2 = grad_h2
        grad_h1_relu = [sum(self.w2[i][j] * grad_h2[j] for j in range(HIDDEN_DIM))
                        for i in range(HIDDEN_DIM)]

        # Backprop through ReLU
        grad_h1 = [grad_h1_relu[i] if self.cache['h1'][i] > 0 else 0.0
                   for i in range(HIDDEN_DIM)]

        # Backprop through layer 1
        input_dim = len(self.cache['input'])
        grad_w1 = [[self.cache['input'][i] * grad_h1[j] for j in range(HIDDEN_DIM)]
                   for i in range(input_dim)]
        grad_b1 = grad_h1

        # Adam update
        self.step += 1
        beta1, beta2, eps = 0.9, 0.999, 1e-8

        def adam_update(param, grad, m, v):
            for i in range(len(param)):
                if isinstance(param[i], list):
                    for j in range(len(param[i])):
                        m[i][j] = beta1 * m[i][j] + (1 - beta1) * grad[i][j]
                        v[i][j] = beta2 * v[i][j] + (1 - beta2) * grad[i][j] ** 2
                        m_hat = m[i][j] / (1 - beta1 ** self.step)
                        v_hat = v[i][j] / (1 - beta2 ** self.step)
                        param[i][j] -= lr * m_hat / (math.sqrt(v_hat) + eps)
                else:
                    m[i] = beta1 * m[i] + (1 - beta1) * grad[i]
                    v[i] = beta2 * v[i] + (1 - beta2) * grad[i] ** 2
                    m_hat = m[i] / (1 - beta1 ** self.step)
                    v_hat = v[i] / (1 - beta2 ** self.step)
                    param[i] -= lr * m_hat / (math.sqrt(v_hat) + eps)

        adam_update(self.w1, grad_w1, self.m['w1'], self.v['w1'])
        adam_update(self.b1, grad_b1, self.m['b1'], self.v['b1'])
        adam_update(self.w2, grad_w2, self.m['w2'], self.v['w2'])
        adam_update(self.b2, grad_b2, self.m['b2'], self.v['b2'])
        adam_update(self.w3, grad_w3, self.m['w3'], self.v['w3'])
        adam_update(self.b3, grad_b3, self.m['b3'], self.v['b3'])`
    },
    {
        id: "nm-dif-013",
        type: "markdown",
        content: `## Forward Diffusion Process

$$x_t = \\sqrt{\\bar{\\alpha}_t} \\cdot x_0 + \\sqrt{1 - \\bar{\\alpha}_t} \\cdot \\epsilon$$

where $\\epsilon \\sim \\mathcal{N}(0, I)$ is the noise we sample. The sqrt coefficients ensure
variance is preserved: $\\text{Var}(x_t) = \\bar{\\alpha}_t + (1 - \\bar{\\alpha}_t) = 1$.`
    },
    {
        id: "nm-dif-014",
        type: "code",
        content: `def add_noise(x0: tuple[float, float], t: int,
              sqrt_alpha_bars: list[float],
              sqrt_one_minus_alpha_bars: list[float]) -> tuple[tuple[float, float],
                                                                tuple[float, float]]:
    """Add noise to clean data point x0 at timestep t. Returns (x_t, epsilon)."""
    epsilon = (random.gauss(0, 1), random.gauss(0, 1))

    coeff_signal = sqrt_alpha_bars[t]
    coeff_noise = sqrt_one_minus_alpha_bars[t]

    x_t = (coeff_signal * x0[0] + coeff_noise * epsilon[0],
           coeff_signal * x0[1] + coeff_noise * epsilon[1])

    return x_t, epsilon`
    },
    {
        id: "nm-dif-015",
        type: "markdown",
        content: `## Training

The training loop:
1. Sample random data point $x_0$ from training set
2. Sample random timestep $t$
3. Sample noise $\\epsilon \\sim \\mathcal{N}(0, I)$
4. Compute $x_t$ using the forward process
5. Predict $\\hat{\\epsilon} = \\text{model}(x_t, t)$
6. Loss = MSE($\\hat{\\epsilon}$, $\\epsilon$)
7. Backprop and update

**Why predict noise instead of clean data:** empirically, predicting the noise $\\epsilon$
is easier to learn than predicting $x_0$. Intuitively, the noise is simpler (zero-mean
Gaussian) than the data (complex spiral structure).`
    },
    {
        id: "nm-dif-016",
        type: "code",
        content: `def train(data, model, betas, alphas, alpha_bars,
          sqrt_alpha_bars, sqrt_one_minus_alpha_bars, num_epochs, lr):
    """Train the denoising model to predict noise."""
    print(f"Training for {num_epochs} epochs...")

    for epoch in range(num_epochs):
        x0 = random.choice(data)
        t = random.randint(0, T - 1)

        x_t, epsilon_true = add_noise(x0, t, sqrt_alpha_bars, sqrt_one_minus_alpha_bars)
        epsilon_pred = model.forward(x_t, t)

        # MSE loss
        loss = ((epsilon_pred[0] - epsilon_true[0]) ** 2 +
                (epsilon_pred[1] - epsilon_true[1]) ** 2) / 2

        # Gradient of MSE: d/d(pred) [(pred - true)^2 / 2] = (pred - true)
        grad_loss = (epsilon_pred[0] - epsilon_true[0],
                     epsilon_pred[1] - epsilon_true[1])

        model.backward_and_update(grad_loss, lr)

        if (epoch + 1) % 500 == 0 or epoch == 0:
            print(f"  Epoch {epoch + 1:>5}/{num_epochs}  Loss: {loss:.6f}")`
    },
    {
        id: "nm-dif-017",
        type: "markdown",
        content: `## Sampling (Reverse Process)

Start with $x_T \\sim \\mathcal{N}(0, I)$, then for $t = T{-}1, T{-}2, \\ldots, 0$:

$$x_{t-1} = \\frac{1}{\\sqrt{\\alpha_t}} \\left( x_t - \\frac{\\beta_t}{\\sqrt{1 - \\bar{\\alpha}_t}} \\cdot \\hat{\\epsilon} \\right) + \\sigma_t \\cdot z$$

where $z \\sim \\mathcal{N}(0, I)$ for $t > 0$, $z = 0$ for $t = 0$.`
    },
    {
        id: "nm-dif-018",
        type: "code",
        content: `def sample(model, betas, alphas, alpha_bars) -> tuple[float, float]:
    """Generate a new 2D point by iteratively denoising pure noise."""
    x = (random.gauss(0, 1), random.gauss(0, 1))

    for t in range(T - 1, -1, -1):
        epsilon_pred = model.forward(x, t)

        coeff = 1.0 / math.sqrt(alphas[t])
        noise_coeff = betas[t] / math.sqrt(1.0 - alpha_bars[t])

        mean_x = coeff * (x[0] - noise_coeff * epsilon_pred[0])
        mean_y = coeff * (x[1] - noise_coeff * epsilon_pred[1])

        if t > 0:
            sigma = math.sqrt(betas[t])
            z = (random.gauss(0, 1), random.gauss(0, 1))
            x = (mean_x + sigma * z[0], mean_y + sigma * z[1])
        else:
            x = (mean_x, mean_y)

    return x`
    },
    {
        id: "nm-dif-019",
        type: "code",
        content: `def compute_statistics(points: list[tuple[float, float]]) -> dict[str, float]:
    """Compute mean and standard deviation of 2D point cloud."""
    n = len(points)
    mean_x = sum(p[0] for p in points) / n
    mean_y = sum(p[1] for p in points) / n
    var_x = sum((p[0] - mean_x) ** 2 for p in points) / n
    var_y = sum((p[1] - mean_y) ** 2 for p in points) / n
    return {
        'mean_x': mean_x, 'mean_y': mean_y,
        'std_x': math.sqrt(var_x), 'std_y': math.sqrt(var_y)
    }`
    },
    {
        id: "nm-dif-020",
        type: "markdown",
        content: `## Generate Training Data and Compute Noise Schedule`
    },
    {
        id: "nm-dif-021",
        type: "code",
        content: `print("=" * 70)
print("DENOISING DIFFUSION ON 2D SPIRAL")
print("=" * 70)
print()

# Generate training data
print("Generating training data...")
data = generate_spiral(NUM_SAMPLES)
train_stats = compute_statistics(data)
print(f"  Training set: {NUM_SAMPLES} points")
print(f"  Mean: ({train_stats['mean_x']:.4f}, {train_stats['mean_y']:.4f})")
print(f"  Std:  ({train_stats['std_x']:.4f}, {train_stats['std_y']:.4f})")
print()

# Precompute noise schedule
print("Computing noise schedule...")
betas, alphas, alpha_bars, sqrt_alpha_bars, sqrt_one_minus_alpha_bars = \\
    compute_noise_schedule(T, BETA_START, BETA_END)
print(f"  Timesteps: {T}")
print(f"  Beta range: [{BETA_START:.6f}, {BETA_END:.6f}]")
print(f"  Alpha_bar at T-1: {alpha_bars[-1]:.6f}")
print()

# Initialize model
print("Initializing denoising model...")
model = DenoisingMLP()
print(f"  Architecture: (2+{TIME_EMB_DIM}) -> {HIDDEN_DIM} -> {HIDDEN_DIM} -> 2")
print(f"  Parameters: ~{(2 + TIME_EMB_DIM) * HIDDEN_DIM + HIDDEN_DIM * HIDDEN_DIM + HIDDEN_DIM * 2}")
print()`
    },
    {
        id: "nm-dif-022",
        type: "markdown",
        content: `## Train the Model`
    },
    {
        id: "nm-dif-023",
        type: "code",
        content: `train(data, model, betas, alphas, alpha_bars, sqrt_alpha_bars,
      sqrt_one_minus_alpha_bars, NUM_EPOCHS, LEARNING_RATE)`
    },
    {
        id: "nm-dif-024",
        type: "markdown",
        content: `## Generate Samples and Compare Distributions`
    },
    {
        id: "nm-dif-025",
        type: "code",
        content: `print()
print(f"Generating {NUM_GENERATED} samples from trained model...")
generated = [sample(model, betas, alphas, alpha_bars)
             for _ in range(NUM_GENERATED)]
gen_stats = compute_statistics(generated)
print(f"  Generated set: {NUM_GENERATED} points")
print(f"  Mean: ({gen_stats['mean_x']:.4f}, {gen_stats['mean_y']:.4f})")
print(f"  Std:  ({gen_stats['std_x']:.4f}, {gen_stats['std_y']:.4f})")
print()

# Compare distributions
print("Distribution comparison:")
print(f"  Training mean: ({train_stats['mean_x']:.4f}, {train_stats['mean_y']:.4f})")
print(f"  Generated mean: ({gen_stats['mean_x']:.4f}, {gen_stats['mean_y']:.4f})")
print()
print(f"  Training std: ({train_stats['std_x']:.4f}, {train_stats['std_y']:.4f})")
print(f"  Generated std: ({gen_stats['std_x']:.4f}, {gen_stats['std_y']:.4f})")
print()

# Quality metrics
mean_x_zscore = abs(gen_stats['mean_x'] - train_stats['mean_x']) / train_stats['std_x']
mean_y_zscore = abs(gen_stats['mean_y'] - train_stats['mean_y']) / train_stats['std_y']
std_x_diff = abs(gen_stats['std_x'] - train_stats['std_x']) / train_stats['std_x'] * 100
std_y_diff = abs(gen_stats['std_y'] - train_stats['std_y']) / train_stats['std_y'] * 100

print("Quality metrics:")
print(f"  Mean shift (in std units):  X={mean_x_zscore:.2f}σ  Y={mean_y_zscore:.2f}σ")
print(f"  Std deviation difference:   X={std_x_diff:.1f}%  Y={std_y_diff:.1f}%")
print()

success = mean_x_zscore < 0.5 and mean_y_zscore < 0.5 and std_x_diff < 20 and std_y_diff < 20
if success:
    print("SUCCESS: Generated distribution matches training distribution.")
else:
    print("PARTIAL: Generated distribution differs from training (may need more epochs).")`
    },
    {
        id: "nm-dif-026",
        type: "markdown",
        content: `## Summary

**What just happened:**
1. Generated a 2D spiral (non-trivial distribution)
2. Trained a tiny MLP to predict noise at each diffusion timestep
3. Sampled new points by starting from random noise and iteratively removing predicted noise for T steps

**Mapping to image diffusion** (Stable Diffusion, DALL-E):
- 2D coordinates (x, y) → RGB pixel values (R, G, B)
- ~1000-param MLP → ~1 billion-param U-Net with attention
- 800 training points → hundreds of millions of images
- Gaussian noise on (x,y) → Gaussian noise on (R,G,B)

The algorithm is identical. The scale is different.
This is how all modern image generation models work.`
    },
];
