from pathlib import Path
import runpy,sys
runpy.run_path(str(Path(__file__).resolve().parent/'night_arrival.py'))['render']('--preview' in sys.argv)
