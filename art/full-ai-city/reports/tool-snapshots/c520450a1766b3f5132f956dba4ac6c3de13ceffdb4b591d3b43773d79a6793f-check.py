import sys,time
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,sys.argv[1])
import cpu_blender_lease as lease
lease.psutil.virtual_memory=lambda:SimpleNamespace(available=5*2**30)
lease._other_blender=lambda:False
with lease.cpu_blender_lease(Path(sys.argv[2]),float(sys.argv[3])):
 print("ACQUIRED",flush=True)
 time.sleep(.1)
