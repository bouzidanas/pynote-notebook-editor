import type { CellData } from "../../store";

// Coding Interview Prep - Section 1: Basic Python & Scripting
export const codingPrepSection1Cells: CellData[] = [
    {
        id: "cp1-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)

# Section 1: Basic Python & Scripting

*Part 1 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp1-helper",
        type: "code",
        content: `# Test runner helper (autorun)
from pynote_ui import Button, Group, Text
from pynote_ui.oplot import Plot
import time, copy, statistics

def _time_one(fn, args):
    """Measure one call's wall time in milliseconds.

    If a single call is faster than ~5 ms (i.e. dominated by clock noise),
    auto-loop the call and return the average. Args are deep-copied so
    in-place mutations don't poison subsequent calls. We pre-copy outside
    the timing window so deepcopy time is excluded from the measurement.
    """
    a = copy.deepcopy(args)
    t0 = time.perf_counter()
    try:
        fn(*a)
    except Exception:
        return None
    elapsed = time.perf_counter() - t0
    if elapsed <= 0:
        elapsed = 1e-9
    if elapsed < 0.005:
        # Aim for ~50 ms total wall time, capped to a sensible loop count
        target_total = 0.05
        repeats = max(2, min(int(target_total / elapsed), 5000))
        copies = [copy.deepcopy(args) for _ in range(repeats)]
        t0 = time.perf_counter()
        for ai in copies:
            try:
                fn(*ai)
            except Exception:
                return None
        total = time.perf_counter() - t0
        return (total / repeats) * 1000.0
    return elapsed * 1000.0


def _check_solution(func_name, cases=None, edge_cases=None,
                    fast_impl=None, slow_impl=None, perf_inputs=None,
                    setup=None, custom_test=None,
                    pre_run=None,
                    size_gen=None, sizes=None):
    """Build a Check Solution button bound to test specs.

    func_name: name of function (or class) looked up in globals()
    cases: list of (args_tuple, expected, label) — main correctness tests
    edge_cases: list of (args_tuple, expected, label) — edge cases
    fast_impl, slow_impl: callables for benchmark comparison
    perf_inputs: list of args tuples used for fixed-input benchmark bar chart
    setup: callable run before tests (e.g., to populate filesystem)
    custom_test: callable(func) -> (pass_count, fail_count, rows)
    pre_run: callable(func, args) -> args — transform args before each call
    size_gen: callable(n: int) -> args_tuple — produces an input of size n
              for the Big-O complexity scan
    sizes: list of int sizes to feed into size_gen for the complexity plot
    """
    cases = cases or []
    edge_cases = edge_cases or []

    initial = [Text(content="Click to verify your solution.",
                    color="info", border="info", size="sm")]
    results = Group(initial, border=False, background=False)

    def run(_=None):
        kids = []
        try:
            if setup:
                setup()
        except Exception as e:
            results.send_update(children=[
                Text(content="Setup failed: " + str(e),
                     color="error", border="error").to_json()
            ])
            return

        if func_name not in globals():
            results.send_update(children=[
                Text(content="Run the exercise cell above first to define \`" + func_name + "\`",
                     color="warning", border="warning").to_json()
            ])
            return

        func = globals()[func_name]
        passed, failed = 0, 0
        rows = []
        all_cases = [(c, "main") for c in cases] + [(c, "edge") for c in edge_cases]

        for case, kind in all_cases:
            args, expected, label = case
            try:
                fresh = copy.deepcopy(args)
                actual = func(*fresh)
                if actual == expected:
                    passed += 1
                    rows.append(("pass", kind, label, ""))
                else:
                    failed += 1
                    rows.append(("fail", kind, label,
                                 "expected " + repr(expected) + ", got " + repr(actual)))
            except Exception as e:
                failed += 1
                rows.append(("fail", kind, label,
                             "raised " + type(e).__name__ + ": " + str(e)))

        if custom_test:
            try:
                p, f, extra = custom_test(func)
                passed += p
                failed += f
                rows.extend(extra)
            except Exception as e:
                failed += 1
                rows.append(("fail", "custom", "custom test", "crashed: " + str(e)))

        total = passed + failed
        if total == 0:
            head_color = "info"
            head_label = "No tests defined"
        elif failed == 0:
            head_color = "success"
            head_label = "All " + str(total) + " tests passed!"
        elif passed == 0:
            head_color = "error"
            head_label = str(failed) + "/" + str(total) + " tests failed"
        else:
            head_color = "warning"
            head_label = str(passed) + "/" + str(total) + " tests passed"

        kids.append(Text(content=head_label, color=head_color, border=head_color, size="lg"))
        for status, kind, label, detail in rows:
            icon = "PASS" if status == "pass" else "FAIL"
            color = "success" if status == "pass" else "error"
            tag = "" if kind == "main" else " [" + kind + "]"
            txt = "[" + icon + "] " + label + tag
            if detail:
                txt += " - " + detail
            kids.append(Text(content=txt, color=color, border=color, size="sm"))

        # Benchmark only when correctness passes
        if perf_inputs and fast_impl and slow_impl and failed == 0:
            def _bench(f, inputs):
                times = []
                for args in inputs:
                    t = _time_one(f, args)
                    if t is None:
                        return None
                    times.append(t)
                return statistics.mean(times) if times else None
            try:
                u = _bench(func, perf_inputs)
                ff = _bench(fast_impl, perf_inputs)
                ss = _bench(slow_impl, perf_inputs)
                if u is not None and ff is not None and ss is not None:
                    bench_data = [
                        {"impl": "Fast ref", "ms": round(ff, 4)},
                        {"impl": "Yours",    "ms": round(u, 4)},
                        {"impl": "Slow ref", "ms": round(ss, 4)},
                    ]
                    kids.append(Text(content="Performance benchmark (average over " + str(len(perf_inputs)) + " inputs)",
                                     color="info", border="info", size="sm"))
                    kids.append(Plot(bench_data, x="impl", y="ms", mark="barY",
                                     fill="impl",
                                     title="Execution time (ms, lower is better)",
                                     height=200))
                    if u <= ff * 1.5:
                        v_color = "success"
                        v_text = "Your solution matches the fast reference"
                    elif u <= ss * 0.5:
                        v_color = "warning"
                        v_text = "Faster than slow ref, but slower than fast ref - consider optimizing"
                    else:
                        v_color = "error"
                        v_text = "Comparable to the slow reference - try to optimize for better performance"
                    kids.append(Text(content=v_text, color=v_color, border=v_color, size="sm"))
            except Exception as e:
                kids.append(Text(content="Benchmark skipped: " + str(e), color="info", border="info", size="sm"))

        # Big-O complexity scan: time vs input size
        if size_gen and sizes and fast_impl and slow_impl and failed == 0:
            try:
                series = []
                for n in sizes:
                    args = size_gen(n)
                    tu = _time_one(func, args)
                    tf = _time_one(fast_impl, args)
                    ts = _time_one(slow_impl, args)
                    if tu is not None:
                        series.append({"n": n, "ms": round(tu, 4), "impl": "Yours"})
                    if tf is not None:
                        series.append({"n": n, "ms": round(tf, 4), "impl": "Fast ref"})
                    if ts is not None:
                        series.append({"n": n, "ms": round(ts, 4), "impl": "Slow ref"})
                if series:
                    kids.append(Text(
                        content="Big-O scaling: time vs input size n",
                        color="info", border="info", size="sm"))
                    kids.append(Plot(
                        series,
                        x="n", y="ms",
                        mark="line",
                        z="impl", stroke="impl",
                        marker="dot",
                        title="Execution time vs input size (lower is better, slope = complexity class)",
                        x_label="input size n",
                        y_label="time (ms)",
                        height=240,
                    ))
            except Exception as e:
                kids.append(Text(content="Complexity scan skipped: " + str(e),
                                 color="info", border="info", size="sm"))

        results.send_update(children=[k.to_json() for k in kids])

    btn = Button(label="Check Solution", color="primary", style="soft")
    btn.on_update(run)
    return Group([btn, results], layout="col", border=False, background=False)
`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false, showStdout: false },
                autorun: true,
                placeholder: "Test runner helper - autoruns silently"
            }
        },
    },
    {
        id: "cp1-c1",
        type: "markdown",
        content: `## 1.1 Strings, Lists & Tuples

**Concept Overview**:

**1. Mutability vs. Immutability**
In Python, every variable is a reference to an object in memory. 
- **Mutable objects** (Lists, Dictionaries, Sets) can be changed after creation *in-place*. Modifying the object does not change its memory address.

- **Immutable objects** (Strings, Tuples, Integers) cannot be changed after creation. Any "modification" actually creates a brand-new object in memory and updates the variable reference.


<details>
<summary><i>Complete list of mutable vs immutable types</i></summary>

| Mutable | Immutable |
|---------|-----------|
| \`list\` | \`str\` |
| \`dict\` | \`tuple\` |
| \`set\` | \`int\` |
| \`bytearray\` | \`float\` |
| Custom class instances (default) | \`bool\` |
| | \`complex\` |
| | \`bytes\` |
| | \`frozenset\` |
| | \`NoneType\` |

</details>
  
*Example:*`,
    },
    {
        id: "cp1-c2",
        type: "code",
        content: `s = "Interview"
# s[0] = "i"  # TypeError: 'str' object does not support item assignment
s = "i" + s[1:]  # Creates a new string entirely!
print(s)  # 'interview' (new string, not in-place)`,
    },
    {
        id: "cp1-c3",
        type: "markdown",
        content: `**2. List Comprehensions**
A list comprehension is a concise and highly optimized way to construct lists. It operates under the hood in C, making it fundamentally faster than a standard \`for\` loop combined with \`.append()\`.
*Syntax*: \`[expression for item in iterable if condition]\`
*Example:*`,
    },
    {
        id: "cp1-c4",
        type: "code",
        content: `# Create a list of the squares of even numbers from 0 to 9
squares = [x**2 for x in range(10) if x % 2 == 0]
print(squares)  # [0, 4, 16, 36, 64]`,
    },
    {
        id: "cp1-c5",
        type: "markdown",
        content: `**3. Generators vs list comprehensions**
While a list comprehension generates the *entire sequence* and loads it into memory eagerly, a **generator expression** evaluates *lazily*. It suspends its state and yields one item at a time only when requested. This is crucial when dealing with massive datasets (e.g., millions of records) to prevent Out-Of-Memory (OOM) errors. Generator comprehensions use parentheses \`()\`.
*Example:*`,
    },
    {
        id: "cp1-c6",
        type: "code",
        content: `import sys
# Eager: Generates 1,000,000 numbers in memory right now.
list_comp = [x for x in range(1000000)]
print(sys.getsizeof(list_comp)) # Output: ~8 MB

# Lazy: Generates values strictly on-demand.
gen_comp = (x for x in range(1000000))
print(sys.getsizeof(gen_comp)) # Output: ~104 Bytes!

print(next(gen_comp)) # 0
print(next(gen_comp)) # 1`,
    },
    {
        id: "cp1-c7",
        type: "markdown",
        content: `**4. Tuples & Slicing**
Tuples are generally used for fixed-size configurations or returning multiple variables from a function. Because tuples are immutable, they are *hashable* (assuming their contents are also immutable), which means they can be used as Dictionary Keys!
Slicing \`[start:stop:step]\` creates a shallow copy of a sequence. \`my_array[::-1]\` reverses it!

**Exercise 1 (5-10 min)**: Write a function that takes a list of words and returns a new list containing only the words that have at least \`n\` characters.`,
    },
    {
        id: "cp1-c8",
        type: "code",
        content: `from typing import List

def filter_words(words: List[str], min_length: int) -> List[str]:
    # TODO: Implement
    pass`,
    },
    {
        id: "cp1-c9",
        type: "code",
        content: `from typing import List

def filter_words(words: List[str], min_length: int) -> List[str]:
    # Time: O(n) where n = len(words) | Space: O(k) where k = number of matching words
    return [word for word in words if len(word) >= min_length]`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test1",
        type: "code",
        content: `_check_solution(
    "filter_words",
    cases=[
        (([], 3), [], "empty list returns empty"),
        ((["hello", "world", "a", "bc"], 3), ["hello", "world"], "min_length 3"),
        ((["a", "bb", "ccc", "dddd"], 2), ["bb", "ccc", "dddd"], "min_length 2"),
        ((["python", "is", "fun"], 1), ["python", "is", "fun"], "min_length 1 keeps all"),
    ],
    edge_cases=[
        ((["abc"], 5), [], "single short word"),
        ((["", "a", "abc"], 1), ["a", "abc"], "ignores empty strings"),
        ((["same", "same", "same"], 4), ["same", "same", "same"], "duplicates preserved"),
    ],
    fast_impl=lambda words, n: [w for w in words if len(w) >= n],
    slow_impl=(lambda words, n: [w for w in words if sum(1 for _ in w) >= n]),
    perf_inputs=[
        (["word" + str(i) for i in range(2000)], 5),
        (["x" * (i % 9) for i in range(2000)], 4),
    ],
    size_gen=(lambda n: (["word" + str(i) for i in range(n)], 5)),
    sizes=[100, 500, 1000, 2500, 5000, 10000],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c10",
        type: "markdown",
        content: `**Exercise 2 (5-10 min)**: Write a function that returns the reverse of a given string.`,
    },
    {
        id: "cp1-c11",
        type: "code",
        content: `def reverse_string(s: str) -> str:
    # TODO: Implement
    pass

# Example: reverse_string("hello") -> "olleh"
# Example: reverse_string("Python") -> "nohtyP"
# Example: reverse_string("") -> ""`,
    },
    {
        id: "cp1-c12",
        type: "code",
        content: `def reverse_string(s: str) -> str:
    # Time: O(n) | Space: O(n) for both approaches
    iterative_reversed = ""
    for char in s:
        iterative_reversed = char + iterative_reversed
    return iterative_reversed
    
    # Or purely pythonic using slicing: return s[::-1]`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test2",
        type: "code",
        content: `_check_solution(
    "reverse_string",
    cases=[
        (("hello",), "olleh", "basic"),
        (("Python",), "nohtyP", "with capital"),
        (("",), "", "empty string"),
        (("a",), "a", "single character"),
        (("racecar",), "racecar", "palindrome"),
    ],
    edge_cases=[
        (("ab",), "ba", "two chars"),
        (("12345",), "54321", "digits"),
    ],
    fast_impl=(lambda s: s[::-1]),
    slow_impl=(lambda s: __import__("functools").reduce(lambda a, c: c + a, s, "")),
    perf_inputs=[("a" * 1000,), ("hello world " * 100,)],
    size_gen=(lambda n: ("a" * n,)),
    sizes=[100, 500, 1000, 2500, 5000, 10000],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c13",
        type: "markdown",
        content: `## 1.2 Dictionaries & Sets

**Concept Overview**:

**1. Hash Tables & Lookups**
Python's \`dict\` and \`set\` are implemented relying on Hash Tables. When you insert a key into a dictionary, Python runs a mathematical hash function \`hash(key)\` to determine strictly where in memory the data should be stored (a bucket index). 
- **Time Complexity:** Looking up, verifying membership (\`if x in my_set\`), inserting, and deleting generally take **$O(1)$ constant time**. Comparatively, searching a list is $O(N)$ linear time!
  
**2. Hash Collisions**
Sometimes two entirely different keys will result in the same hash index. This is a collision. Python dicts resolve this using *open addressing and pseudo-random probing*—if bucket $A$ is full, the compiler mathematically probes to bucket $B$ until it finds an empty slot.

**3. Sets**
A \`set\` is effectively a dictionary containing just keys. Sets enforce mathematical uniqueness (implicitly dropping duplicates) and offer optimized Set Operations:
*Example:*`,
    },
    {
        id: "cp1-c14",
        type: "code",
        content: `fruits_A = {"Apple", "Banana", "Cherry"}
fruits_B = {"Cherry", "Mango"}

print(fruits_A | fruits_B) # Union: {'Apple', 'Banana', 'Cherry', 'Mango'}
print(fruits_A & fruits_B) # Intersection: {'Cherry'}`,
    },
    {
        id: "cp1-c15",
        type: "markdown",
        content: `**4. The \`collections\` Module**
Python offers advanced variants of dictionaries tailored to specific use-cases:
- \`defaultdict\`: Automatically provides a default value if a key doesn't exist, eliminating \`KeyError\`.
- \`Counter\`: specialized subset designed exclusively to construct frequency maps from an iterable.

*Example:*`,
    },
    {
        id: "cp1-c16",
        type: "code",
        content: `from collections import Counter, defaultdict

# DefaultDict — auto-initializes missing keys
grouped_data = defaultdict(list)
grouped_data["names"].append("Alice")  # 'names' didn't exist yet — initialized as []
grouped_data["names"].append("Bob")
grouped_data["ages"].append(30)
print(dict(grouped_data))

# Counter — frequency map
c = Counter("banana")
print(c)  # Counter({'a': 3, 'n': 2, 'b': 1})`,
    },
    {
        id: "cp1-c17",
        type: "markdown",
        content: `**Exercise 1 (5-10 min)**: Given a sentence (a string of words separated by spaces), determine and return the frequency of each word. Ignore case/punctuation for simplicity.`,
    },
    {
        id: "cp1-c18",
        type: "code",
        content: `from typing import Dict

def count_words(sentence: str) -> Dict[str, int]:
    # TODO: Implement
    pass`,
    },
    {
        id: "cp1-c19",
        type: "code",
        content: `from typing import Dict
from collections import Counter

def count_words(sentence: str) -> Dict[str, int]:
    # Time: O(n) where n = number of words | Space: O(k) where k = unique words
    words = sentence.lower().split()
    return dict(Counter(words))
    
    # Standard Dict approach:
    # counts = {}
    # for w in words: counts[w] = counts.get(w, 0) + 1
    # return counts`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test3",
        type: "code",
        content: `_check_solution(
    "count_words",
    cases=[
        (("the cat sat on the mat",), {"the": 2, "cat": 1, "sat": 1, "on": 1, "mat": 1}, "basic count"),
        (("hello hello hello",), {"hello": 3}, "single word repeated"),
        (("a b c a b a",), {"a": 3, "b": 2, "c": 1}, "mixed counts"),
    ],
    edge_cases=[
        (("",), {}, "empty string"),
        (("Hello hello HELLO",), {"hello": 3}, "case-insensitive (lowercased)"),
        (("one",), {"one": 1}, "single word"),
    ],
    fast_impl=(lambda s: dict(__import__("collections").Counter(s.lower().split()))),
    slow_impl=(lambda s: {w: s.lower().split().count(w) for w in s.lower().split()}),
    perf_inputs=[("the cat sat on the mat " * 100,), ("python " * 500,)],
    size_gen=(lambda n: (" ".join("word" + str(i % 50) for i in range(n)),)),
    sizes=[100, 500, 1000, 2000, 4000, 8000],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c20",
        type: "markdown",
        content: `**Exercise 2 (5-10 min)**: Given two lists of integers, return a list containing their intersection (common elements) without duplicates.`,
    },
    {
        id: "cp1-c21",
        type: "code",
        content: `from typing import List

def list_intersection(list1: List[int], list2: List[int]) -> List[int]:
    # TODO: Implement
    pass

# Example: list_intersection([1, 2, 3, 4], [3, 4, 5, 6]) -> [3, 4]
# Example: list_intersection([1, 2], [3, 4]) -> []
# Example: list_intersection([1, 1, 2], [1, 1, 3]) -> [1]`,
    },
    {
        id: "cp1-c22",
        type: "code",
        content: `from typing import List

def list_intersection(list1: List[int], list2: List[int]) -> List[int]:
    # Time: O(n + m) for set creation + O(min(n,m)) for intersection | Space: O(n + m)
    set1, set2 = set(list1), set(list2)
    return list(set1.intersection(set2))`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test4",
        type: "code",
        content: `_check_solution(
    "list_intersection",
    cases=[
        (([1, 2, 3, 4], [3, 4, 5, 6]), [3, 4], "basic overlap"),
        (([1, 1, 2], [1, 1, 3]), [1], "dedupes duplicates"),
        (([1, 2, 3], [1, 2, 3]), [1, 2, 3], "identical lists"),
    ],
    edge_cases=[
        (([1, 2], [3, 4]), [], "no overlap"),
        (([], [1, 2]), [], "empty first"),
        (([1, 2], []), [], "empty second"),
        (([], []), [], "both empty"),
    ],
    fast_impl=(lambda a, b: list(set(a) & set(b))),
    slow_impl=(lambda a, b: list({x for x in a if x in b})),
    perf_inputs=[
        (list(range(500)), list(range(250, 750))),
        (list(range(0, 1000, 2)), list(range(0, 1000, 3))),
    ],
    size_gen=(lambda n: (list(range(n)), list(range(n // 2, n + n // 2)))),
    sizes=[100, 500, 1000, 2500, 5000, 10000],
    custom_test=(lambda func: (
        # Order-insensitive correctness check
        (1, 0, [("pass", "main", "result is set-equal regardless of order", "")])
        if sorted(func([1, 2, 3, 4], [3, 4, 5, 6])) == [3, 4]
        else (0, 1, [("fail", "main", "set-equal check", "got " + str(func([1, 2, 3, 4], [3, 4, 5, 6])))])
    )),
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c23",
        type: "markdown",
        content: `## 1.3 Hash Tables & Hashability

**Concept Overview**:

**1. What Does "Hashable" Mean?**
An object is **hashable** if it meets two strict requirements:
1. It has a **hash value** (an integer) that **never changes** during its entire lifetime.
2. It can be **compared to other objects** (using \`==\`).

**Critical Rule:** If two objects are "equal" (\`a == b\`), they **must** have the same hash value.`,
    },
    {
        id: "cp1-c24",
        type: "code",
        content: `# Hashable objects return consistent integers
print(hash("hello"))    # Same number every time
print(hash((1, 2, 3)))  # Tuples are hashable
print(hash(42))         # Integers are hashable

# Unhashable objects raise TypeError
# hash([1, 2, 3])  # TypeError: unhashable type: 'list'`,
    },
    {
        id: "cp1-c25",
        type: "markdown",
        content: `**2. How Hash Tables Work Internally**
A Dictionary is essentially a giant array (a list of slots). When you provide a key:
1. Python runs the key through \`hash(key)\` to get an integer
2. That integer maps directly to a specific slot (bucket) in memory
3. The value is stored at/retrieved from that slot

This is why dict lookups are $O(1)$ — no scanning required!

**3. The Problem with Mutability**
Here's the fundamental conflict that makes mutable objects unhashable:

| Scenario | Problem |
|----------|---------|
| Hash changes when object mutates | Dictionary can't find the slot where it stored your data (looking at "Address B" for something at "Address A") |
| Hash stays same despite mutation | Two keys that are no longer equal would have the same hash, breaking key differentiation |`,
    },
    {
        id: "cp1-c26",
        type: "code",
        content: `# This is why lists can't be dict keys:
my_list = [1, 2, 3]
try:
    my_dict = {my_list: "value"}
except TypeError as e:
    print("List as key:", e)

# But tuples work because they're immutable:
my_tuple = (1, 2, 3)
my_dict = {my_tuple: "value"}
print("Tuple as key works:", my_dict)`,
    },
    {
        id: "cp1-c27",
        type: "markdown",
        content: `**4. The "Immutable ≠ Hashable" Nuance**
Not all immutable objects are hashable!`,
    },
    {
        id: "cp1-c28",
        type: "code",
        content: `# A tuple containing only immutables: hashable
t1 = (1, 2, 3)
print("hash(t1) =", hash(t1))

# A tuple containing a list: NOT hashable!
t2 = ([1, 2], 3)
try:
    hash(t2)
except TypeError as e:
    print("hash(t2):", e)`,
    },
    {
        id: "cp1-c29",
        type: "markdown",
        content: `**Why?** The list inside can change, which would change the "identity" of the tuple. **To be hashable, the entire chain of data must be unchangeable.**

**5. Real-World Uses for Tuple Keys**
Because tuples are hashable, they can act as **composite keys** — a single key made of multiple values. A single number isn't always enough to identify something uniquely, so you pack multiple fields into one tuple.

| Use Case | Key Pattern | Example |
|----------|-------------|---------|
| **Coordinates** | \`(x, y)\` | \`grid[(5, 10)] = "Tree"\` |
| **Memoization** | \`(arg1, arg2, ...)\` | \`cache[(width, height)] = result\` |
| **Composite IDs** | \`(field1, field2)\` | \`data[(first_name, last_name, dob)] = record\` |
| **Deduplication** | \`(item1, item2)\` | \`unique_pairs = {(a, b) for a, b in pairs}\` |

**Multi-Dimensional Coordinates:**
When building a game, map, or grid-based system, a single integer can't identify a position — you need an \`(x, y)\` pair. Using a tuple as the dictionary key lets you instantly look up what exists at any coordinate in $O(1)$ time.`,
    },
    {
        id: "cp1-c30",
        type: "code",
        content: `# Coordinate lookup in a game grid
grid = {}
grid[(0, 0)] = "spawn"
grid[(5, 10)] = "treasure"
print(grid[(5, 10)])  # "treasure" — O(1) lookup!`,
    },
    {
        id: "cp1-c31",
        type: "markdown",
        content: `**Caching Function Results (Memoization):**
If a function takes multiple arguments and is expensive to compute, you can cache its result in a dictionary keyed by the tuple of its arguments. On subsequent calls with the same inputs, you skip the computation entirely and return the cached result.`,
    },
    {
        id: "cp1-c32",
        type: "code",
        content: `cache = {}
def expensive_compute(x, y, z):
    key = (x, y, z)
    if key not in cache:
        cache[key] = x ** y ** z  # expensive computation
    return cache[key]

print(expensive_compute(2, 3, 2))  # 2 ** (3 ** 2) = 2 ** 9 = 512
print(expensive_compute(2, 3, 2))  # cached this time — instant
print("cache =", cache)`,
    },
    {
        id: "cp1-c33",
        type: "markdown",
        content: `**Database-Style Composite IDs:**
When you need to link data to an entity identified by multiple fields, a tuple key is safer and cleaner than concatenating strings (e.g., \`"John_Doe_1990"\`) to create a unique ID.`,
    },
    {
        id: "cp1-c34",
        type: "code",
        content: `records = {}
records[("Alice", "Smith", "1990-01-15")] = {"department": "Engineering"}
records[("Bob", "Jones", "1985-07-22")] = {"department": "Marketing"}
print(records[("Alice", "Smith", "1990-01-15")])`,
    },
    {
        id: "cp1-c35",
        type: "markdown",
        content: `**Deduplication of Groups:**
If you have a list of paired entries and want to find only the unique ones, converting them to tuples and adding them to a \`set\` lets the hash table automatically discard duplicates.`,
    },
    {
        id: "cp1-c36",
        type: "code",
        content: `trips = [("NYC", "LDN"), ("LDN", "NYC"), ("NYC", "LDN")]
unique_trips = set(trips)
print(unique_trips)  # 2 unique pairs — duplicate ('NYC','LDN') was removed`,
    },
    {
        id: "cp1-c37",
        type: "markdown",
        content: `**Summary of Benefits:**
- **Integrity**: Using a tuple guarantees the key cannot change while it's sitting in the dictionary.
- **Speed**: Looking up a hashed tuple in a dictionary takes $O(1)$ time regardless of how many millions of items are stored.

**Exercise 1 (10-15 min)**: Write a function that takes a list of coordinate pairs (each pair is a list \`[x, y]\`) and returns the count of unique coordinates. Use a set with tuple conversion for $O(n)$ deduplication.`,
    },
    {
        id: "cp1-c38",
        type: "code",
        content: `from typing import List

def count_unique_coordinates(coords: List[List[int]]) -> int:
    # TODO: Convert to tuples, use a set for O(n) deduplication
    pass

# Example: count_unique_coordinates([[0, 0], [1, 2], [0, 0], [3, 4], [1, 2]]) -> 3
# Example: count_unique_coordinates([]) -> 0
# Example: count_unique_coordinates([[5, 5]]) -> 1`,
    },
    {
        id: "cp1-c39",
        type: "code",
        content: `from typing import List

def count_unique_coordinates(coords: List[List[int]]) -> int:
    # Time: O(n) — single pass through list | Space: O(n) — set of tuples
    # Convert each [x, y] list to (x, y) tuple for hashability
    unique = {tuple(coord) for coord in coords}
    return len(unique)

# Alternative explicit approach:
# def count_unique_coordinates(coords: List[List[int]]) -> int:
#     seen = set()
#     for coord in coords:
#         seen.add((coord[0], coord[1]))
#     return len(seen)`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test5",
        type: "code",
        content: `_check_solution(
    "count_unique_coordinates",
    cases=[
        (([[0, 0], [1, 2], [0, 0], [3, 4], [1, 2]],), 3, "basic dedup"),
        (([],), 0, "empty list"),
        (([[5, 5]],), 1, "single point"),
        (([[1, 1], [2, 2], [3, 3]],), 3, "all unique"),
    ],
    edge_cases=[
        (([[0, 0], [0, 0], [0, 0]],), 1, "all duplicates"),
        (([[0, 1], [1, 0]],), 2, "order matters in tuple"),
        (([[-1, -1], [-1, -1], [1, 1]],), 2, "negative coordinates"),
    ],
    fast_impl=(lambda coords: len({(c[0], c[1]) for c in coords})),
    slow_impl=(lambda coords: len({tuple(c) for c in coords})),
    perf_inputs=[
        ([[i % 50, i % 30] for i in range(2000)],),
        ([[i, i + 1] for i in range(1000)],),
    ],
    size_gen=(lambda n: ([[i % 100, i % 80] for i in range(n)],)),
    sizes=[100, 500, 1000, 2500, 5000, 10000],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c40",
        type: "markdown",
        content: `## 1.4 File I/O, Scripting & Automation

**Concept Overview**:

**1. Context Managers (\`with\` statement)**
Whenever your application interacts with external systems (like Hard Drive Files, Databases, Network sockets), an Operating System connection/file descriptor opens. If you do not close this connection, you introduce resource leaks.
Using the \`with\` statement utilizes a Context Manager which magically guarantees \`.close()\` is executed when the indentation block succeeds *or even if it throws an exception globally*.

*Example:*`,
    },
    {
        id: "cp1-c41",
        type: "code",
        content: `# Setup: create a small file so the example is runnable
with open("data.json", "w") as f:
    f.write('{"hello": "world"}')

# The file gracefully shuts down after this block exits. Look, no .close()!
with open("data.json", "r") as file:
    content = file.read()
print(content)`,
    },
    {
        id: "cp1-c42",
        type: "markdown",
        content: `**2. Processing Large Files Memory-Efficiently**
Calling \`file.read()\` or \`file.readlines()\` on a 15GB Text file will allocate 15GB of RAM immediately and crash standard machines. Using a standard \`for\` loop over the file object treats the file uniquely as a streaming iterator. Python manages the stream natively, dumping line $N$ out of RAM before pulling line $N+1$.

*Example:*`,
    },
    {
        id: "cp1-c43",
        type: "code",
        content: `# Setup: write a tiny log file so the example is runnable
with open("demo.log", "w") as f:
    f.write("INFO start\\n")
    f.write("ERROR something broke\\n")
    f.write("INFO continue\\n")
    f.write("ERROR another problem\\n")

# Efficient line-by-line reading pattern (constant memory regardless of file size)
with open("demo.log", "r") as file:
    for line in file:
        if "ERROR" in line:
            print("Found an error:", line.strip())`,
    },
    {
        id: "cp1-c44",
        type: "markdown",
        content: `**3. Scripting Basics: \`json\` and \`subprocess\`**
Python tooling scripts frequently deal with data parsers and triggering shell actions:
- \`json.loads(string_data)\`: Read a JSON string into a Python dict.
- \`json.dumps(dict_data)\`: Format a Python dict directly into a JSON formatted string.
- \`subprocess\`: A robust standard library replacement to the old \`os.system\`. Use \`subprocess.run(["cmd", "arg"])\` to execute standard terminal apps natively from Python.

**Exercise 1 (10-15 min)**: Given a path to a potentially large log file, return the count of lines that contain the substring \`"ERROR"\`. Ensure your solution handles large scale efficiently.`,
    },
    {
        id: "cp1-c45",
        type: "code",
        content: `def count_errors_in_file(filepath: str) -> int:
    # TODO: Implement
    pass

# Example: count_errors_in_file("app.log") -> 42  (counts lines containing "ERROR")
# Hint: Open the file and count lines that contain the word "ERROR"`,
    },
    {
        id: "cp1-c46",
        type: "code",
        content: `def count_errors_in_file(filepath: str) -> int:
    # Time: O(n) where n = number of lines | Space: O(1) — streaming, constant memory!
    error_count = 0
    with open(filepath, 'r') as file:
        for line in file:
            if "ERROR" in line:
                error_count += 1
    return error_count`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test6",
        type: "code",
        content: `def _setup_logfile():
    with open("test_app.log", "w") as f:
        f.write("INFO ok\\n")
        f.write("ERROR boom\\n")
        f.write("INFO ok\\n")
        f.write("ERROR something\\n")
        f.write("DEBUG\\n")
        f.write("ERROR third\\n")

_check_solution(
    "count_errors_in_file",
    cases=[
        (("test_app.log",), 3, "3 ERROR lines in seeded log"),
    ],
    edge_cases=[],
    setup=_setup_logfile,
    fast_impl=(lambda p: sum(1 for line in open(p) if "ERROR" in line)),
    slow_impl=(lambda p: len([ln for ln in open(p).read().split("\\n") if "ERROR" in ln])),
    perf_inputs=[("test_app.log",)],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c47",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Write a function to parse a multi-line CSV formatted string into a list of dictionaries. Assume the first row is always headers.`,
    },
    {
        id: "cp1-c48",
        type: "code",
        content: `from typing import List, Dict

def parse_csv_string(csv_data: str) -> List[Dict[str, str]]:
    # TODO: Implement
    pass

# Example input:
# "name,age,city\\nAlice,30,New York\\nBob,25,LA"`,
    },
    {
        id: "cp1-c49",
        type: "code",
        content: `from typing import List, Dict

def parse_csv_string(csv_data: str) -> List[Dict[str, str]]:
    lines = csv_data.strip().split('\\n')
    if not lines:
        return []
        
    headers = lines[0].split(',')
    results = []
    
    for line in lines[1:]:
        values = line.split(',')
        row_dict = {headers[i]: values[i] for i in range(len(headers))}
        results.append(row_dict)
        
    return results`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test7",
        type: "code",
        content: `_check_solution(
    "parse_csv_string",
    cases=[
        (("name,age,city\\nAlice,30,New York\\nBob,25,LA",),
         [{"name": "Alice", "age": "30", "city": "New York"},
          {"name": "Bob", "age": "25", "city": "LA"}],
         "basic CSV"),
        (("a,b\\n1,2",), [{"a": "1", "b": "2"}], "single data row"),
    ],
    edge_cases=[
        (("a,b,c",), [], "headers only, no rows"),
    ],
    fast_impl=(lambda s: (
        lambda lines: ([dict(zip(lines[0].split(","), row.split(","))) for row in lines[1:]] if len(lines) > 1 else [])
    )(s.strip().split("\\n"))),
    slow_impl=(lambda s: [dict(zip(s.strip().split("\\n")[0].split(","), r.split(","))) for r in s.strip().split("\\n")[1:]]),
    perf_inputs=[
        ("a,b,c\\n" + "\\n".join("1,2,3" for _ in range(200)),),
    ],
    size_gen=(lambda n: ("a,b,c\\n" + "\\n".join("1,2,3" for _ in range(n)),)),
    sizes=[100, 500, 1000, 2000, 4000, 8000],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c50",
        type: "markdown",
        content: `**Exercise 3 (5-10 min)**: Write a function that creates a subdirectory named \`"web_assets"\` in the current directory, then creates the following six files inside it: \`"0_45_67.html"\`, \`"12_99_3.html"\`, \`"index.html"\`, \`"style.css"\`, \`"config.json"\`, and \`"app.js"\`.`,
    },
    {
        id: "cp1-c51",
        type: "code",
        content: `import os

def create_web_assets():
    # TODO: Create subdirectories: css, js, images under a "web" folder
    pass

# Expected result: Creates directory structure:
#   web/
#   ├── css/
#   ├── js/
#   └── images/`,
    },
    {
        id: "cp1-c52",
        type: "code",
        content: `import os

DIR = "web_assets"
FILES = ["0_45_67.html", "12_99_3.html", "index.html", "style.css", "config.json", "app.js"]

def create_web_assets():
    os.makedirs(DIR, exist_ok=True)
    for name in FILES:
        open(os.path.join(DIR, name), "w").close()`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test8",
        type: "code",
        content: `import os, shutil

def _custom_create_web_assets(func):
    # Clean any prior state
    if os.path.isdir("web_assets"):
        shutil.rmtree("web_assets")
    func()
    expected = ["0_45_67.html", "12_99_3.html", "index.html", "style.css", "config.json", "app.js"]
    rows = []
    p = 0
    f = 0
    if os.path.isdir("web_assets"):
        rows.append(("pass", "main", "web_assets directory exists", ""))
        p += 1
    else:
        rows.append(("fail", "main", "web_assets directory exists", "directory not found"))
        f += 1
    for name in expected:
        path = os.path.join("web_assets", name)
        if os.path.isfile(path):
            rows.append(("pass", "main", "file " + name + " created", ""))
            p += 1
        else:
            rows.append(("fail", "main", "file " + name + " created", "missing"))
            f += 1
    return p, f, rows

_check_solution(
    "create_web_assets",
    cases=[],
    custom_test=_custom_create_web_assets,
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c53",
        type: "markdown",
        content: `**Exercise 4 (5-10 min)**: Write a function that grabs all the files in the \`"web_assets"\` subdirectory. Filter to only files ending in \`.html\`, sort them alphabetically by filename, and return the sorted list. Finally, print the sorted filenames.`,
    },
    {
        id: "cp1-c54",
        type: "code",
        content: `from typing import List

def get_html_files() -> List[str]:
    # TODO: Return all .html files in current directory recursively
    pass

# Example: If directory contains index.html and pages/about.html
#          -> ["index.html", "pages/about.html"] (or similar paths)`,
    },
    {
        id: "cp1-c55",
        type: "code",
        content: `from typing import List
import os

DIR = "web_assets"

def get_html_files() -> List[str]:
    files = os.listdir(DIR)
    html_files = sorted(f for f in files if f.endswith(".html"))
    return html_files

# Print the results
for f in get_html_files():
    print(f)`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test9",
        type: "code",
        content: `import os, shutil

def _setup_html_files():
    if os.path.isdir("web_assets"):
        shutil.rmtree("web_assets")
    os.makedirs("web_assets", exist_ok=True)
    for name in ["0_45_67.html", "12_99_3.html", "index.html", "style.css", "config.json", "app.js"]:
        with open(os.path.join("web_assets", name), "w") as f:
            f.write("")

_check_solution(
    "get_html_files",
    cases=[
        ((), ["0_45_67.html", "12_99_3.html", "index.html"], "returns sorted .html files"),
    ],
    setup=_setup_html_files,
    fast_impl=(lambda: sorted(f for f in os.listdir("web_assets") if f.endswith(".html"))),
    slow_impl=(lambda: sorted([f for f in os.listdir("web_assets") if f.lower().endswith(".html")])),
    perf_inputs=[()],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c56",
        type: "markdown",
        content: `## 1.5 Testing in Python

**Concept Overview**:

**1. Why Write Tests?**
Testing ensures your code behaves as expected, catches regressions when refactoring, and serves as living documentation. In interviews, demonstrating familiarity with testing shows engineering maturity.

**2. The \`unittest\` Module (Built-in)**
Python's standard library includes \`unittest\`, inspired by Java's JUnit. Tests are organized into classes that inherit from \`unittest.TestCase\`.

*Example:*`,
    },
    {
        id: "cp1-c57",
        type: "code",
        content: `import unittest

def add(a, b):
    return a + b

class TestAddFunction(unittest.TestCase):
    def test_add_positive_numbers(self):
        self.assertEqual(add(2, 3), 5)

    def test_add_negative_numbers(self):
        self.assertEqual(add(-1, -1), -2)

    def test_add_zero(self):
        self.assertEqual(add(0, 5), 5)

# Run inside the notebook
unittest.main(argv=[""], exit=False, verbosity=2)`,
    },
    {
        id: "cp1-c58",
        type: "markdown",
        content: `**3. \`pytest\` (Industry Standard)**
\`pytest\` is the most popular Python testing framework. It's simpler, more powerful, and requires less boilerplate than \`unittest\`. Tests are plain functions starting with \`test_\`.

*Example:*`,
    },
    {
        id: "cp1-c59",
        type: "code",
        content: `# Pytest-style tests are plain functions starting with test_.
# In a real project: \`pytest test_math.py\`. Here we just call them directly.

def add(a, b):
    return a + b

def test_add_positive():
    assert add(2, 3) == 5

def test_add_negative():
    assert add(-1, -1) == -2

test_add_positive()
test_add_negative()
print("All tests passed!")`,
    },
    {
        id: "cp1-c60",
        type: "markdown",
        content: `**4. Key Testing Concepts**
- **Assertions**: \`assert condition, "error message"\` — raises \`AssertionError\` if condition is False.
- **Fixtures**: Reusable setup/teardown logic. In \`pytest\`, use \`@pytest.fixture\`.
- **Mocking**: Replace real objects with controlled fakes using \`unittest.mock.patch()\`.
- **Test Coverage**: Measure what percentage of code is exercised by tests (\`pytest-cov\`).

*Fixture Example (pytest):*`,
    },
    {
        id: "cp1-c61",
        type: "code",
        content: `# Pytest fixtures aren't available without a pytest runner, but the
# pattern is just dependency injection — we simulate it with a helper.

def sample_list():
    return [1, 2, 3, 4, 5]

def test_list_length():
    assert len(sample_list()) == 5

def test_list_sum():
    assert sum(sample_list()) == 15

test_list_length()
test_list_sum()
print("Both fixture-based tests passed!")`,
    },
    {
        id: "cp1-c62",
        type: "markdown",
        content: `**5. Mocking External Dependencies**
When testing code that calls APIs, databases, or file systems, you mock those dependencies to isolate your unit under test.

*Example:*`,
    },
    {
        id: "cp1-c63",
        type: "code",
        content: `from unittest.mock import patch, MagicMock

# A mocked module providing a fake API client
class FakeApi:
    def get(self, path):
        raise RuntimeError("real API would be called here")

external_api = FakeApi()

def fetch_user_data(user_id):
    response = external_api.get(f"/users/{user_id}")
    return response.json()

# Patch the external API just for the duration of the test
with patch.object(external_api, "get") as mock_get:
    mock_get.return_value.json.return_value = {"name": "Alice"}
    result = fetch_user_data(123)
    print("Result:", result)
    mock_get.assert_called_once_with("/users/123")
    print("Mock was called with the expected path.")`,
    },
    {
        id: "cp1-c64",
        type: "markdown",
        content: `**Exercise 1 (10-15 min)**: Write a test function using \`pytest\` style (plain \`assert\`) that tests a \`is_palindrome(s)\` function. Include at least 3 test cases covering: a valid palindrome, a non-palindrome, and an edge case (empty string or single character).`,
    },
    {
        id: "cp1-c65",
        type: "code",
        content: `def is_palindrome(s: str) -> bool:
    """Check if a string is a palindrome (case-insensitive, ignoring spaces)."""
    cleaned = s.lower().replace(" ", "")
    return cleaned == cleaned[::-1]

# TODO: Write test functions below
# Example assertions:
# assert is_palindrome("racecar") == True
# assert is_palindrome("hello") == False

def test_palindrome_valid():
    # TODO: Test valid palindromes like "racecar", "A man a plan a canal Panama"
    pass

def test_palindrome_invalid():
    # TODO: Test non-palindromes like "hello", "python"
    pass

def test_palindrome_edge_case():
    # TODO: Test edge cases like "", "a" (single char)
    pass`,
    },
    {
        id: "cp1-c66",
        type: "code",
        content: `def is_palindrome(s: str) -> bool:
    """Check if a string is a palindrome (case-insensitive, ignoring spaces)."""
    cleaned = s.lower().replace(" ", "")
    return cleaned == cleaned[::-1]

def test_palindrome_valid():
    assert is_palindrome("racecar") == True
    assert is_palindrome("A man a plan a canal Panama") == True

def test_palindrome_invalid():
    assert is_palindrome("hello") == False
    assert is_palindrome("python") == False

def test_palindrome_edge_case():
    assert is_palindrome("") == True  # Empty string is a palindrome
    assert is_palindrome("a") == True  # Single char is a palindrome

# Run all tests
test_palindrome_valid()
test_palindrome_invalid()
test_palindrome_edge_case()
print("All tests passed!")`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-c67",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Write a \`unittest.TestCase\` class that tests the \`BankAccount\` class from Section 3.2. Include tests for: successful deposit, successful withdrawal, and a withdrawal that should raise \`ValueError\`.`,
    },
    {
        id: "cp1-c68",
        type: "code",
        content: `import unittest

# BankAccount class is defined in Section 3.2 — copied here for standalone testing
# In practice, you would: from bank_account import BankAccount
class BankAccount:
    def __init__(self, initial_balance=0):
        if initial_balance < 0:
            raise ValueError("Balance cannot be negative")
        self.balance = initial_balance
    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("Must deposit positive amount")
        self.balance += amount
    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("Insufficient funds")
        self.balance -= amount

class TestBankAccount(unittest.TestCase):
    # TODO: Implement test methods
    # Example structure:
    # def test_deposit(self):
    #     acct = BankAccount(100)
    #     acct.deposit(50)
    #     self.assertEqual(acct.balance, 150)
    #
    # def test_withdraw_insufficient_funds(self):
    #     acct = BankAccount(50)
    #     with self.assertRaises(ValueError):
    #         acct.withdraw(100)
    pass`,
    },
    {
        id: "cp1-c69",
        type: "code",
        content: `import unittest

class BankAccount:
    def __init__(self, initial_balance=0):
        if initial_balance < 0:
            raise ValueError("Balance cannot be negative")
        self.balance = initial_balance
    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("Must deposit positive amount")
        self.balance += amount
    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("Insufficient funds")
        self.balance -= amount

class TestBankAccount(unittest.TestCase):
    def setUp(self):
        """Create a fresh account before each test."""
        self.account = BankAccount(100)
    
    def test_deposit_success(self):
        self.account.deposit(50)
        self.assertEqual(self.account.balance, 150)
    
    def test_withdraw_success(self):
        self.account.withdraw(30)
        self.assertEqual(self.account.balance, 70)
    
    def test_withdraw_insufficient_funds(self):
        with self.assertRaises(ValueError):
            self.account.withdraw(200)  # More than balance

# Run in notebook
if __name__ == '__main__':
    unittest.main(argv=[''], exit=False, verbosity=2)`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-c70",
        type: "markdown",
        content: `## 1.6 Exception Handling

**Concept Overview**:

**1. The try/except/else/finally Pattern**
Exception handling is fundamental to robust Python code. The full pattern provides fine-grained control:`,
    },
    {
        id: "cp1-c71",
        type: "code",
        content: `def risky_operation():
    return 10 / 2  # change to / 0 to trigger ValueError-like crash

def cleanup_resources():
    print("(cleanup ran)")

try:
    # Code that might raise an exception
    result = risky_operation()
except ValueError as e:
    print(f"Value error: {e}")
except (TypeError, KeyError) as e:
    print(f"Type or Key error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
else:
    print("Success! result =", result)
finally:
    cleanup_resources()`,
    },
    {
        id: "cp1-c72",
        type: "markdown",
        content: `**2. Raising Exceptions**
Use \`raise\` to signal errors. Prefer specific built-in exceptions:
- \`ValueError\`: Invalid argument value
- \`TypeError\`: Wrong type passed
- \`KeyError\`: Missing dictionary key
- \`FileNotFoundError\`: File doesn't exist
- \`IndexError\`: List index out of range`,
    },
    {
        id: "cp1-c73",
        type: "code",
        content: `def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

print(divide(10, 2))
try:
    divide(10, 0)
except ValueError as e:
    print("Caught:", e)`,
    },
    {
        id: "cp1-c74",
        type: "markdown",
        content: `**3. Custom Exceptions**
Create domain-specific exceptions by inheriting from \`Exception\`:`,
    },
    {
        id: "cp1-c75",
        type: "code",
        content: `class InsufficientFundsError(Exception):
    """Raised when withdrawal exceeds balance."""
    def __init__(self, balance, amount):
        self.balance = balance
        self.amount = amount
        super().__init__(f"Cannot withdraw \${amount} from balance of \${balance}")

# Usage — wrapped in try/except so the cell shows the error gracefully
try:
    raise InsufficientFundsError(100, 150)
except InsufficientFundsError as e:
    print("Caught:", e)
    print("balance was:", e.balance, "| attempted:", e.amount)`,
    },
    {
        id: "cp1-c76",
        type: "markdown",
        content: `**4. Context Managers for Exception Safety**
The \`with\` statement ensures cleanup even when exceptions occur:`,
    },
    {
        id: "cp1-c77",
        type: "code",
        content: `# Setup: a tiny file to demonstrate the context manager
with open("data.txt", "w") as f:
    f.write("hello from data.txt")

def process(content):
    print("Processing:", content)

# File is always closed, even if processing raises an exception
with open("data.txt") as f:
    process(f.read())`,
    },
    {
        id: "cp1-c78",
        type: "markdown",
        content: `**Exercise 1 (10-15 min)**: Write a \`safe_divide(a, b)\` function that returns \`a / b\`. If \`b\` is zero, return \`None\` instead of crashing. If either input is not a number, raise a \`TypeError\` with a descriptive message.`,
    },
    {
        id: "cp1-c79",
        type: "code",
        content: `def safe_divide(a, b):
    # TODO: Implement
    # Return None if b is zero, raise TypeError if inputs aren't numbers
    pass

# Example: safe_divide(10, 2) -> 5.0
# Example: safe_divide(10, 0) -> None
# Example: safe_divide("10", 2) -> raises TypeError`,
    },
    {
        id: "cp1-c80",
        type: "code",
        content: `def safe_divide(a, b):
    # Time: O(1) | Space: O(1)
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        raise TypeError(f"Both arguments must be numbers, got {type(a).__name__} and {type(b).__name__}")
    if b == 0:
        return None
    return a / b`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test10",
        type: "code",
        content: `def _custom_safe_divide(func):
    rows = []
    p, f = 0, 0
    # TypeError on string input
    try:
        func("10", 2)
        rows.append(("fail", "edge", "raises TypeError on string input", "no exception raised"))
        f += 1
    except TypeError:
        rows.append(("pass", "edge", "raises TypeError on string input", ""))
        p += 1
    except Exception as e:
        rows.append(("fail", "edge", "raises TypeError on string input",
                     "wrong exception: " + type(e).__name__))
        f += 1
    return p, f, rows

_check_solution(
    "safe_divide",
    cases=[
        ((10, 2), 5.0, "basic division"),
        ((9, 3), 3.0, "exact division"),
        ((10, 0), None, "division by zero returns None"),
        ((-6, 2), -3.0, "negative numerator"),
        ((0, 5), 0.0, "zero numerator"),
    ],
    custom_test=_custom_safe_divide,
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c81",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Create a custom \`ValidationError\` exception class that stores a \`field_name\` and \`message\`. Then write a \`validate_age(age)\` function that raises \`ValidationError\` if age is negative or over 150.`,
    },
    {
        id: "cp1-c82",
        type: "code",
        content: `class ValidationError(Exception):
    # TODO: Store field_name and message
    pass

def validate_age(age: int) -> bool:
    # TODO: Raise ValidationError for invalid ages, return True if valid
    pass

# Example: validate_age(25) -> True
# Example: validate_age(-5) -> raises ValidationError("age", "Age cannot be negative")`,
    },
    {
        id: "cp1-c83",
        type: "code",
        content: `class ValidationError(Exception):
    """Custom exception for validation failures."""
    def __init__(self, field_name: str, message: str):
        self.field_name = field_name
        self.message = message
        super().__init__(f"{field_name}: {message}")

def validate_age(age: int) -> bool:
    # Time: O(1) | Space: O(1)
    if age < 0:
        raise ValidationError("age", "Age cannot be negative")
    if age > 150:
        raise ValidationError("age", "Age cannot exceed 150")
    return True

# Test it:
# try:
#     validate_age(-5)
# except ValidationError as e:
#     print(f"Field: {e.field_name}, Error: {e.message}")`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp1-test11",
        type: "code",
        content: `def _custom_validate_age(func):
    # We assume validate_age is the function exported alongside ValidationError
    rows = []
    p, f = 0, 0
    # ValidationError on negative
    try:
        func(-1)
        rows.append(("fail", "main", "raises ValidationError on -1", "no exception"))
        f += 1
    except Exception as e:
        if type(e).__name__ == "ValidationError":
            rows.append(("pass", "main", "raises ValidationError on -1", ""))
            p += 1
        else:
            rows.append(("fail", "main", "raises ValidationError on -1",
                         "wrong type: " + type(e).__name__))
            f += 1
    # ValidationError on 200
    try:
        func(200)
        rows.append(("fail", "main", "raises ValidationError on 200", "no exception"))
        f += 1
    except Exception as e:
        if type(e).__name__ == "ValidationError":
            rows.append(("pass", "main", "raises ValidationError on 200", ""))
            p += 1
        else:
            rows.append(("fail", "main", "raises ValidationError on 200",
                         "wrong type: " + type(e).__name__))
            f += 1
    return p, f, rows

_check_solution(
    "validate_age",
    cases=[
        ((25,), True, "valid age"),
        ((0,), True, "zero is valid"),
        ((150,), True, "max valid age"),
    ],
    custom_test=_custom_validate_age,
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-footer",
        type: "markdown",
        content: `---

## Section complete!

[Back to Table of Contents](?open=coding-prep) &nbsp;|&nbsp; Next: [Section 2: Algorithms](?open=coding-prep-2) →`,
    },
];
