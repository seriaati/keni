# A stored color is either a palette id (e.g. "green-1"; resolved per theme by the
# frontend, see frontend/src/lib/colors.ts) or a custom "#rrggbb" hex.
COLOR_PATTERN = r"^(#[0-9a-fA-F]{6}|[a-z]+-\d+)$"
