import type { CellData } from "../../store";

// Coding Interview Prep - Section 3: Algorithms & Problem-Solving
export const codingPrepSection3Cells: CellData[] = [
    {
        id: "cp3-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)`,
    },
    {
        id: "cp3-helper",
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
                "custom_total": 0, "started": False, "completed": False}

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
        if perf_available and counters["failed"] == 0 and counters["completed"]:
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
        counters["completed"] = False
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

        # All declared (and any custom) tests have been executed without an
        # early return. Mark the run as completed so _finish_run knows it's
        # safe to consider showing the perf button.
        counters["completed"] = True

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
                autorunOnRefresh: true,
                placeholder: "Test runner helper - autoruns silently"
            }
        },
    },
    {
        id: "cp3-h2",
        type: "markdown",
        content: `# Section 3: Algorithms & Problem-Solving

*Part 3 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp3-c1",
        type: "markdown",
        content: `## 3.1 Complexity Analysis (Big-O)

#### Concept Overview

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
        id: "cp3-c2",
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
        id: "cp3-c3",
        type: "markdown",
        content: `## 3.2 Two Pointers

#### Concept Overview

The two-pointer pattern walks a sequence with **two indices** instead of one, exploiting **structure in the input** (usually sortedness) to eliminate work an O(n²) brute-force solution would do.

**The mental model**: brute force says "for every \`i\`, try every \`j\`". Two pointers asks: *"given what I just observed at \`(i, j)\`, can I rule out an entire row or column of the (i, j) grid?"* If yes, you can advance one pointer and never revisit those candidates — turning O(n²) into O(n).

**Pattern recognition cues**
- Input is **sorted** (or can be sorted cheaply, or has a natural order)
- The brute force is "all pairs" or "all triples"
- You're looking for a pair/triplet that **satisfies a comparison** (sum, difference, ratio)
- You need to do something **in place** with O(1) extra space

**Three flavors**

| Flavor | Pointers | Typical use |
|---|---|---|
| Opposite ends | \`left=0, right=n-1\` | Pair sum in sorted array, palindrome check, container-with-most-water |
| Same direction (slow/fast over data) | \`slow=0, fast=0..n\` | Remove duplicates in place, partition |
| Two arrays | \`i\` over A, \`j\` over B | Merge sorted arrays, intersection |

The classic illustrative example is **two-sum on a sorted array**. The invariant is: *if \`nums[left] + nums[right] < target\`, every pair using \`nums[left]\` with anything to the left of \`right\` is also too small — so we can discard the left pointer entirely.* That's the "ruling out a row" insight.`,
    },
    {
        id: "cp3-c4",
        type: "code",
        content: `def two_sum_sorted(nums, target):
    """Find two numbers in a sorted array that sum to target."""
    left, right = 0, len(nums) - 1
    while left < right:
        s = nums[left] + nums[right]
        if s == target:
            return [left, right]
        elif s < target:
            left += 1   # need a larger value -> move left up
        else:
            right -= 1  # need a smaller value -> move right down
    return []

print(two_sum_sorted([1, 2, 3, 4, 6], 6))   # [1, 3]
print(two_sum_sorted([1, 2, 3], 10))        # []`,
    },
    {
        id: "cp3-c5",
        type: "markdown",
        content: `**Why it works (the invariant)**: at every step, the answer (if it exists) lies in the sub-range \`nums[left..right]\`. Each move strictly shrinks that range without discarding the answer, so the loop terminates in O(n) and is correct.

This same invariant pattern generalizes — recognizing it lets you adapt two pointers to *3-sum*, *trapping rain water*, *remove n-th node from end*, and many others.

#### Exercises

**Exercise (10–15 min)**: Write a function that takes a sorted array and removes duplicates **in place**, returning the new length. The first \`k\` slots of the array should hold the unique elements in their original relative order.`,
    },
    {
        id: "cp3-c6",
        type: "code",
        content: `from typing import List

def remove_duplicates(nums: List[int]) -> int:
    # TODO: Implement using two pointers (slow/fast in same direction).
    # Modify nums in-place and return the new length.
    pass

# Example: nums = [1, 1, 2] -> returns 2, nums becomes [1, 2, ...]
# Example: nums = [0, 0, 1, 1, 1, 2, 2, 3] -> returns 4, nums becomes [0, 1, 2, 3, ...]`,
    },
    {
        id: "cp3-c7",
        type: "code",
        content: `from typing import List

def remove_duplicates(nums: List[int]) -> int:
    # Time: O(n) | Space: O(1)
    if not nums:
        return 0
    slow = 0
    for fast in range(1, len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1

# Walkthrough for [0, 0, 1, 1, 2]:
#   slow=0, fast=1: nums[1]==nums[0], skip
#   slow=0, fast=2: nums[2]!=nums[0], slow=1, nums[1]=1 -> [0,1,1,1,2]
#   slow=1, fast=3: nums[3]==nums[1], skip
#   slow=1, fast=4: nums[4]!=nums[1], slow=2, nums[2]=2 -> [0,1,2,1,2]
# return 3`,
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
        content: `def _custom_remove_duplicates(func):
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp3-c8",
        type: "markdown",
        content: `## 3.3 Sliding Window

#### Concept Overview

Sliding window is two pointers' close cousin, specialized for **contiguous subarray / substring** problems. Instead of two pointers that *converge*, both pointers move in the **same direction**, maintaining a window \`[left..right]\` whose contents satisfy some property.

**The mental model**: rather than recomputing a property over every \`O(n)\` window from scratch (\`O(n)\` windows × \`O(k)\` work = \`O(nk)\`), you **incrementally update** the window's state as one element enters on the right and another leaves on the left. Each element is touched at most twice → O(n).

**Pattern recognition cues**
- Problem mentions a **contiguous** subarray / substring (not subsequence!)
- You're asked for the **longest / shortest / max / min / count** of windows satisfying some condition
- The condition is **incrementally maintainable** — adding/removing one element changes the state cheaply (sums, counts, frequency maps)

**Two flavors**

| Flavor | Window size | Loop shape |
|---|---|---|
| **Fixed-size** | Exactly \`k\` | Slide by 1 each step: add \`right\`, remove \`right - k\` |
| **Variable-size** | Grows/shrinks based on a condition | Outer expands \`right\`; inner \`while\` shrinks \`left\` until window is valid |

The classic illustrative examples are *max sum of any \`k\` consecutive elements* (fixed) and *longest substring without repeating characters* (variable). Both share the same DNA: a state object (sum, hash map) that updates in O(1) per pointer move.`,
    },
    {
        id: "cp3-c9",
        type: "code",
        content: `def max_sum_subarray(nums, k):
    """Fixed-size window: max sum of any k consecutive elements."""
    window_sum = sum(nums[:k])
    best = window_sum
    for i in range(k, len(nums)):
        window_sum += nums[i] - nums[i - k]   # add new, drop old
        best = max(best, window_sum)
    return best

print(max_sum_subarray([1, 2, 3, 4, 5], 2))       # 9 (4+5)
print(max_sum_subarray([2, 1, 5, 1, 3, 2], 3))    # 9 (5+1+3)`,
    },
    {
        id: "cp3-c10",
        type: "markdown",
        content: `**Variable-size example** — the *longest substring with at most \`k\` distinct characters*:`,
    },
    {
        id: "cp3-c11",
        type: "code",
        content: `def longest_substring_k_distinct(s, k):
    """Variable-size window: longest substring with at most k distinct chars."""
    from collections import defaultdict
    freq = defaultdict(int)
    left = 0
    best = 0
    for right, ch in enumerate(s):
        freq[ch] += 1
        # Shrink while the window is invalid
        while len(freq) > k:
            freq[s[left]] -= 1
            if freq[s[left]] == 0:
                del freq[s[left]]
            left += 1
        best = max(best, right - left + 1)
    return best

print(longest_substring_k_distinct("eceba", 2))     # 3 ("ece")
print(longest_substring_k_distinct("aabbcc", 2))    # 4 ("aabb" or "bbcc")`,
    },
    {
        id: "cp3-c12",
        type: "markdown",
        content: `**Why the inner \`while\` matters**: the window is allowed to *temporarily* become invalid when we extend \`right\`, and we shrink from \`left\` until it becomes valid again. The key observation is that \`left\` only ever moves forward, so the total work across all iterations is still O(n) — not O(n²) as the nested loops naively suggest.

#### Exercises

**Exercise (10–15 min)**: Given a string \`s\`, return the length of the **longest substring without repeating characters**. Use a variable-size sliding window.`,
    },
    {
        id: "cp3-c13",
        type: "code",
        content: `def longest_unique_substring(s: str) -> int:
    # TODO: Implement using a sliding window + hash set/map of last-seen indices.
    pass

# Example: "abcabcbb" -> 3 ("abc")
# Example: "bbbbb"    -> 1 ("b")
# Example: "pwwkew"   -> 3 ("wke")
# Example: ""         -> 0`,
    },
    {
        id: "cp3-c14",
        type: "code",
        content: `def longest_unique_substring(s: str) -> int:
    # Time: O(n) | Space: O(min(n, alphabet))
    last_seen = {}    # char -> last index where we saw it
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in last_seen and last_seen[ch] >= left:
            left = last_seen[ch] + 1   # jump past the previous occurrence
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best`,
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
        content: `def _ref_fast_lus(s):
    last = {}
    left = best = 0
    for r, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = r
        best = max(best, r - left + 1)
    return best

def _ref_slow_lus(s):
    # O(n^3) brute: every substring, check uniqueness via set
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            sub = s[i:j+1]
            if len(set(sub)) == len(sub):
                best = max(best, j - i + 1)
    return best

_check_solution(
    "longest_unique_substring",
    cases=[
        (("abcabcbb",), 3, "classic"),
        (("bbbbb",),    1, "all same"),
        (("pwwkew",),   3, "non-contiguous answer"),
        (("",),         0, "empty"),
        (("abcdef",),   6, "all unique"),
        (("dvdf",),     3, "skip past prior"),
    ],
    edge_cases=[
        ((" ",),     1, "single space"),
        (("au",),    2, "two unique"),
        (("aab",),   2, "trailing unique"),
    ],
    fast_impl=_ref_fast_lus,
    slow_impl=_ref_slow_lus,
    size_gen=(lambda n: ("".join(chr(97 + (i % 26)) for i in range(n)),)),
    sizes=[50, 100, 200, 400, 800],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp3-c15",
        type: "markdown",
        content: `## 3.4 Fast & Slow Pointers

#### Concept Overview

Fast & slow pointers (a.k.a. **Floyd's Tortoise & Hare**) is a special case of two-pointers where both pointers move in the **same direction at different speeds**. The pattern's superpower is detecting **cycles** and **midpoints** in sequences you cannot index into — most famously, **linked lists**.

**The mental model**: imagine two runners on a track. The fast one moves twice as fast as the slow one. If the track is a straight line, fast simply finishes first. If the track has a loop, the fast runner *will eventually catch up to* the slow runner from behind — they must meet inside the loop. This single observation gives you cycle detection in O(n) time and O(1) space.

**Pattern recognition cues**
- Linked list problems where you need to **detect a cycle**, find the **cycle entry**, or find the **middle node**
- "Find the \`n\`-th from the end" type questions on a linked list (use a fixed gap of \`n\` between fast and slow)
- Problems on sequences where you must operate **without knowing the length up-front** and **without using extra memory**
- Cycle-detection in any "next-state" function (e.g. *Happy Number*, where applying a function repeatedly eventually loops)

**Why this beats a hash set**: detecting a cycle is trivially O(n) time + O(n) space using a "have I seen this node?" hash set. Floyd's trick gives you the same time but **O(1) space** — a meaningful win in memory-constrained environments and a classic interview signal that you understand pointer math.

The illustrative example: detect whether a linked list has a cycle.`,
    },
    {
        id: "cp3-c16",
        type: "code",
        content: `class ListNode:
    def __init__(self, val=0, nxt=None):
        self.val = val
        self.next = nxt

def has_cycle(head):
    """Floyd's: slow moves 1, fast moves 2. They meet iff there's a cycle."""
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False

# Build: 1 -> 2 -> 3 -> 4 -> back to 2
a, b, c, d = ListNode(1), ListNode(2), ListNode(3), ListNode(4)
a.next, b.next, c.next, d.next = b, c, d, b
print(has_cycle(a))   # True

# Build: 1 -> 2 -> 3 (no cycle)
x, y, z = ListNode(1), ListNode(2), ListNode(3)
x.next, y.next = y, z
print(has_cycle(x))   # False`,
    },
    {
        id: "cp3-c17",
        type: "markdown",
        content: `**Why they must meet** (the proof sketch you should be able to give): once both pointers are inside the loop, fast gains exactly one position on slow per step. Since the loop has finite length \`L\`, fast closes the gap in at most \`L\` steps. They cannot "skip past" each other because the gap shrinks by exactly 1 each iteration.

**Variation: find the middle of a linked list** — when fast reaches the end, slow is at the midpoint. Same code skeleton, no special-case logic for length.`,
    },
    {
        id: "cp3-c18",
        type: "code",
        content: `def middle_node(head):
    """Returns the middle node. For even length, returns the second middle."""
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
    return slow

# 1 -> 2 -> 3 -> 4 -> 5  ; middle = 3
n5 = ListNode(5)
n4 = ListNode(4, n5)
n3 = ListNode(3, n4)
n2 = ListNode(2, n3)
n1 = ListNode(1, n2)
print(middle_node(n1).val)   # 3`,
    },
    {
        id: "cp3-c19",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: A *happy number* is one where, repeatedly replacing the number by the sum of squares of its digits, you eventually reach 1. If you instead enter a cycle that never includes 1, the number is **not** happy. Use fast & slow pointers to detect the cycle without a hash set.

Examples:
- \`19 → 1² + 9² = 82 → 8² + 2² = 68 → 6² + 8² = 100 → 1² + 0² + 0² = 1\` ✓ happy
- \`2 → 4 → 16 → 37 → 58 → 89 → 145 → 42 → 20 → 4 → ...\` (cycles back to 4) → not happy`,
    },
    {
        id: "cp3-c20",
        type: "code",
        content: `def is_happy(n: int) -> bool:
    # TODO: Apply sum-of-squares-of-digits as the "next" function.
    # Use slow (1 step) and fast (2 steps); they meet iff a cycle exists.
    # If they meet at 1, return True; otherwise False.
    pass

# is_happy(19) -> True
# is_happy(2)  -> False
# is_happy(1)  -> True`,
    },
    {
        id: "cp3-c21",
        type: "code",
        content: `def is_happy(n: int) -> bool:
    # Time: O(log n) per step, finite cycles -> overall fast | Space: O(1)
    def step(x):
        s = 0
        while x:
            d = x % 10
            s += d * d
            x //= 10
        return s

    slow = n
    fast = step(n)
    while fast != 1 and slow != fast:
        slow = step(slow)
        fast = step(step(fast))
    return fast == 1`,
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
        content: `def _ref_fast_happy(n):
    def step(x):
        s = 0
        while x:
            d = x % 10
            s += d * d
            x //= 10
        return s
    slow, fast = n, step(n)
    while fast != 1 and slow != fast:
        slow = step(slow)
        fast = step(step(fast))
    return fast == 1

def _ref_slow_happy(n):
    # Hash-set baseline: O(n) extra space (what fast/slow eliminates)
    def step(x):
        s = 0
        while x:
            d = x % 10
            s += d * d
            x //= 10
        return s
    seen = set()
    while n != 1 and n not in seen:
        seen.add(n)
        n = step(n)
    return n == 1

_check_solution(
    "is_happy",
    cases=[
        ((19,),  True,  "classic happy"),
        ((1,),   True,  "trivial"),
        ((7,),   True,  "happy"),
        ((2,),   False, "cycle, not happy"),
        ((4,),   False, "cycle, not happy"),
        ((20,),  False, "cycle, not happy"),
    ],
    edge_cases=[
        ((10,),  True,  "10 -> 1"),
        ((100,), True,  "100 -> 1"),
        ((1111111,), True, "many 1 digits"),
    ],
    fast_impl=_ref_fast_happy,
    slow_impl=_ref_slow_happy,
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp3-c22",
        type: "markdown",
        content: `## 3.5 In-Place Linked List Reversal

#### Concept Overview

This pattern teaches one **fundamental pointer dance** — flipping the \`next\` pointer of a node to point *backwards* — and then reuses it to solve a surprising number of linked-list questions: reverse a list, reverse a sublist between positions \`m\` and \`n\`, reverse every \`k\` nodes, palindrome check, etc.

**The mental model**: at every step you hold three references — \`prev\` (the new head you're building), \`curr\` (the node you're flipping), and \`next\` (saved before you destroy \`curr.next\`). The dance is always the same four lines:

\`\`\`
nxt = curr.next     # 1. save what's after us (we're about to overwrite)
curr.next = prev    # 2. flip the link backwards
prev = curr         # 3. advance prev
curr = nxt          # 4. advance curr
\`\`\`

**Pattern recognition cues**
- Asked to **reverse** any contiguous chunk of a singly-linked list
- Asked to test something that requires **traversing backwards** without the memory cost of building a list/stack
- Phrases like "in place", "O(1) extra space", "do not allocate a new list"

**Why interviewers love this**: it's compact, it's all about pointer carefulness, and it generalizes. If you can reverse a whole list cleanly, "reverse only the middle k" or "reverse every k" become composition exercises — which is exactly the kind of *building-block recognition* senior interviewers want to see.`,
    },
    {
        id: "cp3-c23",
        type: "code",
        content: `class ListNode:
    def __init__(self, val=0, nxt=None):
        self.val = val
        self.next = nxt

def reverse_list(head):
    """Reverse a singly-linked list in place. Returns the new head."""
    prev = None
    curr = head
    while curr is not None:
        nxt = curr.next      # save
        curr.next = prev     # flip
        prev = curr          # advance prev
        curr = nxt           # advance curr
    return prev

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

def from_list(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    return head

print(to_list(reverse_list(from_list([1, 2, 3, 4, 5]))))   # [5, 4, 3, 2, 1]
print(to_list(reverse_list(from_list([]))))                # []
print(to_list(reverse_list(from_list([42]))))              # [42]`,
    },
    {
        id: "cp3-c24",
        type: "markdown",
        content: `**Why \`prev\` starts at \`None\`**: the original head's \`next\` should become \`None\` (it's the new tail). Initializing \`prev = None\` makes the very first flip set the right value with zero special-casing.

**Composition example** — reverse only the sublist between 1-indexed positions \`left\` and \`right\` (the LeetCode "Reverse Linked List II" problem). A dummy head removes the special case where \`left == 1\`.`,
    },
    {
        id: "cp3-c25",
        type: "code",
        content: `def reverse_between(head, left, right):
    if not head or left == right:
        return head
    dummy = ListNode(0, head)
    # 1. Walk to the node just before position 'left'
    before = dummy
    for _ in range(left - 1):
        before = before.next
    # 2. Reverse (right - left + 1) nodes starting at before.next
    prev, curr = None, before.next
    for _ in range(right - left + 1):
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    # 3. Reconnect: the old "before.next" is now the tail of the reversed chunk
    before.next.next = curr   # tail of reversed chunk -> what came after
    before.next = prev        # before -> head of reversed chunk
    return dummy.next

print(to_list(reverse_between(from_list([1,2,3,4,5]), 2, 4)))   # [1, 4, 3, 2, 5]
print(to_list(reverse_between(from_list([1,2,3]),    1, 3)))    # [3, 2, 1]`,
    },
    {
        id: "cp3-c26",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Determine if a singly-linked list is a **palindrome** (reads the same forwards and backwards). Aim for **O(n) time, O(1) extra space** by combining fast/slow pointers (find midpoint) with in-place reversal (reverse the second half), then comparing.`,
    },
    {
        id: "cp3-c27",
        type: "code",
        content: `def is_palindrome_list(head) -> bool:
    # TODO: 1) find the midpoint with fast/slow pointers
    #       2) reverse the second half in place
    #       3) walk both halves in parallel and compare values
    # Return True iff every value matches.
    pass

# from_list([1, 2, 2, 1])    -> True
# from_list([1, 2, 3, 2, 1]) -> True
# from_list([1, 2])          -> False
# from_list([])              -> True
# from_list([7])             -> True`,
    },
    {
        id: "cp3-c28",
        type: "code",
        content: `def is_palindrome_list(head) -> bool:
    # Time: O(n) | Space: O(1)
    if head is None or head.next is None:
        return True
    # 1) midpoint
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    # 2) reverse second half (starting at slow)
    prev, curr = None, slow
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    # 3) compare
    left, right = head, prev
    while right:                # right is shorter when length is odd; that's fine
        if left.val != right.val:
            return False
        left = left.next
        right = right.next
    return True`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-test4",
        type: "code",
        content: `class _LN:
    def __init__(self, v, n=None):
        self.val = v
        self.next = n

def _from_list(vals):
    head = None
    for v in reversed(vals):
        head = _LN(v, head)
    return head

def _custom_palindrome(func):
    rows = []
    p, f = 0, 0
    cases = [
        ([], True, "empty"),
        ([1], True, "single"),
        ([1, 1], True, "two same"),
        ([1, 2], False, "two diff"),
        ([1, 2, 1], True, "odd palindrome"),
        ([1, 2, 2, 1], True, "even palindrome"),
        ([1, 2, 3, 2, 1], True, "longer odd"),
        ([1, 2, 3, 4, 5], False, "ascending"),
        ([1, 2, 3, 3, 2, 1], True, "longer even"),
    ]
    for vals, expected, label in cases:
        try:
            got = func(_from_list(vals))
            if got == expected:
                rows.append(("pass", "main", label, ""))
                p += 1
            else:
                rows.append(("fail", "main", label, "got " + str(got) + " expected " + str(expected)))
                f += 1
        except Exception as e:
            rows.append(("fail", "main", label, type(e).__name__ + ": " + str(e)))
            f += 1
    return p, f, rows

_check_solution(
    "is_palindrome_list",
    cases=[],
    custom_test=_custom_palindrome,
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp3-c29",
        type: "markdown",
        content: `## 3.6 Cyclic Sort

#### Concept Overview

Cyclic sort is a niche-but-elegant pattern that solves a specific family of problems in **O(n) time and O(1) extra space** — beating both \`sorted()\` (O(n log n)) and hash-set approaches (O(n) extra space).

**The setup**: an array of \`n\` numbers, where the values come from a **known compact range** like \`[0, n-1]\` or \`[1, n]\`. Because the value range matches the index range, each value has a *natural home* in the array. We can sort by repeatedly **swapping each element to its home index** until everything is in place.

**The mental model**: imagine numbered hotel keys on a counter. For each key in slot \`i\`, look at its number \`v\` — if it doesn't belong here (i.e. \`nums[i] != i+1\` for 1-indexed range), swap it with whatever's currently in its rightful slot. Repeat at the same index until the slot is correct, then move on. Each value moves into its home **at most once**, giving O(n) total swaps.

**Pattern recognition cues**
- Input is an array of size \`n\` with values from \`[0, n-1]\` or \`[1, n]\` (or "almost" — possibly with one duplicate or one missing)
- Asked to find a **missing number**, **duplicate number**, or **all missing numbers** in such an array
- Constraint forbids extra space (\`O(1)\` auxiliary) — that's the giveaway you can't just use a hash set

**Why this beats sorting**: \`sorted()\` is O(n log n) and ignores the structural fact that values match indices. The cyclic-sort family of solutions exploits that structure — the sort *is* the answer, not a preprocessing step.

The illustrative example: sort an array containing \`1\` to \`n\` in place, in O(n) time.`,
    },
    {
        id: "cp3-c30",
        type: "code",
        content: `def cyclic_sort(nums):
    """Sort nums (containing 1..n in some order) in O(n) time, O(1) space."""
    i = 0
    while i < len(nums):
        # The value nums[i] should live at index nums[i] - 1 (1-indexed range)
        home = nums[i] - 1
        if nums[i] != nums[home]:
            nums[i], nums[home] = nums[home], nums[i]   # swap to its home
        else:
            i += 1   # this slot is correct (or duplicate); advance
    return nums

print(cyclic_sort([3, 1, 5, 4, 2]))   # [1, 2, 3, 4, 5]
print(cyclic_sort([2, 6, 4, 3, 1, 5])) # [1, 2, 3, 4, 5, 6]
print(cyclic_sort([1]))                # [1]`,
    },
    {
        id: "cp3-c31",
        type: "markdown",
        content: `**Why it's O(n) (not O(n²))**: each swap places at least one value into its final home, after which we never move it again. Total swaps ≤ \`n\`, total iterations of the outer loop ≤ \`2n\`.

**The key insight that unlocks the variants**: once the array is "cyclic-sorted", the *position* of any anomaly tells you the answer. \`nums[i] != i+1\` means index \`i\` holds the wrong value, which is exactly the *missing* number from that slot. This gives you a free O(n) "find the missing/duplicate" routine.`,
    },
    {
        id: "cp3-c32",
        type: "code",
        content: `def find_missing_number(nums):
    """nums contains n distinct numbers from [0, n]; one is missing. Find it."""
    # Place each value v at index v (range is [0, n], so 0-indexed home)
    i, n = 0, len(nums)
    while i < n:
        home = nums[i]
        if nums[i] < n and nums[i] != nums[home]:
            nums[i], nums[home] = nums[home], nums[i]
        else:
            i += 1
    # The first index where nums[i] != i is the missing number.
    for i in range(n):
        if nums[i] != i:
            return i
    return n   # the missing one is n itself

print(find_missing_number([3, 0, 1]))            # 2
print(find_missing_number([0, 1]))               # 2
print(find_missing_number([9,6,4,2,3,5,7,0,1])) # 8`,
    },
    {
        id: "cp3-c33",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Given an array \`nums\` of \`n\` integers where each integer is in the range \`[1, n]\` (some appear twice, others appear once), return a list of **all** integers in \`[1, n]\` that **do not appear** in \`nums\`. Use cyclic sort and aim for O(n) time and O(1) extra space (the output list does not count toward space).`,
    },
    {
        id: "cp3-c34",
        type: "code",
        content: `from typing import List

def find_all_missing(nums: List[int]) -> List[int]:
    # TODO: Cyclic-sort nums, then any index i where nums[i] != i + 1
    # corresponds to a missing value (i + 1).
    pass

# Example: [4, 3, 2, 7, 8, 2, 3, 1] -> [5, 6]
# Example: [1, 1]                    -> [2]
# Example: [1, 2, 3]                 -> []`,
    },
    {
        id: "cp3-c35",
        type: "code",
        content: `from typing import List

def find_all_missing(nums: List[int]) -> List[int]:
    # Time: O(n) | Space: O(1) extra (output list excluded)
    i, n = 0, len(nums)
    while i < n:
        home = nums[i] - 1   # value v belongs at index v-1
        if nums[i] != nums[home]:
            nums[i], nums[home] = nums[home], nums[i]
        else:
            i += 1
    return [j + 1 for j in range(n) if nums[j] != j + 1]`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-test5",
        type: "code",
        content: `def _ref_fast_missing(nums):
    nums = nums[:]
    i, n = 0, len(nums)
    while i < n:
        home = nums[i] - 1
        if nums[i] != nums[home]:
            nums[i], nums[home] = nums[home], nums[i]
        else:
            i += 1
    return [j + 1 for j in range(n) if nums[j] != j + 1]

def _ref_slow_missing(nums):
    # Hash-set baseline; uses O(n) extra space.
    present = set(nums)
    return [v for v in range(1, len(nums) + 1) if v not in present]

_check_solution(
    "find_all_missing",
    cases=[
        (([4, 3, 2, 7, 8, 2, 3, 1],), [5, 6], "classic"),
        (([1, 1],),                   [2],    "duplicates of 1"),
        (([1, 2, 3],),                [],     "no missing"),
        (([2, 2],),                   [1],    "missing 1"),
    ],
    edge_cases=[
        (([1],),       [],       "single, present"),
        (([2, 1],),    [],       "two, present"),
        (([1, 1, 1],), [2, 3],   "all duplicates"),
    ],
    fast_impl=_ref_fast_missing,
    slow_impl=_ref_slow_missing,
    size_gen=(lambda n: ([(i % n) + 1 for i in range(n)],)),
    sizes=[100, 500, 1000, 2500, 5000],
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp3-c36",
        type: "markdown",
        content: `## 3.7 Merge Intervals

#### Concept Overview

The merge-intervals pattern handles the family of problems built around **collections of \`[start, end]\` ranges** — calendar conflicts, room-booking, CPU scheduling, IP-range coalescing, etc.

**The mental model**: think of intervals as line segments on a number line. Almost every interval problem becomes obvious once you **sort by start time** and then walk left-to-right asking, at each new interval, *"does this overlap with the last one I'm holding?"*. The overlap test is a one-liner: \`new.start <= last.end\`.

**Pattern recognition cues**
- Inputs are pairs/tuples representing **ranges** (\`[start, end]\`, \`[arrival, departure]\`, \`[a, b]\`)
- Asked to: *merge overlaps*, *count rooms needed*, *insert a new interval*, *find non-overlapping subset*, *check if any two overlap*
- The brute-force "compare every pair" is O(n²); sorting drops it to O(n log n)

**The two interval relationships you must know cold**

Given intervals \`A = [a1, a2]\` and \`B = [b1, b2]\` with \`a1 ≤ b1\` (after sort):

| Case | Condition | Action |
|---|---|---|
| Disjoint | \`a2 < b1\` | Output A, then process B |
| Overlap | \`a2 >= b1\` | Merge: \`[a1, max(a2, b2)]\` |

Once these two cases are second nature, every interval problem is a variation: *room scheduling* counts how many simultaneous overlaps exist; *insert interval* is "merge with one new entry"; *non-overlapping subset* greedily picks the interval with the earliest end.

The illustrative example: merge all overlapping intervals.`,
    },
    {
        id: "cp3-c37",
        type: "code",
        content: `def merge_intervals(intervals):
    """Merge all overlapping intervals. Returns list of disjoint intervals."""
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda x: x[0])
    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:                  # overlap
            merged[-1][1] = max(merged[-1][1], end)
        else:                                       # disjoint
            merged.append([start, end])
    return merged

print(merge_intervals([[1, 3], [2, 6], [8, 10], [15, 18]]))
# [[1, 6], [8, 10], [15, 18]]
print(merge_intervals([[1, 4], [4, 5]]))   # [[1, 5]] (touching counts as overlap)
print(merge_intervals([[1, 4], [2, 3]]))   # [[1, 4]] (B fully inside A)`,
    },
    {
        id: "cp3-c38",
        type: "markdown",
        content: `**Why touching intervals (\`[1,4]\` and \`[4,5]\`) merge**: that's a *convention* you must clarify with the interviewer. The condition \`start <= merged[-1][1]\` says yes; \`<\` would say no. Articulating this aloud is exactly the kind of "clarify edges before coding" signal that distinguishes a strong candidate.

**Variation: minimum meeting rooms** — same sort, different question. Instead of merging, you sweep through events and track a running count of simultaneous meetings. The peak count is the answer. Mention this when your interviewer asks "what if I added 100 more variants of this question" — the answer is "they're all the same pattern with different bookkeeping."`,
    },
    {
        id: "cp3-c39",
        type: "code",
        content: `def min_meeting_rooms(intervals):
    """Min rooms needed so that no meeting overlaps another in the same room."""
    if not intervals:
        return 0
    starts = sorted(s for s, e in intervals)
    ends   = sorted(e for s, e in intervals)
    rooms = peak = 0
    j = 0
    for s in starts:
        if s < ends[j]:        # a meeting starts before the next-ending one ends
            rooms += 1
            peak = max(peak, rooms)
        else:                  # one freed up before this one started
            j += 1
    return peak

print(min_meeting_rooms([[0, 30], [5, 10], [15, 20]]))   # 2
print(min_meeting_rooms([[7, 10], [2, 4]]))               # 1
print(min_meeting_rooms([[1, 5], [2, 6], [3, 7]]))        # 3`,
    },
    {
        id: "cp3-c40",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Given a sorted, non-overlapping list of intervals \`intervals\` and a single \`new_interval\`, **insert** the new interval into the list and merge if necessary. Return the resulting non-overlapping intervals, sorted.

The naive approach (insert + re-merge with the merge function above) is O(n log n). The pattern-aware approach is **O(n)** because you exploit the existing sortedness.`,
    },
    {
        id: "cp3-c41",
        type: "code",
        content: `from typing import List

def insert_interval(intervals: List[List[int]], new_interval: List[int]) -> List[List[int]]:
    # TODO: Walk intervals once. There are three phases:
    #   1) intervals that end strictly before new_interval starts -> append as-is
    #   2) intervals that overlap new_interval -> absorb into new_interval
    #      (extend new_interval's start/end to cover them)
    #   3) intervals that start strictly after new_interval ends -> append as-is
    pass

# Example: intervals=[[1,3],[6,9]], new=[2,5]   -> [[1,5],[6,9]]
# Example: intervals=[[1,2],[3,5],[6,7],[8,10],[12,16]], new=[4,8]
#          -> [[1,2],[3,10],[12,16]]
# Example: intervals=[], new=[5,7]              -> [[5,7]]
# Example: intervals=[[1,5]], new=[2,3]         -> [[1,5]]`,
    },
    {
        id: "cp3-c42",
        type: "code",
        content: `from typing import List

def insert_interval(intervals: List[List[int]], new_interval: List[int]) -> List[List[int]]:
    # Time: O(n) | Space: O(n) (output)
    out = []
    i, n = 0, len(intervals)
    s, e = new_interval

    # Phase 1: intervals strictly before new_interval
    while i < n and intervals[i][1] < s:
        out.append(intervals[i])
        i += 1

    # Phase 2: absorb every overlap into [s, e]
    while i < n and intervals[i][0] <= e:
        s = min(s, intervals[i][0])
        e = max(e, intervals[i][1])
        i += 1
    out.append([s, e])

    # Phase 3: the rest
    while i < n:
        out.append(intervals[i])
        i += 1

    return out`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp3-test6",
        type: "code",
        content: `def _ref_fast_insert(intervals, new_interval):
    out = []
    i, n = 0, len(intervals)
    s, e = new_interval
    while i < n and intervals[i][1] < s:
        out.append(intervals[i]); i += 1
    while i < n and intervals[i][0] <= e:
        s = min(s, intervals[i][0]); e = max(e, intervals[i][1]); i += 1
    out.append([s, e])
    while i < n:
        out.append(intervals[i]); i += 1
    return out

def _ref_slow_insert(intervals, new_interval):
    # Concat + re-merge from scratch (O(n log n)).
    arr = sorted(intervals + [new_interval], key=lambda x: x[0])
    merged = [list(arr[0])]
    for s, e in arr[1:]:
        if s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return merged

_check_solution(
    "insert_interval",
    cases=[
        (([[1, 3], [6, 9]], [2, 5]),
            [[1, 5], [6, 9]], "single overlap"),
        (([[1,2],[3,5],[6,7],[8,10],[12,16]], [4, 8]),
            [[1,2],[3,10],[12,16]], "multiple overlap"),
        (([], [5, 7]), [[5, 7]], "empty input"),
        (([[1, 5]], [2, 3]), [[1, 5]], "fully inside"),
        (([[1, 5]], [6, 8]), [[1, 5], [6, 8]], "after all"),
        (([[6, 8]], [1, 5]), [[1, 5], [6, 8]], "before all"),
    ],
    edge_cases=[
        (([[1, 5]], [5, 7]),   [[1, 7]], "touching at boundary"),
        (([[3, 5], [7, 9]], [4, 8]), [[3, 9]], "spans gap"),
    ],
    fast_impl=_ref_fast_insert,
    slow_impl=_ref_slow_insert,
)`,
        metadata: {
            pynote: {
                codeview: { showCode: false, showResult: false },
                autorun: true,
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp3-footer",
        type: "markdown",
        content: `---

## Section complete!

← Previous: [Section 2: Advanced Python](?open=coding-prep-2) &nbsp;|&nbsp; [Back to Table of Contents](?open=coding-prep) &nbsp;|&nbsp; Next: [Section 4: Advanced Algorithmic Patterns](?open=coding-prep-4) →`,
    },
];
