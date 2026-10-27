The model minimizes the loss below, which is written as a display math block between lines of dollar signs.

$$
\mathcal{L}(\theta) = \frac{1}{n} \sum_{i=1}^{n} \left( y_i - f_\theta(x_i) \right)^2 % mean squared error
$$

Display math inside a paragraph keeps its lines too:
$$
a = b
% a LaTeX comment would swallow joined lines
$$
and the text after it is reflowed as usual, with inline math like $x^2 + y^2 = r^2$ kept on one line.

Single-line display math $$\int_0^1 x\,dx = \tfrac{1}{2}$$ is one unbreakable unit.
