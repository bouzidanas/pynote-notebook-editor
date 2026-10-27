# ---
# pynote:
#   executionMode: hybrid
# # This is the code half of a notebook whose prose is in tutorial-hybrid.md.
# ---

# %% id="sentence"
text = "the quick brown fox jumps over the lazy dog and the end"
words = text.split()
print(len(words), "words")

# %% id="count"
from collections import Counter

counts = Counter(words)
print(counts.most_common(3))

# %% id="filter"
words = [w for w in words if w != "the"]
print(" ".join(words))

# %% id="fences"
fence = "```"
print(f"Markdown code blocks start with {fence}")

# %% id="scratch"

# %% id="shout"
def shout(s):
	return s.upper() + "!"


print(shout("done"))
