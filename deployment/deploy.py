#!/usr/bin/env python3
"""
ChainViz Deployment Script
Deploys ChainViz to a remote server via SSH
"""

import os
import sys
import subprocess
import tarfile
import tempfile
from pathlib import Path
import getpass

# Colors
class Colors:
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'

def print_header():
    print(f"{Colors.BLUE}╔════════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.BLUE}║   ChainViz Deployment Script           ║{Colors.NC}")
    print(f"{Colors.BLUE}╚════════════════════════════════════════╝{Colors.NC}\n")

def run_command(cmd, hide_output=False):
    """Run a shell command"""
    try:
        if hide_output:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        else:
            result = subprocess.run(cmd, shell=True)
        return result.returncode == 0
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.NC}")
        return False

def main():
    print_header()
    
    # Get configuration
    server = input(f"Server IP [{Colors.BLUE}192.168.2.118{Colors.NC}]: ").strip() or "192.168.2.118"
    username = input(f"SSH Username [{Colors.BLUE}chainviz{Colors.NC}]: ").strip() or "chainviz"
    password = getpass.getpass("SSH Password: ")
    
    print(f"\n{Colors.YELLOW}Configuration:{Colors.NC}")
    print(f"  Server: {server}")
    print(f"  User: {username}")
    print(f"  Deploy path: /home/{username}/ChainViz\n")
    
    # Test connectivity
    print(f"{Colors.YELLOW}🔐 Testing connection...{Colors.NC}")
    if not run_command(f"ping -c 1 -W 2 {server}", hide_output=True):
        print(f"{Colors.RED}❌ Cannot reach server{Colors.NC}")
        return 1
    print(f"{Colors.GREEN}✅ Server is reachable{Colors.NC}\n")
    
    # Create deployment package
    print(f"{Colors.YELLOW}📦 Creating deployment package...{Colors.NC}")
    project_root = Path("/Users/t/Documents/vibbbing/ChainViz")
    
    with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
        tarfile_path = tmp.name
    
    # Create tar excluding unnecessary files
    excludes = ['node_modules', 'venv', '.git', '__pycache__', '*.log', 'backend/venv', 'frontend/node_modules']
    exclude_args = ' '.join([f"--exclude='{e}'" for e in excludes])
    
    tar_cmd = f"cd {project_root.parent} && tar czf {tarfile_path} {exclude_args} {project_root.name}"
    if not run_command(tar_cmd, hide_output=True):
        print(f"{Colors.RED}❌ Failed to create package{Colors.NC}")
        return 1
    
    print(f"{Colors.GREEN}✅ Package created{Colors.NC}\n")
    
    # Upload using sshpass if available, otherwise use manual scp
    print(f"{Colors.YELLOW}📤 Uploading to server...{Colors.NC}")
    
    # Check if sshpass is available
    has_sshpass = run_command("which sshpass", hide_output=True)
    
    if has_sshpass:
        upload_cmd = f"sshpass -p '{password}' scp -o StrictHostKeyChecking=no {tarfile_path} {username}@{server}:/tmp/chainviz.tar.gz"
    else:
        print(f"{Colors.YELLOW}Note: sshpass not found, using expect-based upload{Colors.NC}")
        # Create expect script for upload
        expect_script = f"""#!/usr/bin/expect -f
set timeout 300
spawn scp -o StrictHostKeyChecking=no {tarfile_path} {username}@{server}:/tmp/chainviz.tar.gz
expect "password:"
send "{password}\\r"
expect eof
"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.exp', delete=False) as f:
            f.write(expect_script)
            expect_file = f.name
        
        os.chmod(expect_file, 0o755)
        upload_cmd = expect_file
    
    if not run_command(upload_cmd):
        print(f"{Colors.RED}❌ Failed to upload package{Colors.NC}")
        os.unlink(tarfile_path)
        if not has_sshpass and 'expect_file' in locals():
            os.unlink(expect_file)
        return 1
    
    # Cleanup
    os.unlink(tarfile_path)
    if not has_sshpass and 'expect_file' in locals():
        os.unlink(expect_file)
    
    print(f"{Colors.GREEN}✅ Package uploaded{Colors.NC}\n")
    
    # Deploy on remote server
    print(f"{Colors.YELLOW}🔧 Deploying on remote server (this may take 5-10 minutes)...{Colors.NC}\n")
    
    remote_script = """
set -e
echo "📂 Extracting package..."
cd /tmp && tar xzf chainviz.tar.gz
mkdir -p ~/ChainViz
rsync -a --delete --exclude='*.log' --exclude='.env' /tmp/ChainViz/ ~/ChainViz/
cd ~/ChainViz
rm -f /tmp/chainviz.tar.gz

echo "📦 Checking dependencies..."
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | sudo -S sh
    sudo usermod -aG docker $USER
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo apt update -qq
    sudo apt install -y docker-compose
fi

if [ ! -f backend/.env ]; then
    echo "⚙️  Creating backend configuration..."
    cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF
fi

echo "🛑 Stopping existing containers..."
sudo docker-compose down 2>/dev/null || true

echo "🏗️  Building and starting services..."
sudo docker-compose up -d --build

echo "⏳ Waiting for services..."
sleep 15

echo ""
echo "📊 Service Status:"
sudo docker-compose ps

echo ""
echo "✅ Deployment complete!"
"""
    
    # Create expect script for SSH session
    ssh_expect = f"""#!/usr/bin/expect -f
set timeout 600
spawn ssh -o StrictHostKeyChecking=no {username}@{server}
expect "password:"
send "{password}\\r"
expect "$ "
send "{remote_script}\\r"
expect "$ "
send "exit\\r"
expect eof
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.exp', delete=False) as f:
        f.write(ssh_expect)
        ssh_expect_file = f.name
    
    os.chmod(ssh_expect_file, 0o755)
    
    if not run_command(ssh_expect_file):
        print(f"{Colors.RED}❌ Deployment failed{Colors.NC}")
        os.unlink(ssh_expect_file)
        return 1
    
    os.unlink(ssh_expect_file)
    
    # Success
    print(f"\n{Colors.GREEN}╔════════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.GREEN}║     Deployment Successful! 🎉         ║{Colors.NC}")
    print(f"{Colors.GREEN}╚════════════════════════════════════════╝{Colors.NC}\n")
    print(f"{Colors.BLUE}🌐 Access your application:{Colors.NC}")
    print(f"   Frontend:    http://{server}")
    print(f"   Backend API: http://{server}:8000")
    print(f"   API Docs:    http://{server}:8000/docs\n")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())





