import type { CellData } from "../../store";

// Coding Interview Prep - Section 4: Advanced Algorithmic Patterns
export const codingPrepSection4Cells: CellData[] = [
    {
        id: "cp4-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)`,
    },
    {
        id: "cp4-helper",
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
        id: "cp4-h2",
        type: "markdown",
        content: `# Section 4: Advanced Algorithmic Patterns

*Part 4 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp4-c1",
        type: "markdown",
        content: `## 4.1 Binary Search

#### Concept Overview

If an array is **already sorted**, searching linearly $O(N)$ is wasteful. Binary search uses two pointers (\`left\`, \`right\`) to bound the search space, checking the middle element and discarding half the data each iteration.

**The Pattern:**`,
    },
    {
        id: "cp4-c2",
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
        id: "cp4-c3",
        type: "markdown",
        content: `**Variations:**
- Find first/last occurrence of a value
- Find insertion point (\`bisect\` module)
- Search in rotated sorted array

#### Exercises

**Exercise 1 (10-15 min)**: Given a sorted list of integers, efficiently find a target integer. Return the index, or -1 if not found.`,
    },
    {
        id: "cp4-c4",
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
        id: "cp4-c5",
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
        id: "cp4-test1",
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
        id: "cp4-c6",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Find the missing number in an array containing $n$ distinct numbers taken from $0, 1, 2, \\dots, n$.`,
    },
    {
        id: "cp4-c7",
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
        id: "cp4-c8",
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
        id: "cp4-test2",
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
        id: "cp4-c9",
        type: "markdown",
        content: `## 4.2 Modified Binary Search

#### Concept Overview

The previous subsection covered the textbook case: a sorted array, an exact target. The "modified" family covers everything else — the cases where you can still get O(log n) by **searching a monotonic predicate** instead of an exact value.

**The mental model that unifies them all**: binary search isn't about *arrays* — it's about searching a space \`[lo, hi]\` for the **boundary** between a region where some predicate \`P(x)\` is \`False\` and a region where \`P(x)\` is \`True\`. As long as your predicate is **monotonic** (once \`True\`, it stays \`True\` — or vice versa), you can find the boundary in O(log(hi − lo)).

\`\`\`
False False False | True True True
                  ^ this boundary is what we're searching for
\`\`\`

Once you internalize this, the problems below are *the same algorithm* with different predicates:

| Problem | Search space | Predicate \`P(x)\` |
|---|---|---|
| Lower bound of \`target\` in sorted array | indices \`[0, n]\` | \`nums[x] >= target\` |
| First bad version | versions \`[1, n]\` | \`isBadVersion(x)\` |
| Min element in **rotated** sorted array | indices \`[0, n-1]\` | \`nums[x] <= nums[hi]\` (right half) |
| Min capacity to ship within D days | capacities \`[max(weights), sum(weights)]\` | "can finish in D days at capacity x" |
| √n (integer square root) | answers \`[0, n]\` | \`x*x > n\` |
| Median of two sorted arrays | partitions of A | "is partition valid" |

**Pattern recognition cues**
- Input is sorted, *or* sorted-then-rotated, *or* the **answer space** is monotonic (think "binary search on the answer")
- O(n) is too slow but you don't have a hash to make it O(1)
- Phrasing like "smallest \`x\` such that…" or "largest \`x\` such that…" — that's *literally* a boundary search

**Two non-negotiable details to get right**

1. **Half-open vs. closed intervals** — pick one and stick with it. The lower-bound template with \`lo, hi = 0, n\` (closed-open) is hard to get wrong because \`hi\` already encodes "not-found" and \`lo == hi\` is always the answer.
2. **\`mid = lo + (hi - lo) // 2\`** — overflow-safe in languages with bounded ints; in Python it's just a habit. More importantly, **biases mid toward \`lo\`**, which prevents the infinite loop \`mid == lo\` causes when \`hi - lo == 1\` and you assign \`lo = mid\`.

The illustrative example: find the **leftmost insertion point** for \`target\` (a.k.a. \`bisect_left\`).`,
    },
    {
        id: "cp4-c10",
        type: "code",
        content: `def lower_bound(nums, target):
    """Smallest index i such that nums[i] >= target. Returns len(nums) if none."""
    lo, hi = 0, len(nums)         # closed-open: [lo, hi)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] < target:    # predicate: nums[mid] >= target
            lo = mid + 1
        else:
            hi = mid
    return lo

a = [1, 3, 3, 3, 5, 7]
print(lower_bound(a, 3))   # 1  (first index where nums[i] >= 3)
print(lower_bound(a, 4))   # 4  (insertion point)
print(lower_bound(a, 0))   # 0
print(lower_bound(a, 99))  # 6  (== len(a) means "all smaller")`,
    },
    {
        id: "cp4-c11",
        type: "markdown",
        content: `**Variant 1 — search in a rotated sorted array**: the array is sorted but rotated by an unknown pivot, e.g. \`[4, 5, 6, 7, 0, 1, 2]\`. The trick is that **at least one half of \`[lo, mid] | [mid, hi]\` is still sorted** — check which one and use that to decide where the target could be.`,
    },
    {
        id: "cp4-c12",
        type: "code",
        content: `def search_rotated(nums, target):
    """O(log n) search in a rotated sorted array. Returns index or -1."""
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] == target:
            return mid
        # Decide which half is sorted, then check if target lies in it.
        if nums[lo] <= nums[mid]:                       # left half is sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:                                           # right half is sorted
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1

print(search_rotated([4, 5, 6, 7, 0, 1, 2], 0))   # 4
print(search_rotated([4, 5, 6, 7, 0, 1, 2], 3))   # -1
print(search_rotated([1], 1))                     # 0`,
    },
    {
        id: "cp4-c13",
        type: "markdown",
        content: `**Variant 2 — binary search on the answer space**: the input isn't sorted at all, but the *answer is a number with a monotonic property*. Example: *"What's the minimum ship capacity that completes all deliveries in \`D\` days?"* — capacity is monotonic (bigger capacity → never need more days), so binary search the capacity range.`,
    },
    {
        id: "cp4-c14",
        type: "code",
        content: `def ship_capacity(weights, days):
    """Min capacity such that all weights ship in <= days days, in order."""
    def can_finish(cap):
        used_days, load = 1, 0
        for w in weights:
            if load + w > cap:
                used_days += 1
                load = 0
            load += w
        return used_days <= days

    # Search space: [max(weights), sum(weights)]
    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if can_finish(mid):
            hi = mid          # try smaller
        else:
            lo = mid + 1      # need larger
    return lo

print(ship_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5))   # 15
print(ship_capacity([3, 2, 2, 4, 1, 4], 3))                 # 6`,
    },
    {
        id: "cp4-c15",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Compute the integer square root of \`n ≥ 0\` — the largest non-negative integer \`x\` such that \`x * x <= n\`. Use binary search on the **answer space** \`[0, n]\` (no \`math.sqrt\`, no \`** 0.5\`).

The predicate \`x * x > n\` is monotonic (once true, stays true), so the answer is *one less than the smallest \`x\` for which it's true*.`,
    },
    {
        id: "cp4-c16",
        type: "code",
        content: `def int_sqrt(n: int) -> int:
    # TODO: Binary-search the answer in [0, n].
    # Predicate: x * x > n  -> shrink hi.   Otherwise lo = mid + 1.
    # Return the largest x with x * x <= n.
    pass

# int_sqrt(0)  -> 0
# int_sqrt(1)  -> 1
# int_sqrt(8)  -> 2
# int_sqrt(16) -> 4
# int_sqrt(2147483647) -> 46340`,
    },
    {
        id: "cp4-c17",
        type: "code",
        content: `def int_sqrt(n: int) -> int:
    # Time: O(log n) | Space: O(1)
    if n < 2:
        return n
    lo, hi = 1, n // 2 + 1     # for n>=2, sqrt(n) <= n/2 + 1 (loose but safe)
    # Find smallest x in [lo, hi] with x*x > n; answer is x - 1.
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if mid * mid > n:
            hi = mid
        else:
            lo = mid + 1
    return lo - 1`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp4-test3",
        type: "code",
        content: `def _ref_fast_isqrt(n):
    if n < 2: return n
    lo, hi = 1, n // 2 + 1
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if mid * mid > n: hi = mid
        else: lo = mid + 1
    return lo - 1

def _ref_slow_isqrt(n):
    # Linear scan; O(sqrt(n)) but useful as a reference.
    x = 0
    while (x + 1) * (x + 1) <= n:
        x += 1
    return x

_check_solution(
    "int_sqrt",
    cases=[
        ((0,),  0,  "zero"),
        ((1,),  1,  "one"),
        ((4,),  2,  "perfect square"),
        ((8,),  2,  "between"),
        ((16,), 4,  "perfect square"),
        ((100,),10, "perfect square"),
        ((99,), 9,  "just under"),
    ],
    edge_cases=[
        ((2,),  1,  "smallest non-trivial"),
        ((3,),  1,  "still 1"),
        ((2147395600,), 46340, "near int32 boundary"),
    ],
    fast_impl=_ref_fast_isqrt,
    slow_impl=_ref_slow_isqrt,
    perf_inputs=[(10000,), (1000000,), (100000000,)],
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
        id: "cp4-c18",
        type: "markdown",
        content: `## 4.3 Recursion & Memoization

#### Concept Overview

**Recursive Thinking**
Recursion solves problems by breaking them into smaller subproblems of the same type. Every recursive function needs:
- **Base Case**: The condition that stops recursion (prevents infinite loops!)
- **Recursive Case**: The problem broken down into smaller pieces`,
    },
    {
        id: "cp4-c19",
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
        id: "cp4-c20",
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
        id: "cp4-c21",
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
        id: "cp4-c22",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (10-15 min)**: Write a recursive function to calculate the sum of all elements in a nested list. The list can contain integers or other lists.  
Example: \`nested_sum([1, [2, 3], [[4]], 5])\` → \`15\``,
    },
    {
        id: "cp4-c23",
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
        id: "cp4-c24",
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
        id: "cp4-test4",
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
        id: "cp4-c25",
        type: "markdown",
        content: `## 4.4 Tree Breadth-First Search

#### Concept Overview

Tree BFS — also called **level-order traversal** — visits a binary tree one *level* at a time, left to right. The implementation is a tiny specialization of graph BFS: a queue, no \`visited\` set (trees have no cycles), and the all-important **"snapshot the queue length at the start of each level"** trick.

**The mental model**: imagine pouring water into the root and watching it spread one row at a time. At any moment, the queue holds *exactly one full level* of nodes; you process all of them before any of their children get a turn.

\`\`\`
level 0:                 (1)
level 1:           (2)         (3)
level 2:        (4)   (5)   (6)   (7)
\`\`\`

**The key trick — \`for _ in range(len(queue))\`**

Vanilla BFS doesn't separate levels. To do *anything per-level* (level averages, right-side view, zigzag, level lists, depth-of-deepest-leaf), capture the level size **before** the inner loop:

\`\`\`python
while queue:
    size = len(queue)            # <-- snapshot: this is one full level
    for _ in range(size):
        node = queue.popleft()
        # ... handle node, enqueue children ...
\`\`\`

This one line unlocks an entire family of LeetCode problems.

**Pattern recognition cues**
- Asked for anything **per level**: averages, sums, max-per-level, right/left side view, zigzag order, "first node at depth d"
- Need the **shortest path** from root to a target node (BFS finds it in O(n))
- Asked to find a node at *minimum depth* satisfying some property
- "Connect each node's \`next\` pointer to its right neighbor" — a textbook BFS use case

**Why interviewers test this**: it's the cleanest possible demonstration that you can adapt a standard algorithm to a problem-specific bookkeeping requirement (the level snapshot). Candidates who reach for "I'll just do DFS and track depth" miss the elegance.

The illustrative example: classic level-order traversal returning a list-of-lists.`,
    },
    {
        id: "cp4-c26",
        type: "code",
        content: `from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def level_order(root):
    """Return a list of lists; one inner list per level, left to right."""
    if root is None:
        return []
    out = []
    queue = deque([root])
    while queue:
        size = len(queue)             # snapshot one full level
        level = []
        for _ in range(size):
            node = queue.popleft()
            level.append(node.val)
            if node.left:  queue.append(node.left)
            if node.right: queue.append(node.right)
        out.append(level)
    return out

#       1
#      / \\
#     2   3
#    / \\   \\
#   4   5   6
root = TreeNode(1,
            TreeNode(2, TreeNode(4), TreeNode(5)),
            TreeNode(3, None, TreeNode(6)))
print(level_order(root))   # [[1], [2, 3], [4, 5, 6]]
print(level_order(None))   # []`,
    },
    {
        id: "cp4-c27",
        type: "markdown",
        content: `**Composition example — right-side view**: stand to the right of the tree and report what you see at each level. With the level-snapshot pattern, the answer is "the **last** node visited per level".`,
    },
    {
        id: "cp4-c28",
        type: "code",
        content: `from collections import deque

def right_side_view(root):
    """Values of the rightmost node at each level (top to bottom)."""
    if root is None:
        return []
    out, queue = [], deque([root])
    while queue:
        size = len(queue)
        for i in range(size):
            node = queue.popleft()
            if i == size - 1:                 # last in this level
                out.append(node.val)
            if node.left:  queue.append(node.left)
            if node.right: queue.append(node.right)
    return out

print(right_side_view(root))   # [1, 3, 6]`,
    },
    {
        id: "cp4-c29",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Return the **zigzag level-order traversal** of a binary tree — level 0 left-to-right, level 1 right-to-left, level 2 left-to-right, and so on.

The cleanest solution still uses standard BFS (always enqueue left then right) and just **reverses every other level** when appending to the output. Avoid the temptation to mutate the queue direction — that obscures the pattern.`,
    },
    {
        id: "cp4-c30",
        type: "code",
        content: `from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def zigzag_level_order(root):
    # TODO: Standard BFS; for every other level reverse the level list
    # before appending to the output. Hint: keep a boolean "left_to_right"
    # that flips each iteration, or use level-index parity.
    pass

# zigzag of:    3
#              / \\
#             9  20
#                / \\
#               15  7
# -> [[3], [20, 9], [15, 7]]
# zigzag of None -> []
# zigzag of single node 1 -> [[1]]`,
    },
    {
        id: "cp4-c31",
        type: "code",
        content: `from collections import deque

def zigzag_level_order(root):
    # Time: O(n) | Space: O(n)
    if root is None:
        return []
    out, queue, ltr = [], deque([root]), True
    while queue:
        size = len(queue)
        level = []
        for _ in range(size):
            node = queue.popleft()
            level.append(node.val)
            if node.left:  queue.append(node.left)
            if node.right: queue.append(node.right)
        out.append(level if ltr else level[::-1])
        ltr = not ltr
    return out`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp4-test5",
        type: "code",
        content: `from collections import deque as _dq

class _TN:
    def __init__(self, v, l=None, r=None):
        self.val = v
        self.left = l
        self.right = r

def _from_level(vals):
    """Build a tree from a list using None for missing children (LeetCode-style)."""
    if not vals or vals[0] is None:
        return None
    root = _TN(vals[0])
    q = _dq([root]); i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals):
            v = vals[i]; i += 1
            if v is not None:
                node.left = _TN(v); q.append(node.left)
        if i < len(vals):
            v = vals[i]; i += 1
            if v is not None:
                node.right = _TN(v); q.append(node.right)
    return root

def _custom_zigzag(func):
    rows, p, f = [], 0, 0
    cases = [
        ([3, 9, 20, None, None, 15, 7], [[3], [20, 9], [15, 7]], "classic"),
        ([],                              [],                       "empty"),
        ([1],                             [[1]],                    "single"),
        ([1, 2, 3],                       [[1], [3, 2]],            "two levels"),
        ([1, 2, 3, 4, 5, 6, 7],           [[1], [3, 2], [4, 5, 6, 7]], "full 3 levels"),
        ([1, 2, None, 3],                 [[1], [2], [3]],          "left-skewed"),
        ([1, None, 2, None, 3],           [[1], [2], [3]],          "right-skewed"),
    ]
    for vals, expected, label in cases:
        try:
            got = func(_from_level(vals))
            if got == expected:
                rows.append(("pass", "main", label, "")); p += 1
            else:
                rows.append(("fail", "main", label, "got " + str(got) + " expected " + str(expected))); f += 1
        except Exception as e:
            rows.append(("fail", "main", label, type(e).__name__ + ": " + str(e))); f += 1
    return p, f, rows

_check_solution(
    "zigzag_level_order",
    cases=[],
    custom_test=_custom_zigzag,
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
        id: "cp4-c32",
        type: "markdown",
        content: `## 4.5 Tree Depth-First Search

#### Concept Overview

Tree DFS goes **deep before wide**: dive down one path until you hit a leaf, then backtrack and try the next. Where BFS gives you per-level information cheaply, DFS shines whenever the question is about a **root-to-leaf path** or a **subtree property** (sum, height, balance, "does this subtree match…").

**The three traversal orders** (mnemonic: *the root's position in the recursive call*):

\`\`\`
preorder:  ROOT, left, right    # visit before descending — useful for "copy tree", "serialize"
inorder:   left, ROOT, right    # for BSTs gives values in sorted order
postorder: left, right, ROOT    # visit after children — useful for "compute & propagate up"
\`\`\`

**Two complementary mental models you should be able to switch between**

1. **Top-down** (preorder, accumulator passed *down*): "I know the path so far. As I pass through this node, I update what I know and recurse with the new state."
2. **Bottom-up** (postorder, value bubbles *up*): "I trust my children to give me their answers. I combine them and return mine."

Most subtree problems collapse into one of these. *"Maximum path sum from root"* is top-down. *"Diameter of the tree"* is bottom-up. *"Is this tree balanced"* is bottom-up. *"Sum of all root-to-leaf numbers"* is top-down.

**Pattern recognition cues**
- Question is about a **path** (root-to-leaf, root-to-node, node-to-node) → DFS
- Question is about a **subtree** (sum, height, count, "is it a BST/balanced") → DFS, usually postorder
- Need to **build/serialize/clone** a tree → DFS preorder
- Stack space matters? Iterative DFS with an explicit stack — same algorithm, no recursion limit

**Recursion vs. explicit stack**: in interviews, lead with the recursive solution unless you're explicitly asked for iterative. State the recursion-stack space cost (\`O(h)\` where \`h\` is height — \`O(log n)\` balanced, \`O(n)\` worst case).

The illustrative example: compute the **maximum depth** of a binary tree (postorder, bottom-up).`,
    },
    {
        id: "cp4-c33",
        type: "code",
        content: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def max_depth(root):
    """Bottom-up DFS: trust children, combine, return."""
    if root is None:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))

#       1
#      / \\
#     2   3
#    /
#   4
root = TreeNode(1, TreeNode(2, TreeNode(4)), TreeNode(3))
print(max_depth(root))   # 3
print(max_depth(None))   # 0`,
    },
    {
        id: "cp4-c34",
        type: "markdown",
        content: `**Top-down example** — *sum of all root-to-leaf numbers*: each path from root to a leaf encodes a number (e.g. root=1 → 2 → 3 forms 123). Carry the running number **down** the recursion; emit at leaves.`,
    },
    {
        id: "cp4-c35",
        type: "code",
        content: `def sum_root_to_leaf(root):
    def dfs(node, current):
        if node is None:
            return 0
        current = current * 10 + node.val
        if node.left is None and node.right is None:    # leaf
            return current
        return dfs(node.left, current) + dfs(node.right, current)
    return dfs(root, 0)

#     1
#    / \\
#   2   3       paths: 1->2 (=12) and 1->3 (=13). Sum = 25
print(sum_root_to_leaf(TreeNode(1, TreeNode(2), TreeNode(3))))   # 25

#       4
#      / \\
#     9   0     paths: 4->9->5 (495), 4->9->1 (491), 4->0 (40). Sum = 1026
#    / \\
#   5   1
n4 = TreeNode(4, TreeNode(9, TreeNode(5), TreeNode(1)), TreeNode(0))
print(sum_root_to_leaf(n4))   # 1026`,
    },
    {
        id: "cp4-c36",
        type: "markdown",
        content: `**Iterative preorder** for completeness — same logic, explicit stack. Push children **right then left** so left pops first.`,
    },
    {
        id: "cp4-c37",
        type: "code",
        content: `def preorder_iterative(root):
    if root is None:
        return []
    out, stack = [], [root]
    while stack:
        node = stack.pop()
        out.append(node.val)
        if node.right: stack.append(node.right)   # pushed first => popped second
        if node.left:  stack.append(node.left)
    return out

print(preorder_iterative(n4))   # [4, 9, 5, 1, 0]`,
    },
    {
        id: "cp4-c38",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Determine if a binary tree is **height-balanced** — for every node, the heights of its two subtrees differ by at most 1.

The naive solution recomputes heights from scratch at every node (O(n²)). The pattern-aware **bottom-up** solution computes height *and* balance at the same time, returning a sentinel (e.g. \`-1\`) up the stack the moment imbalance is detected — yielding O(n).`,
    },
    {
        id: "cp4-c39",
        type: "code",
        content: `def is_balanced(root) -> bool:
    # TODO: Bottom-up DFS. Define an inner helper that returns the height
    # of the subtree rooted at 'node', or -1 if any subtree is unbalanced.
    # Combine: if either child returned -1 OR the heights differ by > 1,
    # propagate -1. Otherwise return 1 + max(left, right).
    # The tree is balanced iff the helper returns >= 0 at the root.
    pass

# Balanced: TreeNode(1, TreeNode(2), TreeNode(3))                     -> True
# Unbalanced: TreeNode(1, TreeNode(2, TreeNode(3, TreeNode(4))), None)-> False
# None        -> True`,
    },
    {
        id: "cp4-c40",
        type: "code",
        content: `def is_balanced(root) -> bool:
    # Time: O(n) | Space: O(h) recursion
    def height(node):
        if node is None:
            return 0
        lh = height(node.left)
        if lh == -1: return -1
        rh = height(node.right)
        if rh == -1: return -1
        if abs(lh - rh) > 1:
            return -1
        return 1 + max(lh, rh)
    return height(root) != -1`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp4-test6",
        type: "code",
        content: `from collections import deque as _dq

class _TN:
    def __init__(self, v, l=None, r=None):
        self.val = v; self.left = l; self.right = r

def _from_level(vals):
    if not vals or vals[0] is None:
        return None
    root = _TN(vals[0])
    q = _dq([root]); i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals):
            v = vals[i]; i += 1
            if v is not None:
                node.left = _TN(v); q.append(node.left)
        if i < len(vals):
            v = vals[i]; i += 1
            if v is not None:
                node.right = _TN(v); q.append(node.right)
    return root

def _custom_balanced(func):
    rows, p, f = [], 0, 0
    cases = [
        ([],                                    True,  "empty"),
        ([1],                                   True,  "single"),
        ([1, 2, 3],                             True,  "perfect 2"),
        ([1, 2, 3, 4, 5, 6, 7],                 True,  "perfect 3"),
        ([1, 2, None, 3],                       False, "left-skewed depth 3"),
        ([1, 2, 2, 3, 3, None, None, 4, 4],     False, "classic unbalanced"),
        ([3, 9, 20, None, None, 15, 7],         True,  "BFS classic - balanced"),
        ([1, 2, 2, 3, None, None, 3, 4, None, None, 4], False, "deep imbalance"),
    ]
    for vals, expected, label in cases:
        try:
            got = func(_from_level(vals))
            if got == expected:
                rows.append(("pass", "main", label, "")); p += 1
            else:
                rows.append(("fail", "main", label, "got " + str(got) + " expected " + str(expected))); f += 1
        except Exception as e:
            rows.append(("fail", "main", label, type(e).__name__ + ": " + str(e))); f += 1
    return p, f, rows

_check_solution(
    "is_balanced",
    cases=[],
    custom_test=_custom_balanced,
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
        id: "cp4-c41",
        type: "markdown",
        content: `## 4.6 Subsets & Backtracking

#### Concept Overview

Backtracking is the **systematic exploration of a choice tree** with the discipline to *undo* each choice before trying the next. It's the right tool whenever you need to enumerate (or count, or find one of) every valid configuration in a combinatorial space — subsets, permutations, combinations, valid arrangements (n-queens), valid expressions, valid sudoku boards, etc.

**The mental model — the choice tree**

\`\`\`
                            []
                  /                  \\
              [a]                     []          <-- "include a?"   yes / no
            /     \\                 /    \\
        [a,b]    [a]              [b]    []        <-- "include b?"
        / \\      / \\              / \\    / \\
      ...      ...               ...    ...        <-- "include c?"
\`\`\`

You're walking a tree where each level represents one decision. At a leaf you record (or count, or test) the result. The "back" in backtracking is the line that **undoes** the last choice on the way back up — so the next branch starts from a clean state.

**The canonical template — burn this into muscle memory**

\`\`\`python
def backtrack(state, choices):
    if is_solution(state):
        record(state)            # often: result.append(state[:])  -- COPY!
        return
    for choice in choices_at(state):
        if not is_valid(choice, state):
            continue                          # PRUNE: skip dead branches early
        state.append(choice)                  # CHOOSE
        backtrack(state, choices)             # EXPLORE
        state.pop()                           # UN-CHOOSE  <-- the "back"
\`\`\`

**Pattern recognition cues**
- "Generate **all** \\_\\_\\_": subsets, permutations, combinations, parenthesizations, palindrome partitions
- Constraint puzzles where you need *one* valid arrangement: n-queens, sudoku, word search
- Search-with-rollback over a recursive structure
- Brute force is exponential, but **clever pruning** makes it tractable

**The two ideas that separate good backtracking from bad**

1. **Mutate-and-undo, don't copy-the-state-down**. Pushing onto a shared list and popping on return is dramatically faster than passing fresh slices to every recursive call. *Always copy at the leaf*, never along the path.
2. **Prune as early as possible**. Every layer where you skip an invalid branch saves an entire subtree of work. The classic pruning techniques: *sort the input* so duplicates land adjacent (skip identical siblings), *track partial sums / counts* (cut off when constraint already violated), *use constraint propagation* (n-queens diagonals).

The illustrative example: generate **all subsets** of a list of distinct integers (the "power set"). Two equivalent formulations — the include/exclude binary tree, or the "start index" iterative-choice tree.`,
    },
    {
        id: "cp4-c42",
        type: "code",
        content: `def subsets(nums):
    """All subsets of a list of distinct integers. O(n * 2^n)."""
    result, path = [], []
    def backtrack(start):
        result.append(path[:])                # record at every node (subsets, not just leaves)
        for i in range(start, len(nums)):
            path.append(nums[i])              # CHOOSE
            backtrack(i + 1)                  # EXPLORE (next start excludes used)
            path.pop()                        # UN-CHOOSE
    backtrack(0)
    return result

print(subsets([1, 2, 3]))
# [[], [1], [1,2], [1,2,3], [1,3], [2], [2,3], [3]]
print(subsets([]))     # [[]]`,
    },
    {
        id: "cp4-c43",
        type: "markdown",
        content: `**The two things to notice**: \`path[:]\` (the copy at the leaf) and \`backtrack(i + 1)\` (the *start index* trick that prevents \`[1,2]\` and \`[2,1]\` from both appearing — for combinations/subsets order doesn't matter, so we only ever look forward).

**Permutations** look almost identical, but order *does* matter — so instead of a start index we track which elements are *used*:`,
    },
    {
        id: "cp4-c44",
        type: "code",
        content: `def permutations(nums):
    """All permutations. O(n * n!)."""
    result, path, used = [], [], [False] * len(nums)
    def backtrack():
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue                       # PRUNE: already in path
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()
            used[i] = False
    backtrack()
    return result

print(permutations([1, 2, 3]))
# [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]`,
    },
    {
        id: "cp4-c45",
        type: "markdown",
        content: `**Notice** how the template is identical — only \`is_solution\`, the choice generator, and \`is_valid\` change. Once you see this you can attack any backtracking problem by asking: *what's the choice at each step? what's the validity check? when is it a complete solution?*

#### Exercises

**Exercise (15 min)**: Given an integer \`n\`, generate **all combinations of well-formed parentheses** of length \`2n\`. For \`n = 3\`, the answer is:

\`["((()))", "(()())", "(())()", "()(())", "()()()"]\`

The choice at each step is "(" or ")". The validity rules — the **pruning** that makes this fast — are:
- You can place "(" only if you've used **fewer than \`n\` open** parens so far.
- You can place ")" only if there are **more open than closed** so far (otherwise it'd be unbalanced).

This is a textbook example of how *good pruning* turns an exponential search into a tractable one (Catalan-number many results).`,
    },
    {
        id: "cp4-c46",
        type: "code",
        content: `from typing import List

def generate_parentheses(n: int) -> List[str]:
    # TODO: backtracking with two counters: 'open_used' and 'close_used'.
    # Place '(' iff open_used < n.
    # Place ')' iff close_used < open_used.
    # When len(path) == 2 * n, append ''.join(path) (or path[:]) to result.
    pass

# generate_parentheses(0) -> [""]
# generate_parentheses(1) -> ["()"]
# generate_parentheses(2) -> ["(())", "()()"]
# generate_parentheses(3) -> ["((()))", "(()())", "(())()", "()(())", "()()()"]`,
    },
    {
        id: "cp4-c47",
        type: "code",
        content: `from typing import List

def generate_parentheses(n: int) -> List[str]:
    # Time: O(4^n / sqrt(n)) — Catalan growth | Space: O(n) recursion + output
    result, path = [], []
    def backtrack(open_used: int, close_used: int) -> None:
        if len(path) == 2 * n:
            result.append("".join(path))
            return
        if open_used < n:
            path.append("(")
            backtrack(open_used + 1, close_used)
            path.pop()
        if close_used < open_used:
            path.append(")")
            backtrack(open_used, close_used + 1)
            path.pop()
    backtrack(0, 0)
    return result`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp4-test7",
        type: "code",
        content: `def _ref_fast_parens(n):
    res, path = [], []
    def bt(o, c):
        if len(path) == 2 * n:
            res.append("".join(path)); return
        if o < n:
            path.append("("); bt(o + 1, c); path.pop()
        if c < o:
            path.append(")"); bt(o, c + 1); path.pop()
    bt(0, 0)
    return res

def _ref_slow_parens(n):
    # Brute force: enumerate every binary string of length 2n, filter valid.
    out = []
    def rec(s):
        if len(s) == 2 * n:
            bal = 0
            for ch in s:
                bal += 1 if ch == "(" else -1
                if bal < 0: return
            if bal == 0: out.append(s)
            return
        rec(s + "(")
        rec(s + ")")
    rec("")
    return out

def _custom_parens(func):
    rows, p, f = [], 0, 0
    cases = [
        (0, [""],                                                  "n=0"),
        (1, ["()"],                                                "n=1"),
        (2, ["(())", "()()"],                                      "n=2"),
        (3, ["((()))", "(()())", "(())()", "()(())", "()()()"],    "n=3"),
    ]
    for n, expected, label in cases:
        try:
            got = sorted(func(n))
            if got == sorted(expected):
                rows.append(("pass", "main", label, "")); p += 1
            else:
                rows.append(("fail", "main", label, "got " + str(got) + " expected " + str(sorted(expected)))); f += 1
        except Exception as e:
            rows.append(("fail", "main", label, type(e).__name__ + ": " + str(e))); f += 1
    # Also assert agreement against brute-force for n=4
    try:
        got = sorted(func(4)); exp = sorted(_ref_slow_parens(4))
        if got == exp:
            rows.append(("pass", "main", "n=4 vs brute force", "")); p += 1
        else:
            rows.append(("fail", "main", "n=4 vs brute force", "mismatch")); f += 1
    except Exception as e:
        rows.append(("fail", "main", "n=4 vs brute force", type(e).__name__ + ": " + str(e))); f += 1
    return p, f, rows

_check_solution(
    "generate_parentheses",
    cases=[],
    custom_test=_custom_parens,
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
        id: "cp4-c48",
        type: "markdown",
        content: `## 4.7 Top K Elements

#### Concept Overview

Whenever the question asks for the **top K** (or bottom K) of something — *the K largest, K smallest, K most frequent, K closest to the origin* — the right tool is almost always a **heap of size K**.

**The mental model**: maintain a small "leaderboard" of size K as you scan the data. For "K largest", use a **min-heap** of size K — the smallest of your current top-K is always at the root, ready to be evicted the moment you see something better. For "K smallest", flip the sign and use a **max-heap** (in Python: \`heapq\` is min-only, so push \`-x\` to fake max-heap behavior).

\`\`\`
For each item x in data:                # O(n)
    push x onto heap                    # O(log K)
    if len(heap) > K: pop_smallest      # O(log K)   (for "K largest")

Final heap holds the K largest items.   # Total: O(n log K), space O(K)
\`\`\`

**Pattern recognition cues**
- "K largest", "K smallest", "K most frequent", "K closest to ___"
- Streaming data — you can't sort because the data doesn't fit in memory, or it arrives one element at a time
- Need a *partial* sort, not a full one: full sort is O(n log n); top-K with a heap is O(n log K), which is much better when K << n

**Why \`O(n log K)\` beats \`O(n log n)\`**: when K is small (say K = 10 over a million items), \`log K\` is constant-ish (≈3) while \`log n\` is ≈20. The heap approach also handles **streaming** input naturally — you never need the full data in memory.

**Compare to alternatives**
- \`sorted(data)[-k:]\` — simple, O(n log n) time, O(n) space
- \`heapq.nlargest(k, data)\` — Python builtin, O(n log K) time, O(K) space (uses exactly this pattern internally)
- Quickselect — O(n) average, O(n²) worst, in-place; great for "find the Kth", awkward for streaming

In an interview, name all three and pick the right one for the constraints (streaming → heap; one-shot finite data with no memory limit → sort or \`nlargest\`; in-place + average performance → quickselect).

The illustrative example: find the **K largest** elements of a list with a min-heap of size K.`,
    },
    {
        id: "cp4-c49",
        type: "code",
        content: `import heapq

def k_largest(nums, k):
    """Return the K largest elements (in ascending order). O(n log k) time, O(k) space."""
    if k <= 0 or not nums:
        return []
    heap = []                                  # min-heap; root is smallest of current top-K
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:                      # better than our smallest top-K
            heapq.heapreplace(heap, x)         # pop + push in one step
    return sorted(heap)                        # ascending; sort is O(k log k)

print(k_largest([3, 2, 1, 5, 6, 4], 2))    # [5, 6]
print(k_largest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4))  # [4, 5, 5, 6]
print(k_largest([1], 1))                    # [1]`,
    },
    {
        id: "cp4-c50",
        type: "markdown",
        content: `**Variation — K most frequent**: count first with \`Counter\`, then run the same heap pattern on \`(count, value)\` pairs. The heap holds at most K, so total work is \`O(n + m log K)\` where \`m\` is the number of distinct values.`,
    },
    {
        id: "cp4-c51",
        type: "code",
        content: `import heapq
from collections import Counter

def top_k_frequent(nums, k):
    """K most frequent values, ordered by frequency descending."""
    counts = Counter(nums)
    heap = []                                  # min-heap of (count, value)
    for value, count in counts.items():
        if len(heap) < k:
            heapq.heappush(heap, (count, value))
        elif count > heap[0][0]:
            heapq.heapreplace(heap, (count, value))
    # Return values in descending order of frequency
    return [v for _, v in sorted(heap, reverse=True)]

print(top_k_frequent([1, 1, 1, 2, 2, 3], 2))   # [1, 2]
print(top_k_frequent([1], 1))                   # [1]
print(top_k_frequent(["a","b","a","c","b","a"], 2))   # ['a', 'b']`,
    },
    {
        id: "cp4-c52",
        type: "markdown",
        content: `#### Exercises

**Exercise (10–15 min)**: Given a list of points \`points\` (each \`[x, y]\`) and an integer \`k\`, return the **K points closest to the origin**.

The tempting answer is \`sorted(points, key=dist)[:k]\` — O(n log n). The pattern-aware answer is a **max-heap of size K** (so the *farthest* of your current best-K can be evicted the moment something closer shows up) — O(n log K).

Since Python's \`heapq\` is a min-heap, simulate a max-heap by pushing \`(-distance², point)\`.

> **Note**: there's no need to take a square root — comparing squared distances gives the same ordering and avoids floating-point arithmetic.`,
    },
    {
        id: "cp4-c53",
        type: "code",
        content: `from typing import List
import heapq

def k_closest_points(points: List[List[int]], k: int) -> List[List[int]]:
    # TODO: maintain a max-heap of size K of (-(x**2 + y**2), x, y).
    # When the heap exceeds K elements, pop the worst (i.e. heapq.heappop:
    # the most-negative -dist^2 — meaning the largest dist^2). At the end,
    # extract the points (any order is acceptable).
    pass

# k_closest_points([[1,3],[-2,2]], 1)              -> [[-2,2]]
# k_closest_points([[3,3],[5,-1],[-2,4]], 2)       -> any 2 of [[3,3],[-2,4]]
# k_closest_points([[0,1],[1,0]], 2)               -> [[0,1],[1,0]] (any order)`,
    },
    {
        id: "cp4-c54",
        type: "code",
        content: `from typing import List
import heapq

def k_closest_points(points: List[List[int]], k: int) -> List[List[int]]:
    # Time: O(n log k) | Space: O(k)
    if k <= 0 or not points:
        return []
    heap = []   # max-heap simulated via negated distance
    for x, y in points:
        d = x * x + y * y
        if len(heap) < k:
            heapq.heappush(heap, (-d, x, y))
        elif -d > heap[0][0]:           # current point is closer than worst-in-heap
            heapq.heapreplace(heap, (-d, x, y))
    return [[x, y] for _, x, y in heap]`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp4-test8",
        type: "code",
        content: `import heapq as _hq

def _ref_fast_kclosest(points, k):
    if k <= 0 or not points: return []
    heap = []
    for x, y in points:
        d = x * x + y * y
        if len(heap) < k:
            _hq.heappush(heap, (-d, x, y))
        elif -d > heap[0][0]:
            _hq.heapreplace(heap, (-d, x, y))
    return [[x, y] for _, x, y in heap]

def _ref_slow_kclosest(points, k):
    return sorted(points, key=lambda p: p[0] * p[0] + p[1] * p[1])[:k]

def _custom_kclosest(func):
    rows, p, f = [], 0, 0
    cases = [
        ([[1, 3], [-2, 2]], 1, "single closest"),
        ([[3, 3], [5, -1], [-2, 4]], 2, "two closest"),
        ([[0, 1], [1, 0]], 2, "tie all"),
        ([[1, 1]], 1, "single point"),
        ([[1, 1], [2, 2], [3, 3], [4, 4]], 3, "k=3 of 4"),
        ([[10, 10], [-10, -10], [1, 1], [0, 0]], 2, "with origin"),
    ]
    for points, k, label in cases:
        try:
            got = sorted(func(points, k))
            expected = sorted(_ref_slow_kclosest(points, k))
            # Multiple correct answers possible when distances tie; check that
            # the multiset of squared distances matches.
            d_got = sorted(x*x + y*y for x, y in got)
            d_exp = sorted(x*x + y*y for x, y in expected)
            if d_got == d_exp and len(got) == k:
                rows.append(("pass", "main", label, "")); p += 1
            else:
                rows.append(("fail", "main", label,
                    "got " + str(got) + " (dists " + str(d_got) + ") expected dists " + str(d_exp))); f += 1
        except Exception as e:
            rows.append(("fail", "main", label, type(e).__name__ + ": " + str(e))); f += 1
    return p, f, rows

_check_solution(
    "k_closest_points",
    cases=[],
    custom_test=_custom_kclosest,
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
        id: "cp4-c55",
        type: "markdown",
        content: `## 4.8 Two Heaps

#### Concept Overview

The two-heaps pattern is the natural extension of the previous subsection: where one heap gives you the *extremes* of a stream, **two heaps in mirrored configuration** give you the **middle** of a stream. The canonical use case is computing a **running median** — but the same trick handles "schedule the next available task", "interval-based capacity", "sliding-window median", and any problem where you need the *k-th element of a continuously changing collection* in O(log n) per update.

**The mental model — two heaps facing each other**

Split the data in half: the **smaller** half goes into a **max-heap** (so its largest — the boundary element — is at the root); the **larger** half goes into a **min-heap** (so its smallest — also a boundary element — is at the root). The two roots are *adjacent* in sorted order, which is exactly what you need for the median.

\`\`\`
... small values ...    [median lives here]    ... large values ...
       max-heap                                       min-heap
       root = largest                                 root = smallest
       of the lower half                              of the upper half
\`\`\`

Maintain two **balance invariants**:
1. **Order**: every element in the max-heap ≤ every element in the min-heap.
2. **Size**: \`|max_heap| == |min_heap|\` *or* \`|max_heap| == |min_heap| + 1\` (max-heap can hold one extra so the median for odd-length streams sits at its root).

After each insertion, rebalance: if you violated the order invariant, move the offending root across; if you violated the size invariant, move one root across.

**Pattern recognition cues**
- "Find the median of …" especially **as data streams in** or **over a sliding window**
- Need **the middle element** (or a fraction-th element like the 25th percentile) of a constantly-changing set
- Need to know "what's at the boundary between the small half and the large half" cheaply
- Sorted set / order-statistics tree would also work, but Python's stdlib doesn't ship one — two heaps are the idiomatic substitute

**Why interviewers love this one**: it's compact, it shows you can compose simpler data structures into something more powerful, and the *invariant maintenance* is exactly the kind of careful per-operation reasoning senior interviewers probe for.

The illustrative example: the **MedianFinder** class — \`add_num\` in O(log n), \`find_median\` in O(1).`,
    },
    {
        id: "cp4-c56",
        type: "code",
        content: `import heapq

class MedianFinder:
    """Streaming median: add_num is O(log n), find_median is O(1)."""

    def __init__(self):
        self.lo = []   # max-heap (negated): the smaller half
        self.hi = []   # min-heap:           the larger half
        # Invariant: len(lo) == len(hi)  OR  len(lo) == len(hi) + 1

    def add_num(self, num):
        # 1) Place the new element provisionally in lo (the max-heap).
        heapq.heappush(self.lo, -num)
        # 2) Order-fix: top of lo must be <= top of hi. Move if violated.
        if self.hi and -self.lo[0] > self.hi[0]:
            heapq.heappush(self.hi, -heapq.heappop(self.lo))
        # 3) Size-fix: lo can be at most one larger than hi.
        if len(self.lo) > len(self.hi) + 1:
            heapq.heappush(self.hi, -heapq.heappop(self.lo))
        elif len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi))

    def find_median(self):
        if len(self.lo) > len(self.hi):
            return float(-self.lo[0])
        return (-self.lo[0] + self.hi[0]) / 2.0

mf = MedianFinder()
for x in [1, 2, 3, 4, 5]:
    mf.add_num(x)
    print("after", x, "->", mf.find_median())
# after 1 -> 1.0
# after 2 -> 1.5
# after 3 -> 2.0
# after 4 -> 2.5
# after 5 -> 3.0`,
    },
    {
        id: "cp4-c57",
        type: "markdown",
        content: `**Trace through "5, 2, 4, 3, 1" by hand once** — there's no substitute. You'll see how each insertion triggers exactly one of the rebalancing branches, and how the invariants make the median trivially readable from the heap roots.

The same skeleton handles **percentiles other than the median** by changing the size invariant (e.g. for the 25th percentile, keep \`|lo|\` ≈ \`n/4\`).

#### Exercises

**Exercise (15 min)**: Compute the **sliding-window median** — given an array \`nums\` and a window size \`k\`, return the median of every contiguous window of size \`k\` (so the result has length \`len(nums) - k + 1\`).

The straightforward approach (sort each window, O(n·k·log k)) is too slow. The pattern-aware approach reuses the two-heaps idea but adds **lazy deletion** to handle elements leaving the window: mark elements as removed in a counter and **only purge them from the heap roots** (when they're about to affect the answer). This keeps each window update at O(log k).

Aim for: O((n - k) · log k) time, O(k) space. Do not use \`statistics.median\` or sort each window.`,
    },
    {
        id: "cp4-c58",
        type: "code",
        content: `from typing import List
import heapq

def sliding_window_median(nums: List[int], k: int) -> List[float]:
    # TODO: Two heaps + lazy deletion.
    # 1) lo (max-heap, negated) = smaller half of the window
    #    hi (min-heap)           = larger half
    # 2) Use a dict 'to_remove' counting elements pending lazy deletion.
    # 3) After each shift of the window:
    #    - schedule lazy removal of the outgoing element
    #    - insert the incoming element with the usual order/size rebalancing
    #    - call a 'prune' helper that pops from a heap's root while its
    #      top is in to_remove (decrement count, pop heap)
    # 4) Read the median from the (pruned) heap roots.
    pass

# sliding_window_median([1,3,-1,-3,5,3,6,7], 3) -> [1.0, -1.0, -1.0, 3.0, 5.0, 6.0]
# sliding_window_median([1,2,3,4,2,3,1,4,2], 3) -> [2.0, 3.0, 3.0, 3.0, 2.0, 3.0, 2.0]
# sliding_window_median([1,2], 1)               -> [1.0, 2.0]`,
    },
    {
        id: "cp4-c59",
        type: "code",
        content: `from typing import List
import heapq
from collections import defaultdict

def sliding_window_median(nums: List[int], k: int) -> List[float]:
    # Time: O(n log k) | Space: O(k)
    lo: list = []   # max-heap (negated): smaller half
    hi: list = []   # min-heap          : larger half
    to_remove: dict = defaultdict(int)
    lo_size = hi_size = 0     # logical sizes (excluding pending lazy removals)

    def prune(heap):
        # Pop any to-be-removed elements that have surfaced at the root.
        sign = -1 if heap is lo else 1
        while heap and to_remove[sign * heap[0]] > 0:
            to_remove[sign * heap[0]] -= 1
            heapq.heappop(heap)

    def rebalance():
        nonlocal lo_size, hi_size
        if lo_size > hi_size + 1:
            heapq.heappush(hi, -heapq.heappop(lo))
            lo_size -= 1; hi_size += 1
            prune(lo)
        elif hi_size > lo_size:
            heapq.heappush(lo, -heapq.heappop(hi))
            hi_size -= 1; lo_size += 1
            prune(hi)

    def median():
        if k % 2 == 1:
            return float(-lo[0])
        return (-lo[0] + hi[0]) / 2.0

    # Initial window
    for x in nums[:k]:
        heapq.heappush(lo, -x); lo_size += 1
        if hi and -lo[0] > hi[0]:
            heapq.heappush(hi, -heapq.heappop(lo))
            lo_size -= 1; hi_size += 1
        rebalance()

    out = [median()]
    for i in range(k, len(nums)):
        outgoing, incoming = nums[i - k], nums[i]

        # Schedule lazy removal of outgoing
        to_remove[outgoing] += 1
        if outgoing <= -lo[0]:
            lo_size -= 1
            if outgoing == -lo[0]:
                prune(lo)
        else:
            hi_size -= 1
            if outgoing == hi[0]:
                prune(hi)

        # Insert incoming
        if not lo or incoming <= -lo[0]:
            heapq.heappush(lo, -incoming); lo_size += 1
        else:
            heapq.heappush(hi, incoming);   hi_size += 1

        rebalance()
        out.append(median())
    return out`,
        metadata: {
            pynote: {
                codeview: { showCode: false },
                placeholder: "<- Toggle visibility to see exercise solution"
            }
        },
    },
    {
        id: "cp4-test9",
        type: "code",
        content: `def _ref_slow_swm(nums, k):
    out = []
    for i in range(len(nums) - k + 1):
        w = sorted(nums[i:i + k])
        if k % 2 == 1:
            out.append(float(w[k // 2]))
        else:
            out.append((w[k // 2 - 1] + w[k // 2]) / 2.0)
    return out

def _custom_swm(func):
    rows, p, f = [], 0, 0
    cases = [
        ([1, 3, -1, -3, 5, 3, 6, 7], 3, "classic odd window"),
        ([1, 2, 3, 4, 2, 3, 1, 4, 2], 3, "many duplicates"),
        ([1, 4, 2, 3], 4, "single window"),
        ([1, 2], 1, "k=1 trivial"),
        ([5, 5, 5, 5, 5], 3, "all equal"),
        ([1, 2, 3, 4, 5, 6], 2, "even window"),
        ([10, -10, 10, -10, 10, -10], 4, "alternating + even window"),
    ]
    for nums, k, label in cases:
        try:
            got = func(nums, k)
            expected = _ref_slow_swm(nums, k)
            ok = (len(got) == len(expected) and
                  all(abs(a - b) < 1e-9 for a, b in zip(got, expected)))
            if ok:
                rows.append(("pass", "main", label, "")); p += 1
            else:
                rows.append(("fail", "main", label,
                    "got " + str(got) + " expected " + str(expected))); f += 1
        except Exception as e:
            rows.append(("fail", "main", label, type(e).__name__ + ": " + str(e))); f += 1
    return p, f, rows

_check_solution(
    "sliding_window_median",
    cases=[],
    custom_test=_custom_swm,
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
        id: "cp4-footer",
        type: "markdown",
        content: `---

## Section complete!

← Previous: [Section 3: Algorithms](?open=coding-prep-3) &nbsp;|&nbsp; [Back to Table of Contents](?open=coding-prep) &nbsp;|&nbsp; Next: [Section 5: Next Steps](?open=coding-prep-5) →`,
    },
];
