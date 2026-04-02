#!/usr/bin/env bash
# Demo A (manual): Chrome with remote debugging → DOM click on local fixture.
# 1) Start Chrome: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
# 2) Open file:// or http://localhost:8765/demo_page.html (see run_demo_http.sh)
# 3) From back-end: poetry run python -c "
# from app.graph.tools.permission_manager import load_permissions
# from app.automation.orchestrator import AutomationOrchestrator
# p=load_permissions(); p['run_ui_automation']=True; p['automation_layer_dom']=True
# o=AutomationOrchestrator(permissions=p); o.ensure_children(); print(o.run('click Submit', browser_session_id='x'))
# "
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Fixture: $ROOT/e2e-demos/fixtures/demo_page.html"
echo "See comments in script for Chrome flags and Python one-liner."
