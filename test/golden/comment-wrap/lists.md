- A bullet item that is long enough to wrap, so its continuation lines hang under the text after the marker.
* A star bullet starts a new list.
+ So does a plus bullet.

1. An ordered item that is long enough to wrap, so the hanging indent is aligned after the number and dot.
2) A different delimiter starts a new list.

3. Numbering is kept verbatim: this list starts at three.
3. And this item repeats the number.
10. A two-digit number gets a wider hanging indent than the others, which shows when it wraps.

- [ ] An open task that is long enough to wrap: the box stays with its first word and the text hangs at the content offset.
- [x] A finished task.
- [X] Another finished task with an upper-case X.

- A loose list item.

- Another loose item that contains a second paragraph.

  This second paragraph belongs to the item above and is long enough to wrap inside the item.

- Nested lists keep their indentation:
  - a nested bullet that is long enough to wrap and hang under its own text, not under the parent
    1. a deeply nested ordered item
  - back to the second level
- An item with code:

  ```python
  print("inside a list item")
  ```
