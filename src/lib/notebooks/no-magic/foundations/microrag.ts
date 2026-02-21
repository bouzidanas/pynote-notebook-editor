import type { CellData } from "../../../store";

// Converted from no-magic/01-foundations/microrag.py
// Original: https://github.com/Mathews-Tom/no-magic
export const microRAGCells: CellData[] = [
    {
        id: "nm-rag-001",
        type: "markdown",
        content: `[← Back to No-Magic Index](?open=no-magic)

<br />
        
# Retrieval-Augmented Generation (RAG)

How **retrieval** augments generation — the simplest system that actually works,
with BM25 search and a character-level MLP in pure Python.

Large language models store facts in their weights (**parametric knowledge**).
This works well until you need up-to-date information, domain-specific data,
or verifiable sources. RAG solves this by adding a **non-parametric** component:
a searchable **knowledge base** of documents that the model can consult at
inference time.

The RAG pipeline has two stages:
1. **Retrieve** — given a query, find the most relevant documents from the
   knowledge base. This notebook uses **BM25**, a term-frequency scoring
   algorithm from information retrieval that balances word frequency with
   document length normalization.
2. **Generate** — concatenate the query with the retrieved documents and feed
   the combined text to a language model. This **context injection** pattern
   lets the generator condition on retrieved facts rather than relying
   solely on memorized weights.

The generator here is a character-level MLP — intentionally minimal to keep
the focus on the retrieval mechanism and the with-vs-without comparison.

**Reference:** \`01-foundations/microrag.py\` — no-magic collection

---`
    },
    {
        id: "nm-rag-002",
        type: "code",
        content: `from __future__ import annotations

import math
import random
import string

random.seed(42)`
    },
    {
        id: "nm-rag-003",
        type: "markdown",
        content: `## Constants`
    },
    {
        id: "nm-rag-004",
        type: "code",
        content: `LEARNING_RATE = 0.01
HIDDEN_DIM = 64
NUM_EPOCHS = 300
TOP_K = 3           # retrieve top 3 documents
BATCH_SIZE = 5

# BM25 hyperparameters (standard IR literature values)
K1 = 1.2   # term frequency saturation
B = 0.75   # document length normalization

CHAR_VOCAB = list(string.ascii_lowercase + " .,")
VOCAB_SIZE = len(CHAR_VOCAB)`
    },
    {
        id: "nm-rag-005",
        type: "markdown",
        content: `## Synthetic Knowledge Base

100 factual paragraphs built from templates + data tables about cities, countries,
populations, and geography. Ensures deterministic, reproducible data without external
downloads.`
    },
    {
        id: "nm-rag-006",
        type: "code",
        content: `def generate_knowledge_base():
    """Generate 100 synthetic docs and 10 test queries with known correct answers."""
    cities = [
        ("Paris", "France", "2.1 million", "Seine"),
        ("London", "United Kingdom", "8.9 million", "Thames"),
        ("Berlin", "Germany", "3.8 million", "Spree"),
        ("Madrid", "Spain", "3.3 million", "Manzanares"),
        ("Rome", "Italy", "2.8 million", "Tiber"),
        ("Tokyo", "Japan", "14 million", "Sumida"),
        ("Beijing", "China", "21 million", "Yongding"),
        ("Delhi", "India", "16 million", "Yamuna"),
        ("Cairo", "Egypt", "9.5 million", "Nile"),
        ("Lagos", "Nigeria", "14 million", "Lagos Lagoon"),
    ]

    mountains = [
        ("Everest", "Nepal", "8849 meters"),
        ("K2", "Pakistan", "8611 meters"),
        ("Kilimanjaro", "Tanzania", "5895 meters"),
        ("Mont Blanc", "France", "4808 meters"),
        ("Denali", "United States", "6190 meters"),
    ]

    documents = []
    for city, country, pop, river in cities:
        doc = (f"{city} is the capital of {country}. "
               f"It has a population of approximately {pop}. "
               f"The {river} river flows through the city.")
        documents.append(doc.lower())

    for mountain, country, height in mountains:
        doc = (f"{mountain} is located in {country}. "
               f"The mountain has a height of {height}. "
               f"It is a popular destination for climbers.")
        documents.append(doc.lower())

    continents = [
        "africa is the second largest continent by area.",
        "asia is the most populous continent in the world.",
        "europe has diverse cultures and languages.",
        "north america includes canada, united states, and mexico.",
        "south america is home to the amazon rainforest.",
    ]
    documents.extend(continents)

    for i in range(80):
        if i % 4 == 0:
            city, country, pop, river = cities[i % len(cities)]
            doc = f"The population of {city} is about {pop}. It is in {country}."
        elif i % 4 == 1:
            mountain, country, height = mountains[i % len(mountains)]
            doc = f"{mountain} stands at {height} in {country}."
        elif i % 4 == 2:
            city, country, pop, river = cities[i % len(cities)]
            doc = f"The {river} river is a major waterway in {city}, {country}."
        else:
            city, country, pop, river = cities[i % len(cities)]
            doc = f"{city} is a major city with population {pop}."
        documents.append(doc.lower())

    test_queries = [
        ("population of paris", 0),
        ("seine river", 0),
        ("tokyo population", 5),
        ("everest height", 10),
        ("capital of germany", 2),
        ("nile river", 8),
        ("kilimanjaro tanzania", 12),
        ("thames river london", 1),
        ("mont blanc france", 13),
        ("beijing china", 6),
    ]

    return documents, test_queries`
    },
    {
        id: "nm-rag-007",
        type: "markdown",
        content: `## Tokenization

Simple word-level tokenization. Production RAG systems use learned subword tokenizers
(BPE, SentencePiece). Word-level is sufficient here for demonstrating retrieval mechanics.`
    },
    {
        id: "nm-rag-008",
        type: "code",
        content: `def tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, split on spaces."""
    words = []
    word = []
    for char in text.lower():
        if char.isalpha() or char.isdigit():
            word.append(char)
        elif word:
            words.append("".join(word))
            word = []
    if word:
        words.append("".join(word))
    return words`
    },
    {
        id: "nm-rag-009",
        type: "markdown",
        content: `## BM25 Index

BM25 improves on TF-IDF with two key insights:
1. **TF saturation:** 10 occurrences isn't 10× more relevant than 1. The formula
   uses (tf · (k₁+1)) / (tf + k₁) which saturates as tf → ∞.
2. **Document length normalization:** long documents aren't inherently more relevant.
   The term (1 − b + b · dl/avgdl) penalizes long docs.

$$\\text{BM25}(q, d) = \\sum_{t \\in q} \\text{IDF}(t) \\cdot \\frac{\\text{tf}(t,d) \\cdot (k_1 + 1)}{\\text{tf}(t,d) + k_1 \\cdot (1 - b + b \\cdot \\frac{|d|}{\\text{avgdl}})}$$`
    },
    {
        id: "nm-rag-010",
        type: "code",
        content: `class BM25Index:
    """BM25 scoring for document retrieval."""

    def __init__(self, documents, k1=K1, b=B):
        self.documents = documents
        self.k1 = k1
        self.b = b
        self.N = len(documents)

        self.doc_tokens = [tokenize(doc) for doc in documents]
        self.doc_lengths = [len(tokens) for tokens in self.doc_tokens]
        self.avgdl = sum(self.doc_lengths) / self.N if self.N > 0 else 0

        # Build inverted index: term → [(doc_id, term_frequency)]
        self.inverted_index = {}
        for doc_id, tokens in enumerate(self.doc_tokens):
            term_counts = {}
            for term in tokens:
                term_counts[term] = term_counts.get(term, 0) + 1
            for term, count in term_counts.items():
                if term not in self.inverted_index:
                    self.inverted_index[term] = []
                self.inverted_index[term].append((doc_id, count))

        # Precompute IDF: log((N - df + 0.5) / (df + 0.5) + 1)
        self.idf = {}
        for term, postings in self.inverted_index.items():
            df = len(postings)
            self.idf[term] = math.log((self.N - df + 0.5) / (df + 0.5) + 1)

    def score(self, query, doc_id):
        """BM25 score for a query against a specific document."""
        query_terms = tokenize(query)
        score = 0.0
        dl = self.doc_lengths[doc_id]
        norm = 1 - self.b + self.b * (dl / self.avgdl)

        doc_term_counts = {}
        for term in self.doc_tokens[doc_id]:
            doc_term_counts[term] = doc_term_counts.get(term, 0) + 1

        for term in query_terms:
            if term not in self.idf:
                continue
            tf = doc_term_counts.get(term, 0)
            if tf == 0:
                continue
            tf_score = (tf * (self.k1 + 1)) / (tf + self.k1 * norm)
            score += self.idf[term] * tf_score

        return score

    def retrieve(self, query, top_k=TOP_K):
        """Retrieve top-k documents ranked by BM25 score."""
        scores = [(doc_id, self.score(query, doc_id)) for doc_id in range(self.N)]
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]`
    },
    {
        id: "nm-rag-011",
        type: "markdown",
        content: `## Character-Level MLP Generator

**Architecture:** input (query_chars + context_chars) → hidden (ReLU) → output (softmax over chars)

The key RAG mechanism: by concatenating retrieved context with the query, the MLP can
condition its predictions on retrieved facts. This is the minimum architecture that
meaningfully demonstrates RAG — the model actually uses retrieved information.

Production RAG uses transformer generators (GPT, LLaMA). We use an MLP to keep the
focus on the retrieval mechanism and context injection pattern.

Note: this MLP uses manual backpropagation (no Value autograd class) for directness.`
    },
    {
        id: "nm-rag-012",
        type: "code",
        content: `def char_to_index(char):
    if char in CHAR_VOCAB:
        return CHAR_VOCAB.index(char)
    return CHAR_VOCAB.index(" ")

def index_to_char(idx):
    return CHAR_VOCAB[idx]

def one_hot(idx, size):
    vec = [0.0] * size
    vec[idx] = 1.0
    return vec


class MLP:
    """Character-level MLP with manual backprop."""

    def __init__(self, input_dim, hidden_dim, output_dim):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim

        scale_1 = (2.0 / input_dim) ** 0.5
        scale_2 = (2.0 / hidden_dim) ** 0.5

        self.W1 = [[random.gauss(0, scale_1) for _ in range(input_dim)]
                   for _ in range(hidden_dim)]
        self.b1 = [0.0] * hidden_dim

        self.W2 = [[random.gauss(0, scale_2) for _ in range(hidden_dim)]
                   for _ in range(output_dim)]
        self.b2 = [0.0] * output_dim

    def forward(self, x):
        """input → hidden (ReLU) → output (softmax)."""
        hidden = []
        for i in range(self.hidden_dim):
            activation = self.b1[i]
            for j in range(self.input_dim):
                activation += self.W1[i][j] * x[j]
            hidden.append(max(0.0, activation))

        logits = []
        for i in range(self.output_dim):
            activation = self.b2[i]
            for j in range(self.hidden_dim):
                activation += self.W2[i][j] * hidden[j]
            logits.append(activation)

        max_logit = max(logits)
        exp_logits = [math.exp(l - max_logit) for l in logits]
        sum_exp = sum(exp_logits)
        probs = [e / sum_exp for e in exp_logits]

        cache = {"x": x, "hidden": hidden, "logits": logits, "probs": probs}
        return probs, cache

    def backward(self, target_idx, cache, learning_rate):
        """Cross-entropy loss + SGD update. Returns loss value."""
        x = cache["x"]
        hidden = cache["hidden"]
        probs = cache["probs"]

        loss = -math.log(max(probs[target_idx], 1e-10))

        # dL/d_logits = p - y (softmax + cross-entropy gradient)
        dlogits = list(probs)
        dlogits[target_idx] -= 1.0

        # Gradients for W2, b2
        dW2 = [[0.0] * self.hidden_dim for _ in range(self.output_dim)]
        db2 = [0.0] * self.output_dim
        for i in range(self.output_dim):
            db2[i] = dlogits[i]
            for j in range(self.hidden_dim):
                dW2[i][j] = dlogits[i] * hidden[j]

        # Backprop through hidden layer (ReLU)
        dhidden = [0.0] * self.hidden_dim
        for j in range(self.hidden_dim):
            for i in range(self.output_dim):
                dhidden[j] += dlogits[i] * self.W2[i][j]
            if hidden[j] <= 0:
                dhidden[j] = 0.0

        # Gradients for W1, b1
        dW1 = [[0.0] * self.input_dim for _ in range(self.hidden_dim)]
        db1 = [0.0] * self.hidden_dim
        for i in range(self.hidden_dim):
            db1[i] = dhidden[i]
            for j in range(self.input_dim):
                dW1[i][j] = dhidden[i] * x[j]

        # SGD update
        for i in range(self.output_dim):
            self.b2[i] -= learning_rate * db2[i]
            for j in range(self.hidden_dim):
                self.W2[i][j] -= learning_rate * dW2[i][j]

        for i in range(self.hidden_dim):
            self.b1[i] -= learning_rate * db1[i]
            for j in range(self.input_dim):
                self.W1[i][j] -= learning_rate * dW1[i][j]

        return loss

    def generate(self, input_text, max_length=50):
        """Generate text character-by-character using query + retrieved context."""
        current_text = input_text
        for _ in range(max_length):
            context = current_text[-100:]
            x = []
            for char in context:
                x.extend(one_hot(char_to_index(char), VOCAB_SIZE))
            while len(x) < self.input_dim:
                x.append(0.0)
            x = x[:self.input_dim]

            probs, _ = self.forward(x)
            next_idx = probs.index(max(probs))
            next_char = index_to_char(next_idx)

            if next_char == ".":
                current_text += next_char
                break
            current_text += next_char

        return current_text`
    },
    {
        id: "nm-rag-013",
        type: "markdown",
        content: `## Training Function

Training process:
1. Sample a random document as ground truth
2. Extract a query from the document (first few words)
3. Retrieve context using BM25
4. Concatenate query + retrieved context
5. Train MLP to predict next character in the ground truth answer`
    },
    {
        id: "nm-rag-014",
        type: "code",
        content: `def train_rag(documents, bm25, mlp, num_epochs, learning_rate):
    """Train the MLP on (query, context, answer) triples. Returns loss history."""
    print("Training RAG model...\\n")
    loss_history = []

    for epoch in range(num_epochs):
        epoch_loss = 0.0
        num_samples = 0

        for _ in range(BATCH_SIZE):
            doc_idx = random.randint(0, len(documents) - 1)
            doc = documents[doc_idx]

            words = tokenize(doc)
            if len(words) < 3:
                continue
            query = " ".join(words[:min(3, len(words))])

            retrieved = bm25.retrieve(query, top_k=TOP_K)
            context = " ".join([documents[doc_id] for doc_id, _ in retrieved[:2]])

            # Core RAG: concatenate query + retrieved context
            input_text = query + " " + context
            target = doc

            for i in range(min(20, len(target))):
                x = []
                for char in input_text[-100:]:
                    x.extend(one_hot(char_to_index(char), VOCAB_SIZE))
                while len(x) < mlp.input_dim:
                    x.append(0.0)
                x = x[:mlp.input_dim]

                target_idx = char_to_index(target[i])
                _, cache = mlp.forward(x)
                loss = mlp.backward(target_idx, cache, learning_rate)
                epoch_loss += loss
                num_samples += 1
                input_text += target[i]

        avg_loss = epoch_loss / num_samples if num_samples > 0 else 0.0
        loss_history.append({"epoch": epoch + 1, "loss": round(avg_loss, 4)})
        if (epoch + 1) % 50 == 0:
            print(f"Epoch {epoch + 1}/{num_epochs}  Loss: {avg_loss:.4f}")

    print()
    return loss_history`
    },
    {
        id: "nm-rag-015",
        type: "markdown",
        content: `## Inference: With vs Without Retrieval

The core RAG value proposition: retrieved context improves generation quality by
providing factual grounding. Without retrieval, the model must rely entirely on its
parametric knowledge (learned weights), which is prone to hallucination on factual queries.`
    },
    {
        id: "nm-rag-016",
        type: "code",
        content: `def demo_retrieval_comparison(queries, documents, bm25, mlp):
    """Compare generation WITH and WITHOUT retrieval."""
    print("=== RETRIEVAL COMPARISON ===\\n")

    for query in queries:
        print(f"Query: '{query}'")

        # WITH retrieval
        retrieved = bm25.retrieve(query, top_k=TOP_K)
        print(f"Retrieved docs (top {TOP_K}):")
        for doc_id, score in retrieved:
            print(f"  [{doc_id}] score={score:.2f}: {documents[doc_id][:60]}...")

        context = " ".join([documents[doc_id] for doc_id, _ in retrieved[:2]])
        generation_with = mlp.generate(query + " " + context, max_length=40)

        # WITHOUT retrieval
        generation_without = mlp.generate(query + " ", max_length=40)

        print(f"WITH retrieval:    {generation_with}")
        print(f"WITHOUT retrieval: {generation_without}")
        print()`
    },
    {
        id: "nm-rag-017",
        type: "markdown",
        content: `## Run: Build Knowledge Base and Index`
    },
    {
        id: "nm-rag-018",
        type: "code",
        content: `print("Generating synthetic knowledge base...")
documents, test_queries = generate_knowledge_base()
print(f"Created {len(documents)} documents\\n")

print("Building BM25 index...")
bm25 = BM25Index(documents, k1=K1, b=B)
print(f"Indexed {bm25.N} documents, {len(bm25.idf)} unique terms")`
    },
    {
        id: "nm-rag-019",
        type: "markdown",
        content: `## Retrieval Accuracy Test`
    },
    {
        id: "nm-rag-020",
        type: "code",
        content: `print("\\n=== RETRIEVAL ACCURACY TEST ===")
correct = 0
for query, expected_doc_idx in test_queries:
    retrieved = bm25.retrieve(query, top_k=1)
    if not retrieved:
        print(f"  MISS: '{query}' -> no results")
        continue

    retrieved_idx = retrieved[0][0]
    retrieved_terms = set(tokenize(documents[retrieved_idx]))
    query_terms = set(tokenize(query))

    query_hits = sum(1 for t in query_terms if t in retrieved_terms)
    if query_hits >= max(len(query_terms) * 0.5, 1):
        correct += 1
        print(f"  HIT:  '{query}' -> [{retrieved_idx}] {documents[retrieved_idx][:50]}...")
    else:
        print(f"  MISS: '{query}' -> [{retrieved_idx}] {documents[retrieved_idx][:50]}...")
accuracy = 100 * correct / len(test_queries)
print(f"Retrieval accuracy: {correct}/{len(test_queries)} = {accuracy:.1f}%")`
    },
    {
        id: "nm-rag-021",
        type: "markdown",
        content: `## Train RAG Model`
    },
    {
        id: "nm-rag-022",
        type: "code",
        content: `input_dim = 100 * VOCAB_SIZE  # 100 characters, one-hot encoded
mlp = MLP(input_dim, HIDDEN_DIM, VOCAB_SIZE)
total_params = (len(mlp.W1) * len(mlp.W1[0]) + len(mlp.b1) +
                len(mlp.W2) * len(mlp.W2[0]) + len(mlp.b2))
print(f"\\nInitialized MLP: {input_dim} -> {HIDDEN_DIM} -> {VOCAB_SIZE}")
print(f"Total parameters: {total_params:,}\\n")

rag_history = train_rag(documents, bm25, mlp, NUM_EPOCHS, LEARNING_RATE)`
    },
    {
        id: "nm-rag-022b",
        type: "markdown",
        content: `## RAG Training Loss

The loss measures how well the MLP predicts the next character given the query
concatenated with retrieved context. Because the knowledge base is small and
the patterns are templated, loss should decrease steadily.`
    },
    {
        id: "nm-rag-022c",
        type: "code",
        content: `import pynote_ui

pynote_ui.oplot.line(
    rag_history,
    x="epoch",
    y="loss",
    stroke="#f97316",
    height=340,
    title="RAG Training Loss"
)`
    },
    {
        id: "nm-rag-023",
        type: "markdown",
        content: `## Demo: With vs Without Retrieval`
    },
    {
        id: "nm-rag-024",
        type: "code",
        content: `demo_queries = [
    "population of paris",
    "seine river",
    "everest height",
    "capital of germany",
]
demo_retrieval_comparison(demo_queries, documents, bm25, mlp)
print("RAG demonstration complete.")`
    },
    {
        id: "nm-rag-footer",
        type: "markdown",
        content: `---

[\u2190 Bidirectional Transformer (BERT)](?open=nm_microbert) \u00b7 [Optimizer Comparison \u2192](?open=nm_microoptimizer)`
    },
];
