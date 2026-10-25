from pathlib import Path
import runpy,sys
runpy.run_path(str(Path(__file__).resolve().parent/'add_terrace_life.py'))['render']('--preview' in sys.argv)
