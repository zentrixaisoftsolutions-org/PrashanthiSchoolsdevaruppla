"""Quick manual test of services/easytimepro.py"""
import json
from services.easytimepro import get_client, sync_devices_from_server

client = get_client()

# Step 1: Already confirmed auth works
print("=== STEP 1: Auth ===")
print(f"Server online: {client.is_server_online()}")

# Step 2: Terminals
print("\n=== STEP 2: Terminals ===")
terminals = client.get_terminals()
print(f"Found {len(terminals)} terminal(s)")
for t in terminals:
    info = {k: t.get(k) for k in ["sn", "terminal_name", "alias", "state", "ip_address"]}
    print(json.dumps(info, indent=2))

# Step 3: Transactions
print("\n=== STEP 3: Transactions ===")
resp = client.get_transactions(page_size=5)
count = resp.get("count", "?")
txns = resp.get("data", [])
print(f"Total count: {count}, returned: {len(txns)}")
for t in txns[:3]:
    print(json.dumps(t, indent=2))

# Step 4: Sync devices to local DB
print("\n=== STEP 4: Sync devices to DB ===")
try:
    synced = sync_devices_from_server()
    print(f"Synced {len(synced)} device(s) to local DB")
except Exception as e:
    print(f"Sync failed: {e}")
