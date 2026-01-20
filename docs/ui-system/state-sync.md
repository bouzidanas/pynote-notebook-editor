# State Synchronization & Events

PyNote employs a **Push-Push** synchronization model. Updates are pushed immediately from the source (User or Code) to the target.

## Event Flow: User Interaction (JS → Python)

Scenario: User drags a slider.

1.  **DOM Event:** The `<input type="range">` fires an `input` event.
2.  **Handler:** `Slider.tsx`'s `handleInput` function is called.
3.  **Kernel Send:** `kernel.sendInteraction(id, { value: 55 })` is invoked.
    *   This posts a message to the Worker: `{ type: "interaction", uid, data }`.
4.  **Worker Route:** `pyodide.worker.ts` receives the message.
5.  **Python Dispatch:** It calls `pynote_ui.handle_interaction(uid, data)`.
6.  **State Update:** `StateManager` finds the instance and calls `instance.handle_interaction(data)`.
7.  **Prop Update:** The `Slider` instance updates `self.value`.
    *   *Note:* It updates the internal `_value` directly to avoid triggering a circular update back to frontend.

## Event Flow: Programmatic Update (Python → JS)

Scenario: Code executes `slider.value = 80`.

1.  **Setter:** The `@value.setter` on the `Slider` class is triggered.
2.  **Internal Update:** `self._value` is updated to `80`.
3.  **Send Update:** `self.send_update(value=80)` is called.
4.  **State Manager:** `StateManager.send_update` is called.
5.  **Comm Target:** The registered JS callback in the Worker is executed.
6.  **Worker Post:** `postMessage({ type: "component_update", uid, data })` is sent.
7.  **Main Thread:** `Kernel` class receives the message.
8.  **Dispatch:** `kernel` looks up the listener for `uid`.
9.  **Component Update:** The specific `Slider.tsx` instance callback fires.
10. **Signal Update:** `setValue(80)` is called, updating the DOM.

## Latency & Batching

*   **Current State:** Updates are sent 1:1. High frequency events (dragging) send one message per pixel/step.
*   **Performance:** For local WebWorkers, this is generally fast enough (sub-5ms roundtrip).
*   **Future Optimization:** If the bridge becomes congested, we can implement debouncing in the `UIElement` base class to coalesce updates.
