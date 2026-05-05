import paramiko
import os
import stat
import posixpath

LOCAL_DIST = r"d:\Zentrix\PrashanthiSchoolsdevaruppla\React\dist"
REMOTE_ROOT = "/var/opt/mssql/backup"
REMOTE_STAGING = posixpath.join(REMOTE_ROOT, "schoolerp_dist_staging")
REMOTE_TARGET = "/var/www/html/schoolerp"

PRESERVE = {"config.js"}

def run(ssh, cmd, timeout=60):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    rc = stdout.channel.recv_exit_status()
    return rc, stdout.read().decode().strip(), stderr.read().decode().strip()

def sftp_walk_upload(sftp, local_root, remote_root):
    """Recursively upload local_root contents into remote_root, creating dirs."""
    uploaded = 0
    for dirpath, dirnames, filenames in os.walk(local_root):
        rel = os.path.relpath(dirpath, local_root).replace("\\", "/")
        if rel == ".":
            remote_dir = remote_root
        else:
            remote_dir = posixpath.join(remote_root, rel)
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            sftp.mkdir(remote_dir)
        for fn in filenames:
            local_path = os.path.join(dirpath, fn)
            remote_path = posixpath.join(remote_dir, fn)
            sftp.put(local_path, remote_path)
            uploaded += 1
    return uploaded

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("178.104.244.231", username="root", key_filename=os.path.expanduser("~/.ssh/id_ed25519"), timeout=20)

print("Cleaning staging dir...")
rc, out, err = run(ssh, f"rm -rf {REMOTE_STAGING} && mkdir -p {REMOTE_STAGING}")
print(f"  rc={rc} {err or ''}")

print("Uploading dist to staging...")
sftp = ssh.open_sftp()
n = sftp_walk_upload(sftp, LOCAL_DIST, REMOTE_STAGING)
sftp.close()
print(f"  uploaded {n} files")

# Preserve prod's config.js by overwriting the staged one with the existing prod copy
print(f"Preserving prod's existing files: {PRESERVE}")
for fname in PRESERVE:
    rc, out, err = run(ssh, f"if [ -f {REMOTE_TARGET}/{fname} ]; then cp {REMOTE_TARGET}/{fname} {REMOTE_STAGING}/{fname}; echo 'preserved'; else echo 'no existing {fname} on prod'; fi")
    print(f"  {fname}: {out} {err}")

# Sync staging -> target. Use rsync with --delete to remove stale hashed assets.
print("Syncing staging -> target with rsync --delete...")
rc, out, err = run(
    ssh,
    f"rsync -a --delete {REMOTE_STAGING}/ {REMOTE_TARGET}/ && chown -R www-data:www-data {REMOTE_TARGET}",
    timeout=120,
)
print(f"  rc={rc}")
if out: print(f"  out: {out}")
if err: print(f"  err: {err}")

print("Verifying target...")
rc, out, err = run(ssh, f"ls -la {REMOTE_TARGET}/; echo '---'; ls {REMOTE_TARGET}/assets/")
print(out)

print("Cleaning staging dir...")
run(ssh, f"rm -rf {REMOTE_STAGING}")

ssh.close()
print("Deploy complete.")
