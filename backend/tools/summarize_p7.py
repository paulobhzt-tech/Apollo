"""Summarize completed P7 runs without contacting or changing any database.

Run after run_p7_campaign.py. Driver counters are cumulative sampled snapshots,
not an exhaustive command audit. Keep full load/resource JSON compressed.
"""
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/web/p7-2026-11-16/evidence'


def quantile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered)-1, int((len(ordered)-1)*fraction))] if ordered else None


def summarize(label):
    raw = (OUT / f'load-{label}.json').read_bytes()
    result = json.loads(raw)
    assert not result['partial'], label
    target = OUT / f'load-{label}.json.gz'
    target.write_bytes(gzip.compress(raw, mtime=0))
    counters = {}
    attempts, admissions, elapsed, callback, commits, commit_calls = [], [], [], [], [], []
    outcomes, errors = Counter(), Counter()
    failures = []
    source = OUT / f'driver-{label}.jsonl'
    for line in source.open():
        event = json.loads(line)
        if event['kind'] == 'driver':
            counters = event['counters']
        elif event['kind'] == 'transaction':
            attempts.append(event['attempts'])
            commit_calls.append(event['commits'])
            admissions.append(event.get('admission_s', 0)*1000)
            elapsed.append(event['elapsed_s']*1000)
            callback.append(event['callback_s']*1000)
            commits.append(event['commit_s']*1000)
            outcomes[event['outcome']] += 1
            errors.update(event.get('errors', {}))
            if event['outcome'] != 'committed':
                failures.append(event)
    samples = result['resources']
    seconds = samples[-1]['at']-samples[0]['at']
    resources = {}
    for name in ('backend', 'mongo'):
        resources[name] = {
            'rss_mib_max': max(s[name]['rss_kib'] for s in samples)/1024,
            'cpu_seconds_delta': samples[-1][name]['cpu_seconds']-samples[0][name]['cpu_seconds'],
        }
        resources[name]['mean_cpu_core_equivalent'] = resources[name]['cpu_seconds_delta']/seconds
    resources['mongo_connections_max'] = max(s['connections']['current'] for s in samples)
    resources['sample_span_s'] = seconds
    resources['sample_count'] = len(samples)
    resources['server_status_write_conflicts_last'] = samples[-1]['write_conflicts']
    return {
        'label': label, 'rows': result['rows'], 'integrity': result['integrity'],
        'resources': resources, 'driver_counters_last_sample': counters,
        'driver_write_conflict_112': {k:v for k,v in counters.items() if k.endswith(':error:112')},
        'transaction_count': len(attempts), 'outcomes': dict(outcomes),
        'callback_errors': dict(errors), 'callback_attempts_sum': sum(attempts),
        'callback_retries_sum': sum(max(0,n-1) for n in attempts),
        'commit_calls_sum': sum(commit_calls),
        'commit_retries_sum': sum(max(0,n-1) for n in commit_calls),
        'commit_calls_p50_p95_p99_max': [quantile(commit_calls,q) for q in (.5,.95,.99,1)],
        'callback_attempts_p50_p95_p99_max': [quantile(attempts,q) for q in (.5,.95,.99,1)],
        'transaction_elapsed_ms_p50_p95_p99': [quantile(elapsed,q) for q in (.5,.95,.99)],
        'admission_ms_p50_p95_p99': [quantile(admissions,q) for q in (.5,.95,.99)],
        'callback_ms_p50_p95_p99': [quantile(callback,q) for q in (.5,.95,.99)],
        'commit_ms_p50_p95_p99': [quantile(commits,q) for q in (.5,.95,.99)],
        'failures': failures,
        'sha256': {'load_json': hashlib.sha256(raw).hexdigest(),
                   'driver_jsonl': hashlib.file_digest(source.open('rb'), 'sha256').hexdigest()},
    }


def main():
    campaign = json.loads((OUT/'campaign-progress.json').read_text())
    assert campaign['running'] is None and campaign['completed']==[
        'repeated-abba','p6-long','p7-acceptance'], 'Full campaign must finish successfully first'
    labels = ('reproduce', 'pilot', 'a1', 'b1', 'b2', 'a2', 'p6long', 'acceptance')
    runs = {label:summarize(label) for label in labels}
    (OUT/'benchmark-summary.json').write_text(json.dumps(runs, indent=2)+'\n')
    criteria = json.loads((OUT.parent/'ACCEPTANCE.json').read_text())
    row = runs['acceptance']['rows'][0]
    actual = {
        'active_traffic_seconds_minimum': row['traffic_duration_s'],
        'http_503_maximum': sum(v for k,v in row['errors'].items() if k.endswith(':503')),
        'other_http_or_transport_errors_maximum': sum(v for k,v in row['errors'].items() if not k.endswith(':503')),
        'exhausted_operations_maximum': row['exhausted_operations'],
        'request_p95_ms_maximum': row['p95_ms'], 'request_p99_ms_maximum': row['p99_ms'],
        'sale_cancel_pair_p95_ms_maximum': row['pair_p95_ms'],
        'sale_cancel_pair_p99_ms_maximum': row['pair_p99_ms'],
    }
    checks = {k: (v >= criteria[k] if k.endswith('minimum') else v <= criteria[k]) for k,v in actual.items()}
    # Integrity has already been asserted against actual MongoDB by the launcher;
    # retain every field for independent review rather than inventing a score.
    checks['financial_integrity_assertions'] = all(
        run['integrity']['stock']==1000 and run['integrity']['paid_orders']==0
        and run['integrity']['duplicate_refs']==0 and run['integrity']['duplicate_numbers']==0
        and run['integrity']['markers']==run['integrity']['orders']==run['integrity']['counter']
        and run['integrity']['cash_version']==run['integrity']['stock_moves']==2*run['integrity']['orders']
        and run['integrity']['number_range'][0]['minimum']==1
        and run['integrity']['number_range'][0]['maximum']==run['integrity']['orders']
        for label,run in runs.items() if label in ('a1','b1','b2','a2','p6long','acceptance'))
    (OUT/'acceptance-result.json').write_text(json.dumps({
        'criteria_file': '../ACCEPTANCE.json', 'actual':actual, 'checks':checks,
        'load_scope_passed': all(checks.values()), 'production_approved':False,
        'configured_active_seconds':1800,
        'duration_note':'Campaign config supplies 1800 active seconds; measured traffic_duration_s also includes draining already-started pairs. Run the full campaign unchanged.',
        'note':'Load verdict only. Financial failure/recovery and UI evidence are reported separately; counts are not a substitute for those tests.'
    }, indent=2)+'\n')
    print(json.dumps({'checks':checks,'actual':actual},indent=2))


if __name__ == '__main__':
    main()
