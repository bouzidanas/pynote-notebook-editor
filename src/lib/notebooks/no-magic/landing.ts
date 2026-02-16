import type { CellData } from "../../store";

// No-Magic landing page — adapted from https://github.com/Mathews-Tom/no-magic
export const noMagicLandingCells: CellData[] = [
    {
        id: "nm-landing-header",
        type: "markdown",
        content: `# \`no-magic\` notebooks

These notebooks are adapted from [**no-magic**](https://github.com/Mathews-Tom/no-magic), an open-source project by [**Mathews Tom**](https://github.com/Mathews-Tom). \`no-magic\` is a curated collection of dependency-free Python implementations of the algorithms that power modern AI.

Each original script is a standalone \`.py\` file that trains a model from scratch and performs inference using nothing but Python's standard library. We converted them into interactive notebooks to make them easier to read and process, experiment with, and learn from.

---

## What we changed

- **Format**: Converted from standalone Python scripts into notebook cells with markdown explanations.
- **Data loading**: Replaced \`urllib\` file downloads with Pyodide-compatible \`open_url()\` for in-browser execution.
- **Training iterations**: Reduced iteration counts on the heaviest notebooks so they complete in a reasonable time in the browser (original values noted in comments).
- **Code**: All algorithms, architectures, and training logic are preserved exactly as the original author wrote them.

## Original philosophy (from no-magic)

- **One script, one algorithm.** Every notebook is completely self-contained.
- **Zero external dependencies.** Only Python's standard library.
- **Train and infer.** Every notebook includes both the learning loop and generation/prediction.
- **Comments are mandatory, not decorative.** Every notebook is a guided walkthrough of the algorithm.

---`
    },
    {
        id: "nm-landing-foundations",
        type: "markdown",
        content: `## 01 — Foundations (11 notebooks)

Core algorithms that form the building blocks of modern AI systems.

| Notebook | Algorithm | Description |
|----------|-----------|-------------|
| **[Tokenizer](?open=nm_microtokenizer)** | Byte-Pair Encoding (BPE) | How text becomes numbers |
| **[Embedding](?open=nm_microembedding)** | Contrastive Learning (InfoNCE) | How meaning becomes geometry |
| **[GPT](?open=nm_microgpt)** | Autoregressive Transformer | How sequences become predictions |
| **[RNN](?open=nm_micrornn)** | Vanilla RNN vs. GRU | How sequences were modeled before attention |
| **[CNN](?open=nm_microconv)** | Convolutional Neural Network | How spatial features get extracted by sliding kernels |
| **[BERT](?open=nm_microbert)** | Bidirectional Transformer Encoder | How bidirectional context differs from autoregressive |
| **[RAG](?open=nm_microrag)** | Retrieval-Augmented Generation | How retrieval augments generation |
| **[Optimizer](?open=nm_microoptimizer)** | SGD vs. Momentum vs. RMSProp vs. Adam | How optimizer choice shapes convergence |
| **[GAN](?open=nm_microgan)** | Generative Adversarial Network | How two networks learn by competing |
| **[Diffusion](?open=nm_microdiffusion)** | Denoising Diffusion | How data emerges from noise |
| **[VAE](?open=nm_microvae)** | Variational Autoencoder | How to learn compressed generative representations |`
    },
    {
        id: "nm-landing-alignment",
        type: "markdown",
        content: `## 02 — Alignment & Training Techniques (9 notebooks)

Methods for steering, fine-tuning, and aligning models after pretraining.

| Notebook | Algorithm | Description |
|----------|-----------|-------------|
| **Batch Normalization** | Batch Normalization | How normalizing activations stabilizes training |
| **Dropout** | Dropout & Regularization | How regularization prevents overfitting |
| **LoRA** | Low-Rank Adaptation | How fine-tuning works efficiently |
| **QLoRA** | Quantized LoRA | How quantization combines with LoRA for memory efficiency |
| **REINFORCE** | Vanilla Policy Gradient | How policy gradients turn rewards into learning signals |
| **DPO** | Direct Preference Optimization | How preference alignment works without a reward model |
| **PPO** | Proximal Policy Optimization | How RLHF works (the full reward → policy loop) |
| **GRPO** | Group Relative Policy Optimization | How DeepSeek simplified RLHF |
| **MoE** | Mixture of Experts | How sparse routing scales model capacity |

*Coming soon*`
    },
    {
        id: "nm-landing-systems",
        type: "markdown",
        content: `## 03 — Systems & Inference (10 notebooks)

The engineering that makes models fast, small, and deployable.

| Notebook | Algorithm | Description |
|----------|-----------|-------------|
| **RoPE** | Rotary Position Embedding | How position gets encoded through rotation matrices |
| **Attention** | Attention Variants | How attention actually works (MHA, GQA, MQA) |
| **KV-Cache** | KV-Cache Mechanics | Why LLM inference is memory-bound |
| **PagedAttention** | PagedAttention | How vLLM manages KV-cache memory with paging |
| **Flash Attention** | Flash Attention Simulation | How attention gets fast (tiling + online softmax) |
| **Checkpointing** | Activation Checkpointing | How to train deeper models by recomputing activations |
| **Parallelism** | Tensor & Pipeline Parallelism | How models get split across devices |
| **Quantization** | Weight Quantization | How models get compressed (INT8/INT4) |
| **SSM** | State Space Models | How Mamba models bypass attention entirely |
| **Beam Search** | Decoding Strategies | How decoding strategies shape output quality |

*Coming soon*

---

All notebook content is derived from [**no-magic**](https://github.com/Mathews-Tom/no-magic) by [**Mathews Tom**](https://github.com/Mathews-Tom), licensed under the [MIT License](https://github.com/Mathews-Tom/no-magic/blob/main/LICENSE). Star the repo if you find it useful!`
    }
];
