import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microconv.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microConvCells: CellData[] = [
    {
        id: "nm-conv-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Convolutional Neural Network

How a sliding **kernel** extracts spatial features — and why this single idea
powered computer vision for two decades before transformers arrived.

A **convolution** is a small weight matrix (e.g. 3×3) that slides across the
image one position at a time. At each position it computes a dot product
between its weights and the image patch underneath, producing a single number.
The full grid of these numbers is called a **feature map** — each element
tells you "how strongly does this patch match the kernel's pattern?"

After training, kernels converge to recognizable patterns: horizontal edge
detectors, vertical edge detectors, diagonal detectors, and so on. Stacking
multiple conv layers lets the network compose low-level edges into textures,
textures into parts, parts into objects.

**Weight sharing** is what makes convolution practical. A fully-connected layer
over an 8×8 image would need 64 weights per output neuron. A 3×3 kernel has
only 9 weights, yet it runs at every spatial position — dramatically fewer
parameters and the built-in assumption that a feature can appear anywhere.

**Pooling** downsamples the feature map (e.g. taking the max in each 2×2 window),
which serves two purposes: it reduces dimensions (4× fewer values) and adds
**translation invariance** — if a feature shifts by one pixel within the pool
window, the output is unchanged.

**Reference:** \`01-foundations/microconv.py\` — no-magic collection

---`
    },
    {
        id: "nm-conv-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
import time

random.seed(42)`
    },
    {
        id: "nm-conv-003",
        type: "markdown",
        content: `## Constants

Production CNNs operate on 224×224 images with 64+ kernels per layer and 100+ layers.
This toy scale (8×8, 4 kernels, 1 layer) makes scalar autograd feasible but would be
absurdly slow at real image sizes — tensor libraries parallelize the entire conv operation.`
    },
    {
        id: "nm-conv-004",
        type: "code",
        content: `# Image and dataset
IMAGE_SIZE = 8
NUM_CLASSES = 4           # horizontal, vertical, diagonal, cross
TRAIN_SAMPLES = 100       # per class (browser-tuned; CLI original: 200)
TEST_SAMPLES = 40         # per class
NOISE_PROB = 0.05         # pixel flip probability

# Convolution architecture
KERNEL_SIZE = 3           # 3x3 kernels (standard for edge detection)
NUM_KERNELS = 4           # one feature map per kernel
PADDING = 0
STRIDE = 1
CONV_OUT = IMAGE_SIZE - KERNEL_SIZE + 1  # 8 - 3 + 1 = 6
POOL_SIZE = 2
POOL_OUT = CONV_OUT // POOL_SIZE         # 6 // 2 = 3
FLAT_DIM = NUM_KERNELS * POOL_OUT * POOL_OUT  # 4 * 3 * 3 = 36

# Training
LEARNING_RATE = 0.005
BETA1 = 0.9
BETA2 = 0.999
EPS_ADAM = 1e-8
NUM_EPOCHS = 5            # browser-tuned; CLI original: 12
BATCH_SIZE = 16`
    },
    {
        id: "nm-conv-005",
        type: "markdown",
        content: `## Synthetic Dataset

Binary 8×8 images with four distinct pattern classes. The patterns are chosen so
that learned 3×3 kernels should converge to recognizable edge detectors — horizontal
kernels, vertical kernels, etc. Noise (random pixel flips) makes patterns less trivial.`
    },
    {
        id: "nm-conv-006",
        type: "code",
        content: `def make_horizontal(noise: float = NOISE_PROB) -> list[list[float]]:
    """8x8 image with 2-3 horizontal lines."""
    img = [[0.0] * IMAGE_SIZE for _ in range(IMAGE_SIZE)]
    for r in random.sample(range(IMAGE_SIZE), random.randint(2, 3)):
        for c in range(IMAGE_SIZE):
            img[r][c] = 1.0
    for r in range(IMAGE_SIZE):
        for c in range(IMAGE_SIZE):
            if random.random() < noise:
                img[r][c] = 1.0 - img[r][c]
    return img


def make_vertical(noise: float = NOISE_PROB) -> list[list[float]]:
    """8x8 image with 2-3 vertical lines."""
    img = [[0.0] * IMAGE_SIZE for _ in range(IMAGE_SIZE)]
    for c in random.sample(range(IMAGE_SIZE), random.randint(2, 3)):
        for r in range(IMAGE_SIZE):
            img[r][c] = 1.0
    for r in range(IMAGE_SIZE):
        for c in range(IMAGE_SIZE):
            if random.random() < noise:
                img[r][c] = 1.0 - img[r][c]
    return img


def make_diagonal(noise: float = NOISE_PROB) -> list[list[float]]:
    """8x8 image with a diagonal line (main or anti-diagonal)."""
    img = [[0.0] * IMAGE_SIZE for _ in range(IMAGE_SIZE)]
    offset = random.randint(-1, 1)
    use_anti = random.random() < 0.5
    for i in range(IMAGE_SIZE):
        j = (IMAGE_SIZE - 1 - i + offset) if use_anti else (i + offset)
        for dj in range(2):
            col = j + dj
            if 0 <= col < IMAGE_SIZE:
                img[i][col] = 1.0
    for r in range(IMAGE_SIZE):
        for c in range(IMAGE_SIZE):
            if random.random() < noise:
                img[r][c] = 1.0 - img[r][c]
    return img


def make_cross(noise: float = NOISE_PROB) -> list[list[float]]:
    """8x8 image with a cross (horizontal + vertical line)."""
    img = [[0.0] * IMAGE_SIZE for _ in range(IMAGE_SIZE)]
    center_r = random.randint(1, IMAGE_SIZE - 2)
    center_c = random.randint(1, IMAGE_SIZE - 2)
    for c in range(IMAGE_SIZE):
        img[center_r][c] = 1.0
    for r in range(IMAGE_SIZE):
        img[r][center_c] = 1.0
    for r in range(IMAGE_SIZE):
        for c in range(IMAGE_SIZE):
            if random.random() < noise:
                img[r][c] = 1.0 - img[r][c]
    return img


GENERATORS = [make_horizontal, make_vertical, make_diagonal, make_cross]
CLASS_NAMES = ["horizontal", "vertical", "diagonal", "cross"]


def generate_dataset(samples_per_class: int):
    """Generate a balanced dataset of synthetic images and labels."""
    images = []
    labels = []
    for class_id, gen_fn in enumerate(GENERATORS):
        for _ in range(samples_per_class):
            images.append(gen_fn())
            labels.append(class_id)
    combined = list(zip(images, labels))
    random.shuffle(combined)
    imgs, lbls = zip(*combined)
    return list(imgs), list(lbls)`
    },
    {
        id: "nm-conv-007",
        type: "markdown",
        content: `## Scalar Autograd Engine

Same autograd engine with the addition of \`max_with()\` — the core operation for max pooling.
Unlike \`relu\` (max with 0), this compares two tracked values and routes the gradient
only to whichever was larger. The losing value gets zero gradient, which means pooling
implicitly selects which spatial location matters most for downstream classification.`
    },
    {
        id: "nm-conv-008",
        type: "code",
        content: `class Value:
    """Scalar with reverse-mode automatic differentiation."""
    __slots__ = ('data', 'grad', '_children', '_local_grads')

    def __init__(self, data: float, children: tuple = (), local_grads: tuple = ()):
        self.data = float(data)
        self.grad = 0.0
        self._children = children
        self._local_grads = local_grads

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data + other.data, (self, other), (1.0, 1.0))

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return Value(self.data * other.data, (self, other), (other.data, self.data))

    def __pow__(self, exponent: float):
        return Value(self.data ** exponent, (self,), (exponent * self.data ** (exponent - 1),))

    def __neg__(self):
        return self * -1.0

    def __radd__(self, other):
        return self + other

    def __sub__(self, other):
        return self + (-other)

    def __rsub__(self, other):
        return Value(other) + (-self)

    def __rmul__(self, other):
        return self * other

    def __truediv__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        return self * (other ** -1.0)

    def __rtruediv__(self, other):
        return Value(other) * (self ** -1.0)

    def relu(self):
        return Value(max(0.0, self.data), (self,), (float(self.data > 0),))

    def exp(self):
        e = math.exp(self.data)
        return Value(e, (self,), (e,))

    def log(self):
        return Value(math.log(self.data), (self,), (1.0 / self.data,))

    def max_with(self, other):
        """Differentiable max — gradient flows to the winner only."""
        if self.data >= other.data:
            return Value(self.data, (self, other), (1.0, 0.0))
        return Value(other.data, (self, other), (0.0, 1.0))

    def backward(self):
        """Reverse-mode AD via topological sort + chain rule."""
        topo = []
        visited = set()

        def build_topo(v):
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
        id: "nm-conv-009",
        type: "markdown",
        content: `## Convolution Operations

The fundamental insight of convolution: instead of connecting every input pixel to every
output neuron (fully connected), we slide a small kernel across the image. This enforces
two priors:
1. **Locality** — features are detected from nearby pixels
2. **Weight sharing** — the same detector runs at every spatial location

These priors dramatically reduce parameters and encode the assumption that visual
features can appear anywhere in the image.`
    },
    {
        id: "nm-conv-010",
        type: "code",
        content: `def conv2d(image, kernel, bias):
    """Apply a single 3x3 convolution kernel to an image.

    out[i,j] = Σ_m Σ_n kernel[m,n] * image[i+m, j+n] + bias
    Output shrinks by (kernel_size - 1) per dimension: 8x8 → 6x6.
    """
    h, w, k = len(image), len(image[0]), len(kernel)
    out_h, out_w = h - k + 1, w - k + 1
    output = []

    for i in range(out_h):
        row = []
        for j in range(out_w):
            val = bias
            for m in range(k):
                for n in range(k):
                    val = val + kernel[m][n] * image[i + m][j + n]
            row.append(val)
        output.append(row)
    return output`
    },
    {
        id: "nm-conv-011",
        type: "markdown",
        content: `### Max Pooling

Downsamples a feature map by taking the maximum in each pool window. Serves two purposes:
1. **Dimensionality reduction** — halves spatial dimensions (4× fewer values)
2. **Translation invariance** — if a feature shifts by 1 pixel within the pool window,
   the output is unchanged

Production CNNs often use stride-2 convolutions instead of pooling. Max pooling is
pedagogically clearer and historically foundational (LeNet, AlexNet).`
    },
    {
        id: "nm-conv-012",
        type: "code",
        content: `def max_pool2d(feature_map, pool_size: int = 2):
    """Downsample via max over pool_size × pool_size windows."""
    h, w = len(feature_map), len(feature_map[0])
    out_h, out_w = h // pool_size, w // pool_size
    output = []

    for i in range(out_h):
        row = []
        for j in range(out_w):
            current_max = feature_map[i * pool_size][j * pool_size]
            for m in range(pool_size):
                for n in range(pool_size):
                    if m == 0 and n == 0:
                        continue
                    current_max = current_max.max_with(
                        feature_map[i * pool_size + m][j * pool_size + n]
                    )
            row.append(current_max)
        output.append(row)
    return output`
    },
    {
        id: "nm-conv-013",
        type: "markdown",
        content: `## Model Definition

**Architecture:** Input(8×8) → Conv(4 kernels, 3×3) → ReLU → MaxPool(2×2) → Flatten → Linear → Softmax

One conv layer with 4 kernels extracts spatial features (edges, lines), ReLU introduces
nonlinearity, max pooling reduces spatial dimensions and adds translation invariance, and
a linear layer maps flattened features to class logits.

Real CNNs (VGG, ResNet) stack many conv layers with increasing kernel counts (64 → 128 → 256 → 512).
Each layer captures increasingly abstract features: edges → textures → parts → objects.
Our single layer can only capture low-level edge patterns — enough for synthetic line detection.`
    },
    {
        id: "nm-conv-014",
        type: "code",
        content: `def init_parameters() -> dict:
    """Initialize conv kernels, biases, and linear layer."""
    params = {}

    # Kaiming initialization: std = sqrt(2/fan_in) for ReLU networks
    kernel_std = math.sqrt(2.0 / (KERNEL_SIZE * KERNEL_SIZE))

    for k in range(NUM_KERNELS):
        params[f'conv_kernel_{k}'] = [
            [Value(random.gauss(0, kernel_std)) for _ in range(KERNEL_SIZE)]
            for _ in range(KERNEL_SIZE)
        ]
        params[f'conv_bias_{k}'] = Value(0.0)

    linear_std = math.sqrt(2.0 / FLAT_DIM)
    params['linear_w'] = [
        [Value(random.gauss(0, linear_std)) for _ in range(FLAT_DIM)]
        for _ in range(NUM_CLASSES)
    ]
    params['linear_b'] = [Value(0.0) for _ in range(NUM_CLASSES)]

    return params


def flatten(feature_maps):
    """Flatten [NUM_KERNELS, POOL_OUT, POOL_OUT] → [FLAT_DIM]."""
    flat = []
    for fmap in feature_maps:
        for row in fmap:
            flat.extend(row)
    return flat


def softmax(logits):
    """Numerically stable softmax."""
    max_val = max(v.data for v in logits)
    exp_vals = [(v - max_val).exp() for v in logits]
    total = sum(exp_vals)
    return [e / total for e in exp_vals]


def safe_log(prob):
    """Clamped log preserving gradient flow."""
    clamped = max(prob.data, 1e-10)
    return Value(math.log(clamped), (prob,), (1.0 / clamped,))`
    },
    {
        id: "nm-conv-015",
        type: "code",
        content: `def forward(image_data, params):
    """Full CNN forward pass: Conv → ReLU → Pool → Flatten → Linear."""
    image = [[Value(pixel) for pixel in row] for row in image_data]

    feature_maps = []
    for k in range(NUM_KERNELS):
        fmap = conv2d(image, params[f'conv_kernel_{k}'], params[f'conv_bias_{k}'])
        fmap = [[val.relu() for val in row] for row in fmap]
        fmap = max_pool2d(fmap, POOL_SIZE)
        feature_maps.append(fmap)

    flat = flatten(feature_maps)

    logits = []
    for c in range(NUM_CLASSES):
        val = params['linear_b'][c]
        for j in range(FLAT_DIM):
            val = val + params['linear_w'][c][j] * flat[j]
        logits.append(val)

    return logits


def compute_loss(logits, target: int):
    """Cross-entropy: -log(softmax(logits)[target])."""
    probs = softmax(logits)
    return -safe_log(probs[target])`
    },
    {
        id: "nm-conv-016",
        type: "markdown",
        content: `## Training`
    },
    {
        id: "nm-conv-017",
        type: "code",
        content: `start_time = time.time()

print("Generating synthetic dataset...")
train_images, train_labels = generate_dataset(TRAIN_SAMPLES)
test_images, test_labels = generate_dataset(TEST_SAMPLES)
print(f"  Training: {len(train_images)} images ({TRAIN_SAMPLES} per class)")
print(f"  Test:     {len(test_images)} images ({TEST_SAMPLES} per class)")

params = init_parameters()

# Collect all trainable parameters
param_list = []
for key in params:
    val = params[key]
    if isinstance(val, Value):
        param_list.append(val)
    elif isinstance(val, list):
        for item in val:
            if isinstance(item, Value):
                param_list.append(item)
            elif isinstance(item, list):
                for v in item:
                    if isinstance(v, Value):
                        param_list.append(v)

print(f"  Parameters: {len(param_list)}")
print(f"  Architecture: Conv({NUM_KERNELS}x{KERNEL_SIZE}x{KERNEL_SIZE}) → ReLU → "
      f"MaxPool({POOL_SIZE}x{POOL_SIZE}) → Linear({FLAT_DIM}→{NUM_CLASSES})")

# Adam optimizer state
m_state = [0.0] * len(param_list)
v_state = [0.0] * len(param_list)
adam_t = 0

print("\\nTraining...")train_stats = []
for epoch in range(NUM_EPOCHS):
    combined = list(zip(train_images, train_labels))
    random.shuffle(combined)
    shuffled_images = [c[0] for c in combined]
    shuffled_labels = [c[1] for c in combined]

    epoch_loss = 0.0
    epoch_correct = 0

    for batch_start in range(0, len(shuffled_images) - BATCH_SIZE + 1, BATCH_SIZE):
        adam_t += 1
        batch_loss_val = 0.0

        for i in range(BATCH_SIZE):
            idx = batch_start + i
            logits = forward(shuffled_images[idx], params)
            loss = compute_loss(logits, shuffled_labels[idx])
            loss.backward()
            batch_loss_val += loss.data

            predicted = max(range(NUM_CLASSES), key=lambda c: logits[c].data)
            if predicted == shuffled_labels[idx]:
                epoch_correct += 1

        epoch_loss += batch_loss_val
        lr_t = LEARNING_RATE * (1.0 - epoch / NUM_EPOCHS)

        for i, p in enumerate(param_list):
            g = p.grad / BATCH_SIZE
            m_state[i] = BETA1 * m_state[i] + (1.0 - BETA1) * g
            v_state[i] = BETA2 * v_state[i] + (1.0 - BETA2) * g * g
            m_hat = m_state[i] / (1.0 - BETA1 ** adam_t)
            v_hat = v_state[i] / (1.0 - BETA2 ** adam_t)
            p.data -= lr_t * m_hat / (math.sqrt(v_hat) + EPS_ADAM)
            p.grad = 0.0

    avg_loss = epoch_loss / len(shuffled_images)
    accuracy = epoch_correct / len(shuffled_images) * 100
    elapsed = time.time() - start_time
    print(f"  epoch {epoch + 1:>2}/{NUM_EPOCHS} | loss: {avg_loss:.4f} | "
          f"train acc: {accuracy:.1f}% | time: {elapsed:.1f}s")
    train_stats.append({"epoch": epoch + 1, "loss": round(avg_loss, 4), "accuracy": round(accuracy, 1)})

print(f"\\nTraining complete ({time.time() - start_time:.1f}s)")`
    },
    {
        id: "nm-conv-017b",
        type: "markdown",
        content: `## Training Curves

Loss decreases as the kernels learn to distinguish line patterns, while accuracy
climbs as each kernel converges toward an edge detector matching its assigned class.`
    },
    {
        id: "nm-conv-017c",
        type: "code",
        content: `import pynote_ui

pynote_ui.oplot.line(
    train_stats,
    x="epoch",
    y="loss",
    stroke="#10b981",
    height=300,
    title="Training Loss per Epoch"
)`
    },
    {
        id: "nm-conv-017d",
        type: "code",
        content: `pynote_ui.oplot.line(
    train_stats,
    x="epoch",
    y="accuracy",
    stroke="#3b82f6",
    height=300,
    title="Training Accuracy (%) per Epoch"
)`
    },
    {
        id: "nm-conv-018",
        type: "markdown",
        content: `## Kernel Visualization

After training, kernels should visually resemble edge detectors: horizontal kernels show
strong horizontal gradients, vertical kernels show vertical gradients, etc. The kernel
weights determine what spatial pattern each feature map responds to — this is the
"learned representation."`
    },
    {
        id: "nm-conv-019",
        type: "code",
        content: `print("\\nLearned kernels (ASCII visualization):")
print("  Darker = more negative, lighter = more positive\\n")

ascii_chars = " .:-=+*#%@"

for k in range(NUM_KERNELS):
    kernel = params[f'conv_kernel_{k}']
    weights = [kernel[m][n].data for m in range(KERNEL_SIZE) for n in range(KERNEL_SIZE)]
    w_min, w_max = min(weights), max(weights)
    w_range = w_max - w_min if w_max > w_min else 1.0

    print(f"  Kernel {k} (bias={params[f'conv_bias_{k}'].data:+.3f}):")
    for m in range(KERNEL_SIZE):
        row_str = "    "
        for n in range(KERNEL_SIZE):
            normalized = (kernel[m][n].data - w_min) / w_range
            char_idx = min(int(normalized * (len(ascii_chars) - 1)), len(ascii_chars) - 1)
            row_str += ascii_chars[char_idx] * 3 + " "
        raw = " ".join(f"{kernel[m][n].data:+.2f}" for n in range(KERNEL_SIZE))
        row_str += f"  [{raw}]"
        print(row_str)
    print()`
    },
    {
        id: "nm-conv-020",
        type: "markdown",
        content: `## Evaluation and Results`
    },
    {
        id: "nm-conv-021",
        type: "code",
        content: `print("Evaluating on test set...\\n")

correct = 0
class_correct = [0] * NUM_CLASSES
class_total = [0] * NUM_CLASSES
confusion = [[0] * NUM_CLASSES for _ in range(NUM_CLASSES)]

for img, label in zip(test_images, test_labels):
    logits = forward(img, params)
    predicted = max(range(NUM_CLASSES), key=lambda c: logits[c].data)
    if predicted == label:
        correct += 1
        class_correct[label] += 1
    class_total[label] += 1
    confusion[label][predicted] += 1

total = len(test_images)
print(f"Test accuracy: {correct}/{total} ({correct / total * 100:.1f}%)\\n")

print("Per-class accuracy:")
for c in range(NUM_CLASSES):
    acc = class_correct[c] / class_total[c] * 100 if class_total[c] > 0 else 0
    print(f"  {CLASS_NAMES[c]:>12}: {class_correct[c]}/{class_total[c]} ({acc:.1f}%)")

print("\\nConfusion matrix (rows=true, cols=predicted):")
header = "             " + "".join(f"{CLASS_NAMES[c]:>12}" for c in range(NUM_CLASSES))
print(header)
for r in range(NUM_CLASSES):
    row_str = f"  {CLASS_NAMES[r]:>10}"
    for c in range(NUM_CLASSES):
        row_str += f"{confusion[r][c]:>12}"
    print(row_str)

print("\\nSample predictions:")
for i in range(min(8, len(test_images))):
    logits = forward(test_images[i], params)
    probs = softmax(logits)
    predicted = max(range(NUM_CLASSES), key=lambda c: logits[c].data)
    prob_str = ", ".join(f"{CLASS_NAMES[c]}:{probs[c].data:.2f}" for c in range(NUM_CLASSES))
    status = "OK" if predicted == test_labels[i] else "WRONG"
    print(f"  [{status:>5}] true={CLASS_NAMES[test_labels[i]]:>10}, "
          f"pred={CLASS_NAMES[predicted]:>10} | {prob_str}")

print(f"\\nTotal runtime: {time.time() - start_time:.1f}s")`
    },
    {
        id: "nm-conv-021b",
        type: "markdown",
        content: `### Per-Class Accuracy

The bar chart below shows how well the CNN distinguishes each pattern type.
Diagonal and cross patterns are often harder because they share spatial
characteristics with horizontal and vertical lines.`
    },
    {
        id: "nm-conv-021c",
        type: "code",
        content: `acc_data = []
for c in range(NUM_CLASSES):
    acc = class_correct[c] / class_total[c] * 100 if class_total[c] > 0 else 0
    acc_data.append({"class": CLASS_NAMES[c], "accuracy": round(acc, 1)})

pynote_ui.oplot.bar(
    acc_data,
    x="class",
    y="accuracy",
    fill="#6366f1",
    height=300,
    title="Per-Class Test Accuracy (%)"
)`
    },
    {
        id: "nm-conv-footer",
        type: "markdown",
        content: `---

[\u2190 Vanilla RNN vs. GRU](?open=nm_micrornn) \u00b7 [Bidirectional Transformer (BERT) \u2192](?open=nm_microbert)`
    },
];
