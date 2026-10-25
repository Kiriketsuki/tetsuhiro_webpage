from pathlib import Path
import runpy,sys
runpy.run_path(str(Path(__file__).resolve().parent/'refine_dining_rear.py'))['render']('--preview' in sys.argv)
