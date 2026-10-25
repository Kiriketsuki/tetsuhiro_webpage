from pathlib import Path
import runpy,json
module=runpy.run_path(str(Path(__file__).with_name('finalize_b_island.py')))
print(json.dumps(module['render'](),indent=2),flush=True)
