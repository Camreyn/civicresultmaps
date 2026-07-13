from pathlib import Path
import subprocess


subprocess.run(
    ["node", str(Path(__file__).with_name("normalize-mt-historical-presidential-baseline.mjs"))],
    check=True,
)

