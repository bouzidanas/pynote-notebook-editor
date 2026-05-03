import type { CellData } from "../../store";

// Coding Interview Prep - Section 3: Advanced Python Concepts
export const codingPrepSection3Cells: CellData[] = [
    {
        id: "cp3-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)

# Section 3: Advanced Python Concepts

*Part 3 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp3-helper",
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
        id: "cp3-c1",
        type: "markdown",
        content: `## 3.1 Generators & Iterators

**Concept Overview**:

**The Magic of \`yield\`**
Generators are functions that use the \`yield\` keyword. Unlike \`return\` which terminates a function and destroys local state, \`yield\` pauses execution and preserves state. Calling \`next()\` resumes exactly where it stopped.`,
    },
    {
        id: "cp3-c2",
        type: "code",
        content: `def simple_generator():
    print("Part 1 computing...")
    yield "A"
    print("Part 2 computing...")
    yield "B"

gen = simple_generator()
print(next(gen))  # "Part 1 computing..." then yields "A"
print(next(gen))  # "Part 2 computing..." then yields "B"`,
    },
    {
        id: "cp3-c3",
        type: "markdown",
        content: `**Why Use Generators?**
- **Memory efficiency**: Process one item at a time instead of loading everything into memory
- **Lazy evaluation**: Values computed only when needed
- **Infinite sequences**: Generate values forever without memory issues`,
    },
    {
        id: "cp3-c4",
        type: "code",
        content: `def infinite_counter(start=0):
    n = start
    while True:
        yield n
        n += 1

# Won't crash! Only generates values as needed
counter = infinite_counter()
print(next(counter))  # 0
print(next(counter))  # 1`,
    },
    {
        id: "cp3-c5",
        type: "markdown",
        content: `**Generator Expressions**
Like list comprehensions, but lazy:`,
    },
    {
        id: "cp3-c6",
        type: "code",
        content: `# List comprehension: creates full list in memory
squares_list = [x**2 for x in range(1000000)]

# Generator expression: generates one value at a time
squares_gen = (x**2 for x in range(1000000))  # Parentheses, not brackets!

import sys
print("list size :", sys.getsizeof(squares_list), "bytes")
print("gen size  :", sys.getsizeof(squares_gen),  "bytes")
print("first 5 from list:", squares_list[:5])
print("first 5 from gen :", [next(squares_gen) for _ in range(5)])`,
    },
    {
        id: "cp3-c7",
        type: "markdown",
        content: `**Exercise 1 (10-15 min)**: Write a generator function that yields the first \`n\` numbers of the Fibonacci sequence.`,
    },
    {
        id: "cp3-c8",
        type: "code",
        content: `def generate_fibonacci(n: int):
    # TODO: Implement - yield the first n Fibonacci numbers
    pass

# Example: list(generate_fibonacci(5)) -> [0, 1, 1, 2, 3]
# Example: list(generate_fibonacci(1)) -> [0]`,
    },
    {
        id: "cp3-c9",
        type: "code",
        content: `def generate_fibonacci(n: int):
    # Time: O(n) | Space: O(1) — only stores two previous values
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-test1",
        type: "code",
        content: `_check_solution(
    "generate_fibonacci",
    cases=[
        ((5,), [0, 1, 1, 2, 3], "first 5"),
        ((1,), [0], "first 1"),
        ((10,), [0, 1, 1, 2, 3, 5, 8, 13, 21, 34], "first 10"),
        ((0,), [], "zero terms"),
    ],
    edge_cases=[
        ((2,), [0, 1], "first 2"),
        ((7,), [0, 1, 1, 2, 3, 5, 8], "first 7"),
    ],
    custom_test=(lambda func: (
        # Verify it's a generator (not a list)
        (1, 0, [("pass", "edge", "is a generator (lazy)", "")])
        if hasattr(func(5), "__next__")
        else (0, 1, [("fail", "edge", "is a generator (lazy)",
                     "got " + type(func(5)).__name__)])
    )),
    pre_run=(lambda f, args: args),
    fast_impl=None,
    slow_impl=None,
    perf_inputs=None,
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
        id: "cp3-c10",
        type: "markdown",
        content: `## 3.2 Decorators & Closures

**Concept Overview**:

**First-Class Functions**
In Python, functions are *first-class citizens* — they can be passed around like any other variable, stored in data structures, and returned from other functions.

**Closures**
A closure is a function that "remembers" variables from its enclosing scope, even after that scope has finished executing:`,
    },
    {
        id: "cp3-c11",
        type: "code",
        content: `def make_multiplier(n):
    def multiply(x):
        return x * n  # 'n' is remembered from enclosing scope
    return multiply

double = make_multiplier(2)
print(double(5))  # 10`,
    },
    {
        id: "cp3-c12",
        type: "markdown",
        content: `**Decorators**
A decorator wraps a function with additional functionality without modifying the original function:`,
    },
    {
        id: "cp3-c13",
        type: "code",
        content: `from functools import wraps

def loud_decorator(func):
    @wraps(func)  # Preserves original function's metadata
    def wrapper(*args, **kwargs):
        print(f"Calling: {func.__name__}")
        result = func(*args, **kwargs)
        print("Done!")
        return result
    return wrapper

@loud_decorator
def greet(name):
    print(f"Hello, {name}")

greet("Alice")
# Output:
# Calling: greet
# Hello, Alice
# Done!`,
    },
    {
        id: "cp3-c14",
        type: "markdown",
        content: `**The \`@decorator\` syntax is sugar for:** \`greet = loud_decorator(greet)\`

**Common Use Cases:**
- Logging, timing, caching (\`@lru_cache\`)
- Authentication/authorization
- Input validation
- Retry logic

**Exercise 1 (10-15 min)**: Write a \`@timer\` decorator that measures and prints the execution time of a function.`,
    },
    {
        id: "cp3-c15",
        type: "code",
        content: `import time
from functools import wraps

def timer(func):
    # TODO: Implement
    pass

@timer
def slow_function():
    time.sleep(1)`,
    },
    {
        id: "cp3-c16",
        type: "code",
        content: `import time
from functools import wraps

def timer(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"Function {func.__name__} took {end - start:.4f} seconds")
        return result
    return wrapper`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-c17",
        type: "markdown",
        content: `## 3.3 OOP Fundamentals

**Concept Overview**:

**Classes and Objects**
A class is a blueprint; an object is an instance of that blueprint. Use classes to encapsulate data and behavior together.`,
    },
    {
        id: "cp3-c18",
        type: "code",
        content: `class Dog:
    species = "Canis familiaris"  # Class attribute (shared)

    def __init__(self, name, age):
        self.name = name  # Instance attribute (unique per object)
        self.age = age

    def bark(self):  # Instance method
        return f"{self.name} says woof!"

rex = Dog("Rex", 4)
print(rex.bark())
print(rex.species, "(class attribute)")`,
    },
    {
        id: "cp3-c19",
        type: "markdown",
        content: `**Instance vs. Class vs. Static Methods**

| Type | First Param | Access To | Use Case |
|------|-------------|-----------|----------|
| Instance | \`self\` | Instance + class data | Most methods |
| Class | \`cls\` | Class data only | Alternative constructors, factories |
| Static | None | Neither | Utility functions in class namespace |`,
    },
    {
        id: "cp3-c20",
        type: "code",
        content: `class TextParser:
    delimiter = ","  # Class attribute

    def parse(self, text):  # Instance method
        return text.split(self.delimiter)

    @classmethod
    def set_delimiter(cls, char):  # Class method
        cls.delimiter = char  # Affects ALL instances

    @staticmethod
    def is_valid(text):  # Static method
        return isinstance(text, str) and len(text) > 0

p = TextParser()
print(p.parse("a,b,c"))             # ['a', 'b', 'c']

TextParser.set_delimiter(";")
print(p.parse("a;b;c"))             # ['a', 'b', 'c']

print(TextParser.is_valid("hello"))  # True
print(TextParser.is_valid(""))       # False`,
    },
    {
        id: "cp3-c21",
        type: "markdown",
        content: `**When to use which:**
- **Instance method**: Needs access to instance state (\`self.something\`)
- **Class method**: Factory patterns, working with class-level state
- **Static method**: Logically belongs to class but doesn't need instance/class access

**Exercise 1 (10-15 min)**: Implement a \`BankAccount\` class with \`deposit()\` and \`withdraw()\` methods. Raise \`ValueError\` for invalid operations.`,
    },
    {
        id: "cp3-c22",
        type: "code",
        content: `class BankAccount:
    def __init__(self, initial_balance=0):
        # TODO: Implement, raise ValueError if initial_balance < 0
        pass
        
    def deposit(self, amount):
        # TODO: Implement, raise ValueError if amount <= 0
        pass
        
    def withdraw(self, amount):
        # TODO: Implement, raise ValueError if amount > balance
        pass

# Example usage:
# acct = BankAccount(100)
# acct.deposit(50)  -> balance becomes 150
# acct.withdraw(30) -> balance becomes 120
# acct.withdraw(200) -> raises ValueError("Insufficient funds")`,
    },
    {
        id: "cp3-c23",
        type: "code",
        content: `class BankAccount:
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
        self.balance -= amount`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-test2",
        type: "code",
        content: `def _custom_bank_account(func):
    # func here is the BankAccount class
    rows = []
    p, f = 0, 0

    # Construction with valid initial balance
    try:
        a = func(100)
        if a.balance == 100:
            rows.append(("pass", "main", "init with valid balance", ""))
            p += 1
        else:
            rows.append(("fail", "main", "init with valid balance",
                         "balance is " + str(a.balance)))
            f += 1
    except Exception as e:
        rows.append(("fail", "main", "init with valid balance",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    # Negative initial balance should raise
    try:
        func(-1)
        rows.append(("fail", "main", "init with -1 raises ValueError", "no exception"))
        f += 1
    except ValueError:
        rows.append(("pass", "main", "init with -1 raises ValueError", ""))
        p += 1
    except Exception as e:
        rows.append(("fail", "main", "init with -1 raises ValueError",
                     "wrong type: " + type(e).__name__))
        f += 1

    # Deposit
    try:
        a = func(100)
        a.deposit(50)
        if a.balance == 150:
            rows.append(("pass", "main", "deposit 50 -> 150", ""))
            p += 1
        else:
            rows.append(("fail", "main", "deposit 50 -> 150",
                         "balance is " + str(a.balance)))
            f += 1
    except Exception as e:
        rows.append(("fail", "main", "deposit 50 -> 150",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    # Negative deposit raises
    try:
        a = func(100)
        a.deposit(-10)
        rows.append(("fail", "main", "deposit -10 raises ValueError", "no exception"))
        f += 1
    except ValueError:
        rows.append(("pass", "main", "deposit -10 raises ValueError", ""))
        p += 1
    except Exception as e:
        rows.append(("fail", "main", "deposit -10 raises ValueError",
                     "wrong type: " + type(e).__name__))
        f += 1

    # Withdraw
    try:
        a = func(100)
        a.withdraw(30)
        if a.balance == 70:
            rows.append(("pass", "main", "withdraw 30 -> 70", ""))
            p += 1
        else:
            rows.append(("fail", "main", "withdraw 30 -> 70",
                         "balance is " + str(a.balance)))
            f += 1
    except Exception as e:
        rows.append(("fail", "main", "withdraw 30 -> 70",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    # Overdraft raises
    try:
        a = func(50)
        a.withdraw(100)
        rows.append(("fail", "edge", "withdraw exceeding balance raises", "no exception"))
        f += 1
    except ValueError:
        rows.append(("pass", "edge", "withdraw exceeding balance raises", ""))
        p += 1
    except Exception as e:
        rows.append(("fail", "edge", "withdraw exceeding balance raises",
                     "wrong type: " + type(e).__name__))
        f += 1

    return p, f, rows

_check_solution(
    "BankAccount",
    cases=[],
    custom_test=_custom_bank_account,
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
        id: "cp3-c24",
        type: "markdown",
        content: `## 3.4 Magic Methods (Dunder Methods)

**Concept Overview**:

Python uses "double underscore" (dunder) methods to hook into built-in operations. When you use \`+\`, \`len()\`, or \`print()\`, Python calls the corresponding magic method.

**Essential Magic Methods:**

| Operation | Method Called | Example |
|-----------|---------------|---------|
| \`obj + other\` | \`__add__(self, other)\` | Vector addition |
| \`len(obj)\` | \`__len__(self)\` | Custom container length |
| \`str(obj)\` | \`__str__(self)\` | User-friendly string |
| \`repr(obj)\` | \`__repr__(self)\` | Developer string |
| \`obj[key]\` | \`__getitem__(self, key)\` | Indexing/slicing |
| \`obj == other\` | \`__eq__(self, other)\` | Equality check |
| \`for x in obj\` | \`__iter__(self)\` | Iteration |

**\`__str__\` vs \`__repr__\`:**
- \`__str__\`: Human-readable output (for end users)
- \`__repr__\`: Unambiguous, for debugging (should ideally recreate the object)`,
    },
    {
        id: "cp3-c25",
        type: "code",
        content: `class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y
    
    def __str__(self):
        return f"Point at ({self.x}, {self.y})"  # Friendly
    
    def __repr__(self):
        return f"Point({self.x}, {self.y})"  # Recreatable

p = Point(3, 4)
print(p)       # Point at (3, 4)
print(repr(p)) # Point(3, 4)`,
    },
    {
        id: "cp3-c26",
        type: "markdown",
        content: `**Operator Overloading:**`,
    },
    {
        id: "cp3-c27",
        type: "code",
        content: `class Money:
    def __init__(self, dollars):
        self.dollars = dollars
    
    def __add__(self, other):
        return Money(self.dollars + other.dollars)
    
    def __eq__(self, other):
        return self.dollars == other.dollars

m1 = Money(50)
m2 = Money(30)
m3 = m1 + m2  # Calls m1.__add__(m2)
print(m3.dollars)  # 80`,
    },
    {
        id: "cp3-c28",
        type: "markdown",
        content: `**Exercise 1 (10-15 min)**: Implement a \`Vector\` class for 2D coordinates. Overload the \`+\` operator so two vectors can be added naturally.`,
    },
    {
        id: "cp3-c29",
        type: "code",
        content: `class Vector:
    def __init__(self, x, y):
        # TODO: Store x and y coordinates
        pass
        
    def __add__(self, other):
        # TODO: Return new Vector with summed coordinates
        pass

# Example usage:
# v1 = Vector(1, 2)
# v2 = Vector(3, 4)
# v3 = v1 + v2  # Should create Vector(4, 6)`,
    },
    {
        id: "cp3-c30",
        type: "code",
        content: `class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        
    def __add__(self, other):
        if not isinstance(other, Vector):
            raise TypeError("Can only add another Vector")
        return Vector(self.x + other.x, self.y + other.y)
        
    def __repr__(self):
        return f"Vector({self.x}, {self.y})"`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-test3",
        type: "code",
        content: `def _custom_vector(func):
    rows = []
    p, f = 0, 0

    # Construction
    try:
        v = func(1, 2)
        if v.x == 1 and v.y == 2:
            rows.append(("pass", "main", "init Vector(1, 2)", ""))
            p += 1
        else:
            rows.append(("fail", "main", "init Vector(1, 2)",
                         "x=" + str(v.x) + " y=" + str(v.y)))
            f += 1
    except Exception as e:
        rows.append(("fail", "main", "init Vector(1, 2)",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    # Addition
    try:
        v1 = func(1, 2)
        v2 = func(3, 4)
        v3 = v1 + v2
        if v3.x == 4 and v3.y == 6:
            rows.append(("pass", "main", "(1,2) + (3,4) = (4,6)", ""))
            p += 1
        else:
            rows.append(("fail", "main", "(1,2) + (3,4) = (4,6)",
                         "got (" + str(v3.x) + "," + str(v3.y) + ")"))
            f += 1
    except Exception as e:
        rows.append(("fail", "main", "(1,2) + (3,4) = (4,6)",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    # Negative coordinates
    try:
        v = func(-1, -1) + func(2, 3)
        if v.x == 1 and v.y == 2:
            rows.append(("pass", "edge", "negative + positive coords", ""))
            p += 1
        else:
            rows.append(("fail", "edge", "negative + positive coords",
                         "got (" + str(v.x) + "," + str(v.y) + ")"))
            f += 1
    except Exception as e:
        rows.append(("fail", "edge", "negative + positive coords",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    # Returns NEW Vector (not mutates)
    try:
        v1 = func(1, 1)
        v2 = func(2, 2)
        _ = v1 + v2
        if v1.x == 1 and v1.y == 1:
            rows.append(("pass", "edge", "addition does not mutate", ""))
            p += 1
        else:
            rows.append(("fail", "edge", "addition does not mutate",
                         "v1 mutated to (" + str(v1.x) + "," + str(v1.y) + ")"))
            f += 1
    except Exception as e:
        rows.append(("fail", "edge", "addition does not mutate",
                     type(e).__name__ + ": " + str(e)))
        f += 1

    return p, f, rows

_check_solution(
    "Vector",
    cases=[],
    custom_test=_custom_vector,
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
        id: "cp3-c31",
        type: "markdown",
        content: `---

## Next Steps & Resources

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
        id: "cp3-c32",
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
        id: "cp3-c33",
        type: "markdown",
        content: `**Good luck with your interviews!** 🚀`,
    },
    {
        id: "cp3-footer",
        type: "markdown",
        content: `---

## Section complete!

← Previous: [Section 2: Algorithms](?open=coding-prep-2) &nbsp;|&nbsp; [Back to Table of Contents](?open=coding-prep)`,
    },
];
