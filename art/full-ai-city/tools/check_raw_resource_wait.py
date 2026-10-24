"""Resource admission waits must not consume the neural-failure retry budget."""
import json,tempfile
from pathlib import Path
from run_raw_queue import retryable_preflight,classify_resource_waits,ART

for message in ('Insufficient free system RAM; no inference started and no applications closed.',
                'Insufficient free physical VRAM; no inference started and no applications closed.',
                'CUDA free memory below startup guard',
                'CUDA available memory is below the requested startup guard.'):
    row={'generation_started':False,'status':'failed','error':repr(RuntimeError(message))}
    assert retryable_preflight(row)
    assert not retryable_preflight({**row,'generation_started':True})
    assert not retryable_preflight({k:v for k,v in row.items() if k!='generation_started'})
assert retryable_preflight({'generation_started':False,'status':'gpu_busy'})
for row in ({'generation_started':False,'status':'failed','error':'CUDA out of memory'},
            {'generation_started':True,'status':'gpu_busy'},
            {'generation_started':False,'status':'failed','error':'missing model weights'},{}):
    assert not retryable_preflight(row)
with tempfile.TemporaryDirectory() as directory:
    receipt=Path(directory)/'report.json'
    receipt.write_text(json.dumps({'generation_started':False,'status':'failed','error':'Insufficient free system RAM; no inference started'}))
    original=receipt.read_bytes();state={'attempts':[{'report':str(receipt)}]}
    assert classify_resource_waits(state)
    assert state['attempts'][0]['retryableResourceWait']
    assert not classify_resource_waits(state)
    assert receipt.read_bytes()==original
actual=ART/'reports/expansion--villa_1-a001/expansion--villa_1-a001-pixal-mv-1024-9247.json'
if actual.exists():assert retryable_preflight(json.loads(actual.read_text('utf8')))
print('Resource preflight classification and immutable receipt checks passed.')
