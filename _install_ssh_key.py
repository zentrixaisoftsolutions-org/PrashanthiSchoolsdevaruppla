import paramiko

PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBMu3d/9ztrtZxgRG//TlvoKWL0pZenRVJmYpFBdPF8z muraritechoffice@gmail.com"

def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=20)
    return stdout.channel.recv_exit_status(), stdout.read().decode().strip(), stderr.read().decode().strip()

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("178.104.244.231", username="root", password="Zentrix123", timeout=20, look_for_keys=False, allow_agent=False)

cmds = [
    "mkdir -p /root/.ssh && chmod 700 /root/.ssh",
    f"grep -qF '{PUBLIC_KEY}' /root/.ssh/authorized_keys 2>/dev/null || echo '{PUBLIC_KEY}' >> /root/.ssh/authorized_keys",
    "chmod 600 /root/.ssh/authorized_keys",
    "wc -l /root/.ssh/authorized_keys",
]
for c in cmds:
    rc, out, err = run(ssh, c)
    print(f"[rc={rc}] {c}")
    if out: print("  out:", out)
    if err: print("  err:", err)

ssh.close()
print("Public key installed.")
