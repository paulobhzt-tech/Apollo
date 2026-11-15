"""Summarize payload-free diagnostics without importing the application or database."""
import json
from collections import Counter
from pathlib import Path
import sys

def summarize(path):
    groups={};driver={}
    for line in Path(path).read_text().splitlines():
        row=json.loads(line)
        if row['kind']=='driver':driver=row['counters'];continue
        key=row['operation']+':'+row['outcome']
        group=groups.setdefault(key,{'transactions':0,'attempts':0,'commits':0,'elapsed_s':0.,'callback_s':0.,'commit_s':0.,'wait_s':0.,'budget_exhausted':0,'errors':Counter(),'last_errors':Counter()})
        group['transactions']+=1
        for field in ('attempts','commits','elapsed_s','callback_s','commit_s','wait_s','budget_exhausted'):group[field]+=row[field]
        group['errors'].update(row['errors'])
        if row['last_error']:
            e=row['last_error'];group['last_errors'][str(e['code'])+':'+','.join(e['labels'])]+=1
    return {'groups':groups,'driver_cumulative_last_sample':driver,
            'limitations':['Last driver sample can precede final request by up to one second.',
                           'Unified PR18 probe uses elapsed monotonic timings, including retry_wait; concurrent sums are not wall time.',
                           'abortTransaction code 251 after aborted conflict is secondary, not the initiating cause.']}

if __name__=='__main__':
    Path(sys.argv[2]).write_text(json.dumps(summarize(sys.argv[1]),indent=2)+'\n')
