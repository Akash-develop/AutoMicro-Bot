#!/usr/bin/env bash
# Demo B (manual): Bring Notes (or Calculator) to front with a labeled control, then run:
# poetry run python -c "
# from app.graph.tools.permission_manager import load_permissions
# from app.automation.orchestrator import AutomationOrchestrator
# p=load_permissions(); p['run_ui_automation']=True; p['automation_layer_ax']=True; p['automation_layer_dom']=False
# o=AutomationOrchestrator(permissions=p); o.ensure_children(); print(o.run('click New Note'))
# "
echo "Manual AX demo — grant Accessibility for the Swift helper / Terminal."
