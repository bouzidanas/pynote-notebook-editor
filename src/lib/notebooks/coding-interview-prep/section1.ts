import type { CellData } from "../../store";

// Coding Interview Prep - Section 1: Basic Python & Scripting
export const codingPrepSection1Cells: CellData[] = [
    {
        id: "cp1-h",
        type: "markdown",
        content: `[← Back to Table of Contents](?open=coding-prep)`,
    },
    {
        id: "cp1-helper",
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
        id: "cp1-h2",
        type: "markdown",
        content: `# Section 1: Basic Python & Scripting

*Part 1 of the Python Interview Prep series.*

---`,
    },
    {
        id: "cp1-c1",
        type: "markdown",
        content: `## 1.1 Strings, Lists & Tuples

#### Concept Overview

**1. Mutability vs. Immutability:**
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
        content: `##### Type Conversions & Casting

Most built-in types double as **constructors** — call them like a function to convert between types. This is essential for moving between mutable/immutable forms (e.g. swapping a \`Counter\` back to a \`dict\`, or a \`set\` back to a \`list\` to index it).

| Constructor | Accepts | Result |
|---|---|---|
| \`list(iterable)\` | any iterable | mutable list |
| \`tuple(iterable)\` | any iterable | immutable, hashable (if items are) |
| \`set(iterable)\` | any iterable | mutable, unique items, unordered |
| \`frozenset(iterable)\` | any iterable | immutable set, hashable |
| \`dict(iterable_of_pairs)\` or \`dict(**kwargs)\` | pairs/mapping | mutable mapping |
| \`str(obj)\` | any object | string representation |
| \`int(x)\`, \`float(x)\` | str/number | numeric (raises \`ValueError\` on bad str) |
| \`bool(x)\` | any | \`False\` for \`0\`, \`""\`, \`[]\`, \`{}\`, \`None\`; else \`True\` |

**Common patterns interviewers expect you to know cold:**`,
    },
    {
        id: "cp1-c4",
        type: "code",
        content: `from collections import Counter

# String <-> list of chars
list("hello")          # ['h', 'e', 'l', 'l', 'o']
"".join(['h', 'i'])    # 'hi'  (join is the inverse of list(str))

# List <-> set (deduplicate, then restore list type)
list(set([1, 1, 2, 3, 3]))   # [1, 2, 3]  (order not guaranteed)

# List <-> tuple (make hashable so it can be a dict key / set member)
tuple([1, 2, 3])             # (1, 2, 3)
list((1, 2, 3))              # [1, 2, 3]

# Counter -> dict (Counter IS a dict subclass, but cast for clean output / type checks)
dict(Counter("banana"))      # {'b': 1, 'a': 3, 'n': 2}

# dict <-> list of (key, value) pairs
list({"a": 1, "b": 2}.items())   # [('a', 1), ('b', 2)]
dict([('a', 1), ('b', 2)])       # {'a': 1, 'b': 2}

# Range -> list (range is lazy; cast to materialize)
list(range(5))               # [0, 1, 2, 3, 4]

print(list("hello"), list(set([1,1,2])), tuple([1,2,3]), dict(Counter("aab")))`,
    },
    {
        id: "cp1-c5",
        type: "markdown",
        content: `##### Common Built-in Functions

These are commonly used utility functions in Python. Mastering them pays off well beyond interviews: they show up in nearly every script, library, and production codebase.

**Driving loops & iteration:**
You use these when *moving through* a sequence. They replace the manual \`for i in range(len(x))\` index-juggling pattern.

| Function | Role |
|---|---|
| \`range(stop)\` / \`range(start, stop, step)\` | Generate a lazy sequence of integers to loop over |
| \`enumerate(iterable, start=0)\` | Loop while tracking the index — \`for i, x in enumerate(...)\` |
| \`zip(*iterables)\` | Loop over multiple sequences in lockstep; stops at shortest |
| \`reversed(seq)\` | Iterate from the end without copying/slicing |

*Example:*`,
    },
    {
        id: "cp1-c6",
        type: "code",
        content: `nums = [3, 1, 4, 1, 5]

# enumerate: index + value together
for i, n in enumerate(nums):
    if n == 5:
        print("found 5 at index", i)

# zip: pair items from two sequences
keys = ["a", "b", "c"]
vals = [1, 2, 3]
for k, v in zip(keys, vals):
    print(k, "->", v)

# reversed: walk backwards without slicing a copy
for n in reversed(nums):
    print(n, end=" ")
print()

# range: counted loops and index ranges
for i in range(0, 10, 2):
    print(i, end=" ")`,
    },
    {
        id: "cp1-c7",
        type: "markdown",
        content: `**Asking questions (predicates & comparisons):**
You use these inside \`if\` statements, guards, and assertions. They answer a yes/no or "which one wins" question. Most short-circuit, so they're cheap.

| Function | Role |
|---|---|
| \`len(x)\` | "How big is it?" — also used as a guard (\`if len(x) >= n\`) |
| \`any(iterable)\` | "Is there *at least one* truthy item?" |
| \`all(iterable)\` | "Are they *all* truthy?" |
| \`min(iterable)\` / \`max(iterable)\` | "Which one is smallest/largest?" — supports \`key=\` |
| \`abs(x)\` | "How far from zero?" — common in distance/diff checks |
| \`isinstance(obj, type_or_tuple)\` | "Is this the right kind of thing?" — preferred over \`type(x) == ...\` |
| \`type(obj)\` | Returns the object's class. Useful for introspection and error messages (\`type(x).__name__\`); for actual checks prefer \`isinstance\` |
| \`hash(obj)\` | "Is this hashable?" — raises \`TypeError\` if not (rarely called directly) |

*Example:*`,
    },
    {
        id: "cp1-c8",
        type: "code",
        content: `nums = [3, 1, 4, 1, 5, 9, 2, 6]

# any / all: boolean reductions in conditionals
if any(n > 8 for n in nums):
    print("contains a big one")
if all(n > 0 for n in nums):
    print("all positive")

# min/max with key=: pick the "winner" by a custom rule
words = ["pi", "tau", "phi"]
print(max(words, key=len))           # 'tau' (longest)
print(min(nums, key=lambda x: abs(x - 4)))  # closest to 4

# isinstance: robust type guard at function boundaries
def double(x):
    if not isinstance(x, (int, float)):
        raise TypeError("need a number")
    return x * 2
print(double(3.5))`,
    },
    {
        id: "cp1-c9",
        type: "markdown",
        content: `**Reshaping, aggregating & transforming:**
You use these to *produce a new value* from a collection: a sum, a sorted copy, a filtered or mapped sequence. They're the workhorses of "process this data" steps.

| Function | Role |
|---|---|
| \`sum(iterable, start=0)\` | Aggregate numbers into a total |
| \`sorted(iterable, key=..., reverse=...)\` | Return a **new sorted list** ($O(n \\log n)$) |
| \`map(func, iterable)\` | Lazily apply a function to every item (often replaceable by a comprehension) |
| \`filter(func, iterable)\` | Lazily keep items where \`func(item)\` is truthy |

> **Note on \`map\`/\`filter\`:** comprehensions (\`[f(x) for x in xs]\`, \`[x for x in xs if cond]\`) are usually clearer and equally fast. Reach for \`map\`/\`filter\` mainly when the function already exists by name.

*Example:*`,
    },
    {
        id: "cp1-c10",
        type: "code",
        content: `nums = [3, 1, 4, 1, 5, 9, 2, 6]

# sum: aggregate
print(sum(nums))                          # 31
print(sum(n * n for n in nums))           # sum of squares

# sorted: non-destructive sort with custom key
print(sorted([-5, 3, -1, 4], key=abs))    # [-1, 3, 4, -5]
print(sorted(nums, reverse=True))         # [9, 6, 5, 4, 3, 2, 1, 1]

# map / filter: point-free transforms
print(list(map(str, nums)))               # ['3', '1', '4', ...]
print(list(filter(lambda n: n % 2 == 0, nums)))  # [4, 2, 6]

# Comprehension equivalents (usually preferred for readability):
print([str(n) for n in nums])
print([n for n in nums if n % 2 == 0])`,
    },
    {
        id: "cp1-c11",
        type: "markdown",
        content: `**2. List Comprehensions:**
A list comprehension is a concise and highly optimized way to construct lists. It operates under the hood in C, making it fundamentally faster than a standard \`for\` loop combined with \`.append()\`.
*Syntax*: \`[expression for item in iterable if condition]\`
*Example:*`,
    },
    {
        id: "cp1-c12",
        type: "code",
        content: `# Create a list of the squares of even numbers from 0 to 9
squares = [x**2 for x in range(10) if x % 2 == 0]
print(squares)  # [0, 4, 16, 36, 64]`,
    },
    {
        id: "cp1-c13",
        type: "markdown",
        content: `**3. Generators vs list comprehensions:**
While a list comprehension generates the *entire sequence* and loads it into memory eagerly, a **generator expression** evaluates *lazily*. It suspends its state and yields one item at a time only when requested. This is crucial when dealing with massive datasets (e.g., millions of records) to prevent Out-Of-Memory (OOM) errors. Generator comprehensions use parentheses \`()\`.
*Example:*`,
    },
    {
        id: "cp1-c14",
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
        id: "cp1-c15",
        type: "markdown",
        content: `**4. Tuples & Slicing:**
Tuples are generally used for fixed-size configurations or returning multiple variables from a function. Because tuples are immutable, they are *hashable* (assuming their contents are also immutable), which means they can be used as Dictionary Keys!
Slicing \`[start:stop:step]\` creates a shallow copy of a sequence. \`my_array[::-1]\` reverses it!

#### Exercises

**Exercise 1 (5-10 min)**: Write a function that takes a list of words and returns a new list containing only the words that have at least \`n\` characters.`,
    },
    {
        id: "cp1-c16",
        type: "code",
        content: `from typing import List

def filter_words(words: List[str], min_length: int) -> List[str]:
    # TODO: Implement
    pass`,
    },
    {
        id: "cp1-c17",
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
        (([], 3), [], "Empty word list",
         'Pass an empty list with \`min_length=3\`. With no words to inspect, the result must be an empty list regardless of the threshold.'),
        ((["hello", "world", "a", "bc"], 3), ["hello", "world"],
         "Keep words at least 3 characters long",
         'Set \`min_length=3\` so the threshold is 3. Only "hello" (len 5) and "world" (len 5) qualify; "a" (len 1) and "bc" (len 2) are filtered out.'),
        ((["a", "bb", "ccc", "dddd"], 2), ["bb", "ccc", "dddd"],
         "Lower threshold of 2 characters",
         'Set \`min_length=2\`. The single-character "a" is dropped; "bb", "ccc", "dddd" all meet the threshold and are kept in their original order.'),
        ((["python", "is", "fun"], 1), ["python", "is", "fun"],
         "Threshold of 1 keeps every non-empty word",
         'Set \`min_length=1\` so every non-empty word qualifies. The output is identical to the input list.'),
    ],
    edge_cases=[
        ((["abc"], 5), [], "Threshold larger than every input word",
         'Set \`min_length=5\` while the only word is just 3 characters long. No word passes the check, so the result is an empty list.'),
        ((["", "a", "abc"], 1), ["a", "abc"], "Empty strings are filtered out",
         'Set \`min_length=1\`. The empty string has length 0 so it is dropped; "a" and "abc" both meet the threshold.'),
        ((["same", "same", "same"], 4), ["same", "same", "same"],
         "Duplicate words are preserved",
         'All three inputs are exactly 4 characters (= \`min_length\`). Duplicates should be returned in the same order, not deduplicated.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c18",
        type: "markdown",
        content: `**Exercise 2 (5-10 min)**: Write a function that returns the reverse of a given string.`,
    },
    {
        id: "cp1-c19",
        type: "code",
        content: `def reverse_string(s: str) -> str:
    # TODO: Implement
    pass

# Example: reverse_string("hello") -> "olleh"
# Example: reverse_string("Python") -> "nohtyP"
# Example: reverse_string("") -> ""`,
    },
    {
        id: "cp1-c20",
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
        (("hello",), "olleh", "Basic lowercase word",
         'Pass an ordinary lowercase word. The characters should appear in reverse order in the returned string.'),
        (("Python",), "nohtyP", "Mixed-case word",
         'Pass a word with a capital letter. Capitalization must be preserved on the original characters even though their positions are reversed.'),
        (("",), "", "Empty string",
         'Pass an empty string. There are no characters to reverse, so the function should return an empty string.'),
        (("a",), "a", "Single character",
         'Pass a one-character string. A single character is its own reverse.'),
        (("racecar",), "racecar", "Palindrome",
         'Pass a palindrome. The reversed string equals the original, so output should match input exactly.'),
    ],
    edge_cases=[
        (("ab",), "ba", "Two characters swap",
         'Pass a 2-character string. The two characters simply swap positions.'),
        (("12345",), "54321", "Digit string",
         'Pass a string of digits. Non-alphabetic characters must reverse the same way as letters.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c21",
        type: "markdown",
        content: `## 1.2 Dictionaries & Sets

#### Concept Overview

**1. Hash Tables & Lookups:**
Python's \`dict\` and \`set\` are implemented relying on Hash Tables. When you insert a key into a dictionary, Python runs a mathematical hash function \`hash(key)\` to determine strictly where in memory the data should be stored (a bucket index). 
- **Time Complexity:** Looking up, verifying membership (\`if x in my_set\`), inserting, and deleting generally take **$O(1)$ constant time**. Comparatively, searching a list is $O(N)$ linear time!
  
**2. Hash Collisions:**
Sometimes two entirely different keys will result in the same hash index. This is a collision. Python dicts resolve this using *open addressing and pseudo-random probing*—if bucket $A$ is full, the compiler mathematically probes to bucket $B$ until it finds an empty slot.

**3. Sets:**
A \`set\` is effectively a dictionary containing just keys. Sets enforce mathematical uniqueness (implicitly dropping duplicates) and offer optimized Set Operations:
*Example:*`,
    },
    {
        id: "cp1-c22",
        type: "code",
        content: `fruits_A = {"Apple", "Banana", "Cherry"}
fruits_B = {"Cherry", "Mango"}

print(fruits_A | fruits_B) # Union: {'Apple', 'Banana', 'Cherry', 'Mango'}
print(fruits_A & fruits_B) # Intersection: {'Cherry'}`,
    },
    {
        id: "cp1-c23",
        type: "markdown",
        content: `**4. The \`collections\` Module:**
Python offers advanced variants of dictionaries tailored to specific use-cases:
- \`defaultdict\`: Automatically provides a default value if a key doesn't exist, eliminating \`KeyError\`.
- \`Counter\`: specialized subset designed exclusively to construct frequency maps from an iterable.

*Example:*`,
    },
    {
        id: "cp1-c24",
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
        id: "cp1-c25",
        type: "markdown",
        content: `##### Common Dict & Set Operations

The methods you'll reach for in nearly every dict/set problem:

**Dicts**
| Operation | Notes |
|---|---|
| \`d[key]\` | Lookup; raises \`KeyError\` if missing |
| \`d.get(key, default)\` | Lookup with fallback — never raises |
| \`d.setdefault(key, default)\` | Insert default if missing, return current value |
| \`d.keys()\`, \`d.values()\`, \`d.items()\` | View objects (live, iterable) |
| \`d.update(other)\` | Merge another dict in-place |
| \`d.pop(key, default)\` | Remove and return; default avoids \`KeyError\` |
| \`key in d\` | Membership test — $O(1)$ |
| \`{**d1, **d2}\` or \`d1 \\| d2\` (3.9+) | Merge into a new dict |

**Sets**
| Operation | Notes |
|---|---|
| \`s.add(x)\` / \`s.remove(x)\` / \`s.discard(x)\` | \`remove\` raises if missing; \`discard\` doesn't |
| \`s1 \\| s2\` / \`.union\` | Union |
| \`s1 & s2\` / \`.intersection\` | Intersection |
| \`s1 - s2\` / \`.difference\` | In s1 but not s2 |
| \`s1 ^ s2\` / \`.symmetric_difference\` | In exactly one |
| \`s1 <= s2\` / \`.issubset\` | Subset test |
| \`x in s\` | Membership — $O(1)$ |

*Example:*`,
    },
    {
        id: "cp1-c26",
        type: "code",
        content: `# Dict patterns
d = {"a": 1, "b": 2}
print(d.get("c", 0))           # 0  (no KeyError)
d.setdefault("c", []).append(1)  # initializes 'c' to [] then appends
print(d)                       # {'a': 1, 'b': 2, 'c': [1]}

# Iterate over key/value pairs
for k, v in {"x": 10, "y": 20}.items():
    print(k, "->", v)

# Merge dicts
print({"a": 1} | {"b": 2})     # {'a': 1, 'b': 2}  (Python 3.9+)

# Set patterns
a = {1, 2, 3}
b = {3, 4, 5}
print(a | b)                   # {1, 2, 3, 4, 5}
print(a & b)                   # {3}
print(a - b)                   # {1, 2}
print(a ^ b)                   # {1, 2, 4, 5}

# Build a set from any iterable (deduplicate)
print(set("mississippi"))      # {'m', 'i', 's', 'p'}

# Set comprehension
print({x * x for x in range(5)})  # {0, 1, 4, 9, 16}`,
    },
    {
        id: "cp1-c27",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (5-10 min)**: Given a sentence (a string of words separated by spaces), determine and return the frequency of each word. Ignore case/punctuation for simplicity.`,
    },
    {
        id: "cp1-c28",
        type: "code",
        content: `from typing import Dict

def count_words(sentence: str) -> Dict[str, int]:
    # TODO: Implement
    pass`,
    },
    {
        id: "cp1-c29",
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
        (("the cat sat on the mat",), {"the": 2, "cat": 1, "sat": 1, "on": 1, "mat": 1},
         "Sentence with one repeated word",
         'Pass a sentence where "the" appears twice and the rest appear once. The returned dict maps each unique word to its frequency.'),
        (("hello hello hello",), {"hello": 3}, "Same word repeated",
         'All three tokens are the word "hello". The dict should have one key with count 3.'),
        (("a b c a b a",), {"a": 3, "b": 2, "c": 1}, "Three words with different frequencies",
         'Three distinct words appear with counts 3, 2, and 1. Each gets its own entry in the dict.'),
    ],
    edge_cases=[
        (("",), {}, "Empty string",
         'Pass an empty string. There are no words to count, so the function should return an empty dict.'),
        (("Hello hello HELLO",), {"hello": 3}, "Case-insensitive counting",
         'Pass three differently-cased copies of the same word. The function should normalize to lowercase before counting, producing a single entry \`"hello": 3\`.'),
        (("one",), {"one": 1}, "Single word",
         'Pass a single word with no spaces. The result is a dict with that one word mapped to 1.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c30",
        type: "markdown",
        content: `**Exercise 2 (5-10 min)**: Given two lists of integers, return a list containing their intersection (common elements) without duplicates.`,
    },
    {
        id: "cp1-c31",
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
        id: "cp1-c32",
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
        (([1, 2, 3, 4], [3, 4, 5, 6]), [3, 4], "Two lists with partial overlap",
         'Pass two lists that share \`3\` and \`4\`. The result should contain exactly the common elements.'),
        (([1, 1, 2], [1, 1, 3]), [1], "Duplicates are removed from the result",
         '\`1\` appears twice in each input list, but the intersection should list it only once: results contain no duplicates.'),
        (([1, 2, 3], [1, 2, 3]), [1, 2, 3], "Identical lists",
         'When both inputs are the same list, every element is shared, so the intersection equals that list (deduplicated).'),
    ],
    edge_cases=[
        (([1, 2], [3, 4]), [], "No common elements",
         'The two lists are disjoint (no shared values), so the intersection is empty.'),
        (([], [1, 2]), [], "First list is empty",
         'The first list is empty, so it shares nothing with the second; the result is an empty list.'),
        (([1, 2], []), [], "Second list is empty",
         'The second list is empty, so it shares nothing with the first; the result is an empty list.'),
        (([], []), [], "Both lists empty",
         'Both inputs are empty, so there is trivially no overlap.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c33",
        type: "markdown",
        content: `## 1.3 Hash Tables & Hashability

#### Concept Overview

**1. What Does "Hashable" Mean?**
An object is **hashable** if it meets two strict requirements:
1. It has a **hash value** (an integer) that **never changes** during its entire lifetime.
2. It can be **compared to other objects** (using \`==\`).

**Critical Rule:** If two objects are "equal" (\`a == b\`), they **must** have the same hash value.`,
    },
    {
        id: "cp1-c34",
        type: "code",
        content: `# Hashable objects return consistent integers
print(hash("hello"))    # Same number every time
print(hash((1, 2, 3)))  # Tuples are hashable
print(hash(42))         # Integers are hashable

# Unhashable objects raise TypeError
# hash([1, 2, 3])  # TypeError: unhashable type: 'list'`,
    },
    {
        id: "cp1-c35",
        type: "markdown",
        content: `**2. How Hash Tables Work Internally:**
A Dictionary is essentially a giant array (a list of slots). When you provide a key:
1. Python runs the key through \`hash(key)\` to get an integer
2. That integer maps directly to a specific slot (bucket) in memory
3. The value is stored at/retrieved from that slot

This is why dict lookups are $O(1)$ — no scanning required!

**3. The Problem with Mutability:**
Here's the fundamental conflict that makes mutable objects unhashable:

| Scenario | Problem |
|----------|---------|
| Hash changes when object mutates | Dictionary can't find the slot where it stored your data (looking at "Address B" for something at "Address A") |
| Hash stays same despite mutation | Two keys that are no longer equal would have the same hash, breaking key differentiation |`,
    },
    {
        id: "cp1-c36",
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
        id: "cp1-c37",
        type: "markdown",
        content: `**4. The "Immutable ≠ Hashable" Nuance**
Not all immutable objects are hashable!`,
    },
    {
        id: "cp1-c38",
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
        id: "cp1-c39",
        type: "markdown",
        content: `**Why?** The list inside can change, which would change the "identity" of the tuple. **To be hashable, the entire chain of data must be unchangeable.**

**5. Real-World Uses for Tuple Keys:**
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
        id: "cp1-c40",
        type: "code",
        content: `# Coordinate lookup in a game grid
grid = {}
grid[(0, 0)] = "spawn"
grid[(5, 10)] = "treasure"
print(grid[(5, 10)])  # "treasure" — O(1) lookup!`,
    },
    {
        id: "cp1-c41",
        type: "markdown",
        content: `**Caching Function Results (Memoization):**
If a function takes multiple arguments and is expensive to compute, you can cache its result in a dictionary keyed by the tuple of its arguments. On subsequent calls with the same inputs, you skip the computation entirely and return the cached result.`,
    },
    {
        id: "cp1-c42",
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
        id: "cp1-c43",
        type: "markdown",
        content: `**Database-Style Composite IDs:**
When you need to link data to an entity identified by multiple fields, a tuple key is safer and cleaner than concatenating strings (e.g., \`"John_Doe_1990"\`) to create a unique ID.`,
    },
    {
        id: "cp1-c44",
        type: "code",
        content: `records = {}
records[("Alice", "Smith", "1990-01-15")] = {"department": "Engineering"}
records[("Bob", "Jones", "1985-07-22")] = {"department": "Marketing"}
print(records[("Alice", "Smith", "1990-01-15")])`,
    },
    {
        id: "cp1-c45",
        type: "markdown",
        content: `**Deduplication of Groups:**
If you have a list of paired entries and want to find only the unique ones, converting them to tuples and adding them to a \`set\` lets the hash table automatically discard duplicates.`,
    },
    {
        id: "cp1-c46",
        type: "code",
        content: `trips = [("NYC", "LDN"), ("LDN", "NYC"), ("NYC", "LDN")]
unique_trips = set(trips)
print(unique_trips)  # 2 unique pairs — duplicate ('NYC','LDN') was removed`,
    },
    {
        id: "cp1-c47",
        type: "markdown",
        content: `**Summary of Benefits:**
- **Integrity**: Using a tuple guarantees the key cannot change while it's sitting in the dictionary.
- **Speed**: Looking up a hashed tuple in a dictionary takes $O(1)$ time regardless of how many millions of items are stored.

#### Exercises

**Exercise 1 (10-15 min)**: Write a function that takes a list of coordinate pairs (each pair is a list \`[x, y]\`) and returns the count of unique coordinates. Use a set with tuple conversion for $O(n)$ deduplication.`,
    },
    {
        id: "cp1-c48",
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
        id: "cp1-c49",
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
        (([[0, 0], [1, 2], [0, 0], [3, 4], [1, 2]],), 3, "Five points with two duplicates",
         'Pass five points where \`[0,0]\` and \`[1,2]\` each appear twice. Only three points are unique, so the count should be 3.'),
        (([],), 0, "Empty point list",
         'Pass an empty list of coordinates. With no points to count, the result is 0.'),
        (([[5, 5]],), 1, "Single point",
         'Pass a list with a single coordinate. There is exactly one unique point.'),
        (([[1, 1], [2, 2], [3, 3]],), 3, "Three distinct points",
         'Pass three coordinates that are all different. Every point is unique, so the count equals the list length.'),
    ],
    edge_cases=[
        (([[0, 0], [0, 0], [0, 0]],), 1, "All points identical",
         'All three coordinates are the same point \`[0,0]\`, so they collapse to a single unique entry.'),
        (([[0, 1], [1, 0]],), 2, "Coordinate order matters",
         '\`[0,1]\` and \`[1,0]\` are different points because the order of x and y is significant. Both should count as unique.'),
        (([[-1, -1], [-1, -1], [1, 1]],), 2, "Negative coordinates",
         'Negative numbers are valid coordinates. \`[-1,-1]\` repeats and collapses, leaving 2 unique points.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c50",
        type: "markdown",
        content: `## 1.4 File I/O, Scripting & Automation

#### Concept Overview

##### The \`open()\` Built-in
Nearly every file operation starts with the \`open(path, mode)\` built-in. It returns a **file object** that supports reading, writing, and iteration, and is itself a context manager (so it pairs naturally with \`with\`).

| Mode | Meaning |
|------|---------|
| \`"r"\` | Read text (default); fails if file is missing |
| \`"w"\` | Write text; **truncates** existing file or creates new |
| \`"a"\` | Append text; creates file if missing |
| \`"x"\` | Exclusive create; fails if file already exists |
| \`"b"\` suffix | Binary mode (e.g. \`"rb"\`, \`"wb"\`) |
| \`"+"\` suffix | Read **and** write (e.g. \`"r+"\`) |

Useful methods on the returned file object: \`.read()\`, \`.readline()\`, \`.readlines()\`, \`.write(s)\`, \`.writelines(iter)\`, \`.close()\`. Iterating the file object yields one line at a time (the memory-efficient pattern shown below).

**1. Context Managers (\`with\` statement):**
Whenever your application interacts with external systems (like Hard Drive Files, Databases, Network sockets), an Operating System connection/file descriptor opens. If you do not close this connection, you introduce resource leaks.
Using the \`with\` statement utilizes a Context Manager which magically guarantees \`.close()\` is executed when the indentation block succeeds *or even if it throws an exception globally*.

*Example:*`,
    },
    {
        id: "cp1-c51",
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
        id: "cp1-c52",
        type: "markdown",
        content: `**2. Processing Large Files Memory-Efficiently:**
Calling \`file.read()\` or \`file.readlines()\` on a 15GB Text file will allocate 15GB of RAM immediately and crash standard machines. Using a standard \`for\` loop over the file object treats the file uniquely as a streaming iterator. Python manages the stream natively, dumping line $N$ out of RAM before pulling line $N+1$.

*Example:*`,
    },
    {
        id: "cp1-c53",
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
        id: "cp1-c54",
        type: "markdown",
        content: `**3. Scripting Basics: \`json\` and \`subprocess\`:**
Python tooling scripts frequently deal with data parsers and triggering shell actions:
- \`json.loads(string_data)\`: Read a JSON string into a Python dict.
- \`json.dumps(dict_data)\`: Format a Python dict directly into a JSON formatted string.
- \`subprocess\`: A robust standard library replacement to the old \`os.system\`. Use \`subprocess.run(["cmd", "arg"])\` to execute standard terminal apps natively from Python.

#### Exercises

**Exercise 1 (10-15 min)**: Given a path to a potentially large log file, return the count of lines that contain the substring \`"ERROR"\`. Ensure your solution handles large scale efficiently.`,
    },
    {
        id: "cp1-c55",
        type: "code",
        content: `def count_errors_in_file(filepath: str) -> int:
    # TODO: Implement
    pass

# Example: count_errors_in_file("app.log") -> 42  (counts lines containing "ERROR")
# Hint: Open the file and count lines that contain the word "ERROR"`,
    },
    {
        id: "cp1-c56",
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
        (("test_app.log",), 3, "Counts ERROR lines in seeded log",
         'The setup writes \`test_app.log\` with 5 lines, 3 of which begin with "ERROR". The function should open that file and return 3.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c57",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Write a function to parse a multi-line CSV formatted string into a list of dictionaries. Assume the first row is always headers.`,
    },
    {
        id: "cp1-c58",
        type: "code",
        content: `from typing import List, Dict

def parse_csv_string(csv_data: str) -> List[Dict[str, str]]:
    # TODO: Implement
    pass

# Example input:
# "name,age,city\\nAlice,30,New York\\nBob,25,LA"`,
    },
    {
        id: "cp1-c59",
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
         "Header row plus two data rows",
         'Pass a CSV string where the first line "name,age,city" defines the dict keys; the next two lines become two row dicts that map each header to its column value.'),
        (("a,b\\n1,2",), [{"a": "1", "b": "2"}], "Header row plus a single data row",
         'Pass a CSV with headers "a,b" and one data row "1,2". The result is a list containing one dict {"a": "1", "b": "2"}.'),
    ],
    edge_cases=[
        (("a,b,c",), [], "Headers but no data rows",
         'Pass a CSV that only contains the header line. There are no data rows to parse, so the result is an empty list.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c60",
        type: "markdown",
        content: `**Exercise 3 (5-10 min)**: Write a function that creates a subdirectory named \`"web_assets"\` in the current directory, then creates the following six files inside it: \`"0_45_67.html"\`, \`"12_99_3.html"\`, \`"index.html"\`, \`"style.css"\`, \`"config.json"\`, and \`"app.js"\`.`,
    },
    {
        id: "cp1-c61",
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
        id: "cp1-c62",
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c63",
        type: "markdown",
        content: `**Exercise 4 (5-10 min)**: Write a function that grabs all the files in the \`"web_assets"\` subdirectory. Filter to only files ending in \`.html\`, sort them alphabetically by filename, and return the sorted list. Finally, print the sorted filenames.`,
    },
    {
        id: "cp1-c64",
        type: "code",
        content: `from typing import List

def get_html_files() -> List[str]:
    # TODO: Return all .html files in current directory recursively
    pass

# Example: If directory contains index.html and pages/about.html
#          -> ["index.html", "pages/about.html"] (or similar paths)`,
    },
    {
        id: "cp1-c65",
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
        ((), ["0_45_67.html", "12_99_3.html", "index.html"], "Returns sorted .html files",
         'The setup creates 6 files in \`web_assets/\` (3 HTML, 3 non-HTML). The function should return only the 3 \`.html\` files, sorted alphabetically by filename.'),
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
                autorunOnRefresh: true,
                placeholder: "<- Toggle visibility to inspect the test runner code"
            }
        },
    },
    {
        id: "cp1-c66",
        type: "markdown",
        content: `## 1.5 Exception Handling

#### Concept Overview

**1. The try/except/else/finally Pattern:**
Exception handling is fundamental to robust Python code. The full pattern provides fine-grained control:`,
    },
    {
        id: "cp1-c67",
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
        id: "cp1-c68",
        type: "markdown",
        content: `**2. Raising Exceptions:**
Use \`raise\` to signal errors. Prefer specific built-in exceptions:
- \`ValueError\`: Invalid argument value
- \`TypeError\`: Wrong type passed
- \`KeyError\`: Missing dictionary key
- \`FileNotFoundError\`: File doesn't exist
- \`IndexError\`: List index out of range`,
    },
    {
        id: "cp1-c69",
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
        id: "cp1-c70",
        type: "markdown",
        content: `**3. Custom Exceptions:**
Create domain-specific exceptions by inheriting from \`Exception\`:`,
    },
    {
        id: "cp1-c71",
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
        id: "cp1-c72",
        type: "markdown",
        content: `**4. Context Managers for Exception Safety:**
The \`with\` statement ensures cleanup even when exceptions occur:`,
    },
    {
        id: "cp1-c73",
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
        id: "cp1-c74",
        type: "markdown",
        content: `#### Exercises

**Exercise 1 (10-15 min)**: Write a \`safe_divide(a, b)\` function that returns \`a / b\`. If \`b\` is zero, return \`None\` instead of crashing. If either input is not a number, raise a \`TypeError\` with a descriptive message.`,
    },
    {
        id: "cp1-c75",
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
        id: "cp1-c76",
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
        ((10, 2), 5.0, "Basic division",
         'Pass \`a=10\`, \`b=2\`. Standard division returns the float \`5.0\`.'),
        ((9, 3), 3.0, "Exact division",
         'Pass \`a=9\`, \`b=3\`. The division is exact, returning the float \`3.0\`.'),
        ((10, 0), None, "Divide by zero returns None",
         'Pass \`a=10\`, \`b=0\`. Instead of letting \`ZeroDivisionError\` propagate, the function should catch it and return \`None\`.'),
        ((-6, 2), -3.0, "Negative numerator",
         'Pass \`a=-6\`, \`b=2\`. The sign of \`a\` carries through, returning \`-3.0\`.'),
        ((0, 5), 0.0, "Zero numerator",
         'Pass \`a=0\`, \`b=5\`. Zero divided by any nonzero number is \`0.0\`.'),
    ],
    custom_test=_custom_safe_divide,
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
        id: "cp1-c77",
        type: "markdown",
        content: `**Exercise 2 (10-15 min)**: Create a custom \`ValidationError\` exception class that stores a \`field_name\` and \`message\`. Then write a \`validate_age(age)\` function that raises \`ValidationError\` if age is negative or over 150.`,
    },
    {
        id: "cp1-c78",
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
        id: "cp1-c79",
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
        ((25,), True, "Typical valid age",
         'Pass \`age=25\`, well inside the allowed range. The function should return \`True\` without raising.'),
        ((0,), True, "Zero is the lower bound (inclusive)",
         'Pass \`age=0\`. Zero is not negative, so it is the smallest allowed value and should pass validation.'),
        ((150,), True, "Upper bound 150 is inclusive",
         'Pass \`age=150\`. The maximum allowed value is 150, so calling with exactly 150 should still return \`True\`.'),
    ],
    custom_test=_custom_validate_age,
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
        id: "cp1-footer",
        type: "markdown",
        content: `---

## Section complete!

[Back to Table of Contents](?open=coding-prep) &nbsp;|&nbsp; Next: [Section 2: Advanced Python](?open=coding-prep-2) →`,
    },
];
