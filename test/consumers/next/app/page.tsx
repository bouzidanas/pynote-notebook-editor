// A server component page; the cells are client components.
import Notebook from "./notebook";

export default function Page() {
  return (
    <main>
      <h1>A page with two cells</h1>
      <Notebook />
    </main>
  );
}
