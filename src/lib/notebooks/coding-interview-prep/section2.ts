import type { CellData } from "../../store";

// Coding Interview Prep - Section 2: Advanced Python Concepts
export const codingPrepSection2Cells: CellData[] = [
    {
        id: "cp2-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)`,
    },
    {
        id: "cp2-helper",
        type: "code",
        content: `# Test runner helper (autorun)
from pynote_ui import Button, Group, Text
from pynote_ui.oplot import Plot
import time, copy, statistics
import js
from pyodide.ffi import create_proxy

def _defer(fn, delay_ms=0):
    """Schedule a Python callable to run on the worker's next macrotask.
    Yields control to the worker event loop so queued UI interactions
    (button clicks, etc.) get a chance to be processed before fn runs."""
    proxy = None
    def _wrapper(*_):
        try:
            fn()
        finally:
            if proxy is not None:
                proxy.destroy()
    proxy = create_proxy(_wrapper)
    js.setTimeout(proxy, delay_ms)

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
        # Aim for ~30 ms total wall time, capped to a sensible loop count.
        # (Was 50 ms; cut to keep perf-check responsive without harming
        # measurement quality much - clock noise floor is ~1 ms in pyodide.)
        target_total = 0.03
        repeats = max(2, min(int(target_total / elapsed), 3000))
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


def _short_repr(val, limit=80):
    """Return a repr that is safely truncated for display."""
    try:
        r = repr(val)
    except Exception:
        r = "<unrepr-able value>"
    if len(r) > limit:
        r = r[:limit-3] + "..."
    return r


def _fmt_args(args):
    """Format a tuple of args as a comma-separated argument list."""
    if not isinstance(args, tuple):
        args = (args,)
    return ", ".join(_short_repr(a, 60) for a in args)


# Status icons used inside the per-test buttons
_ICON_PENDING = "\u25CB"   # hollow circle - not yet run
_ICON_RUNNING = "\u22EF"   # midline ellipsis - currently running
_ICON_PASS    = "\u2705"   # green check
_ICON_FAIL    = "\u274C"   # red X


def _check_solution(func_name, cases=None, edge_cases=None,
                    fast_impl=None, slow_impl=None, perf_inputs=None,
                    setup=None, custom_test=None,
                    pre_run=None,
                    size_gen=None, sizes=None):
    """Build a Check Solution button bound to test specs.

    func_name: name of function (or class) looked up in globals()
    cases: list of (args_tuple, expected, label) - main correctness tests
    edge_cases: list of (args_tuple, expected, label) - edge cases
    fast_impl, slow_impl: callables for benchmark comparison
    perf_inputs: list of args tuples used for fixed-input benchmark bar chart
    setup: callable run before tests (e.g., to populate filesystem)
    custom_test: callable(func) -> (pass_count, fail_count, rows)
    pre_run: callable(func, args) -> args - transform args before each call
    size_gen: callable(n: int) -> args_tuple - produces an input of size n
              for the Big-O complexity scan
    sizes: list of int sizes to feed into size_gen for the complexity plot
    """
    cases = cases or []
    edge_cases = edge_cases or []

    # Header text - updates live as tests progress
    head = Text(content="Click 'Check Solution' to run the tests below.",
                color="info", border=False, size="lg")

    # Single shared details panel - shown when user clicks a test button.
    # Filled in via the _show closure defined below. Renders markdown so we
    # can use bold headers + inline code spans for arg/expected values.
    _DETAILS_PLACEHOLDER = "_(click a test to see details)_"
    details_t = Text(content=_DETAILS_PLACEHOLDER, color="info",
                     border=False, background=False,
                     width="100%", align_h="left", hidden=True,
                     markdown=True)

    # Pre-create one button per declared case. The details panel is shared.
    declared = []
    case_buttons = []

    def _make_btn(label):
        return Button(
            label=_ICON_PENDING + "  " + label,
            color="neutral", style="ghost",
            align_h="left",
        )

    for case_tuple in cases:
        args, expected, label = case_tuple[0], case_tuple[1], case_tuple[2]
        scenario = case_tuple[3] if len(case_tuple) > 3 else None
        spec = {
            "kind": "main", "label": label, "args": args, "expected": expected,
            "btn": _make_btn(label),
            "kind_label": "Main correctness case",
            "scenario": scenario,
            "procedure": "Calls " + func_name + "(" + _fmt_args(args) + ")",
            "expected_str": "Expects: " + _short_repr(expected, 120),
            "status_line": "Status: not yet run",
            "color": "info",
        }
        declared.append(spec)
        case_buttons.append(spec["btn"])
    for case_tuple in edge_cases:
        args, expected, label = case_tuple[0], case_tuple[1], case_tuple[2]
        scenario = case_tuple[3] if len(case_tuple) > 3 else None
        spec = {
            "kind": "edge", "label": label, "args": args, "expected": expected,
            "btn": _make_btn(label),
            "kind_label": "Edge case",
            "scenario": scenario,
            "procedure": "Calls " + func_name + "(" + _fmt_args(args) + ")",
            "expected_str": "Expects: " + _short_repr(expected, 120),
            "status_line": "Status: not yet run",
            "color": "info",
        }
        declared.append(spec)
        case_buttons.append(spec["btn"])

    # Test rows are hidden until the user clicks Check Solution.
    cases_group = Group(case_buttons, layout="row", wrap=True, border=False,
                        background=False, gap=1, hidden=True, align="start")
    # Thin horizontal divider between the test buttons and details panel.
    hrule = Group([], width="100%", height="1px",
                  background="#ffffff22", border=False, hidden=True)
    # Custom-test results aren't known until the callable runs, so we keep a
    # placeholder Group whose children are filled in during the run.
    custom_group = Group([], layout="row", wrap=True, border=False,
                         background=False, gap=1, align="start")
    perf_group   = Group([], layout="col", border=False, background=False,
                        gap=1, align="start")
    # Perf button is appended only if perf is configured. It's hidden until
    # the correctness tests have completed successfully (no failures).
    perf_btn = Button(label="Check Performance", color="primary", style="soft",
                      size="lg", width="100%", background="#ffffff11",
                      hidden=True, disabled=True)

    container_children = [head, cases_group, hrule, details_t, custom_group, perf_btn, perf_group]
    container = Group(container_children, layout="col",
                      border=False, background=False, gap=1)

    # Tracks every interactive button so the perf phase can disable them all
    # while it runs (otherwise the worker is busy and clicks are ignored
    # anyway, but greying them out makes the UX honest).
    all_test_buttons = []

    # Mutable counters captured by closures
    counters = {"passed": 0, "failed": 0, "declared_total": len(declared),
                "custom_total": 0, "started": False}

    # Holds runtime state shared between _run_checks and _run_perf (e.g. the
    # resolved user function). Populated each time tests run.
    runtime = {"func": None}

    # Currently selected test (whose details are shown). None means hidden.
    selected = {"spec": None}

    def _strip_prefix(text, prefix):
        return text[len(prefix):] if text.startswith(prefix) else text

    def _format_details(spec):
        # Markdown layout:
        #   ### Test label
        #   <scenario paragraph>            (optional plain-English explanation)
        #   - **Type:** Category
        #   - **Procedure:** \`call(...)\`
        #   - **Expects:** \`value\`
        #   - **Status:** ...
        title = "### " + spec["label"]
        status_raw = _strip_prefix(spec["status_line"], "Status: ")
        bullets = []
        bullets.append("- **Type:** " + spec["kind_label"])
        proc = spec["procedure"]
        if proc.startswith("Calls "):
            call_expr = _strip_prefix(proc, "Calls ")
            bullets.append("- **Procedure:** \`" + call_expr + "\`")
        else:
            bullets.append("- " + _strip_prefix(proc, "Procedure: "))
        if spec.get("expected_str"):
            exp = _strip_prefix(spec["expected_str"], "Expects: ")
            bullets.append("- **Expects:** \`" + exp + "\`")
        bullets.append("- **Status:** " + status_raw)
        parts = [title]
        if spec.get("scenario"):
            parts.append(spec["scenario"])
        parts.append("\\n".join(bullets))
        return "\\n\\n".join(parts)

    def _show_details(spec):
        prev = selected["spec"]
        # Clicking the same button again reverts to the placeholder and clears highlight.
        if prev is spec:
            selected["spec"] = None
            spec["btn"].options(background=False)
            details_t.content = _DETAILS_PLACEHOLDER
            details_t.options(color="info")
            return
        # Clear highlight from previously-selected button (if any).
        if prev is not None:
            prev["btn"].options(background=False)
        selected["spec"] = spec
        spec["btn"].options(background="#ffffff11")
        details_t.content = _format_details(spec)
        details_t.options(color=spec["color"])
        details_t.show()

    # Bind each declared button to the shared details panel.
    for _spec in declared:
        _spec["btn"].on_update(
            lambda _=None, s=_spec: _show_details(s))

    def _set_head(text, color):
        head.content = text
        head.options(color=color)

    def _update_head():
        c = counters
        total = c["declared_total"] + c["custom_total"]
        done = c["passed"] + c["failed"]
        if total == 0:
            _set_head("No tests defined", "info")
        elif done < total and c["started"]:
            if c["failed"] == 0:
                _set_head(str(c["passed"]) + "/" + str(total) + " tests passed (running...)",
                          "info")
            else:
                _set_head(str(c["passed"]) + " passed, " + str(c["failed"]) +
                          " failed so far (running...)", "warning")
        elif c["failed"] == 0:
            _set_head("All " + str(total) + " tests passed!", "success")
        elif c["passed"] == 0:
            _set_head(str(c["failed"]) + "/" + str(total) + " tests failed", "error")
        else:
            _set_head(str(c["passed"]) + " passed, " + str(c["failed"]) +
                      " failed (of " + str(total) + ")", "warning")

    def _set_status(spec, status, *, actual=None, error=None):
        btn = spec["btn"]
        label = spec["label"]
        if status == "pending":
            btn.label = _ICON_PENDING + "  " + label
            btn.options(color="neutral", style="ghost")
            spec["status_line"] = "Status: not yet run"
            spec["color"] = "info"
        elif status == "running":
            btn.label = _ICON_RUNNING + "  " + label
            btn.options(color="info", style="ghost")
            spec["status_line"] = "Status: running..."
            spec["color"] = "info"
        elif status == "pass":
            btn.label = _ICON_PASS + "  " + label
            btn.options(color="success", style="ghost")
            spec["status_line"] = "Status: passed - output matches expected value."
            spec["color"] = "success"
        else:  # fail
            btn.label = _ICON_FAIL + "  " + label
            btn.options(color="error", style="ghost")
            if error is not None:
                spec["status_line"] = "Status: failed - raised " + error
            else:
                spec["status_line"] = ("Status: failed - expected " +
                                       _short_repr(spec["expected"], 80) +
                                       ", got " + _short_repr(actual, 80))
            spec["color"] = "error"
        # If this spec is currently displayed in the shared details panel,
        # refresh it live so the user sees status transitions while it's open.
        if selected["spec"] is spec:
            details_t.content = _format_details(spec)
            details_t.options(color=spec["color"])

    def run(_=None):
        run_btn.label = "Checking..."
        run_btn.disabled = True
        # Hide perf button & results from any previous run.
        perf_btn.hide()
        perf_btn.disabled = True
        perf_group.send_update(children=[])
        try:
            _run_checks()
        finally:
            _finish_run()

    def _finish_run():
        run_btn.label = "Check Solution"
        run_btn.disabled = False
        # Show the Check Performance button only if perf is configured AND
        # all correctness tests passed. Otherwise leave it hidden.
        perf_available = (
            (perf_inputs and fast_impl and slow_impl) or
            (size_gen and sizes and fast_impl and slow_impl)
        )
        if perf_available and counters["failed"] == 0 and counters["started"]:
            perf_btn.label = "Check Performance"
            perf_btn.disabled = False
            perf_btn.show()

    def _set_buttons_disabled(flag):
        """Grey out / re-enable every interactive button during perf."""
        run_btn.disabled = flag
        for b in all_test_buttons:
            b.disabled = flag

    def _run_checks():
        # Hide test rows during reset so the user never sees them flash back
        # to the "pending" state on a re-run. We only re-show them once the
        # button is in the "Checking..." state and the per-row resets are done.
        cases_group.hide()
        hrule.hide()
        # Hide the shared details panel and clear the selection (also clear
        # any lingering highlight from the previously-selected test button).
        if selected["spec"] is not None:
            selected["spec"]["btn"].options(background=False)
        selected["spec"] = None
        details_t.hide()
        # Reset the tracked-button list; rebuilt below as buttons are wired up.
        all_test_buttons.clear()
        for spec in declared:
            all_test_buttons.append(spec["btn"])
        # Clear any stale func reference from a previous run.
        runtime["func"] = None
        # Reset counters and per-case UI to "pending" before each run.
        counters["passed"] = 0
        counters["failed"] = 0
        counters["custom_total"] = 0
        counters["started"] = True
        for spec in declared:
            _set_status(spec, "pending")
        custom_group.send_update(children=[])
        perf_group.send_update(children=[])
        cases_group.show()
        hrule.show()
        details_t.content = _DETAILS_PLACEHOLDER
        details_t.options(color="info")
        details_t.show()
        _update_head()

        try:
            if setup:
                setup()
        except Exception as e:
            _set_head("Setup failed: " + str(e), "error")
            return

        if func_name not in globals():
            _set_head("Run the exercise cell above first to define \`" + func_name + "\`",
                      "warning")
            return

        func = globals()[func_name]
        runtime["func"] = func

        # Run each declared case sequentially, updating its widget as we go.
        for spec in declared:
            _set_status(spec, "running")
            try:
                fresh = copy.deepcopy(spec["args"])
                actual = func(*fresh)
                if actual == spec["expected"]:
                    counters["passed"] += 1
                    _set_status(spec, "pass")
                else:
                    counters["failed"] += 1
                    _set_status(spec, "fail", actual=actual)
            except Exception as e:
                counters["failed"] += 1
                _set_status(spec, "fail",
                            error=type(e).__name__ + ": " + str(e))
            _update_head()

        # Custom tests are opaque: run, then materialise one button per result.
        if custom_test:
            try:
                p, f, extra = custom_test(func)
            except Exception as e:
                p, f = 0, 1
                extra = [("fail", "custom", "custom test", "crashed: " + str(e))]
            counters["passed"] += p
            counters["failed"] += f
            counters["custom_total"] = p + f
            custom_buttons = []
            for status, kind, label, detail_msg in extra:
                if status == "pass":
                    icon, color = _ICON_PASS, "success"
                    status_line = "Status: passed" + (
                        " - " + detail_msg if detail_msg else "")
                else:
                    icon, color = _ICON_FAIL, "error"
                    status_line = "Status: failed" + (
                        " - " + detail_msg if detail_msg else "")
                cbtn = Button(label=icon + "  " + label, color=color,
                              style="ghost", align_h="left")
                cspec = {
                    "kind": "custom", "label": label, "btn": cbtn,
                    "kind_label": "Custom check (" + kind + ")",
                    "procedure": ("Procedure: scenario-specific behavioural "
                                  "check defined in this exercise's test cell."),
                    "expected_str": "",
                    "status_line": status_line,
                    "color": color,
                }
                cbtn.on_update(lambda _=None, s=cspec: _show_details(s))
                custom_buttons.append(cbtn)
                all_test_buttons.append(cbtn)
            custom_group.send_update(
                children=[b.to_json() for b in custom_buttons])
            _update_head()

        # Perf is now triggered by the separate "Check Performance" button
        # rendered after the correctness tests. _finish_run() (called from
        # run()'s finally) decides whether to show it.

    # ---- Perf phase: triggered by perf_btn click ----
    def _run_perf(_=None):
        func = runtime.get("func")
        if func is None:
            return
        perf_btn.label = "Checking Performance..."
        _set_buttons_disabled(True)
        # Clear any prior perf output before re-running.
        perf_group.send_update(children=[])
        perf_kids = []

        def _flush_perf():
            if perf_kids:
                perf_group.send_update(children=[k.to_json() for k in perf_kids])

        def _finish_perf():
            _set_buttons_disabled(False)
            perf_btn.label = "Check Performance"

        def _run_bench():
            try:
                def _bench(f, inputs):
                    times = []
                    for args in inputs:
                        t = _time_one(f, args)
                        if t is None:
                            return None
                        times.append(t)
                    return statistics.mean(times) if times else None
                u = _bench(func, perf_inputs)
                ff = _bench(fast_impl, perf_inputs)
                ss = _bench(slow_impl, perf_inputs)
                if u is not None and ff is not None and ss is not None:
                    bench_data = [
                        {"impl": "Fast ref", "ms": round(ff, 4)},
                        {"impl": "Yours",    "ms": round(u, 4)},
                        {"impl": "Slow ref", "ms": round(ss, 4)},
                    ]
                    perf_kids.append(Text(
                        content="Performance benchmark (average over " +
                                str(len(perf_inputs)) + " inputs)",
                        color="info", border=False, background=False,
                        align_h="left"))
                    perf_kids.append(Plot(bench_data, x="impl", y="ms", mark="barY",
                                          fill="impl",
                                          x_domain=["Fast ref", "Yours", "Slow ref"],
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
                    perf_kids.append(Text(content=v_text, color=v_color,
                                          border=False, background=False,
                                          align_h="left"))
            except Exception as e:
                perf_kids.append(Text(content="Benchmark skipped: " + str(e),
                                      color="info", border=False, background=False,
                                      align_h="left"))
            _flush_perf()
            # Yield before Big-O scan so queued clicks get processed.
            if size_gen and sizes and fast_impl and slow_impl:
                _defer(_run_bigo)
            else:
                _defer(_finish_perf)

        def _run_bigo():
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
                    perf_kids.append(Text(
                        content="Big-O scaling: time vs input size n",
                        color="info", border=False, background=False,
                        align_h="left"))
                    perf_kids.append(Plot(
                        series, x="n", y="ms", mark="line",
                        z="impl", stroke="impl", marker="dot",
                        title="Execution time vs input size (lower is better, slope = complexity class)",
                        x_label="input size n", y_label="time (ms)",
                        height=240,
                    ))
            except Exception as e:
                perf_kids.append(Text(content="Complexity scan skipped: " + str(e),
                                      color="info", border=False, background=False,
                                      align_h="left"))
            _flush_perf()
            _defer(_finish_perf)

        # Decide which perf chain to schedule.
        if perf_inputs and fast_impl and slow_impl:
            _defer(_run_bench)
        elif size_gen and sizes and fast_impl and slow_impl:
            _defer(_run_bigo)
        else:
            _defer(_finish_perf)

    run_btn = Button(label="Check Solution", color="primary", style="soft", size="lg", width="100%", background="#ffffff11")
    run_btn.on_update(run)
    perf_btn.on_update(_run_perf)
    return Group([run_btn, container], layout="col",
                 border=False, background=False)
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
        id: "cp2-h2",
        type: "markdown",
        content: `# Section 2: Advanced Python Concepts

*Part 2 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp2-c1",
        type: "markdown",
        content: `## 2.1 Generators & Iterators

#### Concept Overview

##### \`iter()\` and \`next()\`
Every \`for\` loop in Python is sugar for the **iterator protocol**: it calls \`iter(obj)\` once to get an iterator, then repeatedly calls \`next(iterator)\` until \`StopIteration\` is raised.

| Function | Role |
|----------|------|
| \`iter(iterable)\` | Convert any iterable (list, str, dict, generator, custom \`__iter__\`) into an iterator. Returns the iterator unchanged if already one |
| \`next(iterator)\` | Advance one step and return the next value; raises \`StopIteration\` when exhausted |
| \`next(iterator, default)\` | Same, but returns \`default\` instead of raising on exhaustion |

Knowing this lets you peek at the first value of any iterable, manually drive a generator, or implement custom iterables via \`__iter__\` / \`__next__\`.

**The Magic of \`yield\`**
Generators are functions that use the \`yield\` keyword. Unlike \`return\` which terminates a function and destroys local state, \`yield\` pauses execution and preserves state. Calling \`next()\` resumes exactly where it stopped.`,
    },
    {
        id: "cp2-c2",
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
        id: "cp2-c3",
        type: "markdown",
        content: `**Why Use Generators?**
- **Memory efficiency**: Process one item at a time instead of loading everything into memory
- **Lazy evaluation**: Values computed only when needed
- **Infinite sequences**: Generate values forever without memory issues`,
    },
    {
        id: "cp2-c4",
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
        id: "cp2-c5",
        type: "markdown",
        content: `**Generator Expressions**
Like list comprehensions, but lazy:`,
    },
    {
        id: "cp2-c6",
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
        id: "cp2-c7",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (10-15 min)**: Write a generator function that yields the first \`n\` numbers of the Fibonacci sequence.`,
    },
    {
        id: "cp2-c8",
        type: "code",
        content: `def generate_fibonacci(n: int):
    # TODO: Implement - yield the first n Fibonacci numbers
    pass

# Example: list(generate_fibonacci(5)) -> [0, 1, 1, 2, 3]
# Example: list(generate_fibonacci(1)) -> [0]`,
    },
    {
        id: "cp2-c9",
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
        id: "cp2-test1",
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
        id: "cp2-c10",
        type: "markdown",
        content: `## 2.2 Decorators & Closures

#### Concept Overview

**First-Class Functions**
In Python, functions are *first-class citizens* — they can be passed around like any other variable, stored in data structures, and returned from other functions.

**Closures**
A closure is a function that "remembers" variables from its enclosing scope, even after that scope has finished executing:`,
    },
    {
        id: "cp2-c11",
        type: "code",
        content: `def make_multiplier(n):
    def multiply(x):
        return x * n  # 'n' is remembered from enclosing scope
    return multiply

double = make_multiplier(2)
print(double(5))  # 10`,
    },
    {
        id: "cp2-c12",
        type: "markdown",
        content: `**Decorators**
A decorator wraps a function with additional functionality without modifying the original function:`,
    },
    {
        id: "cp2-c13",
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
        id: "cp2-c14",
        type: "markdown",
        content: `**The \`@decorator\` syntax is sugar for:** \`greet = loud_decorator(greet)\`

**Common Use Cases:**
- Logging, timing, caching (\`@lru_cache\`)
- Authentication/authorization
- Input validation
- Retry logic

#### Exercises

**Exercise 1 (10-15 min)**: Write a \`@timer\` decorator that measures and prints the execution time of a function.`,
    },
    {
        id: "cp2-c15",
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
        id: "cp2-c16",
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
        id: "cp2-c17",
        type: "markdown",
        content: `## 2.3 OOP Fundamentals

#### Concept Overview

**Classes and Objects**
A class is a blueprint; an object is an instance of that blueprint. Use classes to encapsulate data and behavior together.`,
    },
    {
        id: "cp2-c18",
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
        id: "cp2-c19",
        type: "markdown",
        content: `**Instance vs. Class vs. Static Methods**

| Type | First Param | Access To | Use Case |
|------|-------------|-----------|----------|
| Instance | \`self\` | Instance + class data | Most methods |
| Class | \`cls\` | Class data only | Alternative constructors, factories |
| Static | None | Neither | Utility functions in class namespace |`,
    },
    {
        id: "cp2-c20",
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
        id: "cp2-c21",
        type: "markdown",
        content: `**When to use which:**
- **Instance method**: Needs access to instance state (\`self.something\`)
- **Class method**: Factory patterns, working with class-level state
- **Static method**: Logically belongs to class but doesn't need instance/class access

##### \`super()\` and Attribute Introspection
When working with classes you'll routinely reach for a small set of built-ins that operate **on objects and their attributes**:

| Function | Role |
|----------|------|
| \`super()\` | Inside a method, returns a proxy that delegates to the parent class. Standard for cooperative \`__init__\` chaining: \`super().__init__(...)\` |
| \`hasattr(obj, name)\` | Returns \`True\` if \`obj.name\` is accessible without raising. Useful for duck-typing checks |
| \`getattr(obj, name, default)\` | Read an attribute by string name; returns \`default\` (or raises \`AttributeError\` if no default) when missing |
| \`setattr(obj, name, value)\` | Write an attribute by string name (equivalent to \`obj.name = value\`) |
| \`type(obj)\` | Returns the object's class. \`type(obj).__name__\` is the standard way to get a class's name as a string |

*Example:*`,
    },
    {
        id: "cp2-c22",
        type: "code",
        content: `class Animal:
    def __init__(self, name):
        self.name = name
    def describe(self):
        return f"I am {self.name}"

class Dog(Animal):
    def __init__(self, name, breed):
        super().__init__(name)   # delegate to Animal.__init__
        self.breed = breed

rex = Dog("Rex", "Labrador")
print(rex.describe())                    # "I am Rex"
print(type(rex).__name__)                # "Dog"

# Duck-typing: act based on what an object can do, not what it is
print(hasattr(rex, "breed"))             # True
print(getattr(rex, "color", "unknown"))  # "unknown" (no AttributeError)
setattr(rex, "color", "chocolate")       # dynamic assignment
print(rex.color)                         # "chocolate"`,
    },
    {
        id: "cp2-c23",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (10-15 min)**: Implement a \`BankAccount\` class with \`deposit()\` and \`withdraw()\` methods. Raise \`ValueError\` for invalid operations.`,
    },
    {
        id: "cp2-c24",
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
        id: "cp2-c25",
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
        id: "cp2-test2",
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
        id: "cp2-c26",
        type: "markdown",
        content: `## 2.4 Magic Methods (Dunder Methods)

#### Concept Overview

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
        id: "cp2-c27",
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
        id: "cp2-c28",
        type: "markdown",
        content: `**Operator Overloading:**`,
    },
    {
        id: "cp2-c29",
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
        id: "cp2-c30",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (10-15 min)**: Implement a \`Vector\` class for 2D coordinates. Overload the \`+\` operator so two vectors can be added naturally.`,
    },
    {
        id: "cp2-c31",
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
        id: "cp2-c32",
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
        id: "cp2-test3",
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
        id: "cp2-c33",
        type: "markdown",
        content: `## 2.5 Testing in Python

#### Concept Overview

**1. Why Write Tests?**
Testing ensures your code behaves as expected, catches regressions when refactoring, and serves as living documentation. In interviews, demonstrating familiarity with testing shows engineering maturity.

**2. The \`unittest\` Module (Built-in)**
Python's standard library includes \`unittest\`, inspired by Java's JUnit. Tests are organized into classes that inherit from \`unittest.TestCase\`.

*Example:*`,
    },
    {
        id: "cp2-c34",
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
        id: "cp2-c35",
        type: "markdown",
        content: `**3. \`pytest\` (Industry Standard)**
\`pytest\` is the most popular Python testing framework. It's simpler, more powerful, and requires less boilerplate than \`unittest\`. Tests are plain functions starting with \`test_\`.

*Example:*`,
    },
    {
        id: "cp2-c36",
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
        id: "cp2-c37",
        type: "markdown",
        content: `**4. Key Testing Concepts**
- **Assertions**: \`assert condition, "error message"\` — raises \`AssertionError\` if condition is False.
- **Fixtures**: Reusable setup/teardown logic. In \`pytest\`, use \`@pytest.fixture\`.
- **Mocking**: Replace real objects with controlled fakes using \`unittest.mock.patch()\`.
- **Test Coverage**: Measure what percentage of code is exercised by tests (\`pytest-cov\`).

*Fixture Example (pytest):*`,
    },
    {
        id: "cp2-c38",
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
        id: "cp2-c39",
        type: "markdown",
        content: `**5. Mocking External Dependencies**
When testing code that calls APIs, databases, or file systems, you mock those dependencies to isolate your unit under test.

*Example:*`,
    },
    {
        id: "cp2-c40",
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
        id: "cp2-c41",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (10-15 min)**: Write a test function using \`pytest\` style (plain \`assert\`) that tests a \`is_palindrome(s)\` function. Include at least 3 test cases covering: a valid palindrome, a non-palindrome, and an edge case (empty string or single character).`,
    },
    {
        id: "cp2-c42",
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
        id: "cp2-c43",
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
        id: "cp2-c44",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Write a \`unittest.TestCase\` class that tests the \`BankAccount\` class from Section 3.2. Include tests for: successful deposit, successful withdrawal, and a withdrawal that should raise \`ValueError\`.`,
    },
    {
        id: "cp2-c45",
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
        id: "cp2-c46",
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
        id: "cp2-footer",
        type: "markdown",
        content: `---

## Section complete!

← Previous: [Section 1: Basics](?open=coding-prep-1) &nbsp;|&nbsp; [Back to Table of Contents](?open=coding-prep) &nbsp;|&nbsp; Next: [Section 3: Algorithms](?open=coding-prep-3) →`,
    },
];
