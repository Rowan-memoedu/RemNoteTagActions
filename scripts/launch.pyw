"""Windowless launcher for this application's background service."""
from pathlib import Path
import subprocess
import shutil

project = Path(__file__).resolve().parents[1]
runtime = Path('D:/AppData/RemNoteTagActions')
runtime.mkdir(parents=True, exist_ok=True)
node = shutil.which('node')
if not node:
    raise RuntimeError('Node.js not found')
with (runtime / 'service.stdout.log').open('ab', buffering=0) as output, (runtime / 'service.stderr.log').open('ab', buffering=0) as errors:
    process = subprocess.Popen(
        [node, str(project / 'src/cli.mjs'), 'serve'], cwd=project,
        stdin=subprocess.DEVNULL, stdout=output, stderr=errors,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    raise SystemExit(process.wait())
