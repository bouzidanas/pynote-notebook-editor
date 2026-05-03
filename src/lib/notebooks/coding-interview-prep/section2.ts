import type { CellData } from "../../store";

// Coding Interview Prep - Section 2: Algorithms & Problem-Solving
export const codingPrepSection2Cells: CellData[] = [
    {
        id: "cp2-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)

# Section 2: Algorithms & Problem-Solving

*Part 2 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp2-helper",
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
        id: "cp2-c1",
        type: "markdown",
        content: `## 2.1 Complexity Analysis (Big-O)

**Concept Overview**:

Big O notation evaluates how an algorithm's performance degrades as the size of the Input ($N$) grows:

| Complexity | Name | Example |
|------------|------|---------|
| $O(1)$ | Constant | Dict key lookup, array index access |
| $O(\\log N)$ | Logarithmic | Binary search |
| $O(N)$ | Linear | Scanning a list element-by-element |
| $O(N \\log N)$ | Linearithmic | Python's \`sorted()\` (Timsort) |
| $O(N^2)$ | Quadratic | Nested loops over same data |
| $O(2^N)$ | Exponential | Naive recursive Fibonacci |

**Key Insight**: Always consider *both* time and space complexity. A solution using extra memory (hash table) often trades space for time.`,
    },
    {
        id: "cp2-c2",
        type: "code",
        content: `# O(N) time, O(N) space — using a set for fast lookup
def has_duplicate(nums):
    seen = set()
    for n in nums:
        if n in seen:
            return True
        seen.add(n)
    return False

# O(N²) time, O(1) space — no extra memory but slower
def has_duplicate_slow(nums):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]:
                return True
    return False

print(has_duplicate([1, 2, 3, 4]))      # False
print(has_duplicate([1, 2, 3, 1]))      # True
print(has_duplicate_slow([1, 2, 3, 4])) # False
print(has_duplicate_slow([1, 2, 3, 1])) # True`,
    },
    {
        id: "cp2-c3",
        type: "markdown",
        content: `## 2.2 Binary Search

**Concept Overview**:

If an array is **already sorted**, searching linearly $O(N)$ is wasteful. Binary search uses two pointers (\`left\`, \`right\`) to bound the search space, checking the middle element and discarding half the data each iteration.

**The Pattern:**`,
    },
    {
        id: "cp2-c4",
        type: "code",
        content: `def binary_search(nums, target):
    left, right = 0, len(nums) - 1

    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1   # Target is in right half
        else:
            right = mid - 1  # Target is in left half

    return -1  # Not found

print(binary_search([1, 3, 5, 7, 9, 11], 7))   # 3
print(binary_search([1, 3, 5, 7, 9, 11], 4))   # -1`,
    },
    {
        id: "cp2-c5",
        type: "markdown",
        content: `**Variations:**
- Find first/last occurrence of a value
- Find insertion point (\`bisect\` module)
- Search in rotated sorted array

**Exercise 1 (10-15 min)**: Given a sorted list of integers, efficiently find a target integer. Return the index, or -1 if not found.`,
    },
    {
        id: "cp2-c6",
        type: "code",
        content: `from typing import List

def find_target(nums: List[int], target: int) -> int:
    # TODO: Implement binary search
    pass

# Example: find_target([1, 3, 5, 7, 9], 5) -> 2
# Example: find_target([1, 3, 5, 7, 9], 6) -> -1
# Example: find_target([], 1) -> -1`,
    },
    {
        id: "cp2-c7",
        type: "code",
        content: `from typing import List

def find_target(nums: List[int], target: int) -> int:
    # Time: O(log n) — halves search space each iteration | Space: O(1)
    left, right = 0, len(nums) - 1
    
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
            
    return -1`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp2-test1",
        type: "code",
        content: `_check_solution(
    "find_target",
    cases=[
        (([1, 3, 5, 7, 9], 5), 2, "found in middle"),
        (([1, 3, 5, 7, 9], 1), 0, "found at start"),
        (([1, 3, 5, 7, 9], 9), 4, "found at end"),
        (([1, 3, 5, 7, 9], 6), -1, "not present"),
    ],
    edge_cases=[
        (([], 1), -1, "empty list"),
        (([42], 42), 0, "single element match"),
        (([42], 1), -1, "single element no match"),
        (([1, 2, 3, 4, 5, 6, 7, 8], 8), 7, "even length, last element"),
    ],
    fast_impl=(lambda nums, t: (lambda i: i if (i < len(nums) and nums[i] == t) else -1)(__import__("bisect").bisect_left(nums, t))),
    slow_impl=(lambda nums, t: nums.index(t) if t in nums else -1),
    perf_inputs=[
        (list(range(2000)), 1500),
        (list(range(2000)), 0),
        (list(range(2000)), 1999),
    ],
    size_gen=(lambda n: (list(range(n)), n - 1)),
    sizes=[100, 500, 1000, 5000, 10000, 50000],
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
        id: "cp2-c8",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Find the missing number in an array containing $n$ distinct numbers taken from $0, 1, 2, \\dots, n$.`,
    },
    {
        id: "cp2-c9",
        type: "code",
        content: `from typing import List

def missing_number(nums: List[int]) -> int:
    # TODO: Implement - find the missing number from 0 to n
    pass

# Example: missing_number([3, 0, 1]) -> 2
# Example: missing_number([0, 1]) -> 2
# Example: missing_number([9,6,4,2,3,5,7,0,1]) -> 8`,
    },
    {
        id: "cp2-c10",
        type: "code",
        content: `from typing import List

def missing_number(nums: List[int]) -> int:
    # Time: O(n) | Space: O(1) — math trick avoids extra data structures!
    n = len(nums)
    expected_sum = n * (n + 1) // 2
    actual_sum = sum(nums)
    return expected_sum - actual_sum`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp2-test2",
        type: "code",
        content: `_check_solution(
    "missing_number",
    cases=[
        (([3, 0, 1],), 2, "small example"),
        (([0, 1],), 2, "missing at end"),
        (([9, 6, 4, 2, 3, 5, 7, 0, 1],), 8, "larger example"),
        (([0],), 1, "single element"),
        (([1],), 0, "missing zero"),
    ],
    edge_cases=[
        (([0, 1, 2, 3, 5],), 4, "missing in middle"),
        (([1, 2, 3, 4, 5],), 0, "missing zero from sorted"),
    ],
    fast_impl=(lambda nums: len(nums) * (len(nums) + 1) // 2 - sum(nums)),
    slow_impl=(lambda nums: [i for i in range(len(nums) + 1) if i not in nums][0]),
    perf_inputs=[
        ([i for i in range(1000) if i != 731],),
        ([i for i in range(500) if i != 0],),
    ],
    size_gen=(lambda n: ([i for i in range(n + 1) if i != n // 2],)),
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
        id: "cp2-c11",
        type: "markdown",
        content: `## 2.3 Graph Traversal (BFS & DFS)

**Concept Overview**:

How do you efficiently traverse hierarchies, graphs, or trees?

**DFS (Depth-First Search)**
Goes all the way down to a branch leaf before backtracking. Commonly implemented via recursion, relying on the call stack (LIFO) to retrace steps.`,
    },
    {
        id: "cp2-c12",
        type: "code",
        content: `# Tiny graph node so we can actually run dfs.
class Node:
    def __init__(self, value):
        self.value = value
        self.neighbors = []
    def __repr__(self):
        return f"Node({self.value})"

def dfs(node, visited=None):
    if visited is None:
        visited = set()
    if node.value in visited:
        return
    visited.add(node.value)
    print(node)
    for neighbor in node.neighbors:
        dfs(neighbor, visited)

# Build a small graph: A -> B -> C and A -> C
a = Node("A"); b = Node("B"); c = Node("C")
a.neighbors = [b, c]
b.neighbors = [c]
dfs(a)`,
    },
    {
        id: "cp2-c13",
        type: "markdown",
        content: `**Use DFS for:** Path finding, cycle detection, topological sorting, maze solving.

**BFS (Breadth-First Search)**
Scans horizontally — all of Level 1, then Level 2, etc. Uses a Queue (FIFO) for traversal. **Critical for finding shortest paths!**`,
    },
    {
        id: "cp2-c14",
        type: "code",
        content: `from collections import deque

# Reuses the Node class from the DFS example above (re-defined here for safety)
class Node:
    def __init__(self, value):
        self.value = value
        self.neighbors = []
    def __repr__(self):
        return f"Node({self.value})"

def bfs(start):
    visited = {start.value}
    queue = deque([start])

    while queue:
        node = queue.popleft()  # O(1) removal from front
        print(node)
        for neighbor in node.neighbors:
            if neighbor.value not in visited:
                visited.add(neighbor.value)
                queue.append(neighbor)

a = Node("A"); b = Node("B"); c = Node("C"); d = Node("D")
a.neighbors = [b, c]
b.neighbors = [d]
c.neighbors = [d]
bfs(a)`,
    },
    {
        id: "cp2-c15",
        type: "markdown",
        content: `**Use BFS for:** Shortest path (unweighted), level-order traversal, finding nearest neighbor.

| Aspect | DFS | BFS |
|--------|-----|-----|
| Data Structure | Stack (recursion) | Queue |
| Memory | O(depth) | O(width) |
| Best For | Deep trees, backtracking | Shortest path, wide trees |`,
    },
    {
        id: "cp2-c16",
        type: "markdown",
        content: `## 2.4 Recursion & Memoization

**Concept Overview**:

**Recursive Thinking**
Recursion solves problems by breaking them into smaller subproblems of the same type. Every recursive function needs:
- **Base Case**: The condition that stops recursion (prevents infinite loops!)
- **Recursive Case**: The problem broken down into smaller pieces`,
    },
    {
        id: "cp2-c17",
        type: "code",
        content: `def factorial(n):
    # Base case
    if n <= 1:
        return 1
    # Recursive case: n! = n * (n-1)!
    return n * factorial(n - 1)

print(factorial(5))  # 5 * 4 * 3 * 2 * 1 = 120`,
    },
    {
        id: "cp2-c18",
        type: "markdown",
        content: `**The Call Stack**
Each recursive call adds a frame to the call stack. Python's default recursion limit is ~1000. For deep recursion:
- Increase limit: \`sys.setrecursionlimit(10000)\`
- Convert to iterative solution
- Use tail recursion (not optimized in Python)

**Memoization**
Cache results of expensive function calls to avoid redundant computation:`,
    },
    {
        id: "cp2-c19",
        type: "code",
        content: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

# Without memoization: O(2^n) — fib(35) would crawl
# With memoization: O(n) — instant
print([fib(i) for i in range(10)])  # 0,1,1,2,3,5,8,13,21,34
print("fib(50) =", fib(50))`,
    },
    {
        id: "cp2-c20",
        type: "markdown",
        content: `**Exercise 1 (10-15 min)**: Write a recursive function to calculate the sum of all elements in a nested list. The list can contain integers or other lists.  
Example: \`nested_sum([1, [2, 3], [[4]], 5])\` → \`15\``,
    },
    {
        id: "cp2-c21",
        type: "code",
        content: `from typing import List, Union

def nested_sum(lst: List[Union[int, list]]) -> int:
    # TODO: Implement recursively
    pass

# Example: nested_sum([1, [2, 3], [[4]], 5]) -> 15
# Example: nested_sum([]) -> 0
# Example: nested_sum([[[[10]]]]) -> 10`,
    },
    {
        id: "cp2-c22",
        type: "code",
        content: `from typing import List, Union

def nested_sum(lst: List[Union[int, list]]) -> int:
    # Time: O(n) where n = total number of integers | Space: O(d) where d = max nesting depth
    total = 0
    for item in lst:
        if isinstance(item, list):
            total += nested_sum(item)  # Recursive case
        else:
            total += item  # Base case: it's an integer
    return total`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp2-test3",
        type: "code",
        content: `def _ref_nested_sum(lst):
    total = 0
    for item in lst:
        total += _ref_nested_sum(item) if isinstance(item, list) else item
    return total

_check_solution(
    "nested_sum",
    cases=[
        (([1, [2, 3], [[4]], 5],), 15, "mixed nesting"),
        (([1, 2, 3],), 6, "flat list"),
        (([[[[10]]]],), 10, "deep nest"),
        (([[1, 2], [3, 4], [5]],), 15, "list of lists"),
    ],
    edge_cases=[
        (([],), 0, "empty list"),
        (([[]],), 0, "list of empty list"),
        (([0, [0, [0]]],), 0, "all zeros"),
    ],
    fast_impl=_ref_nested_sum,
    slow_impl=_ref_nested_sum,
    perf_inputs=[
        ([[i, [i + 1, [i + 2]]] for i in range(50)],),
    ],
    size_gen=(lambda n: ([[i, [i + 1, [i + 2]]] for i in range(n)],)),
    sizes=[50, 100, 250, 500, 1000, 2500],
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
        id: "cp2-c23",
        type: "markdown",
        content: `## 2.5 Two Pointers & Sliding Window

**Concept Overview**:

**Two Pointers Pattern**
Use two indices moving through a sequence. Extremely common for array problems:`,
    },
    {
        id: "cp2-c24",
        type: "code",
        content: `def two_sum_sorted(nums, target):
    """Find two numbers that sum to target in a sorted array."""
    left, right = 0, len(nums) - 1
    while left < right:
        current_sum = nums[left] + nums[right]
        if current_sum == target:
            return [left, right]
        elif current_sum < target:
            left += 1   # Need larger sum
        else:
            right -= 1  # Need smaller sum
    return []

print(two_sum_sorted([1, 2, 3, 4, 6], 6))  # [1, 3] (2 + 4 = 6)
print(two_sum_sorted([1, 2, 3], 10))       # [] (no pair sums to 10)`,
    },
    {
        id: "cp2-c25",
        type: "markdown",
        content: `**Common Two Pointer Variants:**
- **Opposite ends**: Start from both ends, move inward (palindrome check, two sum)
- **Same direction**: Fast/slow pointers (remove duplicates, linked list cycle)
- **Two arrays**: Merge sorted arrays

**Sliding Window Pattern**
Maintain a "window" of elements while iterating. Perfect for substring/subarray problems:`,
    },
    {
        id: "cp2-c26",
        type: "code",
        content: `def max_sum_subarray(nums, k):
    """Find max sum of any k consecutive elements."""
    window_sum = sum(nums[:k])
    max_sum = window_sum

    for i in range(k, len(nums)):
        window_sum += nums[i] - nums[i - k]  # Slide: add new, remove old
        max_sum = max(max_sum, window_sum)

    return max_sum

print(max_sum_subarray([1, 2, 3, 4, 5], 2))           # 9 (4+5)
print(max_sum_subarray([2, 1, 5, 1, 3, 2], 3))        # 9 (5+1+3)`,
    },
    {
        id: "cp2-c27",
        type: "markdown",
        content: `**When to use Sliding Window:**
- Fixed-size window: "Find max sum of k elements"
- Variable-size window: "Find shortest substring containing all characters"

**Exercise 1 (10-15 min)**: Using the **two pointers** technique, write a function that takes a sorted array and removes duplicates *in-place*, returning the new length.`,
    },
    {
        id: "cp2-c28",
        type: "code",
        content: `from typing import List

def remove_duplicates(nums: List[int]) -> int:
    # TODO: Implement using two pointers
    # Modify nums in-place and return the new length
    pass

# Example: nums = [1, 1, 2] -> returns 2, nums becomes [1, 2, ...]
# Example: nums = [0, 0, 1, 1, 1, 2, 2, 3] -> returns 4, nums becomes [0, 1, 2, 3, ...]`,
    },
    {
        id: "cp2-c29",
        type: "code",
        content: `from typing import List

def remove_duplicates(nums: List[int]) -> int:
    # Time: O(n) | Space: O(1) — in-place modification!
    if not nums:
        return 0
    
    # slow pointer tracks position for next unique element
    # fast pointer scans through the array
    slow = 0
    
    for fast in range(1, len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    
    return slow + 1  # Length is index + 1

# Walkthrough for [0, 0, 1, 1, 2]:
# slow=0, fast=1: nums[1]=0 == nums[0]=0, skip
# slow=0, fast=2: nums[2]=1 != nums[0]=0, slow=1, nums[1]=1 -> [0,1,1,1,2]
# slow=1, fast=3: nums[3]=1 == nums[1]=1, skip
# slow=1, fast=4: nums[4]=2 != nums[1]=1, slow=2, nums[2]=2 -> [0,1,2,1,2]
# Return 3`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp2-test4",
        type: "code",
        content: `def _custom_remove_duplicates(func):
    # remove_duplicates returns the new length AND mutates in place
    rows = []
    p, f = 0, 0
    cases = [
        ([1, 1, 2], 2, [1, 2]),
        ([0, 0, 1, 1, 1, 2, 2, 3], 4, [0, 1, 2, 3]),
        ([], 0, []),
        ([1], 1, [1]),
        ([1, 2, 3], 3, [1, 2, 3]),
    ]
    for nums, exp_len, exp_prefix in cases:
        n = nums[:]
        try:
            ret = func(n)
            ok_len = (ret == exp_len)
            ok_pref = (n[:exp_len] == exp_prefix)
            label = "input " + str(nums)
            if ok_len and ok_pref:
                rows.append(("pass", "main", label, ""))
                p += 1
            else:
                detail = []
                if not ok_len:
                    detail.append("len " + str(ret) + " != " + str(exp_len))
                if not ok_pref:
                    detail.append("prefix " + str(n[:exp_len]) + " != " + str(exp_prefix))
                rows.append(("fail", "main", label, ", ".join(detail)))
                f += 1
        except Exception as e:
            rows.append(("fail", "main", "input " + str(nums),
                         type(e).__name__ + ": " + str(e)))
            f += 1
    return p, f, rows

def _ref_fast_remove_duplicates(nums):
    if not nums:
        return 0
    s = 0
    for f in range(1, len(nums)):
        if nums[f] != nums[s]:
            s += 1
            nums[s] = nums[f]
    return s + 1

def _ref_slow_remove_duplicates(nums):
    # Quadratic: scan ahead for each unique element
    if not nums:
        return 0
    unique = []
    for x in nums:
        if x not in unique:
            unique.append(x)
    nums[:len(unique)] = unique
    return len(unique)

_check_solution(
    "remove_duplicates",
    cases=[],
    custom_test=_custom_remove_duplicates,
    fast_impl=_ref_fast_remove_duplicates,
    slow_impl=_ref_slow_remove_duplicates,
    size_gen=(lambda n: ([i // 2 for i in range(n)],)),
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
        id: "cp2-footer",
        type: "markdown",
        content: `---

## Section complete!

← Previous: [Section 1: Basics](?open=coding-prep-1) &nbsp;|&nbsp; [Back to Table of Contents](?open=coding-prep) &nbsp;|&nbsp; Next: [Section 3: Advanced Python](?open=coding-prep-3) →`,
    },
];
