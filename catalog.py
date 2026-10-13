"""Read-only Desktop catalog. Never returns settings, credentials, or system prompts."""
import json, os, sqlite3, sys
home = os.environ.get('CODEX_HOME', os.path.expanduser('~/.codex'))
c = sqlite3.connect('file:' + os.path.join(home, 'state_5.sqlite') + '?mode=ro', uri=True)
c.row_factory = sqlite3.Row
try:
    g = json.load(open(os.path.join(home, '.codex-global-state.json')))
except (OSError, ValueError):
    g = {}
rows = [dict(r) for r in c.execute("SELECT id, name, title, cwd, updated_at, rollout_path, project_id FROM threads WHERE archived=0 AND source IN ('cli','vscode','exec') ORDER BY updated_at DESC")]
if len(sys.argv) > 1:
    row = next((r for r in rows if r['id'] == sys.argv[1]), None)
    if not row:
        raise ValueError('Unknown thread')
    items = []
    # Persisted visible messages only. Skip session_meta, turn_context, and reasoning.
    with open(row['rollout_path']) as f:
        for line in f:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            p = event.get('payload', {})
            if event.get('type') == 'response_item' and p.get('type') == 'message' and p.get('role') in ('user', 'assistant'):
                text = '\n'.join(x.get('text', '') for x in p.get('content', []) if x.get('type') in ('input_text', 'output_text'))
                if text and not text.startswith(('<environment_context>', '# AGENTS.md instructions')):
                    items.append({'id': str(len(items)), 'type': 'userMessage' if p['role'] == 'user' else 'agentMessage', 'text': text[:60000]})
    print(json.dumps({'connected': False, 'readOnly': True, 'title': row['name'] or row['title'], 'threadId': row['id'], 'cwd': row['cwd'], 'status': 'history', 'activeTurnId': None, 'items': items[-150:]}))
else:
    groups = {}
    mapping = g.get('app-server-project-id-by-legacy-project-id-by-host', {}).get('local:' + home, {})
    for p in g.get('local-projects', {}).values():
        key = mapping.get(p['id'], p['id'])
        groups[key] = {'id': key, 'name': p['name'], 'path': (p.get('rootPaths') or [''])[0], 'kind': '本地', 'tasks': []}
    for p in c.execute('SELECT id,name FROM projects ORDER BY position'):
        if p['id'] not in groups:
            groups[p['id']] = {'id': p['id'], 'name': p['name'], 'path': '', 'kind': '本地', 'tasks': []}
    for root in g.get('electron-saved-workspace-roots', []):
        if not any(p['path'] == root for p in groups.values()):
            groups['root:' + root] = {'id': 'root:' + root, 'name': os.path.basename(root), 'path': root, 'kind': '本地', 'tasks': []}
    assignments = g.get('thread-project-assignments', {})
    projectless = set(g.get('projectless-thread-ids', []))
    for r in rows:
        assignment = assignments.get(r['id'], {})
        legacy = assignment.get('projectId')
        key = r['project_id'] or mapping.get(legacy, legacy)
        if r['id'] in projectless:
            key = 'projectless'
        if not key or key not in groups:
            candidates = [p for p in groups.values() if p['path'] and (r['cwd'] == p['path'] or r['cwd'].startswith(p['path'] + '/'))]
            key = max(candidates, key=lambda p: len(p['path']))['id'] if candidates and r['id'] not in projectless else 'projectless'
        if key not in groups:
            groups[key] = {'id': key, 'name': '独立聊天', 'path': '', 'kind': '本地', 'tasks': []}
        groups[key]['tasks'].append({'id': r['id'], 'title': r['name'] or (r['title'].splitlines() or ['未命名任务'])[0][:120], 'updatedAt': r['updated_at'] * 1000, 'status': 'history'})
    values = list(groups.values())
    values.sort(key=lambda p: max((t['updatedAt'] for t in p['tasks']), default=0), reverse=True)
    print(json.dumps({'workspaces': values, 'taskCount': len(rows)}))
