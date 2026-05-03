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
| 1.5 Testing in Python | unittest, pytest, fixtures, mocking |
| 1.6 Exception Handling | try/except/else/finally, custom exceptions |
| **[Section 2: Algorithms & Problem-Solving →](?open=coding-prep-2)** | |
| 2.1 Complexity Analysis | Big-O notation, time vs space tradeoffs |
| 2.2 Binary Search | Sorted array search, O(log n) lookups |
| 2.3 Graph Traversal | BFS vs DFS, queue vs stack, shortest path |
| 2.4 Recursion & Memoization | Base cases, call stack, @lru_cache |
| 2.5 Two Pointers & Sliding Window | Array patterns, subarray problems |
| **[Section 3: Advanced Python Concepts →](?open=coding-prep-3)** | |
| 3.1 Generators & Iterators | yield, lazy evaluation, memory efficiency |
| 3.2 Decorators & Closures | Function wrapping, @wraps, closure scope |
| 3.3 OOP Fundamentals | Classes, instance/class/static methods |
| 3.4 Magic Methods | Operator overloading, __str__, __repr__ |

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
