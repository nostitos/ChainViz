#!/usr/bin/expect -f
# Automated deployment with password for ChainViz
# Usage: ./deployment/deploy-now.sh

set timeout -1
set server "192.168.2.118"
set username "chainviz"
set password "chainviz"
set deploy_dir "/home/chainviz/ChainViz"

puts "\n\033\[0;34m╔════════════════════════════════════════╗\033\[0m"
puts "\033\[0;34m║   ChainViz Automated Deployment       ║\033\[0m"
puts "\033\[0;34m╚════════════════════════════════════════╝\033\[0m\n"
puts "Server: $server"
puts "User: $username\n"

# Create package
puts "\033\[1;33m📦 Creating deployment package...\033\[0m"
set timestamp [clock seconds]
set tarfile "/tmp/chainviz-deploy-$timestamp.tar.gz"

spawn bash -c "cd /Users/t/Documents/vibbbing/ChainViz && tar czf $tarfile --exclude='node_modules' --exclude='venv' --exclude='.git' --exclude='__pycache__' --exclude='*.log' --exclude='backend/venv' --exclude='frontend/node_modules' ."
expect eof

puts "\033\[0;32m✅ Package created\033\[0m\n"

# Upload package
puts "\033\[1;33m📤 Uploading to server...\033\[0m"
spawn scp -o StrictHostKeyChecking=no $tarfile $username@$server:/tmp/chainviz.tar.gz
expect {
    "password:" {
        send "$password\r"
        expect eof
    }
    eof
}

puts "\033\[0;32m✅ Package uploaded\033\[0m\n"

# Clean up local tarfile
spawn bash -c "rm -f $tarfile"
expect eof

# Extract and deploy on remote server
puts "\033\[1;33m🔧 Deploying on remote server...\033\[0m\n"

spawn ssh -o StrictHostKeyChecking=no $username@$server
expect "password:"
send "$password\r"
expect "$ "

# Extract
send "cd /tmp && tar xzf chainviz.tar.gz\r"
expect "$ "

# Move to home
send "mkdir -p ~/ChainViz\r"
expect "$ "
send "rsync -a --delete --exclude='*.log' --exclude='.env' /tmp/ChainViz/ ~/ChainViz/\r"
expect "$ "
send "cd ~/ChainViz\r"
expect "$ "
send "rm -f /tmp/chainviz.tar.gz\r"
expect "$ "

# Check Docker
send "if ! command -v docker &> /dev/null; then echo 'INSTALL_DOCKER'; fi\r"
expect {
    "INSTALL_DOCKER" {
        send "curl -fsSL https://get.docker.com | sudo -S sh\r"
        expect "password"
        send "$password\r"
        expect "$ "
        send "sudo -S usermod -aG docker $username\r"
        expect "password"
        send "$password\r"
        expect "$ "
    }
    "$ "
}

# Check Docker Compose
send "if ! command -v docker-compose &> /dev/null; then echo 'INSTALL_COMPOSE'; fi\r"
expect {
    "INSTALL_COMPOSE" {
        send "sudo -S apt update -qq\r"
        expect "password"
        send "$password\r"
        expect "$ "
        send "sudo -S apt install -y docker-compose\r"
        expect "password"
        send "$password\r"
        expect "$ "
    }
    "$ "
}

# Create backend .env
send "if \[ ! -f backend/.env \]; then cat > backend/.env << 'EOF'\r"
send "ELECTRUM_HOST=fulcrum.sethforprivacy.com\r"
send "ELECTRUM_PORT=50002\r"
send "ELECTRUM_USE_SSL=true\r"
send "REDIS_HOST=redis\r"
send "REDIS_PORT=6379\r"
send "EOF\r"
send "fi\r"
expect "$ "

# Stop existing containers
send "sudo -S docker-compose down 2>/dev/null || true\r"
expect {
    "password" {
        send "$password\r"
        expect "$ "
    }
    "$ "
}

# Build and start
send "sudo -S docker-compose up -d --build\r"
expect {
    "password" {
        send "$password\r"
    }
}

# Wait for completion
expect "$ " {
    send "sleep 15\r"
    expect "$ "
}

# Check status
send "sudo -S docker-compose ps\r"
expect {
    "password" {
        send "$password\r"
        expect "$ "
    }
    "$ "
}

send "exit\r"
expect eof

puts "\n\033\[0;32m╔════════════════════════════════════════╗\033\[0m"
puts "\033\[0;32m║     Deployment Successful! 🎉         ║\033\[0m"
puts "\033\[0;32m╚════════════════════════════════════════╝\033\[0m\n"
puts "\033\[0;34m🌐 Access your application:\033\[0m"
puts "   Frontend:    http://$server"
puts "   Backend API: http://$server:8000"
puts "   API Docs:    http://$server:8000/docs\n"





