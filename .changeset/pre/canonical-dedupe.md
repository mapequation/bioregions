---
"bioregions": patch
---

Keep the same duplicate record whatever order GBIF and OBIS records arrive in. Of
records that duplicate each other, a load now keeps the GBIF record over the OBIS one,
then the one with the earliest year, then by dataset key, basis of record, coordinate
uncertainty, coordinates and country. Before, the first record to arrive was kept, so
two loads of the same query could keep different points, cite different datasets and
report different duplicate counts. The methods text states the rule.
