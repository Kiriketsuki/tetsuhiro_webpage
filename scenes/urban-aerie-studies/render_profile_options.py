from pathlib import Path
import runpy, json
module=runpy.run_path(str(Path(__file__).with_name('island_profile_options.py')))
result=module['render']()
print(json.dumps(result,indent=2),flush=True)
