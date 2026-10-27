# ---
# pynote:
#   executionMode: reactive
# ---

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

# %%
_expected = sum(totals.values())
assert _expected == sum(r["units"] for r in records), "totals do not add up"
print("Totals check out.")
