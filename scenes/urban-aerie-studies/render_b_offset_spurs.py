from pathlib import Path
import runpy,json
module=runpy.run_path(str(Path(__file__).with_name('refine_b_satellite_spikes.py')))
print(json.dumps(module['render'](),indent=2),flush=True)
