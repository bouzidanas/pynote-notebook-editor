# Counting words

This short tutorial counts the words in a sentence with nothing but the standard library. It runs in *hybrid mode*, where cells run in the order you run them, so a later cell may redefine a name an earlier cell created; the `.py` export then keeps the notebook's order, because reordering would change what each name means.

See the [collections documentation](https://docs.python.org/3/library/collections.html#collections.Counter "Counter") for more, and the picture below for the idea:

![word cloud](attachment:cloud.png)

<details>
<summary>Why not a regular expression?</summary>

Splitting on whitespace is enough for this sentence, and it keeps the example readable.

</details>

```python
text = "the quick brown fox jumps over the lazy dog and the end"
words = text.split()
print(len(words), "words")
```

## Plan

> Count first, filter later: the counts tell you which words are worth filtering out, and a filter written before looking at the data usually filters the wrong things.

- [x] Split the sentence into words
- [ ] Count each word
  - with a `Counter`
  - or with a plain `dict`, which takes a few more lines:

    ```python
    counts = {}
    for w in words:
        counts[w] = counts.get(w, 0) + 1
    ```
- [ ] Drop the most common word

```python
from collections import Counter

counts = Counter(words)
print(counts.most_common(3))
```

```python
words = [w for w in words if w != "the"]
print(" ".join(words))
```

```latex
\begin{equation}
  f(w) = \frac{\operatorname{count}(w)}{N}
\end{equation}
```

````python
fence = "```"
print(f"Markdown code blocks start with {fence}")
````

```python
```

```python
def shout(s):
	return s.upper() + "!"


print(shout("done"))

```

## Summary

| Step | Tool | Lines |
|---|:---:|---:|
| Split | `str.split` | 1 |
| Count | `Counter` | 1 |
| Filter | list comprehension | 1 |
| Résumé | ✏️ | 0 |

That is all: three lines of real work.
