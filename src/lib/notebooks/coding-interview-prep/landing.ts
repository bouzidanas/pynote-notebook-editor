import type { CellData } from "../../store";

// Coding Interview Prep - Landing/TOC notebook
export const codingPrepLandingCells: CellData[] = [
    {
        id: "cp-h",
        type: "markdown",
        content: `# Python Interview Preparation

Welcome to your Python interview prep notebook! This material is designed to prepare you for **live coding assessments** that are typically **30–45 minutes long**, where you are given **2–3 problems** to solve while explaining your thought process to an interviewer.

This notebook covers Basics, Algorithms, and Advanced Python Concepts, including **comprehensive topic overviews and code examples**, answers to standard interview questions, and timed practice exercises calibrated to match real assessment conditions.

Each exercise comes with a **Check Solution** button that verifies your implementation against tests and benchmarks it against fast and slow reference solutions.

---`,
    },
    {
        id: "cp-toc",
        type: "markdown",
        content: `## Table of Contents

| Section | Description |
|---------|-------------|
| **[Section 1: Basic Python & Scripting →](?open=coding-prep-1)** | |
| 1.1 Strings, Lists & Tuples | Mutability, list comprehensions, generators, slicing |
| 1.2 Dictionaries & Sets | Hash tables, O(1) lookups, Counter, defaultdict |
| 1.3 Hash Tables & Hashability | Hash functions, hashable requirements, tuple keys |
| 1.4 File I/O & Automation | Context managers, large file processing, json, subprocess |
| 1.5 Exception Handling | try/except/else/finally, custom exceptions |
| **[Section 2: Advanced Python Concepts →](?open=coding-prep-2)** | |
| 2.1 Generators & Iterators | yield, lazy evaluation, memory efficiency |
| 2.2 Decorators & Closures | Function wrapping, @wraps, closure scope |
| 2.3 OOP Fundamentals | Classes, instance/class/static methods |
| 2.4 Magic Methods | Operator overloading, __str__, __repr__ |
| 2.5 Testing in Python | unittest, pytest, fixtures, mocking |
| **[Section 3: Algorithms & Problem-Solving →](?open=coding-prep-3)** | |
| 3.1 Complexity Analysis | Big-O notation, time vs space tradeoffs |
| 3.2 Two Pointers | Same/opposite direction scans on sorted/linear data |
| 3.3 Sliding Window | Contiguous subarray/substring problems in O(n) |
| 3.4 Fast & Slow Pointers | Cycle detection, midpoints in linked lists |
| 3.5 In-Place Linked List Reversal | Reverse whole/sublists with O(1) extra space |
| 3.6 Cyclic Sort | Find missing/duplicate in [1..n] arrays in O(n) |
| 3.7 Merge Intervals | Sort + sweep for overlap, scheduling, calendars |
| **[Section 4: Advanced Algorithmic Patterns →](?open=coding-prep-4)** | |
| 4.1 Binary Search | Sorted array search, O(log n) lookups |
| 4.2 Modified Binary Search | Rotated arrays, search-the-answer-space |
| 4.3 Recursion & Memoization | Base cases, call stack, @lru_cache |
| 4.4 Tree BFS | Level-order traversal, per-level bookkeeping |
| 4.5 Tree DFS | Pre/in/postorder, top-down vs bottom-up |
| 4.6 Subsets & Backtracking | Choice-tree exploration with prune & undo |
| 4.7 Top K Elements | Heap of size K for streaming top/bottom queries |
| 4.8 Two Heaps | Running median and order-statistic patterns |
| **[Section 5: Next Steps & Resources →](?open=coding-prep-5)** | |
| 5.1 Interview Tips & Resources | Practice platforms, further reading, key topics |

---

### How to use these notebooks

1. **Read** the concept overview at the top of each sub-section.
2. **Run** the inline code examples — every Python snippet is now a real, executable cell.
3. **Try** each exercise in the provided skeleton cell.
4. **Reveal** the solution with the eye icon if you get stuck.
5. **Click** the *Check Solution* button to validate your implementation and see how it benchmarks against fast and slow reference implementations.

### What's new in this version

- **Interactive code examples**: every illustrative snippet from the original notebook is now a runnable code cell.
- **Hidden solutions**: solutions are folded into hidden code cells so you can reveal them on demand.
- **Auto-graded exercises**: each exercise gets a *Check Solution* button that runs correctness tests, edge cases, and performance benchmarks.`,
    },
];
