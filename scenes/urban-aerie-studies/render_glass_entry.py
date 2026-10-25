from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parent/'refine_house_entry_glass.py'))['render']()
