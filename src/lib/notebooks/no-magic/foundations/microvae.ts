import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microvae.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microVAECells: CellData[] = [
    {
        id: "nm-vae-001",
        type: "markdown",
        content: `# Micro VAE

How to learn a compressed, generative representation of data — the reparameterization
trick demystified, in pure Python with zero dependencies.

Production VAEs use convolutional encoders/decoders for images. This MLP on 2D data
demonstrates the same principles (ELBO, reparameterization, latent interpolation)
at 1% of the complexity. The algorithm is identical — only the encoder/decoder
architecture changes when scaling to pixels.

**Reference:** \`01-foundations/microvae.py\` — no-magic collection
(Kingma & Welling, "Auto-Encoding Variational Bayes", 2013)

[← Back to No-Magic Index](?open=no-magic)

---`
    },
    {
        id: "nm-vae-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random

random.seed(42)`
    },
    {
        id: "nm-vae-003",
        type: "markdown",
        content: `## Constants`
    },
    {
        id: "nm-vae-004",
        type: "code",
        content: `LATENT_DIM = 2          # Size of latent space z. 2D for easy interpretation.
HIDDEN_DIM = 16         # Hidden layer size for encoder and decoder MLPs.
LEARNING_RATE = 0.001
BETA = 1.0              # KL weight in ELBO. β=1 is standard VAE, β>1 encourages disentanglement.
NUM_EPOCHS = 1000
BATCH_SIZE = 16`
    },
    {
        id: "nm-vae-005",
        type: "markdown",
        content: `## Synthetic Data Generation

A mixture of 4 Gaussians in 2D space. Multiple modes force the latent space to organize
meaningfully — a single Gaussian would be trivial (the VAE would learn the mean/variance
directly).`
    },
    {
        id: "nm-vae-006",
        type: "code",
        content: `def generate_data(n_points: int = 800) -> list[list[float]]:
    """Generate a mixture of 2D Gaussians for training."""
    centers = [[-2.0, -2.0], [-2.0, 2.0], [2.0, -2.0], [2.0, 2.0]]
    variance = 0.3

    data = []
    for _ in range(n_points):
        center = random.choice(centers)
        x = random.gauss(center[0], math.sqrt(variance))
        y = random.gauss(center[1], math.sqrt(variance))
        data.append([x, y])
    return data`
    },
    {
        id: "nm-vae-007",
        type: "markdown",
        content: `## MLP Utilities

We use plain float arrays (not the Value autograd class) because VAE training with
scalar autograd hits runtime limits. Manual gradient computation keeps the core VAE
algorithm visible while meeting runtime constraints.`
    },
    {
        id: "nm-vae-008",
        type: "code",
        content: `def matrix_multiply(a: list[list[float]], b: list[float]) -> list[float]:
    """Multiply matrix a (m×n) by vector b (n,) to get vector (m,)."""
    return [sum(a[i][j] * b[j] for j in range(len(b))) for i in range(len(a))]


def relu(x: list[float]) -> list[float]:
    return [max(0.0, val) for val in x]


def relu_grad(x: list[float]) -> list[float]:
    return [1.0 if val > 0 else 0.0 for val in x]


def add_bias(x: list[float], b: list[float]) -> list[float]:
    return [x[i] + b[i] for i in range(len(x))]


def init_weights(rows: int, cols: int) -> list[list[float]]:
    """Xavier/Glorot initialization."""
    scale = math.sqrt(2.0 / (rows + cols))
    return [[random.gauss(0, scale) for _ in range(cols)] for _ in range(rows)]


def init_bias(size: int) -> list[float]:
    return [0.0 for _ in range(size)]`
    },
    {
        id: "nm-vae-009",
        type: "markdown",
        content: `## Encoder

Input (2D) → hidden (ReLU) → two output heads: **mean** and **log\\_var** in latent space.

Why two output heads? The encoder parameterizes the approximate posterior $q(z|x)$ as a
Gaussian. Instead of directly outputting variance $\\sigma^2$, we output $\\log(\\sigma^2)$ because:
- Variance must be positive, but the network output is unconstrained
- Optimizing log\\_var avoids numerical issues (exp is always positive)`
    },
    {
        id: "nm-vae-010",
        type: "code",
        content: `def encoder_forward(
    x: list[float],
    w1: list[list[float]], b1: list[float],
    w_mean: list[list[float]], b_mean: list[float],
    w_logvar: list[list[float]], b_logvar: list[float],
) -> tuple[list[float], list[float], list[float]]:
    """Encoder: input → hidden (ReLU) → (mean, log_var)."""
    hidden = relu(add_bias(matrix_multiply(w1, x), b1))
    mean = add_bias(matrix_multiply(w_mean, hidden), b_mean)
    log_var = add_bias(matrix_multiply(w_logvar, hidden), b_logvar)
    return hidden, mean, log_var`
    },
    {
        id: "nm-vae-011",
        type: "markdown",
        content: `## The Reparameterization Trick

This is the core pedagogical point of the script. Everything else is machinery;
this single function is what makes VAEs trainable.

**The problem:** We want to sample $z \\sim \\mathcal{N}(\\mu, \\sigma^2)$ where $\\mu$ and $\\sigma^2$
are encoder outputs. But sampling blocks gradient flow — the derivative of "sample a
random number" is undefined.

**The solution:** Move the randomness outside the computation graph:

$$\\epsilon \\sim \\mathcal{N}(0, 1) \\quad \\sigma = e^{0.5 \\cdot \\log\\sigma^2} \\quad z = \\mu + \\sigma \\cdot \\epsilon$$

Now gradients flow through $\\mu$ and $\\log\\sigma^2$ (deterministic network outputs), but not
through $\\epsilon$. Before Kingma & Welling (2013), people used REINFORCE-style gradient
estimators which have much higher variance.`
    },
    {
        id: "nm-vae-012",
        type: "code",
        content: `def reparameterize(mean: list[float], log_var: list[float]) -> list[float]:
    """Sample z from q(z|x) via the reparameterization trick.
    z = mean + exp(0.5 * log_var) * epsilon, where epsilon ~ N(0, 1).
    """
    epsilon = [random.gauss(0, 1) for _ in range(len(mean))]
    sigma = [math.exp(0.5 * lv) for lv in log_var]
    z = [mean[i] + sigma[i] * epsilon[i] for i in range(len(mean))]
    return z`
    },
    {
        id: "nm-vae-013",
        type: "markdown",
        content: `## Decoder

Latent $z$ → hidden (ReLU) → reconstructed output (2D). No output activation because
the data is unconstrained (can be negative).`
    },
    {
        id: "nm-vae-014",
        type: "code",
        content: `def decoder_forward(
    z: list[float],
    w1: list[list[float]], b1: list[float],
    w2: list[list[float]], b2: list[float],
) -> tuple[list[float], list[float]]:
    """Decoder: latent z → hidden (ReLU) → reconstructed output."""
    hidden = relu(add_bias(matrix_multiply(w1, z), b1))
    output = add_bias(matrix_multiply(w2, hidden), b2)
    return hidden, output`
    },
    {
        id: "nm-vae-015",
        type: "markdown",
        content: `## ELBO Loss

$$\\text{ELBO} = \\text{reconstruction\\_loss} + \\beta \\cdot D_{KL}(q(z|x) \\| p(z))$$

Two terms:
1. **Reconstruction loss** (MSE): how well the decoder reconstructs $x$ from $z$
2. **KL divergence**: how different $q(z|x)$ is from the prior $p(z) = \\mathcal{N}(0, I)$

The KL term regularizes the latent space to be smooth and continuous. Without it, the
encoder would learn arbitrary, discontinuous mappings and the latent space would be useless
for generation because random samples from $\\mathcal{N}(0, 1)$ would decode to garbage.

For diagonal Gaussians, KL has a closed form:
$$D_{KL} = -\\frac{1}{2} \\sum\\left(1 + \\log\\sigma^2 - \\mu^2 - \\sigma^2\\right)$$`
    },
    {
        id: "nm-vae-016",
        type: "code",
        content: `def compute_loss(
    x: list[float], mean: list[float], log_var: list[float],
    x_recon: list[float], beta: float,
) -> tuple[float, float, float]:
    """Compute the ELBO loss."""
    # Reconstruction loss: MSE
    reconstruction_loss = sum((x[i] - x_recon[i]) ** 2 for i in range(len(x)))

    # KL divergence (closed form for diagonal Gaussians)
    kl_loss = 0.0
    for i in range(len(mean)):
        clamped_lv = max(min(log_var[i], 5.0), -5.0)  # clamp for numerical stability
        kl_loss += 1.0 + clamped_lv - mean[i] ** 2 - math.exp(clamped_lv)
    kl_loss = -0.5 * kl_loss

    total_loss = reconstruction_loss + beta * kl_loss
    return total_loss, reconstruction_loss, kl_loss`
    },
    {
        id: "nm-vae-017",
        type: "markdown",
        content: `## Manual Gradient Computation and Adam Update

Full gradient flow from reconstruction loss and KL divergence back through the decoder,
reparameterization, and encoder. The reparameterization trick gradient is the key insight.`
    },
    {
        id: "nm-vae-018",
        type: "code",
        content: `def backward_and_update(
    x, mean, log_var, z, x_recon, enc_hidden, dec_hidden,
    enc_w1, enc_b1, enc_w_mean, enc_b_mean, enc_w_logvar, enc_b_logvar,
    dec_w1, dec_b1, dec_w2, dec_b2,
    m_enc_w1, v_enc_w1, m_enc_b1, v_enc_b1,
    m_enc_w_mean, v_enc_w_mean, m_enc_b_mean, v_enc_b_mean,
    m_enc_w_logvar, v_enc_w_logvar, m_enc_b_logvar, v_enc_b_logvar,
    m_dec_w1, v_dec_w1, m_dec_b1, v_dec_b1,
    m_dec_w2, v_dec_w2, m_dec_b2, v_dec_b2,
    lr, beta,
):
    """Compute gradients and update parameters using Adam."""
    # Gradient of reconstruction loss w.r.t. output
    grad_recon = [2.0 * (x_recon[i] - x[i]) for i in range(len(x))]

    # Backprop through decoder output layer
    grad_dec_b2 = grad_recon[:]
    grad_dec_w2 = [[grad_recon[i] * dec_hidden[j] for j in range(len(dec_hidden))]
                   for i in range(len(grad_recon))]
    grad_dec_hidden = [sum(dec_w2[i][j] * grad_recon[i] for i in range(len(grad_recon)))
                       for j in range(len(dec_hidden))]

    # Backprop through decoder ReLU
    grad_dec_hidden = [grad_dec_hidden[i] * relu_grad([dec_hidden[i]])[0]
                       for i in range(len(grad_dec_hidden))]
    grad_dec_b1 = grad_dec_hidden[:]
    grad_dec_w1 = [[grad_dec_hidden[i] * z[j] for j in range(len(z))]
                   for i in range(len(grad_dec_hidden))]
    grad_z_recon = [sum(dec_w1[i][j] * grad_dec_hidden[i] for i in range(len(grad_dec_hidden)))
                    for j in range(len(z))]

    # KL gradients
    grad_mean_kl = [beta * mean[i] for i in range(len(mean))]
    grad_logvar_kl = [beta * -0.5 * (1.0 - math.exp(max(min(log_var[i], 5.0), -5.0)))
                      for i in range(len(log_var))]

    # Gradient through reparameterization trick
    epsilon = [(z[i] - mean[i]) / (math.exp(0.5 * log_var[i]) + 1e-10) for i in range(len(z))]
    grad_mean = [grad_z_recon[i] + grad_mean_kl[i] for i in range(len(mean))]
    grad_logvar = [grad_z_recon[i] * 0.5 * math.exp(0.5 * log_var[i]) * epsilon[i] + grad_logvar_kl[i]
                   for i in range(len(log_var))]

    # Backprop through encoder mean head
    grad_enc_b_mean = grad_mean[:]
    grad_enc_w_mean = [[grad_mean[i] * enc_hidden[j] for j in range(len(enc_hidden))]
                       for i in range(len(grad_mean))]
    grad_enc_hidden_mean = [sum(enc_w_mean[i][j] * grad_mean[i] for i in range(len(grad_mean)))
                            for j in range(len(enc_hidden))]

    # Backprop through encoder logvar head
    grad_enc_b_logvar = grad_logvar[:]
    grad_enc_w_logvar = [[grad_logvar[i] * enc_hidden[j] for j in range(len(enc_hidden))]
                         for i in range(len(grad_logvar))]
    grad_enc_hidden_logvar = [sum(enc_w_logvar[i][j] * grad_logvar[i] for i in range(len(grad_logvar)))
                              for j in range(len(enc_hidden))]

    # Combine gradients from both heads
    grad_enc_hidden = [grad_enc_hidden_mean[i] + grad_enc_hidden_logvar[i]
                       for i in range(len(enc_hidden))]

    # Backprop through encoder hidden layer
    grad_enc_hidden = [grad_enc_hidden[i] * relu_grad([enc_hidden[i]])[0]
                       for i in range(len(grad_enc_hidden))]
    grad_enc_b1 = grad_enc_hidden[:]
    grad_enc_w1 = [[grad_enc_hidden[i] * x[j] for j in range(len(x))]
                   for i in range(len(grad_enc_hidden))]

    # Adam update
    beta1, beta2, eps = 0.9, 0.999, 1e-8

    def adam_update(param, grad, m, v):
        for i in range(len(param)):
            if isinstance(param[i], list):
                for j in range(len(param[i])):
                    m[i][j] = beta1 * m[i][j] + (1 - beta1) * grad[i][j]
                    v[i][j] = beta2 * v[i][j] + (1 - beta2) * grad[i][j] ** 2
                    param[i][j] -= lr * m[i][j] / (math.sqrt(v[i][j]) + eps)
            else:
                m[i] = beta1 * m[i] + (1 - beta1) * grad[i]
                v[i] = beta2 * v[i] + (1 - beta2) * grad[i] ** 2
                param[i] -= lr * m[i] / (math.sqrt(v[i]) + eps)

    adam_update(enc_w1, grad_enc_w1, m_enc_w1, v_enc_w1)
    adam_update(enc_b1, grad_enc_b1, m_enc_b1, v_enc_b1)
    adam_update(enc_w_mean, grad_enc_w_mean, m_enc_w_mean, v_enc_w_mean)
    adam_update(enc_b_mean, grad_enc_b_mean, m_enc_b_mean, v_enc_b_mean)
    adam_update(enc_w_logvar, grad_enc_w_logvar, m_enc_w_logvar, v_enc_w_logvar)
    adam_update(enc_b_logvar, grad_enc_b_logvar, m_enc_b_logvar, v_enc_b_logvar)
    adam_update(dec_w1, grad_dec_w1, m_dec_w1, v_dec_w1)
    adam_update(dec_b1, grad_dec_b1, m_dec_b1, v_dec_b1)
    adam_update(dec_w2, grad_dec_w2, m_dec_w2, v_dec_w2)
    adam_update(dec_b2, grad_dec_b2, m_dec_b2, v_dec_b2)`
    },
    {
        id: "nm-vae-019",
        type: "markdown",
        content: `## Initialize Weights and Train`
    },
    {
        id: "nm-vae-020",
        type: "code",
        content: `print("Generating synthetic 2D data (mixture of 4 Gaussians)...")
data = generate_data()
print(f"Generated {len(data)} 2D points\\n")

# Initialize encoder weights
enc_w1 = init_weights(HIDDEN_DIM, 2)
enc_b1 = init_bias(HIDDEN_DIM)
enc_w_mean = init_weights(LATENT_DIM, HIDDEN_DIM)
enc_b_mean = init_bias(LATENT_DIM)
enc_w_logvar = init_weights(LATENT_DIM, HIDDEN_DIM)
enc_b_logvar = init_bias(LATENT_DIM)

# Initialize decoder weights
dec_w1 = init_weights(HIDDEN_DIM, LATENT_DIM)
dec_b1 = init_bias(HIDDEN_DIM)
dec_w2 = init_weights(2, HIDDEN_DIM)
dec_b2 = init_bias(2)

# Initialize Adam moment buffers
def init_moments_like(shape):
    if isinstance(shape[0], list):
        return [[0.0 for _ in range(len(shape[0]))] for _ in range(len(shape))]
    else:
        return [0.0 for _ in range(len(shape))]

m_enc_w1, v_enc_w1 = init_moments_like(enc_w1), init_moments_like(enc_w1)
m_enc_b1, v_enc_b1 = init_moments_like(enc_b1), init_moments_like(enc_b1)
m_enc_w_mean, v_enc_w_mean = init_moments_like(enc_w_mean), init_moments_like(enc_w_mean)
m_enc_b_mean, v_enc_b_mean = init_moments_like(enc_b_mean), init_moments_like(enc_b_mean)
m_enc_w_logvar, v_enc_w_logvar = init_moments_like(enc_w_logvar), init_moments_like(enc_w_logvar)
m_enc_b_logvar, v_enc_b_logvar = init_moments_like(enc_b_logvar), init_moments_like(enc_b_logvar)

m_dec_w1, v_dec_w1 = init_moments_like(dec_w1), init_moments_like(dec_w1)
m_dec_b1, v_dec_b1 = init_moments_like(dec_b1), init_moments_like(dec_b1)
m_dec_w2, v_dec_w2 = init_moments_like(dec_w2), init_moments_like(dec_w2)
m_dec_b2, v_dec_b2 = init_moments_like(dec_b2), init_moments_like(dec_b2)`
    },
    {
        id: "nm-vae-021",
        type: "code",
        content: `print("Training VAE...")
print(f"{'Epoch':<8} {'Total Loss':<12} {'Recon Loss':<12} {'KL Loss':<12}")
print("-" * 48)

for epoch in range(NUM_EPOCHS):
    random.shuffle(data)

    epoch_total_loss = 0.0
    epoch_recon_loss = 0.0
    epoch_kl_loss = 0.0

    for i in range(0, len(data), BATCH_SIZE):
        batch = data[i : i + BATCH_SIZE]

        batch_total_loss = 0.0
        batch_recon_loss = 0.0
        batch_kl_loss = 0.0

        for x in batch:
            enc_hidden, mean, log_var = encoder_forward(
                x, enc_w1, enc_b1, enc_w_mean, enc_b_mean, enc_w_logvar, enc_b_logvar
            )
            z = reparameterize(mean, log_var)
            dec_hidden, x_recon = decoder_forward(z, dec_w1, dec_b1, dec_w2, dec_b2)

            total_loss, recon_loss, kl_loss = compute_loss(x, mean, log_var, x_recon, BETA)

            batch_total_loss += total_loss
            batch_recon_loss += recon_loss
            batch_kl_loss += kl_loss

            backward_and_update(
                x, mean, log_var, z, x_recon, enc_hidden, dec_hidden,
                enc_w1, enc_b1, enc_w_mean, enc_b_mean, enc_w_logvar, enc_b_logvar,
                dec_w1, dec_b1, dec_w2, dec_b2,
                m_enc_w1, v_enc_w1, m_enc_b1, v_enc_b1,
                m_enc_w_mean, v_enc_w_mean, m_enc_b_mean, v_enc_b_mean,
                m_enc_w_logvar, v_enc_w_logvar, m_enc_b_logvar, v_enc_b_logvar,
                m_dec_w1, v_dec_w1, m_dec_b1, v_dec_b1,
                m_dec_w2, v_dec_w2, m_dec_b2, v_dec_b2,
                LEARNING_RATE, BETA,
            )

        batch_total_loss /= len(batch)
        batch_recon_loss /= len(batch)
        batch_kl_loss /= len(batch)

        epoch_total_loss += batch_total_loss
        epoch_recon_loss += batch_recon_loss
        epoch_kl_loss += batch_kl_loss

    num_batches = (len(data) + BATCH_SIZE - 1) // BATCH_SIZE
    epoch_total_loss /= num_batches
    epoch_recon_loss /= num_batches
    epoch_kl_loss /= num_batches

    if (epoch + 1) % 100 == 0 or epoch == 0:
        print(f"{epoch + 1:<8} {epoch_total_loss:<12.4f} {epoch_recon_loss:<12.4f} {epoch_kl_loss:<12.4f}")

print("\\nTraining complete\\n")`
    },
    {
        id: "nm-vae-022",
        type: "markdown",
        content: `## Inference: Latent Space Interpolation

Encode two data points, interpolate in latent space, decode. Smooth interpolation
demonstrates that the latent space is continuous and meaningful.`
    },
    {
        id: "nm-vae-023",
        type: "code",
        content: `print("=" * 60)
print("INFERENCE: Latent Space Interpolation")
print("=" * 60)

# Pick two points from different clusters
point_a = data[0]
point_b = data[200]

_, mean_a, log_var_a = encoder_forward(
    point_a, enc_w1, enc_b1, enc_w_mean, enc_b_mean, enc_w_logvar, enc_b_logvar
)
_, mean_b, log_var_b = encoder_forward(
    point_b, enc_w1, enc_b1, enc_w_mean, enc_b_mean, enc_w_logvar, enc_b_logvar
)

print(f"Point A: {[round(v, 3) for v in point_a]}")
print(f"  → Latent mean: {[round(v, 3) for v in mean_a]}")
print(f"Point B: {[round(v, 3) for v in point_b]}")
print(f"  → Latent mean: {[round(v, 3) for v in mean_b]}\\n")

print("Interpolation (5 steps from A to B):")
for alpha in [0.0, 0.25, 0.5, 0.75, 1.0]:
    z_interp = [mean_a[i] * (1 - alpha) + mean_b[i] * alpha for i in range(LATENT_DIM)]
    _, x_interp = decoder_forward(z_interp, dec_w1, dec_b1, dec_w2, dec_b2)
    print(f"  α={alpha:.2f}: z={[round(v, 3) for v in z_interp]} → x={[round(v, 3) for v in x_interp]}")`
    },
    {
        id: "nm-vae-024",
        type: "markdown",
        content: `## Inference: Prior Sampling (Generation)

Sample $z \\sim \\mathcal{N}(0, 1)$, decode to generate new data points.`
    },
    {
        id: "nm-vae-025",
        type: "code",
        content: `print()
print("=" * 60)
print("INFERENCE: Prior Sampling (Generation)")
print("=" * 60)
print("Sample z ~ N(0,1), decode to generate new data points.\\n")

generated_points = []
for _ in range(10):
    z_sample = [random.gauss(0, 1) for _ in range(LATENT_DIM)]
    _, x_gen = decoder_forward(z_sample, dec_w1, dec_b1, dec_w2, dec_b2)
    generated_points.append(x_gen)

print("10 generated points:")
for i, point in enumerate(generated_points):
    print(f"  {i + 1}. {[round(v, 3) for v in point]}")`
    },
    {
        id: "nm-vae-026",
        type: "markdown",
        content: `## Inference: Reconstruction Quality

Encode training points, decode them, compare original vs reconstructed.`
    },
    {
        id: "nm-vae-027",
        type: "code",
        content: `print()
print("=" * 60)
print("INFERENCE: Reconstruction Quality")
print("=" * 60)
print("Original → Reconstructed (5 samples):")

for i in range(5):
    x_orig = data[i * 100]

    _, mean_r, log_var_r = encoder_forward(
        x_orig, enc_w1, enc_b1, enc_w_mean, enc_b_mean, enc_w_logvar, enc_b_logvar
    )
    z_r = mean_r  # use mean (no sampling) for reconstruction quality check
    _, x_rec = decoder_forward(z_r, dec_w1, dec_b1, dec_w2, dec_b2)

    error = math.sqrt(sum((x_orig[j] - x_rec[j]) ** 2 for j in range(len(x_orig))))
    print(f"  {[round(v, 3) for v in x_orig]} → {[round(v, 3) for v in x_rec]} (error: {error:.4f})")

print()
print("VAE training and inference complete.")`
    },
];
