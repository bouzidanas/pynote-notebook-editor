import type { CellData } from "../../store";

// Coding Interview Prep - Section 5: Next Steps & Resources
export const codingPrepSection5Cells: CellData[] = [
    {
        id: "cp5-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)

# Section 5: Next Steps & Resources

*Part 5 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp5-c1",
        type: "markdown",
        content: `## Next Steps & Resources

Congratulations on completing this Python interview prep notebook! Here are tips and resources to continue your preparation:

### 🎯 Interview Tips
1. **Think aloud** — Interviewers want to see your problem-solving process, not just the answer
2. **Clarify first** — Ask about edge cases, input constraints, and expected output format before coding
3. **Start simple** — Get a brute-force solution working, then optimize
4. **Test your code** — Walk through examples mentally or with small test cases
5. **Know your complexities** — Always be ready to state time and space complexity

### 📚 Recommended Practice Platforms
| Platform | Best For |
|----------|----------|
| [LeetCode](https://leetcode.com) | Algorithm problems, company-tagged questions |
| [HackerRank](https://hackerrank.com) | Python-specific challenges, certifications |
| [Codewars](https://codewars.com) | Pythonic code, creative problems |
| [Project Euler](https://projecteuler.net) | Math-heavy algorithmic challenges |

### 📖 Further Reading
- **Python Cookbook** by David Beazley — Advanced Python patterns
- **Fluent Python** by Luciano Ramalho — Deep dive into Python internals
- **Cracking the Coding Interview** by Gayle McDowell — Classic interview prep
- **Grokking Algorithms** by Aditya Bhargava — Visual algorithm explanations

### 🔑 Key Topics to Master
- [ ] Big-O complexity analysis
- [ ] Hash tables (dict/set) and when to use them
- [ ] Two pointers and sliding window patterns
- [ ] Binary search variations
- [ ] Recursion and dynamic programming basics
- [ ] Testing and mocking
- [ ] Exception handling idioms

### 💡 Quick Reference`,
    },
    {
        id: "cp5-c2",
        type: "code",
        content: `# Common imports for interviews
from collections import Counter, defaultdict, deque
from typing import List, Dict, Optional, Tuple
from functools import lru_cache
import heapq

# Self-contained demo of the one-liners below
items   = [("apple", 3), ("banana", 1), ("cherry", 2), ("apple", 3)]
matrix  = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
words   = ["apple", "banana", "apple", "cherry", "banana", "apple"]
k       = 2

print(sorted(items, key=lambda x: x[1], reverse=True))  # by 2nd element, descending
print(Counter(words).most_common(k))                     # top k frequent
print(list(zip(*matrix)))                                # transpose
print(all(len(w) > 0 for w in words))                    # all non-empty
print(any(w.startswith("c") for w in words))             # any starts with 'c'?`,
    },
    {
        id: "cp5-c3",
        type: "markdown",
        content: `**Good luck with your interviews!** 🚀`,
    },
    {
        id: "cp5-footer",
        type: "markdown",
        content: `---

← Previous: [Section 4: Advanced Algorithmic Patterns](?open=coding-prep-4) &nbsp;|&nbsp; [Back to Table of Contents](?open=coding-prep)`,
    },
];
