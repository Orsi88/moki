# Read-only memory snapshot of the Electron processes of this repository, by process type (Linux).
#
#   bash tests/perf/proc-snapshot.sh            # every Electron process started from this repo's node_modules
#   bash tests/perf/proc-snapshot.sh <pid>      # only that pid and its descendants that are Electron processes of this repo
#
# Reads /proc only: it sends no signals and changes nothing. A process that disappears or cannot be read is skipped.
# A <pid> that is not an Electron process of this repo matches nothing (it prints so and exits 0).
# It selects by the executable (argv[0]) being <repo>/node_modules/electron/dist/electron; terminal shells and
# other children are not Electron, so they are not counted. The descendants of <pid> include the renderers and the
# GPU process that Chromium forks from its zygote, not only the direct children.
#
# Rss counts shared pages in every process (what the status bar summed before); Pss splits shared pages
# between the processes that map them (the real footprint); Uss is Private_Clean + Private_Dirty (only the process's own).

set -u
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
ELECTRON="$REPO/node_modules/electron/dist/electron"
ROOT_PID=${1:-}
if [ -n "$ROOT_PID" ] && ! [[ "$ROOT_PID" =~ ^[0-9]+$ ]]; then echo "Usage: bash tests/perf/proc-snapshot.sh [pid]" >&2; exit 2; fi

declare -A PARENT TYPE
for dir in /proc/[0-9]*; do
  pid=${dir#/proc/}
  argv0=""
  IFS= read -r -d '' argv0 2>/dev/null < "$dir/cmdline"
  [ "$argv0" = "$ELECTRON" ] || continue
  cmd=$(tr '\0' ' ' < "$dir/cmdline" 2>/dev/null) || continue
  stat=$(cat "$dir/stat" 2>/dev/null) || continue
  rest=${stat##*) }
  set -- $rest
  PARENT[$pid]=$2
  case "$cmd" in
    *" --type=renderer"*) TYPE[$pid]=renderer ;;
    *" --type=gpu-process"*) TYPE[$pid]=gpu ;;
    *" --type=utility"*) TYPE[$pid]=utility ;;
    *" --type=zygote"*) TYPE[$pid]=zygote ;;
    *" --type="*) TYPE[$pid]=other ;;
    *) TYPE[$pid]=browser ;;
  esac
done

# With a pid: keep it and the Electron processes below it.
declare -A KEEP
if [ -n "$ROOT_PID" ]; then
  [ -n "${PARENT[$ROOT_PID]:-}" ] && KEEP[$ROOT_PID]=1
  for ((grew = 1; grew;)); do
    grew=0
    for pid in "${!PARENT[@]}"; do
      if [ -z "${KEEP[$pid]:-}" ] && [ -n "${KEEP[${PARENT[$pid]}]:-}" ]; then KEEP[$pid]=1; grew=1; fi
    done
  done
else
  for pid in "${!PARENT[@]}"; do KEEP[$pid]=1; done
fi

rows=""
for pid in "${!KEEP[@]}"; do
  mem=$(awk '/^Rss:/ {r = $2} /^Pss:/ {p = $2; seen = 1} /^Private_(Clean|Dirty):/ {u += $2} END {if (!seen) exit 1; print r, p, u}' "/proc/$pid/smaps_rollup" 2>/dev/null) || continue
  rows+="${TYPE[$pid]} $pid $mem"$'\n'
done

if [ -z "$rows" ]; then echo "No readable Electron process of $REPO${ROOT_PID:+ under pid $ROOT_PID}."; exit 0; fi

printf '%s' "$rows" | awk '
  { n[$1]++; rss[$1] += $3; pss[$1] += $4; uss[$1] += $5; N++; R += $3; P += $4; U += $5 }
  END {
    split("browser renderer gpu utility zygote other", order, " ")
    printf "%-10s %5s %10s %10s %10s\n", "type", "procs", "Rss MB", "Pss MB", "Uss MB"
    for (i = 1; i <= 6; i++) { t = order[i]; if (n[t]) printf "%-10s %5d %10.1f %10.1f %10.1f\n", t, n[t], rss[t] / 1024, pss[t] / 1024, uss[t] / 1024 }
    printf "%-10s %5d %10.1f %10.1f %10.1f\n", "total", N, R / 1024, P / 1024, U / 1024
    printf "\nWhat the status bar showed before (sum of Rss): %.1f MB   |   Pss: %.1f MB   |   ratio Rss/Pss: %.2f\n", R / 1024, P / 1024, (P ? R / P : 0)
  }'
