# ---
# pynote:
#   executionMode: reactive
# ---

# %% [markdown]
# # Regional sales review
#
# This notebook runs in **reactive mode**: every cell runs again when a value
# it reads changes, so the cells are arranged for reading, not for running. The
# summary comes first even though it uses results computed further down, which
# is fine in PyNote and is exactly what the `.py` export has to untangle.

# %% [markdown]
# ## Data
#
# The records come from the regional offices:
#
# | Region | Office  | Records |
# | :----- | :------ | ------: |
# | North  | Oslo    |       3 |
# | South  | Seville |       2 |
# | East   | Tallinn |       1 |
#
# Notes on the data:
#
# - Units are whole numbers, and returns are already subtracted.
# - Each record is one invoice, so a large order is a single record even when
#   it ships in several parts.
# - [x] Checked against the finance export
# - [ ] Waiting for the West office

# %%
import csv
import io

RAW = """region,units
North,120
South,80
North,95
East,40
South,60
North,30
"""
records = [
    {"region": row["region"], "units": int(row["units"])}
    for row in csv.DictReader(io.StringIO(RAW))
]

# %% [markdown]
# ## Method
#
# The totals are computed per region from the raw sales records, and the mean
# is taken over all records:
#
# $$
# \bar{u} = \frac{1}{n} \sum_{i=1}^{n} u_i
# $$
#
# where $u_i$ is the number of units in record $i$ and $n$ is the number of
# records.

# %%
from statistics import mean

totals = {}
for record in records:
    totals[record["region"]] = totals.get(record["region"], 0) + record["units"]
mean_units = mean(record["units"] for record in records)
best_region = max(totals, key=totals.get)

# %%
print(f"Best region: {best_region} ({totals[best_region]:,} units)")
print(f"Mean units per sale: {mean_units:.1f}")

# %% [markdown]
# ## Next steps
#
# 1. Add the West office once its export arrives.
# 2. Compare with last year's figures, which use the same format:
#
#    ```python
#    records_2023 = load("sales-2023.csv")
#    ```
#
# 3. Publish the summary.
#
# > The regional totals are preliminary until the finance team signs them off,
# > which usually happens in the second week of the month.

# %%
_expected = sum(totals.values())
assert _expected == sum(r["units"] for r in records), "totals do not add up"
print("Totals check out.")
