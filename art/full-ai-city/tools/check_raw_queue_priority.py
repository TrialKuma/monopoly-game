from run_raw_queue import jobs,job_priority
registry=jobs();bykey={r['region']+'/'+r['asset']:r for r in registry}
assert len(registry)==len(bykey)==147
def row(key,state=None):return bykey[key],state or {}
assert job_priority(row('classic/civic_hall'))<job_priority(row('alpine/civic_hall'))
assert job_priority(row('alpine/civic_hall'))<job_priority(row('alpine/skyscraper_1'))
assert job_priority(row('alpine/skyscraper_1'))<job_priority(row('compact/villa_1'))
assert job_priority(row('harbor/villa_1',{'referenceRevisionRequested':{'reason':'reviewed revision'}}))<job_priority(row('alpine/civic_hall'))
assert job_priority(row('compact/chance_wheel'))<job_priority(row('alpine/civic_hall'))
ordered=sorted([(r,{}) for r in registry],key=job_priority)
assert {r['region']+'/'+r['asset'] for r,_ in ordered}==set(bykey)
print('PASS next-region scheduling preserves all147 jobs and gives reviewed revisions priority.')
